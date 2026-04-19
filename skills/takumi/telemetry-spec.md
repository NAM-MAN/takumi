# Profile Drift Telemetry: 儀式化 drift 検出仕様

`verify_profile_ref` / `design_profile_ref` を必須化した後の最大のリスクは
**儀式化 drift**(profile は存在するが、実装と運用がそれを参照していない状態)。
軍師 (gpt-5.4) は「6 ヶ月後に最も危険な失敗モード」として以下を提示した:

> `profile 付き task のうち gate failure が profile 項目に起因した割合`
> が **10% 未満の状態が 4 週続く** = profile が飾りになっているサイン

この仕様書は、早期検出に必要な telemetry を**どこに / 何を / いつ書くか**を定義する
エントリポイント。schema 詳細は `telemetry-schema.md`、週次レポートと可視化は
`telemetry-report.md` を参照。

---

## 1. 出力先とフォーマット

| 項目 | 値 |
|------|-----|
| パス | `.takumi/telemetry/profile-usage.jsonl` |
| フォーマット | JSON Lines (1 event = 1 行) |
| モード | append-only(既存行の書き換え禁止) |
| ローテーション | `profile-usage-{YYYY-MM}.jsonl` に月次アーカイブ |
| 文字コード | UTF-8, LF |

append-only を徹底する理由: `git blame` 的に「いつ / 誰が / 何を判断したか」が
時系列で追跡できること。後からの書き換えは drift 検出自体を歪める。

### 書き込みルール

```
{"ts":"2026-04-19T12:34:56Z","event":"task_created", ... }
{"ts":"2026-04-19T12:40:02Z","event":"gate_failed", ... }
```

- 各行は valid な JSON object
- 改行は LF のみ
- event は時刻順に append(並び替え禁止)
- `ts` は ISO 8601 UTC、ミリ秒省略可

---

## 2. emit タイミング(誰が何を書くか)

| Emitter | タイミング | event |
|---------|-----------|-------|
| `/takumi` | task 作成確定時 | `task_created` |
| `/takumi` | profile override 時 | `profile_overridden` |
| `/exec` | wave gate 通過時 | `gate_passed` |
| `/exec` | wave gate 失敗時 | `gate_failed` |
| `/verify` | mutation score 測定時 | `mutation_measured` |
| `/design` | L7 Layout Invariant チェック時 | `layout_checked` |
| 人間 | gate failure を誤検知と判断した時 | `gate_false_positive_flagged` |

各コマンドは終了直前に telemetry を flush する。途中クラッシュで event が
欠落するのは許容(完全性より可用性を優先)。

---

## 3. 7 種 event 一覧

全 event に共通する header:

```json
{
  "ts": "2026-04-19T12:34:56Z",
  "event": "<event_type>",
  "task_id": "T-042",
  "ac_ids": ["AC-AUTH-002"],
  "verify_profile_ref": "state-transition",
  "design_profile_ref": "dashboard-dense"
}
```

`verify_profile_ref` / `design_profile_ref` が未付帯の task は `null` を明示する
(欠損は付帯率の分母から外すが、drift 検出対象には入れる)。

| # | event | 1 行説明 |
|---|-------|---------|
| 3.1 | `task_created` | /takumi で task 確定時。profile_ref 付帯率の原資料 |
| 3.2 | `profile_overridden` | default profile を上書きした履歴。override 率の算定に使用 |
| 3.3 | `gate_passed` | wave gate 通過。mutation / l7 / build / test / oracle_review 等 |
| 3.4 | `gate_failed` | wave gate 失敗。**最重要** — `failure_source` で drift を判定 |
| 3.5 | `mutation_measured` | gate 判定と独立に測定事実を記録(trend 分析用) |
| 3.6 | `layout_checked` | L7 Layout Invariant の hard / soft 違反と snapshot 参照 |
| 3.7 | `gate_false_positive_flagged` | 人間が `gate_failed` を誤検知と判定した補正 event |

各 event の完全な JSON schema と `failure_source` 判定ルールは
`telemetry-schema.md` を参照。

---

## 4. 警告の escalation フロー

