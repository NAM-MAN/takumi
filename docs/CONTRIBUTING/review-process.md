# review-process.md — レビュー運用と max 発動基準

> [!NOTE]
> **このファイルは takumi skill を開発・フォークする人向け** です。`/takumi` を使いたいだけの方は [README.md](../../README.md) を参照してください。

Claude Code 組み込みの `/review` / `/security-review` と、takumi 側のレビューフローを区別し、**いつ `max` effort を使うか** を決めます。max 発動基準は**経験的に検証が必要**なため、このファイルの案は暫定。運用しつつ必要に応じて調整します。

---

## レビュー手段の棲み分け

| 手段 | 対象 | 起動 | effort |
|---|---|---|---|
| `/review` (Claude Code 組み込み) | PR / 現在の branch diff | slash command | xhigh 既定 |
| `/security-review` (組み込み) | 現在の branch の security 変更 | slash command | xhigh 既定 |
| `code-reviewer` agent | 書いた直後のコード | Agent tool | agent 定義依存 |
| `security-reviewer` agent | 認証・入力処理・秘密情報周り | Agent tool | agent 定義依存 |
| takumi 軍師 (codex exec gpt-5.4) | 計画・設計の敵対的レビュー | `codex exec -m gpt-5.4 ...` | max 相当 |
| takumi 自己レビュー | 棟梁が職人成果物を見る | 棟梁の直接読み込み | xhigh 既定 |

**棟梁 = Opus 4.7 自身 (Claude Code の main session)。軍師 = 別モデル (gpt-5.4) での cross-model review。**

---

## 既定: xhigh で十分な場面

- 通常の code review (一般的なバグ・logic・style)
- docs の編集レビュー
- skill refine (semver patch)
- 中規模 PR (<500 LoC diff)

---

## 暫定案: max を発動する候補 (Wave 5 で確定)

以下のキーワード or パターンが diff に含まれる場合、**max 相当の深さで再レビュー** を検討する (適用効果は運用で確認):

### critical keyword 候補

| カテゴリ | キーワード例 |
|---|---|
| 認証 | `auth`, `session`, `token`, `cookie`, `JWT`, `oauth`, `login` |
| 権限 | `permission`, `role`, `admin`, `privilege`, `ACL`, `RBAC` |
| 支払い | `payment`, `billing`, `charge`, `refund`, `stripe`, `paypal` |
| DB スキーマ | `migration`, `ALTER TABLE`, `DROP`, `schema`, `rollback` |
| 削除 | `delete`, `remove`, `drop`, `rm -rf`, `truncate` |
| 強制操作 | `--force`, `--no-verify`, `-f`, `--skip` |
| 秘密情報 | `secret`, `private_key`, `api_key`, `password`, `credential` |
| 並行制御 | `lock`, `mutex`, `transaction`, `race`, `atomic` |
| 本番 | `production`, `prod`, `mainnet`, `live` |

### 発火ルール (暫定)

```
if diff contains any critical_keyword:
    phase 1: xhigh で /review 実行 (通常)
    phase 2: critical 周辺 hunk のみ max で再レビュー
    phase 3: 2 つのレビュー結果を merge して提示
else:
    xhigh のみ
```

**運用で測定する指標**: phase 2 の追加 max review で critical-issue 発見数が増えるか、false positive が許容範囲か、cost overhead が ≤ 2x に収まるか。

---

## 自分 (Opus 4.7 main) で直接 review する vs agent に委ねる

[`opus-4-7.md`](opus-4-7.md#subagent-発火条件-抑制優先) に従い、**自分で読める量は自分で review**:

| 規模 | 手段 |
|---|---|
| 1 file, <300 行 | 自分で `Read` + 目視 |
| 2-5 file, <1000 行合計 | 自分で `Read` + 目視 (TaskCreate で進捗) |
| 6+ files, >1000 行 | `/review` 組み込み、または `code-reviewer` agent 1 本 |
| 独立ドメイン別 (security / perf / a11y) | agent 3 本並列 fan-out |
| arch 影響 / legacy 移行 | 軍師 (codex exec gpt-5.4) に依頼 |

---

## 軍師 (codex exec gpt-5.4) の発動条件

以下のいずれかで自動検討:

- 新規 skill 追加 (破壊的変更の検知)
- semver major bump 判断
- 公開前の最終レビュー (`docs/CONTRIBUTING/public-safety.md` の checklist 通過後)
- 設計書・実験計画・RFC のクロスレビュー
- 棟梁が「主張に自信が持てない」と判断した時

**コマンドテンプレート**:

```bash
codex exec -m gpt-5.4 -s read-only -C "$(pwd)" \
  "git diff master...HEAD を敵対的にレビュー: (1) 破壊的変更の見逃し, (2) semver 判定の妥当性, (3) public repo として公開不可な情報, (4) 既存 skill との論調整合性" \
  2>&1 | tail -100
```

---

## レビュー結果の反映

- **CRITICAL / HIGH** の指摘: 反映しないと commit しない
- **MEDIUM**: 基本反映、時間制約あれば issue に残して commit
- **LOW / nits**: 判断で反映 or 放置

本リポジトリは public なので **public-safety 違反** は常に CRITICAL 扱い。

---

## 発動基準の見直し方針

暫定案を改訂する時は以下を観察してから決める:

- **critical issue の検出率**: max 併用で xhigh 単独より明確に (+15% 目安) 見つかるか
- **false positive の増加**: 誤検知で maintainer 時間を食っていないか (A 比で +10pt 以内)
- **cost 倍率**: xhigh 比で 2 倍以内に収まるか
- **体感品質**: 深追いで有害な overthinking / 自己矛盾が出ていないか

上の 4 点が全部緑であれば採用、どれか 1 つでも赤なら見送り or 条件緩和 (例: max 対象 hunk をさらに絞る)。

---

## 関連

- [`opus-4-7.md`](opus-4-7.md) — effort / subagent 方針
- [`workflow.md`](workflow.md) — 開発サイクル
- [`public-safety.md`](public-safety.md) — public repo 要件
- [`../../CLAUDE.md`](../../CLAUDE.md) — エントリ指針
- 外部: [Anthropic 公式: Opus 4.7 best practices](https://claude.com/blog/best-practices-for-using-claude-opus-4-7-with-claude-code)
