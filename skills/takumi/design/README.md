---
name: design
description: "仕様と画面一覧から IA・style guide・wireframe・interactions を seeded inference で一発生成するスキル。/design で起動。project_mode=ui で mandatory。"
---

# design: UI の揺れを、最初から封じる設計スキル

「Notion っぽく」「もう少しモダンに」で終わらない、**再現性のある UI 設計**へ。

```
/design
```

たった 4 つの情報 (製品の種類・想定ユーザー・ブランドトーン・参考サイト 1-2 個) を渡すだけで、サイトマップ・スタイルガイド・ワイヤーフレーム・マイクロインタラクションが一気通貫で決まります。同じ入力からは同じ出力を返す **seeded design (種付きデザイン)** 方式です。

---

## こんなお悩み、ありませんか?

- AI に UI を作らせると、同じ指示でも毎回違うものが出てくる
- 画面ごとにトーンがバラバラで、全体の一貫性が崩れている
- 「あとで調整」のつもりが、画面数が増えて直せなくなっている
- スタイルガイドを作っても、実装時に守られない
- overflow、ボタンが押せない、コントラスト不足など、ありがちなレイアウトバグが本番まで残る
- デザイナーに都度依頼できず、エンジニアだけで体裁の良い画面を作りたい

design スキルは、**「作ってから調整」ではなく「壊れ方と見え方を先に固定」**します。デザインのレビューコストを前払いする、というのがこのスキルの立ち位置です。

---

## design が解決すること (6 つの視点)

### 1. 4 つの入力に絞る (過剰な問診をしない)

UI 設計ツールの多くは、最初に膨大な質問をしてきます。design スキルは必須入力を 4 つだけに絞り込みました。この 4 つが揃えば、残りは全部自動で決まります。

- **製品の種類 (product_type)** — SaaS ダッシュボード / 消費者向けモバイル / LP / 管理画面 / 編集系キャンバス のどれか
- **想定ユーザー (target_user)** — 役割 + 状況 + 頻度を 1 文で (例: 「B2B SaaS の経理担当、月次で数回、他業務と並行しながら」)
- **ブランドトーン (brand_tone)** — 声のトーンを形容詞 2-3 語で (例: `serious, trustworthy, financial`、`playful, energetic, youth`)
- **参考サイト (ref_archetypes)** — 類似プロダクトを **1-2 個だけ** (例: `Linear, Vercel`)

参考サイトを 3 個以上指定すると、平均化されて個性が死にます。**2 個まで**という制限はこの結果を避けるための設計です。

### 2. 同じ入力から、同じ出力を返します (Seeded Design Inference)

AI に UI を任せると、同じ指示でも毎回違うものが出てきます。色、余白、角丸、モーション — 推論のたびに 10-20% ぶれます。このブレを許容すると、画面間で一貫性が崩れ、デザイントークン (色や間隔の変数) が形骸化します。

design スキルは、4 つの入力を**決定論的に**トークンに落とし込みます。同じ入力なら同じトークンセット (色、タイポグラフィ、余白、角丸、シャドウ、モーション) が決まります。各画面はそのトークンを参照するだけなので、**後から「このボタンの色だけ違う」問題が起こりません**。

### 3. 壊れ方を先に決めます (L7 Layout Invariant)

画面を作ってから「この画面は overflow してる」「このボタンはタップ領域が小さすぎる」と気づくのは遅すぎます。design スキルは、**レイアウトの不変条件**を生成時ではなく検証時に機械的にチェックします。

3 層に分けて管理します:

- **Hard Gate (5-7 項目)** — 失敗したら即ブロック。overflow ゼロ、タップ領域 32px 以上、focus-visible、AA コントラスト、など
- **Soft Gate (4-6 項目)** — 警告のみ。閾値超過で fail。余白がトークンスケール通り、アイコンは lucide のみ、など
- **Lint (4-6 項目)** — eslint / stylelint で静的解析。カラートークン以外禁止、任意の Tailwind クラス禁止、など

