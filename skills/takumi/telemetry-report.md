# Telemetry: 週次レポート + 可視化

本体(`telemetry-spec.md`)から参照される補助ドキュメント。週次レポートの雛形と、
補助指標の詳細、DuckDB / SQLite / Grafana への可視化マッピングを記述。

## 週次レポート `weekly-report-{YYYY}-W{WW}.md`

毎週月曜に自動生成する想定。全 team が読める場所に置く (project root か `.takumi/telemetry/`)。

### 雛形

```markdown
# Profile Usage Weekly Report — Week {WW} of {YYYY}

対象期間: {yyyy-mm-dd} 〜 {yyyy-mm-dd}

## 付帯率
- profile 付き task 数: {N}
- 全 task 数: {M}
- 付帯率: {N/M * 100}%

## Gate Failure 分析
- gate failure 総数: {F}
- うち profile 項目起因 (failure_source = profile_item): {P}
- **profile 起因率**: {P/F * 100}%  ← 儀式化 drift 検出の主指標
- 4 週間移動平均: {avg}%

### profile 起因 failure の内訳
| profile_item | 回数 | 該当 task 数 |
|---|---|---|
| mutation_floor | {n} | {t} |
| layout.hard.container | {n} | {t} |
| layers | {n} | {t} |
| ... | ... | ... |

## Mutation Score 分布
| tier | 平均 score | 中央値 | 最低 | 最高 | task 数 |
|------|-----------|--------|------|------|---------|
| critical | {avg} | {med} | {min} | {max} | {n} |
| standard | {avg} | {med} | {min} | {max} | {n} |
| low | {avg} | {med} | {min} | {max} | {n} |

## 警告行

{移動平均 < 10% が N 週続いていれば警告。詳細は telemetry-spec.md の escalation}

- Week 1: watch (移動平均 {x}%)
- Week 2: soft warning (移動平均 {x}%)
- Week 3: hard warning (移動平均 {x}%)
- **Week 4: RITUALIZATION DRIFT DETECTED** — 設計見直し推奨

## 補助指標

- **task 作成時間 (分) 平均**: {min} (前週比 {±x})
- **profile override 率**: {x}% (30% 超なら defaults 再設計推奨)
- **gate 通過率**: {x}%
- **false positive 率**: {x}% (人間が "誤検知" とフラグした割合)

## 軍師 自動呼出 (W=4 時のみ)

儀式化 drift が 4 週続いた場合、軍師 (codex exec gpt-5.4) に以下を問い合わせ:

> profile item (verify_profile_ref / design_profile_ref) と実際の gate failure が過去 4 週で乖離している。
> 考えられる原因と、profile/defaults の修正案を挙げよ。

軍師 の回答は `.takumi/telemetry/oracle-suggestions-{YYYY-WW}.md` に保存。
```

---

## 補助指標 4 種の詳細

### 1. task 作成時間 (分)

**定義**: `/takumi` interview 開始〜task 確定 (plan.md に書き込み完了) までの所要時間。

**emit タイミング**: `/takumi` が task 完成時、`task_created` event に `authoring_sec` field として含む。

**閾値**:
- 通常: 5-10 分 / task
- **1.5-2 倍 (15-20 分) になると現場が plan をバイパスする**(軍師 警告)

### 2. profile override 率

**定義**: task 作成時に defaults から `verify_profile_override` や `design_profile_override` で差分を指定した task の割合。

**emit タイミング**: `profile_overridden` event として emit。

**閾値**:
- 通常: 5-15%
- **30% 超えたら defaults が project 実態と合っていない → defaults 再設計**

### 3. gate 通過率

**定義**: wave gate を通過した task の割合。失敗を除く。

**emit タイミング**: `gate_passed` / `gate_failed` event の集計。

**閾値**:
- 通常: 85-95%
- 95% 超: gate が緩すぎる (mutation_floor 見直し)
- 85% 未満: gate が厳しすぎる or AI 実装品質低下

### 4. false positive 率

**定義**: gate failure のうち、人間が「誤検知」とフラグしたものの割合。

**emit タイミング**: `gate_false_positive_flagged` event として emit。

**閾値**:
- 軍師 推奨: **< 5%**
- 5% 超: L7 hard gate または mutation gate の基準を見直す

---

## 可視化 mapping

### DuckDB 1 行クエリ

`.takumi/telemetry/profile-usage.jsonl` を DuckDB で即席集計:

```bash
# 今週の付帯率
duckdb -c "SELECT COUNT(*) FILTER (WHERE verify_profile_ref IS NOT NULL) * 100.0 / COUNT(*) AS attach_rate FROM read_json('.takumi/telemetry/profile-usage.jsonl') WHERE event='task_created' AND ts > current_date - INTERVAL 7 DAYS"

# profile 起因率 (儀式化 drift 検出)
duckdb -c "SELECT COUNT(*) FILTER (WHERE failure_source='profile_item') * 100.0 / COUNT(*) AS profile_caused_rate FROM read_json('.takumi/telemetry/profile-usage.jsonl') WHERE event='gate_failed' AND ts > current_date - INTERVAL 7 DAYS"
```

### SQLite インポート

長期保管用。月次でローテ:

```bash
sqlite3 .takumi/telemetry/profile-usage.db <<SQL
CREATE TABLE IF NOT EXISTS events (
  ts TEXT,
  event TEXT,
  task_id TEXT,
  verify_profile_ref TEXT,
  design_profile_ref TEXT,
  gate_type TEXT,
  failure_source TEXT,
  profile_item TEXT,
  details JSON
);
-- jsonl 取込は Python や duckdb 経由で
SQL
```

### Grafana / Datadog mapping

log-based metrics として:

| メトリック名 | field / filter |
|---|---|
| `profile.attach_rate` | `event="task_created"` の `verify_profile_ref IS NOT NULL` 比率 |
| `profile.caused_failure_rate` | `event="gate_failed"` の `failure_source="profile_item"` 比率 |
| `mutation.score` | `event="mutation_measured"` の `score` (tier でラベル) |
| `layout.hard_violation` | `event="layout_checked"` の `hard_violations_count` |
| `task.authoring_sec` | `event="task_created"` の `authoring_sec` |

ダッシュボードは以下を並べる:
- 付帯率 (週次折れ線)
- profile 起因率 (4 週移動平均、閾値 10% に horizontal line)
- mutation score 分布 (tier 別ヒストグラム)
- gate 通過率 (日次)
- false positive 率 (週次)

## 関連リソース

| file | 用途 |
|---|---|
| `telemetry-spec.md` (同ディレクトリ) | 本体 entry point |
| `telemetry-schema.md` (同ディレクトリ) | 7 種 event の完全 JSON schema |
| `SKILL.md` (同ディレクトリ) | `/takumi` 本体 |
| `integrations.md` (同ディレクトリ) | 100 点統合版の新 skill 連携 |
