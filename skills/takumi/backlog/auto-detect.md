# Backlog 自動判定 (3 signal) — 内部仕様書

> [!NOTE]
> `backlog-mode.md` から参照される source of truth。`BacklogGate.resolveMode()` の Signal A/B/C 検出ロジックを定義。

## 起動条件

`BacklogGate.resolveMode()` の **優先順位 2-4** で動作。**優先順位 1 (explicit `project.yaml.backlog.mode`) が set されていれば本ロジックは skip** (explicit を上書き禁止)。

## 3 signal の検出

### Signal A: existing `.takumi/backlog/` ディレクトリ

```bash
test -d .takumi/backlog && echo "signal_a"
```

**動作**:
- 検出 → `mode: enabled` を auto-set (1 問確認なし、既に使っている前提)
- `bootstrapped_at` は touch しない (既存値保持、未設定なら null のまま)
- telemetry: `backlog_mode_autoset_from_a`

### Signal B: external tool marker

検出対象 (いずれかにマッチ):

```bash
test -d .linear                       || \
test -d .github/ISSUE_TEMPLATE        || \
test -d .jira                         || \
test -f .github/issue_template.md
```

**動作**:
- 検出 → **1 問確認**: 「`{検出したマーカー}` が見つかりました。Linear / GitHub Issues / Jira を使ってますか?」
  - yes → `mode: external` 確定 + `external_tool` を検出マーカーから推定 (`linear` / `github-issues` / `jira`)
  - no → 通常提案フローへ (mode は `unset` のまま、次の起票機会で OfferPolicy 経由提案)
- telemetry: `backlog_external_signal_detected` (yes/no 別)
- **重要**: 1 問だけ、2 回目以降は session.backlog_offer_shown でガード (連発防止)

### Signal C: CLAUDE.md / README.md 内の語句

```bash
grep -lE '\b(Linear|Jira|GitHub Issues|github\.com/.+/issues)\b' CLAUDE.md README.md 2>/dev/null
```

**動作**:
- 検出 → Signal B と同じ 1 問確認、ただしマーカーは「CLAUDE.md/README.md に記述あり」
- **検出に保守的に**:
  - 誤検出回避: コードブロック内 / リンク URL のみの場合は除外
  - 大文字小文字区別あり (`linear` 小文字単独はマッチさせない、製品名以外の用途が多いため)

## 優先順位 (3 signal 同時検出時)

| 同時検出 | 解決 |
|---|---|
| Signal A + B | A 優先 (`enabled` auto-set)、B は無視 (既に backlog/ がある以上 takumi 使用が確定的) |
| Signal A + C | A 優先 |
| Signal B + C | B 優先 (具体的なツールマーカーの方が信頼性高い)、C は補足情報として「CLAUDE.md にも記述」を提示 |
| A + B + C | A 優先 |

## CI 環境での挙動

- `CI=true` or non-interactive (stdin not tty) → Signal B/C の 1 問確認は skip、`mode: unset` 扱い
- Signal A のみ動作 (auto-set 可能、確認不要)

## 自動判定の失敗ケース (誤検出ゼロを担保)

| ケース | 期待動作 | 検証 |
|---|---|---|
| `.linear/` だが空 or 別用途 | yes/no 確認で no 選択 → `unset` 維持 | fixture: 空 `.linear/` ディレクトリ |
| CLAUDE.md にコメントとして "linear-gradient" 記述 | コードブロック除外で誤検出ゼロ | fixture: CSS コード入り CLAUDE.md |
| `.takumi/backlog/` が空 | Signal A 動作、`enabled` auto-set (空でも問題なし、後で起票) | fixture: 空 backlog/ |
| project.yaml.backlog.mode が既に external | 本ロジック全 skip (優先順位 1) | fixture: explicit external |

## 提案文 (1 問確認のテンプレ)

```
{検出マーカー (.linear/ 等)} が見つかりました。
外部ツール (Linear / GitHub Issues / Jira 等) で backlog を管理していますか?

yes → takumi の backlog 機能は無効化します (mode: external)。以降この提案はしません
no  → 必要になったタイミングで takumi backlog を提案します (mode: unset 維持)
```

`session.backlog_offer_shown` を true にセット、次の 1 問は確認しない。

## telemetry event (後続で `.takumi/telemetry/profile-usage.jsonl` に append)

```json
{ "ts": "...", "event": "backlog_mode_autoset_from_a", "trigger": "existing_backlog_dir" }
{ "ts": "...", "event": "backlog_external_signal_detected", "marker": ".linear", "user_choice": "yes" }
{ "ts": "...", "event": "backlog_external_signal_detected", "marker": "CLAUDE.md", "user_choice": "no" }
```
