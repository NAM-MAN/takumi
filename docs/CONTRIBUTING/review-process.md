# review-process.md — レビュー運用と max 発動基準

> [!NOTE]
> **このファイルは takumi skill を開発・フォークする人向け** です。`/takumi` を使いたいだけの方は [README.md](../../README.md) を参照してください。

Claude Code 組み込みの `/review` / `/security-review` と、takumi 側のレビューフローを区別し、**いつ `max` effort を使うか** を決めます。max 発動基準は一度 pilot 検証済 (下記「max / 軍師 発動方針」節)、以降も運用で必要に応じて調整します。

---

## レビュー手段の棲み分け

| 手段 | 対象 | 起動 | effort |
|---|---|---|---|
| `/review` (Claude Code 組み込み) | PR / 現在の branch diff | slash command | xhigh 既定 |
| `/security-review` (組み込み) | 現在の branch の security 変更 | slash command | xhigh 既定 |
| `code-reviewer` agent | 書いた直後のコード | Agent tool | agent 定義依存 |
| `security-reviewer` agent | 認証・入力処理・秘密情報周り | Agent tool | agent 定義依存 |
| takumi 軍師 (GPT-5.x via codex / copilot / opus-max fallback、env.yaml driven、auto-fallback 5.5→5.4) | 計画・設計の敵対的レビュー | `.takumi/profiles/env.yaml` の preference に従う (`executor.md` の「軍師 routing」+「GPT-5.5 upgrade path」参照) | max 相当 |
| takumi 自己レビュー | 棟梁が職人成果物を見る | 棟梁の直接読み込み | xhigh 既定 |

**棟梁 = Opus 4.7 自身 (Claude Code の main session)。軍師 = 別モデル (GPT-5.x、env.yaml で 5.5/5.4 切替) での cross-model review。**

---

## 既定: xhigh で十分な場面

- 通常の code review (一般的なバグ・logic・style)
- docs の編集レビュー
- skill refine (semver patch)
- 中規模 PR (<500 LoC diff)

---

## max / 軍師 発動方針 (pilot 結果に基づく)

pilot (n=24、3 arm 比較、cross-model 含む) の結果を踏まえた発動方針。pilot 生データ (review CSV / telemetry jsonl / 結果 md) は pilot-driven-development.md 原則に従い pilot repo ローカルに保持、skill には結論のみ反映。

### Pilot 主要結論

| 方式 | 結論 |
|---|---|
| critical keyword で**毎回** max 発動 (arm B) | **採用不可 (arm A より劣化)** — tp/trial=0.33 (A=1.00 の 1/3)、fp/tp=4.5 (A=2.5)。critical keyword 検出による max 発動は逆効果 |
| 全 review で max 発動 (arm C) | **効果大、cost 高** — tp/trial=1.75 (A の 1.75 倍)、fp/tp=0.5 (A の 1/5)、cost 9-13x。signal-to-noise 圧倒的に良好 |
| 選択的発動 (下記 policy) | **data 裏付けあり、採用** — post-hoc 分析で large diff / critical keyword hit での arm C advantage を確認 |

### 選択的発動 policy (data 裏付け)

> [!NOTE]
> 本 policy は pilot の post-hoc 分析 (n=20 trials、軍師 automated blind verdict) で以下の通り裏付けられている:
> - **large diff trigger**: L bucket (>200 LoC) で arm C の advantage = +2.00 critical/trial、S bucket では +0.00
> - **critical keyword trigger**: arm C の kw_hit で critical/trial=1.60、kw_nohit=0.33 (4.8 倍の差)
> - **automated verdict の signal-to-noise**: arm C fp/tp=0.5、arm A=2.5、arm B=4.5 → arm C が圧倒的に良好 (1 tp あたりの誤検知が最少)
> - **seed detection**: 全 arm 1/1 (seed bug は obvious すぎ、差は real PR で出る)
>
> 「公開 release」「自信なし」の 2 trigger は pilot corpus で直接測定されていないため依然 heuristic。
>
> arm B (critical keyword → xhigh+max on hunks) は採用しない: tp/trial=0.33 (arm A の 1/3)、fp/tp=4.5。xhigh+max を hunk レベルで mix すると noisy な合成 output になり、単独の max (arm C) より悪化。代わりに、critical keyword hit 時は **arm C 相当 (軍師 max の全件 review)** を発動するのが有効。

以下の**いずれか**を満たす場合のみ軍師 (cross-model) or max effort を発動:

