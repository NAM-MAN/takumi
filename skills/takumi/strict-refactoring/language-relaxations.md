# Language Relaxations

本スキル (strict-refactoring) は **OOP を主軸 + 部分的に関数型** な言語群を対象とする。
言語ごとの文化・型システム・慣習に応じて、ルールの **緩和 (relaxation)** と
**非適用 (non-applicable) 条件** を定義する。

- [対象言語と緩和方針](#対象言語と緩和方針)
- [言語別緩和マトリクス](#言語別緩和マトリクス)
- [言語別詳細](#言語別詳細)
  - [TypeScript / JavaScript](#typescript--javascript-厳密適用)
  - [Go](#go-result-型緩和--interface-lazy)
  - [Rust](#rust-型システムで代替)
  - [Python](#python-duck-typing--dataclass)
  - [Kotlin / Scala](#kotlin--scala-関数型機能との併用)
- [共通: 非適用 (non-applicable) ケース](#共通-非適用-non-applicable-ケース)
- [関連リソース](#関連リソース)

---

## 対象言語と緩和方針

**対象言語:** Java, Kotlin, Scala, C#, F#, TypeScript, JavaScript, Python, Swift, Go, Rust

**対象外:**
- Haskell, Elm, PureScript 等の **純粋関数型言語**
  - 本スキルの Command/Pure/ReadModel 分類は OOP 前提の整理。
    純粋関数型では型クラス + effect system でより強い保証が得られる。
  - Pending Object Pattern も Builder/Smart Constructor で代替されるため不要。

**緩和方針:**
1. **言語文化を尊重** する (Go のシンプルさ、Rust の ownership、Python の duck typing)
2. **型システムが別解を提供** する場合はそちらを採用 (Rust の `Result<T, E>` 等)
3. **例外的に緩和** するのであって、ルール自体は守る (「Go だから全て自由」ではない)

---

## 言語別緩和マトリクス

凡例: 厳=厳密適用 / 標=標準適用 / 緩=緩和 / 代=型システム等で代替 / −=非対象

| ルール (rules-core.md 参照) | TS/JS | Java | Kotlin | Scala | C# | F# | Swift | Python | Go | Rust |
|---|---|---|---|---|---|---|---|---|---|---|
| 早期リターン | 厳 | 厳 | 厳 | 標 | 厳 | 標 | 厳 | 厳 | 厳 | 厳 |
| Interface 先行定義 | 厳 | 厳 | 厳 | 厳 | 厳 | 標 | 厳 | 標 | 緩 | 代 (trait) |
| 完全コンストラクタ | 厳 | 厳 | 厳 | 厳 | 厳 | 代 | 厳 | 緩 | 標 | 代 |
| Pending Object Pattern | 厳 | 厳 | 厳 | 厳 | 厳 | 標 | 厳 | 標 | 標 | 標 |
| Result 型 | 厳 | 厳 | 厳 | 標 | 厳 | 代 | 代 (throws) | 緩 | 緩 | 代 (Result) |
| Command/Pure/ReadModel | 厳 | 厳 | 厳 | 厳 | 厳 | 厳 | 厳 | 厳 | 標 | 標 |
| 条件式の変数抽出 | 厳 | 厳 | 厳 | 厳 | 厳 | 厳 | 厳 | 厳 | 緩 | 厳 |
| 小さな struct/class 分割 | 厳 | 厳 | 厳 | 厳 | 厳 | 厳 | 厳 | 厳 | 緩 | 標 |
| ドットチェーン制限 | 厳 | 厳 | 厳 | 緩 | 厳 | 緩 | 厳 | 厳 | 緩 | 厳 |
| Immutability | 厳 | 厳 | 厳 | 厳 | 厳 | 厳 | 厳 | 標 | 標 | 代 |
| Polymorphism 優先 | 厳 | 厳 | 厳 | 厳 | 厳 | 厳 | 厳 | 標 | 緩 (type switch 可) | 代 (enum) |
| Null 許容の明示 | 厳 (`T \| null`) | 厳 (`Optional<T>`) | 厳 (`T?`) | 厳 (`Option[T]`) | 厳 (`T?`) | 代 (`Option<T>`) | 厳 (`T?`) | 緩 (`Optional[T]`) | 緩 (`nil`) | 代 (`Option<T>`) |

---

## 言語別詳細

### TypeScript / JavaScript (厳密適用)

本スキルの **基準言語**。例やルールは全て TS を前提に記述されている。

- `strict: true` / `strictNullChecks` / `noUncheckedIndexedAccess` を必須
- `any` 禁止、`unknown` + 型ガードを用いる
- Result 型は自前実装か `neverthrow` / `effect-ts` を導入
- React/Next.js 固有の状態管理は **`rules-ui-state.md` に委譲**
  (本ドキュメントでは汎用ロジック層のみ扱う)

JavaScript (非 TS) に適用する場合は JSDoc で型注釈を付け、`// @ts-check` を有効化せよ。

---

### Go (Result 型緩和 + Interface lazy)

Go はシンプルさと "accept interfaces, return structs" の文化を持つ。

| 緩和項目 | 内容 |
|---|---|
| Result 型 | 多値戻り値 `(T, error)` で代替。自前 Result は導入しない |
| `if err != nil` | 条件式の変数抽出は **不要**。そのまま書いてよい |
| Interface 先行定義 | 実装 1 つの段階では不要。**2 つ以上** 必要になった時点で抽出 |
| Interface 配置 | 利用者側 (consumer) パッケージに置く (Go の慣習) |
| 小さな struct 分割 | 過度な分割より、明快な関数を優先 |
| Polymorphism | `type switch` は許容 (interface が過剰になる場合) |
| ドットチェーン | receiver method チェーンは許容 |

Command / Pure / ReadModel 分類、および Pending Object Pattern は **標準適用**。
struct + receiver method で表現する。

```go
// Command: Pending Object Pattern
type PendingReservation struct {
    data ReservationData
}

func NewPendingReservation(data ReservationData) (*PendingReservation, error) {
    if data.CustomerID == "" {
        return nil, errors.New("customer_id is required")
    }
    return &PendingReservation{data: data}, nil
}

func (p *PendingReservation) Confirm(repo ReservationRepository) (*Reservation, error) {
    reservation := NewReservation(p.data)
    if err := repo.Save(reservation); err != nil {
        return nil, err
    }
    return reservation, nil
}

// Pure: struct + receiver method
type TaxOn struct {
    purchase Money
    rate     TaxRate
}

func NewTaxOn(purchase Money, rate TaxRate) TaxOn {
    return TaxOn{purchase: purchase, rate: rate}
}

func (t TaxOn) Amount() Money {
    return t.purchase.Multiply(t.rate.Value())
}
```

---

### Rust (型システムで代替)

Rust は所有権・借用・`Result<T, E>` / `Option<T>` を備え、本スキルの多くを
**言語レベル** で保証する。したがって **「代替」による緩和** が中心。

| 緩和項目 | 内容 |
|---|---|
| Result 型 | 標準の `Result<T, E>` / `?` 演算子で代替 |
| Null 許容 | `Option<T>` で代替。`null` の概念なし |
| Immutability | デフォルト immutable (`let mut` が例外) |
| Interface | `trait` で代替。dyn trait / generics の選択は性能要件で判断 |
| 完全コンストラクタ | `struct` のフィールドを private にし、`impl` でコンストラクタ提供 |
| Polymorphism | `enum` + `match` が第一候補。trait object は共通 interface が本当に必要な時 |
| match 式 | **許容** (型パターンマッチングは Rust の中核機能) |

ownership ルールを優先し、`Rc<RefCell<T>>` / `Arc<Mutex<T>>` の乱用は避ける。
Pending Object Pattern は **標準適用** (型状態 = typestate パターンでも表現可)。

```rust
// Typestate で Pending Object Pattern を表現
pub struct Draft;
pub struct Submitted;

pub struct Ringi<State> {
    id: RingiId,
    data: RingiData,
    _state: std::marker::PhantomData<State>,
}

impl Ringi<Draft> {
    pub fn new(id: RingiId, data: RingiData) -> Result<Self, DomainError> {
        if data.title.is_empty() {
            return Err(DomainError::ValidationError("title required".into()));
        }
        Ok(Self { id, data, _state: std::marker::PhantomData })
    }

    pub fn submit(self, repo: &dyn RingiRepository) -> Result<Ringi<Submitted>, InfraError> {
        repo.save(&self.id, &self.data)?;
        Ok(Ringi { id: self.id, data: self.data, _state: std::marker::PhantomData })
    }
}
```

---

### Python (duck typing + dataclass)

Python は型システムが gradual。`mypy` / `pyright` の厳格モード運用を前提とする。

| 緩和項目 | 内容 |
|---|---|
| Interface | `typing.Protocol` で構造的部分型 (duck typing と両立) |
| 完全コンストラクタ | `@dataclass(frozen=True)` + `__post_init__` でバリデーション |
| Null 許容 | `Optional[T]` / `T \| None` を **必ず明示**。暗黙の `None` 禁止 |
| Result 型 | `returns` ライブラリの `Result` か、例外 + 型付きエラー階層で代替可 |
| private field | `_x` は convention、`__x` は name mangling。強制力は弱いので過信しない |
| Immutability | `frozen dataclass` / `tuple` / `types.MappingProxyType` で表現 |

Pending Object Pattern は frozen dataclass + classmethod で実装する。

```python
from dataclasses import dataclass
from typing import Protocol

class RingiRepository(Protocol):
    def save(self, ringi: "SubmittedRingi") -> None: ...

@dataclass(frozen=True)
class PendingRingi:
    id: str
    title: str
    amount: int

    @classmethod
    def create(cls, id: str, title: str, amount: int) -> "PendingRingi":
        if not title:
            raise ValueError("title required")
        if amount < 0:
            raise ValueError("amount must be non-negative")
        return cls(id=id, title=title, amount=amount)

    def submit(self, repo: RingiRepository) -> "SubmittedRingi":
        submitted = SubmittedRingi(id=self.id, title=self.title, amount=self.amount)
        repo.save(submitted)
        return submitted

@dataclass(frozen=True)
class SubmittedRingi:
    id: str
    title: str
    amount: int
```

---

### Kotlin / Scala (関数型機能との併用)

Kotlin / Scala は OOP + 関数型のハイブリッド。本スキルに **最も適合** する言語群。

| 項目 | Kotlin | Scala |
|---|---|---|
| 完全コンストラクタ | `data class` + `init {}` | `case class` + `require(...)` |
| Immutability | `val` デフォルト、`copy()` で更新 | `case class` は immutable 既定 |
| Null 許容 | `T?` / `?:` / `?.` | `Option[T]` |
| Result 型 | `kotlin.Result` or `arrow-kt Either` | `Either[E, A]` / `Try[A]` / Cats `Validated` |
| Polymorphism | `sealed interface` + `when` | `sealed trait` + pattern match |
| ドットチェーン | 厳密 | 緩 (for-comprehension や関数合成は許容) |

Scala ではモナドチェーン (`for { _ <- ... } yield ...`) が慣習なので、
メソッドチェーン制限は緩和して構わない。Kotlin の scope function (`let/run/apply/also`) も
可読性を損なわない範囲で許容する。

```kotlin
// Kotlin: sealed interface + when
sealed interface RingiState {
    data class Draft(val data: RingiData) : RingiState
    data class Submitted(val data: RingiData, val submittedAt: Instant) : RingiState
    data class Approved(val data: RingiData, val approverId: ApproverId) : RingiState
}

fun transition(state: RingiState, event: RingiEvent): RingiState = when (state) {
    is RingiState.Draft     -> handleDraft(state, event)
    is RingiState.Submitted -> handleSubmitted(state, event)
    is RingiState.Approved  -> state // terminal
}
```

---

## 共通: 非適用 (non-applicable) ケース

以下は **全言語共通** で本スキルを適用しない / 緩和してよい領域。

| 領域 | 理由 | 推奨 |
|---|---|---|
| DTO / JSON schema レイヤ | 外部境界の形そのもの。ドメインロジック不在 | plain struct / class、Zod 等で validate |
| DB migration script | 一度きりの命令的操作 | 生 SQL / ORM migration 機能をそのまま使う |
| CLI の one-shot スクリプト | 寿命が短い、保守対象外 | 手続き的コードで可 |
| ベンチマーク / perf 計測コード | ホットパスの測定が目的 | インライン化・可変変数も許容 |
| テストコードの内部構造 | 可読性が最優先 | AAA パターン。Pending Object 強制なし |
| Legacy 境界のアダプタ | 既存 API に合わせる必要 | 境界で変換、内側で本スキル適用 |
| 型生成コード (codegen) | 機械生成 | ルール対象外。`.gitignore` 相当 |
| フレームワーク固有の magic 部 | FW 規約に従う必要 (Rails / Spring 等) | FW 規約優先、`rules-ui-state.md` 等の個別指針を参照 |

**重要:** 「DTO だから」と言ってドメインロジックを DTO に混ぜない。
境界は薄く保ち、内側で本スキルを厳密適用する。

---

## 関連リソース

| ドキュメント | 役割 |
|---|---|
| `SKILL.md` | skill 全体のエントリポイント |
| `rules-core.md` | 全言語共通のコアルール |
| `rules-ui-state.md` | React / Next.js / UI 状態管理の特化ルール |
| `profiles.md` | プロジェクトプロファイル (monolith / microservice / library 等) |
| `language-relaxations.md` (本書) | 言語別の緩和と非適用条件 |
