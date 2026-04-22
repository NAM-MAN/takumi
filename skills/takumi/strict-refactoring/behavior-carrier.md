# Behavior Carrier — Rules 19 / 21 / 17-D 実装 recipe

`rules-heuristics.md` の **Rule 19 (Subject Owns Verbs) / Rule 21 (Behavior Carrier Selection) / Rule 17-D (dispatch 判断フロー)** を実運用に落とす recipe。`immutable-first.md` が **how to write statements** なら、本 md は **how to structure operations** (操作を関数 / class / hook のどれに載せるか)。

境界ケースを**敵対レビュー**で検証した最終版。

---

## 1. Rule 19 — Subject Owns Verbs (aggregate method 許可条件)

`Y.doX()` method を許可するのは Y が X の**不変条件・状態遷移を所有**する場合のみ。

### 許可 / 禁止 の線引き

**許可例 (Y が invariant を所有)**:
- `order.validate()` — Order の business rule 検査
- `cart.addItem(product)` — Cart の state transition、item 追加時の重複 / 上限 invariant 守る
- `money.add(other)` — 通貨チェック等の invariant ありの演算
- `draftRingi.submit(repo, clock)` — Rule 15 準拠、外部依存は method arg 注入

**禁止例 (Y が boundary を持たない or 越境)**:
- ❌ `order.save()` — persistence は境界、Order が repository に依存したら**越境**
- ❌ `user.sendEmail()` — transport は境界
- ❌ `order.loadFromDb()` — I/O は境界
- ❌ `invoice.print()` — 出力は外部 device、domain aggregate の責務ではない

### 解決パターン (persistence/transport/I/O の外出し)

```ts
// ❌ NG: aggregate が repo を握る
class Order {
  save(db: Database) { db.prepare(...).run(...) }  // 越境
}
order.save(db)

// ✅ OK: persistence は repository (Rule 21 EXC2)
class Order {
  validate() { /* invariant check only */ }
}
class OrderRepository {
  constructor(db?: Database) { this.db = db ?? defaultDb() }
  save(order: Order) { /* this.db */ }
}
const repo = new OrderRepository(defaultDb())
repo.save(order)  // ← SV は失うが主語が違うだけ (Order vs OrderRepository)
```

### scope: layer-local consistency

Rule 19 は **1 layer 内** での carrier 一貫性を求める。cross-layer boundary crossing は問題ない:

```ts
// これは違反ではない (3 layer で 3 carrier 使用)
function useOrderSubmit() {               // EXC4 (hook layer)
  return useMutation(async (order) => {
    const validated = validateOrder(order)  // default function (app layer)
    validated.markSubmitted()               // EXC1 (domain layer)
    await orderRepo.save(validated)          // EXC2 (infra layer)
  })
}
```

layer 境界は mixing を許容するポイント。violating は**同一 layer 内での carrier ブレ** (例: repository layer の半分が class、半分が function)。

---

## 2. Rule 21 — Behavior Carrier Selection (決定木)

### 決定木

```
'do X to Y' 操作 (新規コード):

Q1. Y 自身が X の不変条件・状態遷移を所有するか?
    (persistence/transport/I/O は除外)
    Yes → EXC1: Y.doX() aggregate method (Rule 19)
    No  → Q2

Q2. X は純関数 (外部依存なし)?
    Yes → default: export function doX(y)
    No  → Q3

Q3. 複数の関連 method が同じ stable dependency set を共有、
    deps が call ごとに不変か?
    Yes → EXC2: class XxxRepository + constructor DI
    No  → Q4

Q4. X に method ごとの polymorphism / strategy / command が本質的に必要?
    Yes → EXC3: interface + 複数 impl
    No  → Q5

Q5. UI state + framework lifecycle (React render 等) に結合?
    Yes → EXC4: const { save } = useXxx()
    No  → default function with explicit deps: doX(y, deps)

Default (どれにも該当しない): Q2 の export function。class を default にしない。
```

### EXC2 の実装形 — constructor DI with composition root

敵対レビューで判明した罠:

- `constructor(db = getDefaultDb())` は**暗黙 default が test 汚染を隠す**
- default arg は constructor 呼び出しごとに evaluate される (singleton だと危険)

**推奨形**:

```ts
class OrderRepository {
  private db: Database
  constructor(db?: Database) {
    this.db = db ?? defaultDb()  // pure accessor
  }
  save(order: Order) { /* this.db */ }
  findById(id: string) { /* this.db */ }
}

// production (composition root で明示注入、暗黙 default に頼らない)
const repo = new OrderRepository(defaultDb())

// test (必ず明示注入)
const repo = new OrderRepository(inMemoryDb)
```

---

## 3. 境界ケース (敵対レビューで検証済 8 件)

### SC1: `order.save()` vs `repo.save(order)`

**正解**: `repo.save(order)` (EXC2)。 `save` は persistence 境界、Order の invariant ではない。 SV 感性に反するが、**主語が違うだけ** (OrderRepository が save する)。

### SC2: `interface PaymentMethod` (EXC3) vs `new PaymentRepository().charge(method)` (EXC2)

method ごとに**ロジック・失敗モード・契約が異なる** → **EXC3 (interface + CreditCard/Wallet impl)**。 `repository.charge(method)` で分岐は domain switch 焼き直し → **Rule 3 違反**。

