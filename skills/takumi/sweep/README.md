---
name: sweep
description: "全品質次元を自動スキャンし、矛盾を統合で統合解決するメタオーケストレーター。/sweep で実行。観点の指定不要。"
---

# sweep: リリース前の総点検を、1 コマンドで

観点を 1 つに絞らず、**全方位で同時に** プロジェクトを点検します。

```
/sweep
```

機能正確性、UX、パフォーマンス、セキュリティ、アクセシビリティ、アーキテクチャ、DX、欠落機能 — 8 つの品質次元を**並列に**調査し、**矛盾する改善提案を両立する解決案**に統合してから、計画を立てて実行します。

---

## こんなお悩み、ありませんか?

- リリース前に総点検したいが、全部見て回る時間がない
- 観点ごとに別々のレビューをすると、提案が矛盾して困る (「パフォーマンス優先」vs「可読性優先」など)
- 漏れなく見たいのに、指示する観点を忘れがち
- 大きなリファクタ前に「何を直すべきか」の全体像がほしい
- 定期的に棚卸しをしたいが、ルーチンとして組み込めていない

sweep は、**観点指定不要で全方位を同時にカバー**し、**矛盾した提案を統合**してから実行する、リリース前の総点検スキルです。

---

## sweep が解決すること (5 つの視点)

### 1. 8 つの品質次元を、並列に同時調査

sweep は以下の 8 次元を自動で走査します。ユーザーは「観点」を指定する必要がありません。

| 次元 | 内容 |
|---|---|
| **D1. 機能正確性** | 仕様との整合、バグ、エッジケース |
| **D2. UX** | 導線、エラー体験、空状態、情報設計 |
| **D3. パフォーマンス** | N+1、再レンダリング、バンドル、クリティカルパス |
| **D4. セキュリティ** | 認可、入力検証、シークレット管理、依存脆弱性 |
| **D5. アクセシビリティ** | WCAG、キーボード、スクリーンリーダー、コントラスト |
| **D6. アーキテクチャ** | 責務分離、循環依存、モジュール境界 |
| **D7. DX (開発体験)** | ビルド速度、テスト体験、エラーメッセージ |
| **D8. 欠落機能** | 仕様は要求しているが未実装、運用に必要だが未整備 |

各次元には独立した発見者 (Haiku ベース) が割り当てられ、**並列に**走ります。逐次だと数十分かかる調査が、並列化で大幅に短縮されます。

### 2. 次元ごとに深度を自動配分します

全次元を等しく深く掘るのは無駄です。sweep は直近の git 履歴、テスト結果、過去の点検結果から、今回掘るべき深度を自動配分します。

| 深度 | 動き |
|---|---|
| **DEEP** | 30+ 件の発見を狙う。ホットスポットを徹底調査 |
| **STANDARD** | 10-20 件。通常の調査 |
| **SCAN** | 5 件以下。軽い見回り |
| **SKIP** | 前回点検で卒業済みなど、今回は省略 |

**直近でバグが頻発している次元は DEEP、安定している次元は SCAN**、のように知的に配分されます。

### 3. 矛盾する改善提案を、統合で解決します (ここが sweep の核)

全次元を同時に見ると、**逆方向の提案**がよく出ます。

- D2 (UX): 「情報量を増やして、ダッシュボードを充実させたい」
- D3 (Performance): 「ダッシュボードの初期表示を速くしたい (情報を減らしたい)」

こういった**矛盾ペア**を sweep は機械的に検出し、両立する解決案 (= 統合解) を生成します。たとえば「重要な情報を初期表示し、残りはタブまたは遅延ロードで出す」のような第三の案です。

統合解は以下の手順で導出されます。

1. 矛盾ペアを検出 (`conflicts.md` に出力)
2. `integration-playbook.md` に記載された**過去の統合パターン**を参照
3. 軍師 (OpenAI GPT-5) に「これは本物の統合か? 第 3 次元を犠牲にしていないか?」と検証を依頼
4. 合格した統合案のみ `resolved-backlog.md` に採用

