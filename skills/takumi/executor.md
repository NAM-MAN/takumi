# /takumi の executor (内部責務)

`/takumi` 本体から参照される補助ドキュメント。計画 (`.takumi/plans/*.md`) を Wave 順に自動実行する executor。

人間が直接叩くコマンドではない。`/takumi` 内の計画提示 → 確認後に自動的に executor が動く。plan name のタイポ問題も `/takumi` が最新計画を知っているため発生しない。

## 4 ロール体制

| ロール | モデル | effort 既定 | 担当 |
|--------|--------|---|------|
| 棟梁 | Opus 4.7 (自分) | xhigh | 実行管理・まとめ・ユーザー報告・**1 response で済む作業は自分で処理** |
| 軍師 | gpt-5.4 (`codex exec`) | (max 相当) | クロスモデルレビュー・設計判断 |
| 職人 | sonnet (Agent tool) | xhigh | 中規模以上の実装 |
| 斥候 | haiku (Agent tool) | medium | 広範・深さ未定の探索 |

### Opus 4.7 delegation policy

Anthropic 公式指針 ([blog](https://claude.com/blog/best-practices-for-using-claude-opus-4-7-with-claude-code)) に従い subagent spawn を**抑制**する:

- **棟梁が自分で完結できる作業は spawn しない**: 1 response で `Read` / `Edit` / 小範囲 `grep` が済む範囲は自分で処理
- **職人 (sonnet) を spawn する条件**: 規模「中」以上の実装、複数ファイル跨ぎ、長時間回る test iteration、Wave ごとの明示的実装タスク
- **斥候 (haiku) を spawn する条件**: 深さ未定の広範探索、複数 keyword × 複数ディレクトリ、独立ドメイン並列 fan-out (例: security / perf / a11y 同時)
- **軍師 (gpt-5.4) を spawn する条件**: 計画レビュー、設計判断、公開前レビュー、破壊的変更時のクロスモデル確認

ロールは「呼ぶ義務」ではなく「必要なら呼べる道具」。`max` effort は真に難しい問題 (arch 決定 / 複雑な security 判断 / legacy 大改修) のみ使用、overthinking リスクあり。

### 軍師 routing (3-tier + quota rotation)

軍師は **GPT 系列によるクロスモデルレビュー** が本質。以下 3 tier の **available なものから user が preference を設定**する。毎回 quota を自動チェックするのは重いので「雑に切り替え」モデルを採用:

| tier | ツール | モデル | 特性 |
|---|---|---|---|
| **copilot** | `copilot` (Copilot Pro) | gpt-5.4 | 定額・月次クォータ。新規受付は停止中、既存契約者のみ |
| **codex** | `codex exec` (ChatGPT Plus) | gpt-5.4 | 従量またはクォータ制、新規契約可能 |
| **opus-max** | Opus 4.7 max 自己レビュー | — | 常に利用可だが**劣化 mode** (同モデル系列 cross-model diversity なし)。critical MUST のみ最終手段 |

### 切り替え方針 (user-declared preference)

**両方持ちのユーザーがよくいる**: 月初は copilot (定額で実質無料)、使い切ったら codex (従量)、翌月また copilot、という rotation が現実的な使い方。

- 自動クォータ検出は**しない** (毎回 API 叩くオーバーヘッドと複雑さが cost に見合わない)
- user が preference を declare、takumi はそれを使う
- 切り替えは**自然言語**: 「軍師を codex に切り替えて」「gunshi copilot」等の発話を `.takumi/profiles/env.yaml` 更新に mapping
- preference が unavailable なら次善策に自動 fallback (user への通知付)

### 検出と preference (`.takumi/profiles/env.yaml`)

Step 0 で 1 度だけ**検出**、user が**preference** 設定:

```yaml
gunshi:
  detected_at: 2026-04-24T...
  availability:
    copilot: true | false       # `command -v copilot` 結果
    codex:   true | false       # `command -v codex` 結果
  preference: copilot | codex | opus-max  # user 宣言 (null なら available 順で自動)
  last_switched_at: 2026-04-24T...         # 切替日時 (月次 rotation の参考用)
```

初回 detection 後、preference が null の場合の既定順:
1. availability.copilot → `copilot`
2. availability.codex → `codex`
3. どちらも false → `opus-max` (警告付)

user が「軍師を codex に切り替えて」と言ったら preference を書き換え、以降はそれを使う。availability が false の tier に切り替え要求があれば拒否 + 警告。

### 軍師 発火基準 (cost-aware)

全タスクで軍師を呼ぶのは過剰。重要度で階層化:

| 重要度 | 発火 | 使う Tier |
|---|---|---|
| **MUST** — 公開レビュー / pilot 実験設計 / breaking change / semver major | 必須 | available 最上位 (1→2→3) |
| **SHOULD** — 大規模 plan / critical keyword 含む diff | 既定 on、user opt-out 可 | 同上 |
| **MAY** — 中規模 plan / 設計検証 | 既定 off、user opt-in | Tier 1 のみ、なければ skip |
| **SKIP** — 小規模 / ルーチン | 呼ばない | — |

Tier 3 (opus-max) は MUST タスクでのみ「最後の手段」として起動する。劣化 mode なので結果に `⚠ opus-max fallback` を明記。

### 各 tier の呼出パターン (exact syntax)

```bash
# copilot (Copilot Pro)
# -p: プロンプト / --silent: ログ抑制して応答のみ / --cwd: 作業 dir
# --available-tools で read-only 相当 (view/grep/glob/web_fetch のみ許可)
copilot -p "{プロンプト}" \
  --model gpt-5.4 \
  --cwd "$(pwd)" \
  --available-tools="view,grep,glob,web_fetch" \
  --silent \
  > .takumi/notepads/{name}/oracle-task-{N}.md
```

```bash
# codex exec (ChatGPT Plus)
codex exec -m gpt-5.4 -s read-only -C "$(pwd)" \
  -o .takumi/notepads/{name}/oracle-task-{N}.md \
  "{プロンプト}" 2>&1 | tail -100
```

```bash
# opus-max 自己レビュー (fallback、劣化 mode)
# 棟梁 (Opus 4.7 main session) が自身に指示を出す:
#   「以下を max effort で敵対的に自問自答してください。
#    cross-model 確認ではないため同系列の盲点が残る可能性に注意:
#    {プロンプト}」
# 結果を .takumi/notepads/{name}/oracle-task-{N}.md に書き出し、
# 冒頭に "⚠ Tier: opus-max self-review (degraded mode)" を明記。
```

これらの tier の quality 等価性は pilot で検証予定 (`docs/CONTRIBUTING/pilot-driven-development.md` の方法論に従い、別リポジトリで arm A/B/C 比較)。

## Step 0 — 計画読み込み

1. `.takumi/state.json` を読む
2. 引数あり → `.takumi/plans/{name}.md` を探す
3. アクティブ計画なし → `.takumi/plans/*.md` を一覧、ユーザーに選ばせる
4. `in_progress` / `paused` → 最初の `- [ ]` から再開
5. ノートパッド初期化: `.takumi/notepads/{name}/` (learnings.md, issues.md)
6. state.json 更新: `"status": "in_progress"`

## Step 1 — Wave 順に実行

Wave は順番に。各タスクを以下のループで処理。

### 1. 準備
- `.takumi/notepads/{name}/learnings.md` を読む
- 計画からタスクの **ac_ids / verify_profile_ref / design_profile_ref / 何を / ロール / やらない / 検証** を読む

### 2. ロール振り分け

**職人 (sonnet)** — 実装タスク:
```
Agent tool:
  subagent_type: "general-purpose" (テスト付きなら "tdd-guide")
  model: "sonnet"
  prompt: TASK / EXPECTED OUTCOME / MUST NOT / CONTEXT / verify_profile 参照
```

**軍師 (gpt-5.4)** — レビュー・設計判断:
以下は **Tier 2 (codex exec)** の例。他 tier の選択は上記「軍師 routing」参照。

```bash
codex exec -m gpt-5.4 -s read-only -C "$(pwd)" \
  -o .takumi/notepads/{name}/oracle-task-{N}.md \
  "{タスク内容 + 検証基準 + ノートパッドの文脈}"
```

**斥候 (haiku)** — 調査:
```
Agent tool:
  subagent_type: "Explore"
  model: "haiku"
  prompt: "{調査内容}"
```

### 3. 検証 (Wave gate)

wave gate は以下を**全て**通過する必要あり:

| フェーズ | 内容 |
|---------|------|
| A. コード確認 | 変更ファイルを読む、ミューテーション・スコープ逸脱チェック |
| B. build | `pnpm build` / `tsc` |
| C. test pass | `pnpm test --run` |
| **D. mutation gate** | `verify_profile_ref.mutation_floor` を下回らない (task tier の値) |
| **E. L7 hard gate** | `design_profile_ref.layout_invariants.hard` を全て満たす (ui 時のみ) |
| F. oracle_review | 軍師 の 400 字以内最終確認 |

**不合格 → リトライ最大 3 回 → issues.md に記録してスキップ**

### 4. 記録
- `.takumi/notepads/{name}/learnings.md` に追記
- `.takumi/telemetry/profile-usage.jsonl` に `gate_passed` / `gate_failed` event emit

### 5. 完了マーク
計画ファイルの `- [ ]` → `- [x]`

### 6. 自動継続
次のタスクへ。ユーザーに聞かない。

## Step 1.5 — Probe 連携 (Probe 計画実行中のみ)

Probe 計画 (`.takumi/plans/probe-*.md`) を実行中のみ有効。通常 plan では省略。

### 自動点検 (毎 Wave 完了後、2-3 分)

1. **発見の統合**:
   - `.takumi/drafts/discovered-*.md` を読み、ICE (Impact×Confidence×Ease, 各 1-5) 採点
   - ICE >= 40 → 未実行 Wave 末尾に新タスク追加
   - ICE < 40 → `.takumi/sprints/{日付}/deferred.md`
   - 処理済み → `.takumi/drafts/archive/`

2. **メトリクス記録**:
   ```bash
   pnpm test:run 2>&1 | tail -5
   pnpm typecheck 2>&1 | tail -3
   ```
   `.takumi/sprints/{日付}/metrics.md` に追記

3. **learnings.md に点検結果を記録**

### 定期点検 (3 Wave ごと、5-10 分)

1. 変更ファイル特定: `git diff --name-only HEAD~{3Wave 分}`
2. 関連発見者の**再実行** (haiku 並列、変更ファイルに限定)
3. 発見者精度更新: `.takumi/sprint-config.md` に採用率記録
4. 新規発見を ICE 採点 → 計画追加
5. 進捗レポート → learnings.md + ユーザー簡潔報告

## Step 2 — 最終検証

F1-F4 を実行。F4 (コードレビュー) は 軍師 委譲:

```bash
codex exec -m gpt-5.4 -s read-only -C "$(pwd)" \
  -o .takumi/notepads/{name}/final-review.md \
  "全変更を敵対的レビュー: 品質/immutability/error handling/scope compliance/境界条件/競合"
```

失敗 → 修正 + 再検証 (最大 2 ラウンド)。

## Step 3 — 完了

1. state.json: `"status": "completed"`
2. 日本語まとめ: 完了タスク数、スキップ、学び、`git diff --stat`
3. `/takumi` が「計画 X が完了しました」とユーザーに報告

## コンテキスト保護

Agent 内コンテキスト残量 20% を切ったら:

1. 実行を一時停止
2. 再開ファイル生成 (`.takumi/sprints/{日付}/resume.md`):
   ```markdown
   # 再開情報: {日付} {時刻}
   ## 中断地点
   - 計画: {計画ファイルパス}
   - 完了 Wave: {N} (タスク {N} 件完了)
   - 残 Wave: {N} (タスク {N} 件)
   ## 直近の学び (learnings.md 最新 5 件)
   ## 再開: /takumi continue
   ```
3. ユーザー通知: 「Wave {N} まで完了。/takumi continue で再開できます」

## 関連リソース

| file | 用途 |
|---|---|
| `SKILL.md` (同ディレクトリ) | /takumi 本体 |
| `test-strategy.md` (同ディレクトリ) | verify_profile 選定ロジック |
| `integrations.md` (同ディレクトリ) | 新規 skill 連携ガイド |
| `telemetry-spec.md` (同ディレクトリ) | event emit の spec |
| `verify/README.md` (同階層配下) | verify run / recipe library |
| `design/README.md` (同階層配下) | L7 hard gate の定義 (ui 時) |
