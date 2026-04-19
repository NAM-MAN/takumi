# /takumi の 100 点統合版 接続ガイド

`/takumi` 本体(`SKILL.md`)から参照される補助ドキュメント。新規 skill (`/test-strategy-oracle` / `/design`) と telemetry との接続を記述する。

## /test-strategy-oracle 連携

各 task の `verify_profile_ref` は `/test-strategy-oracle` で決定する。/takumi は task 生成時に以下の擬似呼出を行う:

```
for ac in task.ac_ids:
  result = /test-strategy-oracle invoke with {
    ac_id, ac_text, ac_class?, context: {layer, risk, project_mode}
  }
  task.verify_profile_ref = result.verify_profile_ref
```

`ac_class` が明示されていれば archetype 直引き (A ルート)、未指定ならキーワード推論 (B)、
曖昧なら 軍師 判定 (C) にフォールバック。詳細は `~/.claude/skills/test-strategy-oracle/SKILL.md`。

## /design 連携 (ui/mixed のみ)

Step 0d で生成済みの design artifact (`.takumi/design/`) から `design_profile_ref` を task に埋める:

- screen が dashboard 系 → `design_profile_ref: dashboard-dense`
- screen が list + detail → `design_profile_ref: list-standard`
- screen が form 中心 → `design_profile_ref: form-heavy`
- screen が landing → `design_profile_ref: landing`

project 固有 profile を `.takumi/profiles/design/*.yaml` に追加している場合は、そちらを優先。

## frontmatter 肥大化防止 (reference-first)

軍師 判定で「task frontmatter 50+ 行は破綻」と警告あり。遵守ルール:

- task 行数の平均は **20 行以下** (ac_ids / verify_profile_ref / design_profile_ref / mutation_tier + 本文)
- profile 本体の上書きは `task.verify_profile_override: {...}` のような差分だけ
- **override 率 30% 超えたら defaults 再設計** (telemetry で監視)

## telemetry 連携 (儀式化 drift 検出)

task 作成時に `.takumi/telemetry/profile-usage.jsonl` に `task_created` event を emit:

```json
{
  "ts": "2026-04-19T12:00:00Z",
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

詳細 schema は `~/.claude/skills/takumi/telemetry-spec.md` と補助の `telemetry-schema.md`。
週次レポートで「profile 起因 gate failure 率 < 10% が 4 週」を検出したら儀式化 drift 警告。

## 採用前に決める閾値 (軍師 指定)

| 閾値 | 推奨値 |
|------|--------|
| mutation_floor | task 65-70% / epic 80% |
| layout_strictness | L7 hard gate 5-7 項目、soft FP < 5% |
| auto_ref_site 更新 | 30-45 日 |
| design_drift 粒度 | screen × primary_action 単位 |
| loop min/max | min 15 分 / max 72 時間 |

## 関連リソース

| skill / file | 用途 |
|---|---|
| `~/.claude/skills/takumi/SKILL.md` | 本体 (entry point) |
| `~/.claude/skills/takumi/design/README.md` | IA / style-guide / wireframe 生成 (ui/mixed) |
| `~/.claude/skills/test-strategy-oracle/SKILL.md` | AC-ID → verify_profile 選定 |
| `~/.claude/skills/takumi/telemetry-spec.md` | 儀式化 drift 検知の telemetry spec |
| `~/.claude/skills/takumi/verify/README.md` | L1-L6 + recipe library |
| `~/.claude/skills/test-strategy-oracle/profiles-defaults/*.yaml` | 5 archetype defaults |
| `~/.claude/skills/takumi/design/profiles-defaults/*.yaml` | 4 design profile defaults |
| `.takumi/profiles/{verify,design}/*.yaml` | project 側 profile 本体 |
| `.takumi/telemetry/profile-usage.jsonl` | event log (append-only) |
