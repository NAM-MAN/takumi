# strict-refactoring: Review Checklist

本 skill (`SKILL.md`) から参照される評価 checklist。実装 worker が完了時、または takumi の probe mode (refactor 観点) / code review 時に適用する。普段 (`/takumi` の計画生成時) は読み込まない。

profile と strictness に応じて適用する項目が変わる。全項目を一律適用しない。

---

## 適用マトリクス

| checklist 項目 | domain-strict | ui-pending-object | legacy-touchable | integration-thin | lang-relaxed |
|---|:---:|:---:|:---:|:---:|:---:|
| **L1: Required Invariants** | | | | | |
| 3 分類 (Command/Pure/ReadModel) | ✓ hard | ✓ hard | △ soft | ✓ hard (Command 主) | ✓ hard |
| 完全コンストラクタ | ✓ hard | ✓ hard | △ soft | - | ✓ hard |
| switch/if-else 禁止 | ✓ hard | ✓ hard | △ soft | - | ✓ hard |
| イミュータブル | ✓ hard | ✓ hard | ✓ hard | ✓ hard | ✓ hard |
| Result 型 | ✓ hard | ✓ hard | ✓ hard | ✓ hard | ✓ (言語緩和) |
| **L2: Default Heuristics** | | | | | |
| Early Return | ✓ | ✓ | advisory | ✓ | ✓ |
| 引数 1-2 個 | ✓ | ✓ | advisory | ✓ | ✓ (言語緩和) |
| 名前付き戻り値 | ✓ | ✓ | advisory | ✓ | ✓ |
| Primitive Obsession 回避 | ✓ | ✓ | advisory | - | ✓ (言語緩和) |
| Interface 優先 | ✓ | ✓ | advisory | ✓ | ✓ (言語緩和) |
| Pending Object Pattern | ✓ | n/a (UI 側) | - | - | - |
| Repository = Aggregate Root | ✓ | - | advisory | - | ✓ |
| concept-first task placement | ✓ | ✓ | - (既存構造尊重) | ✓ | ✓ |
| テスト命名 | ✓ | ✓ | advisory | ✓ | ✓ |
| External Resource は引数 | ✓ | ✓ | advisory | ✓ | ✓ |
| **L3: UI State Rules** | | | | | |
| Tier 判定 | n/a | ✓ hard | n/a | n/a | n/a |
| actionPreconditions export (Tier B) | n/a | ✓ **contract** | n/a | n/a | n/a |
| machine 分離 (Tier C) | n/a | ✓ hard | n/a | n/a | n/a |
| applyEvent pure export (Tier D) | n/a | ✓ hard | n/a | n/a | n/a |

凡例:
- ✓ hard: 違反で block
- ✓: 違反で warning、fix 推奨
- △ soft: warning のみ、block しない
- advisory: 参考情報、report のみ
- contract: 絶対壊せない (軍師 判定)
- n/a: 非適用

---

## 評価フロー

### 1. task frontmatter を読む

```yaml
refactor_profile_ref: "ui-pending-object"
strictness: "L1+L2+L3"
ui_state_model_tier: "B"
verify_contract_required: true
```

### 2. 該当 profile 列を checklist から取り出す

上記表の `ui-pending-object` 列の項目を対象に評価。

### 3. 各項目を変更ファイルに対して判定

各 check は静的解析 + AI 判断のハイブリッド:
- 3 分類 → ファイル名 / クラス名 / メソッド命名から推論
- actionPreconditions export → `export const actionPreconditions` の grep + 参照側 import 確認
- 引数 1-2 個 → AST で関数定義のパラメータ数 count
- Primitive Obsession → プリミティブ型の頻出を確認、value object 候補を提案

### 4. 違反を集約

```yaml
refactor_review_completed:
  task_id: T-042
  profile: "ui-pending-object"
  strictness: "L1+L2+L3"
  violations:
    - rule: "actionPreconditions-export"
      severity: "contract"    # hard / soft / advisory / contract
      file: "src/features/note/reducer.ts"
      line: 42
      message: "actionPreconditions が export されていない (Tier B contract 違反)"
    - rule: "primitive-obsession"
      severity: "soft"
      file: "src/features/note/types.ts"
      line: 8
      message: "Money を number で扱っている、value object 化推奨"
  summary:
    hard_violations: 0
    contract_violations: 1
    soft_violations: 1
    advisory: 0
```

### 5. gate 判定

- `contract_violations > 0` → **wave gate 失敗** (block)
- `hard_violations > 0` → **wave gate 失敗** (block)
- `soft_violations > 0` → warning、レポートのみ
- `advisory > 0` → 無視 or 次 iteration の候補

### 6. telemetry emit

`refactor_review_completed` を `.takumi/telemetry/profile-usage.jsonl` に append。

---

## Tier 昇格判定 (promotion heuristic)

ui-pending-object で UI state を持つ場合、以下のいずれかを満たしたら上位 Tier 昇格を提案:

| from | to | 条件 |
|---|---|---|
| A | B | useState が 3 個超 or action 相当が 3 種超 |
| B | C | state 数 > 8 or guards > 3 or parallel regions 必要 |
| C | D | event 数 > 20 or undo/redo 必要 or audit 要件あり |

昇格を提案する形:
```yaml
tier_graduation_proposed:
  task_id: T-042
  from: "B"
  to: "C"
  reasons:
    - "state 数が 10 に達した"
    - "guard 条件が 4 種あり"
  effort_estimate: "2-4h"
  risk: "medium"
```

人間承認を経て `tier_graduated` event を emit。

---

## Advisory 項目 (違反しても block しない)

以下は参考情報。takumi の probe mode (refactor 観点) で定期的に棚卸:

- Early Return 徹底 (else が連続するコード)
- 関数の行数 (50 行超)
- クラスのメソッド数 (10 超)
- Nested ternary (3 段以上)
- comment が古い (コードと齟齬)

これらは `refactor_review_completed.advisory[]` に含めて report のみ。

---

## Checklist の運用ルール

1. **全項目を一律適用しない**: profile 列に従う
2. **contract 違反は 0 にする**: 特に actionPreconditions export
3. **soft warning が蓄積したら見直す**: 5 件超で profile 再選定
4. **advisory は棚卸候補**: 月次の probe mode (refactor 観点) で整理

---

## 関連リソース

| file | 用途 |
|---|---|
| `SKILL.md` (同ディレクトリ) | 本 skill entry point |
| `profiles.md` (同ディレクトリ) | profile 選定ロジック |
| `rules-core.md` (同ディレクトリ) | L1 / L2 / L3 の目次 |
| `rules-required.md` (同ディレクトリ) | L1 required invariants 5 個 |
| `rules-heuristics.md` (同ディレクトリ) | L2 default heuristics 14 個 |
| `rules-ui-state.md` (同ディレクトリ) | L3 / Tier 詳細 |
| `verify-contracts.md` (同ディレクトリ) | actionPreconditions contract |
| `~/.claude/skills/takumi/telemetry-spec.md` | `refactor_review_completed` event |
