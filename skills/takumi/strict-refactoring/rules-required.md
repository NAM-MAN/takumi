# strict-refactoring: Required Invariants (L1)

本 skill (`SKILL.md`) から参照される Level 1 の必須不変条件 (5 個)。profile を問わず全 project で hard gate 扱い。L2 heuristics は `rules-heuristics.md`、UI state は `rules-ui-state.md`。

---


**絶対に守る基本制約**。profile によっては soft warning に降格することもあるが、`domain-strict` と `ui-pending-object` では必ず hard。

### 1. 3 分類 (Command / Pure / ReadModel)

すべてのクラス / 関数はこの 3 つのいずれかに分類する:

| 分類 | 定義 | 副作用 |
|------|------|:------:|
| Command | 永続化・外部通信 | あり |
| Pure | 型変換・計算・判定 | なし |
| ReadModel | 読み取り専用取得 | なし |

**判断フロー**:
- 永続化 or 外部通信あり?
  - 書き込み → **Command**
  - 読み取り → **ReadModel**
- いずれでもない → **Pure**

**骨格**:
```typescript
// Command: 永続化 + 副作用
class DraftOrder {
  submit(repo: OrderRepository): SubmittedOrder { /* ... */ }
}

// Pure: 計算のみ、DI なし
class OrderValidator {
  validate(order: Order): Result<Order, ValidationError> { /* ... */ }
}

// ReadModel: 取得のみ
class OrderListReader {
  listByCustomer(id: CustomerId): OrderSummary[] { /* ... */ }
}
```

### 2. 完全コンストラクタ

オブジェクトは生成時点で**完全に有効な状態**にする。後から setter で段階的に詰めない。

```typescript
// NG
const order = new Order();
order.customerId = "xxx";
order.items = [...];

// OK
class Order {
  constructor(private data: OrderData) {
    if (!data.customerId) throw new Error("customerId is required");
    if (data.items.length === 0) throw new Error("items required");
  }
}
```

**骨格**: `new DraftX(id, validatedData)`

### 3. ドメイン層で switch / if-else 分岐禁止

複数のビジネスロジックは **Interface + 実装クラス**で表現する。

```typescript
// NG: switch でビジネスロジック分岐
function calculateDiscount(type: string, amount: number): number {
  switch (type) {
    case "premium": return amount * 0.2;
    case "regular": return amount * 0.1;
    case "trial": return 0;
  }
}

// OK: Interface + 実装
interface DiscountPolicy {
  calculate(amount: number): number;
}

class PremiumDiscount implements DiscountPolicy {
  calculate(amount: number) { return amount * 0.2; }
}
class RegularDiscount implements DiscountPolicy {
  calculate(amount: number) { return amount * 0.1; }
}
```

**例外**: 境界層 (controller / bridge) でのインスタンス生成・値変換は switch 許容。

**判断**: 各分岐で異なる計算ロジック? / 独立したテストが必要? / 将来増える? → **Polymorphism**

### 4. イミュータブル

状態変更は最小限に。変更時は新オブジェクトを返す。

```typescript
class Ringi {
  constructor(
    readonly id: string,
    readonly title: string,
    readonly amount: number,
    readonly status: RingiStatus,
  ) {}

  approve(): Ringi {
    return new Ringi(this.id, this.title, this.amount, RingiStatus.APPROVED);
  }
}
```

**骨格**: `ringi.approve() → new Ringi(..., approvedStatus)`

### 5. Result 型でドメインエラー表現

ドメインエラーは `Result<T, E>` 判別共用体で返す。**絶対に throw しない**。

```typescript
type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

function submitOrder(data: OrderData): Result<Order, SubmitError> {
  if (!data.customerId) return { ok: false, error: "missing-customer" };
  if (data.items.length === 0) return { ok: false, error: "empty-items" };
  return { ok: true, value: new Order(data) };
}

const result = submitOrder(input);
if (!result.ok) return toErrorResponse(result.error);
// ... use result.value
```

**例外**: `InfrastructureError` は `extends Error` で throw 可 (DB 接続断、外部 API 5xx 等)。

**骨格**: `DraftX.create(data) → Result<DraftX, ErrorX>`

---

