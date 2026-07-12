# Backlog (takumi 内蔵 PM)

このディレクトリは **takumi 内蔵の backlog 管理**です。Linear/Jira/GitHub Issues に依存せず、Markdown + git だけで完結します。

## ディレクトリ構造

```
backlog/
├── README.md           # このファイル
├── open/    BL-001-***.md    # 未着手
├── doing/   BL-002-***.md    # 着手中 (PR 紐付け可)
└── done/    BL-003-***.md    # 完了 (shipped / wontfix / superseded)
```

状態 = ディレクトリ。`blocked` は frontmatter `blocked_by:` で表現 (`doing/` に置いたまま)、`wontfix` は `done/` 内 `outcome: wontfix` で表現。

## frontmatter (必須 4 + 任意)

```yaml
---
id: BL-007                       # BL-### 形式
title: 画像の遅延読み込み         # 1 行タイトル
created: 2026-05-24              # YYYY-MM-DD
source: probe                    # probe | sweep | discovered | manual | pr-feedback
# --- 以下任意 ---
priority: P1                     # P0-P3
ac_refs: [AC-MEDIA-003]          # 関連 AC-ID
pr: 42                           # PR 番号 (sync check trigger)
blocked_by: null                 # 別 BL ID で blocked 化
outcome: null                    # done 時のみ: shipped | wontfix | superseded:BL-###
source_ref: .takumi/sprints/2026-05-18/backlog.md#L42
---

## 背景
(自由記述)

## やること / やらないこと

## 検証 (AC とリンク)
```

## 自然文操作 (`/takumi` 経由)

| やりたいこと | 発話例 |
|---|---|
| 起票 | 「2FA 起票」「BL 切って」「<topic> 起票して」 |
| 状態確認 | 「いま doing 何ある?」「open 全部見せて」「BL-007 状態」 |
| 着手 | 「BL-007 着手」「BL-007 やる」 |
| 完了 | 「BL-007 done」「BL-007 完了」 |
| ブロック | 「BL-007 block AC-AUTH-002 待ち」 |
| やめる | 「BL-007 wontfix 理由X」 |
| 外部 PM へ切替 | 「Linear に切り替え」「backlog やめる」 |
| takumi へ戻す | 「backlog 使う」 |

`/takumi` 経由で AI が `open/` / `doing/` / `done/` 間を自動 move + frontmatter 更新します。手動編集も可能です。

## PR との連動 (sync check)

`doing/` 配下の BL で frontmatter に `pr: 42` がセットされている場合、`/takumi` 起動時に `gh pr view 42` で照合し、自動遷移します:

- PR merged → `done/` に move + `outcome: shipped` + `closed_by: PR#42`
- PR closed (reject) → `open/` に差し戻し + 本文に reject 理由追記
- `gh` 不在 / network error → state 変更なし (best-effort)

PR を伴わない BL (`pr: null`) は触りません。

## 運用のコツ

- **新規起票時**: minimal (必須 4 だけ) で十分。後から育てる
- **PR 作成時**: 「BL-007 着手 PR#42」と発話すれば frontmatter に `pr` がセットされ、以降 sync 対象
- **ID 採番**: AI が次の連番を採る (衝突回避済み)。手動採番不要
- **チーム共有**: `backlog/` は git tracked。PR で backlog 変更もレビュー可

## 外部 PM ツールに切り替えたい

`project.yaml` で `backlog.mode: external` に手動変更するか、`/takumi` に「Linear に切り替え」と言えば自動で切り替わります。それ以降 takumi は backlog に一切触れません (完全 silent)。

## 詳細仕様

[takumi の backlog skill (`skills/takumi/backlog-mode.md`)](https://github.com/takumi-skill/takumi) を参照。
