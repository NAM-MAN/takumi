# Backlog AI 移動 + sync check (内部仕様書)

> [!NOTE]
> `backlog-mode.md` から参照される source of truth。発話 → move マッピングと `/takumi` 起動時の `gh pr view` best-effort sync ロジックを定義。

## AI 移動の発話 → move マッピング

`mode == enabled` 時のみ動作 (BacklogGate 経由必須)。

| 発話パターン | 動作 | frontmatter 更新 |
|---|---|---|
| 「BL-007 着手」「BL-007 やる」「BL-007 進める」 | `open/` → `doing/` | (なし) |
| 「BL-007 着手 PR#42」「BL-007 やる PR 42」 | `open/` → `doing/` + `pr` セット | `pr: 42` |
| 「BL-007 done」「BL-007 完了」「BL-007 shipped」 | `doing/` → `done/` | `outcome: shipped`, `closed_at: today`, `closed_by: manual` |
| 「BL-007 done PR#42」 | `doing/` → `done/` + PR 記録 | `outcome: shipped`, `closed_at`, `closed_by: PR#42`, `pr: 42` (未設定なら) |
| 「BL-007 wontfix 理由X」 | (任意状態) → `done/` | `outcome: wontfix`, `closed_at`, `closed_by: manual`, 本文に理由追記 |
| 「BL-007 supersed BL-012」「BL-007 superseded BL-012」 | (任意状態) → `done/` | `outcome: superseded:BL-012`, 本文に説明追記 |
| 「BL-007 block AC-AUTH-002 待ち」 | `doing/` のまま、blocked 化 | `blocked_by: AC-AUTH-002` (or 別 BL ID) |
| 「BL-007 block 解除」 | (移動なし) | `blocked_by: null` |
| 「BL-007 open に戻す」「BL-007 reopen」 | `done/` → `open/` | `outcome: null`, `closed_at: null`, `closed_by: null` |

## move の実装契約

1. **冪等**: 同じ発話を 2 回実行しても副作用 1 回分のみ
2. **整合性**: 移動前に `BacklogGate.resolveMode() == enabled` 確認
3. **frontmatter 更新は atomic**: ファイル move + frontmatter 書換が同 transaction (片方失敗で rollback)
4. **失敗時の出力**: 失敗理由をユーザーに 1 行で報告、`backlog/` 状態は変えない
5. **曖昧な発話は確認**: 「あれ進めて」等は「BL-### のことですか?」を 1 問

## sync check (`gh pr view` 連携) — best-effort

### 起動タイミング

`/takumi` セッション開始時に **1 回だけ** 実行 (`SKILL.md` Step 0e の延長):

- `BacklogGate.resolveMode() != enabled` → **完全 skip** (`external` は警告も telemetry も出さない)
- `mode == enabled` で `gh` 不在 → silent skip + log 1 行 (`enabled` 時のみ warning)
- `mode == enabled` で `gh` 利用可能 → sync 実行

### sync ロジック

```
function syncCheck() {
  if (BacklogGate.resolveMode() !== 'enabled') return;  // silent
  if (!commandExists('gh')) {
    log('gh CLI 不在、sync check skip');  // enabled 時のみ
    return;
  }

  for (const bl of glob('.takumi/backlog/doing/*.md')) {
    const fm = parseFrontmatter(bl);
    if (fm.pr == null) continue;  // pr 未設定はスキップ

    const result = exec(`gh pr view ${fm.pr} --json state,mergedAt,closedAt`);
    if (result.exitCode !== 0) {
      // 404 / rate limit / network → state 変更なし、log 1 行
      log(`BL-${fm.id}: PR#${fm.pr} 照会失敗 (${result.stderr})`);
      continue;
    }

    const pr = JSON.parse(result.stdout);
    if (pr.state === 'MERGED') {
      moveTo(bl, 'done/', { outcome: 'shipped', closed_at: pr.mergedAt, closed_by: `PR#${fm.pr}` });
      log(`BL-${fm.id}: doing → done (PR#${fm.pr} merged)`);
    } else if (pr.state === 'CLOSED') {
      moveTo(bl, 'open/', { ...rollbackFrontmatter });
      appendBody(bl, `\n\n## PR#${fm.pr} reject\n(rejected at ${pr.closedAt}, please update plan)`);
      log(`BL-${fm.id}: doing → open (PR#${fm.pr} rejected)`);
    }
    // OPEN / DRAFT → state 変更なし
  }
}
```

### branch 名推測は補助 signal のみ

git branch 名から BL ID を推測する機能 (例: `bl-007-2fa-auth`) は **自動 move には使わない**。理由:

- branch 命名規約が守られない事故
- squash merge / rebase で branch 履歴が消える
- 複数 BL を 1 branch にまとめる運用との衝突

branch 推測は「**起票/着手発話の補助**」としてのみ:

- 「現在の branch から BL 推測して」「いまの作業を BL 化して」発話で branch 名を解析、候補を提示
- 自動移動はしない (発話 / sync check のみが移動の権限を持つ)

### 失敗時の挙動

| 失敗 | 対処 |
|---|---|
| `gh` 不在 | `enabled` で log 1 行、`external` は完全 silent (log も telemetry もゼロ) |
| `gh` 未ログイン | log 1 行 + ユーザーに `gh auth login` を 1 度だけ提案 (`session.gh_auth_suggested` でガード) |
| rate limit (HTTP 429) | log 1 行、その session の sync 全 skip (次セッションで再試行) |
| network error | log 1 行、当該 BL のみ skip (他は続行) |
| `pr: 42` が 404 (PR 削除済) | log 1 行、frontmatter `pr: null` に補正 (state 変更なし) |
| frontmatter parse error | log 1 行、当該 BL skip、ファイル不変更 |

## fixture (Wave F 検証用)

| シナリオ | mode | doing/ 内容 | gh 利用可 | 期待動作 |
|---|---|---|---|---|
| 1: 通常 merged | enabled | BL-007 (pr: 42, merged) | yes | done/ に move + outcome: shipped |
| 2: 通常 closed | enabled | BL-008 (pr: 43, closed) | yes | open/ に差し戻し + reject 理由 |
| 3: PR 未紐付け | enabled | BL-009 (pr: null) | yes | touch しない |
| 4: gh 不在 | enabled | BL-007 (pr: 42) | no | log 1 行、state 変更なし |
| 5: external mode | external | BL-007 (pr: 42, merged) | yes | **完全 silent**、log すら出さない |
| 6: open/ の sync | enabled | open/BL-010 (pr: 50) | yes | touch しない (open/ は対象外) |
| 7: 404 PR | enabled | BL-007 (pr: 99 が削除済) | yes | log 1 行 + pr: null 補正 |

## telemetry event

```json
{ "ts": "...", "event": "backlog_sync_started",    "n_doing": 5 }
{ "ts": "...", "event": "backlog_sync_completed",  "moved": 2, "skipped": 3, "errors": 0 }
{ "ts": "...", "event": "backlog_move_executed",   "bl": "BL-007", "from": "doing", "to": "done", "trigger": "sync" }
{ "ts": "...", "event": "backlog_move_executed",   "bl": "BL-009", "from": "open", "to": "doing", "trigger": "utterance" }
```

> [!IMPORTANT]
> `mode == external` 時は **telemetry も emit しない** (silent 契約)。`backlog_sync_suppressed` で `reason: mode_external` を記録するのは禁止 — sync check 自体が起動前に exit する。
