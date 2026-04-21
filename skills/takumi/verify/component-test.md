# Component Test (verify skill 内部参照 / Layer 2)

React Testing Library + fast-check で **画面コンポーネントの小さな state** を叩く。
**Tier A 画面 (60-70%) はこれだけで守る**。state machine 不要。

> [!IMPORTANT]
> **USS 原則 (`spec-tests.md`)**: 1 component = 1 test file (`{Component}.test.tsx`)。`.property.test.tsx` / `.pbt.test.tsx` 等の分割は禁止。
> **命名は結合骨格**: `{A} を {action} すると {result} として記録されるべき` / `{Subject} を {action} すると {result} が表示されるべき` 等。L2 Component Test は DOM + interaction を叩く**結合レベル**なので、ユニット骨格 (`{Subject} は {input} に対して {output} を返すべき`) は使わない (strict-refactoring Rule 14 / verify 7 原則の第 6)。
> **ファイル内の統一性**: 同一 test file 内では常に結合骨格で揃える (`spec-tests.md` §3.3)。

---

## 位置づけ

```
L1 PBT              — 純粋関数 / ビルダー / パーサー
L2 Component Test   — ← 本ファイル。UI component の state
L3 Model-Based+Diff — 画面間遷移 / 複雑な画面内 state (Tier B+C+D)
```

Layer 1 は「純粋関数の入力空間」、Layer 2 は「**DOM を持つ component の state/props 空間**」。
両者ともランダム入力だが、Layer 2 は render + interaction が入る。

---

## いつ使うか (Tier A 判定条件)

画面ファイルに対して、以下**全て**を満たす:

- useState / useReducer 呼び出しが 0-2 個
- useEffect が 0-1 個
- onClick / onSubmit / onChange の合計が 0-5 個
- modal / wizard / canvas / websocket なし
- 認証ガードが単純 (isLoggedIn チェックのみ等)

→ このスコアは AST で自動判定可能 (`machine-generator.md` Stage 2 参照)。

典型例:
- Login form
- Settings toggle / dropdown
- Profile view
- 静的コンテンツ + 単純 CTA
- 単純な CRUD list (表示のみ)

---

## 基本パターン

### パターン 1: Props 空間のランダム探索

```ts
import { render, screen } from "@testing-library/react"
import fc from "fast-check"
import { UserBadge } from "../UserBadge"

describe('UserBadge', () => {
  it('任意の user を UserBadge に渡してレンダリングすると、その name が画面に表示されるべき', () => {
    const userArb = fc.record({
      id: fc.uuid(),
      name: fc.string({ minLength: 1, maxLength: 50 }),
      role: fc.constantFrom("viewer", "editor", "admin"),
      avatar: fc.option(fc.webUrl()),
    })

    fc.assert(fc.property(userArb, (user) => {
      const { unmount } = render(<UserBadge user={user} />)
      expect(screen.getByText(user.name)).toBeInTheDocument()
      if (user.role === "admin") {
        expect(screen.getByLabelText(/admin/i)).toBeInTheDocument()
      }
      unmount()
    }), { numRuns: 100 })
  })
})
```

Props のあらゆる組合せで **render が落ちない** + **表示が仕様に一致する**を確認。

### パターン 2: Interaction の可換性 / 冪等性

```ts
describe('SettingsToggle', () => {
  it('SettingsToggle を任意回クリックすると、偶数回で OFF・奇数回で ON の状態として表示されるべき', () => {
    fc.assert(fc.property(fc.array(fc.boolean(), { maxLength: 20 }), (clicks) => {
      const spy = vi.fn()
      const { unmount } = render(<SettingsToggle onChange={spy} />)
      const box = screen.getByRole("checkbox")

      for (const _ of clicks) fireEvent.click(box)

      expect(spy).toHaveBeenCalledTimes(clicks.length)
      expect(box.checked).toBe(clicks.length % 2 === 1)
      unmount()
    }))
  })
})
```

→ 「何回 click してもカウントが合う」「偶数回で元に戻る」を機械が確かめる。

### パターン 3: 条件分岐の全パス網羅

```ts
describe('FormError', () => {
  it('FormError に全ての error 種別を渡してレンダリングすると、空でないメッセージが表示されるべき', () => {
    const errorArb = fc.constantFrom(
      "required", "too_short", "too_long", "invalid_email", "duplicate"
    )

    fc.assert(fc.property(errorArb, (err) => {
      const { unmount } = render(<FormError type={err} />)
      const el = screen.getByRole("alert")
      expect(el).toBeInTheDocument()
      expect(el.textContent).not.toBe("")
      unmount()
    }))
  })
})
```

→ discriminated union の全 variant に対して render が valid なことを確認。

### パターン 4: 不正 Props の rejection

