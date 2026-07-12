# OfferPolicy 中央化 (内部仕様書)

> [!NOTE]
> `backlog-mode.md` から参照される source of truth。全提案 hook (probe triage / sweep 完了 / discovered ≥3 / 「BL 起票」発話 / Sprint bl_refs) が経由する `OfferPolicy.shouldOffer()` の API contract と state 永続化を定義。

## 目的

提案 hook 全 **5 種** (probe triage 完了 / sweep 完了 / discovered ≥3 / 「BL 起票」発話 / Sprint bl_refs) が**同一の判定経路**を通ることで:

1. 1 セッション内で複数 hook が発火しても、提案は最大 1 回
2. `mode == external` 時は全 hook で 0 回 (silent 違反防止、**telemetry も emit しない**)
3. `deferred_until` 未経過の `deferred` 状態を全 hook が尊重
4. 既に `enabled` の場合、再提案しない

## silent 契約

`mode == external` では **user-facing も telemetry もゼロ**。`suppressed` event すら emit しない (silent の定義を「user-facing + telemetry の両方」で統一)。他の suppressed reason (session_already_shown / mode_enabled / deferred / ci) は telemetry のみ emit。

## API contract

```typescript
// 擬似コード (実装は skill md 内の指示として記述、コードは生成しない)
function OfferPolicy.shouldOffer(trigger: TriggerType): boolean {
  // 0. external は最優先で silent (telemetry も emit しない)
  const mode = BacklogGate.resolveMode();
  if (mode === 'external') {
    return false;  // 完全 silent、no telemetry
  }

  // 1. session scope
  if (state.backlog_offer_shown === true) {
    emit_telemetry('backlog_offer_suppressed', { reason: 'session_already_shown', trigger });
    return false;
  }

  // 2. project scope
  if (mode === 'enabled') {
    emit_telemetry('backlog_offer_suppressed', { reason: 'mode_already_enabled', trigger });
    return false;
  }
  if (mode === 'deferred' && now() < project.yaml.backlog.deferred_until) {
    emit_telemetry('backlog_offer_suppressed', { reason: 'mode_deferred', trigger, until: deferred_until });
    return false;
  }
  // mode === 'unset' OR (mode === 'deferred' && now >= deferred_until)
  //   → 後者は BacklogGate.resolveMode() が 'unset' に normalize 済

  // 3. CI 環境チェック
  if (isCIEnvironment()) {
    emit_telemetry('backlog_offer_suppressed', { reason: 'ci_environment', trigger });
    return false;
  }

  // 4. set & emit
  state.backlog_offer_shown = true;
  emit_telemetry('backlog_offer_emitted', { trigger });
  return true;
}

type TriggerType =
  | 'probe_triage'        // probe triage 完了直後
  | 'sweep_complete'      // sweep 統合発見リスト確定後
  | 'discovered_3plus'    // 自己増殖発見が 3 件超え
  | 'user_utterance'      // 「BL 起票」等の発話
  | 'sprint_bl_refs';     // Sprint Wave で bl_refs を埋めようとした
```

## state 永続化

`state.backlog_offer_shown` は **session-scoped**:

- `.takumi/state.json` に `backlog_offer_shown: true | false` を保存
- `/takumi` 起動時に `false` 初期化 (新 session 開始のたびにリセット)
- 同一 session 内で `true` になったら、その session 中は false に戻らない

```json
// .takumi/state.json 抜粋
{
  "active_run_id": "run-2026-05-24-001",
  "backlog_offer_shown": false,
  "session_started_at": "2026-05-24T03:31:36Z"
}
```

## 提案 UI (mode == unset / deferred 期限切れ時)

```
backlog 管理を takumi 内で完結させますか?

[1] takumi で管理 (推奨)         — .takumi/backlog/{open,doing,done}/ を作成、起票/状態管理を AI で
[2] 外部ツール (Linear/Jira) を使う — takumi は backlog に一切触れません (二度と提案しません)
[3] あとで決める (30 日 cooldown)  — 2026-06-23 まで提案を保留
```

選択結果は `project.yaml.backlog.mode` に書き込み、以降同 mode で動作。

## user-initiated 発話の例外

「BL 起票」「backlog に追加」等の **user-initiated 発話** は OfferPolicy の通常フローと別経路:

| mode | 動作 |
|---|---|
| `unset` | 通常提案フロー (上の UI を提示) |
| `enabled` | 即起票 (確認不要) |
| `external` | **1 回限り**「Linear に登録するのが設定ですが、takumi に切り替えますか?」確認 (`backlog_offer_shown` セット、以降同 session 内は silent)。**ただし telemetry は emit しない** (silent 契約) |
| `deferred` (期限内) | silent (発話を無視)、明示的に「backlog 使う」と言われたら enable へ切替 |

> [!IMPORTANT]
> **git remote (github.com 等) の存在は external marker ではない**。`hasExternalMarker()` (`schema-project-yaml.md`) は `.linear/` / `.github/ISSUE_TEMPLATE/` / CLAUDE.md 語句のみを見る。単なる GitHub remote の存在を理由に「GitHub issue で起票」を推奨してはならない。`unset` + 起票発話の既定は常に**内蔵 backlog ([1] 推奨)**。起票先を尋ねる場合も内蔵を first option に置く。intake の聞く/察す較正 (ラフ入力を察して根拠付き起票、誤推測コスト高い点のみ最小質問) は `../qbc.md` policy `assume + cite` が source-of-truth。

## telemetry event 一覧 (`.takumi/telemetry/profile-usage.jsonl`)

```json
{ "ts": "...", "event": "backlog_offer_emitted",    "trigger": "probe_triage" }
{ "ts": "...", "event": "backlog_offer_suppressed", "trigger": "discovered_3plus", "reason": "session_already_shown" }
{ "ts": "...", "event": "backlog_offer_suppressed", "trigger": "sprint_bl_refs",   "reason": "mode_deferred" }
{ "ts": "...", "event": "backlog_offer_accepted",   "choice": "enabled" }
{ "ts": "...", "event": "backlog_offer_accepted",   "choice": "external", "tool": "linear" }
{ "ts": "...", "event": "backlog_offer_accepted",   "choice": "deferred", "until": "2026-06-23" }
```

> [!IMPORTANT]
> `mode == external` の trigger は telemetry にも記録しない (silent 契約)。`suppressed` reason `mode_external` は存在しない。

これにより「提案連発」の検出 (1 session 内で `_emitted` が 2 回以上) が telemetry で監視可能。

## fixture

| シナリオ | session.backlog_offer_shown 初期 | mode | trigger 連発順 | 期待 emit 数 (user-facing) | 期待 telemetry 数 |
|---|---|---|---|---|---|
| 1: 通常 unset | false | unset | probe_triage → sweep_complete → discovered_3plus → user_utterance → sprint_bl_refs | 1 (最初のみ) | 1 emit + 4 suppressed (session_already_shown) |
| 2: external mode | false | external | 上記 5 連発 | 0 | **0 (完全 silent)** |
| 3: deferred 期限内 | false | deferred (2026-12-31) | 上記 5 連発 | 0 | 5 suppressed (mode_deferred) |
| 4: deferred 期限切れ | false | deferred (2026-01-01) | 上記 5 連発 | 1 | 1 emit + 4 suppressed |
| 5: 既に enabled | false | enabled | 上記 5 連発 | 0 | 5 suppressed (mode_already_enabled) |
| 6: session 内 2 回目 | true | unset | probe_triage | 0 | 1 suppressed (session_already_shown) |
