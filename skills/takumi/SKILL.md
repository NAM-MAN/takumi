---
name: takumi
description: "takumi の単一入口。計画・観点診断・全域棚卸し・設計・検証・リファクタを自然文で振り分ける。/takumi <自然文> で起動。サブコマンド構文は採用しない。"
license: MIT
---

# takumi: 単一入口スキル

ユーザーからの自然文を意図分類し、適切な内部モード (normal / probe / sweep / status / continue / override) に振り分ける唯一の skill。

計画は `.takumi/plans/{name}.md` に保存、確認後は executor (`executor.md` の内部責務) が Wave 順に自動実行する。executor は takumi の内部ロールであり、人間が直接叩く別コマンドは存在しない。

---

## 進入路 (AI 向け、最小読み込み指針)

> [!IMPORTANT]
> **全ファイルを読まない**。context 劣化を避けるため、task 種別から下表の「必ず読む」3-5 本だけを読み、「触れない」は開かない。

| task 種別 | 必ず読む | 触れない |
|---|---|---|
| 新機能実装 (UI なし) | SKILL.md + `plan-template.md` + `executor.md` | verify/, probe/, sweep/, design/ |
| 新機能実装 (UI あり) | SKILL.md + `plan-template.md` + `design/README.md` + `design/phases.md` | verify/, probe/, sweep/ |
| テスト追加 | SKILL.md + `verify/README.md` + `verify/spec-tests.md` + (技法に応じて 1 本: `property-based.md` / `component-test.md` / `model-based.md`) | probe/, sweep/, design/ |
| **テスト圧縮 (MSS)** | SKILL.md + `verify/spec-tests.md` + `verify/compression.md` | probe/, sweep/, design/ |
| verify-loop 運用 | `verify-loop/runtime.md` + `verify/loop.md` + `verify/mutation.md` | probe/, sweep/, design/, その他 verify/ |
| 観点診断 (probe mode) | SKILL.md + `probe/README.md` + `probe/runtime.md` + `probe/discover.md` + `probe/triage.md` (委譲時のみ `probe/delegation.md`) | verify/, sweep/ |
| 全域棚卸 (sweep mode) | SKILL.md + `sweep/README.md` + `sweep/runtime.md` | probe/, verify/, design/ |
| リファクタ / 設計見直し | SKILL.md + `strict-refactoring/README.md` + `strict-refactoring/rules-core.md` (+ 該当 rules-*.md 1 本) | probe/, sweep/, design/, verify/ |
| design mode (Step 0d) | SKILL.md + `design/README.md` + `design/runtime.md` + `design/phases.md` (+ 該当 phases-*.md) | probe/, sweep/, verify/ |
| 状態確認 / 再開 / override | SKILL.md + `natural-language.md` + `.takumi/state.json` | それ以外は不要 |

**ファイルサイズ方針**: skill 内 md ファイルは 300-349 行まで acceptable、350 行超は必ず分割する (attention 劣化回避)。実行時に「**新規テスト追加なら verify 系だけ、リファクタなら strict-refactoring だけ**」のように選択的に読むことで、1 task あたりの context 消費を最小化する。

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

補助ファイルの一覧と用途は冒頭「進入路」表を参照。ローカル作業領域は全て `.takumi/` 配下 (`plans/{name}.md` 計画、`drafts/{name}.md` メモ、`drafts/discovered-{id}.md` 自己増殖発見、`state.json` 状態、`sprints/{date}/` probe 成果物、`telemetry/*.jsonl` イベント)。

---

## Step 0 — プロジェクトモード判定と profiles 準備

計画生成の前に以下を確認する。詳細は `integrations.md`。

### 0a. project_mode 判定

`CLAUDE.md` または `.takumi/project.yaml` から `project_mode` (ui / mixed / backend) を取得。未設定なら対話で確認。

- `ui` → design mode mandatory、全 UI task に `design_profile_ref`
- `mixed` → UI を含む task のみ `design_profile_ref`
- `backend` → design 不要

### 0a-2. project 言語 × L4 Mutation tier 判定

