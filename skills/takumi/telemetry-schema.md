# Profile Drift Telemetry: Event Schema 詳細

`telemetry-spec.md` の 7 種 event の完全 JSON schema と、drift 検出の肝である
`failure_source` 判定ルールの詳細版。emit 実装時はこのファイルを参照する。

全 event に共通する header は `telemetry-spec.md` §3 を参照
(`ts` / `event` / `task_id` / `ac_ids` / `verify_profile_ref` / `design_profile_ref`)。

---

## 1. `task_created`

```json
{
  "ts": "2026-04-19T10:00:00Z",
  "event": "task_created",
  "task_id": "T-042",
  "ac_ids": ["AC-AUTH-002", "AC-AUTH-003"],
  "verify_profile_ref": "state-transition",
  "design_profile_ref": null,
  "interview_duration_sec": 312,
  "wave": 2
}
```

- `interview_duration_sec`: /takumi interview 開始〜task 確定までの所要時間
- `design_profile_ref: null`: UI を含まない task は null で良い

---

## 2. `profile_overridden`

```json
{
  "ts": "2026-04-19T10:01:15Z",
  "event": "profile_overridden",
  "task_id": "T-042",
  "ac_ids": ["AC-AUTH-002"],
  "verify_profile_ref": "state-transition",
  "design_profile_ref": null,
  "override_type": "verify",
  "base_profile": "default",
  "override_reason": "legacy code has no snapshot"
}
```

- `override_type`: `"verify"` | `"design"`
- `base_profile`: 本来 default で選ばれるはずだった profile
- `override_reason`: 人間が書いた自由記述(後で品質を読む)

---

## 3. `gate_passed`

```json
{
  "ts": "2026-04-19T12:34:56Z",
  "event": "gate_passed",
  "task_id": "T-042",
  "ac_ids": ["AC-AUTH-002"],
  "verify_profile_ref": "state-transition",
  "design_profile_ref": null,
  "gate_type": "mutation",
  "details": {
    "mutation_score": 0.82,
    "floor": 0.80
  }
}
```

`gate_type` の enum:

| 値 | 意味 |
|----|------|
| `mutation` | mutation score floor の判定 |
| `l7_hard` | L7 Layout Invariant の hard rule |
| `l7_soft` | L7 Layout Invariant の soft rule |
| `build` | tsc / build の通過 |
| `test` | unit / component test の通過 |
| `oracle_review` | 軍師 最終レビューの ok 判定 |

---

## 4. `gate_failed` (最重要)

```json
{
  "ts": "2026-04-19T12:40:02Z",
  "event": "gate_failed",
  "task_id": "T-042",
  "ac_ids": ["AC-AUTH-002"],
  "verify_profile_ref": "state-transition",
  "design_profile_ref": null,
  "gate_type": "mutation",
  "failure_source": "profile_item",
  "profile_item": "mutation_floor",
  "details": {
    "mutation_score": 0.71,
    "floor": 0.80,
    "surviving_mutants": 23
  }
}
```

### `failure_source` の判定ルール(drift 検出の肝)

| 失敗の性質 | failure_source | profile_item |
|-----------|---------------|--------------|
| mutation floor 未達 | `profile_item` | `"mutation_floor"` |
| L7 hard gate 違反(container はみ出し等) | `profile_item` | `"layout.hard.<rule_id>"` |
| L7 soft gate 違反(警告のみ) | `profile_item` | `"layout.soft.<rule_id>"` |
| verify profile 指定の PBT/Model-based 未配置 | `profile_item` | `"layers.<layer_id>"` |
| design profile 指定の token 未準拠 | `profile_item` | `"tokens.<token_id>"` |
| build error(型エラー、import エラー) | `other` | `null` |
| test flake(再実行で通る) | `other` | `null` |
| 環境起因(CI タイムアウト等) | `other` | `null` |

曖昧な case は `profile_item` に倒す(誤検知は後で人間が
`gate_false_positive_flagged` でフラグできる)。これにより drift ratio が
**過小評価されるバイアス**を防ぐ。

---

## 5. `mutation_measured`

```json
{
  "ts": "2026-04-19T12:20:00Z",
  "event": "mutation_measured",
  "task_id": "T-042",
  "ac_ids": ["AC-AUTH-002"],
  "verify_profile_ref": "state-transition",
  "design_profile_ref": null,
  "details": {
    "score": 0.82,
    "killed": 104,
    "survived": 23,
    "timeout": 1,
    "no_coverage": 0,
    "target_files": ["src/auth/state.ts"]
  }
}
```

gate の通過/失敗とは別に、**測定事実そのもの**を記録する
(後で trend 分析するため)。

---

## 6. `layout_checked`

```json
{
  "ts": "2026-04-19T11:50:00Z",
  "event": "layout_checked",
  "task_id": "T-042",
  "ac_ids": ["AC-UI-012"],
  "verify_profile_ref": null,
  "design_profile_ref": "dashboard-dense",
  "details": {
    "hard_violations": [],
    "soft_violations": [
      {"rule_id": "soft.density", "score": 0.62, "threshold": 0.70}
    ],
    "screenshot_ref": ".takumi/snapshots/T-042-hero.png"
  }
}
```

---

## 7. `gate_false_positive_flagged`

```json
{
  "ts": "2026-04-19T15:00:00Z",
  "event": "gate_false_positive_flagged",
  "task_id": "T-042",
  "ac_ids": ["AC-AUTH-002"],
  "verify_profile_ref": "state-transition",
  "design_profile_ref": null,
  "original_event_ts": "2026-04-19T12:40:02Z",
  "original_gate_type": "mutation",
  "flagged_by": "reviewer@example.com",
  "reason": "equivalent mutant、logical equivalent"
}
```

この event は**元の `gate_failed` を打ち消さない**。週次レポートで
`false_positive_rate` として別途集計するのみ。

---

## 関連リソース

| ファイル | 用途 |
|---------|------|
| `telemetry-spec.md` | 出力先 / emit タイミング / escalation / FAQ(エントリポイント) |
| `telemetry-report.md` | 週次レポート雛形 / 可視化 query(この schema を前提に集計) |
| `SKILL.md` | /takumi skill 本体 |
