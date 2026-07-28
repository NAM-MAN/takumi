---
name: takumi
description: "takumi の単一入口。計画・観点診断・全域棚卸し・設計・検証・リファクタを自然文で振り分ける。/takumi <自然文> で起動。サブコマンド構文は採用しない。"
license: MIT
---

# takumi: 単一入口スキル

ユーザーからの自然文を意図分類し、適切な内部モード (normal / probe / sweep / status / continue / override) に振り分ける唯一の skill。

計画は `.takumi/plans/{name}.md` に保存、確認後は executor (`executor.md` の内部責務) が Wave 順に自動実行する。executor は takumi の内部ロールであり、人間が直接叩く別コマンドは存在しない。

---

## ⚠ 不変条件 kernel — 実行中ずっと効く絶対規則 (canonical=`dispatch/loop-invariant.md`、executor が毎 Wave 再アンカー)
1. **停止点は 3 つだけ**: Wave/task 完了で「続けますか?」と聞くな。`autonomy.level` (既定 autonomous) で 1 行報告し無人継続。止まるのは G1 計画承認 / G3·human floor (不可逆 or 軍師 escalate) / G6 context 20% pause のみ。
2. **gate を満たすまで進むな**: Wave 前進前に発火 gate を機械実行、T1 script exit≠0 / T2 reviewer verdict が pass 以外なら前進不可 → §4 へ。gate は進行条件で停止点でない。
3. **orchestrator を痩せさせる**: 重い実装/テスト/調査/reviewer は subagent に隔離し要約/verdict だけ戻す (rule 本文を親文脈に溜めない = 希釈に勝つ核)。権威ある状態は plan の `- [ ]` + notepad。
4. **停止は決裁ドシエを伴う**: 止める時は (検証済+推奨+confidence+選択肢) か (blocked_reason+必要なもの) を添える。裸の yes/no = 責任逃れ = 禁止。

---

## 進入路 (AI 向け、最小読み込み指針)

> [!IMPORTANT]
> **全ファイルを読まない**。context 劣化を避けるため、task 種別から下表の「必ず読む」3-5 本だけを読み、「触れない」は開かない。