### 4. Playbook が進化していきます

過去の点検で使った統合パターンは `integration-playbook.md` に蓄積されます。

- 「UX vs Perf の矛盾 → Progressive Disclosure で両立」
- 「Security vs DX の矛盾 → 開発環境だけ緩める feature flag」
- 「Architecture vs Velocity の矛盾 → 期限付きの技術債務記録」

**回数を重ねるごとに、統合の手札が増えていきます**。

### 5. 中断しても、再開できます

sweep も probe と同じく長時間実行されます。コンテキスト上限、PC 終了、他の作業割り込み — いずれの理由でも `resume.md` に中断情報が書き出され、`/sweep continue` で再開できます。

---

## 用語解説 (初めて聞く方へ)

| 用語 | 意味 |
|---|---|
| **品質次元 (Quality Dimension)** | 品質を評価する独立した観点 (D1-D8 の 8 軸) |
| **MECE** | Mutually Exclusive, Collectively Exhaustive。ダブりなく漏れなく分類する方針 |
| **統合 (Integration / Synthesis)** | 矛盾する 2 提案を両立させる第 3 の解決案 |
| **Playbook** | 過去の統合パターン集。経験を蓄積する台帳 |
| **深度配分 (Depth Allocation)** | 次元ごとに掘る深さを変える戦略 |
| **ホットスポット** | 最近の変更が集中しているファイル。バグが潜みやすい |
| **ICE スコア** | Impact × Confidence × Ease の 3 軸評価 |
| **反論者チェック** | 軍師 (別 AI モデル) による敵対的判定 |
| **卒業 (Graduation)** | 特定次元 × 画面の組で、点検が不要なレベルに達した状態 |
| **Foreman** | 全フェーズを丸ごと担当する代理エージェント (コンテキスト保護目的) |

---

# 以下、AI 実行時に参照する仕様

`/sweep` を実行した AI エージェントが読む仕様セクションです。

---

N個の品質次元ごとに独立した発見を並列実行し、
矛盾する課題を統合で同時解決してから統合バックログを生成する。
観点の指定は不要。全次元を自動でカバーする。

## 支援ファイル（このディレクトリ内、必要時にReadで読む）

| ファイル | 用途 | 読むタイミング |
|---------|------|--------------|
| `quality-model.md` | MECE次元定義・優先順位・深度ルール | Phase 0 |
| `integration-playbook.md` | 矛盾解決パターン集 | Phase 2c |

- `/probe` の内部参照ファイル（triage.md）のICE採点・反論者チェックを踏襲する
- プロジェクト固有状態は `.takumi/` に保存する

---

## Phase 0 — 初期化

### 0a. ガード（`/loop` 連携）

`.takumi/state.json` を読み、前回の状態で分岐:

| `status` | アクション |
|----------|-----------|
| 存在しない | 続行（初回） |
| `"completed"` | 続行（新規スイープ） |
| `"paused"` | `/sweep continue` として再開 |
| `"in_progress"` | **即終了** — 「前回スイープ実行中。スキップします。」と報告して何もしない |

### 0b. コンテキスト保護（/loop連携・画像系含む）

ガードを通過したら（続行 or 再開）、**Phase 0c以降を直接実行せず、Agentツールに委譲する**。
これにより `/loop` で繰り返し呼ばれてもメインセッションのコンテキストを消費しない。

#### 委譲は常に発動（例外なし）

以下のいずれでも必ず Agent 委譲する:
- `/loop` 経由での呼び出し
- 指示に画像系キーワード（「スクリーンショット」「画像」「UI改善」「screenshot」「png」「画面」）を含む
- Main コンテキスト残量の体感が 60% を下回っている
- 通常の `/sweep` / `/sweep continue`

#### 委譲手順

