# strict-refactoring — AI runtime guide

takumi 経由で呼ばれる strict-refactoring skill の実行手順・適用ルール・output 契約。LP / 用語解説は `README.md` 側。

---

> ここから下は `/takumi` が task を生成する時、また `/strict-refactoring` が単独起動される時に、AI エージェントが読む仕様セクションです。人間が通読する必要はありません。

---

## When To Use

- 「リファクタして」「設計見直して」「アーキテクチャ相談」「OOP」「DDD」「ドメイン駆動」等の自然文キーワードで単独起動
- `/takumi` が task 生成時に **layer / code age / project_mode** から自動判定して内部呼出
  - 新規 domain コード → `domain-strict` profile、strictness L1+L2
  - touched legacy → `legacy-touchable` profile、strictness L1 のみ (soft warning)
  - UI state 含む → `ui-pending-object` profile、Tier 判定付き
- 実装 worker が完了時に checklist で再評価 (`review-checklist.md`)

`/takumi` が task の `refactor_profile_ref` と `strictness` を frontmatter に書き、実装 worker が完了時に本 skill の checklist で再評価する二段構えで運用する。単独起動(自然文トリガー)も許容するが、その場合も同じ profile schema を仮生成する。

takumi の design mode が「どう見せるか」の創発寄りモードなら、本 skill は「どう作るか」の**制約寄り** skill (takumi から呼ばれる plugin として接続)。両者で新ワークフローの設計骨格を成す。

---

## What This Skill Decides

| 判定 | 出力 field |
|---|---|
| どの profile を適用するか | `refactor_profile_ref` (5 種、`profiles.md` 参照) |
| 厳密度 | `strictness: L1 / L2 / L3` |
| UI state 成熟度 | `ui_state_model_tier: A / B / C / D` (UI のみ) |
| verify contract | `actionPreconditions` export の要否など (`verify-contracts.md` 参照) |

task frontmatter 例:
```yaml
task_id: T-042
refactor_profile_ref: "domain-strict"
strictness: "L1+L2"
ui_state_model_tier: null  # UI でない場合
```

UI task の場合:
```yaml
refactor_profile_ref: "ui-pending-object"
strictness: "L1+L2+L3"
ui_state_model_tier: "B"   # Pending Object Pattern 適用
```

---

## Workflow

<details>
<summary><b>5 ステップの詳細 (クリックで展開)</b></summary>

### 1. 起動モード判定

- **/takumi 経由**: task frontmatter に profile / strictness / tier が書かれている → 読み込んで適用
- **単独自然文**: 対話で対象コードと目的を聞き、上記 field を仮生成

### 2. profile 選定 (詳細は `profiles.md`)

5 profile から 1 つ選ぶ:

| profile | 適用ケース |
|---|---|
| `domain-strict` | 新規 domain logic、Command/Pure/ReadModel 厳密分類 |
| `ui-pending-object` | UI state あり、useReducer + actionPreconditions |
| `legacy-touchable` | 既存 legacy に最小侵襲、L1 の一部のみ soft |
| `integration-thin` | 外部 API bridge、DTO layer、ルール緩和 |
| `lang-relaxed-go-rust` | Go/Rust/Python、型システムで代替される制約は緩和 |

### 3. ルール適用

strictness に応じて:
- `L1`: required invariants 5 個のみ (`rules-required.md` 参照)
- `L1+L2`: + default heuristics 16 個 (`rules-heuristics.md` 参照)
- `L1+L2+L3`: + UI state rules (`rules-ui-state.md` 参照)

### 4. 職人 検証 (実装完了時)

`review-checklist.md` の該当 profile + strictness の項目を実装に対して評価。
違反は `refactor_review_completed` event として telemetry に emit (違反 rule id を payload に集約)。

### 5. Tier graduation 提案 (UI のみ)

state 数 / guard 数 / parallel 必要性が閾値を超えたら `ui_state_model_tier` の昇格を提案。
人間の承認を経て tier graduation を実施、`tier_graduated` event を emit。

</details>

---

## Profile Selection

<details>
<summary><b>詳細判定ロジック (クリックで展開)</b></summary>

`/takumi` が未指定で投げてきた場合、以下の優先順で推定:

1. **project_mode + layer**
   - `mode=ui` かつ `layer=ui` → `ui-pending-object`
   - `mode=backend` かつ `layer=domain` → `domain-strict`
   - `layer=api` で外部統合 → `integration-thin`

2. **code age**
   - 新規ファイル or touched 30 日以内 → strict (L1+L2 以上)
   - touched 半年以上前 → `legacy-touchable`

3. **言語**
   - Go / Rust / Python → `lang-relaxed-go-rust`
   - TypeScript / Java / C# → 上記の通常判定

詳細判定ロジックは `profiles.md`。

</details>

---

## Required Invariants (L1、5 個)

> [!CAUTION]
> L1 の 5 項目は**絶対に守る** required invariants。新規コードでの違反は block 対象。

<details>
<summary><b>5 個の不変条件 (クリックで展開)</b></summary>

1. **3 分類**: Command / Pure / ReadModel のいずれかに分類
2. **完全コンストラクタ**: 生成時点で有効な状態
3. **ドメイン層 switch/if-else 禁止**: Interface + 実装クラスで表現
4. **イミュータブル**: 状態変更は新オブジェクト返却
5. **Result 型**: ドメインエラーは `Result<T, E>`、throw しない

詳細は `rules-required.md` を読む。

</details>

---

## Standard Heuristics (L2、16 個、4 カテゴリ)

<details>
<summary><b>4 カテゴリ 16 ルール (クリックで展開)</b></summary>

**基本遵守、profile で一部緩和あり**:

