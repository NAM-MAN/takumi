# 発見フェーズ (probe mode の内部処理)

プロダクトの現状を診断し、適切な発見者を選定し、証拠ベースで課題を洗い出す。
この文書は takumi の probe mode Phase 1 で参照される内部手順書であり、単独スキルではない。probe mode は `/takumi` に「security 見て」「perf 心配」等の観点発話を与えたときに自動遷移する内部モードであって、`/probe` という外部コマンドは存在しない。

## 4ロール体制

| ロール | モデル | 担当 |
|--------|--------|------|
| 棟梁 | opus (自分) | 製品診断・発見者選定・統合・ユーザー報告 |
| 軍師 | GPT-5.x (`codex exec`、env.yaml driven; baseline 5.4、auto で Plus user は 5.5、詳細: `~/skills/takumi/executor.md`「GPT-5.5 upgrade path」) | 発見結果の品質レビュー |
| 斥候 | haiku (Agent tool) | 各発見者としてコードを読み課題を探す |

## ファイル

| パス | 用途 |
|------|------|
| `.takumi/sprints/{日付}/profile.md` | 製品診断結果 |
| `.takumi/sprints/{日付}/discoveries.md` | 発見結果（最終出力） |
| `.takumi/sprint-config.md` | 発見者精度・キャリブレーション履歴 |

---

## Step 1 — 製品診断

以下のコマンドを**実際に実行**して定量データを取得する。推測しない。

```bash
# 並列実行可能
git log --oneline -30                          # 最近の変更領域
git diff --stat HEAD~30                        # 変更の規模感
pnpm test:run 2>&1 | tail -20                 # テスト通過状況
pnpm typecheck 2>&1 | tail -10                # 型エラー数
find src -name '*.ts' -o -name '*.tsx' | xargs wc -l | tail -1  # コード行数
git log --format='%H' --diff-filter=M -- src/ | head -30 | xargs -I{} git diff-tree --no-commit-id --name-only -r {} | sort | uniq -c | sort -rn | head -15  # 変更頻度の高いファイル
```

結果を `.takumi/sprints/{日付}/profile.md` に書き出す:

```markdown
# 製品診断: {日付}

## 定量データ
- コード行数: {N}行
- 成熟度: MVP (<5K行) | Growth (5K-30K行) | Mature (30K行+)
- テスト: {通過数}/{全数} ({通過率}%)
- 型エラー: {N}件
- 最近の変更領域: {上位5ディレクトリ}

## 変更頻度の高いファイル（ホットスポット）
1. {ファイルパス} — {変更回数}回
2. ...

## 前回プローブからの変化（あれば）
- 前回: {日付}
- 修正済み課題: {N}件
- 残課題: {N}件
```

---

## Step 2 — 発見者選定

### ユーザー指定の観点から発見者をマッピング

probe mode に遷移させた発話 (例: 「security 見て」「perf 心配」) から抽出した観点に対応する発見者を選定する:

| 観点キーワード | 発見者 |
|--------------|--------|
| `ux` | ペルソナ発見者、UXデザイナー発見者 |
| `security`, `sec` | セキュリティ発見者 |
| `perf`, `performance`, `bundle`, `重い` | パフォーマンス発見者 ([`roles/perf.md`](roles/perf.md) で C1-C6 checklist を適用) |
| `a11y`, `accessibility` | アクセシビリティ発見者 |
| `architecture`, `arch` | アーキテクチャ発見者 |
| `dx` | DX発見者 |
| `backend`, `api` | バックエンド発見者 |
| `edge`, `edge-case` | エッジケース発見者 |
| `consistency` | 一貫性発見者 |

### 各発見者の定義

**ペルソナ発見者**: ユーザー視点の使いにくさ → UIコンポーネント、画面フロー
**UXデザイナー発見者**: 操作性・一貫性・フィードバック → UIパターン、エラー表示、ローディング
**アーキテクチャ発見者**: 構造・結合度・拡張性 → ディレクトリ構成、依存関係、型定義
**セキュリティ発見者**: 認証/認可・入力検証・秘密情報 → auth/、API route、環境変数、RLS
**パフォーマンス発見者**: N+1・バンドルサイズ・再レンダリング → DB クエリ、import 構成、useEffect
**バックエンド発見者**: API 設計・エラーハンドリング・DB 設計 → route.ts、Repository、migration
**アクセシビリティ発見者**: キーボード操作・aria・コントラスト → UIコンポーネント、フォーム
**DX発見者**: 開発体験・テスト容易性・型安全性 → テストファイル、型定義、設定ファイル
**エッジケース発見者**: 境界値・並行操作・障害時の挙動 → バリデーション、状態遷移、エラーパス
**一貫性発見者**: 命名規則・UIパターン・エラー形式 → 全体横断

### キャリブレーション調整

`.takumi/sprint-config.md` が存在する場合:
1. 前回の発見者精度（発見数に対する採用数の比率）を読む
2. 精度30%未満の発見者は自動除外（完了レポートで報告のみ）
3. 精度80%以上の発見者は観点数を増やす（20→30）

