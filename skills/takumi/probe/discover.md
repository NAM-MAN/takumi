# 発見フェーズ (probe mode の内部処理)

プロダクトの現状を診断し、適切な発見者を選定し、証拠ベースで課題を洗い出す。
この文書は takumi の probe mode Phase 1 で参照される内部手順書であり、単独スキルではない。probe mode は `/takumi` に「security 見て」「perf 心配」等の観点発話を与えたときに自動遷移する内部モードであって、`/probe` という外部コマンドは存在しない。

## 4ロール体制

| ロール | モデル | 担当 |
|--------|--------|------|
| 棟梁 | opus (自分) | 製品診断・発見者選定・統合・ユーザー報告 |
| 軍師 | GPT-5.x (`codex exec`、env.yaml driven; baseline 5.4、auto で Plus user は 5.5、詳細: `~/skills/takumi/gunshi-invocation.md`「GPT-5.5 upgrade path」) | 発見結果の品質レビュー |
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
| `data-access`, `cache`, `server-state`, `fetch`, `楽観`, `キャッシュ` | データアクセス発見者 |

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
**データアクセス発見者** (`data-access-protocol.md` 観点): read/cache/mutation の不具合 → fetch hook、Server Action、route handler、store。検出対象 (証拠付き):
- naive refetch (mutation 後に全体再取得 / 毎回サーバー問い合わせ・spinner 待ち)
- 楽観更新の欠落 (可逆 mutation なのに await 後反映で UI が待たされる) / 楽観なのに**失敗時 UX 欠落** (握り潰し → data-loss)
- 手書き/脆い cache key、`JSON.stringify` の object key
- 同一 entity が list と detail で別 shape・別取得で二重管理
- **list-affecting invalidation 漏れ** (mutation 後に list 順/件数/filter 結果が腐る — 最初に壊れる 1 点)
- over-fetch (shape 宣言なしで必要 field 以上を取得)
- 入力喪失リスク (stale overwrite / 並行編集 / server canonicalization を楽観表示)
- **過剰実装** (DA-0 で足りる surface に codegen/正規化 store/AST 機構)

> **校正**: **機械 lint (`templates/ddp-lint.mjs` の D1/D5) と本 LLM 発見者が独立に silent-catch を一致検出** = 高信頼カテゴリ (silent-catch / fragile-key)。一方 **over-fetch / list-detail-dup / 過剰実装 は contract 依存** (caller contract や DA tier 不明だと正当な実装を誤検出しうる) → これらは **advisory** とし、判定に surface の DA tier と契約 anchor を要求する (確信が無ければ「intent 不明」と明示し flag しない、FP 抑制)。fire-and-forget (telemetry 等) の silent-catch は正当 → `ddp-lint-ignore` 同様に発見からも除外。

### 発見ラダー L0-L6 (L6 巡視 pilot-gated)

上記の発見者は **L0 (標準観点)**。固定観点を1巡して止めると family を取り逃す。**現レベルが新規発見を出さなくなったら次レベルへ昇格**し、レンズを敵対的に強くする:

| Lv | レンズ | 内容 |
|---|---|---|
| **L0** | 標準観点 | 上記の発見者 (calibration 重み付け) を1巡 |
| **L1** | calibrated ペルソナ | L0 で手薄な領域を狙うペルソナ 3-5 体を動的生成し監査 |
| **L2** | red-team / 反転 | 各重要フローで「どう致命的に壊す/悪用するか」を問い、それを可能にするコードを探す |
| **L3** | 契約差分 | **TopContract (`../contract/contract-spine.md` の I1-I6/T1-T4) に対し AC 化漏れの不変条件違反を炙る**。必須 sub-lens 3 本 — **(a) unit/型 consistency**: 値の producer↔consumer で単位・型・スケール一致を全 call-site 突合 / **(b) transaction-integrity**: 不可分であるべき複数永続更新の tx/lock 境界欠落 / **(c) data-access-protocol 違反** (`../contract/data-access-protocol.md`): I6 由来の freshness/可逆性が宣言で緩和されていないか、楽観既定に反する naive refetch、list-affecting invalidation 漏れ |
| **L4** | メタ | 「この種のコードで見落としたら恥ずかしいバグ類型は何か」を挙げて点検 (cache stale / 楽観握り潰し / invalidation 漏れ等の data-access 類型を含む) |
| **L5** | execution probe (条件付・narrow) | **静的が原理的に届かない family を実行/test で炙る**。対象限定: (a) ordering/spec-regression (`ORDER BY` 等、実装は妥当に見え runtime 順序でのみ違反) / (b) 参照整合性の emergent orphan (cross-scope reorder・approve/delete 列・failed→pending 誤計上) / (c) 状態機械 sequence (claim/release の attempts drift・境界 off-by-one)。**前提**: 実行可能 test harness (vitest+fast-check 等) と **安全 containment** (sandbox / in-memory DB / network deny / real-DB write 遮断 / 副作用 audit) が揃う project のみ。無ければ skip。state/tx/magnitude は L0-L4 で足りるため L5 を全 family には広げない |
| **L6** | 巡視 (挙動/視覚、条件付) | **実際にアプリを触ると分かる family を実アプリ走行で炙る** (`../junshi/`)。①TopContract T1-T4 から journey 再生成 → ②使い捨て capture → ③4 オラクル (spec/differential/metamorphic/taste) → ④反証 → ⑤discovered。静的 (L0-L4) + execution-test (L5) が届かない「描画/導線/視覚/操作後状態」を補う。**前提**: L5 と同じ harness + 安全 containment + `.takumi/specs/{surface}.md` (オラクル源)。趣きオラクルは advisory・never-block。無ければ L6 skip (L5/L4 で停止)。**pilot-gated** (`../junshi/pilot.md`) |

