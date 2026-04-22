# Model-Based Testing + Differential (verify skill 内部参照 / Layer 3)

**状態機械化は全画面のためではない**。Tier 分類して戦略を変える。
**XState は production 依存にしない** — テストの devDependencies のみ、opt-in。

---

## 核心の前提 (実測で裏付け)

**reducer 化 = drift 防止のレバー。bug 検出力・速度・shrink は別レバー**。

実測 (TS adapter / dispatch 系 unit での検証):
- reducer 未導入の baseline で既に **mutant kill ~95%**、precondition 反例 median **1 op**
- `check()` が全部 `return true`、`run()` 内 no-op あり、oracle 手複写ありでも 95% 取れる
- 理由: **example test + structural invariant が category 別に網羅されていれば mutation は止まる**

主レバーは 4 点 (reducer 化ではない):
1. **production-exported preconditions を oracle で共有** — 手複写を避けて drift を殺す
2. **`run()` 内 no-op 禁止** — shrink を生かす
3. **structural invariant** — count-only を避け ownership/order/scope/idempotence を混ぜる
4. **harness cost control** — setup コスト、numRuns、seed 固定

reducer 化 (pure transition spec 分離) は長期保守 (仕様変更時の drift 回帰検出) のためのもので、目先の kill rate は上がらない。

---

## 思想

60 点の落とし穴:
- 全画面を state machine 化 → 破綻
- XState を production に強制 → vendor lock-in
- 「画面数 = 状態数」の誤解 → スケールしない
- **reducer 化すれば bug 検出力が上がると期待** → 実測で否定済み

推奨設計:
1. Tier A-D で戦略を切替 (AST スコアリングで自動判定)
2. Tier B のデフォルトは fast-check commands (plain TS、依存ゼロ)
3. Tier C のみ XState (test-only、devDependencies)
4. 画面 95% は XState 不要
5. AI が machine を生成 (AST + Runtime 三角測量 → `machine-generator.md`)
6. 本節「核心の前提」の 4 レバーを先に効かせる、reducer 化はその上の drift 防止

---

## When not to use this

Tier B (fc.commands / model-based) は以下の対象には **そのまま適用しない**:
- 並行・時間依存・外部順序保証が本質 (queue claim race、websocket 競合など)。sequential model が本質的にバグを射程外にする
- DB 制約・transaction が本体 (repository 系) → `machine spec + invariant catalog` に留め、Pending Object を本番に押し込まない
- 外部 API / 副作用が assertion の主対象 → L5 smoke E2E または L6 AI Review

これらは別 plan / 別 layer で扱う。

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

境界値 ±1 は上位 Tier にエスカレート。

### strict-refactoring との連動

```
state: 0-2    →    3-8    →    9-20    →    21+
本番: useState直書き → Pending Object → State Machine → Event Sourcing
テスト: Component Test → fc.commands → @xstate/test → Event invariants
```

---

## 軸 A: Authoritative Transition Spec

**pure transitions module を 1 箇所に置き、oracle も本番 adapter も同じ spec を import する**。

### 構成要素 (pure module)

```ts
// src/features/beat/transitions.ts (pure、IO ゼロ)
export type State = { status: "draft" | "editing" | "saved", content: string, dirty: boolean }
export type Action =
  | { type: "TYPE"; text: string }
  | { type: "SAVE" }
  | { type: "DISCARD" }

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
// 必要なら planEffects(prev, action, next): Effect[] も export (effect は記述のみ、実行は adapter)
```

### fc.commands が pure spec を共有

```ts
import { actionPreconditions, reducer, type State } from "../transitions"

class TypeCommand implements fc.Command<State, State> {
  constructor(readonly text: string) {}
  check(m: Readonly<State>) { return actionPreconditions.TYPE(m) }  // ← 本番と共有
  run(m: State, r: State) {
    const next = reducer(m, { type: "TYPE", text: this.text })     // ← oracle も本番と共有
    Object.assign(m, next); Object.assign(r, next)
  }
}
```

### pure transition + effect adapter 分離 (side effect 責務分離)

**reducer に telemetry / DOM API / console / DB I/O を混ぜない**。adapter が reducer を wrap して、`planEffects` の出力を実行する。store library (Zustand / Redux / Jotai / vanilla) は adapter 側に閉じ込め、**transitions.ts は store/framework 非依存** に保つ。

### 軸 A の厳守ルール

- **`check()` = `return true` 禁止** — 必ず本番 `preconditions` を呼ぶ
- **`run()` 内 no-op 禁止** — `if (...) return` で SUT を触らない分岐を置かない。`check()` で弾ける
- **oracle を手複写しない** — 本番 `reducer` を oracle としても import する
- **deprecated shim / no-op 契約は adapter 側で変換** — 既存呼び出し側を壊す throw 化は禁止

