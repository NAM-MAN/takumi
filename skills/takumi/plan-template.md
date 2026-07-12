# plan-template (内部参照)

`SKILL.md` Step 4 から参照される計画ファイルテンプレート。`.takumi/plans/{name}.md` に書き出すときの骨格。

```markdown
# {タイトル}

## 概要
> **やること**: 一行説明
> **成果物**: 箇条書き
> **規模**: 小 | 中 | 大
> **Wave数**: N (自己増殖型は "N+(自己増殖型)")

## 自己増殖メカニズム (自己増殖型のみ)
(self-multiplying.md のテンプレートを埋め込む)

## 背景
### リクエスト
### 調査結果 (斥候 / 軍師)

## スコープ
### 完了条件
### やらないこと

## TODOs

### Wave 1: {基盤}

- [ ] 1. **タスク名**
  - **ac_ids**: [AC-AUTH-002, AC-AUTH-003]
  - **depends_on** / **file_scope** / **resource_scope**: [] / [src/auth/login.ts] / [auth:policy]  # DAG 並列判定、詳細 `wave-dag.md`
  - **risk**: critical | normal  # critical (決済/権限/データ消失/監査/rollback) は human floor、詳細 `autonomy.md`
  - **bl_refs**: [BL-007]  # 任意、`project.yaml.backlog.mode == enabled` 時のみ意味を持つ。詳細 `backlog-mode.md`
  - **verify_profile_ref** / **design_profile_ref** / **mutation_tier**: state-transition / dashboard-dense / standard
  - **refactor_profile_ref** / **strictness** / **ui_state_model_tier**: ui-pending-object / L1+L2+L3 / B  # 詳細は各 skill 参照
  - **surface_ref** / **top_contract_refs** / **derived_from**: auth / [AC-AUTH-002] / [I4, T3]  # 契約スパイン、`contract-spine.md`。全 optional (無ければ従来 `ac_ids` のみで動作 = 後方互換)
  - **domain_slice**: `{aggregate, allowed_mutations[], prohibited_creates[], property_ref, boundary}`  # 否定制約を gate で機械強制、`domain-data-primitives.md`。例: aggregate=Order / prohibited_creates=[Customer,Payment] / property_ref=test/order.pbt.ts / boundary=domain
  - **data_access**: `{da_tier, read{entity,shape,freshness}, mutation{optimistic|pessimistic+理由, invalidates[]}}`  # data/UI surface のみ。`data-access-protocol.md` (DDP)。既定 da_tier=DA-0・optimistic。例: da_tier=DA-0 / mutation={optimistic, invalidates:[issue:id, issue.list@assignee]}。全 optional (無ければ従来動作=後方互換、backend/stateless surface は null)
  - **gates**: `[GATE: ddp-d2-list-invalidation | templates/ddp-lint.mjs#D2 | findings=0]`  # 任意、≤3/task。schema は下「plan gate 行」節
  - **何を**: ファイルパス、行番号、変更内容
  - **なぜ**: 動機
  - **ロール**: 職人 | 軍師 | 斥候
  - **やらない**: ガードレール
  - **検証**: 具体的な確認手順 + mutation_floor 通過 + L7 hard gate 通過 + strict-refactoring checklist 通過 + (domain_slice あれば) contract_conformance / boundary_lint / ConsistencyMatrix 機械対 通過

### Wave 2: {本体}

- [ ] 2. ...

### 最終検証

- [ ] F1. 全検証項目の再確認
- [ ] F2. ビルド通過
- [ ] F3. テスト通過
- [ ] F4. 軍師 最終レビュー
  - `.takumi/profiles/env.yaml` の preference.tier (copilot / codex / opus-max) + preference.model (auto / gpt-5.5 / gpt-5.4) で tier × model を決定。Tier 2 (codex、5.5 default) の例 (1 行目のみ示す、prompt は stdin heredoc):
  - `tk_timeout 600 codex exec -m gpt-5.5 -s read-only --skip-git-repo-check -C "$(pwd)" - <<'PROMPT' 2>&1 | tail -100`
  - heredoc 本文: "git diff main...HEAD の全変更を敵対的にレビューせよ。境界条件・障害パス・競合状態・セキュリティを重点的に。出力 1.5KB 以内。" → `PROMPT`
  - 他 tier の exact 構文と GPT-5.5 upgrade path / hang fallback は `gunshi-invocation.md` の「軍師 routing」+「GPT-5.5 upgrade path」+「invocation hardening v2」節参照
```

## ルール

### 必須 7 field (誤実装を潰す最小契約)

各 task は次の 7 を**意味として**満たす (専用 field でも `何を` 散文でも可、職人は task 全文を読む):

1. **goal**: 達成する成果物 (成果物ベース)
2. **file_scope**: 触ってよいファイル/モジュール境界 (具体パス。title に書いても可)
3. **acceptance**: 満たす完了条件 (`ac_ids`/`derived_from`、または明示条件。検証に期待結果があれば代替可)
4. **constraints** (= やらない): やらないこと + **守る既存挙動** + 禁止実装
5. **data_access**: read/write/update 先 (DB/API/外部 IO/state を持つ task のみ必須、無ければ省略)
6. **implementation_hint** (= 何を): 方針 + 主要 API/型/データ流れ。**抽象語だけ禁止** (具体名: 既存シンボル/新規予定名/パス/データ形状/状態遷移名の最低 1)
7. **verification** (= 検証): 完了判定 (テスト名 / コマンド / 期待結果)

`ロール` は任意 (実装品質を上げない)、`domain_slice` は大規模分割時のみ、`なぜ` は goal/constraints に吸収。
**依存は `depends_on` で task 単位に宣言** (Wave は依存解決済 task のトポロジカル層)。宣言が無ければ記載順に直列 (後方互換)。並列・層単位 gate は `wave-dag.md`。

### plan gate 行 — rule を plan に compile する <!-- RULE: plan-gate-lines T1:scripts/check-plan-contract.mjs -->
<!-- scope:plan task の gates field / shall:形式は [GATE: rule-id | mechanism-ref | 観測可能な期待値]、mechanism-ref は registry.yaml に実在、task ≤3 行・plan 全体 ≤30 行 / not:rule 本文の引用・要約を plan に書く (ref-only)・registry に無い mechanism-ref / applicability:plan.tasks != null / evidence:false -->

plan 生成時、task に適用される rule (task frontmatter → `registry.yaml` の `applies_when` match) を **gate 行**として plan に compile する。plan は実行中に常時再読される権威状態なので、ここに刻まれた gate は希釈しない (rule 本文を読む必要が無い = ref-only)。

- 形式: `[GATE: {rule-id} | {mechanism-ref} | {観測可能な期待値}]` — 3 要素とも必須。期待値は機械照合可能な形 (`findings=0` / `exit=0` / `verdict=pass`)
- **ref-only**: rule 本文・要約の引用は禁止 (plan 内で prose に戻さない。「rule 本文親蓄積」canary と整合)
- 上限: **task あたり ≤3 行、plan 全体 ≤30 行** (plan 肥大 = 再読希釈の防止)。溢れる分は Wave gate (executor §3 の registry driver) に任せて省く
- `mechanism-ref` は registry の当該 rule `mechanism` と一致必須 (plan 版 reverse-orphan、`check-plan-contract.mjs` が検証)

### 薄い計画 gate (誤実装の予防) <!-- RULE: plan-contract-density T1:scripts/check-plan-contract.mjs -->
<!-- scope:plan の各 task 契約密度 / shall:T1 fail は T2 送致・block は T1∩T2 両 flag 時のみ・critical は T1 pass でも T2 必須 / not:T1 単独で block・historical plan を retro-block / applicability:plan.tasks!=null / evidence:true -->

plan 起草後、職人 dispatch の**前**に薄い計画を検出する (state machine は `dispatch/executor.md` §2.5)。要点:

- **T1** (`scripts/check-plan-contract.mjs`、決定的) は **advisory pre-filter** — 構造欠落 task を安く拾い、7-field への移行圧を作り、T2 へ送致する。**単独で block しない** (散文 adequate を誤 fail するため)。
- **T2** (`enforcement/reviewers/plan-contract.md`、反証 oracle) が **blocking authority** — 「職人が誤りうる 3 点が防げているか」を meaning-aware に判定。`fix`→plan 再記述 / `escalate`→文脈不足。
- `critical`/high-blast task は T1 pass でも T2 必須。**必須 7-field と block は新規 plan・新規/変更 task にのみ適用 (forward-going)**、既存 active plan・未変更 task は warn-only で retro-block しない (適用単位の機械述語は `dispatch/executor.md` §2.5)。

> [!IMPORTANT]
> **claim cap (誇大主張の封じ込め)**: 本 gate は「go-live 可能な低 FP 構成」を確認したのみで、**誤実装率の低下は未証明** (A/B power 不足)。gate を通した plan で誤実装/手戻りが起きたら **post-hoc miss audit** を必ず記録 (`T1 flags / T2 verdict / blast 分類 / 抜けた契約項目`、`telemetry/telemetry-spec.md`)。記録を欠くと AND 構成が「安心の演出」になる。

## 軍師 計画レビュー (自動・生成直後)

計画ファイル生成直後、軍師 に自動でレビューを依頼。`.takumi/profiles/env.yaml` の `preference` に応じて tier を選択:

<!-- stdin heredoc / `tk_timeout 600` / 5.5 default / prompt 1.5KB 上限。
  ファイル参照は呼出側で本文を埋込み、codex に「読め」命令で hang trigger を引かない。
  hang/4xx → subagent (Sonnet via Agent tool) Tier 2 fallback (詳細: gunshi-invocation.md「invocation hardening v2」)。 -->
```bash
# Tier 2 (codex exec、ChatGPT Plus) の例
PROMPT_FILE=$(mktemp)
cat > "$PROMPT_FILE" <<EOF
以下の plan の前提の誤り・スコープの漏れ・Wave 依存の矛盾・リスクを指摘せよ。
出力 1.5KB 以内、診断と修正案のみ。

## plan 本文
$(cat .takumi/plans/{name}.md)
EOF
tk_timeout 600 codex exec -m gpt-5.5 -s read-only --skip-git-repo-check -C "$(pwd)" - < "$PROMPT_FILE" 2>&1 | tail -100

# Tier 1 (copilot、Copilot Pro / Pro+) の例 (default fallback chain から除外、user override 時のみ — gunshi-invocation.md「軍師 routing」節参照)
# copilot -p "..." --model gpt-5.5 --cwd "$(pwd)" --available-tools="view,grep,glob,web_fetch" --silent
```

各 tier の詳細呼出パターンは `gunshi-invocation.md` 「軍師 routing (3-tier + quota rotation)」参照。

- 指摘あり → 計画ファイルに反映してから提示
- 指摘なし → そのまま提示
