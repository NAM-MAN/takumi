# /design の Phase 1-6 詳細

本体(`SKILL.md`)から参照される補助ドキュメント。各 Phase の手順と生成 snippet 例を記述する。

## Phase 1: IA 推論

### input
- `.takumi/plans/{name}.md` の AC-ID 群
- 必須入力 4 項目

### やること
1. AC 文言から **primary_objects** を抽出 (名詞句のトップ 5-10)
2. 各 object に紐づく **actions** (動詞句) を列挙
3. object × action から **screens** を導出 (list / detail / create / edit / bulk 等)
4. screens を**階層化**して sitemap を作る (最大 3 階層)

### 出力: `.takumi/design/sitemap.md`

```markdown
# Sitemap: {project_name}

## Primary Objects

| object | 説明 | key actions |
|---|---|---|
| Invoice | 請求書 | list / view / create / send / void |
| Customer | 顧客 | list / view / edit / merge |
| Payment | 支払い | list / view / refund |

## Sitemap

- /dashboard (home)
- /invoices
  - /invoices/new
  - /invoices/:id
  - /invoices/:id/edit
- /customers
  - /customers/:id
- /settings
  - /settings/billing
  - /settings/team

## Screen × Object × Primary Action

| screen | primary_object | primary_action |
|---|---|---|
| /invoices | Invoice | list / filter |
| /invoices/new | Invoice | create |
| /invoices/:id | Invoice | view / send / void |
```

`primary_action` が screen 単位で 1 つに決まらない場合、画面分割を検討する
(OOUI の原則、action が 2 つ並立する画面は認知負荷が高い)。

---

## Phase 2: Style Guide seeded 決定

### input
- 必須入力 4 項目 (特に `brand_tone` と `ref_archetypes`)

### やること
ref_archetypes ごとに内部 archetype table を引き、brand_tone で補正して**固定 token set**に落とす。
**同じ入力に対して常に同じ出力**を返す(seeded)。

### 内部 archetype table (抜粋)

| archetype | base_hue | contrast | radius | motion | density |
|---|---|---|---|---|---|
| Linear | neutral-dark | high | 6-8 | subtle | dense |
| Vercel | neutral-mono | high | 6 | subtle | medium |
| Notion | warm-neutral | medium | 3 | minimal | relaxed |
| Stripe Dashboard | indigo-neutral | medium | 4-6 | subtle | dense |
| Airbnb | coral-warm | medium | 8-12 | playful | relaxed |
| Datadog | purple-dark | high | 4 | subtle | very dense |

### 出力: `.takumi/design/style-guide.md`

```markdown
# Style Guide: {project_name}

## Tokens (seeded)

derived_from: ref_archetypes=[Linear, Vercel], brand_tone="minimal, neutral, pro"

### Color

| token | light | dark | 用途 |
|---|---|---|---|
| bg.canvas | #FFFFFF | #0A0A0A | 最背面 |
| bg.surface | #FAFAFA | #111111 | card / panel |
| bg.subtle | #F4F4F5 | #18181B | hover / stripe |
| fg.primary | #09090B | #FAFAFA | 本文 |
| fg.muted | #71717A | #A1A1AA | 補助テキスト |
| border.subtle | #E4E4E7 | #27272A | 区切り線 |
| accent.primary | #18181B | #FAFAFA | primary action |
| accent.success | #16A34A | #22C55E | 成功 |
| accent.danger | #DC2626 | #EF4444 | 破壊 / 警告 |
| focus.ring | #3B82F6 | #60A5FA | focus-ring |

### Typography

| token | size | line | weight | 用途 |
|---|---|---|---|---|
| display | 30px | 36px | 600 | page hero |
| h1 | 24px | 32px | 600 | page title |
| h2 | 18px | 26px | 600 | section |
| body | 14px | 20px | 400 | 本文 |
| caption | 12px | 16px | 500 | label / meta |
| code | 13px | 20px | 500 | mono |

font_family: Inter, system-ui, sans-serif
code_family: JetBrains Mono, ui-monospace, monospace

### Spacing (4px scale)

| token | px |
|---|---|
| 1 | 4 |
| 2 | 8 |
| 3 | 12 |
| 4 | 16 |
| 6 | 24 |
| 8 | 32 |
| 12 | 48 |

### Radius

| token | px | 用途 |
|---|---|---|
| sm | 4 | input / small button |
| md | 6 | card / dialog |
| lg | 8 | modal / sheet |
| full | 9999 | avatar / pill |

### Shadow

| token | 値 | 用途 |
|---|---|---|
| sm | 0 1px 2px rgba(0,0,0,0.06) | card (resting) |
| md | 0 4px 8px rgba(0,0,0,0.08) | dropdown |
| lg | 0 12px 32px rgba(0,0,0,0.12) | modal |

### Motion

| token | duration | easing | 用途 |
|---|---|---|---|
| fast | 120ms | ease-out | hover / press |
| base | 200ms | ease-out | dialog open |
| slow | 320ms | ease-in-out | page transition |

reduced_motion: duration を 0ms, easing を linear に置換
```

