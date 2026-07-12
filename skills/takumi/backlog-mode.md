# backlog-mode — 内蔵 backlog 管理 (takumi 内部参照)

> [!IMPORTANT]
> 人間が直接叩く別コマンドは存在しない (`/takumi` 経由のみ)。本書は `SKILL.md` Step 0e の **BacklogGate / OfferPolicy 中央化**を支える内部仕様書で、詳細は `backlog/*.md` の sub-spec 7 本に分岐。

## 概要 (思想)

時雨堂的 minimal: **markdown + git tracked + ツール非依存**。Linear/Jira/GitHub Issues に頼らず、`.takumi/backlog/` に 1 issue = 1 ファイルで管理する。

- **3 status のみ** (`open` / `doing` / `done`)、blocked は frontmatter `blocked_by:` で表現、wontfix は `done/` 内 `outcome: wontfix` で表現
- **AI 移動が主体** — 発話「BL-007 着手」「BL-007 done」等で状態遷移、git hook 不使用 (移植性優先)
- **sync check** — `/takumi` 起動時に `gh pr view` で merged/closed PR を best-effort 反映
- **`mode == external` は完全 silent** — 全 backlog hook を no-op、Linear 利用者の邪魔をしない

---

## ディレクトリ構造

```
.takumi/backlog/
├── README.md          # 運用ガイド (templates/backlog-readme.md からコピー)
├── open/    BL-###-{slug}.md    # 未着手
├── doing/   BL-###-{slug}.md    # 着手中 (frontmatter `pr:` で sync 対象)
└── done/    BL-###-{slug}.md    # 完了 (outcome: shipped | wontfix | superseded)
```

`.gitignore` で `.takumi/` 維持 + `!.takumi/backlog/` 例外行で git tracked (詳細: `step0-bootstrap.md`)。

---

## 仕様分割 (本書から各 sub-spec へ)

「**backlog 起票/管理**」task 時は `SKILL.md` Step 0e + 本書 + (必要に応じて 1-2 本の sub-spec) を読む。**全 7 本を読まない** (context 劣化回避)。

| トピック | sub-spec | いつ読むか |
|---|---|---|
| frontmatter schema | `backlog/schema-frontmatter.md` | 起票 / 手動編集 / migration で frontmatter 触る時 |
| project.yaml + 状態遷移 | `backlog/schema-project-yaml.md` | mode 解釈 / 優先順位 / external silent マトリクス確認 |
| 自動判定 (3 signal) | `backlog/auto-detect.md` | 新規 project で auto-detect 振る舞い確認 |
| bootstrap | `backlog/bootstrap.md` | `mode == enabled` 初回 / 再 bootstrap 動作確認 |
| OfferPolicy 中央化 | `backlog/offer-policy.md` | 新規起票機会フック追加時 / 提案連発デバッグ |
| 移行サポート | `backlog/migration.md` | 既存 sprints/discovered からの 1 回限りインポート時 |
| AI 移動 + sync check | `backlog/ai-move-sync.md` | 発話 → move ロジック / `gh pr view` sync 動作確認 |
| AC trace table | `backlog/acceptance.md` | AC-BLK-001 〜 013 の spec / fixture / hook 紐付け確認 + drift 監査手順 |

---

## 起票機会フックの統合

提案 hook **5 種**は `SKILL.md` Step 0e で `OfferPolicy.shouldOffer()` 経由必須を宣言。各 hook の実装は対応する skill md に追加済:

| trigger | 実装 skill | 動作 |
|---|---|---|
| `probe_triage` | `probe/triage.md` 末尾 | triage 完了後に発火 |
| `sweep_complete` | `sweep/runtime.md` 末尾 | sweep 統合発見リスト確定後に発火 |
| `discovered_3plus` | `self-multiplying.md` 末尾 | 1 Wave で discovered ≥ 3 件 |
| `user_utterance` | `natural-language.md` "backlog 操作" | 「BL 起票」等の発話 (user-initiated 例外) |
| `sprint_bl_refs` | `sprint-mode.md` 末尾 | Sprint Wave で `bl_refs:` 埋め込み |

全 5 種が `BacklogGate.resolveMode()` を先に通し、`mode == external` で 0 回、`unset` / `deferred` 期限切れで 1 回 (1 session 最大) を保証。

---

## 既存 (probe / sweep 経由) との関係

`mode == enabled` 確定後の旧 backlog 入力モードは以下のように統合:

| 旧フロー | 新フロー (enabled 時) |
|---|---|
| probe triage → `.takumi/sprints/{date}/backlog.md` → plan 起草 | probe triage → OfferPolicy → 自動昇格 → `.takumi/backlog/open/BL-###-*.md` → plan に `bl_refs:` で接続 |
| sweep → 同様 | sweep → 同様、`source: sweep` |
| discovered → `.takumi/drafts/discovered-*.md` → plan 追記 | discovered ≥ 3 件で OfferPolicy → 自動昇格 (1-2 件は従来通り plan 追記) |

旧フローを完全置換するのではなく、`mode == enabled` のみで上書き。`unset` / `external` / `deferred` 時は従来通り `.takumi/sprints/` / `drafts/` のフローで動作 (silent 違反防止)。

---

## トラブルシュート

| 症状 | 対処 |
|---|---|
| 移行で既存ファイルが消えた | 設計上有り得ない (copy-only contract、`backlog/migration.md`)。`backlog/.migration-{date}.json` の manifest 確認、rollback 手順は `backlog/migration.md` 末尾 |
| sync check で全 BL が `done/` に流れた | `pr:` が誤ってセット済みの可能性。`mode: external` に一時切替 → `pr:` クリーンアップ → `mode: enabled` に戻す |
| 「BL 起票」発話で何も起きない | `mode == external` / `deferred` 期限内 / `enabled` で既起票済 (1 session 1 回ガード) の可能性。`/takumi backlog 状態` で確認 |
| `BL-007 着手` が反応しない | BL-007 が `open/` に存在しない可能性。`ls .takumi/backlog/open/BL-007*` で確認 |
| `gh` 未ログインで sync 失敗 | `enabled` 時のみ warning 1 行で skip、`gh auth login` を 1 度だけ提案、以降 silent |
| 提案が同 session で 2 回出た | `state.json.backlog_offer_shown` が誤って false に戻った可能性、telemetry の `backlog_offer_emitted` を 2 連続検出。bug として report |
| auto-detect が explicit を上書きした | 設計違反。`backlog/auto-detect.md` の優先順位 4 段を確認、bug として report |

---

## 関連リソース

| file | 用途 |
|---|---|
| `SKILL.md` Step 0e | BacklogGate / OfferPolicy の定義 (本書の親) |
| `step0-bootstrap.md` "project.yaml.backlog セクション" | project.yaml schema + bootstrap snippet (実装) |
| `backlog/*.md` (本書から分岐、7 本) | 仕様詳細 |
| `templates/backlog-readme.md` | bootstrap 時にコピーされる運用ガイド |
| `natural-language.md` "backlog 操作" | 発話辞書 (起票 / 状態確認 / 移動 / mode 切替) |
| `probe/triage.md` / `self-multiplying.md` / `sprint-mode.md` | 各起票機会フック実装 |
| `integrations.md` | backlog ↔ AC (`specs/`) / plan (`bl_refs`) の双方向リンク |