```
Agent(
  description: "sweep execution",
  subagent_type: "general-purpose",
  prompt: """
    Read ~/.claude/skills/takumi/sweep/README.md fully and execute
    Phase 0c through Phase 5. Also read CLAUDE.md for project context.

    ## I/O 契約（厳守）
    - 全 artifact は .takumi/sprints/{YYYY-MM-DD}/ 配下に書く
    - 書き込みは *.partial に書いてから完了時に mv で *.final に rename
    - 最終メッセージとして **JSON 1 枚だけ**を返す（1KB 未満）:
      {
        "phase": "discover|reconcile|triage|plan|exec|paused|done",
        "counts": { "discovered": N, "syntheses": N, "kept": N, "fixed": N },
        "top3_ids": ["B-001", "B-007", "B-012"],
        "artifact_path": ".takumi/sprints/{日付}/summary.final.md",
        "ledger_seq": N,
        "one_line_verdict": "一行まとめ（日本語 OK）"
      }

    ## 親に返してはいけないもの（絶対禁止）
    - discoveries / conflicts / syntheses / backlog の本文
    - スクリーンショット / 画像バイナリ / 画像の詳細観察文
    - codex exec (軍師) の tail 出力
    - 職人 の実装差分
    - Wave 完了レポートの本文

    ## スクリーンショット / 画像の扱い
    - 画像の Read はこの Agent 内部のみ。親に画像を見せない。
    - 撮影した PNG は .takumi/artifacts/ui/{ts}/*.png に保存。
    - 観察結果は .takumi/sprints/{日付}/ui-obs/{id}.final.md にテキスト化。

    ## コンテキスト上限への対応
    残量 20% 以下なら resume.md を書き、JSON の phase を "paused" にして
    早期終了する。続きは /sweep continue で再開できる。
  """,
  run_in_background: false
)
```

Agent が返した JSON を読み、ユーザーに 2-3 行で要約して終了する。
**以降の Phase 0c〜5 は Foreman (Agent) の内部手順**であり、Main では実行しない。

### 0c. 権限の自動確認

プロジェクトの `.claude/settings.json` を読み、以下のツールが `permissions.allow` に含まれているか確認:

```
Read, Write, Edit, Bash, Glob, Grep, Agent
```

不足があれば `.claude/settings.json` に追加する（既存の設定はマージ、上書きしない）。
これにより `/loop` でのハンズオフ実行時に承認プロンプトで停止しなくなる。

### 0d. 深度配分

1. 同ディレクトリの `quality-model.md` を読み、8次元の定義を取得
2. `.takumi/quality-state.md` があれば読み、卒業状態を反映
3. 直近の `.takumi/sprints/*/backlog.md` があれば読み、未解決課題を把握する
   - 未解決課題は Phase 1 で**再発見しない**（スキップリストとして各Agentに渡す）
   - 未解決HIGHが残っていれば、その次元を DEEP に昇格する
4. 以下を**並列実行**して定量データを取得:

```bash
git log --oneline -30
git diff --stat HEAD~30
pnpm test:run 2>&1 | tail -5
pnpm typecheck 2>&1 | tail -5
```

4. 深度を自動配分（quality-modelの深度配分ルール参照）
5. SKIP次元を除外 → 実行対象N次元を決定
6. `.takumi/sprints/{日付}/` ディレクトリを作成

ユーザーに報告し、**即座に Phase 1 に進む**（確認を待たない）:
```
Sweep 初期化完了:
- 実行次元: {N}個（DEEP: {n}, STANDARD: {n}, SCAN: {n}, SKIP: {n}）
- 次元一覧: D1:機能正確性[DEEP], D2:UX[STANDARD], ...
→ 並列発見を開始します。
```

---

## Phase 1 — 並列次元Discovery

各次元ごとに Agent(Explore/haiku) を**並列起動**する。

各エージェントへの指示テンプレート:

```
あなたは品質次元「{次元名}」の専門発見者チームとして課題を探す。

## 次元の焦点
{quality-modelから取得した次元詳細}

## 深度: {DEEP/STANDARD/SCAN}
{深度に応じた発見件数指示}

## 探索対象
プロジェクトの src/ 配下を実際に読んで調査せよ。
ホットスポット（変更頻度高）: {Phase 0で取得したファイル}

## 出力形式（厳守）
### {通し番号}. {課題タイトル}
- **証拠**: `{file}:{line}` — {コード引用}
- **問題**: {2-3文}
- **影響**: {誰にどう影響}
- **次元**: {D1-D8}
- **分類**: Bug | UX | Missing | Performance | Security | Accessibility | Architecture | DX

## ルール
- 証拠必須。推測は報告しない
- 1発見=1問題
- CLAUDE.md記載の仕様は報告しない
```