**「たぶん壊れてない」ではなく「壊れていないことが検証された」画面**が出てきます。

### 4. サイトマップから wireframe まで一気通貫

Phase 1 から 6 まで、デザインの工程を順に進めます。

| Phase | 出力 |
|---|---|
| 1. IA 推論 | サイトマップ (オブジェクト一覧・アクション一覧・画面階層) |
| 2. スタイルガイド | 色・タイポ・余白などのトークンセット |
| 3. コンポーネント基盤 | shadcn/ui + Tailwind + framer-motion + lucide-react の選定表 |
| 4. マイクロインタラクション | hover / focus / skeleton / toast の標準 |
| 5. ワイヤーフレーム | 画面ごとの ASCII 骨格 + オブジェクト表 |
| 6. /takumi 連携 | task への design_profile_ref 埋め込み |

**画像バイナリは出力しません。** markdown と yaml のみで完結します (人間がレビューしやすく、git diff で追える)。

### 5. 技術スタックを固定 (選定疲れからの解放)

「今回の UI は何で組む?」を毎回議論するのをやめました。design スキルは以下のスタックに固定です。

- **shadcn/ui** — 所有権がある (コピペして自分のコードになる) React コンポーネント
- **Tailwind CSS** — ユーティリティファーストの CSS フレームワーク
- **framer-motion** — React 向けアニメーションライブラリ
- **lucide-react** — 統一感のあるアイコンセット

これらはエコシステムが大きく、Claude や他の AI もよく知っています。「このライブラリ、このバージョンだと動かない」という事故を避けるために、**固定することで品質を担保**しています。

### 6. verify スキルと同時にゲート評価

design スキルの L7 Hard Gate は、テスト戦略スキル (verify) の mutation gate と**同時に**評価されます。

```
wave 1 gate:
  - build (tsc)                        ← 共通
  - test pass                          ← 共通
  - mutation_floor (verify profile)    ← テストが鋭いか
  - l7_hard (design profile)           ← レイアウトが壊れていないか
  - l7_soft report only                ← レイアウトの警告
  - oracle_review                      ← 最終 AI レビュー
```

**テストが通っていてもレイアウトが壊れていれば、次の Wave に進みません。** 「動くけど見た目が変」を原理的に防ぎます。

---

## 用語解説 (初めて聞く方へ)

| 用語 | 意味 |
|---|---|
| **IA (Information Architecture)** | 情報設計。画面やデータの構造・階層を決めること |
| **Sitemap (サイトマップ)** | 画面全体の地図。どこから何へ遷移できるかの一覧 |
| **Wireframe (ワイヤーフレーム)** | 色や装飾なしの画面骨格。構造だけを示す線画 |
| **Style Guide (スタイルガイド)** | 色・フォント・余白などのデザイン決まりごと集 |
| **Design Token** | 「primary-color は #1f2937」のように、デザイン値を変数化したもの |
| **shadcn/ui** | React コンポーネント集。コピー&ペースト方式でプロジェクトに取り込む |
| **Tailwind CSS** | HTML に直接クラスを書いてスタイルを当てる CSS フレームワーク |
| **framer-motion** | React のアニメーションを宣言的に書けるライブラリ |
| **lucide-react** | MIT ライセンスのアイコンライブラリ (旧 feather icons の後継) |
| **WCAG AA** | Web アクセシビリティガイドライン。AA はコントラスト比 4.5:1 などの基準 |
| **focus-visible** | キーボード操作時だけフォーカスリングを表示する CSS 疑似クラス |
| **L7 Layout Invariant** | 「どう変化してもレイアウトは壊れない」という不変条件群 |
| **Seeded Inference** | 同じ入力から同じ出力を返す決定論的な推論 |
| **OOUI (Object-Oriented UI)** | オブジェクト (名詞) を中心に画面を組み立てる UI 設計 |
| **Archetype** | 典型的なパターン。ここでは参考となる類似プロダクト |