```
W=0 (healthy) ───────── 何もしない
     │
     │ 移動平均 < 10% 初検知
     ▼
W=1 (watch) ──────────  レポート注記のみ
     │
     │ 次週も < 10%
     ▼
W=2 (soft warning) ──── 直近 merge PR にコメント、計画の default profile 確認を促す
     │
     │ 次週も < 10%
     ▼
W=3 (hard warning) ──── Slack/通知、/sweep の次回実行時に telemetry 観点を差し込む
     │
     │ 次週も < 10%  ← 軍師 警告ライン
     ▼
W=4 (ritualization drift) ─ 設計見直し推奨、軍師 に root cause 分析を依頼
```

### 儀式化 drift 閾値

4 週移動平均が 10% を切った状態の継続週数 `W` に応じて:

| W | prefix | 行動 |
|---|--------|------|
| 0 | なし | 正常 |
| 1 | `WATCH:` | レポート末尾に注記 |
| 2 | `SOFT WARNING:` | 直近 PR にコメント |
| 3 | `HARD WARNING:` | Slack / 通知チャンネル |
| 4+ | `RITUALIZATION DRIFT:` | 設計見直し推奨、/takumi の default profile 再選定を提案 |

軍師 分析の呼び出し(W=4 到達時に自動):

```bash
codex exec -m gpt-5.4 -s read-only -C "$(pwd)" \
  ".takumi/telemetry/profile-usage.jsonl の直近 4 週を分析し、
   profile が実質機能していない理由を 3 つの仮説で提示せよ。
   各仮説に対する検証アクションも。" 2>&1 | tail -100
```

---

## 5. 補助指標(drift の先行指標)

| # | 指標 | 一行説明 |
|---|------|---------|
| 5.1 | task 作成時間 | /takumi interview の所要時間。機械的選定 / bypass 兆候の検出 |
| 5.2 | profile override 率 | default を上書きした task 割合。default 再設計の判断材料 |
| 5.3 | gate 通過率 | `gate_passed / (gate_passed + gate_failed)`。甘すぎ / bypass の検出 |
| 5.4 | false positive 率 | `gate_false_positive_flagged / gate_failed`。gate 精度の指標 |

閾値と解釈の詳細は `telemetry-report.md` の「補助指標」セクションを参照。

---

## 6. 導入チェックリスト

- [ ] `.takumi/telemetry/` ディレクトリを `.gitignore` に追加(個別判断)
- [ ] `/takumi` に `task_created` emit を追加
- [ ] `/exec` に `gate_passed` / `gate_failed` emit を追加
- [ ] `/verify` に `mutation_measured` emit を追加
- [ ] `/design` に `layout_checked` emit を追加
- [ ] 週次レポート生成スクリプトを配置
- [ ] escalation フローの通知先設定(Slack webhook 等)
- [ ] 運用開始 4 週後に 軍師 で初回 drift チェック

---

## 7. FAQ

**Q: task に profile が付いていない場合、drift 分析に影響するか?**
A: `verify_profile_ref: null` の event も記録する。付帯率(profile が付いた
割合)は別指標として追跡。drift 分析は profile 付き task のみを対象とする。

**Q: 古い event を削除したい**
A: 削除しない。append-only が前提。月次アーカイブで物理的に分離するのみ。

**Q: profile_item の判定に迷う**
A: 迷ったら `profile_item` に倒す。過小評価を避けるため。誤検知は
`gate_false_positive_flagged` で後から補正できる。

**Q: 4 週移動平均は厳しすぎないか?**
A: 軍師 の指摘ライン。緩めると drift が顕在化した頃には
手遅れになる(負債として蓄積済み)。

---

## 関連リソース

| ファイル | 用途 |
|---------|------|
| `telemetry-schema.md` | 7 種 event の完全 JSON schema / `failure_source` 判定ルール詳細 |
| `telemetry-report.md` | 週次レポート雛形 / DuckDB・SQLite・Grafana 可視化 mapping |
| `SKILL.md` | /takumi skill 本体。telemetry emit 組み込みポイント |
| `self-multiplying.md` | 自己増殖型計画(drift 検知に基づく計画再生成) |
