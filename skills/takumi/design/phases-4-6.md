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

## Phase 6.5: 実装後 self-review (AI self-check、deterministic な限定 round)

実装が完了した直後 (PR 提出前) に、AI 自身で素人視点 checklist を **limited round** だけ自己検証する補助工程。

### 役割と L6 AI Review との棲み分け

- **Phase 6.5 self-review**: 実装者が自分の成果物を「素人ユーザー視点」で監査。規範は実装規範と分離し、「初見の違和感」に絞る (token 厳密性でなく体感的な不便)。
- **verify/ai-review.md の L6 AI Review**: PR 直前の広範 oracle review (bug / test coverage / security 等の技術規範)。
- 呼び出し順序: Phase 6 実装完了 → **Phase 6.5 self-review** → L6 AI Review → PR。

### 素人視点 checklist (観点のみ列挙、数値は既存 L7 hard gate を準拠)

素人が初見で使って気付く違和感に焦点を絞った観点を self-review の checklist とする (project profile で具体数値を決める)。数値が必要な項目は **L7 hard gate の既存閾値を準拠**、checklist 独自の新閾値は設けない:

- **grid / spacing 階層**: token grid からの逸脱ゼロ、outer と inner が階層分離
- **typography scale / semantic color**: tokens.yaml 通り
- **focus visible / contrast / hit area**: 既存 L7 hard gate 準拠 (数値は `l7-invariant.md` §hard gate 参照)
- **toast / anchor / sticky の非重複**: error toast が入力を覆わない、sticky header が target を隠さない、overlay 重なりなし
- **empty / loading / error の 3 状態**: ワイヤーフレーム時に約束した 3 状態が実装に反映
- **responsive overflow**: モバイル view で horizontal scroll なし
- **disabled pointer / arbitrary value**: 無効要素で click 非発火、token 外の arbitrary 値ゼロ
- **motion-reduce**: `prefers-reduced-motion` 尊重

具体的な checklist 項目数・数値・gate 強度は **project profile** (`.takumi/profiles/design/*.yaml`) で定義する。本 skill 側には **抽象規範のみ** (観点の taxonomy) を置く。

### round state machine (曖昧さ排除)

```
impl_freeze → review_pass → post_review_edit → final_freeze
```

- **default**: `impl_freeze → review_pass → post_review_edit (0 or 1 回) → final_freeze` の **限定 round**
- **escalation 許可条件**: 素人視点 checklist のうち **既存 L7 hard gate に該当する観点** が fail した場合に限り、追加 round を許可
- **soft gate 系の残違反**: 限定 round 内で打ち切り、未修正項目は PR description に記録 (修正は後続 task で)
- **round 消費判定**: review 後にコード diff が発生すれば round 消費、review note のみ生成は非消費

具体的な round 上限 (default round 数 / escalation 時の最大 round 数) は project profile で定義。本 skill は「limited round で過剰 iteration を防ぐ」原則のみ記載。

### implementation / review time 計測 (運用注記)

orchestrator event log で自動計測する場合:
- `implementation_time`: Phase 4-6 着手から最初の `impl_freeze` (artifact hash 確定) まで
- `review_loop_time`: `review_pass` 発火から `final_freeze` までの全コード diff 時間

人手申告は避け、自動計測に徹する。

## 関連リソース

| file | 用途 |
|---|---|
| `SKILL.md` (同ディレクトリ) | 本体 entry point |
| `l7-invariant.md` (同ディレクトリ) | L7 Layout Invariant 3 層の詳細 |
| `profiles-defaults/*.yaml` (同ディレクトリ) | 4 design profile defaults |
| `../SKILL.md` | /takumi 連携 |
| `../verify/README.md` | verify との接続 (L7 gate) |
