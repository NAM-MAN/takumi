# Backlog project.yaml schema + 状態遷移 + 優先順位 (内部仕様書)

> [!NOTE]
> `backlog-mode.md` から参照される source of truth。`project.yaml.backlog` の schema と `BacklogGate.resolveMode()` の優先順位を定義。bootstrap snippet 本体は `step0-bootstrap.md`「project.yaml.backlog セクション」節に実装済み。

## project.yaml.backlog セクション

```yaml
# .takumi/project.yaml (既存 or 新規)
project_mode: backend          # 既存 (ui | mixed | backend)
backlog:
  mode: unset                  # enum: unset | enabled | external | deferred
  external_tool: null          # mode == external 時のみ: "linear" | "github-issues" | "jira" | "notion" | "other"
  deferred_until: null         # mode == deferred 時のみ: YYYY-MM-DD。経過後 BacklogGate が unset を返す (raw 値は履歴として残す)
  bootstrapped_at: null        # mode == enabled 時のみ: YYYY-MM-DD。初回 bootstrap 日付
  fresh_bootstrap: false       # bootstrap 直後 → migration 起動判定用 (一時 flag、migration 完了で false に戻す)
```

## mode 解決の優先順位 (固定)

`BacklogGate.resolveMode()` の判定順:

| 順位 | signal | 動作 |
|---|---|---|
| 1 | **explicit `project.yaml.backlog.mode`** | 値を尊重、以下の signal で上書きしない |
| 2 | **external marker** (`.linear/` / `.github/ISSUE_TEMPLATE/` / CLAUDE.md 内 "Linear/Jira/GitHub Issues" 語句) | 1 問確認 → external 確定 (yes) or unset 継続 (no) |
| 3 | **existing `.takumi/backlog/` ディレクトリ** | `enabled` を auto-set、`bootstrapped_at` は更新しない |
| 4 | (上記なし) | `unset` |

> [!IMPORTANT]
> 2-4 は explicit を**上書き禁止**。`project.yaml.backlog.mode` が set されていれば 2-4 の検出を skip (CI / autonomous run の安定性確保)。

## 状態遷移ルール (4 状態 × 5 イベント)

| 現在 → イベント | unset | enabled | external | deferred |
|---|---|---|---|---|
| **bootstrap** (init) | unset 維持 | `bootstrapped_at` 更新 (再 bootstrap、idempotent) | 無視 | 無視 |
| **detect-signal** (auto-detect 3 signal) | signal 種別に応じて enabled / 1 問確認後 external / unset 継続 | 上書き禁止 (現状維持) | 上書き禁止 | 上書き禁止 |
| **user-utterance** (BL 起票 等) | OfferPolicy 経由で 1 問提案 → 4 状態のいずれかへ | 即動作 | 1 回限り「Linear に登録するのが設定ですが、takumi 切り替え?」確認 → yes → enabled、no → external 維持 | OfferPolicy 経由 (deferred_until 経過なら unset 扱い、未経過なら silent) |
| **cooldown-expire** (deferred_until 経過) | N/A | N/A | N/A | **raw YAML を `mode: unset` に明示書き換え**、`deferred_until` の元値は preserve |
| **explicit-override** (発話「Linear に切り替え」「backlog 使う」等) | 指定先へ | 指定先へ | 指定先へ | 指定先へ |

## deferred 期限切れの扱い (raw vs resolved 統一)

raw YAML を読む caller が混じると再提案されないリスクを避けるため、**期限切れ検出時は raw YAML を `mode: unset` に明示書き換え**:

- `mode: deferred` + `deferred_until: 2026-06-24` の状態で 2026-06-25 以降:
  - `BacklogGate.resolveMode()` が呼ばれた時点で `mode: unset` を返す **かつ raw YAML も `mode: unset` に更新**
  - `deferred_until` の元値は `project.yaml` に残す (履歴、再 defer 時に「前回 2026-06-24 まで deferred」を提示可能)
  - 再度 deferred 選択時は `deferred_until` を新値に上書き

これにより raw 値を読む側の caller も自動的に整合する (lint checklist 不要)。

## external 完全 silent 契約

`mode == external` で振る舞う場面のマトリクス (**telemetry も emit しない**):

| 場面 | external 時の動作 |
|---|---|
| auto-detect (3 signal) | 実行しない (mode 既に確定済み)、telemetry なし |
| bootstrap (`.takumi/backlog/` 作成) | 実行しない、telemetry なし |
| migration (既存スキャン + インポート) | 実行しない、telemetry なし |
| sync check (`gh pr view`) | 実行しない (警告すら出さない)、telemetry なし |
| 起票機会フック (probe triage / **sweep complete** / discovered ≥3 / Sprint bl_refs) | `OfferPolicy.shouldOffer()` で false 返却、**telemetry も emit しない** |
| 発話「BL 起票」 | 1 回限り確認 (`session.backlog_offer_shown` でガード)、2 回目以降 silent。**telemetry なし** |
| 発話「BL-007 状態」等の状態確認 | silent (`backlog/` ディレクトリが存在しない前提) |

> [!IMPORTANT]
> external silent の定義は「**user-facing + telemetry の両方ゼロ**」。`suppressed` event の `reason: mode_external` は存在しない。

## BacklogGate.resolveMode() 擬似コード

```
function resolveMode() {
  // 1. explicit project.yaml が最優先
  if (project.yaml.backlog.mode != null) {
    let m = project.yaml.backlog.mode;
    // deferred 期限切れチェック (raw 自動 normalize)
    if (m === 'deferred' && now >= project.yaml.backlog.deferred_until) {
      writeProjectYaml({ 'backlog.mode': 'unset' });  // raw YAML を明示書き換え
      return 'unset';  // deferred_until の値は preserve
    }
    return m;
  }

  // 2. external marker 検出
  if (hasExternalMarker()) {
    return askOnce('Linear/GitHub Issues 使ってますか?')
      ? setMode('external', detectedTool)
      : 'unset';
  }

  // 3. existing .takumi/backlog/ 検出
  if (existsBacklogDir()) {
    setMode('enabled', { bootstrapped_at: 'preserve' });
    return 'enabled';
  }

  // 4. fallback
  return 'unset';
}

function hasExternalMarker() {
  return existsDir('.linear/')
      || existsDir('.github/ISSUE_TEMPLATE/')
      || grepMatch('CLAUDE.md', /Linear|Jira|GitHub Issues/);
}
```

## OfferPolicy.shouldOffer() contract — `backlog/offer-policy.md` 参照

詳細は **`backlog/offer-policy.md`**。要点:

- `mode == external` は **最優先で false を返し、telemetry も emit しない** (silent 契約)
- session scope (`backlog_offer_shown`) + project scope (`mode != enabled/deferred-未経過`) の 2 段ゲート
- 5 trigger 全て同経路 (`probe_triage` / `sweep_complete` / `discovered_3plus` / `user_utterance` / `sprint_bl_refs`)
- CI 環境では常に false

## CI 環境での挙動

非対話 (`CI=true` or stdin is not tty) 環境では:

- `BacklogGate.resolveMode()`: `project.yaml.backlog.mode` を読むのみ、auto-detect の 1 問確認は skip して `unset` 扱い
- `OfferPolicy.shouldOffer()`: 常に false (提案を出さない)
- `mode == enabled` でも sync check 失敗時の警告は emit せず log のみ
