# Immutable First — Rules 17 / 18 / 20 実装 recipe

`rules-heuristics.md` の **Rule 17 (宣言的) / Rule 18 (immutable 構築) / Rule 20 (const 束縛)** を実運用に落とす recipe。3 つは同じ principle "**avoid mutation**" の 3 レイヤー表現:

```
Rule 17 ── Declarative Collection Transform (処理レベル: for → map/filter/reduce)
Rule 18 ── Immutable Construction           (構築レベル: push/set/= → literal/spread)
Rule 20 ── Binding Immutability             (束縛レベル: let → const)
```

Rule 20 を守ると const 束縛された array に push できない → Rule 18 (literal 構築) が自然に従う → for ループで累積ができない → Rule 17 (declarative) が従う。**上位ほど gate 効果が強い**。

Rule 16 (macro SMD) と衝突時は **Rule 16 優先**。

---

## 1. Rule 20 — Binding Immutability (const by default)

**コア**: `const` / `val` / `final` を default。`let` / `var` は以下の場合のみ。

### `let` を残して良い 3 条件 (すべて満たすこと)

1. state の再代入が**本質**である (ternary / 関数分離で回避不可)
2. スコープが**視野内** (15 行以内)
3. 再代入箇所が明確 (1 関数内で 3 箇所以上 let 再代入するならリファクタ対象)

### `var` は使用禁止 — function-scoped + hoisting の罠

### `let` → `const` 典型変換パターン

| let pattern | const 代替 |
|---|---|
| `let x; if (c) x = a; else x = b` | `const x = c ? a : b` |
| `let arr = []; ... arr.push(x)` | Rule 18: `const arr = source.filter(...).map(...)` |
| `let count = 0; for (...) count++` | `const count = items.filter(match).length` |
| `let sum = 0; for (x of xs) sum += x` | `const sum = xs.reduce((a, b) => a + b, 0)` |
| `let result = base; if (c) result = { ...base, x: 1 }` | `const result = c ? { ...base, x: 1 } : base` |

### Tool 強制

- ESLint `prefer-const` を enable (auto-fix 可能)
- TypeScript `strict` mode

### Pilot 実証 (camera.ts)

`let shot_size` / `let camera_angle` / `let subject_framing` の 3 let 再代入 chain が Rule 18 spread 変換で自動消滅 (`return { ...DEFAULT_CAMERA, shot_size: 'full', camera_angle: 'low' }` 形)。**Rule 20 と Rule 18 は相互強化関係**。

---

## 2. Rule 18 — Immutable Construction

**コア**: 構築時に mutation を避け、literal / spread / filter で直接構築する。

### 典型変換パターン

| ❌ Before | ✅ After |
|---|---|
| `const arr = []; for (...) arr.push(x)` | `const arr = source.filter(...).map(...)` |
| `const obj = {}; obj.x = 1; obj.y = 2` | `const obj = { x: 1, y: 2 }` |
| `const set = new Set(); for (x of items) set.add(x)` | `const set = new Set(items)` |
| `const map = new Map(); items.forEach(i => map.set(i.key, i.val))` | `const map = new Map(items.map((i) => [i.key, i.val]))` |
| `let result = base; if (c) result = { ...base, x: 1 }; return result` | `return c ? { ...base, x: 1 } : base` |
| 同パターン N 箇所 in-file | **rule-of-N helper 抽出**で集約 (後述) |

### Rule-of-N DRY との相性

同一 pattern を 3-4+ 箇所で construct する場合、helper 化で集約すると **副作用として survived mutant が減る**。理由: 4 箇所の重複 defensive check が 1 helper に集約 → テストが 4× 密に helper に当たる → 未検知だった mutant が killed に。

**pilot 実測** (camera.ts, `lookupToken` helper 抽出): survived 11 → 6 (-5, 品質改善)。

### Rule 18 Exception

1. **Coupled sibling mutation** — 2 配列に lockstep で push するパターン (例: SQL WHERE 構築で `clauses.push` + `params.push` を同時に)。declarative 化すると冗長になる。for loop keep。
2. **巨大配列の spread** — O(n) の alloc コストが問題なら mutation keep (benchmark 実測で 10%+ 差がある場合のみ)
3. **try/catch 混在** — flatMap 内部に try/catch を入れるとネスト深くなり可読性低下 (Rule 17 exception 4 準拠)