| task 種別 | 必ず読む | 触れない |
|---|---|---|
| 新機能実装 (UI なし) | SKILL.md + `plan-template.md` + `dispatch/executor.md` (dispatch 時 `dispatch/routing-mode.md` も。read/cache/mutation を含むなら `contract/data-access-protocol.md`) | verify/, probe/, sweep/, design/ |
| 新機能実装 (UI あり) | SKILL.md + `plan-template.md` + `design/README.md` + `design/phases.md` (UI 崩れ予防は `design/layout-primitives.md`、プロ品質 craft は `design/craft-layer.md`、日本語組版は `design/jp-typography.md`、サーバー状態/楽観 UI/cache は `contract/data-access-protocol.md`) | verify/, probe/, sweep/ |
| **契約スパイン起草 (Step 0、surface 分解 + TopContract)** | SKILL.md + `contract/contract-spine.md` + `contract/surface-archetypes.md` (業務ロジック/DB/分離 discipline は `contract/domain-data-primitives.md`、楽観既定/cache/データアクセス配線は `contract/data-access-protocol.md`) | probe/, sweep/ |
| テスト追加 | SKILL.md + `verify/README.md` + `verify/spec-tests.md` + (型で先に消すなら `verify/type-discipline.md` (L0)、技法に応じて 1 本: `property-based.md` / `component-test.md` / `model-based.md`) | probe/, sweep/, design/ |
| **テスト圧縮 (MSS)** | SKILL.md + `verify/spec-tests.md` + `verify/compression.md` (B-stack 詳細は `verify/compression-vitals.md`、層 obligation は `verify/cost-balance.md`、文言の二重管理は `verify/double-management.md`) | probe/, sweep/, design/ |
| verify-loop 運用 | `verify-loop/runtime.md` + `verify/loop.md` + `verify/mutation.md` | probe/, sweep/, design/, その他 verify/ |
| 観点診断 (probe mode) | SKILL.md + `probe/README.md` + `probe/runtime.md` + `probe/discover.md` + `probe/triage.md` (委譲時のみ `probe/delegation.md`) | verify/, sweep/ |
| 全域棚卸 (sweep mode) | SKILL.md + `sweep/README.md` + `sweep/runtime.md` | probe/, verify/, design/ |
| **巡視 (挙動/視覚の発見、採取/常駐ループ)** | SKILL.md + `junshi/README.md` + `junshi/runtime.md` + `junshi/oracles.md` (モード分岐は `junshi/modes.md`、昇格は `junshi/graduation.md`、pilot 閾値は `junshi/pilot.md`) | normal mode 系、strict-refactoring/ |
| リファクタ / 設計見直し | SKILL.md + `strict-refactoring/README.md` + `strict-refactoring/rules-core.md` (+ 該当 rules-*.md 1 本。carrier 一貫性の機械検査は `strict-refactoring/carrier-consistency.md`、形状 report は `strict-refactoring/code-vitals.md`) | probe/, sweep/, design/, verify/ |
| design mode (Step 0d) | SKILL.md + `design/README.md` + `design/runtime.md` + `design/phases.md` (+ 該当 phases-*.md、UI 崩れ予防は `design/layout-primitives.md`、プロ品質 craft は `design/craft-layer.md` + `design/craft-tokens.md`、日本語組版は `design/jp-typography.md`、craft 効果測定/visual loop 検討時のみ `design/taste-oracle.md`) | probe/, sweep/, verify/ |
| **dispatch / 実行 (executor runtime)** | SKILL.md + `dispatch/executor.md` + `dispatch/loop-invariant.md` (毎 Wave 再アンカーする停止点契約、L2) + `dispatch/routing-mode.md` (軍師呼出時 `dispatch/gunshi-invocation.md`、並列実行時 `dispatch/wave-dag.md`、無人実行/gate 裁定時 `dispatch/autonomy.md`、聞く/察す/止まるの較正は `qbc.md`) | それ以外は不要 |
| **Sprint / Continuous mode (3-phase Cycle)** | SKILL.md + `sprint/sprint-mode.md` + `sprint/3lane-discovery.md` (発見多発時) + `sprint/self-multiplying.md` (単一 backlog 対比) + `sprint/wave-formula.md` (Full Spec plan 起草時) | normal mode 系、verify/, probe/, design/ |
| **backlog 起票/管理** | SKILL.md (Step 0e) + `backlog-mode.md` | probe/, sweep/, design/, verify/ |
| **外部要件 source 連携 (まれ、opt-in)** | SKILL.md + `toishi-integration.md` (+ `dispatch/autonomy.md` G1.5 行) | probe/, sweep/, design/, verify/ |
| 状態確認 / 再開 / override | SKILL.md + `natural-language.md` + `.takumi/state.json` | それ以外は不要 |

**ファイルサイズ方針** (3 予算): per-file md ≤349 行 (350 超は分割) / 常時ロード core (`SKILL.md`) **≤320 行暫定上限・≤280 目標** / per-task footprint ≤1,200 行/task。詳細・現状超過は `.takumi/drafts/per-task-footprint.md`。実行時は「**テスト追加なら verify 系だけ、リファクタなら strict-refactoring だけ**」と選択的に読み 1 task の context を最小化する。

---

## 意図分類ルータ (最優先判定)

入力を以下の 6 モードに分類する。判定は「観点語 + 診断動詞」の組合せを基本条件とする。

| mode | 典型入力 | 内部委譲先 |
|---|---|---|
| **normal** | 「X 作って」「X 追加」「X 修正」(feature 実装) | 通常の plan フロー (Step 0-4) |
| **probe** | 「security 見て」「perf 心配」「a11y 調べて」(観点指定診断) | `probe/README.md` 参照、発見→選別→計画 |
| **sweep** | 「全般的に棚卸し」「リリース前総点検」「全次元見て」 | `sweep/README.md` 参照、8 次元並列発見 |
| **status** | 「今なに動いてる?」「状態見せて」 | `.takumi/state.json` を読んで 30 秒で提示 |
| **continue** | 「続きから」「再開」 | `state.json.mode` と `active_run_id` から復元 |
| **override** | 「止めて」「sweep 24h 停止」「hard gate を warning に」 | `.takumi/control/` の override ファイル更新 |

