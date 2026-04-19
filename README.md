# takumi (匠)

**Claude Code で開発の全工程を `/takumi` 1 つのコマンドに集約する skill。**
「次何を作るか?」を伝えるだけで、仕様の深掘り・デザイン生成・実装・テスト・コードレビューまで走ります。

---

## 5 分で試す

```bash
# 1. インストール (gh CLI v2.90.0+ が必要)
gh skill install NAM-MAN/takumi

# 2. Claude Code を開いて、自分のプロジェクトで実行
/takumi note に お気に入り機能を追加して
```

対話で数問 → 仕様確定 → 計画 → 実装 → テスト → gate 通過、が自動で走ります。

---

## こんなとき使う(ユースケース)

| やりたいこと | 伝え方 |
|---|---|
| 新機能を追加したい | `/takumi note の一括リネーム機能を追加して` |
| 既存画面を改修 | `/takumi dashboard の並び順を drag&drop にして` |
| セキュリティが心配 | `/takumi security 見て` |
| パフォーマンスが気になる | `/takumi perf 調べて` |
| リリース前の総点検 | `/takumi リリース前に全般見て` |
| コードを綺麗にしたい | `/takumi auth 周りをリファクタして` |
| テストの鋭さを上げたい | `/takumi 認証モジュールのテスト強化して` |
| 中断した作業を再開 | `/takumi 続きから` |
| 今動いてるものを止めたい | `/takumi 止めて` |

**コマンドを覚える必要はありません。自然文で `/takumi` に伝えるだけ**。takumi が意図を読んで適切な内部処理に振り分けます。

---

## 思想(4 つ)

### 1. 作ってから疑うのではなく、最初から正しく

テストは実装後に後追いで書くものではありません。takumi は仕様を AC-ID (Acceptance Criterion) に原子分割し、各 AC に最適なテスト戦略(Property-Based / Model-Based / Differential 等)を自動選定。wave gate で mutation score や layout invariant を満たさないと次へ進めません。**「直してから疑う」→「壊れ方を先に固定してから実装」** に思想を変えます。

### 2. 人間が覚えるコマンドは 1 つだけ

`/plan` `/probe` `/sweep` `/exec` を覚えなくていい。`/takumi <自然文>` だけで済みます。意図分類は内部で決定木が処理、曖昧な時は 1 問だけ確認します。サブコマンド構文(`/takumi override ...` 等)は採用せず、全て自然文。

### 3. 自動化は event 駆動、常時巡回しない

`verify-loop` を 10 分おきに回し続けるような疲労労働はしません。mutation score が急落した、本番障害が起きた、リリースブロッカーが出た、といった event が起きた時だけ loop は動きます。普段は静か。

### 4. デザインは seeded inference で「一撃必中」

「Notion っぽく」を繰り返してデザイン調整する疲労も解消。`ref_archetypes` (1-2 個) + `brand_tone` + `product_type` + `target_user` の 4 項目で seeded 設計を実行。同じ入力なら同じ style-guide が出る(drift 不能)。画面ごとの sitemap / wireframe / interactions も自動生成。

---

## インストール

### 必要なもの

