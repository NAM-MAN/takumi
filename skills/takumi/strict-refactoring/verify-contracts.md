# /strict-refactoring × verify 契約

本 skill (`SKILL.md`) から参照される補助ドキュメント。strict-refactoring の Tier と verify skill の archetype は**別軸**だが、新ワークフローでは両者に対応関係がある。軍師 最終判定「新ワークフローで絶対に壊すべきでない contract」もここに集約。

## なぜ別軸なのか

- **Tier A-D** は React/Next.js の UI state modeling 成熟度 (production 側の設計進化)
- **verify archetype** (state-transition / boundary / property / model / metamorphic) はテスト生成の方法論

意味空間が違うので 1 対 1 対応ではない。ただし両者を繋げる薄いマッピングを持つと、`/takumi` が自動判定できる。

---

## Tier → verify archetype 対応表

| ui_state_model_tier | 主 archetype | 補助 archetype | 理由 |
|---|---|---|---|
| **A** (useState 直書き) | boundary | property | 入力境界と不変条件を Component Test + fc で拾う |
| **B** (Pending Object) | **state-transition** | model | precondition を fc.commands で再利用、遷移網羅 |
| **C** (State Machine) | model | differential | XState machine を契約として、旧実装との差分検証 |
| **D** (Event Sourcing) | model | metamorphic | event invariants + 同義書き換え不変性 |

`/takumi` はこの表を使って `verify_profile_ref` を自動補完する:
- `ui_state_model_tier: "B"` の task → `verify_profile_ref: "state-transition"` (+ `model` を fallback layer)

## Tier B の核心 contract: `actionPreconditions` 共有

軍師 判定「絶対に壊すべきでない contract」:

> **`actionPreconditions` など production 側の遷移前提を verify が同じ実体として再利用できること。これが壊れると、設計とテストが再び drift する。**

### 仕組み

```ts
// src/features/note/reducer.ts (production)

export type State = { status: "draft" | "editing" | "saved", content: string, dirty: boolean }
export type Action =
  | { type: "TYPE"; text: string }
  | { type: "SAVE" }

// 【必須 export】verify の fc.commands がこれを import して再利用
export const actionPreconditions: Record<Action["type"], (s: State) => boolean> = {
  TYPE: (s) => s.status !== "saved",
  SAVE: (s) => s.dirty && s.status === "editing",
}

export function reducer(state: State, action: Action): State {
  if (!actionPreconditions[action.type](state)) {
    throw new Error(`Invalid transition: ${action.type}`)
  }
  switch (action.type) {
    case "TYPE": return { ...state, content: action.text, dirty: true }
    case "SAVE": return { ...state, status: "saved", dirty: false }
  }
}
```

```ts
// tests/note.property.test.ts (verify 側、同じ precondition を import)

import { reducer, actionPreconditions, type State, type Action } from "@/features/note/reducer"

const stateArb = fc.record({...})
const typeCmd = fc.record({ text: fc.string() }).map(x => ({ type: "TYPE", ...x } as Action))
const saveCmd = fc.constant({ type: "SAVE" } as Action)

test("reducer satisfies action preconditions", () => {
  fc.assert(fc.property(
    stateArb,
    fc.commands([typeCmd, saveCmd]).filter(c => actionPreconditions[c.type]),  // 再利用
    (state, commands) => {
      let s = state
      for (const c of commands) s = reducer(s, c)
      // invariants check
    }
  ))
})
```

**同一の `actionPreconditions` を production と test が共有**。precondition を変更したら両方に反映、drift しない。

### 違反パターン (絶対禁止)

- `actionPreconditions` を export しない (内部実装)
- test 側で precondition を再定義 (drift の元)
- production 側で actionPreconditions 経由でなく直接 if 文で判定

## Tier C の契約: machine 自体を共有

```ts
// src/features/checkout/machine.ts

import { createMachine } from "xstate"

export const checkoutMachine = createMachine({
  id: "checkout",
  initial: "cart",
  states: {
    cart: { on: { CHECKOUT: "shipping" } },
    shipping: { on: { CONFIRM: "payment", BACK: "cart" } },
    payment: { on: { SUCCESS: "completed", FAIL: "shipping" } },
    completed: { type: "final" },
  },
})
```

```ts
// tests/checkout.model.test.ts (@xstate/test)

import { checkoutMachine } from "@/features/checkout/machine"

const model = createTestModel(checkoutMachine)
model.getPlans().forEach(plan => {
  test(plan.description, () => plan.paths.forEach(path => path.test()))
})
```

**machine 自体が契約**。XState の test 用 model は production machine をそのまま使う。

## Tier D の契約: `applyEvent` pure function

```ts
// src/features/timeline/events.ts

export type Event = { type: "NAME_CHANGED"; name: string } | { type: "DELETED" }
export type Snapshot = { name: string; deleted: boolean }

// 【必須 export】pure 関数、verify が invariants を property test で検証
export function applyEvent(snap: Snapshot, event: Event): Snapshot {
  switch (event.type) {
    case "NAME_CHANGED": return { ...snap, name: event.name }
    case "DELETED": return { ...snap, deleted: true }
  }
}
```

```ts
// tests/timeline.invariant.test.ts

import { applyEvent } from "@/features/timeline/events"

test("applyEvent is deterministic", () => {
  fc.assert(fc.property(
    snapshotArb,
    fc.array(eventArb),
    (initial, events) => {
      const a = events.reduce(applyEvent, initial)
      const b = events.reduce(applyEvent, initial)
      expect(a).toEqual(b)
    }
  ))
})
```

**event 列の再生が deterministic**、左畳み込みで同じ結果。この contract を verify が property で保証する。

---

## `verify_contract_satisfied` telemetry event

職人 が実装完了時に、Tier B/C/D の contract が満たされているかを判定して emit:

```json
{
  "ts": "2025-01-01T12:00:00Z",
  "event": "verify_contract_satisfied",
  "task_id": "T-042",
  "ui_state_model_tier": "B",
  "contract": "actionPreconditions",
  "satisfied": true,
  "details": {
    "production_export": true,
    "test_import": true,
    "drift_detected": false
  }
}
```

`satisfied: false` が続いたら Tier 昇格または contract 違反として `refactor_review_completed` に含めて報告。

---

## Go / Rust / Python での扱い

Tier A-D は React/Next.js 特化なので、他言語では**直接 verify archetype を選ぶ**:

- Go backend: `verify_profile_ref` を `state-transition` / `property` / `boundary` から直接選定
- Rust: 型システムで precondition が強制されるケースが多いので、`actionPreconditions` 相当は不要。verify は `property` 中心
- Python: `enum` + `match` で precondition を表現、verify 側で同じ enum を import して再利用 (TypeScript と同じ思想)

`ui_state_model_tier` field は null で埋める。

---

## 関連リソース

| file | 用途 |
|---|---|
| `SKILL.md` (同ディレクトリ) | 本 skill entry point |
| `rules-ui-state.md` (同ディレクトリ) | Tier A-D の設計詳細 |
| `profiles.md` (同ディレクトリ) | refactor_profile 選定、ui-pending-object で参照 |
| `~/.claude/skills/takumi/verify/README.md` | L1-L6、recipe library |
| `~/.claude/skills/takumi/verify/model-based.md` | fc.commands / @xstate/test 詳細 |
| `~/.claude/skills/takumi/test-strategy.md` | AC-ID → verify_profile_ref 選定 |
| `~/.claude/skills/takumi/telemetry-spec.md` | `verify_contract_satisfied` event |