---

# 以下、AI 実行時に参照する仕様

`/design` を実行した AI エージェントが読む仕様セクションです。

---

## 哲学

人間のデザイン review は高コストで、AI に後調整させると**同一入力で 10-20% ブレる**。
この揺らぎを許容すると画面間の一貫性が失われ、token が形骸化する。

そこで本 skill は 2 つの原則で設計する:

1. **壊れ方を先に決める** — L7 Layout Invariant の hard gate 5-7 項目を最初に固定し、
   overflow / a11y / クリック不能 / grid 破綻 を「生成時」ではなく「検証時」に弾く。
2. **見え方を seeded で決める** — 必須入力 4 項目と ref_archetypes から、color /
   typography / spacing / radius / shadow / motion を**固定 token set**に落とす。
   同じ入力で同じ出力を返す (seeded design inference)。

完全自動推論は降格。類似サイト参照は**候補提示**に留め、最終決定は常に token set
に収束させる。**後から rework するコストを先払いする**のがこの skill の立ち位置。

---

## ツール方針 (重要)

- **追加ツールゼロ**。pencil MCP は使わない (Read / Grep / Write / Edit で完結)
- スタック固定推奨: **shadcn/ui + Tailwind + framer-motion + lucide-react**
- 参照は markdown と yaml のみ、バイナリ生成物は扱わない
- 画像の snapshot は `/verify` の smoke E2E が撮る (本 skill は ASCII + token 表のみ)

---

## project_mode 分岐

`/takumi` interview で決まる `project_mode` により、本 skill の扱いが変わる:

| project_mode | 扱い | 必須フェーズ |
|---|---|---|
| `ui` | **mandatory** (全フェーズ通過必須) | Phase 1-6 全て |
| `mixed` | optional (UI を含む task のみ) | Phase 1,2,5 (3,4,6 はスキップ可) |
| `backend` | **N/A** (起動しない) | なし |

`backend` で `/design` を叩いたら「UI を持たない project では不要」とだけ返して
terminate する。`mixed` で UI を含まない task は `design_profile_ref: null` で
telemetry に流れる (付帯率の分母から除外)。

---

## 必須入力 4 項目

インタビュー冒頭で**必ず**この 4 項目を確定させる。1 つでも欠けたら先へ進めない。

### 1. `product_type`

製品のカテゴリ。生成される IA と wireframe 骨格の前提になる。

| 例 | 意味 |
|---|---|
| `saas_dashboard` | 業務 SaaS、密度高めの data grid 中心 |
| `consumer_mobile` | 一般向けモバイル、gesture 中心、情報密度低 |
| `marketing_lp` | landing page、hero + benefit + CTA の単一流れ |
| `internal_tool` | 社内管理画面、form + table の組合せ、装飾最小 |
| `creative_canvas` | editor / whiteboard 系、realtime + canvas |

### 2. `target_user`

想定ユーザーの 1 文記述。**役割 + 状況 + 頻度**を含める。

例:
- 「B2B SaaS の経理担当、月次で数回、他業務と並行しながら」
- 「消費者、スマホで電車移動中、1 日 1-2 回」
- 「エンジニア、PC で業務時間中、1 日中張り付き」

### 3. `brand_tone`

声のトーンを 2-3 語で。形容詞 + 形容詞 + (名詞) の形を推奨。

| 例 | 解釈 |
|---|---|
| `serious, trustworthy, financial` | 金融系、装飾控えめ、色数少なめ |
| `playful, energetic, youth` | 彩度高め、motion 豊富、丸み |
| `minimal, neutral, pro` | 背景薄、文字主体、motion 控えめ |
| `warm, human, community` | 肌色系、手書き風 accent、圧迫感なし |

