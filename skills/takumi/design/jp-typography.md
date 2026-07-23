# 日本語 typography + locale_profile (design mode craft 層)

`craft-layer.md` / `craft-tokens.md` §5 / `phases-1-3.md` Phase 2 から参照。プロの日本人デザイナーが Figma で組んだような **和文組版**を決定論ルールで再現する。craft 層の中核柱。

> [!IMPORTANT]
> **JP-first は hardcode でなく `locale_profile` 化**。日本語品質を first-class にしつつ、en-US / mixed も定義して汎用性を残す。`palt` 等の新 CSS は **progressive enhancement** (Safari/Firefox gap) — 無くても成立する設計にし、load-bearing にしない。

---

## 1. locale_profile (first-class token)

| profile | 既定対象 | 要点 |
|---|---|---|
| **ja-JP** (JP product 既定) | 日本語 UI | 和欧混植 / 禁則 / やや高 line-height / Latin-first stack / 38em measure |
| en-US | 英語 UI | Latin scale / 短 label / 低め line-height / 65ch measure |
| mixed | JP body + Latin product UI | JP 本文 + Latin UI chrome、両者の metric 整合 (§5) |

`project.yaml` / design profile に `locale_profile` を記録。日本語 product では `ja-JP` を既定にする。

---

## 2. 前提モデル (なぜ Latin 既定が崩れるか)

和文 glyph は **全角 (full-em square) 設計・画数が密・同 font-size でも Latin より視覚的に大きく重い**。プロは以下で補正する。これを怠り Latin 既定 (`line-height:1.2` / `letter-spacing` px / `palt` 無し / `text-wrap:balance`) を流用すると、窮屈・ランダム改行・機械組版に見える = **AI っぽさの最大要因**。

---

## 3. 行間 (line-height) — unitless 必須

| 用途 | line-height |
|---|---|
| 本文 / 読み物 | **1.5–1.75** (1.5 = a11y 下限、1.7 = 和文の古典値) |
| 見出し (大) | **1.25–1.4** (大きい glyph は詰める。広いと見出しが分解して見える) |
| 単行 UI label / button | **1.2** (JP は上下 metrics が大きく 1.0 は clipping・縦ズレ・a11y 拡大で事故りやすい。背景+padding 付き単行のみ 1.0 可) |
| 高密度 admin/data | 1.2–1.3 |

> [!WARNING]
> **CSS では unitless (`1.5`) で書く。Figma の `%` (150%) でも px でもない。** unitless は子孫 font-size に比例継承する。デジタル庁 / SmartHR が明記する silent bug。

根拠: デジタル庁 design system (本文 ≥1.5)、SmartHR (TIGHT 1.25 / NORMAL 1.5 / NONE 1.0)。Han 文字は密な画数を均一 square に詰めるため、Latin の 1.2 では行が視覚的に衝突して目の戻り先を失う。

---

## 4. 文字詰め — `palt` (letter-spacing で代用しない)

和文を **raw `letter-spacing` で空ける**と均一な隙間が空いて素人っぽい。OpenType の比例メトリクスで全角 glyph 内の死にスペースを**詰める**のが正解:

- **`palt`** (proportional alternate widths): 仮名・約物を比例詰め (glyph 置換なし)。「」、。や小書き仮名後の隙間を消す。**見出し・大見出し主体**、本文は控えめ。
- **`font-kerning` / `palt` 適用範囲**: `palt` と kerning 調整は**見出し・短ラベル中心**。本文に blanket で `font-kerning: none` を当てない (Latin 混在 / 欧文 UI で品質低下)。本文 `palt` も詰まりすぎる場合があるので限定する。ただしブランド表現・短い日本語タイトルでは `palt` 適用の例外を許す。
- **letter-spacing の機微**: 本文は `0`〜`0.02em` 近傍 (和文 grid は既に均等、大きな tracking は破壊)。見出しは小 positive (`0.02–0.08em`) を **`palt` と併用**して初めて refined。`palt` がやや詰めすぎなら letter-spacing を僅か positive に。
- **font 対応**: `palt` は Hiragino / Yu Gothic / Noto Sans CJK にあり、**Meiryo / MS Pゴシック には無い** (無効)。**Safari は `font-feature-settings` 経由の `palt` を歴史的に未対応** → `font-variant-east-asian: proportional-width` を相互運用パスにし詰めは progressive enhancement 扱い。

```css
/* palt は見出し・短ラベル中心。本文は kerning normal のまま (Latin 混在の劣化回避) */
:where(h1,h2,h3,h4,h5,h6,.label):lang(ja) { font-feature-settings: "palt"; }
```

---

## 5. 禁則・改行 (kinsoku、JIS X 4051 / W3C JLREQ)