### Pilot 実測 (camera.ts, 2026-04-22)

| metric | baseline | after | Δ |
|---|---|---|---|
| LoC | 205 | 179 | **-26 (-12.7%)** |
| survived mutants | 11 | 6 | **-5 (品質改善)** |
| no-coverage | 0 | 0 | unchanged |
| mutation score | 88.04% | 91.89% | **+3.85pt** |
| tests | 29/29 | 29/29 | pass |

2 パターン適用:
- **Part 1**: `lookupToken` helper + array literal + `filter(Boolean)` — 4 回の重複 defensive check 統合
- **Part 2**: `inferCameraDefaults` の let re-assign chain を `return { ...DEFAULT_CAMERA, ...override }` に

---

## 3. Rule 17 — Declarative Collection Transform (詳細)

**コア**: collection 変換は宣言的 default。`for` は 4 exception のいずれかのときだけ残す。

### `for` を残して良い 4 exception

| # | exception | 判定基準 | 典型例 |
|---|---|---|---|
| 1 | **副作用が本質** | 外部 mutable state への conditional 操作、1 回 iterate で複数副作用を起こしたい | `tags.delete` / `tags.add` を action で分岐、DB insert batch |
| 2 | **早期中断 + 複雑 state** | `find` / `some` / `every` / `takeWhile` で表現できない、break に伴う状態蓄積がある | 条件満たしたら loop を抜けて accumulator を返す |
| 3 | **perf critical で benchmark 済み** | JIT が手書き loop を優先最適化、実測 10%+ 差 | hot path の内部ループ、V8 inlining 依存 |
| 4 | **可読性優位** | 宣言的にすると `?? default + conditional push + set/return` など **4 要素以上が 1 式で交差** | grouping accumulator |

### 言語別 default

| 言語 | 優先 | 非推奨 |
|---|---|---|
| JS/TS | `map` / `filter` / `flatMap` / `reduce` / `new Set(iterable)` | index-based `for` で配列構築 |
| Python | 内包表記 / generator / `itertools` | append-only `for` + range-index |
| Java/Kotlin | streams / sequences | 手書き Iterator |
| Rust | iterator chain (`.iter().filter().map().collect()`) | 明示 `for` + `Vec::push` |
| **Go** | **`for` が慣用** (言語設計上、例外扱い) | — |
| **C / C++** | **`for` が慣用** (low-level control 優先、例外扱い) | — |

### チェーン上限: 4 段以上は中間変数

**3 段固定 rule ではない**。4 段以上になったら中間変数 or named helper に分解:

```ts
// ✅ OK (3 段)
items.filter(isActive).map(toDto).sort(byDate)

// ❌ NG (5 段、レビューコスト跳ね)
items.filter(...).map(...).filter(...).flatMap(...).reduce(...)

// ✅ OK (分解後)
const active = items.filter(isActive)
const dtos = active.map(toDto)
const grouped = groupByCategory(dtos)
```

### Code Golf 禁止

checkio 等の最短コードから学ぶのは **「状態を持たない組み合わせ」** のみ:

- ✅ 学ぶ: `sum(1 for c in s if c.isdigit())` — 意図が直接読める
- ❌ 避ける: `reduce(lambda a,b: a|{b}, s, set())` — 同じだが読めない

**判定**: 「声に出して読んで何をしているか分かるか」。分からなければ分解。

### Rule 17 追加原則 (pilot 実測ベース)

#### 17-A: untested 領域では Rule 16 PRUNE を先に

宣言的変換は ArrowFunction + ConditionalExpression を callback に持つため、**Stryker mutant 数を 2-3 倍に増やす**。untested 領域では no-cov 一辺倒になるので、Rule 17 より **Rule 16 PRUNE を先に検討** (消せるなら消せ)。

#### 17-B: partition は declarative 優位

`add` / `remove` 分岐の 2 way partition は `filter+map × 2` が default (alloc 2N は sub-ms、10%+ benchmark 差のみ for 回帰)。