> [!IMPORTANT]
> **ラダー設計の要**: ラダー (L3 契約差分を含む) は固定10観点1巡・ランダムペルソナより family カバレッジ・precision で優り、volume 勝ちでない。特に **L3 契約差分のみが状態遷移/データ整合/運用制約 family を拾う**。**ランダムペルソナ単体は固定観点と同等で無効** — active ingredient は「ペルソナ生成」でなく「L3 契約差分という構造」。
> **L5 の位置づけ**: read-only 静的は **orphan-fk (cross-scope reorder / approve-delete 列) と ordering/spec-regression (`ORDER BY`) を原理的に取り逃す** (「コードは妥当な実装に見え runtime でのみ spec 違反」)。よって runtime-only family に限り L5 を追加。**安全 harness 必須** (副作用 leak 1 件で probe 無効 = 即 reject)。test harness 不在 project は L5 skip。state/tx/magnitude は静的で回収できるため L5 対象外 (full layer に広げない)。

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

### 実行方法 (ラダー escalation)

1. **L0**: 選定された発見者を**全て並列**で起動（Agent tool を同一メッセージで複数呼び出し）、完了を待つ
2. **昇格判定**: 直近レベルが新規発見 (既出と dedup 後) を出さなくなったら次レベル (L1→L2→L3→L4→L5→L6) を起動。各レベルも並列サブエージェントで実行。**L5/L6 は条件付** (L5: runtime-only family 観点 + 実行可能 test harness + 安全 containment / **L6: 巡視** = 上記 + `.takumi/specs/{surface}.md` オラクル源、`../junshi/`)。揃わなければ揃う最上位 (L4 or L5) で停止
3. **停止 = 限界効用** (`runtime.md` 終了条件): 「新規発見ゼロ」で即停止せず、**新レベル (新レンズ) を起動しても新規が出ない**= 観点生成器が飽和したときのみ収束。L6 (harness 不在なら L5/L4) まで登り切って無収穫が続いて初めて停止
4. 全レベルの結果を統合して `.takumi/sprints/{日付}/discoveries.md` に書き出す (各発見に到達レベルを付記)

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

<!-- stdin heredoc / `tk_timeout 600` / 5.5 default / prompt 1.5KB 上限。
  ファイル本文は呼出側で埋込み、codex に「読め」命令で hang trigger を引かない (詳細: `gunshi-invocation.md`「invocation hardening v2」)。 -->
```bash
PROMPT_FILE=$(mktemp)
cat > "$PROMPT_FILE" <<EOF
以下の発見リストから、証拠が不十分または影響が極めて小さいものを特定せよ。
削除候補の ID リストと理由を日本語で出力せよ。出力 1.5KB 以内。

## 発見リスト
$(cat .takumi/sprints/{日付}/discoveries.md)
EOF
tk_timeout 600 codex exec -m gpt-5.5 -s read-only --skip-git-repo-check -C "$(pwd)" - < "$PROMPT_FILE" 2>&1 | tail -100
```

**注意点:**
- `-` で stdin 経由 prompt 渡し (codex に「読め」命令しない、長 prompt + sandbox の hang trigger 回避)
- `tk_timeout 600` で hard timeout、超過時は subagent (Sonnet via Agent tool) Tier 2 fallback
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