**注意**: 除外判断はユーザーに確認せず自動で行う。除外した場合は完了レポートで報告のみ。

### ホットスポット優先

製品診断で特定したホットスポット（変更頻度の高いファイル）に関連する発見者を優先する。
例: auth/ が頻繁に変更されている → セキュリティ発見者を必ず含める。

---

## Step 3 — 発見者実行

各発見者を**並列サブエージェント（斥候/haiku）**で実行する。

### サブエージェントへの指示テンプレート

```
Agent tool:
  subagent_type: "Explore"
  model: "haiku"
  prompt: |
    あなたは「{発見者名}」として、以下のプロダクトの課題を探す。

    ## あなたの観点
    {観点の説明}

    ## 探索対象
    以下のファイル/ディレクトリを実際に読んで調査せよ:
    {探索対象のパスリスト}

    ## ホットスポット（優先的に確認）
    {製品診断で特定した変更頻度の高いファイル}

    ## 出力形式（厳守）
    発見ごとに以下の形式で出力せよ。推測ではなく、実際にコードを読んで見つけた問題のみ報告。

    ### {通し番号}. {課題タイトル（1行）}
    - **証拠**: `{ファイルパス}:{行番号}` — {該当コードの引用または説明}
    - **問題**: {何が問題か（2-3文）}
    - **影響**: {誰にどう影響するか}
    - **分類**: Bug | UX | Missing | Performance | Security | Accessibility | Architecture | DX

    ## ルール
    - 証拠のないものは報告しない
    - 1つの発見は1つの問題に絞る（複合しない）
    - 既知の仕様（CLAUDE.mdに記載済み）は報告しない
    - 最低10件、最大30件
```

### 実行方法

1. 選定された発見者を**全て並列**で起動（Agent tool を同一メッセージで複数呼び出し）
2. 全サブエージェントの完了を待つ
3. 結果を統合して `.takumi/sprints/{日付}/discoveries.md` に書き出す

### 統合出力フォーマット

```markdown
# 発見結果: {日付}

## 製品診断サマリ
- 成熟度: {MVP/Growth/Mature}
- 使用した発見者: {N}名
- 総発見数: {N}件

## ペルソナ発見者（{N}件）

### D-001. {課題タイトル}
- **証拠**: `src/ui/LoginForm.tsx:42` — パスワード入力時にバリデーションメッセージが表示されない
- **問題**: ユーザーがパスワード要件を満たしているか、送信するまでわからない
- **影響**: 全ユーザーがフォーム送信→エラー→修正のサイクルを強いられる
- **分類**: UX

### D-002. ...

## UXデザイナー発見者（{N}件）
...

## セキュリティ発見者（{N}件）
...
```

---

## Step 4 — 品質チェック（任意）

発見数が50件を超える場合、軍師 にノイズ除去を依頼:

<!-- hardening v2 (2026-05-03): stdin heredoc / `timeout 600s` / 5.5 default / prompt 1.5KB 上限。
  ファイル本文は呼出側で埋込み、codex に「読め」命令で hang trigger を引かない (詳細: `executor.md`「invocation hardening v2」)。 -->
```bash
PROMPT_FILE=$(mktemp)
cat > "$PROMPT_FILE" <<EOF
以下の発見リストから、証拠が不十分または影響が極めて小さいものを特定せよ。
削除候補の ID リストと理由を日本語で出力せよ。出力 1.5KB 以内。

## 発見リスト
$(cat .takumi/sprints/{日付}/discoveries.md)
EOF
timeout 600s codex exec -m gpt-5.5 -s read-only --skip-git-repo-check -C "$(pwd)" - < "$PROMPT_FILE" 2>&1 | tail -100
```

**注意点:**
- `-` で stdin 経由 prompt 渡し (codex に「読め」命令しない、長 prompt + sandbox の hang trigger 回避)
- `timeout 600s` で hard timeout、超過時は subagent (Sonnet via Agent tool) Tier 2 fallback
- 発見リストが 1.5KB 超なら ICE 上位だけ抽出するか、subagent 直接 dispatch を検討
- `--skip-git-repo-check` 必須 (sandbox trust 問題回避)

軍師 の指摘に基づき、discoveries.md から低品質な発見を除外。

---

## 完了

ユーザーに日本語でサマリを提示:

```
発見フェーズ完了:
- 使用した発見者: {リスト}
- 総発見数: {N}件（分類別: Bug {n}, UX {n}, Security {n}, ...）
- ホットスポット関連: {N}件

詳細: .takumi/sprints/{日付}/discoveries.md

→ 選別フェーズに進みます。
```

---

## 制約

- 推測で課題を作らない。必ずコードを読んで証拠を示す
- CLAUDE.md に記載された仕様通りの動作は課題にしない
- 発見者は並列実行し、逐次実行しない
- `.takumi/sprints/{日付}/` ディレクトリがなければ作成する
