---
name: takumi
description: "takumi の単一入口。計画・観点診断・全域棚卸し・設計・検証・リファクタを自然文で振り分ける。/takumi <自然文> で起動。サブコマンド構文は採用しない。"
license: MIT
---

# takumi: 単一入口スキル

ユーザーからの自然文を意図分類し、適切な内部モード (normal / probe / sweep / status / continue / override) に振り分ける唯一の skill。

計画は `.takumi/plans/{name}.md` に保存、確認後は executor (`executor.md` の内部責務) が Wave 順に自動実行する。人間が別途 `/exec` を叩く必要はない。

---

## 意図分類ルータ (最優先判定)

入力を以下の 6 モードに分類する。判定は「観点語 + 診断動詞」の組合せを基本条件とする。

| mode | 典型入力 | 内部委譲先 |
|---|---|---|
| **normal** | 「X 作って」「X 追加」「X 修正」(feature 実装) | 通常の plan フロー (Step 0-4) |
| **probe** | 「security 見て」「perf 心配」「a11y 調べて」(観点指定診断) | `probe/README.md` 参照、発見→選別→計画 |
| **sweep** | 「全般的に棚卸し」「リリース前総点検」「全次元見て」 | `sweep/README.md` 参照、8 次元並列発見 |
| **status** | 「今なに動いてる?」「状態見せて」 | `.takumi/state.json` を読んで 30 秒で提示 |
| **continue** | 「続きから」「再開」 | `state.json.mode` と `active_run_id` から復元 |
| **override** | 「止めて」「sweep 24h 停止」「hard gate を warning に」 | `.takumi/control/` の override ファイル更新 |

### 判定ルール

1. **観点語**(security / perf / a11y / ux / architecture / quality / concurrency 等)が単独 → 曖昧、normal 候補(例: 「security feature 追加」)
2. **観点語 + 診断動詞**(〜見て / 〜調べて / 〜心配 / 〜が怪しい)→ **probe に倒す**
3. **全般語**(全般 / 全体 / 総点検 / 棚卸し / リリース前)→ **sweep に倒す**
4. feature 実装語(追加 / 作って / 実装 / 修正)が主語 → **normal**
5. 曖昧なら 1 問だけ確認(「security feature を追加ですか、security 診断ですか?」)

語彙表と例文は `natural-language.md`。本 SKILL.md は決定木を保持、辞書は別ファイルで保守。

### probe mode の artifact contract (絶対保全)

probe フロー起動時、以下の成果物が揃わない限り backlog-mode へ進まない:

- `.takumi/sprints/{date}/profile.md` — 製品診断
- `.takumi/sprints/{date}/discoveries.md` — 発見結果 (MECE schema)
- `.takumi/sprints/{date}/backlog.md` — triage 済 (ICE + 反論者チェック)
- `.takumi/sprints/{date}/resume.md` — 中断時の再開情報
- `.takumi/sprints/{date}/retro-summary.md` — 完了レポート
- `.takumi/discovery-calibration.jsonl` — 発見者精度 ledger (append-only、継続学習)

### 発見者並列起動 (probe mode)

executor とは別の **discovery orchestrator** が fan-out/fan-in を担う。同期ポイントは 3 つ:

1. `discover all complete` barrier → `discoveries.md` 確定
2. `triage complete` barrier → `backlog.md` 確定
3. `backlog accepted` barrier → backlog-mode で plan 生成

発見者定義は `probe/roles/*.md` に分離予定(保守性優先)。`probe/discover.md` は「観点語 → 発見者 ID」のマッピング。

---

# 通常 plan フロー (normal mode)

ユーザーとの対話(または渡された要件)から高品質な Wave 計画を生成する。
インタビューが必要なら行い、要らなければ即生成。計画は `.takumi/plans/{name}.md` に保存、
確認後は executor (`executor.md` の内部責務) が Wave 順に自動実行する。

## 4ロール体制

| ロール | モデル | 担当 |
|--------|--------|------|
| 棟梁 | opus (自分) | 日本語インタビュー・計画作成・ディスパッチ |
| 軍師 | gpt-5.4 (`codex exec`) | 深い思考: 設計分析・計画レビュー・判断 |
| 職人 | sonnet (Agent tool) | 実装: コーディング・テスト・修正 |
| 斥候 | haiku (Agent tool) | 調査: コード検索・Web検索・ドキュメント |

