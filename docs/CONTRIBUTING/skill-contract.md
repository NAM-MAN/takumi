# skill-contract.md — skill 編集の互換性ルール

> [!NOTE]
> **このファイルは takumi skill を開発・フォークする人向け** です。`/takumi` を使いたいだけの方は [README.md](../../README.md) を参照してください。

`skills/takumi/**` は配布物です。利用者端末の `~/.claude/skills/takumi/` に cp されて動作するので、**予期しない破壊** を避けるための規約を守ります。

---

## SKILL.md frontmatter 必須フィールド

```markdown
---
name: <skill-id>              # 必須: `/<skill-id>` として invoke される
description: "<one-liner>"     # 必須: Claude Code が invoke 判定に使う
license: MIT                   # 推奨: 明示
---
```

- `name` は一意。既存 `/takumi` を上書きしない
- `description` は **具体的な trigger 語を含める**。曖昧だと Claude Code が別の skill を選ぶ
- skill 本文 (`# takumi: ...` 等) は frontmatter の直後に開始

---

## semver 判断基準

| 変更 | bump | 例 |
|---|---|---|
| **major** (破壊的) | X.0.0 | 既存節削除・API 反転・`name` 変更・必須 frontmatter field 追加 |
| **minor** (追加) | X.Y.0 | 新規 skill 追加・既存 skill に新節追加・新 mode 追加 |
| **patch** (改善) | X.Y.Z | typo・例の補強・rephrase・内部分割 (参照切れないよう慎重に) |

迷ったら **major/minor に倒す** のが安全。利用者の `/takumi ...` 呼出しが壊れる影響は大きい。

### 破壊的判定の目安

以下は **すべて major**:

- mode 名変更 (`probe` → `diagnose` 等)
- 進入路表のタスク種別名変更
- `.takumi/plans/` 書き込み形式の変更
- 4 ロール名の変更 (職人/軍師/斥候/棟梁)
- artifact contract の必須成果物削除

---

## 進入路 (navigation) 表の保守

`SKILL.md` 冒頭にある「進入路」表 (task 種別 → 必ず読む / 触れない) は context 保護の要。

### 追加時

- 新しいタスク種別を挿入 → 必読 3-5 本・触れない 1-2 本を明示
- 既存行を壊さない
- 表の右端を 80 文字以内に保つ (terminal 可読性)

### 削除時

- **major bump**。該当タスク種別に依存した外部 skill がある可能性を探る
- 代替路が無ければ「deprecated, use X instead」行として 1 release 以上残す

---

## ≤300 行の規律

skill 内 md は **300-349 行まで acceptable、350 行超は必ず分割** (`SKILL.md` 進入路表の注記)。

### 分割の判断

```
ファイルが 280 行 → そのまま
ファイルが 320 行 → 次の編集で触るなら分割、触らないなら据え置き
ファイルが 380 行 → 必ず分割 (section ごとに新 md へ)
```

### 分割手順

1. 最も独立した節 1-2 本を抜き出し候補に
2. 新ファイル名を決める (既存命名と整合、kebab-case)
3. 元ファイルには「詳細は [`<new>.md`](<new>.md)」の 1 行を残す
4. 親の `SKILL.md` の「進入路」表の該当行を更新 (必読に加える or 触れないに落とす)
5. 他 md からの参照を grep 更新

---

## reference-first (参照優先)

skill 群は **全文を全部読まない** 設計。個別 md は「独立完結」よりも「**必要な参照を持つ**」ことを優先します。

- 他 md に既にある説明は引用せず `[<topic>](<file>.md#<anchor>)` でリンク
- frontmatter は最小化 (平均 20 行以下、大規模は 40 行が上限目安)
- task 種別 × profile 軸で index を `SKILL.md` に集約

---

## 新規 skill 追加のチェックリスト

- [ ] `skills/takumi/<new>/SKILL.md` (frontmatter 必須 3 field)
- [ ] README に新 skill の 1 行紹介追加 (任意だが推奨)
- [ ] `SKILL.md` (root の takumi) の「進入路」表に新タスク種別を追加 (必要なら)
- [ ] 関連 md からの相互参照を追加
- [ ] `docs/CONTRIBUTING/public-safety.md` の grep が 0 件
- [ ] `wc -l skills/takumi/<new>/**/*.md` で全部 300 以下
- [ ] semver: minor bump 案を決める

---

## 既存 skill 節追加のチェックリスト

- [ ] 既存節の最下部 or 論理的に正しい位置に挿入
- [ ] 既存の見出し階層と整合 (h2/h3 の深さ揃える)
- [ ] 相互参照 (`docs/CONTRIBUTING/` や他 skill 内) を追加
- [ ] `wc -l` で 300 以下
- [ ] 追加節が単独で読めるか (前文脈を暗黙前提にしない)

---

## 破壊的変更が必要になった時

1. 代替路を先に作る (新節・新 mode を minor で追加)
2. 旧節に `> [!WARNING] deprecated, use <new>` を 1 release 以上残す
3. 次の major release で旧節削除
4. README の migration guide に 1 節

利用者視点で「ある日突然動かない」を避ける。

---

## 関連

- [`workflow.md`](workflow.md) — release フロー
- [`public-safety.md`](public-safety.md) — commit 前スキャン
- [`opus-4-7.md`](opus-4-7.md) — effort / subagent 方針
- [`../../CLAUDE.md`](../../CLAUDE.md) — エントリ指針
