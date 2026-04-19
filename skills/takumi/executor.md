# /takumi の executor (内部責務)

`/takumi` 本体から参照される補助ドキュメント。計画 (`.takumi/plans/*.md`) を Wave 順に自動実行する executor。

人間が直接叩くコマンドではない。`/takumi` 内の計画提示 → 確認後に自動的に executor が動く。plan name のタイポ問題も `/takumi` が最新計画を知っているため発生しない。

## 4 ロール体制

| ロール | モデル | 担当 |
|--------|--------|------|
| 棟梁 | opus (自分) | 実行管理・まとめ・ユーザー報告 |
| 軍師 | gpt-5.4 (`codex exec`) | レビュー・設計判断 |
| 職人 | sonnet (Agent tool) | 実装 |
| 斥候 | haiku (Agent tool) | 調査 |

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

100 点統合版の wave gate は以下を**全て**通過する必要あり:

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
| `integrations.md` (同ディレクトリ) | 100 点統合版の接続ガイド |
| `telemetry-spec.md` (同ディレクトリ) | event emit の spec |
| `~/.claude/skills/takumi/verify/README.md` | verify run / recipe library |
| `~/.claude/skills/takumi/design/README.md` | L7 hard gate の定義 (ui 時) |
