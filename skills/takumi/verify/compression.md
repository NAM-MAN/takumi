# Compression — MSS (Minimal Spec Suite) 実装 recipe

`verify/spec-tests.md` §8 の MSS 原則 ("テストは最小かつ最鋭") を実運用に落とすための recipe 集。`verify-loop/runtime.md` の Phase 2 から呼ばれる。

> [!IMPORTANT]
> Compression は **L4 Mutation が primary tier (`~/.claude/skills/takumi/verify/mutation.md` 参照) の project のみ**適用する。advisory tier (Python / Go) では operator 覆盖が薄く subsumption 判定が信頼できないため、compression は適用せず Phase 1 の SHARPEN > ADD のみで運用する。

---

## 1. 3 forces の優先順位 (再掲)

Phase 2 に入った worker は以下の順序で判断する。AI の add-bias を構造で矯正する:

| 順 | force | 引き金 | 行動 |
|---|---|---|---|
| 1 | **SHARPEN** | 生存 mutant | 既存 `it` の assertion を鋭くする |
| 2 | **PRUNE** | 冗長検出 | subsumption / zero-contribution / 低 spec-density のテストを削除 |
| 3 | **ADD** | 1, 2 で解決不可 | 新しい `it('…べき')` を追加 |

---

## 2. Subsumption 検出

### 2.1 定義

test A が殺す mutant 集合を `killed(A)` とする:

- `killed(A) ⊇ killed(B)` かつ `coverage(A) ⊇ coverage(B)` → **B は A に包含** (subsumed)
- subsumed な B は削除候補 (A が残れば同じ守りが維持される)

ただし B の仕様表現が A と異なる場合 (ドメイン上の重要性) は残す判断もあり得る。判定は軍師 に敵対レビューさせて final call。

### 2.2 Stryker からデータを取る方法

`stryker.config.mjs` に `reporters: ['json', 'progress']` を追加し full run する:

```bash
pnpm stryker run --reporters json --mutate src/lib/example/<module>.ts
```

出力: `reports/mutation/mutation.json`。schema:

```jsonc
{
  "files": {
    "src/lib/example/<module>.ts": {
      "mutants": [
        {
          "id": "0",
          "mutatorName": "StringLiteral",
          "status": "Killed",    // or Survived / NoCoverage / Timeout
          "killedBy": ["11"],    // test id
          "coveredBy": ["11", "12"]
        },
        // ...
      ]
    }
  },
  "testFiles": {
    "src/lib/example/__tests__/<module>.test.ts": {
      "tests": [
        { "id": "11", "name": "imageUrl は thumbnail 種別に ...", "location": {...} }
      ]
    }
  }
}
```

### 2.3 Subsumption map の算出 (擬似コード)

```ts
// 各 test の killed-set を作る
const killedBy = new Map<TestId, Set<MutantId>>()
for (const mutant of allMutants) {
  if (mutant.status === 'Killed') {
    for (const testId of mutant.killedBy) {
      killedBy.set(testId, (killedBy.get(testId) ?? new Set()).add(mutant.id))
    }
  }
}

// subsumption 関係
const subsumed: TestId[] = []
for (const [b, killedB] of killedBy) {
  for (const [a, killedA] of killedBy) {
    if (a === b) continue
    if (isSuperset(killedA, killedB) && killedA.size > killedB.size) {
      subsumed.push(b)  // B は A に包含、削除候補
      break
    }
  }
}
```

実際の削除ワークフローは **§4 PRUNE の安全手順** を参照。

---

## 3. Zero-contribution 検出

### 3.1 定義

test が `coveredBy` に含まれているのに `killedBy` に 1 度も登場しないケース:

- そのテストは production code を実行するが、assertion が mutant を区別しない
- → **飾り** (decorative test)、削除候補

典型例: `expect(result).toBeTruthy()` だけの test で、production の内部ロジックが変わっても truthy のままなら検知できない。

### 3.2 算出方法