全エージェント完了後、結果を `.takumi/sprints/{日付}/dimension-discoveries/` に次元別で保存。

---

## Phase 2 — Reconciliation（矛盾統合解決）

詳細手順は **`reconcile.md`** を読む。概要のみここに:

1. **Step 2a — Merge + Dedup**: 全次元を1ファイルに統合、重複集約
2. **Step 2b — Conflict Detection**: 同一ファイル/コンポーネントに対する逆方向提案を検出、`conflicts.md` に出力
3. **Step 2c — 統合**: `integration-playbook.md` を参照し、矛盾を両立する解決案を生成
4. **Step 2d — 軍師 検証**: 全 統合 を codex exec で検証（真の 統合 か / 第3次元を犠牲にしていないか）
5. **Step 2e — Coherence Verification**: 解決済みペアの相互整合性
6. **Step 2f — Playbook 進化**: 新パターンを `integration-playbook.md` に追記

出力: `.takumi/sprints/{日付}/resolved-backlog.md`

---

## Phase 3 — 統合Triage

resolved-backlog.md に対して triage と同じ手順を実行:

1. **MECE分類**: Bug/UX/Missing/Performance/Security/Accessibility/Architecture/DX
2. **ICE採点**: Impact × Confidence × Ease（統合案はConfidence+1加点）
3. **反論者チェック**: 軍師 に上位20件を送り ✅/⚠️/❌ 判定
4. **スイープ選出**: 8-15件（統合案は2課題分としてカウント）
5. 出力: `.takumi/sprints/{日付}/backlog.md`

---

## Phase 4 — Plan + Execute

1. `/takumi` パターン（バックログ入力モード）で Wave 計画を生成
   - 統合案は依存する2課題をセットで同一Waveに配置
   - 自己増殖型で計画
2. `/exec` パターンで実行

修正対象がテスト追加 / property 強化 / mutation score 向上を伴う場合は、
**verify skill を内部呼び出し** する (`~/.claude/skills/takumi/verify/README.md`)。
職人 タスクとして「verify L1 を utils に適用」のように具体化して Wave に組み込む。

---

## Phase 5 — 完了処理

1. `.takumi/quality-state.md` を更新(各次元の卒業状態・精度)
2. 統合パターン集 に新パターンがあれば追記済みか確認
3. 完了レポート:

```markdown
# Sweep 完了: {日付}

## カバレッジ
| 次元 | 深度 | 発見数 | 採用数 | 統合 |
|------|------|--------|--------|-----------|
| D1   | DEEP | {N}    | {N}    | {N}件     |
| ...  |      |        |        |           |

## 統合成果
- 矛盾検出: {N}ペア
- 統合成功: {N}件（{2N}課題を{N}変更で解決）
- Playbook新規登録: {N}パターン

## 次回への引継ぎ
- 卒業: {次元×画面の組}
- 要注意: {精度が低かった次元}
```

---

## コンテキスト管理

- Phase 1: N個の独立エージェント → 親のコンテキスト消費は起動+結果受取のみ
- Phase 2: 構造化JSONで圧縮。矛盾ペアは全体の10-20%
- Phase 3以降: 既存probeと同等

**コンテキスト残量20%時**: resume.md を生成して中断。`/sweep continue` で再開。

---

## 制約

- Phase 1 の次元Discovery は必ず並列実行（逐次禁止）
- 統合 は必ず軍師検証を通す（自己検証禁止）
- Playbook更新はsweep完了時のみ（実行中は読み取り専用）
- 各Phaseの区切りで進捗を報告するが、確認は求めず即座に次Phaseへ進む（ユーザーが「止めて」と言わない限り止まらない）