`package.json` / `Cargo.toml` / `go.mod` / `pyproject.toml` / `*.csproj` / `pom.xml` / `build.sbt` から project 言語を検出し、L4 Mutation の tier を決定する。詳細は `verify/mutation.md` の「言語別 tier 表」。

| tier | 言語 | ツール | 扱い |
|---|---|---|---|
| **primary** | JS/TS | Stryker-JS | L4 を hard gate、mutation_floor は task 65-70% / epic 80% |
| **primary** | Java/Kotlin | **PIT (PITest)** | L4 を hard gate、bytecode mutation で Stryker より高速 |
| **primary** | C# | Stryker.NET | L4 を hard gate、Stryker 系列 |
| **primary** | Rust | cargo-mutants | L4 を hard gate **ただし `--in-diff` 強制**、フル run 禁止 (profile に `mutation_mode: incremental_only` を既定) |
| **primary** | Scala | Stryker4s | L4 を hard gate |
| **advisory** | Python | mutmut / cosmic-ray | L4 は telemetry 参考値のみ。**主守りは L1 PBT + L6 AI Review** (operator coverage が Stryker レベルに到達していないため) |
| **advisory** | Go | gremlins | L4 は telemetry 参考値のみ。主守りは L1 PBT + L6 AI Review |
| **skip** | 上記以外 | なし | L4 完全 skip、L1 PBT + L6 AI Review で守る |

profile `.takumi/profiles/verify/{name}.yaml` に `mutation_tool` (ツール名) と `l4_role: primary | advisory | skip` を記録。advisory の言語では mutation_floor を gate から外す。

> [!IMPORTANT]
> Python / Go を advisory にしているのは「ツールが未熟」ではなく「**mutation operator の覆盖範囲が Stryker レベルに到達していない**」という品質判定。ツールの star 数や開発状況ではなく、生成されるミュータントの質で判定している (PIT は 1.9k star で Stryker-JS の 2.8k より少ないが、primary 扱い)。

### 0b. profiles 整備と .gitignore bootstrap (初回のみ)

`.takumi/profiles/{verify,design}/` が無ければ defaults を bootstrap、同時に `.gitignore` に `.takumi/` と verify-loop の ephemeral artifact を登録する。手順の詳細 (bash snippet / .gitignore 追加行 / 言語別 artifact) は `step0-bootstrap.md` を参照。

project 固有 profile は `.takumi/profiles/` に yaml を追加するだけ (registry 方式)。

### 0c. AC-ID 収集 (Step 3 インタビュー内で統合)

要件を `AC-{feature_short}-{seq}` の原子単位に分割 (例: `AC-AUTH-002`, `AC-PAY-004`)。
**Step 3 の対話で AI が発話から抽出・命名・分類**し、人間は一覧で OK/修正を確認するだけ。**人間が書く必要はない**。

自動付与:
- `ac_class`: `plan/test-strategy.md` のキーワード推論 (B ルート) を流用
- `risk`: 「undo / rollback / 決済 / 権限 / 並行編集 / データ消失 / 監査」語彙検出で critical 自動判定
- `depends_on`: 既存 `.takumi/specs/*.md` を scan して関連 AC-ID を抽出

AC-ID は全フェーズの共通通貨 (drift 防止の根幹)。

### 0d. design mode (ui / mixed のみ)

UI を含む場合、**plan 本体より先に** design mode で IA / style-guide / interactions / wireframe を生成 (`design/README.md` に委譲)。必須入力 4 項目 (`product_type` / `target_user` / `brand_tone` / `ref_archetypes 1-2`) を対話で確定させる。
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

`.takumi/plans/{name}.md` に書き出す。テンプレート骨格・記載ルール・軍師 計画レビューの手順は `plan-template.md` を参照。

### 提示後のディスパッチ

- probe mode / sweep mode 経由の場合 → 確認を求めず即 executor 起動 (`executor.md` 参照)
- 直接 `/takumi` で normal mode に入った場合 → ユーザーに計画を提示、「この計画で進めて良いですか?」と確認 → yes なら executor 自動起動
- executor は takumi の内部ロール。人間が叩く別コマンドは存在しない。タイポ防止のため executor は常に最新 plan を追う

### in-conversation plan の許容条件 (plan ファイル省略の例外)