### 判定ルール

1. **観点語**(security / perf / a11y / ux / architecture / quality / concurrency 等)が単独 → 曖昧、normal 候補(例: 「security feature 追加」)
2. **観点語 + 診断動詞**(〜見て / 〜調べて / 〜心配 / 〜が怪しい)→ **probe に倒す**
3. **全般語**(全般 / 全体 / 総点検 / 棚卸し / リリース前)→ **sweep に倒す**
4. feature 実装語(追加 / 作って / 実装 / 修正)が主語 → **normal**
5. 曖昧なら 1 問だけ確認(「security feature を追加ですか、security 診断ですか?」)
6. **採取語彙**(イシューだけ / 直さなくていいから洗い出して / 起票だけ)→ probe/sweep を **stance:harvest** で起動し、発見→triage→起票で **STOP** (実装しない)。**「巡視して」「実際に触って〜見つけて」**→ 巡視を実アプリ走行で起動 (behavioral surface、`junshi/runtime.md`)。`/loop 30m /takumi 巡視` は**常駐ループ**。巡視は 6 mode を増やさず probe/sweep/normal 内の発見レンズ (L6) + per-Wave hook として働く。詳細 `junshi/modes.md`

語彙表と例文は `natural-language.md`。本 SKILL.md は決定木を保持、辞書は別ファイルで保守。巡視 (junshi) は挙動/視覚の発見エンジン (実走行 + TopContract オラクル、pilot-gated) で、`junshi/README.md` が入口。

### probe mode の artifact contract (絶対保全)

probe フロー起動時、以下の成果物が揃わない限り backlog-mode へ進まない:

- `.takumi/sprints/{date}/profile.md` — 製品診断
- `.takumi/sprints/{date}/discoveries.md` — 発見結果 (MECE schema)
- `.takumi/sprints/{date}/backlog.md` — triage 済 (ICE + 反論者チェック)
- `.takumi/sprints/{date}/resume.md` — 中断時の再開情報
- `.takumi/sprints/{date}/retro-summary.md` — 完了レポート
- `.takumi/discovery-calibration.jsonl` — 発見者精度 ledger (append-only、継続学習)

### 発見者並列起動 (probe mode)

discovery orchestrator の fan-out/fan-in、3 同期 barrier、発見者定義の所在は `probe/runtime.md`「発見者並列起動」に集約。

---

# 通常 plan フロー (normal mode)

ユーザーとの対話(または渡された要件)から高品質な Wave 計画を生成する。
インタビューが必要なら行い、要らなければ即生成。計画は `.takumi/plans/{name}.md` に保存、
確認後は executor (`executor.md` の内部責務) が Wave 順に自動実行する。

## 5ロール体制

| ロール | モデル | 担当 |
|--------|--------|------|
| 棟梁 | Opus 4.8 (自分、main session) | 日本語インタビュー・計画作成・**ディスパッチ・gate check (lint / test / spec compliance)・integrate (説明)**。`claude --model opus` 起動推奨。Fable は opt-in |
| 軍師 | GPT-5.x via `codex` / `copilot` / opus-max fallback (env.yaml driven、auto-fallback 5.5→5.4、`gunshi-invocation.md` の 3-tier routing + 「GPT-5.5 upgrade path」参照) | 深い思考: 設計分析・計画レビュー・判断 |
| **職人(Sonnet)** (default) | Sonnet via Agent tool | 実装: `balanced` mode で全 cell (Claude-only、4-role 互換)。棟梁直例外 T5/T6/T10 のみ棟梁が直接 |
| 職人(opt-in / dormant) | Fable (`claude -p`) / GPT-5.5 (`codex exec`) | Fable は manual_override 時のみ (preview、再昇格条件は `routing-mode.md`) / GPT-5.5 は `gpt55_priority` (現 dormant) |
| 斥候 | haiku (Agent tool) | 調査: コード検索・Web検索・ドキュメント |

