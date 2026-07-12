# Craft Tokens — 決定論的な craft 導出規則 (design mode)

`craft-layer.md` / `phases-1-3.md` Phase 2 から参照。craft token は **選択肢でなく導出規則**として固定する (seed が広がらないように)。同じ入力から同じ token が出る。具体値は example、**導出規則が SoT**。

> [!IMPORTANT]
> 「shadow を 1 つ選ぶ」「色を hex で置く」のような自由記述を許さない。色は ramp 導出式、elevation は固定 5 step、radius は数式。AI は値を**発明せず導出する**。

---

## 1. Color — OKLCH ramp + Radix 12-step semantic

### 1.1 なぜ OKLCH か

HSL の `lightness` は非知覚的 (`hsl(60 100% 50%)` 黄は `hsl(240 100% 50%)` 青より遥かに明るく見える)。OKLCH の L は知覚的に均一なので、**hue を固定して L を刻むだけで滑らかな ramp** が出る。Tailwind v4 既定 palette も OKLCH。著述は `oklch(L C H)` (例 `oklch(0.62 0.19 256)`)。

### 1.2 11 step ramp 導出 (50–950)

base 色を OKLCH に変換 → hue 固定で L を 11 段に配分 (50≈最明 → 950≈最暗、500=base)。**両端は chroma を落とす** (極端な明/暗で C を残すと neon/濁りになる)。

| step | 用途目安 | L 目安 | C 補正 |
|---|---|---|---|
| 50/100 | 最薄 tint (bg subtle) | 0.97 / 0.94 | C を 30-50% に削る |
| 200-400 | 薄 (border/hover/muted) | 0.90→0.74 | 漸増 |
| 500 | base | base L | base C |
| 600-800 | 濃 (solid/hover/text) | 0.58→0.40 | 維持 |
| 900/950 | 最暗 (text strong/shade) | 0.30 / 0.22 | C を 40-60% に削る |

ad-hoc な hex を手で明暗するのは禁止 (段差が不均一 = 素人)。

> [!WARNING]
> hue 固定で L を刻むのは**出発点**。hue により実 contrast / gamut 安定性が違うため、各 step は **sRGB/P3 gamut clipping を確認し APCA/WCAG 両方で contrast 検証**する。OKLCH は現代ブラウザで広く可だが、古い Safari / WebView / 埋込ブラウザ向けに **hex fallback を併記**する。

### 1.3 Radix 12-step semantic (役割で命名)

ramp を「明度」でなく「役割」で割り当てると hover/active/border/text が自動で一貫する。dark mode は同 step 番号を dark 調整した ramp に再マップするだけ:

| step | 役割 |
|---|---|
| 1 | app background |
| 2 | subtle background |
| 3 / 4 / 5 | component bg (normal / hover / active) |
| 6 | subtle border (非 interactive) |
| 7 | border (interactive) |
| 8 | strong border + focus ring |
| 9 / 10 | solid fill (最高 chroma) / solid hover |
| 11 / 12 | low-contrast text / high-contrast text |

> **token SoT**: ramp (50–950) を source of truth とし、semantic 12-step は役割 **alias** として derive する (両者を並列 token にすると意味が二重化して運用破綻)。

### 1.4 contrast は WCAG AA を下限に + APCA を上積み

**WCAG AA (L7 hard の `color_contrast_aa`) を compliance 下限として残す** (法務・公共案件は WCAG2 比を正とする)。その上に、light text / dark UI を誤評価しない知覚的目標として **APCA Lc≥60 (本文サイズの low-contrast text) / Lc≥90 (主要 text)** を上積みする (Radix の 11/12 は step-2 上でこれを保証)。APCA は WCAG2 と**非互換**なので置換でなく加算。AA 4.5:1 ちょうどで止めない。

### 1.5 neutral は微 tint / dark は再マップ / accent 抑制

- **pure gray 禁止**: neutral に微量 hue を混ぜる (cool UI = blue 寄り `H≈250-265, C≈0.01-0.03`、warm = warm gray)。`#808080` は死んで見える。色背景上の muted text は gray でなく**背景 hue 方向**に寄せる (sat/L を落とす)。
- **dark mode は反転でなく再マップ**: base dark は near-black に微 tint (`#0a0a0c` 等、`#000` 禁止)。accent は dark で chroma/L を僅かに落とす (彩度高色は dark で振動)。本文 text は pure `#fff` でなく `oklch(0.95 …)`。
- **accent restraint**: neutral が surface の 90%+。accent は primary action / link / active のみ。均等配色は階層を壊しテンプレに見える。

---

## 2. Elevation — 多層 shadow (光源一貫) / dark=lightness

### 2.1 多層 shadow (1 個は安っぽい)

実影は ambient (広く柔) + key (近く鋭) の合成。1 shadow では falloff を表現できず flat に見える。各 elevation は層を重ねる:

```css
/* 例: resting card (低 elevation) */
box-shadow:
  0 1px 1px hsl(var(--shadow-hue) / .04),
  0 2px 2px hsl(var(--shadow-hue) / .04),
  0 4px 8px hsl(var(--shadow-hue) / .06);
```

### 2.2 5 step elevation + 規則

| step | 用途 | offset/blur/opacity 方針 |
|---|---|---|
| 0 | flat (page) | shadow なし、hairline border のみ |
| 1 | card resting | 小 offset、低 blur、3 層 |
| 2 | dropdown / popover | 中 offset、中 blur |
| 3 | dialog / sheet | 大 offset、高 blur、薄 opacity |
| 4 | modal / toast | 最大 offset/blur、最薄 opacity (拡散) |