軍師 起動コマンドと注意点は `executor.md` を参照。

## 補助ファイル (内部モードの詳細)

| ファイル / ディレクトリ | 用途 |
|---------|------|
| `natural-language.md` | 自然文 → 6 mode 判定辞書 |
| `self-multiplying.md` | 自己増殖型計画の詳細(大規模・品質改善系) |
| `backlog-mode.md` | probe / sweep から入った時の backlog → Wave 計画変換 |
| `probe/` | probe mode 内部 (discover.md / triage.md) |
| `sweep/` | sweep mode 内部 (quality-model.md / integration-playbook.md / reconcile.md) |
| `design/` | /design 機能 (ui/mixed 時の自動呼出) |
| `verify/` | L1-L6 recipe library |
| `verify-loop/` | 期間限定 mutation score 向上 loop |
| `strict-refactoring/` | refactor_profile_ref の policy |
| `executor.md` | Wave 自動実行 |
| `test-strategy.md` | AC-ID → verify_profile 選定 |
| `telemetry-spec.md` / `telemetry-schema.md` / `telemetry-report.md` | 儀式化 drift 検出 |
| `integrations.md` | 100 点統合版の接続ガイド |

## ファイル

| パス | 用途 |
|------|------|
| `.takumi/plans/{name}.md` | 計画ファイル（唯一の永続状態） |
| `.takumi/drafts/{name}.md` | インタビュー中のメモ |
| `.takumi/drafts/discovered-{id}.md` | 自己増殖: 職人 の発見 |
| `.takumi/state.json` | 状態管理 |

---

## Step 0 — プロジェクトモード判定と profiles 準備 (100 点統合版)

計画生成の前に以下を確認する。詳細は `integrations.md`。

### 0a. project_mode 判定

`CLAUDE.md` または `.takumi/project.yaml` から `project_mode` (ui / mixed / backend) を取得。未設定なら対話で確認。

- `ui` → `/design` mandatory、全 UI task に `design_profile_ref`
- `mixed` → UI を含む task のみ `design_profile_ref`
- `backend` → design 不要

### 0b. profiles 整備 (初回のみ)

`.takumi/profiles/{verify,design}/` が無ければ defaults を bootstrap:

```bash
mkdir -p .takumi/profiles/verify .takumi/profiles/design
cp ~/.claude/skills/takumi/verify-profiles-defaults/*.yaml .takumi/profiles/verify/
cp ~/.claude/skills/takumi/design/profiles-defaults/*.yaml .takumi/profiles/design/  # ui/mixed のみ
```

project 固有 profile は `.takumi/profiles/` に yaml を追加するだけ (registry 方式)。

### 0c. AC-ID 収集 (Step 3 インタビュー内で統合)

要件を `AC-{feature_short}-{seq}` の原子単位に分割 (例: `AC-AUTH-002`, `AC-PAY-004`)。
**Step 3 の対話で AI が発話から抽出・命名・分類**し、人間は一覧で OK/修正を確認するだけ。**人間が書く必要はない**。

自動付与:
- `ac_class`: `plan/test-strategy.md` のキーワード推論 (B ルート) を流用
- `risk`: 「undo / rollback / 決済 / 権限 / 並行編集 / データ消失 / 監査」語彙検出で critical 自動判定
- `depends_on`: 既存 `.takumi/specs/*.md` を scan して関連 AC-ID を抽出

AC-ID は全フェーズの共通通貨 (drift 防止の根幹)。

### 0d. /design 呼出 (ui / mixed のみ)

UI を含む場合、**plan 本体より先に** `/design` で IA / style-guide / interactions / wireframe を生成。必須入力 4 項目 (`product_type` / `target_user` / `brand_tone` / `ref_archetypes 1-2`) を対話で確定させる。
出力は `.takumi/design/` 配下。plan は後段で各 UI task に `design_profile_ref` を埋める。

---

## Step 1 — 規模分類

| 規模 | 基準 | アクション |
|------|------|-----------|
| 小 | 1-3 ファイル、明確 | 1-2問で計画生成 |
| 中 | 4-10 ファイル | インタビュー + 斥候 調査 |
| 大 | 10+ ファイル or 設計変更 | インタビュー + 軍師 分析 + 斥候 調査 |

### 自己増殖型が必要か判定