```ts
describe('Pagination', () => {
  it('Pagination に不正なページ番号を渡してレンダリングすると、ページ 1 が表示されるべき', () => {
    const invalidArb = fc.oneof(
      fc.integer({ max: -1 }),
      fc.float().filter((n) => !Number.isInteger(n)),
      fc.constant(NaN),
    )

    fc.assert(fc.property(invalidArb, (page) => {
      const spy = vi.spyOn(console, "error").mockImplementation(() => {})
      const { unmount } = render(<Pagination page={page as any} total={100} />)
      expect(screen.getByText(/page 1/i)).toBeInTheDocument()
      unmount()
      spy.mockRestore()
    }))
  })
})
```

---

## Next.js 特有パターン

### Server Component (RSC)

```ts
// Server Component はそのまま render 不可。vitest で直接呼ぶ
import { UserProfile } from "../UserProfile"

describe('UserProfile (Server Component)', () => {
  it('UserProfile を任意の user id で呼び出すと、valid な JSX 要素として記録されるべき', async () => {
    await fc.assert(fc.asyncProperty(fc.uuid(), async (id) => {
      const element = await UserProfile({ id })
      expect(element).toBeTruthy()
      expect(element.type || element.props).toBeDefined()
    }))
  })
})
```

### Server Action

```ts
import { updateUser } from "../actions"

describe('updateUser (Server Action)', () => {
  it('updateUser を valid な formData で呼び出すと、success プロパティを持つ結果として返されるべき', async () => {
    await fc.assert(fc.asyncProperty(formDataArb, async (formData) => {
      const result = await updateUser(null, formData)
      expect(result).toHaveProperty("success")
    }))
  })
})
```

### Client Component with "use client"

通常の RTL + fast-check パターンで OK (Server/Client 境界関係なし)。

---

## ドメイン arbitrary の集約

`src/test/component-arbitraries.ts` に集約:

```ts
import fc from "fast-check"

export const userArb = fc.record({
  id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 50 }),
  email: fc.emailAddress(),
  role: fc.constantFrom("viewer", "editor", "admin"),
})

export const beatArb = fc.record({
  id: fc.uuid(),
  text: fc.string({ minLength: 10, maxLength: 500 }),
  status: fc.constantFrom("draft", "review", "approved"),
})

// 「一覧系」の典型
export const paginatedArb = <T,>(itemArb: fc.Arbitrary<T>) => fc.record({
  items: fc.array(itemArb, { maxLength: 20 }),
  page: fc.integer({ min: 1, max: 100 }),
  total: fc.integer({ min: 0, max: 10000 }),
})
```

→ `fc.string()` 直書き禁止。必ずドメイン arbitrary を使う。

---

## アンチパターン

### ❌ 実装詳細の assert

```ts
// NG: state を直接確認
expect(component.state.count).toBe(5)
```

```ts
// OK: ユーザー可視の挙動
expect(screen.getByText("Count: 5")).toBeInTheDocument()
```

### ❌ ランダム入力なしの example test

```ts
// NG: fast-check で wrap しただけの example
fc.assert(fc.property(fc.constant({ name: "test" }), (user) => { ... }))
// → これは property じゃない。1 ケースしか見てない
```

### ❌ スナップショット依存

```ts
// NG: snapshot だけで pass/fail を判定
expect(container).toMatchSnapshot()
// → 変更時に盲目承認されやすい
```

→ snapshot は補助として使う。判定は **明示的な assertion** で。

---

## 生成コスト (AI 生成時)

Tier A 画面 1 個に対して:
- Component Test 1-3 本
- ドメイン arbitrary の追加 (共有があれば流用)
- 実行時間: `numRuns: 100` でも 0.5-2 秒

AI 生成プロンプトは `machine-generator.md` Stage 3 参照。

---

## Layer 2 と他層の分担

| Layer 2 (本ファイル) | Layer 3 (Model-Based) |
|---|---|
| 1 component 単位 | 複数 component / 画面間 |
| 単純な state (0-2 個) | 複雑な state (3+ 個) |
| render + event 1-5 個 | event sequence (fc.commands) |
| props / state の空間網羅 | 遷移パスの網羅 |

Layer 2 で捕まる:
- Props の invariant 違反
- Event handler の実装ミス
- condition rendering の分岐漏れ
- プロパティ型と実装の不整合

Layer 2 で捕まらない (→ Layer 3 に委譲):
- 複数 component 間の state 矛盾
- 画面遷移時の state leak
- 認証ガード漏れ
- multi-step wizard の state drift

---

## 制約

- Props / state / interaction を必ず **ランダム化** (example 1 個は NG)
- ドメイン arbitrary を `src/test/component-arbitraries.ts` に集約
- `numRuns` は 100 を基準 (重要 component は 500)
- Server Component は直接 call、Client Component は RTL render
- snapshot は補助、判定は明示 assert
- Tier B 以上の画面には無効 (Model-Based に押し出す)