- [Claude Code](https://docs.anthropic.com/claude-code)
- [gh CLI v2.90.0+](https://github.com/cli/cli)
- (推奨) [codex CLI](https://github.com/openai/codex) — gpt-5.4 による敵対的レビューに使用

### 手順

```bash
# install 前に内容確認(セキュリティ上の推奨)
gh skill preview NAM-MAN/takumi takumi

# install (skill 名省略可能)
gh skill install NAM-MAN/takumi

# バージョン固定したい場合
gh skill install NAM-MAN/takumi takumi --pin v0.2.3

# 更新 / 削除
gh skill update takumi
gh skill uninstall takumi
```

インストール後、Claude Code を開いて `/takumi` が候補に出れば OK。

---

## 使い方(6 mode、自動で振り分く)

自然文で伝えると、内部で以下 6 mode のいずれかに振り分けられます。

### normal — 新機能や変更

```
/takumi note に お気に入り機能を追加
```
対話で要件を深掘り → AC-ID 自動起草 → デザイン生成(UI 時) → 計画 → 実装 → テスト → gate。

### probe — 観点指定の診断 + 修正

```
/takumi security 見て
/takumi perf と a11y 調べて
```
発見者 (haiku Agent) を観点ごとに並列起動 → ICE 採点 → 修正計画 → 実行。

### sweep — 全域棚卸し

```
/takumi リリース前に総点検
```
8 品質次元(機能正確性 / UX / Missing / Performance / Security / Accessibility / Architecture / DX)を並列スキャン → 矛盾する発見を「統合パターン」で同時解決 → backlog 生成。

### status — 今なにが動いているか

```
/takumi 今なに動いてる?
```
自動処理・gate 判定・停止中の override を 30 秒で提示。

### continue — 中断からの再開

```
/takumi 続きから
```
前回の `mode` と `active_run_id` から復元。

### override — 緊急停止

```
/takumi 止めて
/takumi auth の loop 止めて
/takumi hard gate を warning に
```
`.takumi/control/` に一時 override を記録。自動処理を止める。

---

## プロジェクトに何が書かれるか

takumi はプロジェクトルートの `.takumi/` ディレクトリ配下だけに書き込みます(既存コードには `/takumi` を明示的に呼んで実装する時だけ変更)。

```
.takumi/
├── plans/{name}.md              # Wave 計画
├── specs/{feature}.md           # AC-ID (Acceptance Criterion)
├── design/                      # sitemap / style-guide / wireframes (ui)
├── profiles/                    # verify / design / refactor profile
├── sprints/{date}/              # probe / sweep の証跡
├── discovery-calibration.jsonl  # 発見者精度 ledger
├── telemetry/                   # 指標計測
├── control/                     # 一時 override
└── state.json                   # 実行状態
```

Git 管理には以下を推奨:

```
# .gitignore
.takumi/sprints/
.takumi/control/
.takumi/telemetry/
```

残り(`plans/`, `specs/`, `design/`, `profiles/`, `state.json`)はチームで共有する価値があるので追跡します。

---

## 4 ロール体制

takumi の内部で 4 つの AI ロールが役割分担します。

| ロール | モデル | 担当 |
|---|---|---|
| 棟梁 (touryou) | opus | 全体統括・ユーザー対話・計画作成 |
| 軍師 (gunshi) | gpt-5.4 (codex exec) | 深い判断・敵対的レビュー |
| 職人 (shokunin) | sonnet (Agent) | 実装 |
| 斥候 (sekkou) | haiku (Agent) | 調査 |

codex CLI がないと軍師ロールはスキップされ、棟梁(opus)が代替レビューします(品質はやや落ちる)。

---

## 初めての人がよく思う疑問

### Q1. インストールしたら勝手に何か始まる?

いいえ。`/takumi` を明示的に呼ぶまで takumi は完全に静かです。自動 event 駆動(mutation drop 等での loop 起動)も、初回の `/takumi` 実行で state が作られてからでないと動きません。

### Q2. 既存プロジェクトに入れて壊れない?

takumi は `.takumi/` 配下にしか書きません。既存コードを変更するのは「`/takumi 新機能追加` のように明示的に実装を依頼した時だけ」です。試すなら新規ブランチ推奨。

### Q3. 試しに使ってみて合わなかったら消せる?

はい。

```bash
gh skill uninstall takumi      # skill 削除
rm -rf .takumi/                # プロジェクト状態の削除
```

これで完全に戻ります。Git 管理外です。

### Q4. 対話が日本語なのは何で? 英語でも使える?

takumi の対話は日本語で設計されています(意図分類辞書も日本語中心)。英語でも `/takumi add archive feature to notes` のように動きますが、一部の観点語(「心配」「調べて」等)は日本語の方が判定精度が高いです。貢献歓迎(辞書の PR)。

### Q5. コストはどれくらい?

1 回の `/takumi` 実行あたり、おおよそ:
- 小規模 feature (1-2 ファイル): $0.5-2
- 中規模 (4-10 ファイル、Wave 3 以内): $2-10
- probe (観点指定診断): $3-8
- sweep (8 次元全域): $10-30

モデル内訳: opus (対話) + codex/gpt-5.4 (敵対的レビュー、最も高い) + sonnet (実装) + haiku (調査)。軍師(codex)を省けば約半額。

### Q6. Claude Code がない環境でも動く?

動きません。takumi は Claude Code の skill として作られています。

### Q7. 最初は何から試すべき?

**小さな新機能追加**を 1 つ試すのが一番早いです:

```
/takumi このプロジェクトに <簡単な機能> を追加して
```

1 回成功すれば「対話 → AC → 計画 → 実装」の流れが体感で分かります。最初から probe や sweep をやると情報量が多くて圧倒されがちです。

### Q8. `takumi takumi` と 2 回書くのはなぜ?

`gh skill install OWNER/REPO SKILL` という gh CLI の文法です。たまたま repo 名と skill 名が同じ `takumi` だから 2 回出るだけ。`gh skill install NAM-MAN/takumi` と省略形も使えます。

### Q9. 自動振り分けがいつも正しいの?

100% ではありません。曖昧な時は **1 問だけ確認**します(「security feature を追加しますか、security 診断しますか?」)。恒常的な誤分類は telemetry で計測、辞書(`natural-language.md`)を運用で拡充します。

### Q10. 他の Claude Code skill と競合しない?

しません。takumi は内部に全機能を持ち、他の skill を呼びません。既存の `/review` や `/security-review` などはそのまま動きます。

---

## トラブルシューティング

### `gh skill install` で「unknown command」

gh v2.89 以前です。`brew upgrade gh` で v2.90.0+ に更新してください。

### install しても `/takumi` が候補に出ない

Claude Code を再起動。まだ出ない場合:

```bash
gh skill list         # install 済みの確認
ls ~/.claude/skills/  # symlink が貼られているか確認
```

### 振り分けが毎回曖昧で聞き返される

`natural-language.md` の辞書が project 固有語彙をカバーしていない可能性。`~/.claude/skills/takumi/natural-language.md` に直接例文を追加するか、issue を作ってください。

### wave gate でずっと mutation_floor を満たせない

初期導入時によくあります。task 単位の `mutation_tier` を `low` に明示指定すれば floor が下がります:

```markdown
- [ ] 1. **タスク名**
  - **mutation_tier**: low
```

---

## 既存プロジェクトからの移行

旧 `.sisyphus/` を使っていた場合:

```bash
cd path/to/existing/project
mv .sisyphus .takumi
```

中身のファイル構造は 1 対 1 対応なので、リネームだけで動きます。

---

## 詳細ドキュメント

- **skill 本体**: `~/.claude/skills/takumi/SKILL.md`(install 後)
- **意図分類辞書**: `takumi/natural-language.md`
- **6 mode の内部**: `takumi/probe/`, `takumi/sweep/`, `takumi/design/` 等のサブディレクトリ
- **検証戦略 (L1-L6)**: `takumi/verify/`
- **リファクタ policy (5 profile)**: `takumi/strict-refactoring/`
- **儀式化 drift 検出**: `takumi/telemetry-spec.md`

---

## 設計経緯

本 skill は 7 ラウンドの Oracle (gpt-5.4) 敵対的レビューを経て設計されました。主要議題:

1. 9 フェーズ案の穴潰し
2. scope reduction (SQLite → YAML、supervisor 軽量化)
3. loop 設計 (event-driven + priority 2 段)
4. first-time-right (後追い loop 疲労の解消)
5. 最終統合版 (条件付き採用)
6. 最小コマンド (2 個 → 1 個に絞り込み)
7. strict-refactoring policy (profile registry、Tier A-D、actionPreconditions contract)

興味のある方は git log を追うとそれぞれの判断が追えます。

---

## 貢献

issue / PR 歓迎:

- 新しい観点語 / 診断動詞の追加 (`natural-language.md`)
- 言語別緩和ルール (`language-relaxations.md`)
- 統合パターン追加 (`integration-playbook.md`)

---

## ライセンス

MIT