### 書き戻し先 (production)

Tailwind config / CSS variable にそのまま流し込めるよう、同ファイル末尾に snippet を添える:

```js
// tailwind.config.js (抜粋)
theme: {
  extend: {
    colors: {
      bg: { canvas: 'var(--bg-canvas)', surface: 'var(--bg-surface)' },
      fg: { primary: 'var(--fg-primary)', muted: 'var(--fg-muted)' },
    },
    borderRadius: { sm: '4px', md: '6px', lg: '8px' },
  }
}
```

---

## Phase 3: コンポーネント基盤

固定スタック **shadcn/ui + Tailwind + framer-motion + lucide-react** 前提で、
style-guide の token をコンポーネント層に流し込む。

### コンポーネント選定 (shadcn/ui ベース)

| 用途 | 採用 | 備考 |
|---|---|---|
| button | `<Button>` | variant: default / outline / ghost / destructive |
| form input | `<Input>` + `<Label>` | form library は react-hook-form + zod |
| dialog | `<Dialog>` | framer-motion で fade+scale |
| dropdown | `<DropdownMenu>` | keyboard navigation 必須 |
| table | `<Table>` + TanStack Table | density は token で制御 |
| toast | `<Sonner>` | position=bottom-right 固定 |
| icon | lucide-react | size 16 / 20 / 24 のみ |

### install snippet

```bash
pnpm dlx shadcn@latest init
pnpm dlx shadcn@latest add button input label dialog dropdown-menu table sonner
pnpm add framer-motion lucide-react
```

### 禁止事項

- shadcn 以外の UI library を混ぜない (Material, Chakra, Mantine 等)
- icon を他ライブラリと混在させない
- 独自 component を書く前に**必ず** shadcn で同等品が無いか確認

---

## Phase 4: マイクロインタラクション標準化

「どこで何がどう動くか」を先に決めて、画面ごとにブレないようにする。
**hard rule ではない** (推奨) — 例外は interactions.md に書き足せば良い。

### 出力: `.takumi/design/interactions.md`

```markdown
# Interactions: {project_name}

## 標準モーション

| element | trigger | effect | duration | easing |
|---|---|---|---|---|
| button | press | scale(0.98) + bg.subtle | fast (120ms) | ease-out |
| button (primary) | hover | bg 8% darken | fast | ease-out |
| card | hover | shadow sm → md, translateY(-1px) | fast | ease-out |
| list row | focus | focus-ring 2px + bg.subtle | fast | ease-out |
| dialog | open | fade-in + scale(0.96→1) | base (200ms) | ease-out |
| dialog | close | fade-out + scale(1→0.98) | fast | ease-in |
| page | navigate | opacity fade crossfade | base | ease-in-out |
| toast | enter | slide-up + fade-in | base | ease-out |
| toast | exit | fade-out | fast | ease-in |
| skeleton | load | shimmer 1.4s infinite | - | linear |

## パターン

### button ripple

`framer-motion` の `whileTap={{ scale: 0.98 }}` で実装。Material 風の radial ripple
は使わない (重く、brand tone と合わない場合が多い)。

### card hover

`whileHover={{ y: -1, boxShadow: '...' }}`。transform-only で GPU 合成、reflow しない。

### list row focus-ring

Tailwind `focus-visible:ring-2 focus-visible:ring-focus-ring`。
マウス hover 時は ring を出さず、キーボード focus 時のみ。

### skeleton loader

grayscale gradient shimmer。`prefers-reduced-motion` を尊重して静止 bg に fallback。

### toast

`<Sonner>` (shadcn) に任せる。position=bottom-right、duration=4000ms、
stack 上限 3 件。

### page-modal transition

list → detail は modal で上乗せ (URL は pushState)。戻る = modal close。
深いネストはパンくずより modal stack で表現。

## icon 推奨 (hard rule にしない)

- button には**概ね** icon を付ける (primary action の affordance 向上)
- ただし text-only button が妥当な場合は無理に付けない
- 付ける場合は lucide-react、size は 16 (button sm) / 20 (base) / 24 (lg)
- icon 位置は text の左。右は次ページ遷移を示す chevron / arrow 等のみ
```

