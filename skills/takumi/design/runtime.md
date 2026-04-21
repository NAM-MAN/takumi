# design mode — AI runtime spec

takumi の design mode で呼び出された AI エージェントが読む仕様。LP / 用語解説は `README.md` 側。

---

> ここから下は takumi の design mode で呼び出された AI エージェントが読む仕様セクションです。人間向けの LP パートとは役割が違うため、運用上の不変条件 (Phase 詳細・必須入力 4 項目・L7 hard gate・verify 連携・制約・導入チェックリスト) をすべて保持しています。削除・要約しないでください。runtime 手順内の `/design ...` 表記は擬似コマンド名 (冒頭 NOTE 参照)。

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
- 画像の snapshot は verify 運用の smoke E2E が撮る (本 skill は ASCII + token 表のみ)

---

## project_mode 分岐

`/takumi` interview で決まる `project_mode` により、本 skill の扱いが変わる:

| project_mode | 扱い | 必須フェーズ |
|---|---|---|
| `ui` | **mandatory** (全フェーズ通過必須) | Phase 1-6 全て |
| `mixed` | optional (UI を含む task のみ) | Phase 1,2,5 (3,4,6 はスキップ可) |
| `backend` | **N/A** (起動しない) | なし |

`backend` project で design mode への遷移条件が成立しても、「UI を持たない project では不要」とだけ返して terminate する。`mixed` で UI を含まない task は `design_profile_ref: null` で telemetry に流れる (付帯率の分母から除外)。

---

## 必須入力 4 項目

インタビュー冒頭で**必ず**この 4 項目を確定させる。1 つでも欠けたら先へ進めない。

<details>
<summary><strong>1. <code>product_type</code> — 製品カテゴリの定義と例</strong></summary>

製品のカテゴリ。生成される IA と wireframe 骨格の前提になる。

| 例 | 意味 |
|---|---|
| `saas_dashboard` | 業務 SaaS、密度高めの data grid 中心 |
| `consumer_mobile` | 一般向けモバイル、gesture 中心、情報密度低 |
| `marketing_lp` | landing page、hero + benefit + CTA の単一流れ |
| `internal_tool` | 社内管理画面、form + table の組合せ、装飾最小 |
| `creative_canvas` | editor / whiteboard 系、realtime + canvas |

</details>

<details>
<summary><strong>2. <code>target_user</code> — 想定ユーザーの 1 文記述</strong></summary>

想定ユーザーの 1 文記述。**役割 + 状況 + 頻度**を含める。

例:
- 「B2B SaaS の経理担当、月次で数回、他業務と並行しながら」
- 「消費者、スマホで電車移動中、1 日 1-2 回」
- 「エンジニア、PC で業務時間中、1 日中張り付き」

</details>

<details>
<summary><strong>3. <code>brand_tone</code> — 声のトーンを 2-3 語で</strong></summary>

声のトーンを 2-3 語で。形容詞 + 形容詞 + (名詞) の形を推奨。

| 例 | 解釈 |
|---|---|
| `serious, trustworthy, financial` | 金融系、装飾控えめ、色数少なめ |
| `playful, energetic, youth` | 彩度高め、motion 豊富、丸み |
| `minimal, neutral, pro` | 背景薄、文字主体、motion 控えめ |
| `warm, human, community` | 肌色系、手書き風 accent、圧迫感なし |

</details>

<details>
<summary><strong>4. <code>ref_archetypes</code> — 類似サイト 1-2 個</strong></summary>

類似サイト・プロダクトを **1-2 個**。名前で良い。**3 個以上は禁止**(平均化して個性が死ぬ)。

| 例 |
|---|
| `Linear, Vercel` |
| `Notion` |
| `Stripe Dashboard, Datadog` |
| `Airbnb` |

複数指定時は「前者を骨格、後者を accent」として inference する。順序に意味を持たせる。

</details>

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

各 Phase の詳細手順・生成 snippet 例は **`phases-1-3.md`** (Phase 1-3) / **`phases-4-6.md`** (Phase 4-6) を読む。目次は `phases.md`。

---

## L7 Layout Invariant (3 層、概要)

画面生成後の検証は 3 層に分ける。**hard gate は最小限**に留め、soft / lint に降ろす。

| 層 | 扱い | 項目数 | 例 |
|---|---|---|---|
| **hard gate** | 失敗したら即 block | 5-7 項目 | no_container_overflow / hit_area_32px / focus_visible / color_contrast_aa |
| **soft gate** | warning のみ、閾値超過で fail | 4-6 項目 | spacing_on_token_scale / icon_from_lucide_only |
| **lint (eslint/stylelint)** | 静的解析で即失敗 | 4-6 項目 | color_token_only / typography_token_only / no_arbitrary_tailwind |

> [!IMPORTANT]
> L7 hard gate は wave の blocker。ここを通らない限り次の Phase / Wave には進めない。

PBT に残すのは「状態変化時のレイアウト保持」のみ(長文/空状態/エラー状態/状態遷移後)。
色やタイポは token 固定済みなので PBT で守らない。

詳細(hard 項目の検出ロジック・soft→hard 昇格ルール・PBT テンプレ)は **`l7-invariant.md`** を読む。

---

## 採用前に決める閾値

<details>
<summary><strong>profile 設計で毎回議論になる数値は、導入時に一度だけ決める</strong></summary>

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

</details>

---

## verify との接続

`verify` skill と本 skill は **profile_ref を共有**する。

