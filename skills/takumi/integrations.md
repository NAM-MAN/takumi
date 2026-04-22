# takumi の内部モード接続ガイド

`/takumi` 本体 (`SKILL.md`) から参照される補助ドキュメント。内部モード (test-strategy / design mode / verify 運用 / telemetry) の接続を記述する。これらはいずれも takumi の内部ロール / 内部モードであり、人間が直接叩く別コマンドは存在しない (対外コマンドは `/takumi` 1 つのみ、`natural-language.md` 参照)。

## test-strategy 連携 (AC-ID → verify_profile_ref)

各 task の `verify_profile_ref` は takumi 内部の test-strategy ロジックで決定する (`test-strategy.md` に詳細)。task 生成時に以下の擬似呼出を行う:

```
for ac in task.ac_ids:
  result = test-strategy.select({
    ac_id, ac_text, ac_class?, context: {layer, risk, project_mode}
  })
  task.verify_profile_ref = result.verify_profile_ref
```

`ac_class` が明示されていれば archetype 直引き (A ルート)、未指定ならキーワード推論 (B)、曖昧なら 軍師 判定 (C) にフォールバック。詳細は `test-strategy.md`。

## design mode 連携 (ui/mixed のみ)

Step 0d の design mode で生成済みの design artifact (`.takumi/design/`) から `design_profile_ref` を task に埋める:

- screen が dashboard 系 → `design_profile_ref: dashboard-dense`
- screen が list + detail → `design_profile_ref: list-standard`
- screen が form 中心 → `design_profile_ref: form-heavy`
- screen が landing → `design_profile_ref: landing`

project 固有 profile を `.takumi/profiles/design/*.yaml` に追加している場合は、そちらを優先。

## verify 運用連携 (USS 原則)

各 task の test 生成は USS (Unified Spec Test) イディオムに従う。詳細は `verify/spec-tests.md`:

- 1 unit = 1 test file (`{module}.test.ts`)、`.pbt.test.ts` / `.mutation.test.ts` 等の分割は禁止
- `it('{Subject} は {input} に対して {output} を返すべき')` の body 内部で PBT / metamorphic / commands を選ぶ
- 命名規約は strict-refactoring Rule 14 を継承

executor は task 実装中、職人 (Sonnet Agent) にこの原則を遵守させる。違反を検出したら `gate_failed` emit。

## frontmatter 肥大化防止 (reference-first)

軍師 判定で「task frontmatter 50+ 行は破綻」と警告あり。遵守ルール:

- task 行数の平均は **20 行以下** (ac_ids / verify_profile_ref / design_profile_ref / mutation_tier + 本文)
- profile 本体の上書きは `task.verify_profile_override: {...}` のような差分だけ
- **override 率 30% 超えたら defaults 再設計** (telemetry で監視)

## telemetry 連携 (儀式化 drift 検出)

task 作成時に `.takumi/telemetry/profile-usage.jsonl` に `task_created` event を emit:

```json
{
  "ts": "2025-01-01T12:00:00Z",
  "event": "task_created",
  "task_id": "T-042",
  "ac_ids": ["AC-AUTH-002"],
  "verify_profile_ref": "state-transition",
  "design_profile_ref": "dashboard-dense",
  "mutation_tier": "standard",
  "derivation_path": "A",
  "context": { "layer": "ui", "risk": "standard", "project_mode": "ui" }
}
```

詳細 schema は `telemetry-spec.md` と `telemetry-schema.md`。週次レポートで「profile 起因 gate failure 率 < 10% が 4 週」を検出したら儀式化 drift 警告。

## 採用前に決める閾値 (軍師 指定)

| 閾値 | 推奨値 |
|------|--------|
| mutation_floor | task 65-70% / epic 80% |
| layout_strictness | L7 hard gate 5-7 項目、soft FP < 5% |
| auto_ref_site 更新 | 30-45 日 |
| design_drift 粒度 | screen × primary_action 単位 |
| loop min/max | min 15 分 / max 72 時間 |

## 関連リソース

| file | 用途 |
|---|---|
| `~/.claude/skills/takumi/SKILL.md` | 本体 (entry point、対外コマンドは /takumi のみ) |
| `~/.claude/skills/takumi/natural-language.md` | 発話 → 6 mode 振り分けの辞書 |
| `~/.claude/skills/takumi/test-strategy.md` | AC-ID → verify_profile_ref 選定ロジック (takumi 内部) |
| `~/.claude/skills/takumi/design/README.md` | design mode 本体 (takumi 内部モード) |
| `~/.claude/skills/takumi/telemetry-spec.md` | 儀式化 drift 検知の telemetry spec |
| `~/.claude/skills/takumi/verify/README.md` | L1-L6 + recipe library |
| `~/.claude/skills/takumi/verify/spec-tests.md` | Unified Spec Test (USS) 原則、Rule 14 命名規約 |
| `~/.claude/skills/takumi/verify-profiles-defaults/*.yaml` | 5 archetype defaults |
| `~/.claude/skills/takumi/design/profiles-defaults/*.yaml` | 4 design profile defaults |
| `.takumi/profiles/{verify,design}/*.yaml` | project 側 profile 本体 |
| `.takumi/telemetry/profile-usage.jsonl` | event log (append-only) |
