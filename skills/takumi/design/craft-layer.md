# Craft Constraint 層 — 凡庸さを構成的に減らす (design mode 第 4 層)

`design/README.md` / `design/runtime.md` から参照される craft (作り込み) 規範。design mode の既存 3 層 (L-construct 予防 / L7 検出 / seeded token) は「UI が**壊れない**」軸を守る。本書はそれと**直交**する第 4 層で、「**凡庸でない** (プロが組んだように見える)」軸を守る。

> [!IMPORTANT]
> **これは Taste 層ではなく Craft Constraint 層**。美しさを生成するのではなく、**凡庸さを構成的に減らす制約**を置く。L-construct と同じ DNA — taste を seed するのではなく **craft primitive を seed する**。token を増やして自由度を広げるのではなく、生成空間を「迷わない方向」に狭める。token は「選択肢」でなく「導出規則 / 制約」として書く (具体 token は `craft-tokens.md`)。

---

## 1. 4 層モデルと craft 層の位置

| 層 | 守る軸 | file | 性質 |
|---|---|---|---|
| L-construct | 崩れない (can't break) | `layout-primitives.md` | 生成空間を狭める一次予防 |
| L7 | 壊れていない検出 | `l7-invariant.md` | 実測の保険網 |
| seeded token | 一貫性 (色/余白/角丸固定) | `phases-1-3.md` Phase 2 | 決定論 |
| **Craft Constraint (本書)** | **凡庸でない** | `craft-layer.md` + `craft-tokens.md` + `jp-typography.md` | 決定論 craft primitive + offline 観測 |

craft 層は L7 を**破れない**。矛盾時の優先順位は §6。craft の効果測定 (taste oracle) は **offline 観測装置**であり gate ではない (`taste-oracle.md`)。

---

## 2. 凡庸さの正体 (何を制約すれば craft が出るか)

「美しさ」の多くは装飾ではなく **何を強く見せ何を弱くするか (情報設計)** と **要素を減らす規律**。AI っぽさは以下から出る — これらを潰すのが本層:

1. 階層が平坦 (全部同じ強さ) → 視覚階層を size でなく **weight + color** で作る
2. 余白が均一 (grouping が消える) → spacing で grouping を符号化 (inner < outer)
3. 色数過多 / accent 散漫 → neutral 90%+、accent は primary action/link/active のみ
4. 単一 shadow / pure gray / 無 tint dark 反転 → `craft-tokens.md` の elevation/color 規則
5. 既定 font (Inter/Roboto) / centered-stack テンプレ構図 → §5 blocklist
6. 面・罫線・badge の増殖 → **unjustified component count** (§5、必要性で判定)
7. 日本語に Latin 既定を流用 (line-height 1.2 / letter-spacing 代用) → `jp-typography.md`

---

## 3. principle dictionary (reference を brand 名でなく原理で seed)

> [!WARNING]
> `ref_archetypes` に「Linear っぽく」「Stripe っぽく」を直接 seed すると **imitation と流行追従**になり個性が死ぬ。ref はブランド名でなく、下表の**原理 enum** に分解してから seed する。Phase 2 の archetype table はこの辞書を引く。

| 原理 | enum | 意味 |
|---|---|---|
| `density` | low / medium / high | 情報密度。LP=low、SaaS/dashboard=high。content 駆動で決める |
| `contrast_strategy` | restrained / balanced / bold | 階層の付け方。restrained=hairline+weight、bold=大胆な size/色 |
| `motion` | minimal / subtle / expressive | 動きの量。安易な多用は一気に安っぽい (§5) |
| `surface_depth` | flat+hairline / soft-elevation / layered | 面の立体表現。JP 業務 UI は flat+hairline が費用対効果高 |
| `accent_discipline` | mono / single-accent / dual | accent 色の本数。single-accent 既定 |
| `type_personality` | neutral / editorial / technical / friendly | 書体の性格。distinctive を選ぶ (既定 font 回避) |
| `emotional_temperature` | calm / neutral / warm / energetic | 画面の感情温度 (medical=calm / consumer=warm / finance=neutral 等)。同じ density/contrast でも domain で正解が違う = **context 相対** |

ref product を渡されたら「その product を真似る」のでなく「その product の原理を上表に写像する」。例: Linear → `density:high, contrast_strategy:restrained, motion:subtle, surface_depth:flat+hairline, accent_discipline:single-accent`。

---

## 4. craft token (決定論導出、`craft-tokens.md` 本体)

craft token は seeded と相性が良いが、**増やすと生成空間が広がる**ため「導出規則」として固定する。詳細は `craft-tokens.md`:

- **color**: OKLCH 50–950 の 11 step ramp 導出 + Radix 12-step semantic 役割割当。APCA Lc≥60 (本文) / Lc≥90 (主要)。neutral は微 tint。
- **elevation**: 多層 shadow 5 step (ambient+key、光源一貫)。dark は shadow でなく lightness。**JP 業務 UI では最小限**で良い。
- **radius**: nested 数式 (外 = 内 + padding) + scale。
- **spacing**: 制約スケール + grouping (inner < outer)。
- **type scale**: modular scale + 階層は weight/color 優先。

---

## 5. AI-slop blocklist (lint / soft rule)

Anthropic `frontend-design` skill の anti-slop 規範 + research を lint/soft に落とす。`l7-invariant.md` の lint/soft に併記し profile で on/off:

| rule_id | 内容 (soft = warn、禁止ではない) | 層 |
|---|---|---|
| `no_default_ai_font` | 既定で Inter / Roboto / Arial / system-ui を本文 brand font にする (distinctive を選ぶ。JP は `jp-typography.md` stack) | soft |
| `no_purple_on_white_cliche` | purple gradient on white の常套句 | soft |
| `no_single_box_shadow` | shadow 1 層 (多層 elevation を使う) | soft |
| `pure_gray_without_intent` | 無彩色だけで温度/階層/状態を作っていない時に warn。**gray/黒の禁止ではない** (finance/medical/devtools は gray 主体が正解になりうる) | soft |
| `dark_not_redesigned` | light の単純反転で elevation/color-semantics/state が**再設計されていない**場合を検出 (反転自体の禁止でない) | soft |
| `no_centered_stack_template` | 全画面 centered-stack の量産テンプレ構図 | soft |
| `unjustified_component_count` | **正当化されない**面/罫線/badge の増殖 (raw 数でなく必要性で判定、密度高 admin を誤爆しない) | soft |
| `accent_overuse` | accent 色を primary action/link/active 以外に多用 | soft |

soft 維持 (hard でない) 理由: 文脈で妥当な例外がある (例: 技術系で system-ui 意図採用)。4 週で warning 10%+ 継続かつ人間合意で hard 昇格 (`l7-invariant.md` 昇格ルール準拠)。

---

## 6. craft preflight rubric (anchored、実装前確認)

L7 preflight の craft 版。Phase 1-3 完了時に設計判断として確認、fail は Phase 5 で補完。**anchored level** (0=凡庸 / 2=可 / 3=pro) で曖昧さを排除。数値が要る項目は L7 hard gate / craft-tokens を準拠 (独自閾値を作らない)。

| axis | 見るもの | 0 (凡庸) | 3 (pro) |
|---|---|---|---|
| hierarchy | 視覚階層の作り方 | 全要素同じ強さ / size だけで叫ぶ | weight+color で階層、focal point 1 つ |
| type_scale | 型スケール | 任意 size 散在 | modular scale 上、≤2 family |
| spacing_rhythm | 余白リズム | 均一 gap で grouping 消失 | inner<outer、scale 上、generous |
| color_harmony | 色調和 | 色数過多 / pure gray | ramp 上、neutral 微 tint、accent 抑制 |
| elevation | 面の立体 | 単一 shadow / 無秩序 | 多層 / 光源一貫 / dark=lightness |
| state_design | 状態設計 | hover/active/disabled が同一 or 欠落 | 全 state 別個 + 調整 easing |
| iconography | アイコン規律 | 線幅/サイズ不揃い、混在 | 単一 set、size 16/20/24、label 規則 |
| alignment | 整列規律 | 見えない軸がバラバラ | optical 整列、edge 一貫 |
| density | 情報密度 | context 不一致 (LP に dashboard 密度等) | product_type に整合 |
| motion_restraint | 動きの節度 | 全要素が常時微動 | 1 orchestrated entrance、他は静 |
| content_quality | 文言 | AI っぽい placeholder/コピー | 具体的・製品文脈に整合 |
| context_fit | domain/intent との整合 | 汎用テンプレ、domain 無視 | domain の温度・密度に整合 (金融/医療/consumer で正解が違う) |
| scan_path | 初見の視線誘導 | どこを読むか不明 | 3 秒で主情報→次アクションを follow できる |
| primary_action_clarity | 主アクション明確性 | 主/副 CTA が競合 | 主 CTA が唯一際立ち、副と距離・強度で分離 |
| ja_microcopy | 日本語文言の質 (`jp-typography.md` §11) | 直訳臭/冗長敬語/CTA 弱い | 語調一貫・漢字かなバランス・自然な CTA 動詞 |

このうち **gate にしてよい候補** (taste oracle / Phase 6.5 で fail 検出可能): hierarchy 欠落 / CTA 埋没 / spacing_rhythm 破綻 / type_scale 逆転 / color 過多 / elevation 濁り / JP 行長・行高。**gate にすべきでない** (好みが割れる): 総合 taste / 「プロっぽさ」/ 「AI っぽさ」/ brand 適合 / 装飾の好み。

---

## 7. 矛盾調停 (craft vs 壊れない)

craft が L7 と衝突する場面は**確実にある** (演出余白 vs overflow、大見出し vs mobile 折返し、低コントラスト装飾 vs AA、小 icon button vs 32px)。優先順位 (上が強い):

1. **a11y / 安全 / 操作不能回避** (hit area, contrast 下限, focus)
2. **レスポンシブ破綻回避** (functional overflow, mobile 折返し)
3. **情報構造 / タスク効率**
4. **brand / craft expression** (演出余白, 装飾, 大見出し)

craft は 1-3 を破れない。ただし L7 側に**例外予算**を置く: overflow を **functional (常に禁止)** と **decorative bleed (escape hatch 下で許可)** に 2 分類する (`l7-invariant.md` 参照)。

---

## 関連リソース

| file | 用途 |
|---|---|
| `craft-tokens.md` (同) | craft token の決定論導出 (OKLCH ramp/elevation/radius/spacing/type) |
| `jp-typography.md` (同) | locale_profile + 日本語プロ typography base layer |
| `taste-oracle.md` (同、pilot 採否保留) | craft の offline 観測 + E→D promotion |
| `layout-primitives.md` (同) | L-construct (崩れない一次予防)。本層と直交 |
| `l7-invariant.md` (同) | L7 検出 + AI-slop blocklist の lint/soft 登録先 + overflow 2 分類 |
| `phases-1-3.md` (同) | Phase 2 が本層の token 導出規則を引く |
| `phases-4-6.md` (同) | Phase 4 interactions / Phase 6.5 self-review が craft rubric を使う |
| `README.md` (同) | design mode 人間向け LP (craft/excellence 軸) |
