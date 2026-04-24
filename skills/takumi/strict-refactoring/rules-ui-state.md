# /strict-refactoring: UI State Rules (L3)

本 skill (`SKILL.md`) から参照される React/Next.js 特化ルール。`ui_state_model_tier` (A/B/C/D) の設計進化と、各 Tier の契約を記述。`ui-pending-object` profile で主に適用される。

UI state modeling の成熟度と verify skill のテスト archetype は**別軸**。対応表は `verify-contracts.md`。

---

## ui_state_model_tier (4 段階)

| tier | 設計 | 状態数目安 | 典型 UI |
|---|---|---|---|
| **A** | useState 直書き | 0-2 | toggle、単純 modal、static form |
| **B** | **Pending Object** (useReducer + `actionPreconditions` export) | 3-8 | form wizard、editor draft、shopping cart |
| **C** | **State Machine** (XState or plain TS、test-only XState 可) | 9-20 | checkout flow、approval workflow |
| **D** | **Event Sourcing** (`applyEvent` pure function) | 21+ | canvas realtime、undo/redo、audit log |

Tier は AST スコアリングで AI 自動判定される。人間は `.takumi/plans/.../refactor-intent.md` で例外指定のみ。

---

## Tier A: useState 直書き

state が 0-2 個、遷移が単純な場合は useState で OK。

```tsx
function ToggleButton() {
  const [isOpen, setIsOpen] = useState(false);
  return <button onClick={() => setIsOpen(!isOpen)}>{isOpen ? "閉じる" : "開く"}</button>;
}
```

**verify 側**: Component Test (RTL + fc)、`boundary` archetype 主。

**昇格トリガー** (→ Tier B):
- useState が 3 個超
- 状態間の依存関係が発生 (`isOpen` と `selectedId` の整合性等)
- action に相当する handler が 3 種超

---

## Tier B: Pending Object (useReducer + actionPreconditions export)

**新ワークフローの核心 Tier**。`ui-pending-object` profile のデフォルト。

### 実装テンプレート

```tsx
// src/features/note/reducer.ts

export type State =
  | { status: "draft"; content: string }
  | { status: "editing"; content: string; dirty: boolean }
  | { status: "saved"; content: string };

export type Action =
  | { type: "TYPE"; text: string }
  | { type: "SAVE" }
  | { type: "RESET" };

// 【必須 export】verify skill の fc.commands テストがこれを import して再利用する
export const actionPreconditions: Record<Action["type"], (s: State) => boolean> = {
  TYPE: (s) => s.status !== "saved",
  SAVE: (s) => s.status === "editing" && s.dirty,
  RESET: () => true,
};

export function reducer(state: State, action: Action): State {
  if (!actionPreconditions[action.type](state)) {
    throw new Error(`Invalid transition: ${action.type} from ${state.status}`);
  }
  switch (action.type) {
    case "TYPE":
      return { status: "editing", content: action.text, dirty: true };
    case "SAVE":
      return { status: "saved", content: state.content };
    case "RESET":
      return { status: "draft", content: "" };
  }
}
```

```tsx
// src/features/note/NoteEditor.tsx

export function NoteEditor() {
  const [state, dispatch] = useReducer(reducer, { status: "draft", content: "" });
  return (
    <div>
      <textarea value={state.content} onChange={e => dispatch({ type: "TYPE", text: e.target.value })} />
      <button
        onClick={() => dispatch({ type: "SAVE" })}
        disabled={!actionPreconditions["SAVE"](state)}  // precondition を UI disable にも再利用
      >
        保存
      </button>
    </div>
  );
}
```

### Tier B の contract (絶対)

- **`actionPreconditions` を必ず export する** (verify が import する、軍師 判定 "絶対壊せない contract")
- reducer は precondition 違反時に **throw** する (silent ignore 禁止)
- UI の button disable にも同じ precondition を再利用 (drift 防止の副次効果)

### verify との連携

```ts
// tests/note.property.test.ts

import { reducer, actionPreconditions } from "@/features/note/reducer";

const validCommandArb = fc.record({...}).filter(cmd =>
  actionPreconditions[cmd.type](currentState)  // 同じ precondition を再利用
);

test("reducer preserves invariants under random commands", () => {
  fc.assert(fc.property(
    stateArb, fc.commands(validCommandArb),
    (initial, commands) => {
      let s = initial;
      for (const c of commands) s = reducer(s, c);
      // invariants
    }
  ))
})
```

`verify_profile_ref: "state-transition"` が自動選択される (`verify-contracts.md`)。

---

## Tier C: State Machine (promotion heuristic)

以下のいずれかを満たしたら Tier B → C 昇格を提案 (hard rule ではない、promotion heuristic):

- **state 数が 8 を超えた** (discriminated union の variant が 9 種以上)
- **action の precondition 分岐が 3 種類を超えた** (guard 多数化)
- **並行する独立軸が必要** (modal 状態 × main 状態など parallel regions)

### 実装選択肢

