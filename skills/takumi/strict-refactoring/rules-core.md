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

## Level 2 — Default Heuristics (10 個、4 カテゴリ、strictness L1+L2 以上)

詳細は **`rules-heuristics.md`**。カテゴリ一覧:

- **structure** (4 個) — ファイル構造、責務分離
- **api-shape** (3 個) — 関数シグネチャ、export 境界
- **testability** (2 個) — テスト容易性、DI
- **layout** (1 個) — テスト命名 (Rule 14、verify/spec-tests.md が継承)

## Level 3 — UI State Rules (React 限定、strictness L1+L2+L3)

詳細は **`rules-ui-state.md`**。Tier A (useState) → B (Pending Object) → C (State Machine) → D (Event Sourcing) の昇格ルール。

---

## strictness 別の適用度

| 項目 | L1 | L1+L2 | L1+L2+L3 |
|---|---|---|---|
| Required Invariants (5 個) | ✓ hard | ✓ hard | ✓ hard |
| Default Heuristics (10 個) | - | ✓ | ✓ |
| UI State Rules (React) | - | - | ✓ (`rules-ui-state.md`) |

## profile × hard/soft

詳細は `review-checklist.md` の適用マトリクスを参照。`legacy-touchable` では soft warning が多数、`domain-strict` では全て hard。

---

## 関連リソース

| file | 用途 |
|---|---|
| `SKILL.md` (同ディレクトリ) | 本 skill entry point |
| `rules-required.md` (同ディレクトリ) | L1 の 5 個の詳細 |
| `rules-heuristics.md` (同ディレクトリ) | L2 の 10 個の詳細 |
| `rules-ui-state.md` (同ディレクトリ) | L3 (React UI state) |
| `profiles.md` (同ディレクトリ) | 5 profile の詳細、適用条件 |
| `verify-contracts.md` (同ディレクトリ) | Tier → verify archetype 対応 |
| `language-relaxations.md` (同ディレクトリ) | Go / Rust / Python の緩和 |
| `review-checklist.md` (同ディレクトリ) | 実装完了時の評価 checklist |