### 4. `ref_archetypes`

類似サイト・プロダクトを **1-2 個**。名前で良い。**3 個以上は禁止**(平均化して個性が死ぬ)。

| 例 |
|---|
| `Linear, Vercel` |
| `Notion` |
| `Stripe Dashboard, Datadog` |
| `Airbnb` |

複数指定時は「前者を骨格、後者を accent」として inference する。順序に意味を持たせる。

---

## Phase 1-6 (概要)

| Phase | 内容 | 出力 |
|-------|------|------|
| 1 | IA 推論 (AC → objects / actions / screens / sitemap) | `.takumi/design/sitemap.md` |
| 2 | Style Guide seeded 決定 (ref_archetypes + brand_tone → 固定 token) | `.takumi/design/style-guide.md` |
| 3 | コンポーネント基盤 (shadcn/ui + Tailwind + framer-motion + lucide-react 固定) | (install + 選定表) |
| 4 | マイクロインタラクション標準化 (motion / hover / focus / skeleton / toast) | `.takumi/design/interactions.md` |
| 5 | OOUI ワイヤーフレーム (ASCII 骨格 + object/action 表、画像なし) | `.takumi/design/wireframes/{screen}.md` |
| 6 | /takumi 連携 (reference-first、task は `design_profile_ref` 名前参照のみ) | `.takumi/profiles/design/{name}.yaml` |

各 Phase の詳細手順・生成 snippet 例は **`phases.md`** を読む。

---

## L7 Layout Invariant (3 層、概要)

画面生成後の検証は 3 層に分ける。**hard gate は最小限**に留め、soft / lint に降ろす。

| 層 | 扱い | 項目数 | 例 |
|---|---|---|---|
| **hard gate** | 失敗したら即 block | 5-7 項目 | no_container_overflow / hit_area_32px / focus_visible / color_contrast_aa |
| **soft gate** | warning のみ、閾値超過で fail | 4-6 項目 | spacing_on_token_scale / icon_from_lucide_only |
| **lint (eslint/stylelint)** | 静的解析で即失敗 | 4-6 項目 | color_token_only / typography_token_only / no_arbitrary_tailwind |

PBT に残すのは「状態変化時のレイアウト保持」のみ(長文/空状態/エラー状態/状態遷移後)。
色やタイポは token 固定済みなので PBT で守らない。

詳細(hard 項目の検出ロジック・soft→hard 昇格ルール・PBT テンプレ)は **`l7-invariant.md`** を読む。

---

## 採用前に決める閾値

profile 設計で毎回議論になる数値は、導入時に一度だけ決める。

### auto_ref_site 更新頻度

| 値 | 運用 |
|---|---|
| **30-45 日** (推奨) | ref_archetype の大きな改版を拾える、かつ毎週振り回されない |
| 7 日 | 過敏。追従コストが profile 安定性を壊す |
| 90 日 | 鈍すぎる。ref が大改版した後に古い token で生成し続ける |

### design_drift 粒度

| 粒度 | 内容 | 採否 |
|---|---|---|
| screen 単位 | 画面ごとに drift 判定 | 粗い |
| **screen × primary_action** (推奨) | 画面と主要 action の組 | ちょうど良い |
| component 単位 | 全 component を個別追跡 | 細かすぎ、ノイズ多 |

---

## verify との接続

`verify` skill と本 skill は **profile_ref を共有**する。

- `/takumi` の task frontmatter に `verify_profile_ref` と `design_profile_ref` が両方載る
- `/exec` の wave gate は両 profile の gate を**同時に**評価する
- L7 hard gate は `design_profile_ref` 経由で wave gate に流れ込む (`gate_type: l7_hard`)
- telemetry の `layout_checked` event が soft/hard violation を両方記録

### wave gate 構成 (例)