規則: (1) **光源一貫** — 全 token で x/y 比を揃える (例 y≈2×x、ただし機械式比率に固執しない目安。「真上」か「上左」で固定し混ぜない)。(2) elevation↑ で offset↑ + blur↑ + opacity↓ を**同時に**。(3) shadow は黒でなく**背景 hue で tint** (黒 on 色は脱色して濁る)。(4) **border + shadow 併用**で縁を締める (hairline border は `craft-layer.md`/§3)。

### 2.3 dark mode は lightness で elevation

dark では shadow が背景に溶けて効かない。**面を明るくして「近さ」を出す** (base `#121212` に半透明白を重ね、step↑ で opacity↑: 例 +1≈5% / +2≈8% / +3≈11% white)。これらは**例示値で固定でない** — base 色 / surface 階層 / OLED 黒で要調整。flat+hairline に寄せても hover/focus/selected/disabled の **affordance は保つ** (状態まで flat にしない)。hairline は CSS px で、DPR により見え方が変わる。

> [!NOTE]
> **JP 業務 UI では elevation は最小限で良い**。flat+hairline (`surface_depth` 原理、`craft-layer.md` §3) が費用対効果高い。凝った shadow が要るのは consumer/LP 系。

---

## 3. Radius — nested 数式 + scale

- **nested radius**: 親 = 子 + gap (`R_outer = R_inner + padding`)。例: card padding 8px・内 element radius 8px → card radius 16px。CSS `border-radius: calc(var(--inner-r) + var(--pad))`。等しい radius を親子に置くと角の隙間が不均一に見える。padding が大きいと外 radius が過大になるため **scale 上限で clamp** (業務 UI は 4/6/8px 程度に収める)。**数式は出発点、最後は目視確認**。
- **scale 固定**: `4 / 6 / 8 / 12 / 16 / 24 / full`。任意 radius 散在は禁止。radius は aesthetic 署名 (technical=0-4px sharp、friendly=12-24px soft)、`type_personality` / brand_tone と整合させる。

---

## 4. Spacing — 制約スケール + grouping

- **scale (非線形)**: `4 · 8 · 12 · 16 · 24 · 32 · 48 · 64 · 96`。既存 4px grid token と整合。
- **grouping を spacing で符号化 (Gestalt proximity)**: 群内 gap < 群間 gap (label↔field は 4-8px、group 間は 24-48px)。罫線で囲う前に余白で grouping する。
- **最初に余白を多めに取り、必要な所だけ詰める** (Refactoring UI)。section padding は template の 24px でなく generous に。
- **optical spacing**: icon↔text は token より詰める (glyph の side bearing)、視覚的に軽い要素は広げる。等数値が等間隔に見えない時は目で調整。
- **vertical rhythm**: 行高 × font-size を一定 row 高に。body は単一 unitless line-height、size は clean な倍数 (JP は `jp-typography.md`)。

---

## 5. Type scale — modular + 階層は weight/color

- **modular scale** (例 `12 · 14 · 16 · 19 · 24 · 32 · 40`)、≤2 family。
- **階層は size より weight + color を先に使う**: body は weight≥400 (UI text で 400 未満禁止)、見出し 600-700。de-emphasize は**細い weight でなく薄い color**で。1 surface に weight ≤2 + text color 2-3。
- **focal point 1 つ**: 最高コントラスト処理 (solid accent fill / 最大 size / 最重 weight) は 1 画面 1 要素。
- 既定 font は distinctive を選ぶ (Inter/Roboto を無思考既定にしない、`craft-layer.md` §5)。

---

## 6. Motion / easing — 調整 curve + 全 state

`phases-4-6.md` Phase 4 が本節 token を引く。easing は最も安い「高級感」:

| token | 値 | 用途 |
|---|---|---|
| ease-out (refined) | `cubic-bezier(0.16, 1, 0.3, 1)` | enter / hover (既定) |
| spring (occasional) | `cubic-bezier(0.34, 1.56, 0.64, 1)` | 稀な playful scale |
| (禁止) | `linear` / browser 既定 `ease` | 表現用途では使わない |

- **duration は頻度/移動量で**: 高頻度 micro (hover/focus) <150ms、標準 150-250ms、稀で大 (modal/page) ~300-400ms。hover-in は hover-out より僅かに速く。
- **全 interactive state を別個に**: hover (bg step 4 / 微 lift) / active (step 5 / scale 0.98) / focus-visible (2px ring at step 8, offset 2px、`outline:none` 単独禁止) / disabled (opacity↓ + `cursor:not-allowed`)。
- **1 orchestrated entrance** (staggered `animation-delay` 60-80ms) > 全要素の常時微動。

---

## 7. Phase 2 への書き戻し

導出した token は `.takumi/design/style-guide.md` に記録し、末尾に tailwind config / CSS var snippet を添える (`phases-1-3.md` Phase 2 の書き戻し節に準拠)。OKLCH は CSS `oklch()` で、fallback が要る場合のみ hex 併記。

---

## 関連リソース

| file | 用途 |
|---|---|
| `craft-layer.md` (同) | 本層の doctrine / principle dictionary / blocklist / preflight rubric |
| `jp-typography.md` (同) | 日本語 typography (本書 §5 type scale の JP 拡張) |
| `phases-1-3.md` (同) | Phase 2 style guide が本書の導出規則を引く |
| `phases-4-6.md` (同) | Phase 4 が §6 motion token を引く |
| `l7-invariant.md` (同) | contrast 下限 (AA) / lint (color_token_only 等) |