### 棟梁 直接 code-gen の例外規則

**`balanced` mode (default) では旧規則が生き、棟梁直 code-gen は python_migration / refactor / realistic_debug_repair の 3 cell のみ**、他は職人(Sonnet)。opt-in の `fable` mode では職人(Fable) が全 cell を担い棟梁直例外は非適用。詳細・根拠は `dispatch/executor.md`「棟梁 直接 code-gen の例外規則」。

### capacity-aware routing (4 mode)

resolver は `manual_override` 最優先 → `mode_select(runtime_state)` → cell mapping (mode overlay) → 残 step。mode の動作:

| mode | 起動条件 | 動作 |
|---|---|---|
| `opus_protect` | opus_weekly < 5h | 全 cell 職人(Sonnet) (quota floor、最優先) |
| `balanced` (**default**) | 他 mode の起動条件が全て不発 (= 既定) | 全 cell 職人(Sonnet)、4-role 互換 |
| `gpt55_priority` (dormant) | codex installed AND reliability OK AND quota OK AND opus_weekly ≥ 5h | T1/T3/T4/T8/T9 を職人(GPT-5.5)、他は Sonnet |
| `fable` (**opt-in only**) | mode_select では非選択。`manual_override`「職人を Fable に」時のみ | 全 cell 職人(Fable)、棟梁も Fable。dispatch 失敗で cell ごと Sonnet degrade |

**default は `balanced`**。`opus_protect` (quota floor) は最優先で残る。fable は opt-in で、manual_override で取得可 (再昇格は env.yaml `routing.fable_repromotion_gate` 充足時)。職人 出力 → 棟梁 gate → fail で repair (max 3)。**詳細 (mode_select / dispatch / lint-repair / 再昇格 gate) は `routing-mode.md`**、resolver order は `executor.md`、軍師起動は `gunshi-invocation.md`。

ローカル作業領域は全て `.takumi/` 配下 (`plans/` 計画、`drafts/` メモ + `discovered-{id}.md`、`state.json`、`sprints/{date}/` probe 成果物、`telemetry/*.jsonl`)。

---

## Step 0 — プロジェクトモード判定と profiles 準備

計画生成の前に以下を確認する。詳細は `integrations.md`。

### 0a. surface 分解 + project_mode 導出

製品を **surface (機能面) 単位**に分解し、各 surface に 6 軸タグを付ける (`surface-archetypes.md`。製品単位 archetype は混成を説明できない粗い箱)。`project_mode` (ui / mixed / backend) は **surface 構成比からの導出要約**に格下げ (明示値が `CLAUDE.md`/`.takumi/project.yaml` にあれば優先、単一 surface 製品は従来と等価 = 後方互換)。

- surface の `UI有無 ∈ {human-UI, machine+human}` → design mode + `design_profile_ref` (ui/mixed 相当)、`{none, API-only}` のみなら UI 枝 skip (backend 相当)
- どの導出枝 / consistency 対 / gate / 哲学を有効化するかは `surface-archetypes.md` の spine profile マッピングで決定

外部要件 source (例: toishi の MCP server) を使う場合は `toishi-integration.md` 参照 (auto-detect、未検出時は完全 silent、利用者は数%想定)。

### 0a-2. project 言語 × L4 Mutation tier 判定