**デフォルトは `.takumi/plans/{name}.md` を必ず生成する**。以下 5 条件を **すべて満たした場合のみ**、plan ファイルを書かず TaskCreate + 会話内の合意で直接実装に入る "in-conversation plan" を許容する:

1. 対象が skill / ドキュメント / config ファイルの編集のみ (プロダクションコード・build・DB・CI 設定への影響がゼロ)
2. 会話内で Wave 構造がすでに棟梁とユーザーで合意済み (「この方針で進めて良いですか?」に yes が返っている)
3. 規模が「小」〜「中」相当で、見込み作業時間が 30 分以内
4. ユーザーが「計画 → 実装に進む」を明示承認している (yes / OK / 進めて 等の明確な応答)
5. 全 Wave を TaskCreate で追跡可能 (3-15 タスク規模に収まる)

5 条件のうち 1 つでも欠けたら plan ファイルを生成する。以下は in-conversation plan を**許容しない**代表例:

- 初回依頼で Wave 構造未合意 (直近の会話が長くても「合意」がなければ NG)
- プロダクションコードやビルド設定に触れる作業
- 1 時間以上の見込み作業
- 大規模リファクタ、品質改善ループ、複数リポジトリ横断の変更

> [!IMPORTANT]
> 棟梁 (Opus) が判断に迷ったら plan ファイルを書く側に倒す。plan ファイルの作成は `.takumi/plans/` が `.gitignore` 済みなのでコストゼロ。逆に in-conversation plan で進めて後から「履歴が残っていない」事態になる方が害が大きい。

---

## Step 5 — 自己増殖型（必要な場合のみ）

大規模・品質改善・リファクタ・網羅的レビュー系では、職人 の発見が新タスクとして計画に追記され
計画自体が成長する方式を使う。詳細は **`self-multiplying.md`** を読む:

- 職人 は担当外の発見を `discovered-{id}.md` に記録（自分で解決しない）
- 棟梁 が Wave 完了後に統合、新タスクを計画に挿入
- P0 発見は次バッチに割り込み
- 100+ タスクに成長した場合は ICE 上位50件にトリアージして続行

---

## Step 6 — バックログ入力モード (probe mode 連携)

probe mode から backlog.md が渡された場合、または backlog.md が既に存在する場合はインタビュー省略。
詳細は **`backlog-mode.md`** を読む:

- backlog.md の各課題 (証拠 file:line, MECE 分類, ICE スコア) を Wave タスクに変換
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

## Step 7 — 新規 skill との連携

詳細は **`integrations.md`** を読む。新規 skill との接続、reference-first 運用、telemetry 連携、採用閾値を記述。

- `plan/test-strategy.md` 連携 (AC-ID → verify_profile_ref 選定、内部補助)
- design mode 連携 (ui/mixed のみ、design_profile_ref)
- reference-first による frontmatter 肥大化防止 (task 平均 20 行以下、override 30% 超で defaults 再設計)
- telemetry 連携 (儀式化 drift 検出、`.takumi/telemetry/profile-usage.jsonl`)
- 軍師 指定の 5 閾値 (mutation_floor / layout_strictness / auto_ref_site / design_drift / loop min-max)

---

## 自然文インターフェース

**人間が覚えるコマンドは `/takumi` の 1 つだけ**。観点診断・棚卸し・状態確認・再開・停止・リファクタ・検証・設計のいずれも `/takumi` に日本語で伝えれば、意図分類ルータが 6 モード (normal / probe / sweep / status / continue / override) に振り分ける。サブコマンド構文 (`/takumi status` 等) も対外コマンド (`/probe` 等) も採用しない。発話辞書は `natural-language.md`。

## 関連リソース

**どのファイルを読むか**は冒頭「進入路」表で決める。各ファイルの 1 行概要は進入路の task 種別を参照。

profile registry (外部参照): `verify-profiles-defaults/*.yaml` (5 archetype defaults) / `design/profiles-defaults/*.yaml` (4 design defaults) / `.takumi/profiles/{verify,design}/*.yaml` (project 側本体) / `.takumi/telemetry/profile-usage.jsonl` (event log、append-only)。