- takumi の task frontmatter に `verify_profile_ref` と `design_profile_ref` が両方載る
- executor (takumi 内部ロール) の wave gate は両 profile の gate を**同時に**評価する
- L7 hard gate は `design_profile_ref` 経由で wave gate に流れ込む (`gate_type: l7_hard`)
- telemetry の `layout_checked` event が soft/hard violation を両方記録

<details>
<summary><strong>wave gate 構成 (例)</strong></summary>

```
wave 1 gate:
  - build (tsc)                        <- 共通
  - test pass                          <- 共通
  - mutation_floor (verify profile)    <- verify_profile_ref
  - l7_hard (design profile)           <- design_profile_ref
  - l7_soft report only (non-blocking) <- design_profile_ref
  - oracle_review                      <- 共通 (最終)
```

</details>

> [!IMPORTANT]
> 両 profile が揃って初めて wave が閉じる。どちらかが null の場合、その gate はスキップされるが**付帯率は下がる** (telemetry で可視化)。

---

## 制約 (守るべきこと)

> [!WARNING]
> このセクションの 4 カテゴリは運用の禁止ルール。AI も人間も逸脱しない。逸脱は profile 改版 (履歴つき) としてのみ許される。

<details>
<summary><strong>hard rule に入れないもの</strong></summary>

- **button icon 必須**: 付けるのを推奨するが hard にしない (text-only button は有効なパターン)
- **単一 font-family 強制**: code monospace 等、用途別 family は許可
- **radius 1 種類強制**: sm / md / lg の 3 段階は残す

</details>

<details>
<summary><strong>類似サイト参照の扱い</strong></summary>

- `ref_archetypes` は**候補提示まで**。archetype table を引いて token に落とす時点で固定
- 3 個以上の ref_archetypes は禁止 (平均化して個性消失)
- ref のスクリーンショット模倣は禁止 (著作権 + brand tone 無視)

</details>

<details>
<summary><strong>完全自動決定は禁止</strong></summary>

> [!WARNING]
> 以下は AI が勝手に決めてはいけない領域。必ず人間の承認 / 履歴管理に載せる。

- 必須入力 4 項目が欠けたら**先に進まない**
- design_profile の作成・変更は人間の承認を経る (telemetry に `profile_created` / `profile_modified` として残す)
- AI が「雰囲気で」token を変えるのを禁止 (token 変更は profile 改版として履歴管理)

</details>

<details>
<summary><strong>成果物の配置 / ツール禁止事項</strong></summary>

### 成果物の配置

- **project 側**の `.takumi/design/` 配下に全て書く
- 本 skill 配下 (`~/.claude/skills/takumi/design/`) に project 固有の成果物を置かない
- takumi の計画 task と verify 運用の両方から参照できる相対パス (`.takumi/design/...`) で統一

### ツール禁止事項

- pencil MCP 等、追加ツールの呼び出し禁止 (Read / Grep / Write / Edit / Bash のみ)
- 画像生成 MCP も禁止 (ASCII + token 表で十分)

</details>

---

## 起動パターン

<details>
<summary><strong>起動パターン一覧</strong></summary>

takumi への発話から design mode に入ると、内部的に以下のフェーズ限定サブモードへ分岐する (ユーザーは明示指定せず、自然文から意図抽出):

| 内部サブモード | 動作 |
|---|---|
| design mode 起動 (通常) | 必須入力 4 項目をインタビュー -> Phase 1-6 を順に実行 |
| sitemap サブモード | Phase 1 のみ (既存 IA の更新) |
| style サブモード | Phase 2 のみ (style-guide 更新 / profile 切替) |
| wireframe {screen} サブモード | Phase 5 のみ、指定画面だけ生成 |
| profile {name} サブモード | 既存 profile の inspect / 改版 |
| 自動: takumi が project_mode=ui を検出 | design mode を mandatory で起動 |

</details>

---

## 関連リソース

<details>
<summary><strong>関連ファイル一覧</strong></summary>

| file | 用途 |
|---|---|
| `phases.md` (同ディレクトリ) | Phase 1-6 目次 (2 本への pointer) |
| `phases-1-3.md` (同ディレクトリ) | Phase 1-3 の詳細手順と生成 snippet |
| `phases-4-6.md` (同ディレクトリ) | Phase 4-6 の詳細手順と生成 snippet |
| `l7-invariant.md` (同ディレクトリ) | L7 hard/soft/lint の検出・昇格・PBT テンプレ |
| `profiles-defaults/*.yaml` (同ディレクトリ) | 4 design profile defaults (dashboard-dense / list-standard / form-heavy / landing) |
| `~/.claude/skills/takumi/SKILL.md` | /takumi 連携 (Step 0d で呼出) |
| `~/.claude/skills/takumi/verify/README.md` | verify との profile_ref 共有 |
| `~/.claude/skills/takumi/telemetry-spec.md` | `layout_checked` event の emit |

</details>

---

## 導入チェックリスト

<details>
<summary><strong>導入時に潰しておく 8 項目</strong></summary>

- [ ] `.takumi/design/` を `.gitignore` から除外 (成果物なので追跡する)
- [ ] `.takumi/profiles/design/` を作成、最低 1 profile を配置
- [ ] takumi の interview に `project_mode` の質問を追加
- [ ] takumi の task frontmatter に `design_profile_ref` を追加
- [ ] executor (takumi 内部ロール) の wave gate に L7 hard / soft の評価ステップを追加
- [ ] telemetry-spec.md の `layout_checked` event を design mode が emit するよう実装
- [ ] shadcn/ui + Tailwind + framer-motion + lucide-react を install
- [ ] eslint / stylelint の lint rule を style-guide tokens と同期

</details>
