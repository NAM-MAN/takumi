# Property-Based Testing (verify skill 内部参照)

`fast-check` でランダム入力を生成し、不変条件 (property) を検証する。
example test の入力空間を AI が網羅する仕組み。

---

## 6 流派の決定木

書こうとしている property がどれに該当するか、これで判断:

```
出力の正解が書ける?
├─ Yes → [1] Invariant でまず守る
│
└─ No (正解を直接書けない) → 何と比較できる?
    ├─ 同じ入力で再実行                  → [2] Determinism / Idempotence
    ├─ 入力を変換した別実行              → [3] Metamorphic (含 Algebraic)
    ├─ 逆関数がある                      → [4] Roundtrip / Inverse
    ├─ 別実装がある                      → [5] 軍師 / Differential (→ differential.md)
    └─ 状態がある                        → [6] Model-based / Stateful (→ model-based.md)
```

---

## [1] Invariant / Postcondition (1 実行)

定義: 1 回 `f(x)` を実行し、output 自体 (or input/output 関係) が普遍法則 P を満たす。

```ts
import fc from "fast-check"

// Invariant: 出力自体の性質
fc.property(fc.array(fc.integer()), (arr) => {
  const sorted = sort(arr)
  expect(isSorted(sorted)).toBe(true)
  expect(sorted.length).toBe(arr.length)
})

// Postcondition: input/output 関係
fc.property(fc.integer(), (n) => {
  expect(abs(n)).toBeGreaterThanOrEqual(0)
})
```

**いつ使う**: 出力の正解構造が分かるとき。最初に書く流派。
**落とし穴**: ドメイン特化 arbitrary を作らないと無意味な入力ばかりになる。

---

## [2] Determinism / Idempotence (同関数・同入力)

定義: 同じ関数を **同じ入力 (or 反復)** で複数回呼んで、結果の関係を見る。

```ts
// Determinism: 2 回呼んでも同じ
fc.property(promptArb, (p) => {
  expect(generate(p, 42)).toEqual(generate(p, 42))
})

// Idempotence: 2 回適用しても結果が変わらない
fc.property(fc.array(fc.integer()), (arr) => {
  expect(sort(sort(arr))).toEqual(sort(arr))
})

// Involution: 2 回適用すると元に戻る
fc.property(fc.string(), (s) => {
  expect(reverse(reverse(s))).toEqual(s)
})
```

**いつ使う**: 「複数回押されても safe」を担保したい操作 (再送、リトライ、ボタン連打)。
**落とし穴**: 副作用がある関数では determinism は成立しない (mock が必要)。

---

## [3] Metamorphic Relations (同関数・別入力)

定義: 入力を変換 `t` で関連付けた 2 実行を比較。`f(t(x))` と `t'(f(x))` の関係。
**output の正解を知らなくていい** のが「正解を直接書けない問題」(英語で *oracle problem*) 対策の主力。

### 3a. 一般 Metamorphic

```ts
// 入力を変換 → 出力もこう変換されるはず
fc.property(imageArb, (img) => {
  expect(bwConvert(rotate90(img))).toEqual(rotate90(bwConvert(img)))
})

// 単調性: 入力を増やすと出力も増えるはず
fc.property(fc.integer({ min: 0 }), (n) => {
  expect(complexity(n + 1)).toBeGreaterThanOrEqual(complexity(n))
})
```

### 3b. Algebraic Laws (Metamorphic の特殊形)

```ts
// 可換: a + b === b + a
fc.property(fc.integer(), fc.integer(), (a, b) => {
  expect(add(a, b)).toBe(add(b, a))
})

// 結合: (a + b) + c === a + (b + c)
fc.property(fc.integer(), fc.integer(), fc.integer(), (a, b, c) => {
  expect(add(add(a, b), c)).toBe(add(a, add(b, c)))
})

// 単位元
fc.property(fc.integer(), (a) => {
  expect(add(a, 0)).toBe(a)
})
```

**いつ使う**: 出力の正解が書けない (画像生成、ML、検索、コンパイラ) ときの主力。
**落とし穴**: 入力変換 `t` と出力変換 `t'` の対応設計が難しい。最初は対称性 / 単調性から。

---

## [4] Roundtrip / Inverse (関数とその逆関数)

定義: `f` と逆関数 `g` の合成が **恒等関数** になる。

```ts
// JSON シリアライズ/デシリアライズ
fc.property(jsonValueArb, (v) => {
  expect(JSON.parse(JSON.stringify(v))).toEqual(v)
})

// パーサー/プリンター
fc.property(astArb, (ast) => {
  expect(parse(print(ast))).toEqual(ast)
})

// 暗号化/復号
fc.property(fc.string(), keyArb, (msg, key) => {
  expect(decrypt(encrypt(msg, key), key)).toEqual(msg)
})
```

**いつ使う**: encoder/decoder, parser/printer, save/load, serialize/deserialize のペアが
ある時 **必ず**。バグの巣窟。
**落とし穴**: lossy な変換 (画像圧縮など) は厳密 equality が成立しない → tolerance 比較。

---

## [5] 軍師 / Differential

別実装と比較する流派。詳細は `differential.md`。要点:

```ts
fc.property(beatArrayArb, (beats) => {
  expect(layoutV2(beats)).toEqual(layoutV1(beats))  // 旧版を正解として比較
})
```

---

## [6] Model-based / Stateful

操作列で状態機械を網羅する流派。詳細は `model-based.md`。`fc.commands` を使う。

---

## ドメイン特化 arbitrary の集約

`fc.string()` や `fc.integer()` 直書きは無意味な入力ばかり生成する。
ドメイン arbitrary を **`src/test/pbt-utils.ts`** に集約:

```ts
// src/test/pbt-utils.ts
import fc from "fast-check"

export const beatArb = fc.record({
  id: fc.uuid(),
  text: fc.string({ minLength: 10, maxLength: 200 }),
  status: fc.constantFrom("draft", "review", "approved"),
  panelIndex: fc.integer({ min: 0, max: 100 }),
})

export const beatArrayArb = fc.array(beatArb, { minLength: 1, maxLength: 50 })

export const promptArb = fc.string({ minLength: 5, maxLength: 500 })
  .filter((s) => !s.includes("nsfw"))

export const layoutArb = fc.record({
  beats: beatArrayArb,
  pageCount: fc.integer({ min: 1, max: 30 }),
})
```

テストでは:

```ts
import { beatArrayArb } from "@/test/pbt-utils"

fc.property(beatArrayArb, (beats) => { /* ... */ })
```

---

## numRuns の調整

デフォルト 100 回は速いが網羅性は弱い。重要度で調整:

| 重要度 | numRuns | 用途 |
|---|---|---|
| 通常 | 100 (default) | 普通の関数 |
| 重要 | 500 | コア algorithm, payment, security |
| nightly | 5000 | 週次 CI で深く叩く |

```ts
fc.assert(fc.property(...), { numRuns: 500 })
```

---

## 失敗時の minimal counterexample

fast-check は失敗時に **「最小の壊れる入力」を自動で縮小** して報告する:

```
Property failed after 23 tests
Counterexample: [NaN]
Shrunk 7 time(s)
Got error: AssertionError: expected NaN to equal NaN
```

→ デバッグが速い。example test では絶対に得られない情報。

---

## 制約

- ドメイン arbitrary を必ず `pbt-utils.ts` に集約 (重複定義禁止)
- `fc.constant()` だけの property は example test と等価 → property にする意味なし
- numRuns を上げすぎると CI が遅くなる → 通常 100 / 重要 500 を目安に