### 参考構造 (dispatch adapter の refactor 例)

- `src/lib/<domain>/transitions.ts` — pure spec (200 行前後)
- `src/lib/<domain>/registry.ts` — adapter (200 行前後、dispatch CC 13 → 4)

---

## 軸 B: Machine Topology Budget

### 命名は USS 準拠 (`spec-tests.md` に従う)

test file は `{module}.test.ts` のみ。`.pbt.test.ts` / `.model.test.ts` / `.commands.test.ts` 等の **layer 接尾辞は禁止**。fc.commands / property / metamorphic / differential は **同一 test file の `it()` 内部** で混在させる。詳細は `verify/spec-tests.md` 第 2 節 (禁止ファイル名) 参照。

### 400 行 hard limit (test file)

単一 test file は **≤ 400 行**。超えたら layer で割るのではなく、**対象 module (unit) 自体を責務境界で分割**し、それぞれ `{new-module}.test.ts` を持たせる。8 行超過でも分割推奨 (430 → 460 へ滑る)。

例: `registry.ts` の keyboard dispatch と combo formatting が 1 file で 400 行超 → `format-combo.ts` を別 module に切り出して `format-combo.test.ts` を新設 (接尾辞での分離ではなく module 分離)。

**分割時の注意**: 既存の targeted property (特定 bug を刺す narrow test) は大枠 model-based に subsumed されていても独立した bug-catching 価値を持つ。削除前に `compression.md` の判定フロー (subsumption / zero-contribution / spec-density) で個別評価する。

### machines catalog 昇格条件

`src/test/machines/{feature}.ts` に Command / Invariant を抽出するのは **以下のどちらかを満たす時のみ**:
- 2 suite 以上で使われる
- unit (fc.commands) と e2e (Playwright) の両方で同じ op 語彙を叩く

単一 suite での使用は local 定義に留める。catalog file は 200 行以下。

### phase machine (状態爆発対策)

state 数ではなく **command surface と guard 数** で導入判定する:
- command 6 個超、guard 3 個超、または relation 積で候補状態が膨らむ → phase machine
- `create phase → link phase → delete phase` のように command 集合を切り替え、各 phase は独立した fc.commands で走らせる

昇格条件を満たすなら `src/test/machines/shared/` に共有パターン (async: idle/loading/ready/error、form: pristine/editing/validating/submitting/done、modal: closed/open、list: filter+sort+paginate+select) を置いて invoke。

---

## 軸 C: Harness Cost Control

DB なしの harness にも効く一般原則:
- **numRuns / maxCommands は feature size で選定** — 3 フィールド state なら numRuns 20, maxCommands 10、多層グラフは phase 分割
- **seed を固定** — flake を避け、reproducibility を確保
- **setup コストを先に測る** — beforeEach の重さが test 時間の支配項目なら最適化対象
- **setup 削減の典型**: fixture snapshot、transaction rollback、in-memory shadow (pure reducer で済む論理 test は IO を触らない)
- DB を使う場合の例: SQLite の savepoint/rollback で re-seed を回避 (必須ではない、原則は setup 再実行の回避)

---

## Invariant design

count-only (`length === N`) は mutation に弱い。混ぜるべき:
- **ownership**: どの entity が誰に属すか
- **order**: insertion order, LIFO tie-break などの順序性
- **scope consistency**: filter 結果が scope 条件を満たすか
- **idempotence**: 二重実行で状態が変わらないか

count だけでは「JSON 内容の破壊」「sort_order の崩れ」「別 row への誤接続」などが survive する。

---

## Measurement protocol

model-based 戦略の効果測定に使う 3 指標:

| 指標 | 測り方 | 目安 (hard target ではない) |
|---|---|---|
| kill rate | seeded mutant 20 個を本番に埋め込み、test が kill する割合 | ≥ 19/20 |
| 反例 op 数 | precondition mutant 検出時の fast-check counterexample の command 列長、median | ≤ 6 op |
| runtime median | 対象 test file 単独実行の wall-clock real time、5 回 median | baseline 比 +5% 以内 or 短縮 |

seeded mutant の基本分布 (20 個):
- precondition 系 10-12 個 (edge guard / scope チェック反転)
- guard 系 4-5 個 (一般 `if` 条件反転)
- fallback 系 2-3 個 (`??` デフォルト値変更)
- edge 系 1-2 個 (`>=` → `>` 等の境界)

---

## LOC budget

既存 adapter file は refactor 前比 **+15% 以内** (hard gate)、新設 pure-spec module は **別 budget で 200 行前後を目安** (単機能・責務限定)、合計 LOC は参考値のみ。新設を無制限にすると膨張を正当化するので避ける。