```
wave 1 gate:
  - build (tsc)                        <- 共通
  - test pass                          <- 共通
  - mutation_floor (verify profile)    <- verify_profile_ref
  - l7_hard (design profile)           <- design_profile_ref
  - l7_soft report only (non-blocking) <- design_profile_ref
  - oracle_review                      <- 共通 (最終)
```

両 profile が揃って初めて wave が閉じる。どちらかが null の場合、その gate はスキップされるが
**付帯率は下がる** (telemetry で可視化)。

---

## 制約 (守るべきこと)

### hard rule に入れないもの

- **button icon 必須**: 付けるのを推奨するが hard にしない (text-only button は有効なパターン)
- **単一 font-family 強制**: code monospace 等、用途別 family は許可
- **radius 1 種類強制**: sm / md / lg の 3 段階は残す

### 類似サイト参照の扱い

- `ref_archetypes` は**候補提示まで**。archetype table を引いて token に落とす時点で固定
- 3 個以上の ref_archetypes は禁止 (平均化して個性消失)
- ref のスクリーンショット模倣は禁止 (著作権 + brand tone 無視)

### 完全自動決定は禁止

- 必須入力 4 項目が欠けたら**先に進まない**
- design_profile の作成・変更は人間の承認を経る (telemetry に `profile_created` / `profile_modified` として残す)
- AI が「雰囲気で」token を変えるのを禁止 (token 変更は profile 改版として履歴管理)

### 成果物の配置

- **project 側**の `.takumi/design/` 配下に全て書く
- 本 skill 配下 (`~/.claude/skills/takumi/design/`) に project 固有の成果物を置かない
- `/takumi` と `/verify` が参照できる相対パス (`.takumi/design/...`) で統一

### ツール禁止事項

- pencil MCP 等、追加ツールの呼び出し禁止 (Read / Grep / Write / Edit / Bash のみ)
- 画像生成 MCP も禁止 (ASCII + token 表で十分)

---

## 起動パターン

| 入力 | 動作 |
|---|---|
| `/design` | 必須入力 4 項目をインタビュー -> Phase 1-6 を順に実行 |
| `/design sitemap` | Phase 1 のみ (既存 IA の更新) |
| `/design style` | Phase 2 のみ (style-guide 更新 / profile 切替) |
| `/design wireframe {screen}` | Phase 5 のみ、指定画面だけ生成 |
| `/design profile {name}` | 既存 profile の inspect / 改版 |
| 自動: `/takumi` が project_mode=ui を検出 | 本 skill を mandatory で起動 |

---

## 関連リソース

| file | 用途 |
|---|---|
| `phases.md` (同ディレクトリ) | Phase 1-6 の詳細手順と生成 snippet |
| `l7-invariant.md` (同ディレクトリ) | L7 hard/soft/lint の検出・昇格・PBT テンプレ |
| `profiles-defaults/*.yaml` (同ディレクトリ) | 4 design profile defaults (dashboard-dense / list-standard / form-heavy / landing) |
| `~/.claude/skills/takumi/SKILL.md` | /takumi 連携 (Step 0d で呼出) |
| `~/.claude/skills/takumi/verify/README.md` | verify との profile_ref 共有 |
| `~/.claude/skills/takumi/telemetry-spec.md` | `layout_checked` event の emit |

---

## 導入チェックリスト

- [ ] `.takumi/design/` を `.gitignore` から除外 (成果物なので追跡する)
- [ ] `.takumi/profiles/design/` を作成、最低 1 profile を配置
- [ ] `/takumi` interview に `project_mode` の質問を追加
- [ ] `/takumi` task frontmatter に `design_profile_ref` を追加
- [ ] `/exec` wave gate に L7 hard / soft の評価ステップを追加
- [ ] telemetry-spec.md の `layout_checked` event を emit するよう `/design` を実装
- [ ] shadcn/ui + Tailwind + framer-motion + lucide-react を install
- [ ] eslint / stylelint の lint rule を style-guide tokens と同期
