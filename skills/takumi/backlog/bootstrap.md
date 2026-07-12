# Backlog bootstrap flow (内部仕様書)

> [!NOTE]
> `backlog-mode.md` から参照される source of truth。`mode == enabled` 確定時の bootstrap 4 step (mkdir / README copy / .gitignore / bootstrapped_at) を定義。bootstrap snippet 本体は `step0-bootstrap.md`「project.yaml.backlog セクション」節に実装済み。

## bootstrap が起きるタイミング

`BacklogGate.resolveMode()` が `enabled` を返した時のみ。具体的には:

| 起動状況 | 動作 |
|---|---|
| 初回 `/takumi` + Signal A (`.takumi/backlog/` 存在) | 既存 backlog を尊重、足りない `{open,doing,done}/` のみ作成、README は既存なら skip、`bootstrapped_at` は touch しない (preserve) |
| 初回 `/takumi` + 起票機会で「takumi backlog 使う」選択 | フル bootstrap (mkdir + README + .gitignore + bootstrapped_at) |
| `project.yaml.backlog.mode: enabled` を手動セット | 次回 `/takumi` 起動時に bootstrap 実行 (idempotent) |
| 再 `/takumi` (既に bootstrap 済) | 全 step が no-op (副作用ゼロ) |

## bootstrap の 5 step (実装は step0-bootstrap.md)

| step | 動作 | idempotent ガード |
|---|---|---|
| 1. mkdir | `.takumi/backlog/{open,doing,done}/` | `mkdir -p` は再実行安全 |
| 2. README copy | `templates/backlog-readme.md` → `.takumi/backlog/README.md` | `[ ! -f ... ]` で既存 skip |
| 3. .gitignore | bare `.takumi/` を `.takumi/*` に正規化 → `!.takumi/backlog/` 追記 (親除外で子再包含不能を回避、state/telemetry/env.yaml は除外維持。親 `!.takumi/` un-ignore は全体 leak のため使わない) | `grep -qE` で既存 skip |
| 4. bootstrapped_at | `project.yaml.backlog.bootstrapped_at` 初回のみ記入 | `null` チェック後のみ書き込み |
| 5. **fresh_bootstrap** | `project.yaml.backlog.fresh_bootstrap` を `true` に (migration トリガ用) | step 4 で `bootstrapped_at` を新規セットした時のみ true、preserve した時は false |

## bootstrap が **実行されない** ケース

| 状況 | 理由 |
|---|---|
| `mode: external` | silent 違反防止、全 step skip |
| `mode: unset` | 起票機会で `enabled` 確定するまで保留 |
| `mode: deferred` (期限内) | 30 日 cooldown 中は何もしない |
| CI 環境 + `mode: unset` | 非対話で proposals が出せないため bootstrap も実行しない |

## bootstrap 完了後の telemetry

```json
{ "ts": "...", "event": "backlog_bootstrap_completed", "fresh": true|false }
```

`fresh: true` = 初回 bootstrap (`bootstrapped_at` が null → 値セット)、`fresh: false` = 既に bootstrap 済 (再実行で副作用なし)。

## 失敗時の挙動

| step 失敗 | 対処 |
|---|---|
| mkdir 失敗 (permission denied) | bootstrap 全体を abort、ユーザーに警告 1 行 + 手動回復ガイド |
| .gitignore 書込失敗 | warning 1 行、bootstrap は continue (gitignore は手動修正で OK) |
| project.yaml 更新失敗 | abort、`yq` 不在 or yaml parse error を診断 |
| README copy 失敗 (skill template 不在) | warning 1 行、最小 README をその場で生成 |

abort 時は `BacklogGate` に「bootstrap unsuccessful, mode は unset として扱う」を通知、次回起動時に再試行。
