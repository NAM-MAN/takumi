# local-sources.md — このリポジトリ内を読む、`~/.claude` を読まない

> [!NOTE]
> **このファイルは takumi skill を開発・フォークする人向け** です。`/takumi` を使いたいだけの方は [README.md](../../README.md) を参照してください。

takumi リポジトリで作業している間の**情報源ルール**。drift 防止の根幹です。

---

## 背景: なぜ local-first か

`skills/takumi/**` は Claude Code の `~/.claude/skills/takumi/` にコピー配布される設計です。ユーザー端末に 2 つの版が存在します:

```
このリポジトリ (source-of-truth, 編集対象)
  └── skills/takumi/SKILL.md (最新、push 前の編集版)

~/.claude/skills/takumi/ (配布先、利用者環境)
  └── SKILL.md (前回 publish 時点のコピー — 古い可能性)
```

`~/.claude` 版を参照すると、**編集中の内容と食い違った判断**をしてしまいます。例えば「この skill はこう書かれている」と `~/.claude` 版を引用して議論を進めると、実際には本リポジトリで別仕様に書き換え済みのケースがあります。

---

## ルール

### 読む

- `CLAUDE.md` (このリポジトリの root、エントリ指針)
- `docs/CONTRIBUTING/**` (本ディレクトリ、開発者向け指針)
- `references/**` (技術リファレンス)
- `skills/takumi/**` (配布対象の skill 本体)
- `README.md` (ユーザー向け案内)
- `LICENSE` (必要時)
- `.takumi/plans/**` / `.takumi/drafts/**` (開発者のローカル作業メモ、`.gitignore` 済)

### 読まない (原則)

- `~/.claude/skills/**` (配布先コピー)
- `~/.claude/rules/**` (Claude Code 利用者のグローバル設定)
- `~/.claude/settings*.json` (Claude Code の local 設定)
- `~/.claude/agents/**` (利用者がローカルに置くカスタム agent)

### 例外

ユーザーが明示的に `~/.claude` の設定について尋ねた場合 (例: 「`~/.claude/settings.json` の hook が動かない」)、その時は素直に読んで構いません。ただし**本リポジトリのコード・ドキュメントに反映するときは source-of-truth (このリポジトリ版) で確定させる**こと。

---

## 自分が takumi リポジトリにいるかの判定

**主要条件** (以下のすべて):

- `CLAUDE.md` がこの内容を持つ (本ファイルを含むガイド)
- `skills/takumi/SKILL.md` が存在する
- `docs/CONTRIBUTING/` 配下にガイド群がある

**補助情報** (fork でも true にならない可能性あり):
- `git remote -v` が `NAM-MAN/takumi` を示す — upstream 判定の参考、fork では異なる remote を持つので必須条件ではない
- `pwd` が `takumi/` または類似ディレクトリ

主要 3 条件を満たせば fork でも本ガイドが適用される。1 つでも外れる場合 (別リポジトリで作業中、sandbox など) はこのルールは適用外。通常の Claude Code 運用に戻る。

---

## よくある drift 事故パターン

| パターン | 症状 | 対処 |
|---|---|---|
| `~/.claude/skills/takumi/SKILL.md` を grep | 「この行は古い」ことに気付かず古い規約を引用 | このリポジトリの `skills/takumi/SKILL.md` を grep し直す |
| `~/.claude/rules/testing.md` を参照 | verify skill の最新方針とズレた test 戦略を提案 | `skills/takumi/verify/README.md` を見る |
| ユーザーの `~/.claude/agents/*.md` を前提に設計 | 本リポジトリは agent 定義を持たないのに agent 固有 API を仮定 | `skills/takumi/executor.md` の 4 ロール定義 (職人/軍師/斥候/棟梁) を参照 |

---

## チェックリスト (編集前)

- [ ] 引用したい md が `skills/takumi/**` もしくは `references/**` 内に存在することを `ls` で確認
- [ ] リポジトリ root で `grep -r "~/.claude" .` を実行し、自分の変更にホームディレクトリ絶対パスが混ざっていないか確認 (混ざったら [`public-safety.md`](public-safety.md) の grep にも引っ掛かる)
- [ ] 引用内容が `~/.claude` と `skills/takumi/` で食い違っていた場合、編集は**必ずこのリポジトリ側**で行う

---

## 関連

- [`public-safety.md`](public-safety.md) — 公開リポジトリの情報漏洩防止
- [`skill-contract.md`](skill-contract.md) — skill 編集の互換性ルール
- [`../../CLAUDE.md`](../../CLAUDE.md) — エントリ指針