1. **公開 release review** (MIT 公開リポジトリへの commit、binary release) — 常時
2. **large diff** (diff size > 500 LoC、または複数 file 跨ぎ) — cost 妥当
3. **critical-looking change** — 以下のパターン検出時:
   - DB migration 追加 / ALTER TABLE / DROP
   - authentication/authorization path 変更
   - payment / billing / transaction 系ロジック変更
   - 秘密情報の扱い (credential / token / api_key)
   - 新規 API endpoint で user input を external fetch
4. **自信のない判断** — 棟梁が review 結論に不安を感じる時 (破壊的変更 / semver major 判定等)

上記いずれも該当しない通常 PR (< 500 LoC、インクリメンタル機能追加、dead code 削除等) は **Opus xhigh の自己 review で完結**。

### critical keyword リスト (参考、検出 trigger としては**補助**)

corpus に依存して hit 率が大きく変動するため、単独の発動 trigger としては不適。ドメイン適合で手動調整前提:

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
| セキュリティ | `csrf`, `cors`, `xss`, `sql`, `inject`, `ssrf`, `rce` |

### Pilot limitation (採用結論の信頼性)

- **本質的に cross-model 比較**: arm A (Opus xhigh) vs arm C (GPT-5.x max、pilot 当時は 5.4) の差は effort でなく model 系列差。Claude 内の xhigh vs max 比較は別 pilot が必要
- **n=8 per arm**: bootstrap CI 未実行、effect size の信頼区間不明
- **maintainer blind verdict 未実施**: false positive rate は未確定 (0 扱い)
- **corpus 偏り**: 今回の pilot repo が特定ドメインで auth/payment 系語彙が希薄、general 結論には限界

これらの limitation は `pilot-driven-development.md` の原則に従い明記し、将来の pilot で埋める。

---

## 自分 (Opus 4.7 main) で直接 review する vs agent に委ねる

[`opus-4-7.md`](opus-4-7.md#subagent-発火条件-抑制優先) に従い、**自分で読める量は自分で review**:

| 規模 | 手段 |
|---|---|
| 1 file, <300 行 | 自分で `Read` + 目視 |
| 2-5 file, <1000 行合計 | 自分で `Read` + 目視 (TaskCreate で進捗) |
| 6+ files, >1000 行 | `/review` 組み込み、または `code-reviewer` agent 1 本 |
| 独立ドメイン別 (security / perf / a11y) | agent 3 本並列 fan-out |
| arch 影響 / legacy 移行 | 軍師 (copilot / codex / opus-max の preference に従う) に依頼 |

---

## 軍師 (3-tier routing: copilot / codex / opus-max) の発動条件

以下のいずれかで自動検討:

- 新規 skill 追加 (破壊的変更の検知)
- semver major bump 判断
- 公開前の最終レビュー (`docs/CONTRIBUTING/public-safety.md` の checklist 通過後)
- 設計書・実験計画・RFC のクロスレビュー
- 棟梁が「主張に自信が持てない」と判断した時

**コマンドテンプレート** (tier は `.takumi/profiles/env.yaml` preference.tier に従う、model は preference.model で 5.5/5.4/auto 切替、詳細は `skills/takumi/executor.md` 参照):

<!-- hardening v2 (2026-05-03): stdin heredoc / `timeout 600s` / 5.5 default / prompt 1.5KB 上限。
  hang/4xx → subagent (Sonnet via Agent tool) Tier 2 fallback。copilot は default fallback chain から除外 (user override 時のみ)。
  詳細: `skills/takumi/executor.md`「invocation hardening v2」。 -->
```bash
# Tier 2 (codex exec、ChatGPT Plus、hardening v2) の例
timeout 600s codex exec -m gpt-5.5 -s read-only --skip-git-repo-check -C "$(pwd)" - <<'PROMPT' 2>&1 | tail -100
git diff master...HEAD を敵対的にレビュー:
(1) 破壊的変更の見逃し, (2) semver 判定の妥当性,
(3) public repo として公開不可な情報, (4) 既存 skill との論調整合性。
出力 1.5KB 以内。
PROMPT

# Tier 1 (copilot、Copilot Pro / Pro+) の例 (default fallback chain から除外、user override 時のみ)
# copilot -p "git diff master...HEAD を敵対的にレビュー..." \
#   --model gpt-5.5 --cwd "$(pwd)" \
#   --available-tools="view,grep,glob,web_fetch" --silent
```

---

## レビュー結果の反映

- **CRITICAL / HIGH** の指摘: 反映しないと commit しない
- **MEDIUM**: 基本反映、時間制約あれば issue に残して commit
- **LOW / nits**: 判断で反映 or 放置

本リポジトリは public なので **public-safety 違反** は常に CRITICAL 扱い。

---

## 発動基準の見直し方針 (次回 pilot での観察項目)

現行方針を改訂する時は以下を観察してから決める:

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