#### 17-C: `new Set(iterable)` / `new Set(flatMap)` は clean win

`for...of ... set.add(x)` を `new Set(iterable)` に置換するのは LoC 減 + perf 同等 + 意図直読。

### Rule 17 Pilot 実測 (expand.ts, 2026-04-22)

- LoC 400 → 391 (-9, -2.25%)
- survived 11 → 11 (不変)、no-coverage 40 → 41 (+1、untested 領域 surface)
- tests 14/14 pass、runtime -19%

---

## 4. Rule 17-D — Dispatch 判断フロー (NEW)

`switch` / `if-else chain on literal` を見つけたら、以下の 4 択から選ぶ:

```
switch / if-else chain on literal key を見つけたら:
├─ 1. ドメイン層? → L1 Rule 3 (hard): interface + class 必須
├─ 2. 分岐値が純粋データ (method なし、関数呼び出しなし)? → dispatch table (Record<K,T>)
├─ 3. 単一メソッド dispatch で N ≤ 8? → **switch + never default を keep** (NEW)
└─ 4. 多メソッド handler (validate/run/rollback 等) or N > 8? → interface + class (domain 外でも推奨)
```

### 選択肢比較 (pilot 実測: dispatch.ts の runQueueJob 6-case switch)

| 選択肢 | LoC | 型安全 | 可読性 | 拡張性 |
|---|---|---|---|---|
| **switch + never default** (keep) | 20 | ✓ exhaustive check | ◎ self-documenting | ○ 1 line |
| **dispatch table (Record)** | 16 | △ payload 型 erase、`as never` cast 必要 | △ | ○ 1 line |
| **interface + class** | ~36 | ✓ fully typed | ○ | ○ class + map |

### Key Insight

**TypeScript の `switch + never default` は既に "dispatch table 級" の type safety** を提供する (exhaustive check, payload 型は generic 推論)。単純 dispatch では**switch が勝つ**ことが多い。

### 判断の実例

- badge / icon / label の static mapping → **dispatch table** (Record<State, Badge>)
- job dispatcher (`runQueueJob`) — 6 kinds × 1 method → **switch + never keep**
- domain event handler — OrderPlaced / OrderCancelled / ... × 複数 methods → **interface + class** (Rule 3 適用)
- 機能フラグ付きの策略パターン → **interface + class** (behavior variation)

---

## 5. 統合応用例 (camera.ts pilot 全体)

```ts
// Before: Rule 17/18/20 すべて違反
const tokens: string[] = []
if (settings.shot_size && SHOT_SIZES.includes(...)) {
  const t = SHOT_SIZE_TOKEN[settings.shot_size]
  if (t) tokens.push(t)   // ❌ Rule 18: push mutation
}
// ... × 4 (重複)
return tokens

// After: Rule 17 (filter)  + Rule 18 (array literal) + DRY (rule-of-four helper)
function lookupToken<T extends string>(
  value: T | null | undefined,
  valid: readonly T[],
  map: Record<T, string>,
): string {
  return value && valid.includes(value) ? map[value] : ''
}

return [
  lookupToken(settings.shot_size, SHOT_SIZES, SHOT_SIZE_TOKEN),
  lookupToken(settings.camera_angle, CAMERA_ANGLES, CAMERA_ANGLE_TOKEN),
  lookupToken(settings.subject_framing, SUBJECT_FRAMINGS, SUBJECT_FRAMING_TOKEN),
  lookupToken(settings.focus_part, FOCUS_PARTS, FOCUS_PART_TOKEN),
].filter(Boolean)
```

LoC -9、survived -5 (品質改善)、mutation score +3.85pt、rule-of-four helper で DRY 安全。

---

## 関連リソース

| file | 用途 |
|---|---|
| `smd.md` (同ディレクトリ) | Rule 16 (macro Surface Minimization) の implementation recipe |
| `rules-heuristics.md` (同ディレクトリ) | 14 L2 heuristics の目次 (Rule 17/18/20 含む) |
| `rules-required.md` (同ディレクトリ) | L1 Rule 3 (ドメイン層 switch 禁止 → interface + class) |
| `verify/compression.md` (`~/.claude/skills/takumi/`) | test 側 MSS (production 版との対比元) |