| 条件 | 自己増殖 |
|------|---------|
| スコープが事前に全て確定できる | 不要 |
| 調査→発見→追加タスクのサイクルがある | **必要** |
| 品質改善・リファクタ・網羅的レビュー系 | **必要** |
| 「終わりはユーザーが決める」系 | **必要** |

自己増殖型が必要なら `self-multiplying.md` を読んで計画テンプレに組み込む。

---

## Step 2 — 調査（インタビューと並行可）

**斥候 (haiku)** — コードベース高速スキャン:
```
Agent tool:
  subagent_type: "Explore"
  model: "haiku"
```

**軍師 (gpt-5.4)** — 大規模タスクの設計分析:
```bash
codex exec -m gpt-5.4 -s read-only -C "$(pwd)" \
  "{設計に関する質問を日本語で記述}" 2>&1 | tail -100
```

---

## Step 3 — インタビュー

自分（Opus）がユーザーと日本語で対話する。

**ルール**:
- 1ターン最大 3問
- コードを読めばわかることは聞かない → 斥候 に委譲
- 中規模以上: `.takumi/drafts/{name}.md` にメモを残す

**AC 起草の統合**:

このインタビューは実装アプローチを詰めるだけでなく、**AC-ID の起草** (Step 0c 参照) も同時に行う。
1 ターン目で feature name と AC 粒度を確定し、以降のターンで境界条件・risk を深掘りして AC を育てる。
確定した AC は `.takumi/specs/{feature}.md` に frontmatter 付きで書き込み、人間に一覧提示で確認を取る。

**完了チェック**（毎ターン評価）:
```
[ ] 目的が明確
[ ] スコープ (IN/OUT) が定義済み
[ ] AC-ID が原子単位に粒度化され、ac_class / risk / depends_on が付与されている
[ ] 技術アプローチが決定
[ ] 検証方法がある
[ ] 未知の重要事項がない
```

全パスで計画生成へ。ユーザーが「作って」→ 強制遷移。
小規模の場合はインタビュー省略可。

---

## Step 4 — 計画生成

`.takumi/plans/{name}.md` に書き出す:

```markdown
# {タイトル}

## 概要
> **やること**: 一行説明
> **成果物**: 箇条書き
> **規模**: 小 | 中 | 大
> **Wave数**: N（自己増殖型は "N+（自己増殖型）"）

## 自己増殖メカニズム（自己増殖型のみ）
（self-multiplying.md のテンプレートを埋め込む）

## 背景
### リクエスト
### 調査結果 (斥候 / 軍師)

## スコープ
### 完了条件
### やらないこと

## TODOs

### Wave 1: {基盤}

- [ ] 1. **タスク名**
  - **ac_ids**: [AC-AUTH-002, AC-AUTH-003]
  - **verify_profile_ref** / **design_profile_ref** / **mutation_tier**: state-transition / dashboard-dense / standard
  - **refactor_profile_ref** / **strictness** / **ui_state_model_tier**: ui-pending-object / L1+L2+L3 / B  # 詳細は各 skill 参照
  - **何を**: ファイルパス、行番号、変更内容
  - **なぜ**: 動機
  - **ロール**: 職人 | 軍師 | 斥候
  - **やらない**: ガードレール
  - **検証**: 具体的な確認手順 + mutation_floor 通過 + L7 hard gate 通過 + strict-refactoring checklist 通過

### Wave 2: {本体}

- [ ] 2. ...

### 最終検証

- [ ] F1. 全検証項目の再確認
- [ ] F2. ビルド通過
- [ ] F3. テスト通過
- [ ] F4. 軍師 最終レビュー
  - `codex exec -m gpt-5.4 -s read-only -C "$(pwd)" "git diff main...HEAD の全変更を敵対的にレビューせよ。境界条件・障害パス・競合状態・セキュリティを重点的に" 2>&1 | tail -100`
```

### ルール

1. 全タスクにファイルパス参照
2. 全タスクに具体的な検証項目
3. 全タスクにロール指定 (職人 / 軍師 / 斥候)
4. Wave N+1 は Wave N に依存

### 軍師 計画レビュー（自動・生成直後）

計画ファイル生成直後、軍師 に自動でレビューを依頼:
```bash
codex exec -m gpt-5.4 -s read-only -C "$(pwd)" \
  ".takumi/plans/{name}.md を読み、前提の誤り・スコープの漏れ・Wave依存の矛盾・リスクを指摘せよ" 2>&1 | tail -100
```