| CSS | 効果 | 注記 |
|---|---|---|
| `line-break: strict` | 最も厳格な禁則。小書き仮名・長音 ー・約物が行頭に来ない | root に |
| `overflow-wrap: anywhere` | 長い英数字 / URL が container を溢れない | root に |
| `word-break: auto-phrase` | **文節境界で改行** (見出しの途中改行を解消)。Chrome 系のネイティブ値 (内部辞書ベース) | Chrome 119+、要 `<html lang="ja">`。**非対応は BudouX** (JS/サーバで `<wbr>` 注入) で代替 — `auto-phrase(BudouX)` という CSS 指定は存在しない |
| `text-spacing-trim: trim-start` | 約物の glyph 内余白を詰める (「（…）」の隙間解消) | **Limited / experimental**、PE 扱い (品質基盤にしない) |
| `hanging-punctuation: first allow-end last` | 約物を版面外にぶら下げ縁を整える | Safari 寄り、PE |

ブラウザが扱う禁則不変条件 (闘わない): 開き括弧「『（ は行末に来ない、閉じ括弧」』）と 句読点、。は行頭に来ない。

> [!WARNING]
> **`text-wrap: balance` は raw CJK で罠**。語モデルが無く不自然な位置で折れる。Latin は balance、`:lang(ja)` は `auto-phrase` と**併用時のみ** balance を再有効化する。多行本文は `text-wrap: pretty` の方が安全 (orphan/widow のみ補正)。

```css
h1,h2,h3 { text-wrap: balance; }
:is(h1,h2,h3):lang(ja) {
  text-wrap: initial;
  @supports (word-break: auto-phrase) { word-break: auto-phrase; text-wrap: balance; }
}
```

---

## 6. font 選定・stack・性能

和文 sans = ゴシック、serif = 明朝。**sans↔ゴシック / serif↔明朝 をカテゴリ混在させない**。

| font | 用途 | 注記 |
|---|---|---|
| Noto Sans JP | web 既定 / 公式感 | OFL、デジタル庁 公式。**~9MB、要 subset** |
| BIZ UDPGothic | UD / form / 公共 | 無料、Google Fonts |
| Hiragino Sans / Kaku Gothic ProN | macOS/iOS system | 高品位、stack 上位 |
| Yu Gothic (游ゴシック) | Win/mac system / editorial | **Windows weight bug** (下記) |
| Meiryo | Win fallback | `palt`/kerning 無し、見出し詰めに使わない |

> [!IMPORTANT]
> **font stack は Latin を JP より前に置く**。JP font 名が先だと JP font の貧弱な Latin glyph が勝ち Latin font が当たらない。
> ```css
> font-family:
>   "Helvetica Neue", Arial, "Segoe UI",      /* Latin 先 */
>   "Hiragino Sans", "Hiragino Kaku Gothic ProN",
>   "Yu Gothic Medium", "Noto Sans JP", Meiryo, sans-serif;  /* JP 後 */
> ```

- **Yu Gothic Windows weight bug**: 素の `"Yu Gothic"` は Windows で Regular (細すぎ) に解決。`@font-face` + `local()` で normal→Medium / bold→Bold に再マップ (SmartHR `AdjustedYuGothic` 技法)。
- **性能 (必須)**: 和文 font は 1–9MB。**subset** か Google Fonts 動的 slice。`font-display: swap` (ただし CLS 注意、fallback metric を `size-adjust`/`ascent-override` で調整)。variable font で weight 統合。多くの JP site は **本文 system font + 見出しのみ web font**。
- **stack 分割 / 既定化注意**: UI の数字・英字向けと長文本文向けで stack を分けると、約物・全角互換文字の fallback 境界が綺麗になる。`AdjustedYuGothic` の既定化は font loading / ライセンス / FOUT / bold synthesis の副作用があるため、まず system stack + weight 検証で足りないか確認する (常用既定にしない)。

---

## 7. measure (行長)

CJK は **Latin の約半分の文字数**/行 (1 glyph ≈ 1em ≈ Latin 2 文字幅、均一 square で走査が重い)。

- **上限 ≤ 40 全角** (WCAG 1.4.8 = Latin 80 / CJK 40)、**快適 25–35**。
- CSS は **`em` で** (`ch` は `0` glyph 基準で CJK に不安定): `.measure-ja { max-width: 38em; }`。Tailwind の `max-w-prose`≈65ch は和文に広すぎ。

和文を Latin 風 65-75 文字 measure に置くと、語形の landmark 無しに目が 2 倍の距離を往復し行を見失う = 和文可読性の最大レバー。

---

## 8. 和欧混植 (mixed JP/Latin/数字)

