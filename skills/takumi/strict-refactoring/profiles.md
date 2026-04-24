# /strict-refactoring: refactor profile 5 種

本 skill (`SKILL.md`) から参照される profile 定義。`refactor_profile_ref` として task frontmatter に書かれる。`/takumi` が layer / code age / project_mode / 言語から自動推定、明示指定も可。

## 5 profile 一覧

| name | 適用ケース | strictness | 典型 layer |
|---|---|---|---|
| `domain-strict` | 新規 domain logic | L1+L2 | domain |
| `ui-pending-object` | UI state あり、React/Next.js | L1+L2+L3 | ui |
| `legacy-touchable` | 既存 legacy の最小侵襲修正 | L1 の一部のみ soft | 任意 |
| `integration-thin` | 外部 API bridge、DTO layer | L1 の 3 分類のみ | api / data |
| `lang-relaxed-go-rust` | Go / Rust / Python | L1+L2 (言語緩和あり) | 任意 |

---

## domain-strict

**適用条件**:
- 新規実装された domain layer のコード
- ビジネスロジックが集約されている箇所 (金額計算、承認フロー、在庫管理 等)
- critical path (決済、認証、データ整合性)

**適用ルール**:
- required invariants 5 個すべて
- default heuristics 16 個すべて
- Pending Object Pattern (rule 11) を**積極適用**
- Repository は Aggregate Root 単位 (rule 12)
- concept-first task placement (rule 13) で directory を切る

**verify との連携**:
- `ui_state_model_tier: null` (UI では無いので)
- `verify_profile_ref` は `state-transition` / `boundary` / `property` のいずれか
- mutation_floor は通常 75 以上 (domain なので厳密)

**チェック必須項目**:
- Command/Pure/ReadModel 分類が全クラスに明示されているか
- throw の代わりに Result<T, E> を返しているか
- switch/if-else でのビジネスロジック分岐がないか (Interface + 実装へ)

---

## ui-pending-object

**適用条件**:
- React/Next.js の UI component で state を持つもの
- useState が 3-8 個、または action が 3 種以上
- form / wizard / editor など状態遷移が明確な UI

**適用ルール**:
- required invariants 5 個
- default heuristics 16 個 (一部 UI 固有の緩和あり、`language-relaxations.md` 参照)
- **UI State Rules L3**: Tier B (Pending Object) を基本、条件次第で C (State Machine) へ昇格
- **`actionPreconditions` export 必須** (verify contract、絶対)

**verify との連携**:
- `ui_state_model_tier: B` が基本 (C に昇格する場合は promotion heuristic 参照)
- `verify_profile_ref` は `state-transition` (主) + `model` (補助)
- mutation_floor は 70-75 (UI なので flake を考慮)
- **`verify_contract_required: true`** (actionPreconditions を verify が再利用)

**チェック必須項目**:
- `actionPreconditions` が export されているか (未 export は contract 違反)
- reducer が precondition 違反時に throw しているか
- Tier 昇格条件 (state > 8 / guards > 3 / parallel) を満たしたら tier_graduated を提案

---

## legacy-touchable

**適用条件**:
- 6 か月以上前に書かれた既存コード
- 触る必要が発生したが、全面リファクタは避けたい
- テストが 20 ケース未満 (verify contract を一気に増やせない)

**適用ルール**:
- required invariants の中でも **Result 型 / イミュータブル**のみ厳密
- 3 分類・完全コンストラクタ・switch 禁止は **soft warning**(violation を報告するが block しない)
- default heuristics はすべて **advisory**(推奨するが強制しない)
- concept-first task placement は適用せず、既存 directory 構造を尊重

**verify との連携**:
- `ui_state_model_tier: null` (touched legacy は tier 判定外)
- `verify_profile_ref` は既存に合わせる (新規 property は追加しない、回帰テストのみ)
- mutation_floor は touched file の既存値を維持 (下げない・上げない)
- `verify_contract_required: false`

