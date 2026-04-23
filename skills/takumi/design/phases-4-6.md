# design mode の Phase 4-6 詳細

takumi の design mode 本体 (`design/README.md`) から参照される補助ドキュメント。Phase 4 (マイクロインタラクション) / Phase 5 (ワイヤーフレーム) / Phase 6 (takumi 連携) の手順と生成 snippet を記述する。Phase 1-3 は `phases-1-3.md`。

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

## Phase 6: /takumi 連携

design 成果物は **reference-first** で `/takumi` の task frontmatter に載せる。
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
| `../SKILL.md` | /takumi 連携 |
| `../verify/README.md` | verify との接続 (L7 gate) |
