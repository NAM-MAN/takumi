---
name: strict-refactoring
description: "コード修正・リファクタリング・設計相談を受けた際の policy skill。/takumi が refactor_profile_ref と strictness を選定して内部呼出、設計制約・UI state 契約・verify 接続を担う。単独起動も可 (「リファクタして」「設計見直して」等)。"
---

# strict-refactoring: 人類が積み上げてきた設計知見をチェックリスト化

良い設計を、個人の経験ではなくルールとして再利用できるかたちに。

```
/takumi このサービスクラス、責務が多すぎる気がする
```

と話しかければ、このスキルが自動で起動します。**30 年かけてコミュニティが発見してきたベタープラクティス**を、プロジェクトの状況 (新規 / レガシー / 言語 / UI の有無) に応じて可変の強度で適用します。

---

## こんなお悩み、ありませんか?

- レビューで指摘される「設計」のコメントが人によって違う
- 「リファクタしたほうがいい」と言われるが、何をもって「良い」のかわからない
- OOP や DDD の本を読んだが、現場で使うと逆に不自然になる
- 新規コードには厳密なルールを、レガシーには緩いルールを適用したいが、線引きが曖昧
- 言語ごとにベストプラクティスが違う (Go と TypeScript では流儀が違う) のをどう扱うか

strict-refactoring は、**良い設計とされているパターンをルールとして成文化**し、適用強度を**プロファイル**で切り替える仕組みを提供します。

---

## strict-refactoring が解決すること (4 つの視点)

### 1. 30 年の知見を、5 つのプロファイルに整理

ソフトウェア設計の知見は、この数十年で膨大に積み上がってきました。

- **オブジェクト指向プログラミング (OOP)** — 1970 年代 Smalltalk から磨かれた、カプセル化・責務分離の考え方
- **関数型プログラミング (FP)** — 副作用を分離し、純粋関数を中心に置く考え方
- **ドメイン駆動設計 (DDD)** — 2003 年 Eric Evans の著書以降広まった、業務領域を中心に据える設計手法
- **CQRS (Command Query Responsibility Segregation)** — 状態を変える操作 (Command) と読む操作 (Query / ReadModel) を分離する考え方
- **Result 型** — 例外 (throw) ではなく、成功/失敗を型で表現するエラーハンドリング
- **Pending Object Pattern** — UI の中間状態を明示的にオブジェクト化し、validate してからコミットする手法

これらを「全部守れ」と言うと非現実的ですが、完全に無視すると何が良い設計かわからなくなります。strict-refactoring は 5 つのプロファイルに整理し、状況に応じて使い分けます。

| プロファイル | 適用ケース |
|---|---|
| `domain-strict` | 新規ドメインロジック。Command / Pure / ReadModel で厳密に分類 |
| `ui-pending-object` | UI の状態あり。useReducer + actionPreconditions で安全性を担保 |
| `legacy-touchable` | 既存レガシーに最小侵襲。L1 の一部のみ warning として適用 |
| `integration-thin` | 外部 API 連携層。DTO 変換中心、ドメインルールは緩和 |
| `lang-relaxed-go-rust` | Go / Rust / Python。型システムで代替される制約は緩和 |

### 2. 強度 (L1 / L2 / L3) を切り替えられます

全ルールを常に適用するのではなく、3 段階の強度で段階的に導入できます。

- **L1 — 必須不変条件 (5 個)**: 新規コードなら絶対守る、基本中の基本
- **L2 — 既定ヒューリスティクス (10 個)**: 基本は守るが、状況により緩和可
- **L3 — UI state ルール**: React/Next.js の状態管理に特化した規則

新規ドメインコード → L1+L2、既存レガシーに 1 行足すだけ → L1 のみ (warning)、UI を組む → L1+L2+L3 のように使い分けます。

### 3. UI の状態管理が、自然にスケールします (Tier A→B→C→D)

多くのプロジェクトで起こるのが、画面が複雑になるにつれて状態管理 (useState) がぐちゃぐちゃになる現象です。strict-refactoring は**成熟度の昇格階段**を用意しています。

| Tier | 本番設計 | いつ昇格するか |
|---|---|---|
| **A** | useState を直接書く | 状態数が少なく、関係も単純 |
| **B** | **Pending Object Pattern** (useReducer + 事前条件関数を export) | 状態 3-8、遷移にルールが必要になってきた |
| **C** | **State Machine** (XState で明示的な機械を作る) | 状態 9-20、並列状態やガードが複雑 |
| **D** | **Event Sourcing** (状態ではなくイベントを記録する) | 状態 21 以上、realtime / canvas / 監査 |

