# Model-Based Testing + Differential (verify skill 内部参照 / Layer 3)

**状態機械化は全画面のためではない**。Tier 分類して戦略を変える。
**XState は production 依存にしない** — テストの devDependencies のみ、opt-in。

---

## 思想

60 点の落とし穴:
- 全画面を state machine 化 → 破綻
- XState を production に強制 → vendor lock-in
- 「画面数 = 状態数」の誤解 → スケールしない

100 点の設計:
1. **Tier A-D で戦略を切替** (AST スコアリングで自動判定)
2. **Tier B のデフォルトは fast-check commands** (plain TS、依存ゼロ)
3. **Tier C のみ XState** (test-only、devDependencies)
4. **画面 95% は XState 不要**
5. **AI が machine を生成** (AST + Runtime 三角測量 → `machine-generator.md`)
6. **strict-refactoring と連動**: Pending Object → State Machine の進化を verify 側も追従

---

## strict-refactoring との統合 (重要)

strict-refactoring skill の設計進化と verify の Tier は **同じ進化の両面**:

```
state: 0-2    →    3-8    →    9-20    →    21+
本番: useState直書き → Pending Object → State Machine → Event Sourcing
テスト: Component Test → fc.commands → @xstate/test → Event invariants
```

| Tier | 本番設計 (strict-refactoring) | テスト (verify) | 備考 |
|---|---|---|---|
| A | useState 直書き | Component Test | Pending 不要 |
| **B** | **Pending Object Pattern** | **fc.commands** (Pending 直接) | 新規機能デフォルト |
| **C** | **State Machine** | @xstate/test or fc.commands | 昇格時 |
| D | Event Sourcing | Event invariants | canvas/realtime |

### React 文脈の Pending Object

useReducer + discriminated Action + **precondition 関数を export**:

```ts
// src/features/beat/reducer.ts
export type State = { status: "draft" | "editing" | "saved", content: string, dirty: boolean }
export type Action =
  | { type: "TYPE"; text: string }
  | { type: "SAVE" }
  | { type: "DISCARD" }

// 【必須】 test が再利用するため export
export const actionPreconditions: Record<Action["type"], (s: State) => boolean> = {
  TYPE:    (s) => s.status !== "saved",
  SAVE:    (s) => s.dirty && s.status === "editing",
  DISCARD: (s) => s.dirty,
}

export function reducer(state: State, action: Action): State {
  if (!actionPreconditions[action.type](state)) {
    throw new Error(`Invalid transition: ${action.type}`)
  }
  switch (action.type) { /* ... */ }
}
```

### fc.commands が Pending を再利用

```ts
import { actionPreconditions, reducer, type State } from "../reducer"

class TypeCommand implements fc.Command<State, State> {
  constructor(readonly text: string) {}
  check(m: Readonly<State>) { return actionPreconditions.TYPE(m) }  // ← 本番と共有
  run(m: State, r: State) {
    const next = reducer(m, { type: "TYPE", text: this.text })
    Object.assign(m, next); Object.assign(r, next)
  }
}
```

**核心**: precondition 1 箇所 → production bug も test bug も同時検出 → drift しない。

---

## Tier 分類 (3 軸スコア)

AST スコアリングは `machine-generator.md` Stage 2 参照。採点の軸:

- **Route Complexity**: layout_depth + dynamic_segments + middleware_guards×2 + boundaries
- **UI State Count**: useState + useReducer×2 + zustand_stores×3 + conditional_render
- **Interaction Complexity**: handlers + server_actions×1.5 + websocket×10 + canvas×15

| max score | Tier | 生成形式 | XState 依存 |
|---|---|---|---|
| 0-2 | A | Component Test | なし |
| 3-8 | B | fc.commands (Pending Object 直接) | なし |
| 9-20 | C | XState + @xstate/test | devDependencies |
| 21+ | D | Event Sourcing harness | なし |

escalation: 境界値 ±1 は上位 Tier。

---

## Tier C: XState の最小例 (test-only)

```ts
// .takumi/machines/checkout/machine.ts
import { createMachine } from "xstate"

export const checkoutMachine = createMachine({
  id: "checkout",
  initial: "cart",
  states: {
    cart:     { on: { CHECKOUT: { target: "shipping", guard: "hasItems" } } },
    shipping: { on: { SUBMIT: "payment", BACK: "cart" } },
    payment:  {
      initial: "idle",
      states: {
        idle: { on: { PAY: "processing" } },
        processing: { on: { SUCCESS: "#checkout.done", FAIL: "failed" } },
        failed: { on: { RETRY: "idle" } }
      },
      on: { BACK: "shipping" }
    },
    done: { type: "final" }
  }
})
```

