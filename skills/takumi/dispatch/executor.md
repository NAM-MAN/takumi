# /takumi の executor (内部責務)

`/takumi` 本体から参照される補助ドキュメント。計画 (`.takumi/plans/*.md`) を Wave 順に自動実行する executor。

人間が直接叩くコマンドではない。`/takumi` 内の計画提示 → 確認後に自動的に executor が動く。plan name のタイポ問題も `/takumi` が最新計画を知っているため発生しない。

## 5 ロール体制

| ロール | モデル | effort 既定 | 担当 |
|--------|--------|---|------|
| 棟梁 | Opus 4.8 (自分) | xhigh | 実行管理・まとめ・ユーザー報告・**dispatch・gate check (lint / test / spec compliance)・integrate (説明)** |
| 軍師 | GPT-5.x (`codex exec` / `copilot`、env.yaml driven、auto-fallback 5.5→5.4) | (max 相当) | クロスモデルレビュー・設計判断 |
| **職人(Sonnet)** | sonnet (Agent tool) | xhigh | 実装 (default、A-favored or unreliable category) |
| **職人(GPT-5.5)** (NEW) | gpt-5.5 (`codex exec`) | (max 相当) | 実装 (`gpt55_priority` mode + C-favored category: T1/T3/T4/T8/T9) |
| 斥候 | haiku (Agent tool) | medium | 広範・深さ未定の探索 |

### 棟梁 直接 code-gen の例外規則 <!-- RULE: codegen-exception-rule T2:enforcement/reviewers/oracle.md -->
<!-- scope:棟梁 code-gen 許可範囲 / shall:3 cell (python_migration/refactor/realistic_debug_repair) のみ直接 code-gen / not:他 category で棟梁が code-gen する / applicability:always / evidence:false -->

棟梁 (Opus main session) は原則 **dispatch + gate check + 説明** に専念。**code-gen を直接書く例外** は以下 **3 cell** のみ (深い推論が必須):

- python_migration / refactor / realistic_debug_repair

T9 long_context_patch は unified diff 1 行追加のみで出力 contract が明示されるので職人 dispatch に任せる。それ以外の category は全て dispatch (職人(Sonnet) または 職人(GPT-5.5))。dispatch 先は 3-mode capacity-aware routing で決まる (下節 routing 参照)。

### Opus 4.8 delegation policy <!-- RULE: opus-delegation-policy T3:kernel-reanchor -->
<!-- scope:spawn 判断基準 / shall:自己完結可能作業は spawn しない・条件外 spawn 禁止 / not:条件外 subagent spawn / applicability:always / evidence:false -->

