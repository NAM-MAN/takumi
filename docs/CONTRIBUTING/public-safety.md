# public-safety.md — 公開リポジトリの情報漏洩防止

> [!NOTE]
> **このファイルは takumi skill を開発・フォークする人向け** です。`/takumi` を使いたいだけの方は [README.md](../../README.md) を参照してください。

takumi は `NAM-MAN/takumi` (public, MIT) として公開されています。commit の前に必ず機械的スキャンを通し、個人情報と私的コンテキストを除去します。

---

## 必ず機械スキャンで除去するパターン

### A. ファイルシステム絶対パス

```
/Users/<username>/...
/home/<username>/...
C:\Users\<username>\...
```

ユーザー環境固有であり、他の開発者には無価値、かつユーザー名漏洩リスクがあります。

### B. メールアドレス / 連絡先

```
<local>@<domain>
```

例示目的であっても `example.com` 以外は避ける。個人メール (gmail 等) は絶対に書かない。

### C. 他リポジトリ名 / プロジェクト名

takumi 以外の個人プロジェクトや社内プロジェクト名の言及は除去:

- 開発者が所有する別リポジトリの名前
- 勤務先の社内プロジェクト名 / システム名
- コードネーム類

ドキュメント中で具体プロジェクト名が必要な場合、汎用名 (`my-project`, `example-app`) に置換する。具体名のブラックリストはこの公開ファイルには書かず、開発者のローカルメモ (`.takumi/drafts/`) で管理する。

### D. 社内 URL / 内部インフラ

```
*.internal, *.corp, 10.*, 192.168.*, grafana.internal/...
```

### E. 未公開 issue / PR 番号

`#123` の絶対参照は、同リポジトリ内の公開 issue のみ許容。非公開 issue tracker (Linear, JIRA 等) の ID は書かない。

### F. 鍵 / 秘密情報

本物っぽい形式は避け、完全プレースホルダに統一:

| 用途 | プレースホルダ |
|---|---|
| API key (OpenAI 系) | `<openai-api-key>` |
| API key (汎用) | `<your-api-key>` |
| Bearer token | `<bearer-token>` |
| password | `<password>` |

---

## 実行する grep (commit 前)

**POSIX ERE 互換** で 4 カテゴリに分けて実行 (negative lookahead は BSD / GNU grep 共に未対応):

```bash
# A/B: 絶対パス
grep -rEn "(/Users/[A-Za-z0-9_-]+|/home/[A-Za-z0-9_-]+|C:\\\\Users\\\\)" \
  --include='*.md' --include='*.ts' --include='*.txt' \
  README.md docs/ skills/ references/ CLAUDE.md LICENSE

# C: メール (hit 後に example.com を目視で除外)
grep -rEn "[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,}" \
  --include='*.md' --include='*.ts' --include='*.txt' \
  README.md docs/ skills/ references/ CLAUDE.md LICENSE \
  | grep -v 'example\.com'

# D: API / bearer / credentials の見た目
grep -rEn "(sk-[A-Za-z0-9_-]{20,}|Bearer [A-Za-z0-9._-]{20,}|api_key=[\"'][^\"']{10,})" \
  --include='*.md' --include='*.ts' --include='*.txt' \
  README.md docs/ skills/ references/ CLAUDE.md LICENSE

# E: 内部 URL / private IP
grep -rEn "\.(internal|corp|lan)\b|10\.[0-9]+\.[0-9]+\.[0-9]+|192\.168\." \
  --include='*.md' --include='*.ts' --include='*.txt' \
  README.md docs/ skills/ references/ CLAUDE.md LICENSE
```

期待結果: すべて 0 件 (C のみ `example.com` 除外後に 0 件)。hit した場合は commit 前に必ず修正。

ripgrep 環境であれば PCRE2 で 1 発:

```bash
rg --pcre2 -n '(/Users/[A-Za-z0-9_-]+|[A-Za-z0-9._%+-]+@(?!example\.com)[A-Za-z0-9.-]+\.[a-z]{2,}|sk-[A-Za-z0-9_-]{20,}|Bearer [A-Za-z0-9._-]{20,})' \
  README.md docs/ skills/ references/ CLAUDE.md LICENSE
```

さらに**プロジェクト名ブラックリスト** を開発者のローカルメモ (`.takumi/drafts/public-safety-blacklist.txt`、`.gitignore` 済) に列挙し、以下で突合:

```bash
grep -rEwf .takumi/drafts/public-safety-blacklist.txt \
  --include='*.md' --include='*.ts' --include='*.txt' \
  README.md docs/ skills/ references/ CLAUDE.md
```

期待: 0 件。ブラックリスト自体は公開しない (`.takumi/` は `.gitignore` 済)。

---

## MIT ライセンスとの整合

- 本リポジトリは MIT。**他人の著作物を mirror したい場合は別ライセンスになり得る** ので避ける
- 引用は短く、出典 URL を md リンクで明示 (fair use の範疇)
- Claude Code の公式 blog / docs を引用する時は URL を付ける
- 他 OSS のコードを embed する時は元ライセンスを確認 (MIT / Apache-2.0 / BSD であれば通常 OK、GPL は NG)

---

## 公開前の自己問診

commit する直前、以下すべてに yes:

- [ ] grep パターン A-F が 0 件
- [ ] プロジェクト名ブラックリストが 0 件
- [ ] 追加した md / 例 (examples/) に「自分の本物の API key」「本物のユーザー名」が写り込んでいない
- [ ] 他 OSS コードの copy & paste がない、あるいは元ライセンス互換を確認
- [ ] `.takumi/` 配下のファイルが staged になっていない (`.gitignore` 済なので通常混ざらない、念のため)
- [ ] スクリーンショットや貼り付けログに社内情報が写っていない (そもそも画像は commit しないのが安全)

---

## 違反を見つけた時の対処

1. **編集中に気付いた** → その場で修正、stage し直す
2. **コミット後・push 前に気付いた** → `git rm --cached` で unstage し amend
3. **push 済で気付いた** → **ユーザーに即報告**。`git push --force` は副作用が大きいので必ず許可を取る。push 済の秘密鍵は**即ローテーション**が原則 (git 履歴から消しても遠隔アーカイブに残る)

---

## 関連

- [`workflow.md`](workflow.md) — commit / push のフロー
- [`skill-contract.md`](skill-contract.md) — skill 編集規約
- [`../../CLAUDE.md`](../../CLAUDE.md) — エントリ指針
