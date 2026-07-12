# strict-refactoring: Core Rules (L1 + L2) — 目次

本 skill (`SKILL.md`) から参照される設計制約ルールの**目次とポインタ**。規模の都合で L1 / L2 / UI state を 3 本に分離している。

---

## Level 1 — Required Invariants (5 個、hard gate)

profile を問わず全 project で必須。詳細は **`rules-required.md`**。

1. 3 分類 (Command / Pure / ReadModel)
2. 完全コンストラクタ
3. ドメイン層で switch / if-else 分岐禁止
4. イミュータブル
5. Result 型でドメインエラー表現

## Level 2 — Default Heuristics (16 個、4 カテゴリ、strictness L1+L2 以上)

詳細は **`rules-heuristics.md`**。カテゴリ一覧:

- **structure** (10 個) — ファイル構造、責務分離、表面積最小化 (Rule 16 = SMD、詳細 `smd.md`)、**Immutable First 3 層** (Rule 17/18/20、詳細 `immutable-first.md`)、**Behavior Carrier** (Rule 19/21、詳細 `behavior-carrier.md`)

> **carrier 既定** (Rule 19/21、頻出ホットパス): 操作 `do X to Y` の carrier は **①層の既定 (prior) → ②4 力で裁定 → ③構文** の 3 段。**層既定** = domain:method/SVO・app/変換:function・infra:class-DI|closure(層内一貫)・UI:hook (global function-first も class-first も誤り、層が未分化なら 4 力で直接裁定)。**4 力** = {invariant-owner / shared-resource / polymorphism / framework-lifecycle}、判定軸は state/identity でない。**構文** (class / closure / struct+impl) は層の一貫性で別途 (class 強制でない)。実行カード = `behavior-carrier.md` §0。
- **api-shape** (3 個) — 関数シグネチャ、export 境界
- **testability** (2 個) — テスト容易性、DI
- **layout** (1 個) — テスト命名 (Rule 14、verify/spec-tests.md が継承)

## Level 3 — UI State Rules (React 限定、strictness L1+L2+L3)

詳細は **`rules-ui-state.md`**。Tier A (useState) → B (Pending Object) → C (State Machine) → D (Event Sourcing) の昇格ルール。

## 横断規律 — AI-first Brevity (生成時、strictness 非依存)

詳細は **`ai-brevity.md`**。Rule 16 (SMD) の**生成時の姉妹**。職人がコードを書く瞬間の冗長 (B1-B5: 過剰防御 / 再記述 / 早すぎる抽象 / what コメント / 過剰 error 包み) を断つ。`correctness > 関心の分離 > safety contract > brevity` の最下位に token 経済を足すだけで、上位を削らない。dispatch prompt に制約として接続。

---

## strictness 別の適用度

| 項目 | L1 | L1+L2 | L1+L2+L3 |
|---|---|---|---|
| Required Invariants (5 個) | ✓ hard | ✓ hard | ✓ hard |
| Default Heuristics (16 個) | - | ✓ | ✓ |
| UI State Rules (React) | - | - | ✓ (`rules-ui-state.md`) |

## profile × hard/soft

詳細は `review-checklist.md` の適用マトリクスを参照。`legacy-touchable` では soft warning が多数、`domain-strict` では全て hard。

---

## 関連リソース

| file | 用途 |
|---|---|
| `SKILL.md` (同ディレクトリ) | 本 skill entry point |
| `rules-required.md` (同ディレクトリ) | L1 の 5 個の詳細 |
| `rules-heuristics.md` (同ディレクトリ) | L2 の 16 個の詳細 |
| `smd.md` (同ディレクトリ) | Rule 16 (macro Surface Minimization) の実装 recipe |
| `ai-brevity.md` (同ディレクトリ) | 生成時の冗長を断つ横断規律 (Rule 16 の姉妹、token 経済) |
| `immutable-first.md` (同ディレクトリ) | Rule 17/18/20 (Immutable First: how to write statements) の実装 recipe |
| `behavior-carrier.md` (同ディレクトリ) | Rule 19/21 + 17-D (how to structure operations) の実装 recipe |
| `rules-ui-state.md` (同ディレクトリ) | L3 (React UI state) |
| `profiles.md` (同ディレクトリ) | 5 profile の詳細、適用条件 |
| `verify-contracts.md` (同ディレクトリ) | Tier → verify archetype 対応 |
| `language-relaxations.md` (同ディレクトリ) | Go / Rust / Python の緩和 |
| `review-checklist.md` (同ディレクトリ) | 実装完了時の評価 checklist |