`package.json` / `Cargo.toml` / `go.mod` / `pyproject.toml` / `*.csproj` / `pom.xml` / `build.sbt` から project 言語を検出し L4 Mutation tier を決定。tier 表 (JS/TS/Java/Kotlin/C#/Rust/Scala = **primary** / Python/Go = **advisory** / その他 = **skip**)、判定根拠 (mutation operator 覆盖範囲ベース、ツール star 数や成熟度ではない)、各言語のツール詳細 (Stryker-JS / PIT / Stryker.NET / cargo-mutants / Stryker4s / mutmut / gremlins) は **`verify/mutation.md`「言語別 tier 表」** 参照。

profile `.takumi/profiles/verify/{name}.yaml` に `mutation_tool` / `l4_role: primary | advisory | skip` を記録。advisory 言語では `mutation_floor` を gate から外す。

### 0b. profiles 整備と .gitignore bootstrap (初回のみ)

`.takumi/profiles/{verify,design}/` が無ければ defaults を bootstrap、同時に `.gitignore` に `.takumi/` と verify-loop の ephemeral artifact を登録する。手順の詳細 (bash snippet / .gitignore 追加行 / 言語別 artifact) は `step0-bootstrap.md` を参照。project 固有 profile は `.takumi/profiles/` に yaml を追加するだけ (registry 方式)。

### 0b-2. 環境構築ハーネス導出 (env tier × state tier、初回のみ)

0a-2 言語検出・surface `trust` 軸・契約スパイン I6 から **env tier** (既定 L1 mise → 再現性要 L2 devenv → 隔離要 L3 container) と **state tier** (既定 S0 PGlite → 本物 PG 要 S1 devenv `services.postgres` native → S2 container) を導出 (mutation tier 導出の隣に足す導出)。**container-zero 既定**: 常駐 DB を in-process/native で潰し、コンテナは「native/embedded 不在」or「prod runtime 同一性必須」時のみ。`EnvGate` が既存 config を尊重・上書きせず **L1+S0 のみ自動生成** (L2/L3/S1/S2 は 1 回提案 → 承認後)。判断テーブル・bootstrap bash・editor (IntelliJ/VSCode/Zed) 統一・PGlite recipe は **`step0-env.md`** + `env-harness-defaults/` (registry)、`project.yaml.env` 記録は `step0-bootstrap.md`。

### 0c. surface ごと TopContract 確立 → AC 派生 (Step 3 内で統合)

各 surface について **頂点契約 (TopContract = ドメイン不変条件 I1-I6 + ユーザータスク契約 T1-T4)** を先に確立し、そこから UI/API/ロジック AC を**並列導出**する (`contract-spine.md`)。UI を頂点にしない (ドメインの沈黙が仕様漏れになる)。

- AC は `AC-{surface}-{seq}` の原子単位。**Step 3 で AI が抽出・命名・分類**、人間は一覧確認のみ。各 AC は `derived_from` (TopContract の I/T 項由来) を持ち DerivationMap に記録 (orphan 双方向検出の源、M9)
- 自動付与: `ac_class` (`test-strategy.md` キーワード推論) / `risk` (失敗影響タグ data-loss/security or 「決済/権限/並行編集/データ消失/監査/rollback」語彙で critical) / `depends_on` (既存 `.takumi/specs/*.md` scan)
- data/UI surface は I6 から **DDP 既定 (DA tier・楽観/cache・store-scope) を導出** (`surface-archetypes.md` (f) / `data-access-protocol.md`)。既定 DA-0・楽観 ON、pessimistic は I6+入力喪失軸でのみ

TopContract / AC は `.takumi/specs/{surface}.md` に frontmatter 付きで書く (`contract-spine.md` の schema)。AC-ID は全フェーズの共通通貨 (drift 防止の根幹)。

### 0d. design mode (human-UI / machine+human surface のみ)

UI を含む surface は、**plan 本体より先に** design mode で IA / style-guide / interactions / wireframe を生成 (`design/README.md` に委譲)。必須入力 4 項目 (`product_type` / `target_user` / `brand_tone` / `ref_archetypes 1-2`) を対話で確定。出力は `.takumi/design/` 配下。plan は後段で各 UI task に `design_profile_ref` を埋める。

**順序と階層の分離**: UI 可視化は先 (探索順序) で可、ただし**承認は TopContract 差分確認後**・**ドメインが上位**。UI 派生は AC の入力源の一つで、**未反映の UI 差分は Wave gate で fail** (UI が勝手にドメインを増やすのを防ぐ)。

### 0e. backlog mode 判定 (BacklogGate / OfferPolicy 中央化)

内蔵 backlog 機能のモードを `BacklogGate.resolveMode()` で確定 — **全 backlog entrypoint** (auto-detect / bootstrap / migration / sync check / 発話 / 提案フック) **の必須ゲート**で、`mode == external` は全 hook no-op (silent 違反防止)。新規 backlog hook 追加時は `BacklogGate` + `OfferPolicy` 経由を必ず確認。

`mode` 4 状態: `unset` (1 回提案) / `enabled` (内蔵 backlog 使用) / `external` (外部 PM 使用、完全 silent) / `deferred` (30 日 cooldown、期限切れで unset 扱い、値は保持)。優先順位 (固定、auto-detect は explicit を**上書き禁止**): explicit `project.yaml.backlog.mode` > external marker (`.linear/` / CLAUDE.md 語句) > existing `.takumi/backlog/` > unset。

提案発火は `OfferPolicy.shouldOffer(trigger)` 経由のみ (5 タイミング: probe triage 完了 / sweep 完了 / discovered ≥3 / 「BL 起票」発話 / Sprint bl_refs)、session-scoped `backlog_offer_shown` + project-scoped `deferred_until` で 1 セッション最大 1 回、`external` は 0 回。`mode == enabled` 時のみ bootstrap (`.takumi/backlog/{open,doing,done}/` + `.gitignore` 例外 + README + `bootstrapped_at` 更新)、詳細は `step0-bootstrap.md` の「project.yaml.backlog セクション」節。

frontmatter / 状態遷移表 (4 状態 × 5 イベント) / external silent マトリクス / 自動判定 3 signal / 移行 / AI 移動 + sync check の詳細は **`backlog-mode.md`** (+ `backlog/*.md` sub-spec 7 本) を参照。

外部要件 source (opt-in、`requirements.source == toishi` 時のみ) の全 fetch point は **`ToishiGate.shouldFetch(stage)` 経由必須** (`mode == never / local / unset` で全 stage no-op、backlog OfferPolicy と対称)。詳細 `toishi-integration.md`、bash は `step0-bootstrap.md`。

---

## Step 1 — 規模分類 (5-mode)

| mode | 目安 / Wave 数 | 主アクション |
|------|------|-----------|
| **Quick** | ≤ 30 分、AC 1、files ≤ 3 / 1-3 wave | 棟梁が直接対応 |
| **Standard** | 30 分 - 6h、AC 2-5 / 5-15 wave | インタビュー + 斥候 |
| **Large** | 6h - 3 日、files 10-50 / 25-60 wave | + 軍師分析 + Inter-Wave Sync |
| **Continuous** | 50+ file or 30+ task / Sprint × N | `sprint-mode.md` (3-phase Cycle、S-PCR、3-Lane Discovery) |
| **Full Spec** | trigger "確実に/完全に" or Formula ≥ 100 / 100-500 wave | sprint-mode.md フル + Hidden checklist + Cross-Sync |

判定不能は **小規模側に倒す**。Continuous/Full Spec は `sprint-mode.md` 主軸。判定 algorithm / trigger 詳細は同書 §「起動条件」。

> [!IMPORTANT]
> **Opus 4.8 delegation policy**: 棟梁 (Opus 4.8 main session) は自分で完結できる作業に subagent を spawn しない ([Opus 4.7 best practices、4.8 でも踏襲](https://claude.com/blog/best-practices-for-using-claude-opus-4-7-with-claude-code))。Quick は棟梁が直接処理、Standard 以上で初めて斥候/職人を呼ぶ。effort 既定は xhigh、max は真に難しい問題のみ。詳細は `executor.md` の「Opus 4.8 delegation policy」節。

### 自己増殖型が必要か判定

スコープ事前確定で完結なら不要。調査→発見→追加サイクル / 品質改善 / 網羅 review / "終わりは user 判断" 系は必要。詳細トリガと取扱いは `self-multiplying.md` (発見多発時は `3lane-discovery.md` で P0/P1/P2 分離、Sprint 構造内なら `sprint-mode.md` Discovery Phase)。

---

## Step 2 — 調査（インタビューと並行可）

- **斥候 (haiku)** — コードベース高速スキャン: Agent tool `subagent_type: "Explore"`, `model: "haiku"`。
- **軍師 (GPT-5.x)** — 大規模タスクの設計分析: `codex exec` (hardening v2、stdin heredoc / `tk_timeout 600` / 5.5 default / prompt 1.5KB / 参照は本文埋込で hang 回避 / hang・4xx で Sonnet subagent fallback)。**起動構文と routing は `dispatch/gunshi-invocation.md`、`dispatch/executor.md` §2** 参照。

---

## Step 3 — インタビュー

自分（Opus）がユーザーと日本語で対話する。

**ルール**:
- 1ターン最大 3問
- コードを読めばわかることは聞かない → 斥候 に委譲
- 中規模以上: `.takumi/drafts/{name}.md` にメモを残す

**AC 起草の統合**:

このインタビューは実装アプローチを詰めるだけでなく、surface ごとの **TopContract + AC-ID の起草** (Step 0c 参照) も同時に行う。
1 ターン目で surface と AC 粒度を確定し、以降のターンで境界条件・risk を深掘りして TopContract を育てる。
確定した TopContract / AC は `.takumi/specs/{surface}.md` に frontmatter 付きで書き込み、人間に一覧提示で確認を取る。

**強制問診 4 観点** (TopContract の沈黙 = 仕様漏れを防ぐ、各 surface で必ず尋ねる): **禁止状態** (I3) / **例外業務** (T3) / **権限境界** (I5) / **状態変化整合性** = 並行性・単位・丸め・監査 + 鮮度/楽観極性/invalidation 粒度 (I4/I6、DDP)。

**完了チェック**（毎ターン評価）:
```
[ ] 目的・スコープ (IN/OUT) が明確
[ ] surface 分解 + 6 軸タグ付け済み (surface-archetypes.md)
[ ] TopContract (I1-I6 + T1-T4) 確立、強制問診 4 観点を通過
[ ] AC-ID が原子粒度、ac_class / risk / depends_on / derived_from 付与
[ ] 技術アプローチ決定 / 検証方法あり / 未知の重要事項なし
```

全パスで計画生成へ。ユーザーが「作って」→ 強制遷移。
小規模の場合はインタビュー省略可。

---

## Step 4 — 計画生成

`.takumi/plans/{name}.md` に書き出す。テンプレート骨格・記載ルール・軍師 計画レビューの手順は `plan-template.md` を参照。

### 提示後のディスパッチ

**停止点・gate 前進・無人継続は冒頭 kernel §1/§2 に従う** (`dispatch/loop-invariant.md`)。Wave 完了ごとの「続けますか?」禁止。

- probe mode / sweep mode 経由の場合 → 確認を求めず即 executor 起動 (`executor.md` 参照)
- 直接 `/takumi` で normal mode に入った場合 → **計画承認 (G1) は `autonomy.level` に従う** (`autonomy.md`): `autonomous` (default) → 軍師 plan-review が blocking なし AND critical AC なしなら**無人 proceed** (critical 含む or 軍師 degraded は計画提示して人間承認) / `gated` → 計画提示「進めて良いですか?」→ yes で起動 / `manual` → 全 gate で人間
- `project.yaml.requirements.source == toishi` の project では Wave 1 着手前に **G1.5 (外部 scope 承認 check)** も発動 (`autonomy.md` G1.5 行 + `toishi-integration.md` 参照、他 source は no-op)

### in-conversation plan の許容条件 (plan ファイル省略の例外)

**デフォルトは `.takumi/plans/{name}.md` を必ず生成する**。以下 5 条件を **すべて満たした場合のみ**、plan ファイルを書かず TaskCreate + 会話内の合意で直接実装に入る "in-conversation plan" を許容する:

1. 対象が skill / ドキュメント / config ファイルの編集のみ (プロダクションコード・build・DB・CI 設定への影響がゼロ)
2. 会話内で Wave 構造がすでに棟梁とユーザーで合意済み (「この方針で進めて良いですか?」に yes が返っている)
3. 規模が「小」〜「中」相当で、見込み作業時間が 30 分以内
4. ユーザーが「計画 → 実装に進む」を明示承認している (yes / OK / 進めて 等の明確な応答)
5. 全 Wave を TaskCreate で追跡可能 (3-15 タスク規模に収まる)

5 条件のうち 1 つでも欠けたら plan ファイルを生成する (初回依頼で Wave 未合意 / プロダクションコード・build に触れる / 1h 以上 / 大規模リファクタ・品質改善ループ・複数リポジトリ横断 は全て不許容)。

> [!IMPORTANT]
> 迷ったら plan ファイルを書く側に倒す。`.takumi/plans/` は `.gitignore` 済でコストゼロ、履歴が残らない害の方が大きい。

---

## Step 5 — 自己増殖型（必要な場合のみ）

大規模・品質改善・リファクタ・網羅的レビュー系では、職人 の担当外発見を `discovered-{id}.md` に記録 (自分で解決しない) → 棟梁 が Wave 完了後に統合し計画に挿入 (P0 は次バッチ割込、100+ は ICE 上位 50 件に triage)。詳細は **`sprint/self-multiplying.md`**。

---

## Step 6 — バックログ入力モード (probe mode 連携)

probe mode から backlog.md が渡された場合、または backlog.md が既に存在する場合はインタビュー省略。
詳細は **`backlog-mode.md`** を読む:

- backlog.md の各課題 (証拠 file:line, MECE 分類, ICE スコア) を Wave タスクに変換
- 分類に応じて 職人/斥候/軍師 を自動割り当て
- 常に自己増殖型で生成
- 出力: `.takumi/plans/probe-{日付}.md`

---

## 制約

計画モード中:
- ソースコード編集禁止（`.takumi/` のみ可）
- 実装コマンド実行禁止
- 中規模以上でインタビュー省略禁止（バックログ入力モードは例外）
- 自己増殖型: 職人 は担当外の発見を自分で解決しない（計画に書き戻す）

### コンテキスト保護

インタビューが長引くと Main コンテキストが肥大化する。残量 60% を切ったら、計画生成ステップを Agent に委譲して JSON だけ返す設計も検討する（probe/sweep の Phase 0 委譲ガード参照）。

---

## Step 7 — 新規 skill との連携

新規 skill 接続・reference-first 運用 (frontmatter 肥大化防止、task 平均 20 行以下、override 30% 超で defaults 再設計)・telemetry 連携 (儀式化 drift)・`test-strategy.md`/design mode 連携・軍師 5 閾値 (mutation_floor / layout_strictness / auto_ref_site / design_drift / loop min-max)。詳細は **`integrations.md`**。

---

## 自然文インターフェース

**人間が覚えるコマンドは `/takumi` の 1 つだけ**。観点診断・棚卸し・状態確認・再開・停止・リファクタ・検証・設計のいずれも `/takumi` に日本語で伝えれば、意図分類ルータが 6 モード (normal / probe / sweep / status / continue / override) に振り分ける。サブコマンド構文 (`/takumi status` 等) も対外コマンド (`/probe` 等) も採用しない。発話辞書は `natural-language.md`。

## 関連リソース

**どのファイルを読むか**は冒頭「進入路」表で決める。各ファイルの 1 行概要は進入路の task 種別を参照。

profile registry (外部参照): `verify-profiles-defaults/*.yaml` (5 archetype defaults) / `design/profiles-defaults/*.yaml` (4 design defaults) / `.takumi/profiles/{verify,design}/*.yaml` (project 側本体) / `.takumi/telemetry/profile-usage.jsonl` (event log、append-only)。