Anthropic 公式指針 ([Opus 4.7 BP・4.8 踏襲](https://claude.com/blog/best-practices-for-using-claude-opus-4-7-with-claude-code)) に従い subagent spawn を**抑制**する:

- **棟梁が自分で完結できる作業は spawn しない**: 1 response で `Read` / `Edit` / 小範囲 `grep` が済む範囲は自分で処理 (上記 4 例外 cell の code-gen を含む)
- **職人(Sonnet) を spawn する条件**: 規模「中」以上の実装で C-favored 以外の category、複数ファイル跨ぎ、長時間回る test iteration、Wave ごとの明示的実装タスク
- **職人(GPT-5.5) を spawn する条件**: `mode_select` で `gpt55_priority` 判定 + category ∈ {T1/T3/T4/T8/T9}、または routing-matrix で C primary cell
- **斥候 (haiku) を spawn する条件**: 深さ未定の広範探索、複数 keyword × 複数ディレクトリ、独立ドメイン並列 fan-out (例: security / perf / a11y 同時)
- **軍師 (GPT-5.x) を spawn する条件**: 計画レビュー、設計判断、公開前レビュー、破壊的変更時のクロスモデル確認

ロールは「呼ぶ義務」ではなく「必要なら呼べる道具」。`max` effort は真に難しい問題 (arch 決定 / 複雑な security 判断 / legacy 大改修) のみ使用、overthinking リスクあり。

### 軍師 routing・CLI 呼出・invocation hardening → `gunshi-invocation.md`

軍師 (oracle) の **tier 選択** (copilot / codex / opus-max)、env.yaml preference、**GPT-5.5 upgrade path** (5.5↔5.4 model 軸 + fallback rule + v1→v2 migration)、**軍師 発火基準** (MUST/SHOULD/MAY/SKIP)、各 tier の exact 呼出 syntax、**invocation hardening v2** (portable `tk_timeout` / 必須 pattern / hang→Tier 2 fallback / prompt 圧縮) は **`gunshi-invocation.md`** に集約 (executor.md 350 行上限のため分離)。

職人 code-gen の 3-mode routing は `routing-mode.md`、無人実行の gate 裁定は `autonomy.md`。

## 3-mode capacity-aware routing と職人(GPT-5.5) dispatch <!-- RULE: three-mode-routing T3:kernel-reanchor -->
<!-- scope:職人 dispatch 先選択 / shall:manual_override→mode_select→cell mapping の resolver order を守る / not:routing を ad hoc に変更 / applicability:always / evidence:false -->

**3 mode** (`opus_protect` / `balanced` / `gpt55_priority`) と **職人(GPT-5.5) dispatch** + **lint-repair safety net** + **quota 分配規則** は、行数が多いため `routing-mode.md` に分離。

resolver order は **manual_override 最優先 → mode_select(runtime_state) → cell mapping 引き → runtime_dynamic_check / quota_safe_static / quality_tie / unknown**。

### 1 行サマリ

- **manual_override 最優先** (user 発話で軍師 / 職人 を固定)、次に `mode_select` で 3 mode 判定
- `gpt55_priority` (intended、reliability gate 付き) で T1/T3/T4/T8/T9 を職人(GPT-5.5) primary に切替、他 cell は職人(Sonnet) のまま
- `balanced` (**実効 default**、Claude-only) = **全 cell 職人(Sonnet)** (codex unavailable / degraded / quota 不足 / 4xx 検出時、Claude-only)
- 職人(GPT-5.5) は `codex exec -m gpt-5.5 -s read-only --skip-git-repo-check -C $(pwd) -` で起動 (stdin 経由 prompt、auto-fallback 拒否、4xx 先行判定で degrade path 確保)
- 出力 format は category 別 contract (T9 は unified diff、他は full file)、棟梁 が出力を該当 path に Edit/Write apply
- gate check (lint / test / spec) → fail なら職人(Sonnet) repair (max 3 attempts、最終 attempt fail で escalation)
- codex 60/day quota は 軍師 10 / 職人(GPT-5.5) 30 / safety 20 で分配、職人(GPT-5.5) 30/day 到達で gpt55_priority を当日 disable

## Step 0 — 計画読み込み

1. `.takumi/state.json` を読む
2. **autonomy.level を解決 + loop-invariant を初回ロード**: `.takumi/profiles/env.yaml` の `autonomy:` block を読む (**block 不在なら `autonomous` 既定**)。あわせて `loop-invariant.md` (停止点契約 + orchestrator 痩せ規律、≤30行) を読み、**以後 Wave 境界ごとに「これだけ」を再アンカーする** (Step 6、L2 per-Wave re-injection)
3. 引数あり → `.takumi/plans/{name}.md` を探す
4. アクティブ計画なし → `.takumi/plans/*.md` を一覧、ユーザーに選ばせる
5. `in_progress` / `paused` → 最初の `- [ ]` から再開
6. ノートパッド初期化: `.takumi/notepads/{name}/` (learnings.md, issues.md)
7. state.json 更新: `"status": "in_progress"`

## Step 1 — Wave (DAG トポロジカル層) を実行

**Wave = 依存が解決済の task 群 (トポロジカル層)**。`depends_on` を持つ plan は層内の独立 task (file_scope ∩ resource_scope が素) を**並列実行**、`depends_on` が無い旧 plan は記載順に直列 (完全互換)。DAG 構築・層分割・並列バッチ・層単位 gate・衝突検出の詳細は **`wave-dag.md`**。各 task は以下のループで処理 (並列時は層内の各 task に適用)。

### 1. 準備
- **`loop-invariant.md` を再アンカー** (毎 Wave、≤30行のみ。`executor.md` 全体は再読込しない)
- `.takumi/notepads/{name}/learnings.md` を読む
- 計画からタスクの **ac_ids / verify_profile_ref / design_profile_ref / 何を / ロール / やらない / 検証** を読む
- **orchestrator 痩せ規律 (L3)**: 重い実装/テスト/調査は職人/斥候に dispatch し棟梁文脈には**要約だけ**戻す。権威ある状態は会話でなく plan の `- [ ]` + `learnings.md` (`loop-invariant.md` §2)

### 2. ロール振り分け

**職人 (sonnet)** — 実装タスク:
```
Agent tool:
  subagent_type: "general-purpose" (テスト付きなら "tdd-guide")
  model: "sonnet"
  prompt: TASK / EXPECTED OUTCOME / MUST NOT / CONTEXT / verify_profile 参照
          + brevity 制約 (strict-refactoring/ai-brevity.md §5: correctness > 分離 > safety > brevity、
            B1-B5 回避、信頼境界 validation と concern 境界は削らない、code golf 禁止)
```

**軍師 (GPT-5.x)** — レビュー・設計判断:
以下は **Tier 2 (codex exec)** の例。他 tier の選択は上記「軍師 routing」参照。

<!-- stdin heredoc / `tk_timeout 600` / 5.5 default / prompt 1.5KB 上限 (詳細: 下節「invocation hardening v2」)。 -->
```bash
tk_timeout 600 codex exec -m gpt-5.5 -s read-only --skip-git-repo-check -C "$(pwd)" \
  -o .takumi/notepads/{name}/oracle-task-{N}.md \
  - <<'PROMPT' 2>&1 | tail -100
{タスク内容 + 検証基準 + ノートパッドの文脈、1.5KB 以内、参照ファイルは本文埋込}
PROMPT
```

**斥候 (haiku)** — 調査:
```
Agent tool:
  subagent_type: "Explore"
  model: "haiku"
  prompt: "{調査内容}"
```

### 2.2 二層供給 — fresh executor の入力契約 <!-- RULE: two-layer-supply T1:scripts/rule-compiler.mjs -->
<!-- scope:職人/fresh executor への dispatch 入力 / shall:kernel 4条 + active mode card 1枚 (cards/mode-*.md、≤20行) + task slice + applicability match した mode prose 全文 ≤2本 を渡す / not:思想 file を 3 本以上・match しない prose・rule 本文の親文脈への転記 / applicability:always / evidence:false -->

dispatch prompt の入力は**床と天井の二層**で組む: **card = 床** (機械抽出された違反不能の下限、`enforcement/cards/mode-{name}.md` 1 枚のみ、複数注入禁止)、**prose = 天井** (craft・trade-off の重み付けは生成時にしか効かない — fresh 文脈は希釈が起きない唯一の場所なので、そこでは prose を惜しまない)。prose は task frontmatter に **applicability match した mode file 全文を最大 2 本** (~300-600行)。優先度は kernel/card > prose (矛盾時は card が勝つ)。棟梁自身は prose を読まない (subagent にだけ読ませる = thin-orchestrator と両立)。

### 2.5 plan-contract gate (職人 dispatch の前、薄い計画→誤実装の予防) <!-- RULE: plan-contract-misimpl-oracle T2:enforcement/reviewers/plan-contract.md -->
<!-- scope:dispatch 前の task 契約密度 / shall:state machine 通りに block 判定・delegation は inline scoped / not:T1 単独 block・親会話前提で dispatch / applicability:plan.tasks!=null / evidence:true -->

各 task を職人へ渡す前に契約密度を判定する (設計 `../plan-template.md`「薄い計画 gate」):

| 状況 | 動作 |
|---|---|
| T1 (`node scripts/check-plan-contract.mjs <plan>`) fail のみ | **warn + T2 送致** (block しない) |
| T1 fail AND T2 (`enforcement/reviewers/plan-contract.md`) が `fix`/`escalate` | **block** → `fix`=plan 再記述 / `escalate`=文脈不足 (調査へ) |
| T2 `pass` | dispatch、ただし **T1 欠落 field を telemetry 記録** |
| `risk:critical` / high-blast task | **T1 pass でも T2 必須** (過小分類で抜けるのを防ぐ) |

- **T1 は advisory** (単独 block 禁止、散文 adequate を誤 fail する)。
- **block の適用単位 (後方互換)**: gate が block できるのは **新 7-field テンプレで起草された plan (frontmatter `created ≥ 2026-06-04`) の task、または本 session で新規追加/編集された task** のみ。**既存 active plan・未変更 task は warn-only** (T1/T2 を回しても block せず telemetry 記録だけ)。これで旧 plan の進行を止めない (historical retro-block 禁止を機械述語化)。
- **delegation 規律** (職人は親会話を引き継がない): 職人 prompt には **担当 task + 依存 task の成果 + 関連 AC + 許可 file_scope だけ**を inline verbatim で渡す (plan 全文を渡さない)。「scope 外は読んでよいが**編集不可**」を明示。「上で説明した通り」は届かないので spec は inline。
- **post-hoc miss audit** (claim cap): gate を通した task で誤実装/手戻りが起きたら `T1 flags / T2 verdict / blast / 抜けた契約項目` を telemetry に必ず記録 (誤実装率低下は**未証明**、`telemetry/telemetry-spec.md`)。

### 3. 検証 (Wave gate) <!-- RULE: wave-gate-pipeline T1:templates/ddp-lint.mjs -->
<!-- scope:Wave 完了判定 / shall:A-J 全フェーズを順に通過しなければ task 完了にしない / not:gate をスキップ・省略 / applicability:always / evidence:true -->

wave gate は以下を**全て**通過する必要あり:

| フェーズ | 内容 |
|---------|------|
| A. コード確認 | 変更ファイルを読む、ミューテーション・スコープ逸脱チェック |
| B. build | `pnpm build` / `tsc` |
| C. test pass | `pnpm test --run` |
| **D. mutation gate** | `verify_profile_ref.mutation_floor` を下回らない (task tier の値) |
| **E. L7 hard gate** | `design_profile_ref.layout_invariants.hard` を全て満たす (**human-UI / machine+human surface のみ**。`none`/`API-only` surface は UI 系を skip = mode param) |
| **G. contract gate** | ConsistencyMatrix 機械対 M1-M12 を満たす。surface の 6 軸タグ/tier で適用対を絞る (UI 無し surface は M1-M9 + M12 のみ、UI 系 M10/M11 は skip)。`contract-spine.md` |
| **H. contract_conformance** | `domain_slice.prohibited_creates` の型が新規出現しない (型定義 diff) + 実装型が `contract_ref` と一致 (`domain-data-primitives.md` R4)。crud-simple は advisory |
| **I. boundary_lint** | `domain_slice.boundary` 由来の dependency ルール (`domain` が `infra`/ORM を import = `boundary_violation`)。`domain-data-primitives.md` R3。crud-simple は advisory |
| **J. data-access gate (DDP)** | `data_access` 持つ task に tier-scaled 検査。**全 tier hard**: mutation に楽観/pessimistic(+I6・入力喪失根拠) 宣言 + 楽観なら失敗時 UX (D1)、list-affecting invalidation を覆う (D2)、「狭めるだけ」違反・contract anchor 欠落なし (D6)。**DA-0 hard**: 過剰実装 (昇格トリガー未達で codegen/正規化 store/AST 機構) は剥がす (D7)。**DA-1/2 hard**: read に shape/freshness (D3)、`generated/` 手編集 CI 差分 (D4)、`JSON.stringify` object key (D5)。**advisory (LLM)**: 楽観/tier 選択が I6・複雑度に整合 (D8)。`data-access-protocol.md` |
| F. oracle_review | 軍師 の 400 字以内最終確認 |

> **発火判定**: `task.domain_slice / task.surface_ref / task.data_access のいずれかが定義されていれば G/H/I/J 実行、無ければ skip` (frontmatter のフィールド有無で判定 → `ac_ids` のみの旧 plan は A-F だけで完全互換)。M9/M12 は domain task なら常時、M10/M11 は UI surface のみ。**J** は `data_access` を持つ data/UI task のみ (backend/stateless surface は skip)。**`data_access` 未定義は DA-0 既定として扱い、欠落を schema error にしない** (旧 plan 互換)。この frontmatter 発火条件は **`enforcement/registry.yaml` の `applies_when` と同一**で、kernel §2 (gate-before-advance) が指す「発火 rule 集合」= 本表 A-J + registry の該当 T1/T2 entry。T1 (script/ddp-lint) は exit≠0 で前進不可、T2 (F oracle_review + W3 reviewer) は verdict pass 以外で §6 へ。
> **実行主体**: **H** = 棟梁が変更ファイルの型定義名を抽出し `prohibited_creates` と照合 (AST tool 無時は LLM 静的推論)、実装型が `contract_ref` と一致するかも確認。**I** = Wave 着手時に職人が `domain_slice.boundary` 分類から dependency-cruiser config を `.takumi/notepads/{name}/` に生成し実行。**G** = ConsistencyMatrix 機械対を spec ↔ 実装で突合。**J** = **D1(silent-catch)/D5(stringify key) は `templates/ddp-lint.mjs` で機械検査** (TS compiler AST、zero-extra-dep、`ddp-lint-ignore` directive で理由付き例外、`cd <project> && node .../ddp-lint.mjs src`)。残る D2(list-invalidation)/D6(狭めるだけ)/D7(過剰実装) は棟梁が静的確認、D8 は LLM advisory。`ddp-lint` exit 1 = gate J fail。

**不合格 → リトライ最大 3 回 → 軍師裁定 (G3、`autonomy.md` §3) → critical なら human、非 critical は issues.md に fail-closed 記録してスキップ**。並列実行時は gate を**層単位**で 1 回回す (fail 時の犯人特定は `wave-dag.md` §4 の二分探索)。

### 4. 記録 + Wave handoff artifact <!-- RULE: wave-handoff-artifact T1:scripts/check-plan-contract.mjs -->
<!-- scope:Wave 完了時の引き継ぎ記録 / shall:notepads/{name}/handoff-w{N}.md に ≤30行 (決定/発見/逸脱/未消化リスク の 4 見出し) で書き、次 Wave の dispatch prompt に本文添付 / not:handoff 無しで次 Wave dispatch・30行超過・会話記憶だけで引き継ぐ / applicability:always / evidence:false -->

- `.takumi/notepads/{name}/learnings.md` に追記、`.takumi/telemetry/profile-usage.jsonl` に `gate_passed` / `gate_failed` event emit
- **handoff artifact**: `.takumi/notepads/{name}/handoff-w{N}.md` (≤30行、見出し固定: `決定` / `発見` / `逸脱` / `未消化リスク`)。fresh 化は健忘を導入する — Wave N の「この API は罠」が N+1 に伝わる経路を親の希釈済み記憶にしない。次 Wave の dispatch prompt に**本文を添付** (要約し直さない)

### 5. 完了マーク
計画ファイルの `- [ ]` → `- [x]`

### 6. 自動継続 (停止点契約) <!-- RULE: auto-continue-stop-contract T3:kernel-reanchor -->
<!-- scope:Wave 完了後の継続/停止判断 / shall:3 停止点 (G1/G3・human floor/G6) 以外で止まらず次 Wave へ無人継続 / not:「続けますか?」質問 / applicability:autonomy.level!=manual / evidence:true -->

> [!IMPORTANT]
> **各 Wave 境界で、次アクション判断の直前に `loop-invariant.md` (≤30行) だけを再読込して再アンカーする** (`executor.md` 全体は再読込しない = L2 per-Wave re-injection、希釈対策)。その不変条件に従い、Wave/task 完了で **「続けますか?」と聞いてはならない**。`autonomy.level` (既定 `autonomous`、Step 0 で解決済) に従い、進捗 1 行報告で同一ターン内に次 Wave へ無人継続する。

手を止めてよいのは **G1 計画承認 / G3・human floor (不可逆) / G6 context pause の 3 点のみ** (詳細は `loop-invariant.md` と `autonomy.md`)。各 Wave 末は「Wave N/M 完了 → 次へ」の非ブロッキング 1 行報告に留める (報告 ≠ 質問)。計画承認 (G1) / escalation (G3) の軍師裁定 protocol は **`autonomy.md`**。`project.yaml.requirements.source == toishi` の project では **Wave 1 着手前に G1.5 (外部 scope 承認 check)** も発動 (`autonomy.md` G1.5 行 + `toishi-integration.md`、他 source は no-op)。

### 7. per-Wave 巡視 hook (behavioral surface、pilot-gated) <!-- RULE: per-wave-junshi-gate T2:enforcement/reviewers/oracle.md -->
<!-- scope:巡視 (junshi) 発火条件 / shall:harness+containment+spec 揃い+behavioral surface 時のみ起動 / not:欠落時に junshi を発火・修正を ungated 適用 / applicability:surface.behavioral==true / evidence:false -->

Wave gate (A-J) 通過後、その Wave が**触れた surface** が behavioral (`UI有無 ∈ {human-UI, machine+human}` or `状態複雑度 ∈ {workflow, realtime}`) かつ **harness + 安全 containment + `.takumi/specs/{surface}.md`** が揃う場合のみ、巡視を 1 本 Foreman で起動する (`../../junshi/runtime.md`、常駐ループ B-1)。実アプリ走行で「描画/導線/視覚/操作後状態」の発見を炙る:

- **触れた surface のみ** (差分スコープ、全 surface を毎 Wave 見ない = コスト規律)
- 発見は `discovered-{id}.md` へ (self-multiplying に合流、`oracle_type` 付き)。**書込は `.takumi/` 限定 = ungated** (`autonomy.md`)。修正は次 Wave で通常 gate + human floor を経由
- harness / containment / spec のいずれか欠落で **skip** (静かに、`ac_ids` のみの旧 plan 完全互換 = 静的自己増殖は従来通り)
- **発火制御は 2 knob** (`.takumi/profiles/env.yaml`): hook は `junshi.discovery: auto` (**harness 揃えば既定**) で発火し discovered-{id}.md に記録 (advisory・自己増殖・ungated)。**重い②走行は毎 Wave でなく定期点検 cadence (≈3 Wave) + 高リスク surface に限定**、軽い spec 照合は毎 Wave。発見を gate ブロック/自動修正するのは `junshi.enforcement` (既定 `off`、pilot GO 後のみ `gate`/`autofix`、`../../junshi/modes.md`)

## Step 1.5 — Probe 連携 (Probe 計画実行中のみ)

Probe 計画 (`.takumi/plans/probe-*.md`) を実行中のみ有効。通常 plan では省略。

### 自動点検 (毎 Wave 完了後、2-3 分)

1. **発見の統合**:
   - `.takumi/drafts/discovered-*.md` を読み、ICE (Impact×Confidence×Ease, 各 1-5) 採点
   - ICE >= 40 → 未実行 Wave 末尾に新タスク追加
   - ICE < 40 → `.takumi/sprints/{日付}/deferred.md`
   - 処理済み → `.takumi/drafts/archive/`

2. **メトリクス記録**:
   ```bash
   pnpm test:run 2>&1 | tail -5
   pnpm typecheck 2>&1 | tail -3
   ```
   `.takumi/sprints/{日付}/metrics.md` に追記

3. **learnings.md に点検結果を記録**

### 定期点検 (3 Wave ごと、5-10 分)

1. 変更ファイル特定: `git diff --name-only HEAD~{3Wave 分}`
2. 関連発見者の**再実行** (haiku 並列、変更ファイルに限定)
3. 発見者精度更新: `.takumi/sprint-config.md` に採用率記録
4. 新規発見を ICE 採点 → 計画追加
5. 進捗レポート → learnings.md + ユーザー簡潔報告

## Step 2 — 最終検証 <!-- RULE: final-verification-step T1:scripts/spec-graph.mjs -->
<!-- scope:全 Wave 完了後の最終 gate / shall:F0 orphan-zero + AC-coverage + F1-F4 を全て通過 / not:最終検証スキップ / applicability:task.surface_ref!=null / evidence:true -->

契約スパインを使う plan (surface/TopContract あり) では F1-F4 に加え **F0. 契約整合の最終 check** を実行:
- **orphan ゼロ** (双方向、`contract-spine.md` M9): orphan AC (源なし `derived_from` 空) と orphan TopContract 要素 (どの AC からも未参照 = 未実装要件) の両方がゼロ。残れば issues.md に記録し critical は human。
- **AC-coverage gate**: `commitment=executable` の AC で `covered_by` が空なら F0 fail (critical は human、非 critical は issues.md fail-closed)。`commitment` は `ac_class≠metamorphic ∧ derived_from が H 対(H1-H6)でない ∧ oracle≠human-gated` から導出 (新 field 不要、`ac_ids` のみ旧 plan は無影響)。`covered_by` 有/全 AC 比は従来通り emit。
  > **責務限界**: 本 gate は「covered_by 空」検出のみで、空チェックは決定的 (false-positive ゼロ)。`covered_by` に値はあるが assertion が浅い test は **gate D (mutation) が守る** (本 gate の責務外)。「AC が test である」保証は本 gate ∧ D の合成。
  > **※ 言語依存の片肺**: `gate D` は **advisory-tier 言語 (Python/Go、`verify/mutation.md`) では hard gate でない** ため、この合成は advisory-tier で**片肺**になる (covered_by 空は捕えるが「浅い充填」は mutation で塞げない)。advisory-tier では浅い test の検出を **§C (AC品質 advisory) + L1 PBT + L6 AI-review** に委譲する。

F1-F4 を実行。F4 (コードレビュー) は 軍師 委譲:

<!-- hardening v2: stdin heredoc / `tk_timeout 600` / 5.5 default。長文 diff の場合は section 抽出または subagent (Sonnet) Tier 2 fallback (詳細: 下節「invocation hardening v2」)。 -->
```bash
tk_timeout 600 codex exec -m gpt-5.5 -s read-only --skip-git-repo-check -C "$(pwd)" \
  -o .takumi/notepads/{name}/final-review.md \
  - <<'PROMPT' 2>&1 | tail -100
git diff main...HEAD の全変更を敵対的にレビュー:
品質 / immutability / error handling / scope compliance / 境界条件 / 競合状態 / セキュリティ。
出力 1.5KB 以内、診断と修正案のみ。
PROMPT
```

失敗 → 修正 + 再検証 (最大 2 ラウンド)。

## Step 3 — 完了

1. state.json: `"status": "completed"` (終端状態表は Step 4)
2. 日本語まとめ: 完了タスク数、スキップ、学び、`git diff --stat`
3. `/takumi` が「計画 X が完了しました」とユーザーに報告

## Step 4 — 監視付き自動完走 (supervised completion、self-paced loop) <!-- RULE: supervised-completion-loop T1:scripts/check-loop-terminal.mjs -->
<!-- scope:self-paced loop の起動・継続・終端 / shall:self-paced のみ使用・state.json 終端状態で ScheduleWakeup 判断 / not:固定間隔 /loop (gate 踏み潰し危険) / applicability:loop==true / evidence:false -->

`/loop /takumi 続きを実行して` で起動された時、executor は計画を最後まで無人で駆動し、収束で勝手に止まる。**間隔省略 = self-paced 必須**。固定間隔 (`/loop 5m`) は human floor 承認待ちのターン合間に発火して**ゲートを踏み潰す**危険があり使わない (開発元未定義挙動)。

安全の核は **executor が終端状態を state.json に記録し、状態に応じて自分で再起床を止める**こと (ループが賢いのではなく、止まるべき時に ScheduleWakeup を呼ばない)。

### 終端状態 (state.json.status、各 tick 末に必ず記録)

| status | 意味 | self-paced ループの動作 |
|---|---|---|
| `in_progress` | 残 `- [ ]` あり・安全に継続可 | **ScheduleWakeup で次 tick** (継続) |
| `completed` | 残 `- [ ]` ゼロ = 収束 | **再スケジュールしない** (ループ終了、Step 3 報告) |
| `paused_human` | human floor (不可逆/critical) or 軍師 escalate で停止。`stop_reason` 併記 | **再スケジュールしない**。停止理由をユーザーに surface (踏み潰さない) |
| `paused_context` | G6 20% pause | resume.md 記録、次 tick で fresh continue が再開 (`autonomy.md` G6) |
| `paused_stalled` | 暴走防止条件 (無進捗/同一gate反復/budget/検証陳腐化) | **再スケジュールしない**。理由をドシエ surface |

### 停止述語 (機械判定、tick 末にこの順で評価) <!-- RULE: loop-stop-predicate T1:state.json-machine-predicate -->
<!-- scope:self-paced loop の継続/停止 / shall:state.json+plan の機械的事実で決める / not:希釈散文判断で継続 / applicability:loop==true / evidence:autonomy-decision.jsonl -->

`mustStop(tick)` を **state.json + plan の機械的事実**で決める (希釈された散文判断でなく):

1. 残 `- [ ]` ゼロ → `completed` → **omit ScheduleWakeup**
2. human floor 発火 (`autonomy.md` §2) → `paused_human` + `stop_reason` → **omit** + ドシエ surface
3. **暴走防止** → `paused_stalled` + `stop_reason` → **omit** + ドシエ surface。いずれか該当時:
   - `last_progress_at` が N tick 更新なし (無進捗、既定 2 tick)
   - `failed_same_gate_count ≥ skip_escalation_threshold` (同一 gate 反復、既定 3)
   - `budget_remaining` 枯渇 (コスト上限)
   - `verification_stale` (最後の gate pass 後に仕様/コードが変わり再検証未了)
4. 軍師 + opus-max 共に不能 (`autonomy.md` §4) → `paused_context` → human
5. 上記なし (残あり・進捗あり・安全) → `in_progress` → **ScheduleWakeup** で次 tick

executor は `last_progress_at` / `failed_same_gate_count` / `verification_stale` を state.json に毎 tick 更新する。
**毎 tick、判定結果を `autonomy-decision.jsonl` に 1 行記録必須** (`{gate:"loop", verdict:"continue|stop", reason}`)。
*書く行為が述語評価を強制*し「なんとなく継続/質問」を物理的に不可能にする (write-forces-evaluation、希釈の根治)。

### 冪等性 (ScheduleWakeup 重複発火 issue #54086 への防御)

各 tick は **必ず最初の `- [ ]` から再開** (完了済 `- [x]` は再実行しない)。plan の checkbox + state.json が唯一の真なので、重複発火しても同じ tick が二重に走らない。

## コンテキスト保護 <!-- RULE: context-protection-pause T3:kernel-reanchor -->
<!-- scope:Agent 文脈残量管理 / shall:残量 20% 以下で一時停止・resume.md 生成・ユーザー通知 / not:20% 突破して継続 / applicability:always / evidence:true -->

Agent 内コンテキスト残量 20% を切ったら:

1. 実行を一時停止
2. 再開ファイル生成 (`.takumi/sprints/{日付}/resume.md`):
   ```markdown
   # 再開情報: {日付} {時刻}
   ## 中断地点
   - 計画: {計画ファイルパス}
   - 完了 Wave: {N} (タスク {N} 件完了)
   - 残 Wave: {N} (タスク {N} 件)
   ## 直近の学び (learnings.md 最新 5 件)
   ## 再開: /takumi continue
   ```
3. ユーザー通知: 「Wave {N} まで完了。/takumi continue で再開できます」

### 親の checkpoint-respawn (統合判断の希釈対策) <!-- RULE: parent-checkpoint-respawn T3:kernel-reanchor -->
<!-- scope:長走行 session の親 (棟梁) 文脈 / shall:5 Wave ごとに plan + state.json + 直近 handoff + active card から状況を再構成し「現在地 5 行要約」を書き直す (context 20% 到達なら G6 で respawn) / not:10 Wave 超を要約更新なしで走る・実行を剥がした親の判断を古い会話記憶に依拠させる / applicability:autonomy.level != manual / evidence:false -->

実行を subagent に剥がした後の親は「判断だけが残った長寿命文脈」= 希釈被害が最も重い判断業務を担う。**5 Wave ごと**に会話記憶でなく外部権威 (plan の `- [ ]` + state.json + 直近 handoff + active card) から現在地を再構成し、learnings.md 冒頭の「現在地 5 行」を書き直す (checkpoint)。context 残 20% なら G6 で resume.md を作り respawn する — 親は再founding 可能な状態を常に保つ。

## 関連リソース

| file | 用途 |
|---|---|
| `SKILL.md` (同ディレクトリ) | /takumi 本体 |
| `loop-invariant.md` (同ディレクトリ) | 毎 Wave 再アンカーする停止点契約 + orchestrator 痩せ規律 (L2/L3) |
| `gunshi-invocation.md` (同ディレクトリ) | 軍師 tier routing・CLI 呼出・invocation hardening |
| `autonomy.md` (同ディレクトリ) | 無人実行の gate 分類・軍師裁定・human floor (G1/G3) |
| `wave-dag.md` (同ディレクトリ) | Wave の DAG 並列実行・層単位 gate |
| `test-strategy.md` (同ディレクトリ) | verify_profile 選定ロジック |
| `integrations.md` (同ディレクトリ) | 新規 skill 連携ガイド |
| `telemetry-spec.md` (同ディレクトリ) | event emit の spec |
| `verify/README.md` (同階層配下) | verify run / recipe library |
| `design/README.md` (同階層配下) | L7 hard gate の定義 (ui 時) |
| `data-access-protocol.md` (同階層) | gate J (DDP) の検査対象定義 (tier 制・楽観既定・cache) |
