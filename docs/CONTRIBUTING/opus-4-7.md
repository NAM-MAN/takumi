# opus-4-7.md — Opus 4.7 運用方針

> [!NOTE]
> **このファイルは takumi skill を開発・フォークする人向け** です。`/takumi` を使いたいだけの方は [README.md](../../README.md) を参照してください。

2026 年 4 月時点の Claude Opus 4.7 (Claude Code 経由) の公式推奨と本リポジトリの適用方針。根拠は [Best practices for using Claude Opus 4.7 with Claude Code](https://claude.com/blog/best-practices-for-using-claude-opus-4-7-with-claude-code) (Anthropic 公式 blog)。

---

## 変わった 3 点 (4.6 → 4.7)

1. **既定 effort が `xhigh`** に上がった。大抵の agentic coding は `xhigh` で十分
2. **Extended thinking の固定 budget は廃止**。adaptive thinking に変わり、model が文脈から判断
3. **response length が適応的**。簡単な質問には短く、分析には長く

追加で観測された傾向:
- tool 呼び出し頻度が減り、代わりに reasoning を長くする
- subagent は spawn しないと「動かない」と誤解されがちだが、自分で 1 response で済ますほうが良いケース多
- overthinking が減った (max でも以前ほど冗長化しない)

---

## effort level ガイド

| level | 用途 | token/latency コスト |
|---|---|---|
| `low` / `medium` | 短文応答、trivial な typo 修正、ファイル探索結果の整形 | 最小 |
| `high` | 並行セッション多い時、scope が狭い feature 実装 | 中 |
| **`xhigh` (既定)** | 大半の agentic coding、設計判断、review、migration 検討 | 中〜高 |
| `max` | 真に難しい問題 (arch 決定、legacy 大改修、複雑な security 判断、本番事故分析) | 高、overthinking リスク |

### 本リポジトリの既定

- Claude Code のユーザー設定依存 (ユーザーが `xhigh` を既定にしている想定)
- 本リポジトリは docs 中心なので `xhigh` 固定で十分
- `max` を明示起動する条件は [`review-process.md`](review-process.md) 参照

---

## subagent 発火条件 (抑制優先)

公式 blog 直接引用 (閲覧済):

> "Do not spawn a subagent for work you can complete directly in a single response. Spawn multiple subagents in the same turn when fanning out across items or reading multiple files."

### 本リポジトリの運用

| 状況 | subagent? |
|---|---|
| 1 ファイル読む / 編集する | NO。自分で |
| 3-5 ファイルを grep で探す | NO。自分で Bash grep |
| 広範な探索 (patterns, keywords が複数・深さ不明) | YES、`Explore` 系 1 本 |
| 独立ドメイン並列 (security 分析 + perf 分析 + a11y 分析) | YES、同 turn で 3 本 fan-out |
| 1 本の大きな実装作業 | NO。自分で (`TaskCreate` でタスク管理) |
| 実験的な試行を複数並行 | YES、worktree isolation で |

### anti-pattern (やってはいけない委譲)

- 「ファイルを読んでください」だけの指示で Explore に丸投げ → 自分で `Read`
- 1 関数のリファクタを agent に → 自分で `Edit`
- review のために `code-reviewer` を起動するが、自分でも読める量 (<300 行) → 自分で review し、疑問点だけ agent

---

## 軍師 (cross-model review) の選択

takumi の 軍師 ロールは GPT 系列による cross-model 敵対的レビュー。利用者環境で 3 tier から選択:

- **`copilot`** (Copilot Pro) — 定額、GPT-5.4、既存ユーザーのみ (新規停止中)
- **`codex`** (ChatGPT Plus) — 従量または月次、安定
- **`opus-max`** 自己レビュー — 常に利用可、ただし **劣化 mode** (同モデル系列のため盲点分離効果が激減)

### quota rotation (両方持ちの user)

両方契約してクォータを monthly rotate させる利用パターンが典型的 (「月初 copilot 使い切り→ codex に移行→翌月 copilot 復活」)。takumi は **quota を自動チェックせず user preference で切替**:

- `.takumi/profiles/env.yaml` の `preference` フィールドに宣言
- 自然言語で切替: 「軍師を codex に切り替えて」「gunshi copilot」等
- クォータが尽きたと気付いたら user が切り替える (自動検知しない)

発火基準 (cost-aware):
- **MUST** (公開レビュー / pilot 設計 / breaking change): available 最上位で必ず実行
- **SHOULD** (大規模 plan / critical change): 既定 on、current preference 使用
- **MAY** (中規模): Tier 1/2 のみ、opus-max なら skip
- **SKIP** (小規模 / ルーチン): 呼ばない

詳細 (exact 呼出構文 / detection / quota rotation) は `skills/takumi/executor.md` の「軍師 routing (3-tier + quota rotation)」節を参照。

---

## adaptive thinking のプロンプト誘導

固定 budget 指定は効かなくなったが、**自然言語での誘導は依然有効**:

- 「慎重に段階的に考えて」「各選択肢の trade-off を列挙してから選んで」 → deeper thinking
- 「速度優先で短く答えて」「1 段階で決めて」 → faster
- 「この問題は本番事故の可能性があるので時間かけて良い」 → max 相当の深さ

本リポジトリは docs 中心なので、**ほとんどの作業は誘導不要**。skill 本体の破壊的変更の議論、semver 判断、公開前 review だけ誘導が効く場面。

---

## response length の明示

Opus 4.7 は「簡単なら短く、分析なら長く」を勝手に判断するが、外すことがある。以下を明示する習慣:

- 「1 文で要点だけ」「3 行以内で」 → 短縮
- 「網羅的に列挙して」「table 形式で」 → 構造化
- 本リポジトリの md 編集: **本文は簡潔に、相互参照は多めに** が CLAUDE.md 原則

---

## 4 ロール (takumi skill 内部) との関係

takumi skill は 4 ロール体制 (棟梁/軍師/職人/斥候) を定義していますが、これは **takumi が解くタスクの中での委譲設計** です。本 `opus-4-7.md` の subagent 抑制ルールとは**直交** (別次元)。

- takumi 利用者が `/takumi` で依頼 → 棟梁が必要に応じて軍師/職人/斥候を spawn (これは takumi の設計)
- 本リポジトリの**開発者**が takumi を改善する → 開発者 (Claude Code) が subagent を spawn するかは Opus 4.7 ルールに従う

混同しないこと。

---

## チェック: 自分が subagent を spawn しようとしたら

1. この作業は 1 response で終わる? → YES → 自分で
2. 独立ドメインで本当に並列 fan-out か? → NO → 自分で
3. 並列ではなく直列で済む? → YES → 自分で
4. 上記 3 つ全部 NO で、かつ agent description に合致する → spawn

---

## 関連

- [`review-process.md`](review-process.md) — レビュー時の effort / subagent 選択
- [`workflow.md`](workflow.md) — 開発サイクル
- [`../../CLAUDE.md`](../../CLAUDE.md) — エントリ指針
- 外部: [Anthropic 公式: Opus 4.7 best practices](https://claude.com/blog/best-practices-for-using-claude-opus-4-7-with-claude-code)
