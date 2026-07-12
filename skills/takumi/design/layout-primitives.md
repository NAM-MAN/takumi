# Layout Primitives — UI 崩れを構成的に予防する (design mode 補助)

`design/README.md` / `design/runtime.md` から参照される CSS-truth 仕様。**レイアウト崩れは検出でなく構成的に予防する** (= 崩れない実装パターンの有限集合から合成し、AI に自由 CSS を書かせない)。`l7-invariant.md` の構造化レンダー監査は**保険網**であり、本書の primitive が一次予防。

> [!IMPORTANT]
> 「AI に自由 CSS を書かせ後段で直す」は負け筋。生成空間を狭め崩れを起こしにくくし、検出は境界条件・ブラウザ差・未知コンテンツの保険に降ろす。本書はその一次予防層 (L-construct)。

---

## 1. 大原則: 画面骨格は primitive の nest 合成のみ

AI は構図・positioning を**発明しない**。画面骨格は下記 10 primitive を入れ子にして組む。`position: absolute` と layout 用 margin は escape hatch を除き **lint 禁止**。

### compositionality の成立条件 (重要)

「各 primitive 単体が非 overflow」だけでは合成は保証されない。各 primitive に**防御 CSS を焼き込み**、かつ**子に content contract を課す**ことで初めて入れ子の閉包性 (非 overflow) が成立する。

各 primitive 必須の防御 CSS:

| 防御 | 理由 (これが無いと崩れる) |
|---|---|
| flex/grid 子に `min-width: 0` (`min-inline-size: 0`) | `min-width: auto` 既定で長文・表・コードが親を押し広げる |
| text に `overflow-wrap: anywhere` | URL・長い英数字・CJK 無し文字列が overflow |
| media (img/video/canvas) に `max-width: 100%` | intrinsic サイズで溢れる |
| grid track は `minmax(0, 1fr)` (生 `1fr` 禁止) | `1fr` は内容最小幅で破裂する |
| scroll ownership を明示 (どの要素が `overflow` を持つか単一に) | nested `overflow: auto` 競合・`sticky` 死を防ぐ |

子への content contract: 「子は `min-width: 0` を許容する」「media は制約付きで渡す」「intrinsic 幅を持つ要素 (table/pre/input/select) は ScrollArea でラップする」。

---

## 2. 10 primitive (Every Layout 系、防御 CSS 焼き込み済)

| primitive | 役割 | 中核 CSS (防御込み) |
|---|---|---|
| **Stack** | 垂直流 (要素を縦に等間隔) | `display:flex; flex-direction:column; gap:<token>`、子に `min-width:0` |
| **Cluster** | 折返し横並び (tag/chip/action 群) | `display:flex; flex-wrap:wrap; gap:<token>`、`min-width:0` |
| **Center** | 最大幅 + 中央寄せ | `margin-inline:auto; max-width:<measure>; padding-inline:<token>` (flex 分割しない) |
| **Sidebar** | 主従 2 カラム (header/sidebar/content) | `display:flex; flex-wrap:wrap`、sidebar 固定幅 + main `flex:1; min-width:0`、閾値で縦積み |
| **Switcher** | 閾値で縦横切替 | `flex-wrap:wrap` + 子 `flex-basis:calc((<threshold> - 100%)*999)` |
| **Grid** | minmax カード格子 | `display:grid; grid-template-columns:repeat(auto-fit,minmax(min(<col>,100%),1fr))` |
| **Frame** | aspect-ratio 拘束 (画像/動画枠) | `aspect-ratio:<r>; overflow:hidden`、内部 `object-fit` |
| **Reel** | 管理された横スクロール | `display:flex; overflow-x:auto; overscroll-behavior` (非 overflow でなく**管理 overflow**) |
| **Cover** | viewport/余白配分 (hero/空状態) | `display:flex; flex-direction:column; min-block-size:<vh>`、主要素 `margin-block:auto` |
| **ScrollArea** | 明示スクロール境界 | 単一 `overflow:auto; min-height:0`、intrinsic 子 (table/pre) のラッパ |

primitive 名を 10 超に増やすより、**各 primitive に防御 CSS を焼く方を優先**する。

---

## 3. intent → primitive routing (最も単純で正しい 1 つに収束)

「中央寄せに flex 分割」のような過剰実装を避ける。intent から primitive を一意に matching:

| intent | primitive | 過剰/誤実装 (やらない) |
|---|---|---|
| 要素を縦に並べる | Stack | 各要素に `margin-bottom` |
| 中央寄せ (最大幅) | Center | flex + `justify/align center` の二重ラップ |
| header/sidebar/content 分割 | Sidebar | `position:absolute` + 手動 offset |
| tag/action を折返し横 | Cluster | `display:inline-block` + margin |
| カード一覧 | Grid | 固定 col 数 + media query 手書き |
| 画像枠 | Frame | 固定 px width/height |
| 横スクロール一覧 | Reel | はみ出し放置 |
| 表/コード/長文ブロック | ScrollArea でラップ | 親に直置き (intrinsic で破裂) |

---

## 4. StylePassPolicy — layout-then-style 2-pass (styling が layout を壊せない)

人間の Figma→実装 (骨格 → 中身 styling) を機械的に強制する。**Tailwind class を 2 群に分類**し、styling pass は layout を触れない:

| group | class 例 | 所有者 |
|---|---|---|
| **layout utilities** | `flex grid w-* h-* min-h-* max-w-* overflow-* position inset-* gap-* p-* m-* basis-* shrink grow order col-span-* row-span-*` | **primitive 専有** (Phase A) |
| **skin utilities** | `text-* (色) bg-* font-* border-{color} rounded-* shadow-* opacity-* transition-*` | **Phase B 許可** |

- **Phase A (骨格)**: primitive を nest して組む。layout utilities は primitive 内部のみ。
- **Phase B (styling)**: skin allowlist のみ。`absolute` / `w-screen` / `overflow-hidden` 等の layout utility 混入を **lint で block**。
- 効果: primitive の防御 CSS があっても後段が `absolute w-screen` を入れれば崩れる → それを表現不可能にする。

---

## 5. lint 禁止 (構成的予防の強制)

| rule | 禁止 |
|---|---|
| `no_raw_positioning` | `position:absolute/fixed` (escape hatch 宣言外) |
| `no_layout_margin` | レイアウト目的の margin (gap/Stack に置換) |
| `no_arbitrary_layout` | `w-[13px]` 等 layout の arbitrary 値 |
| `no_bare_1fr` | grid `1fr` 単独 (`minmax(0,1fr)` 必須) |
| `require_min_w_0` | flex 子の `min-width:0` 欠落 |
| `style_pass_layout_leak` | Phase B (skin) に layout utility 混入 |

機械的に AST/class で検出可能。build 時に即失敗。

---

## 6. surface 別 strictness + escape hatch

崩れない保証と表現自由のトレードオフを surface archetype で切替する。**surface 単位の 6 軸タグ駆動** (`../contract/surface-archetypes.md` の spine profile、`失敗影響`/`変更リスク` 軸) で strictness を決める (単一 surface 製品は従来の `project_mode` 分岐と等価 = 後方互換):

| surface | primitive 強制 | escape hatch |
|---|---|---|
| dashboard / form / admin | **厳格 (primitive のみ)** | **禁止** |
| LP hero / 演出 / 地図 / エディタ / popover | primitive + escape 許可 | **局所化 + 所有者明示 + 監査必須** |

escape hatch (意図的重なり/演出) を使う領域は、(1) 局所化 (1 component に閉じる)、(2) `escape_owner` を宣言、(3) `l7-invariant.md` の構造化レンダー監査を必須適用。

残る崩れ (未知長文/表/iframe/可変画像/i18n/a11y 拡大/ブラウザ差/sticky/modal/canvas) は escape 領域として明示管理し、保険網 (L-detect) に委ねる。

---

## 7. 微小部品も同思想 (素 primitive を渡さない)

素の `<input>` + 自前 absolute icon を AI に書かせない。内部寸法・padding・slot 幅・baseline・focus ring・状態 (error/disabled/loading/RTL/autofill/zoom/mobile) を variant 化した**合成 component** (`InputGroup / InputSlot / FieldControl` 等) のみ公開する。アイコンはみ出しは「書けるから起きる」→「書けなくする」。

---

## 関連リソース

| file | 用途 |
|---|---|
| `README.md` (同ディレクトリ) | design mode 本体 (人間向け LP) |
| `l7-invariant.md` (同ディレクトリ) | 構造化レンダー監査 (本書 primitive で防げない残余の**保険網**、L-detect) |
| `phases-1-3.md` (同ディレクトリ) | Phase 1 IA (OOUI object→screen)、本書 primitive 合成への入力 |
| `phases-4-6.md` (同ディレクトリ) | Phase 5 ワイヤーフレーム骨格、各領域を本書 10 primitive にマップする |
| `runtime.md` (同ディレクトリ) | design mode AI runtime spec (本書を L-construct 一次層として参照) |