→ production の checkout は **XState を知らない**。useState / Zustand など何でも OK。
machine は @xstate/test が本物の画面を叩くときの **期待挙動の台本**(英語で *oracle*)。

---

## Tier D: Event Sourcing 骨子

状態列挙を諦めて **任意の event 列に対する不変条件** を assert:

```ts
type Event = { type: "INSERT", ... } | { type: "DELETE", ... } | ...

fc.assert(fc.property(fc.array(eventArb, { maxLength: 200 }), (events) => {
  const state = events.reduce(applyEvent, initialState)
  // 不変条件:
  expect(state.items.every((x) => x.x >= 0)).toBe(true)        // 範囲
  expect(new Set(state.items.map(i => i.id)).size).toBe(state.items.length)  // uniqueness
  expect(events.reduce(applyEvent, initialState)).toEqual(state)  // determinism
}), { numRuns: 500 })
```

CRDT/collab は追加で順序独立性・合流可換性も assert。

---

## Tier 昇格 (strict-refactoring 協調)

| 昇格 | 条件 | アクション |
|---|---|---|
| A → B | state > 2 or handlers > 3 | strict-refactoring で Pending Object 移行 + verify で fc.commands 生成 |
| B → C | state > 8 or guards > 3 or parallel 必要 | strict-refactoring で State Machine 移行 + verify で @xstate/test 生成 |
| C → D | state > 20 or websocket/canvas | Event Sourcing へ rewrite |

### 安全装置 (differential 並走)

```
1. 既存本番 + test を残す (新版との差分比較の基準にする)
2. 新版本番 + 新形式 test を追加
3. 同入力で両版の最終状態が一致を 1 スプリント確認 (L3 Differential)
4. 差分ゼロ → 旧版削除
```

→ **Tier 昇格 = Differential Testing の機会**。

---

## State 数の限界値

| State 数 | 状況 | アクション |
|---|---|---|
| < 10 | 頭に収まる | OK |
| 10-20 | 複数回読めば | 推奨上限 |
| 20-40 | 図必須 | 分割検討 (parallel/invoke) |
| 40-60 | ベテランもミス | 分割必須 |
| 60-100 | path 生成が遅い | 設計やり直し |
| > 100 | 保守不能 | Tier D へ |

警告シグナル: 遷移イベント > 30 / guard > 10 / テスト実行 > 30 秒 / machine 500 行超。

---

## 3 view 三角測量 (drift 検知)

- **AST**: コードから静的抽出
- **Spec**: intent.md から意図抽出 (optional)
- **Runtime**: E2E / 本番 trace から観測

```
AST ∩ Runtime  → 確信できる遷移
AST \ Runtime  → dead code 候補
Runtime \ AST  → AI 見落とし or 動的 path
Spec \ AST     → 未実装
AST \ Spec     → 意図外 (バグ候補)
```

詳細は `machine-generator.md` Stage 5。

---

## 共有マシンカタログ

各 Tier B+ 画面で繰り返す 4 パターン。`.takumi/machines/shared/` に 1 度書いて invoke:

- **async**: idle / loading / ready / error (fetch や mutation)
- **form**: pristine / editing / validating / submitting / done
- **modal**: closed / open (body disabled during open)
- **list**: filter + sort + paginate + select (parallel)

---

## アンチパターン

| アンチパターン | 正解 |
|---|---|
| 全画面に state machine | Tier A はスキップ、D は Event Sourcing |
| Production で XState 強制 | test-only、devDependencies のみ |
| 1 machine に 50+ states | parallel / invoke / 分割 |
| 見た目 state (サイドバー開閉) を全部入れる | 論理のみ。見た目は smoke E2E |
| 人間が手書き | AI 生成が基本、intent.md は例外対応 |
| 生成した machine に手修正 | 生成物扱い。修正は intent.md 経由 |
| guard 条件 10 超え | state 分割 |
| test 用に別 model を書く | production の Pending Object を再利用 |

---

## 制約

- 各 Tier の生成形式を守る (A: component-test / B: fc.commands / C: XState / D: events)
- XState は Tier C のみ、devDependencies 固定
- Pending Object の precondition 関数は必ず export (test が再利用する)
- machine は生成物、手修正禁止 (修正は intent.md か source 経由)
- 1 machine 40 states を超えたら分割
- 共有マシンを最初に書く
- AST + Runtime の 2 view 検証を pre-commit で回す