**段階的浸透ルール** (軍師 6R):
- 直近 30 日 commit が 13+ 回の file は legacy-touchable 適用不可 → domain-strict に昇格検討
- 新規追加メソッドだけ L1+L2 を適用 (既存メソッドは触らない)

---

## integration-thin

**適用条件**:
- 外部 API を呼ぶ bridge layer
- DTO (Data Transfer Object) のみ扱うクラス
- migration script / seed data loader

**適用ルール**:
- required invariants のうち **3 分類 (Command が主)** と **Result 型** のみ厳密
- 完全コンストラクタは緩和 (外部 API の都合で後から fill するケースを許容)
- switch 禁止は緩和 (外部 API のバージョン判定等は許容)
- イミュータブル / Primitive Obsession / Repository ルールは非適用

**verify との連携**:
- `ui_state_model_tier: null`
- `verify_profile_ref` は `boundary` か `metamorphic` (contract test 中心)
- mutation_floor は 60-65 (integration なので網羅は難しい)
- L5 smoke E2E を fallback に指定

---

## lang-relaxed-go-rust

**適用条件**:
- Go / Rust / Python で書かれたコード
- 言語の型システムや慣習により上位ルールが自然に守られる場合

**適用ルール**:
- required invariants 5 個はすべて適用、ただし以下を緩和:
  - **Result 型**: Go は `(T, error)` pair、Rust は `Result<T, E>` 標準、Python は `tuple[T, None] | tuple[None, E]` を許容
  - **完全コンストラクタ**: Go は init 後の mutation 一部許容 (struct field)、Rust は所有権で保証
- default heuristics は以下を緩和:
  - **Interface 優先**: Rust は trait、Go は interface で同義、Python は duck typing 許容
  - **引数 1-2 個**: Go/Rust は struct 引数でまとめる、Python は keyword args 許容
  - **Primitive Obsession 回避**: Go は type alias で代替、Rust は newtype pattern、Python は NewType

**非適用**:
- Pending Object Pattern (React 特化なので)
- concept-first task placement は適用 (言語に関係なく有効)

**言語別詳細**は `language-relaxations.md` を読む。

---

## profile 選定 decision tree

`/takumi` が未指定で呼び出された場合の推定フロー:

```
1. 対象 file の言語は?
   └─ Go / Rust / Python → lang-relaxed-go-rust へ (以降の判定はこの枠内)

2. layer は何?
   ├─ ui → ui-pending-object (state ありなら Tier B 以上)
   ├─ domain → 3. へ
   ├─ api / data → integration-thin (外部統合主体なら)
   └─ (不明) → 対話で確認

3. code age は?
   ├─ 新規 or 30 日以内 → domain-strict
   ├─ 半年以上前 + 20 ケース未満の test → legacy-touchable
   └─ 半年以上前 + 十分 test あり → domain-strict (既存でも強化可)

4. 最終チェック:
   - business_criticality = critical (決済/認証/データ破損) なら
     legacy-touchable でも required invariants は hard 適用に昇格
```

## profile 追加ルール

6 個目の profile を追加したくなった場合:
- 軍師 警告: 「profile 数 3-5 に絞る」を遵守
- まず既存 5 profile での celah を特定
- 1 か月運用してから追加判断
- `.takumi/quality-state.md` に追加経緯を記録

---

## 関連リソース

| file | 用途 |
|---|---|
| `SKILL.md` (同ディレクトリ) | 本 skill entry point |
| `rules-core.md` (同ディレクトリ) | L1 / L2 / L3 の目次 |
| `rules-required.md` (同ディレクトリ) | L1 required invariants 5 個 |
| `rules-heuristics.md` (同ディレクトリ) | L2 default heuristics 16 個 |
| `rules-ui-state.md` (同ディレクトリ) | Tier 詳細、ui-pending-object で参照 |
| `language-relaxations.md` (同ディレクトリ) | lang-relaxed-go-rust で参照 |
| `../SKILL.md` | `/takumi` が refactor_profile_ref を自動推定 |