**人間が昇格を決めなくても大丈夫です。** strict-refactoring が状態数・ガード数・並列性を測定し、「そろそろ B に昇格したほうがいいですね」と提案します。

### 4. テスト (verify スキル) と、原理的にズレません

一般的なプロジェクトでは、本番コードとテストコードが別々に書かれるため、**仕様解釈がズレる**という問題が起こります。リファクタすると両方直す必要があり、どちらかが古くなって「テストは通るがバグがある」状態に陥ります。

strict-refactoring は、姉妹スキル verify と**契約を共有**します。

| Tier | 本番側の契約 | verify がそれをどう使うか |
|---|---|---|
| A | Props 型 | Props arbitrary (ランダム生成) で component test |
| **B** | **`actionPreconditions` を export** | **そのまま fc.commands の precondition として再利用** |
| C | machine 定義 | そのまま `@xstate/test` で歩き回る |
| D | `applyEvent` pure 関数 | イベントの不変条件をテスト |

同じオブジェクトを本番とテストが**文字通り共有する**ので、drift が起こりようがない、というのがこのスキルの中核アイデアです。

---

## 用語解説 (初めて聞く方へ)

| 用語 | 意味 |
|---|---|
| **Command / Pure / ReadModel** | 操作の分類。状態を変える (Command)、副作用なし (Pure)、状態を読む (ReadModel) |
| **完全コンストラクタ** | オブジェクトを作った瞬間に必ず有効な状態である、という原則 |
| **イミュータブル** | 一度作ったオブジェクトを書き換えず、新しいオブジェクトを返す方針 |
| **Result 型** | 成功/失敗を型で表現 (`Result<T, E>`)。例外投げずにエラーを返す |
| **Early Return** | 条件を満たさないケースを関数の冒頭で return、ネストを浅くする |
| **Pending Object Pattern** | 変更を「保留オブジェクト」に集めて validate してからコミットする設計 |
| **useReducer** | React で状態遷移を reducer 関数に切り出すフック |
| **Aggregate Root** | DDD で、関連オブジェクト群の一貫性を守る代表オブジェクト |
| **Primitive Obsession** | プリミティブ型 (string, number) を使いすぎて意味が不明瞭になる状態 |
| **DTO (Data Transfer Object)** | 外部 API との境界でデータを運ぶためだけのオブジェクト |

---

# 以下、AI 実行時に参照する仕様

`/takumi` が task を生成する時、また `/strict-refactoring` が単独起動される時に、AI エージェントが読む仕様セクションです。

---

## When To Use

- 「リファクタして」「設計見直して」「アーキテクチャ相談」「OOP」「DDD」「ドメイン駆動」等の自然文キーワードで単独起動
- `/takumi` が task 生成時に **layer / code age / project_mode** から自動判定して内部呼出
  - 新規 domain コード → `domain-strict` profile、strictness L1+L2
  - touched legacy → `legacy-touchable` profile、strictness L1 のみ (soft warning)
  - UI state 含む → `ui-pending-object` profile、Tier 判定付き
- 実装 worker が完了時に checklist で再評価 (`review-checklist.md`)

`/takumi` が task の `refactor_profile_ref` と `strictness` を frontmatter に書き、実装 worker が完了時に本 skill の checklist で再評価する二段構えで運用する。単独起動(自然文トリガー)も許容するが、その場合も同じ profile schema を仮生成する。

`/design` が「どう見せるか」の創発寄り skill なら、本 skill は「どう作るか」の**制約寄り** skill。両者で新ワークフローの設計骨格を成す。

---

## What This Skill Decides

| 判定 | 出力 field |
|---|---|
| どの profile を適用するか | `refactor_profile_ref` (5 種、`profiles.md` 参照) |
| 厳密度 | `strictness: L1 | L2 | L3` |
| UI state 成熟度 | `ui_state_model_tier: A | B | C | D` (UI のみ) |
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
- `L1`: required invariants 5 個のみ (`rules-core.md` 参照)
- `L1+L2`: + default heuristics 10 個
- `L1+L2+L3`: + UI state rules (`rules-ui-state.md` 参照)

### 4. 職人 検証 (実装完了時)

`review-checklist.md` の該当 profile + strictness の項目を実装に対して評価。
違反は `refactor_review_completed` event として telemetry に emit (違反 rule id を payload に集約)。

### 5. Tier graduation 提案 (UI のみ)

state 数 / guard 数 / parallel 必要性が閾値を超えたら `ui_state_model_tier` の昇格を提案。
人間の承認を経て tier graduation を実施、`tier_graduated` event を emit。

---