```ts
for (const testId of allTestIds) {
  const isKilling = [...allMutants].some(m => m.killedBy?.includes(testId))
  const isCovering = [...allMutants].some(m => m.coveredBy?.includes(testId))
  if (isCovering && !isKilling) {
    // zero-contribution
  }
}
```

---

## 4. PRUNE の安全手順 (必須)

削除は危険操作。**必ず以下の順序で**:

1. **候補特定**: 2.3 / 3.2 で subsumption / zero-contribution を検出
2. **1 件ずつ削除** (バッチ削除禁止):
   - 候補 test を 1 本削除
   - `pnpm stryker run --incremental --mutate <file>` で再実行
   - 削除前の mutation score と比較
   - **score が等しい → 削除確定、commit**
   - **score が下がった → revert、該当 test に「必須」flag を立てる** (コメント `// @mss:retained <reason>` 推奨)
3. **複数候補がある場合**: 1 つずつ繰り返す。並列削除は一切禁止 (相互作用で予期しない score 変化が起きる)
4. **最後に full run** で全体 score が崩れていないか最終確認

### 4.1 軍師 による敵対レビュー

削除候補が 3 件以上ある場合、軍師 に敵対レビューを依頼:

```bash
codex exec -m gpt-5.4 -s read-only -C "$(pwd)" \
  "以下のテスト削除候補を敵対的にレビューせよ。subsumption 判定は正しいか、
   仕様表現として残すべき test はないか、ドメイン上の暗黙の守りを失わないか。
   候補一覧:
   {削除候補の test 名と subsumption proof}" 2>&1 | tail -100
```

---

## 5. Runtime Budget

### 5.1 目安

per-file:

| 対象 | budget | 理由 |
|---|---|---|
| pure logic (utils, parser, builder) | < 500ms | I/O 無し、vitest でも速い |
| state layer (reducer, selector) | < 1s | 状態空間が広がる |
| component test (L2) | < 2s | DOM + render コスト |
| repository layer | < 3s | DB mock 含む |
| smoke e2e | 60s total, CI only | 実 DOM |

suite 全体: local pre-push で < 30s。

### 5.2 超過時の対応

- 遅い test を特定 (`pnpm test --run --reporter=verbose` で表示)
- 原因分類:
  - 重い setup → `beforeAll` 化、reuse
  - 重い fixture → arbitrary を狭める (`fc.array({maxLength: 5})` 等)
  - 重い I/O → mock、inline fixture
  - `numRuns: 500` 過多 → 重要 test のみ 500、それ以外は default 100
- それでも budget 超なら **削除** or **Layer 移動** (component から smoke に移す等)

---

## 6. Spec-density メトリクス

### 6.1 定義

```
spec_density = unique_killed_mutants / test_LOC
```

- **unique_killed_mutants**: その test だけが殺した mutant 数 (他の test も殺している mutant は除外)
- **test_LOC**: `it('…')` の body ライン数 (describe / import は除く)

### 6.2 閾値

| density | 解釈 | 対応 |
|---|---|---|
| ≥ 1.0 | 濃く仕様を表現 | そのまま |
| 0.5 - 1.0 | 標準 | そのまま |
| 0.3 - 0.5 | 薄い | SHARPEN 候補 |
| < 0.3 | 飾り | PRUNE 候補 |
| 0 | zero-contribution | **即 PRUNE** (§3) |

閾値は project 側で `.takumi/profiles/verify/{name}.yaml` の `spec_density_min` で調整可。

---

## 7. compression 完了条件

Phase 2 が完了したと判断する条件:

- [ ] subsumption / zero-contribution 候補が残り 0
- [ ] 全 test の spec-density ≥ 0.3 (profile で上書き可)
- [ ] suite runtime が budget 内
- [ ] mutation score が Phase 2 開始時と同等以上
- [ ] 削除した test は `@mss:retained` flag なしで全て ephemeral (戻す必要がない)