XState (推奨、parallel regions / history / invoke 等が必要な場合):
```ts
// src/features/checkout/machine.ts

import { createMachine } from "xstate";

export const checkoutMachine = createMachine({
  id: "checkout",
  initial: "cart",
  states: {
    cart: { on: { CHECKOUT: "shipping" } },
    shipping: { on: { CONFIRM: "payment", BACK: "cart" } },
    payment: { on: { SUCCESS: "completed", FAIL: "shipping" } },
    completed: { type: "final" },
  },
});
```

plain TS (XState を入れたくない場合):
```ts
export type CheckoutState =
  | { status: "cart" }
  | { status: "shipping"; address: Address }
  | { status: "payment"; address: Address; method: PaymentMethod }
  | { status: "completed"; orderId: string };

export const transitions = {
  cart: { CHECKOUT: (s, e) => ({ status: "shipping", address: e.address }) },
  shipping: { CONFIRM: (s, e) => ({ status: "payment", ...s, method: e.method }), BACK: () => ({ status: "cart" }) },
  // ...
} as const;
```

### Tier C の contract

- machine 自体が契約 (XState) or transitions オブジェクトが契約 (plain TS)
- test は production machine / transitions をそのまま import
- `verify_profile_ref: "model"` が自動選択

---

## Tier D: Event Sourcing

以下を満たしたら Tier C → D 昇格を提案:

- **event 数が 20 超**
- **undo / redo が必要**
- **audit log が要件**
- canvas / realtime 系

### 実装テンプレート

```ts
// src/features/timeline/events.ts

export type Event =
  | { type: "NAME_CHANGED"; name: string }
  | { type: "DELETED" }
  | { type: "RESTORED" };

export type Snapshot = { name: string; deleted: boolean };

// 【必須 export】pure 関数、verify が invariants を property test で検証
export function applyEvent(snap: Snapshot, event: Event): Snapshot {
  switch (event.type) {
    case "NAME_CHANGED": return { ...snap, name: event.name };
    case "DELETED": return { ...snap, deleted: true };
    case "RESTORED": return { ...snap, deleted: false };
  }
}

export function replay(events: Event[], initial: Snapshot = { name: "", deleted: false }): Snapshot {
  return events.reduce(applyEvent, initial);
}
```

### Tier D の contract

- `applyEvent` は **pure 関数として export**
- `replay` は左畳み込み、deterministic
- `verify_profile_ref: "model"` + `metamorphic` fallback

---

## Tier graduation フロー

### 1. 昇格条件の検出

AST スコアリングで以下をカウント:
- discriminated union の variant 数
- `actionPreconditions` の guard 関数数
- parallel state の有無 (XState 的な要件)

### 2. 提案 (tier_graduation_proposed event)

```yaml
tier_graduation_proposed:
  task_id: T-042
  from: "B"
  to: "C"
  reasons:
    - "state 数が 10 に達した"
    - "guard 条件が 4 種あり"
  effort_estimate: "2-4h"
  risk: "medium"
```

### 3. 人間承認 → tier_graduated event emit

### 4. verify 側の差分テスト並走 (L3 Differential)

既存 Pending Object と新 State Machine の出力が一致するか 1 スプリント確認してから旧版削除。
verify skill の `differential.md` (in-repo 2-export パターン) を参照。

---

## 制約・反則行為

- **actionPreconditions を export しない** → Tier B contract 違反 (絶対禁止)
- **test 側で precondition を再定義** → drift の元 (禁止)
- **reducer で silent ignore** (precondition 違反時に throw しない) → 禁止
- **AI が自信を持てない遷移を黙って生成** → `rules-ui-state.md` の該当箇所にコメントで明示
- **1 machine で 40 states 超** → 分割必須 (Tier D 検討)
- **手動で XState machine を修正** → `.takumi/machines/` 配下は AI 生成、手修正禁止 (intent.md 経由で例外指定)

---

## Go / Rust / Python での扱い

UI state modeling は React/Next.js 特化。他言語では:

- Go: state machine を `switch` で書く、precondition を関数に抽出して `export` (package export)
- Rust: `enum` + `match` で表現、typestate pattern 活用、precondition は method として `impl` に
- Python: `Enum` + `match` (3.10+)、precondition は module-level 関数として `__all__` に export

`ui_state_model_tier` field は null で埋める (`rules-ui-state.md` は non-applicable)。

---

## 関連リソース

| file | 用途 |
|---|---|
| `SKILL.md` (同ディレクトリ) | 本 skill entry point |
| `rules-core.md` (同ディレクトリ) | L1 / L2 / L3 の目次 |
| `rules-required.md` (同ディレクトリ) | L1 required invariants 5 個 |
| `rules-heuristics.md` (同ディレクトリ) | L2 default heuristics 16 個 |
| `verify-contracts.md` (同ディレクトリ) | Tier → verify archetype 対応、actionPreconditions contract 詳細 |
| `profiles.md` (同ディレクトリ) | ui-pending-object profile 詳細 |
| `review-checklist.md` (同ディレクトリ) | Tier B/C/D の contract 評価 |
| `../verify/model-based.md` | fc.commands / @xstate/test 詳細 |