- **`text-autospace: normal`** (Baseline 2025-11): 漢字・仮名↔Latin/数字に JLREQ の四分アキを自動挿入 (`売上は1,200円` の `1,200` 周りに空気)。`letter-spacing` と additive、明示 space がある所はスキップ。`text-spacing-trim` (§5) と対で約物側の rhythm も担う。
- **`tabular-nums`**: 金額/統計/timer を列で揃える。`font-variant-numeric: tabular-nums lining-nums` (fallback `font-feature-settings:"tnum" 1,"lnum" 1`)。**本文 prose は比例数字のまま** (tabular は running text でやや緩い)。
- **vertical rhythm**: 和文 glyph は em box 中央寄りで真の baseline が無い → Latin baseline grid でなく **一定の line-height × font-size row 高**を均一適用。full/half-width 遷移の微 spacing は `&nbsp;` 手動でなく `text-autospace` に任せる。

---

## 9. 合成「プロ JP base layer」(skill が emit できる雛形)

```css
:root {
  font-family:
    "Helvetica Neue", Arial, "Segoe UI",
    "Hiragino Sans", "Hiragino Kaku Gothic ProN",
    "Yu Gothic Medium", "Noto Sans JP", Meiryo, sans-serif;
  line-height: 1.5;                 /* a11y 下限・unitless */
  overflow-wrap: anywhere;
  line-break: strict;               /* 禁則 */
  text-autospace: normal;           /* 和欧+数字アキ */
  text-spacing-trim: trim-start;    /* 約物詰め (Limited/experimental, PE) */
  hanging-punctuation: first allow-end last;  /* PE */
}
/* 本文は kerning normal のまま (palt は見出し/ラベル限定、blanket none にしない) */
p:lang(ja) { line-height: 1.75; max-width: 38em; }
h1, h2, h3 { line-height: 1.3; text-wrap: balance; }
:is(h1,h2,h3):lang(ja) {
  font-feature-settings: "palt"; letter-spacing: 0.02em;
  text-wrap: initial;
  @supports (word-break: auto-phrase) { word-break: auto-phrase; text-wrap: balance; }
}
.amount, td.num { font-variant-numeric: tabular-nums lining-nums; }
button, .label { line-height: 1.2; }   /* JP metrics: 1.0 は clipping/縦ズレのリスク */
```

`palt` / `hanging-punctuation` / `text-autospace` / `text-spacing-trim` / `auto-phrase` は **progressive enhancement** (Safari/Firefox gap、2026)。無くても読めるのが必須。

---

## 10. gate すべき amateur tell (craft rubric / blocklist へ供給)

`craft-layer.md` の preflight rubric / AI-slop blocklist に和文項目を供給する。検出できれば fail 候補:

- 和文本文に Latin の line-height (1.2)
- `palt` でなく `letter-spacing` で詰める
- raw CJK 見出しに `text-wrap: balance` (ランダム改行)
- Latin 風 measure (65ch) を和文に
- 未 subset の数 MB web font (blank load)
- font stack で JP が Latin より前
- Windows で細い Yu Gothic
- 金額列に tabular-nums 無し

**必ず守る 2 correctness rule**: line-height は CSS で unitless / font stack は Latin-before-JP。両方とも JP design system が明記する silent bug。

---

## 11. ja_microcopy — 日本語 UI 文言の質 (craft 軸)

組版が正しくても**文言が AI っぽい**と UI も AI っぽく見える。typography とは別軸の craft として `craft-layer.md` §6 の `ja_microcopy` rubric に供給する。観点:

- **語調一貫性**: 敬体/常体を画面内で混在させない (です・ます / だ・である を統一)
- **漢字/かな balance**: 漢字密度が高すぎると硬い。補助動詞・形式名詞はひらく (「下さい→ください」「出来る→できる」「事→こと」)
- **直訳臭の回避**: "Are you sure?" の直訳「本当によろしいですか?」等を避け自然な日本語に
- **冗長敬語の回避**: 「させていただきます」多用・二重敬語を避け簡潔に
- **CTA 動詞**: 曖昧な体言止め/「送信」より具体的な動詞句 (「請求書を送る」「変更を保存」)、ただし短さと両立
- **状態文言**: empty/error/loading が事務的すぎず、次の行動を示す

数値化しにくいので **gate にしない**。Phase 6.5 self-review と taste oracle の advisory で観測する。

---

## 関連リソース

| file | 用途 |
|---|---|
| `craft-layer.md` (同) | craft 層 doctrine、本書 §10 を rubric/blocklist に供給 |
| `craft-tokens.md` (同) | type scale (本書は和文拡張) / spacing rhythm |
| `phases-1-3.md` (同) | Phase 2 style guide が locale_profile + 本 base layer を emit |
| `l7-invariant.md` (同) | text overflow / lint |
| `../templates/design-lint.mjs` | 本書の機械検査実体 (J1 line-height unitless / J2 measure は em で `ch` 禁止 / J3 letter-spacing に palt 併用) |
