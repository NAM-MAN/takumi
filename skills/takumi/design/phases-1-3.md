# design mode の Phase 1-3 詳細

takumi の design mode 本体 (`design/README.md`) から参照される補助ドキュメント。Phase 1 (IA 推論) / Phase 2 (Style Guide) / Phase 3 (コンポーネント基盤) の手順と生成 snippet を記述する。Phase 4-6 は `phases-4-6.md`。

---

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