- 指摘あり → 計画ファイルに反映してから提示
- 指摘なし → そのまま提示

### 提示後のディスパッチ

- `/probe` / `/sweep` から呼ばれた場合 → 確認を求めず即 executor 起動 (`executor.md` 参照)
- 単独 `/takumi` → ユーザーに計画を提示、「この計画で進めて良いですか?」と確認 → yes なら executor 自動起動
- 人間が `/exec` を別途叩く必要なし。タイポ防止のため executor は常に最新 plan を追う

---

## Step 5 — 自己増殖型（必要な場合のみ）

大規模・品質改善・リファクタ・網羅的レビュー系では、職人 の発見が新タスクとして計画に追記され
計画自体が成長する方式を使う。詳細は **`self-multiplying.md`** を読む:

- 職人 は担当外の発見を `discovered-{id}.md` に記録（自分で解決しない）
- 棟梁 が Wave 完了後に統合、新タスクを計画に挿入
- P0 発見は次バッチに割り込み
- 100+ タスクに成長した場合は ICE 上位50件にトリアージして続行

---

## Step 6 — バックログ入力モード（/probe 連携）

`/probe` から呼ばれた場合、または backlog.md が指定された場合はインタビュー省略。
詳細は **`backlog-mode.md`** を読む:

- backlog.md の各課題（証拠 file:line, MECE 分類, ICE スコア）を Wave タスクに変換
- 分類に応じて 職人/斥候/軍師 を自動割り当て
- 常に自己増殖型で生成
- 出力: `.takumi/plans/probe-{日付}.md`

---

## 制約

計画モード中:
- ソースコード編集禁止（`.takumi/` のみ可）
- 実装コマンド実行禁止
- 中規模以上でインタビュー省略禁止（バックログ入力モードは例外）
- 自己増殖型: 職人 は担当外の発見を自分で解決しない（計画に書き戻す）

### コンテキスト保護

インタビューが長引くと Main コンテキストが肥大化する。残量 60% を切ったら、
計画生成ステップを Agent に委譲して JSON だけ返す設計も検討する（probe/sweep の Phase 0 委譲ガード参照）。

---

## Step 7 — 100 点統合版の接続 (新規 skill との連携)

詳細は **`integrations.md`** を読む。新規 skill との接続、reference-first 運用、telemetry 連携、採用閾値を記述。

- `plan/test-strategy.md` 連携 (AC-ID → verify_profile_ref 選定、内部補助)
- `/design` 連携 (ui/mixed のみ、design_profile_ref)
- reference-first による frontmatter 肥大化防止 (task 平均 20 行以下、override 30% 超で defaults 再設計)
- telemetry 連携 (儀式化 drift 検出、`.takumi/telemetry/profile-usage.jsonl`)
- 軍師 指定の 5 閾値 (mutation_floor / layout_strictness / auto_ref_site / design_drift / loop min-max)

---

## 自然文インターフェース

人間が覚えるコマンドは `/takumi` と `/probe <観点>` の 2 つだけ (軍師 6R 確定)。サブコマンド構文は採用せず、発話は `natural-language.md` の意図認識表で処理する。

## 関連リソース (100 点統合版)

| skill / file | 用途 |
|---|---|
| `integrations.md` (同ディレクトリ) | 新 skill 接続の詳細 |
| `telemetry-spec.md` (同ディレクトリ) | 儀式化 drift 検知の telemetry spec |
| `~/.claude/skills/takumi/design/README.md` | IA / style-guide / wireframe 生成 (ui/mixed) |
| `test-strategy.md` (同ディレクトリ) | AC-ID → verify_profile 選定 (内部補助) |
| `executor.md` (同ディレクトリ) | 計画の Wave 実行 (内部責務) |
| `~/.claude/skills/takumi/verify/README.md` | L1-L6 + recipe library |
| `~/.claude/skills/takumi/strict-refactoring/README.md` | Command/Pure/ReadModel、Pending Object Pattern 等のリファクタリング指針 (plugin) |
| `verify-profiles-defaults/*.yaml` (同ディレクトリ) | 5 archetype defaults |
| `~/.claude/skills/takumi/design/profiles-defaults/*.yaml` | 4 design profile defaults |
| `.takumi/profiles/{verify,design}/*.yaml` | project 側 profile 本体 |
| `.takumi/telemetry/profile-usage.jsonl` | event log (append-only) |
