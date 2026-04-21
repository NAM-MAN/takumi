# sweep mode — AI runtime spec

takumi の sweep mode で呼び出された AI エージェントが読む仕様。LP / 用語解説は `README.md` 側。

---

> ここから下は takumi の sweep mode で呼び出された AI エージェントが読む仕様セクションです。人間の読み物ではなく、AI runtime が参照する運用仕様なので、Phase 0 〜 5 の手順・契約・禁止事項を省略・改変せずそのまま保持しています。

---

N個の品質次元ごとに独立した発見を並列実行し、
矛盾する課題を統合で同時解決してから統合バックログを生成する。
観点の指定は不要。全次元を自動でカバーする。

## 支援ファイル（このディレクトリ内、必要時にReadで読む）

| ファイル | 用途 | 読むタイミング |
|---|---|---|
| `quality-model.md` | MECE次元定義・優先順位・深度ルール | Phase 0 |
| `integration-playbook.md` | 矛盾解決パターン集 | Phase 2c |

- probe mode の内部参照ファイル (triage.md) のICE採点・反論者チェックを踏襲する
- プロジェクト固有状態は `.takumi/` に保存する

---

## Phase 0 — 初期化

### 0a. ガード（`/loop` 連携）

> [!IMPORTANT]
> `.takumi/state.json` を読み、前回の状態で分岐する。`in_progress` なら即終了、`paused` なら continue mode 経由で sweep mode に再帰、それ以外は続行。

`.takumi/state.json` を読み、前回の状態で分岐:

| `status` | アクション |
|---|---|
| 存在しない | 続行（初回） |
| `"completed"` | 続行（新規スイープ） |
| `"paused"` | continue mode 経由で sweep mode に再帰 |
| `"in_progress"` | **即終了** — 「前回スイープ実行中。スキップします。」と報告して何もしない |

### 0b. コンテキスト保護（/loop連携・画像系含む）

ガードを通過したら（続行 or 再開）、**Phase 0c以降を直接実行せず、Agentツールに委譲する**。
これにより `/loop` で繰り返し呼ばれてもメインセッションのコンテキストを消費しない。

#### 委譲は常に発動（例外なし）

以下のいずれでも必ず Agent 委譲する:
- `/loop` 経由での呼び出し
- 指示に画像系キーワード（「スクリーンショット」「画像」「UI改善」「screenshot」「png」「画面」）を含む
- Main コンテキスト残量の体感が 60% を下回っている
- 通常の sweep mode 起動 / continue mode 経由の再開

<details>
<summary><b>委譲手順 (Agent 委譲プロンプト全文 — JSON スキーマ・禁止事項・I/O 契約)</b></summary>

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
    早期終了する。続きは /takumi 続きから (continue mode) で再開できる。
  """,
  run_in_background: false
)
```

Agent が返した JSON を読み、ユーザーに 2-3 行で要約して終了する。
**以降の Phase 0c〜5 は Foreman (Agent) の内部手順**であり、Main では実行しない。

</details>

<details>
<summary><b>0c. 権限の自動確認</b></summary>

プロジェクトの `.claude/settings.json` を読み、以下のツールが `permissions.allow` に含まれているか確認:

```
Read, Write, Edit, Bash, Glob, Grep, Agent
```

不足があれば `.claude/settings.json` に追加する（既存の設定はマージ、上書きしない）。
これにより `/loop` でのハンズオフ実行時に承認プロンプトで停止しなくなる。

</details>

<details>
<summary><b>0d. 深度配分</b></summary>

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

</details>

---

## Phase 1 — 並列次元Discovery

> [!WARNING]
> Phase 1 の次元 Discovery は**必ず並列実行**すること。逐次実行は禁止。各次元ごとに Agent(Explore/haiku) を並列起動する。

各次元ごとに Agent(Explore/haiku) を**並列起動**する。

<details>
<summary><b>各エージェントへの指示テンプレート</b></summary>

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

</details>

---

## Phase 2 — Reconciliation（矛盾統合解決）

詳細手順は **`reconcile.md`** を読む。概要のみここに:

<details>
<summary><b>Reconciliation の 6 ステップ</b></summary>

1. **Step 2a — Merge + Dedup**: 全次元を1ファイルに統合、重複集約
2. **Step 2b — Conflict Detection**: 同一ファイル/コンポーネントに対する逆方向提案を検出、`conflicts.md` に出力
3. **Step 2c — 統合**: `integration-playbook.md` を参照し、矛盾を両立する解決案を生成
4. **Step 2d — 軍師 検証**: 全 統合 を codex exec で検証（真の 統合 か / 第3次元を犠牲にしていないか）
5. **Step 2e — Coherence Verification**: 解決済みペアの相互整合性
6. **Step 2f — Playbook 進化**: 新パターンを `integration-playbook.md` に追記

出力: `.takumi/sprints/{日付}/resolved-backlog.md`

</details>

---

## Phase 3 — 統合Triage

<details>
<summary><b>統合 Triage の 5 ステップ</b></summary>

resolved-backlog.md に対して triage と同じ手順を実行:

1. **MECE分類**: Bug/UX/Missing/Performance/Security/Accessibility/Architecture/DX
2. **ICE採点**: Impact x Confidence x Ease（統合案はConfidence+1加点）
3. **反論者チェック**: 軍師 に上位20件を送り OK/WARN/NG 判定
4. **スイープ選出**: 8-15件（統合案は2課題分としてカウント）
5. 出力: `.takumi/sprints/{日付}/backlog.md`

</details>

---

## Phase 4 — Plan + Execute

<details>
<summary><b>Plan + Execute の手順</b></summary>

1. `/takumi` パターン（バックログ入力モード）で Wave 計画を生成
   - 統合案は依存する2課題をセットで同一Waveに配置
   - 自己増殖型で計画
2. executor パターン (takumi 内部ロール) で実行

修正対象がテスト追加 / property 強化 / mutation score 向上を伴う場合は、
**verify skill を内部呼び出し** する (`~/.claude/skills/takumi/verify/README.md`)。
職人 タスクとして「verify L1 を utils に適用」のように具体化して Wave に組み込む。

</details>

---

## Phase 5 — 完了処理

<details>
<summary><b>完了処理と完了レポート テンプレ</b></summary>

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

</details>

---

## コンテキスト管理

<details>
<summary><b>コンテキスト消費の方針と残量 20% 時の挙動</b></summary>

- Phase 1: N個の独立エージェント → 親のコンテキスト消費は起動+結果受取のみ
- Phase 2: 構造化JSONで圧縮。矛盾ペアは全体の10-20%
- Phase 3以降: 既存probeと同等

**コンテキスト残量20%時**: resume.md を生成して中断。`/takumi 続きから` (continue mode) で sweep mode に再帰。

</details>

---

## 制約

> [!WARNING]
> 以下は sweep 実行時の**厳守事項**。違反すると並列性が壊れたり、統合の品質保証が無効化される。

<details>
<summary><b>制約 4 項目</b></summary>

- Phase 1 の次元Discovery は必ず並列実行（逐次禁止）
- 統合 は必ず軍師検証を通す（自己検証禁止）
- Playbook更新はsweep完了時のみ（実行中は読み取り専用）
- 各Phaseの区切りで進捗を報告するが、確認は求めず即座に次Phaseへ進む（ユーザーが「止めて」と言わない限り止まらない）

</details>