---

## Tier 昇格と State 数の限界

| 昇格 | 条件 | アクション |
|---|---|---|
| A → B | state > 2 or handlers > 3 | Pending Object + fc.commands |
| B → C | state > 8 or guards > 3 or parallel 必要 | State Machine + @xstate/test |
| C → D | state > 20 or websocket/canvas | Event Sourcing へ rewrite |

state 数の目安: **< 10 OK / 10-20 推奨上限 / 20-40 分割検討 / 40-60 分割必須 / > 60 設計やり直し**。警告シグナル: 遷移 > 30 / guard > 10 / test 実行 > 30s / machine 500 行超。

**Tier 昇格は Differential Testing の機会**: 旧版 + 新版を並走させ、同入力で最終状態一致を 1 スプリント確認 (L3 Differential)、差分ゼロで旧版削除。

---

## Tier C / Tier D の骨子

- **Tier C (XState、test-only)**: `createMachine({ id, initial, states: { ... } })` を `.takumi/machines/{feature}/machine.ts` に置き、@xstate/test が本物の画面を叩く **期待挙動の台本 (oracle)**。production は XState を知らない。具体例は `machine-generator.md` 参照
- **Tier D (Event Sourcing)**: state 列挙を諦めて event 列に対する **不変条件** を assert (`events.reduce(applyEvent, initial)` の範囲・uniqueness・determinism)。CRDT/collab は順序独立性・合流可換性も

---

## 3 view 三角測量 (drift 検知)

**AST** (静的) / **Spec** (intent.md、optional) / **Runtime** (E2E・本番 trace) の 3 面で遷移を照合: AST ∩ Runtime = 確信できる遷移、AST \ Runtime = dead code、Runtime \ AST = AI 見落とし、Spec \ AST = 未実装、AST \ Spec = 意図外バグ候補。詳細は `machine-generator.md` Stage 5。

---

## アンチパターン

| アンチパターン | 正解 |
|---|---|
| 全画面に state machine | Tier A はスキップ、D は Event Sourcing |
| Production で XState 強制 | test-only、devDependencies のみ |
| 本番 reducer / precondition を oracle で手複写 | pure spec を import 共有 |
| `check()` が `return true` / run() 内に no-op 早期 return | preconditions を呼ぶ、check で弾く |
| count-only invariant | ownership / order / scope / idempotence を混ぜる |
| reducer 化だけで bug 検出力改善を期待 | 主レバーは 4 点 (核心の前提)、reducer は drift 防止 |
| 単一 suite で machines catalog 昇格 | 2 suite 以上 or unit/e2e 両用で昇格 |
| repository 系に Pending Object を強要 | machine spec + invariant catalog に留める |

---

## Lint

**主**: ESLint custom rule で `fc.Command` / `fc.AsyncCommand` の `check()` が `return true` / `Promise.resolve(true)` を禁止。**補助**: `run()` 内で SUT を触らない `if (...) return` 分岐を検出 (review checklist 併用、idempotent 契約は除外)。ast-grep は補助。

---

## 参考 (TS dispatch adapter unit での実測傾向)

軸 A (preconditions 共有 + run no-op 禁止 + structural invariant) を適用した時の典型値:

| 指標 | baseline | post |
|---|---|---|
| kill rate | 19/20 | **20/20** (最後の 1 mutant は example test 1 本で kill) |
| 反例 op 数 median | 1 op | 1 op |
| runtime median | 0.83s | 0.52s (**-38%**) |
| dispatch CC | 13 | 4 |

**これは hard target ではなく、手法が機能することを示す例**。feature size が違う project では数値が変動する。

---

## 制約

- **核心の前提 4 レバー** を先に効かせる (preconditions 共有、run no-op 禁止、structural invariant、harness cost)
- 各 Tier の生成形式を守る (A: component-test / B: fc.commands / C: XState / D: events)
- XState は Tier C のみ、devDependencies 固定
- Pending Object の precondition 関数は必ず export (test が再利用する)
- `check() = return true` 禁止、`run()` 内 no-op 禁止
- 既存 adapter file は refactor 前比 +15% 以内、新設 pure-spec module は 200 行前後
- 命名は USS 準拠 (`{module}.test.ts` のみ、接尾辞禁止、詳細は `verify/spec-tests.md`)
- 単一 test file ≤ 400 行 hard limit、超えたら module 分割で対処
- 2 suite 以上 or unit/e2e 両用で machines catalog 昇格
- AST + Runtime の 2 view 検証を pre-commit で回す
- 並行・時間依存が本質の対象は Tier B 適用外、別 layer で扱う