---

## Phase 5: OOUI ワイヤーフレーム

画面ごとに **ASCII 骨格** + **object/action 表**を出す。画像は出さない
(review コストとブレを避ける)。

### 出力: `.takumi/design/wireframes/{screen}.md`

`{screen}` は sitemap の path を slug 化 (`/invoices` → `invoices`, `/invoices/:id` → `invoices-detail`)。

### テンプレート

```markdown
# Wireframe: /invoices (list)

## OOUI

| object | actions |
|---|---|
| Invoice (list item) | view / void / download |
| Invoice filter | apply / clear / save |
| Bulk selection | send / export / void |

primary_object: Invoice
primary_action: list / filter

## 骨格 (ASCII)

+---------------------------------------------------------------+
| [Sidebar]        | Invoices                  [+ New Invoice]  |
|                  +-------------------------------------------+
|                  | [Search] [Status v] [Date v] [Saved v]    |
|                  +-------------------------------------------+
|                  | [ ] # | Customer    | Amount   | Status   |
|                  +-------------------------------------------+
|                  | [ ] 1 | Acme Corp   | $1,200   | Paid     |
|                  | [ ] 2 | Globex      | $4,500   | Open     |
|                  | [ ] 3 | Initech     | $  900   | Overdue  |
|                  +-------------------------------------------+
|                  | 3 of 42 rows  [Prev] [1] 2 3 ... [Next]   |
+------------------+-------------------------------------------+

## States

| state | 内容 |
|---|---|
| loading | skeleton rows 10 本、header は即時描画 |
| empty | 中央イラスト + 「まだ invoice がありません」 + [+ New Invoice] |
| error | 画面上部に retry 付き banner、table は前回のキャッシュを残す |
| long_text | customer 名は truncate + tooltip、amount は固定幅右揃え |

## 遷移

| trigger | action | 遷移先 |
|---|---|---|
| row click | view | /invoices/:id (modal) |
| [+ New Invoice] | create | /invoices/new (modal) |
| bulk [Send] | send | confirm dialog → API |

## L7 check 事前メモ

- container はみ出し: customer 名は 240px max-w で truncate
- クリック不能: table row は全幅が clickable、内部の Link は stopPropagation
- overflow: table horizontal scroll は禁止、column を優先度で hide
```

---

## Phase 6: /plan 連携

design 成果物は **reference-first** で `/plan` の task frontmatter に載せる。
profile 本体は `.takumi/profiles/design/{name}.yaml` に置き、task からは**名前参照のみ**。

### `.takumi/profiles/design/dashboard-dense.yaml` の例

```yaml
name: dashboard-dense
derived_from:
  product_type: saas_dashboard
  brand_tone: "serious, trustworthy, financial"
  ref_archetypes: [Linear, Stripe Dashboard]

tokens:
  style_guide_ref: .takumi/design/style-guide.md
  density: dense

components:
  stack: [shadcn/ui, tailwind, framer-motion, lucide-react]
  table_lib: tanstack-table

interactions_ref: .takumi/design/interactions.md
sitemap_ref: .takumi/design/sitemap.md

layout_invariants:
  hard:
    - no_container_overflow
    - interactive_hit_area_min_32px
    - focus_visible_all_controls
    - no_text_clipping
    - color_contrast_aa
  soft:
    - spacing_on_token_scale
    - icon_from_lucide_only
    - grid_column_alignment
  lint:
    - color_token_only
    - typography_token_only
```

### task frontmatter 側

```markdown
---
task_id: T-042
ac_ids: [AC-UI-012]
verify_profile_ref: state-transition
design_profile_ref: dashboard-dense
---
```

**profile 本体を task に埋め込まない**。名前参照のみ。複数 task で同じ profile を
共有することで一貫性が担保される (drift 検出も profile 単位で効く)。

## 関連リソース

| file | 用途 |
|---|---|
| `SKILL.md` (同ディレクトリ) | 本体 entry point |
| `l7-invariant.md` (同ディレクトリ) | L7 Layout Invariant 3 層の詳細 |
| `profiles-defaults/*.yaml` (同ディレクトリ) | 4 design profile defaults |
| `~/.claude/skills/plan/SKILL.md` | /plan 連携 |
| `~/.claude/skills/verify/SKILL.md` | verify との接続 (L7 gate) |