## Profile Selection

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

---

## Required Invariants (L1、5 個)

**絶対に守る**:

1. **3 分類**: Command / Pure / ReadModel のいずれかに分類
2. **完全コンストラクタ**: 生成時点で有効な状態
3. **ドメイン層 switch/if-else 禁止**: Interface + 実装クラスで表現
4. **イミュータブル**: 状態変更は新オブジェクト返却
5. **Result 型**: ドメインエラーは `Result<T, E>`、throw しない

詳細は `rules-core.md` を読む。

---

## Standard Heuristics (L2、10 個、4 カテゴリ)

**基本遵守、profile で一部緩和あり**:

| カテゴリ | ルール |
|---|---|
| **structure** | Early Return、Pending Object、Repository=Aggregate Root、concept-first task placement |
| **api-shape** | 引数 1-2 個、名前付き戻り値、Primitive Obsession 回避 |
| **testability** | Interface 優先 (継承禁止)、External Resource は引数 |
| **layout** | テスト命名 (仕様書として機能) |

詳細と緩和条件は `rules-core.md`。

---

## UI State Rules (L3、React/Next.js 特化)

UI state を持つ component で Tier 判定:

| tier | 設計 | verify 契約 |
|---|---|---|
| A | useState 直書き | Props arbitrary (Component Test + fc) |
| **B** | **Pending Object** (useReducer + `actionPreconditions` export) | **precondition 関数を共有** (fc.commands で再利用) |
| C | State Machine (XState or plain TS) | machine を契約として共有 |
| D | Event Sourcing | `applyEvent` を pure 関数として export |

**Tier B の `actionPreconditions` export は絶対に壊せない contract** (詳細 `verify-contracts.md`)。

昇格判定 (promotion heuristic、hard rule ではない):
- state 数 > 8 → B → C 検討
- guard 数 > 3 → B → C 検討
- parallel regions 必要 → C → D 検討

詳細は `rules-ui-state.md`。

---

## Verify Contracts

strict-refactoring の Tier と verify の archetype は**別軸**だが、対応関係がある:

| ui_state_model_tier | 主 verify archetype | 補助 |
|---|---|---|
| A | boundary | property |
| B | state-transition | model |
| C | model | differential |
| D | model | metamorphic |

Tier B の `actionPreconditions` を verify が fc.commands で再利用することで、**production と test が同じ実体で drift しない**。これが新ワークフローで**絶対に壊すべきでない contract** (軍師 最終判定)。

詳細は `verify-contracts.md`。

---

## When To Read References

本 SKILL.md は概要のみ。以下のタイミングで補助 md を読む:

| 読むタイミング | 補助 md |
|---|---|
| profile 選定で迷った | `profiles.md` |
| L1 / L2 ルール詳細 | `rules-core.md` |
| UI state / Tier / React 実装例 | `rules-ui-state.md` |
| verify archetype との対応表 | `verify-contracts.md` |
| Go / Rust / Python の緩和 | `language-relaxations.md` |
| 実装完了時の checklist 評価 | `review-checklist.md` |

---

## Output Expectations

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

詳細 schema は `~/.claude/skills/takumi/telemetry-spec.md` と `telemetry-schema.md` (後日追加)。

---

## 制約

- **Tier 分類は AI 自動判定を基本**、人間は例外指定のみ
- **`actionPreconditions` export は contract**、skill の判断で省略禁止
- **profile 5 個を安易に増やさない** (6 個以上は新ワークフロー思想と齟齬)
- 既存 plugin の「絶対遵守」「標準遵守」の語は `required invariants` / `default heuristics` に再命名済み。古い語を復活させない

---

## 関連リソース

| file | 用途 |
|---|---|
| `profiles.md` (同ディレクトリ) | 5 profile の詳細 |
| `rules-core.md` (同ディレクトリ) | L1 (required invariants) + L2 (default heuristics) |
| `rules-ui-state.md` (同ディレクトリ) | L3 (UI state modeling、Tier A-D) |
| `verify-contracts.md` (同ディレクトリ) | Tier → verify archetype 対応 |
| `language-relaxations.md` (同ディレクトリ) | Go / Rust / Python の緩和 |
| `review-checklist.md` (同ディレクトリ) | 実装完了時の評価 checklist |
| `~/.claude/skills/takumi/SKILL.md` | 呼出元 (refactor_profile_ref を書く) |
| `~/.claude/skills/takumi/verify/README.md` | L1-L6 テスト戦略、Tier B の precondition 再利用 |
| `~/.claude/skills/takumi/design/README.md` | 創発寄り、本 skill は制約寄り (対) |
