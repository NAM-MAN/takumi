# /strict-refactoring: Core Rules (L1 + L2)

本 skill (`SKILL.md`) から参照される設計制約ルール詳細。Level 1 (`required invariants` 5 個) と Level 2 (`default heuristics` 10 個、4 カテゴリ) を記述。profile と strictness に応じて適用度合いが変わる (`profiles.md` 参照)。

---

## Required Invariants (L1、5 個)

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

## Default Heuristics (L2、10 個、4 カテゴリ)

`structure` / `api-shape` / `testability` / `layout` の 4 カテゴリに分類。`legacy-touchable` profile では全て advisory に降格。

### structure カテゴリ (4 個)

#### 6. Early Return Only

else 句は原則使わず、ガード節で処理する。

```typescript
// NG
function process(order: Order) {
  if (order.isValid()) {
    // ... 長い処理
  } else {
    throw new Error("invalid");
  }
}

// OK
function process(order: Order) {
  if (!order.isValid()) throw new Error("invalid");
  // ... 長い処理
}
```

**例外**: 両パスが正常系で対称的な場合 (A or B の二択で、どちらも正常) は許容。

#### 11. Pending Object Pattern

状態遷移を型で表現する:

```
{状態}{Entity}(入力).{遷移}(依存) → {結果Entity}
```

| 状態 | クラス名例 | メソッド |
|------|-----------|---------|
| 作成 | `Draft{Entity}` | `submit(repo)` |
| 承認待ち | `Awaiting{Entity}` | `approve(repo)` |
| 承認済 | `Approved{Entity}` | (terminal or 次状態) |

**骨格**: `DraftRingi(data).submit(repo) → SubmittedRingi`

**verify との連携** (React 特化は `rules-ui-state.md` 参照):
- 遷移の precondition は export して verify が再利用

#### 12. Repository = Aggregate Root 単位

1 Aggregate Root = 1 Repository。子エンティティは親と一緒に保存する。

**許容**: `save`, `findById`, `findByNaturalKey`, `delete`
**禁止**: 複雑なクエリ、search、report 系 (別 ReadModel に分離)

**骨格**: `interface RingiRepository { save(ringi: Ringi): Promise<void> }`

#### 13. concept-first task placement

ディレクトリを見れば「何のシステムか」が分かるようにする。**Screaming Architecture**。

```
NG (技術ベース):
  src/
    domain/
    infrastructure/
    controllers/

OK (概念ベース):
  src/
    expense-reports/
    approvals/
    employees/
```

**禁止**: `common/`, `shared/`, `utils/` (実体が読めない、依存のハブになる)

**/takumi との連携**:
- task の directory 配置を自動判定する時、本ルールに従う
- 新規 feature は `src/{concept}/` を切る、既存なら尊重
- `legacy-touchable` profile では既存構造を壊さない

**骨格**: `src/expense-reports/DraftExpenseReport.ts`

### api-shape カテゴリ (3 個)

#### 7. 引数は 1-2 個

3 つ以上は **Parameter Object** にまとめる。

```typescript
// NG
function createOrder(customerId: string, items: Item[], note: string, couponCode: string) {}

// OK
interface CreateOrderInput {
  customerId: string;
  items: Item[];
  note?: string;
  couponCode?: string;
}
function createOrder(input: CreateOrderInput): Result<Order, Error> {}
```

**骨格**: `new DraftX(data: DraftData)`

#### 8. 戻り値は名前付き型

複数の値を返す場合、生タプル禁止。名前付き型を使う。

```typescript
// NG
function getDateRange(): [Date, Date] { return [start, end]; }

// OK
interface DateRange { start: Date; end: Date; }
function getDateRange(): DateRange { return { start, end }; }
```

**骨格**: `return { start: d1, end: d2 }`

#### 9. Primitive Obsession 回避

プリミティブは専用型で包む。

```typescript
// NG
function charge(amount: number): void {}

// OK
class Money {
  constructor(
    readonly amount: number,
    readonly currency: "JPY" | "USD" | "EUR",
  ) {
    if (amount < 0) throw new Error("negative amount");
  }
}
function charge(money: Money): void {}
```

**骨格**: `new Money(1000, "JPY")`

### testability カテゴリ (2 個)

#### 10. Interface 優先、継承禁止

Composition over Inheritance。

```typescript
// NG: 継承
class BaseRepository {
  save(entity: any) { /* ... */ }
}
class OrderRepository extends BaseRepository {}

// OK: Interface
interface Repository<T> {
  save(entity: T): Promise<void>;
  findById(id: string): Promise<T | null>;
}
class OrderRepository implements Repository<Order> {}
```

**骨格**: `interface XRepository { save(x: X): Promise<void> }`

#### 15. External Resource / Clock はメソッド引数

外部リソース・Clock・Random はメソッド引数で受け取る。

| 依存種類 | 生成方針 |
|---------|---------|
| Pure Logic | コンストラクタ内生成 |
| Configured Logic | Config 経由で内部生成 |
| **External Resource** | **メソッド引数** |
| **Non-deterministic** (Clock / Random) | **メソッド引数** |

```typescript
// NG
class DraftOrder {
  submit() {
    const now = new Date();  // 時刻依存、テストしにくい
    // ...
  }
}

// OK
interface Clock { now(): Date }
class DraftOrder {
  submit(repo: OrderRepository, clock: Clock): SubmittedOrder {
    const now = clock.now();
    // ...
  }
}
```

**骨格**: `draft.submit(repository, clock) → SubmittedDraft`

### layout カテゴリ (1 個)

#### 14. テスト命名: 仕様書として機能

テスト名が「何を検証しているか」を明確に伝える。

| テスト種別 | パターン |
|-----------|---------|
| 単体 | `{Subject} は {input} に対して {output} を返すべき` |
| 結合 | `{A} を {action} すると {result} として記録されるべき` |
| E2E | `{User} が {action} すると {observable} が表示されるべき` |

**禁止**: 「〜できるべき」、「快適に」、技術用語 (DB, API, HTTP 等)

**骨格**: `it("Money は負数に対して ValidationError を返すべき")`

---

## strictness 別の適用度

| 項目 | L1 | L1+L2 | L1+L2+L3 |
|---|---|---|---|
| Required Invariants (5 個) | ✓ hard | ✓ hard | ✓ hard |
| Default Heuristics (10 個) | - | ✓ | ✓ |
| UI State Rules (React) | - | - | ✓ (`rules-ui-state.md`) |

### profile × hard/soft

詳細は `review-checklist.md` の適用マトリクスを参照。`legacy-touchable` では soft warning が多数、`domain-strict` では全て hard。

---

## 関連リソース

| file | 用途 |
|---|---|
| `SKILL.md` (同ディレクトリ) | 本 skill entry point |
| `profiles.md` (同ディレクトリ) | 5 profile の詳細、適用条件 |
| `rules-ui-state.md` (同ディレクトリ) | L3 (React UI state) |
| `verify-contracts.md` (同ディレクトリ) | Tier → verify archetype 対応 |
| `language-relaxations.md` (同ディレクトリ) | Go / Rust / Python の緩和 |
| `review-checklist.md` (同ディレクトリ) | 実装完了時の評価 checklist |
