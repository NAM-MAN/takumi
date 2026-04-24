# CLAUDE.md — takumi リポジトリ開発ガイド (縮約版)

> [!IMPORTANT]
> **このファイルはこのリポジトリの開発者・フォーカー向け** です。`/takumi` を使いたいだけの方は [README.md](README.md) を参照してください。Claude Code がこのリポジトリを読み書きする時の原則だけ掲載しています。

## 必須 4 原則

1. **local-first**: このリポジトリ内で作業中は `~/.claude/skills/takumi/**` や `~/.claude/rules/**` を読まない。参照すべきは `references/*.md`, `skills/takumi/**`, `docs/CONTRIBUTING/**`, `README.md` のみ
2. **公開前提**: 個人情報・絶対パス・社内 URL・開発者の他リポジトリ名は commit に入れない (機械 grep で事前除去)
3. **プロダクションコードを置かない**: `.ts` 等の実行コードは `skills/**/examples/` 配下に `EXAMPLE ONLY` 明記で
4. **Opus 4.7 既定**: effort = xhigh、`max` は真に難しい問題のみ、subagent は並列 fan-out の時だけ spawn

## 詳細ガイド (docs/CONTRIBUTING/)

| ファイル | 用途 |
|---|---|
| [`local-sources.md`](docs/CONTRIBUTING/local-sources.md) | ~/.claude を読まないルールの根拠と例外 |
| [`public-safety.md`](docs/CONTRIBUTING/public-safety.md) | commit 前スキャンのパターンと手順 |
| [`skill-contract.md`](docs/CONTRIBUTING/skill-contract.md) | SKILL.md 規約と semver 判定 |
| [`workflow.md`](docs/CONTRIBUTING/workflow.md) | 開発サイクル・commit 規約・release |
| [`opus-4-7.md`](docs/CONTRIBUTING/opus-4-7.md) | effort / subagent / adaptive thinking |
| [`review-process.md`](docs/CONTRIBUTING/review-process.md) | レビュー運用と max 発動ルール |
| [`pilot-driven-development.md`](docs/CONTRIBUTING/pilot-driven-development.md) | 新規 skill / rule の pilot 駆動採否フロー |

必要なものだけ読む (全部読まない)。

## 禁止

- `~/.claude/skills/takumi/**` を編集する (配布先なので次の publish で上書きされる)
- `git push` を勝手に実行する (ユーザー手動承認)
- `.takumi/` 配下のローカルメモを commit する (`.gitignore` 済、追加しない)
- 既存 skill 契約を破壊的に変更する (semver 判断は `docs/CONTRIBUTING/skill-contract.md`)

このファイル自体も 40 行以下を保ち、肥大化したら `docs/CONTRIBUTING/` へ委譲する。