### SC3: deps が 3-5 個に増えた場合

**deps 数では判定しない**。shared stable dependency set + deps が call ごとに不変 → EXC2 昇格、それ以外は Parameter Object (Rule 7) で `saveOrder(order, deps)`。

### SC4: cross-layer mixing (EXC4 → function → EXC1)

**違反ではない**。Rule 19 は **layer-local consistency**、境界分離は許容。

### SC5: 単発 side effect (Email 送信)

- `sendEmail(message)` — **基本形** (default function)
- `new EmailMessage(message).send()` — **間違い** (message は送信手段を所有しない)
- `new EmailSender().send(message)` — SMTP client 等を**複数 method で共有**するときだけ EXC2

### SC6: closure factory `makeHandlers({ requestId, userId })`

**許容**: **request-scoped context binding** は class より closure が自然。
**禁止**: `makeYOps(db)` が `class XxxRepository` と**等価な constructor DI の焼き直し**の場合のみ。

### SC7: 既存 `XxxService.doX()` が多用された codebase

**grandfathered, no new debt** — 既存は触る箇所だけ opportunistic migration、新規は Rule 21 適用、rename-only PR 禁止。

### SC8: 既に layer-consistent な codebase での扱い

repository 層 = 全て procedural、domain 層 = class method という layer-consistent な codebase では Rule 19/21 による**refactor target がゼロ**になることが多い。その場合、本 rule は **documentation rule** として機能 (新規追加や新規 contributor 向けの policy)、refactor trigger は持たせない。

---

## 4. Rule 17-D — Dispatch 判断フロー

`switch` / `if-else chain on literal` を見つけたら、以下の 4 択から選ぶ:

```
switch / if-else chain on literal key を見つけたら:
├─ 1. ドメイン層? → L1 Rule 3 (hard): interface + class 必須
├─ 2. 分岐値が純粋データ (method なし、関数呼び出しなし)? → dispatch table (Record<K,T>)
├─ 3. 単一メソッド dispatch で N ≤ 8? → **switch + never default を keep** (NEW)
└─ 4. 多メソッド handler (validate/run/rollback 等) or N > 8? → interface + class (domain 外でも推奨)
```

### 選択肢比較 (6-case switch 規模の dispatch を想定)

| 選択肢 | LoC | 型安全 | 可読性 | 拡張性 |
|---|---|---|---|---|
| **switch + never default** (keep) | 20 | ✓ exhaustive check | ◎ self-documenting | ○ 1 line |
| **dispatch table (Record)** | 16 | △ payload 型 erase、`as never` cast 必要 | △ | ○ 1 line |
| **interface + class** | ~36 | ✓ fully typed | ○ | ○ class + map |

### Key Insight

**TypeScript の `switch + never default` は既に "dispatch table 級" の type safety** を提供する (exhaustive check, payload 型は generic 推論)。単純 dispatch では**switch が勝つ**ことが多い。

### 判断の実例

- badge / icon / label の static mapping → **dispatch table** (Record<State, Badge>)
- job dispatcher — 6 kinds × 1 method per kind → **switch + never keep**
- domain event handler — OrderPlaced / OrderCancelled / ... × 複数 methods → **interface + class** (Rule 3 適用)
- 機能フラグ付きの策略パターン → **interface + class** (behavior variation)

---

## 5. 禁止事項と Migration

### default として新設禁止

- ❌ `XxxService.doX()` / `XxxHandler.handle()` — 主語・責務曖昧
- ❌ 1-method `XxxExecutor.execute()` で多相性要件なし — ceremony のみ (関数で等価)
- ❌ constructor DI の焼き直し closure factory `makeYOps(db)` (request-scoped は OK)

### 既存コードの migration policy

**grandfathered, no new debt**:
- 既存 `XxxService` / `XxxHandler` / 1-method Executor は **opportunistic migration** (触る箇所だけ)
- **新規コードは Rule 21 適用**
- **rename-only PR 禁止**、意味変更時に同時移行
- 既存コードを一括書き換えする refactor PR は出さない (事故の元)

---

## 6. 既存 Rule との関係 (依存グラフ)

```
L1 Rule 3 (domain switch 禁止 → polymorphism)
   ↓ 多相性要と判定されたら
L2 Rule 21 EXC3 (interface + impl) が carrier を選択

L2 Rule 12 (Repository = Aggregate Root unit)
   ↓ 具体 form
L2 Rule 21 EXC2 (class + constructor DI)

L2 Rule 15 (External Resource は method arg)
   ↓ 主に
L2 Rule 21 EXC1 (aggregate method の外部依存注入)
   Rule 21 EXC2 は constructor DI で逆、両方 coexist

L2 Rule 19 (Subject Owns Verbs)
   Rule 21 EXC1 の許可条件を規定
```

既存 Rule に反することはない、**補完関係**。

---

## 関連リソース

| file | 用途 |
|---|---|
| `smd.md` (同ディレクトリ) | Rule 16 (macro Surface Minimization) の recipe |
| `immutable-first.md` (同ディレクトリ) | Rule 17/18/20 の "how to write statements" recipe |
| `rules-heuristics.md` (同ディレクトリ) | 16 L2 heuristics の目次 |
| `rules-required.md` (同ディレクトリ) | L1 Rule 3 (ドメイン層 switch 禁止) |
