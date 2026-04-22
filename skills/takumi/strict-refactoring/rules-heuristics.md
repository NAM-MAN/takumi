# strict-refactoring: Default Heuristics (L2)

本 skill (`SKILL.md`) から参照される Level 2 の推奨ヒューリスティック (12 個、4 カテゴリ)。strictness が L1+L2 以上で適用される。必須不変条件 (L1) は `rules-required.md`、UI state は `rules-ui-state.md`。

---

## Default Heuristics (L2、12 個、4 カテゴリ)

`structure` / `api-shape` / `testability` / `layout` の 4 カテゴリに分類。`legacy-touchable` profile では全て advisory に降格。

### structure カテゴリ (6 個)

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

#### 16. Surface Minimization (SMD)

責務 / 品質 / 検知能力を落とさずに **表面積** を削る。詳細 recipe は **`smd.md`**。

関心の分離 / テスト / セキュリティで行数は膨らむが、context 効率と管理簡素のため **削る方向の圧力も first-class action** として明示する。test 側 MSS (`verify/compression.md`) の production 版だが、意味が反転する点に注意 (ADD は "削除の前提条件を先に足す" で、test MSS のような "新仕様追加" ではない)。

```
SHARPEN > PRUNE > ADD
  ├─ SHARPEN: 責務を保ったまま密度 ↑ (分岐正規化、重複 validation 統合、型で代替可能な defensive code の型化)
  ├─ PRUNE:   観測上不要な削除 (dead export、恒久 flag、未使用 error subtype、薄い forwarding)
  └─ ADD:     削除の前提条件を足す (型制約、contract test、lint rule、boundary)
```

**必須 gate (hard)**:
1. **survived + no-coverage count ≤ baseline** (mutation score 絶対値は分母変動で誤発火、代わりに survived / no-cov 数を見る)
2. public API 署名不変 (対象 unit が export するとき)
3. feature flag 参照 invariant 不変 (参照数ではなく behavioral invariant、direct ref は別 helper に隠せる)
4. tests pass
5. 変更行に新規 no-cov を作ったら **説明義務** (surface させた defensive は「テスト足す / 削る」の二択に寄せる、放置禁止)

**重大な失敗モード** (smd.md で具体例):
- **Premature DRY Trap** — rule-of-three 未満の DRY
- **Lifecycle Confusion** — lifecycle/ownership が違う処理の DRY
- **Silent Contract Violation** — 空 catch / defensive の早期削除
- **Invisible Consumer Breakage** — plugin / 動的 import / 外部 SDK consumer を grep で見つけられず export 削除
- **Unbounded Rollout Risk** — 100% 見えても staging / 古い client で生きてる flag の撤去

**骨格**: `SHARPEN > PRUNE > ADD, gate by survived/no-cov non-regression`

#### 17. 宣言的デフォルト (Rule 16 のミクロ対)

collection 変換は **宣言的 default**。`for` は 4 exception のいずれかに該当するときだけ残す。Rule 16 (マクロ) が「何を削るか」なら Rule 17 は「どう書くか」。詳細と pilot 実測は **`smd.md` §7-9**。

**言語別 default**:
| 言語 | 優先 | 非推奨 |
|---|---|---|
| JS/TS | `map` / `filter` / `flatMap` / `reduce` / `new Set(iterable)` | index-based `for` で配列構築 |
| Python | 内包表記 / generator / `itertools` | append-only `for` + range-index |
| Java/Kotlin | streams / sequences | 手書き Iterator |
| Rust | iterator chain (`.iter().filter().map().collect()`) | 明示 `for` + `Vec::push` |
| Go | **`for` が慣用** (言語設計上、例外扱い) | — |
| C / C++ | **`for` が慣用** (low-level control 優先、例外扱い) | — |

**`for` を残して良い 4 exception** (いずれかを満たすこと):
1. **副作用が本質** — mutable state への conditional add/delete、DB insert batch、API call 逐次
2. **早期中断 + 複雑 state** — `find` / `some` / `every` / `takeWhile` で表現できない蓄積を伴う break
3. **perf critical で benchmark 済み** — 実測で 10%+ 差がある場合のみ
4. **可読性優位** — 宣言的にすると `?? default + conditional push + set/return` など 4 要素以上が 1 式で交差するケース (例: grouping accumulator)

**チェーン上限**: **4 段以上は中間変数へ分解**原則 (3 段固定 rule ではない)。code golf 禁止 — `reduce` 1 行で詰める系は不可、「声に出して読んで意図が分かる最短」を狙う。

**Rule 16 と衝突時は Rule 16 優先**: 宣言的化で一時配列 / fallback / 可読性負債が増えるなら退ける。

**Pilot 実測** (name_editor/expand.ts): 3 refactor 適用で LoC 400 → 391 (-9)、survived 不変、no-cov +1 (元々 untested 領域の surface)。可読性優位 exception は実コードで 2 箇所に発動。

**骨格**: `for → map/filter/flatMap/reduce (default); for only if 副作用・中断・perf・可読性`

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