| カテゴリ | ルール |
|---|---|
| **structure** | Early Return、Pending Object、Repository=Aggregate Root、concept-first task placement |
| **api-shape** | 引数 1-2 個、名前付き戻り値、Primitive Obsession 回避 |
| **testability** | Interface 優先 (継承禁止)、External Resource は引数 |
| **layout** | テスト命名 (仕様書として機能) |

詳細と緩和条件は `rules-heuristics.md`。

</details>

---

## UI State Rules (L3、React/Next.js 特化)

<details>
<summary><b>Tier A-D の詳細と昇格ヒューリスティクス (クリックで展開)</b></summary>

UI state を持つ component で Tier 判定:

| tier | 設計 | verify 契約 |
|---|---|---|
| A | useState 直書き | Props arbitrary (Component Test + fc) |
| **B** | **Pending Object** (useReducer + `actionPreconditions` export) | **precondition 関数を共有** (fc.commands で再利用) |
| C | State Machine (XState or plain TS) | machine を契約として共有 |
| D | Event Sourcing | `applyEvent` を pure 関数として export |

> [!WARNING]
> **Tier B の `actionPreconditions` export は絶対に壊せない contract** (詳細 `verify-contracts.md`)。

昇格判定 (promotion heuristic、hard rule ではない):
- state 数 > 8 → B → C 検討
- guard 数 > 3 → B → C 検討
- parallel regions 必要 → C → D 検討

詳細は `rules-ui-state.md`。

</details>

---

## Verify Contracts

<details>
<summary><b>Tier → verify archetype 対応表 (クリックで展開)</b></summary>

strict-refactoring の Tier と verify の archetype は**別軸**だが、対応関係がある:

| ui_state_model_tier | 主 verify archetype | 補助 |
|---|---|---|
| A | boundary | property |
| B | state-transition | model |
| C | model | differential |
| D | model | metamorphic |

> [!IMPORTANT]
> Tier B の `actionPreconditions` を verify が fc.commands で再利用することで、**production と test が同じ実体で drift しない**。これが新ワークフローで**絶対に壊すべきでない contract** (軍師 最終判定)。

詳細は `verify-contracts.md`。

</details>

---

## When To Read References

<details>
<summary><b>補助 md ファイルを読むタイミング (クリックで展開)</b></summary>

本 SKILL.md は概要のみ。以下のタイミングで補助 md を読む:

| 読むタイミング | 補助 md |
|---|---|
| profile 選定で迷った | `profiles.md` |
| L1 required invariants 詳細 | `rules-required.md` |
| L2 default heuristics 詳細 | `rules-heuristics.md` |
| UI state / Tier / React 実装例 | `rules-ui-state.md` |
| verify archetype との対応表 | `verify-contracts.md` |
| Go / Rust / Python の緩和 | `language-relaxations.md` |
| 実装完了時の checklist 評価 | `review-checklist.md` |

</details>

---

## Output Expectations

<details>
<summary><b>/takumi 経由 / 単独起動 / telemetry emit (クリックで展開)</b></summary>

### /takumi 経由の場合

task frontmatter に以下 4 field を埋める:

```yaml
refactor_profile_ref: "domain-strict"
strictness: "L1+L2"
ui_state_model_tier: null
verify_contract_required: false  # Tier B 以上なら true
```

### 単独起動の場合

対話で以下を確認、上記 field を提案した上で対象コードへのリファクタ案を提示:

1. 対象ファイル / 対象モジュール
2. 現状の問題意識 (過度に複雑 / テストしにくい / 責務不明瞭 等)
3. 既存テストの網羅度 (リファクタで壊さないため)

### telemetry emit (新ワークフロー統合)

- `refactor_applied`: どの profile + strictness + rule ids を適用したか
- `tier_graduated`: UI state tier 昇格 (A→B 等)
- `verify_contract_satisfied`: Tier B の actionPreconditions export が実際に verify から参照されているか (true/false)

詳細 schema は `../telemetry-spec.md` と `telemetry-schema.md` (後日追加)。

</details>

---

## 制約

> [!WARNING]
> 以下は skill 自身への制約。これらは skill 運用上の hard constraint であり、judgment で省略してはならない。

<details>
<summary><b>4 つの制約 (クリックで展開)</b></summary>

- **Tier 分類は AI 自動判定を基本**、人間は例外指定のみ
- **`actionPreconditions` export は contract**、skill の判断で省略禁止
- **profile 5 個を安易に増やさない** (6 個以上は新ワークフロー思想と齟齬)
- 既存 plugin の「絶対遵守」「標準遵守」の語は `required invariants` / `default heuristics` に再命名済み。古い語を復活させない

</details>

---

## 関連リソース

<details>
<summary><b>参照ファイル一覧 (クリックで展開)</b></summary>

| file | 用途 |
|---|---|
| `profiles.md` (同ディレクトリ) | 5 profile の詳細 |
| `rules-core.md` (同ディレクトリ) | L1 / L2 / L3 の目次 (3 本への pointer) |
| `rules-required.md` (同ディレクトリ) | L1 required invariants 5 個の詳細 |
| `rules-heuristics.md` (同ディレクトリ) | L2 default heuristics 16 個の詳細 |
| `rules-ui-state.md` (同ディレクトリ) | L3 (UI state modeling、Tier A-D) |
| `verify-contracts.md` (同ディレクトリ) | Tier → verify archetype 対応 |
| `language-relaxations.md` (同ディレクトリ) | Go / Rust / Python の緩和 |
| `review-checklist.md` (同ディレクトリ) | 実装完了時の評価 checklist |
| `../SKILL.md` | 呼出元 (refactor_profile_ref を書く) |
| `../verify/README.md` | L1-L6 テスト戦略、Tier B の precondition 再利用 |
| `../design/README.md` | takumi の design mode (創発寄り)。本 skill は制約寄り (対) |

</details>