5 つ全て満たしたら Phase 3 (Maintenance) に遷移。

---

## 7.5. SHARPEN に関する知見 (実測ベース)

### 境界値ロジック (`<` vs `<=`) は PBT だけでは殺せない

幾何計算系 (snap / clip / intersect 等) では、`dLeft <= thresholdPercent` の `<=` が `<` に変わる mutant を PBT で殺すのは難しい (ランダム入力がピンポイント境界値に落ちる確率が低い)。

対策: **境界値の example test を 1-2 本追加** する:

```ts
it('距離がちょうど threshold (distance == threshold) の入力に対して snap するべき (<=)', () => {
  // distance exactly 2, threshold 2 → must snap (kills `<` vs `<=` mutant)
  const result = calcSnap({ x: 2, y: 20, width: 30, height: 20 }, [], 2)
  expect(result.snappedRect.x).toBe(0)
})

it('距離が threshold を超える (distance > threshold) 入力に対して snap しないべき', () => {
  // distance 2.5, threshold 2 → no snap
  const result = calcSnap({ x: 2.5, y: 20, width: 30, height: 20 }, [], 2)
  expect(result.snappedRect.x).toBe(2.5)
})
```

これは USS 原則に反しない: **1 unit 1 file の中に境界値 example と PBT を混ぜる**。PBT はファイルを分ける理由にならない。

### Preference / tie-breaking ロジックも example で殺す

`(bestA ?? Infinity) <= (bestB ?? Infinity)` のような preference 比較は、A と B が**完全に同距離**の入力でのみ mutant を区別できる。PBT だと同距離がまず出ない:

```ts
it('左端と右端が同距離で両方 threshold 内のとき、左端 snap を選ぶべき (left preferred)', () => {
  // rect width=98: left dist 1, right dist 1 (exact tie) → left wins
  const result = calcSnap({ x: 1, y: 20, width: 98, height: 20 }, [], 2)
  expect(result.snappedRect.x).toBe(0)
})
```

### 一般化: SHARPEN の効く mutant パターン

| mutant 種別 | 殺す手段 |
|---|---|
| Equality / Relational (`<` vs `<=`) | 境界値 example |
| Conditional (`&&` 2 項目固定) | その分岐に入る specific case |
| Preference / tie-breaking | 同値入力の example |
| Array / Object mutation | PBT (invariant 系) |
| Arithmetic (`+` vs `-`) | PBT でも example でも |

---

## 8. 例: 1 unit の compression サイクル

```
Before:
  <module>.test.ts     (72 LOC, 9 tests)
  <module>.pbt.test.ts (113 LOC, 7 tests)
  合計: 185 LOC, 16 tests
  mutation score: 82%
  runtime: 45ms

Step 1 (USS 統合):
  <module>.pbt.test.ts 削除、<module>.test.ts に統合
  重複 it を統合 (8 tests 残存)
  Rule 14 命名に統一
  → 90 LOC, 8 tests

Step 2 (SHARPEN):
  assertion 鋭化 (toBeTruthy → toBe)、stricter matcher
  → 90 LOC, 8 tests

Step 3 (PRUNE):
  subsumption で 2 件削除 (example test が PBT に包含された)
  zero-contribution で 0 件削除
  → 70 LOC, 6 tests

After:
  <module>.test.ts (70 LOC, 6 tests)
  mutation score: 82% (維持)
  runtime: 30ms (33% 減)
  LOC: 185 → 70 (62% 減)
```

---

## 関連リソース

| file | 用途 |
|---|---|
| `spec-tests.md` (同ディレクトリ) | USS + MSS の原則 (§5, §8) |
| `mutation.md` (同ディレクトリ) | Stryker 設定と reporter 種別 |
| `~/.claude/skills/takumi/verify-loop/runtime.md` | Phase 1 (Expansion) / 2 (Compression) / 3 (Maintenance) の実装 |
| `README.md` (同ディレクトリ) | 7 原則の第 7 (MSS) |
