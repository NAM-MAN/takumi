# workflow.md — takumi リポジトリの開発サイクル

> [!NOTE]
> **このファイルは takumi skill を開発・フォークする人向け** です。`/takumi` を使いたいだけの方は [README.md](../../README.md) を参照してください。

skill の編集・追加から release までの流れ。docs リポジトリなので軽量ですが、**公開先 (利用者端末) に伝わる** ので変更粒度と semver を意識します。

---

## 変更の粒度と分岐戦略

| 変更内容 | ブランチ | PR? |
|---|---|---|
| typo 修正、句読点、小さな rephrase | `master` 直接 commit | 不要 |
| 既存 skill の節内 refine、例追加 | `master` 直接 commit | 不要 |
| 既存 skill の新規節追加 | feature branch 推奨 | 不要だが歓迎 |
| 新規 skill 追加、skill 再編 | feature branch | **必須**、self-review でもよい |
| SKILL.md の frontmatter 変更 (name / description / license) | feature branch | **必須** |
| 破壊的変更 (既存節削除、仕様反転) | feature branch + major bump | **必須** + release note |

**迷ったら PR にする**。履歴と議論が残り、利用者への影響を第三者視点で見直せます。

---

## commit メッセージ規約

本リポジトリで一般に使う conventional commit の粒度:

```
<type>: <description>

<optional body>
```

使用する type:

| type | 用途 | 例 |
|---|---|---|
| `feat` | skill 機能追加 | `feat(skills/takumi): design mode に Phase 0d 追加` |
| `fix` | バグ / 記述誤り | `fix(verify/mutation): primary/advisory 判定表の tier 誤記修正` |
| `docs` | README / CLAUDE.md / docs/CONTRIBUTING | `docs(contributing): workflow.md 追加` |
| `refactor` | 再編・分割 (挙動不変) | `refactor(verify): scripts を examples/ に移動` |
| `chore` | `.gitignore`, LICENSE 文言 | `chore: LICENSE 年を更新` |

**日本語 OK**。絵文字は付けない (global rule 準拠)。Co-Authored-By: は `~/.claude/settings.json` でグローバル無効化済みなので付けない。

---

## semver 運用と release

semver 判断の詳細は [`skill-contract.md`](skill-contract.md) 参照。本ファイルは **release フロー** のみ扱います。

### release 判断フロー

```
複数 commit 積んだ → 新しい tag を打つか判断
  ├── 破壊的変更を含む → major bump (v2.0.0 等)
  ├── 新規 skill / 新節追加 → minor bump (v1.4.0 等)
  └── typo / refine のみ → patch bump (v1.3.1 等)
```

tag を打って push する前に、以下を確認してください (release guard 手順):

- `git fetch --tags` で remote の tag を取得 (漏れ防止)
- ローカルの未 push tag が origin と矛盾していないか (`git ls-remote --tags origin`)
- push したい version が semver (major/minor/patch) 判断と一致するか
- `gh skill publish` を手動で叩く場合は `gh --version` と対象 tag を目視確認

開発者ローカルの hook / skill で自動化している場合も、上の 4 点は自分で再確認する習慣を持ってください。

### release note

`gh release create vX.Y.Z --generate-notes` で commit ログから自動生成 + 手動追記。破壊的変更は "Breaking changes" 節で明示。

---

## git push と CI

- `git push` は**ユーザー手動承認**。Claude Code が勝手に push してはいけません
- main/master への force push は絶対 NG
- push 直前に `git diff origin/master...HEAD` を目視で 1 回確認する (差分全体の最終チェック)

---

## 開発ループのクイックリファレンス

```
1. 作業ブランチ確認 (or master で作業)
2. 編集 → wc -l で 300 行超えチェック → 超えたら分割
3. public-safety.md の grep 実行 → 0 件確認
4. git status / git diff で意図外変更がないか確認
5. conventional commit でまとめる
6. (PR 必須なら) gh pr create
7. ユーザーが push
```

---

## よくある落とし穴

| 症状 | 原因 | 対処 |
|---|---|---|
| `~/.claude/skills/takumi/` を編集してしまった | source-of-truth を間違えた | 変更内容を本リポジトリに cp、`~/.claude` 側は次回 publish で上書きされる |
| 1 commit が肥大 (数十ファイル) | refine と feat を混ぜた | `git reset HEAD~1` で unstage し、種類別に分割 |
| `.takumi/` が git status に出る | 新規 `.takumi/` 直下にファイル追加 | `.gitignore` は `.takumi/` を ignore 済、個別 pattern 追加不要 |
| tag 打ったら CI 失敗 | skill の frontmatter 不整合 | `skill-contract.md` で semver 再判定、`SKILL.md` frontmatter を再確認 |

---

## 関連

- [`skill-contract.md`](skill-contract.md) — semver と互換性判定
- [`public-safety.md`](public-safety.md) — commit 前スキャン
- [`opus-4-7.md`](opus-4-7.md) — effort / subagent 方針
- [`../../CLAUDE.md`](../../CLAUDE.md) — エントリ指針
