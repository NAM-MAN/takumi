# Unified Spec Test (USS) — 1 unit = 1 test file = 仕様書

**verify/README.md「6 原則」の第 6 (USS) の詳細仕様**。`verify/README.md` および `verify/property-based.md` / `verify/component-test.md` / `verify/mutation.md` から参照される中心原則で、「鋭いテスト専用ファイル問題」を構造で根絶する。

本ドキュメントの規則は **strict-refactoring Rule 14 (テスト命名: 仕様書として機能)** を verify 側が継承したものであり、両 skill の命名規約は一致する。

---

## 1. 大原則

> **1 unit に対して 1 test file。そのファイルが仕様書である。**

- ファイル名は `{module}.test.ts` (または `{module}.test.tsx`) のみ。
- `it('…')` の名前そのものが**仕様文**。機構 (PBT / metamorphic / mutation) を示唆する文字列は禁止。
- 機構は `it` body の内部で選ぶ実装詳細であり、ファイル分割の軸にはしない。
- mutation score が足りないときに追加するのは、**同じファイルの新しい `it('…べき')`** であって、新しいファイルではない。

---

## 2. 禁止ファイル名 (anti-pattern)

以下の接尾辞は**全て禁止**。見つかったら統合対象:

| 禁止名 | 正しい場所 |
|---|---|
| `{module}.pbt.test.ts` | `{module}.test.ts` の `it()` 内部 |
| `{module}.property.test.ts` | 同上 |
| `{module}.metamorphic.test.ts` | 同上 |
| `{module}.mutation.test.ts` | 同上 (mutation 対策は既存 it の鋭化) |
| `{module}.differential.test.ts` | 同上 |
| `{module}.commands.test.ts` | 同上 (fc.commands は it の中で使う) |
| `{module}.spec.ts` と `{module}.test.ts` の併存 | 片方に統合 |

**例外**: `{module}.ct.test.tsx` (Playwright Component Test) のみ、実 DOM が必要な runner 差のため許可。それ以外は全て vitest の `*.test.ts` に集約。

---

## 3. 命名規約 (strict-refactoring Rule 14 を継承)

### 骨格 (必須)

| テスト種別 | パターン |
|---|---|
| 単体 | `{Subject} は {input} に対して {output} を返すべき` |
| 結合 | `{A} を {action} すると {result} として記録されるべき` |
| E2E | `{User} が {action} すると {observable} が表示されるべき` |

### 禁止語彙

- **機構名**: `PBT:`, `P1`/`P2`, `property:`, `metamorphic:`, `commands:`, `mutation-killer:`, `regression:`
- **曖昧表現**: 「〜できるべき」「正しく動くべき」「快適に」「適切に」「きちんと」
- **裸の技術語**: `DB`, `API`, `HTTP`, `endpoint`, `handler`, `controller` (ドメイン語彙に翻訳する)
- **番号接頭辞**: `01`, `T1`, `case A` (順序に意味があるなら describe ブロックに切り出す)

### 具体例 (○ / ×)

```ts
// × cache-key.pbt.test.ts で書かれていた名前
it('P1: without cacheKey → no "?v=" suffix', ...)
it('PBT: base path always contains /api/images/{id} exactly', ...)
it('P5: deterministic (same input → same output)', ...)

// ○ {module}.test.ts の 1 ファイルに集約後
it('imageUrl は cacheKey が無いとき "?v=" を含まないパスを返すべき', ...)
it('imageUrl は id をパス中に 1 回だけ含めて返すべき', ...)
it('imageCacheKey は同じ image に対して同じ文字列を返すべき', ...)
```

```ts
// × 機構と技術語の複合
it('calcSnap PBT: width/height preserved', ...)

// ○ ドメイン語彙
it('calcSnap は rect の幅と高さを変えずに返すべき', ...)
```

---

## 4. it body 内で機構を選ぶ決定木

`it('{Subject} は {input} に対して {output} を返すべき', () => { ... })` の body を書くとき:

```
spec が特定の値を要求している (例: thumbnail → /thumbnail)
  → expect(f(x)).toBe(y)  で example assertion

spec が ∀x で成り立つ不変条件 (例: 幅は入力と同じ)
  → fc.assert(fc.property(arb, x => ...))  で PBT

spec が「正解を直接書けない」(画像/ML/LLM)
  → fc.assert で metamorphic 関係 (f(t(x)) と t'(f(x)) の一致)

spec が状態遷移の網羅 (3+ 状態)
  → fc.commands または @xstate/test (ここまで来たら 1 テストに収まらない。describe を分ける)

spec が旧実装との同値性
  → fc.assert で differential (in-repo 2-export)
```

**機構選択は隠す**。ユーザーが読むのは `it('…べき')` だけであって、中で何を使っているかは知らなくていい。

---

## 5. ミューテーションフィードバックの戻し方

Stryker が生き残った mutant を報告したとき、**新ファイルは作らない**。対応は 2 通り:

1. **既存の `it('…べき')` の assertion を鋭くする**
   - 例: 戻り値の長さだけ見ていたのを、内容の不変条件まで見るように拡張
2. **新しい `it('…べき')` を同じ describe 内に追加**
   - 例: edge case を語るドメイン文 (`Money は 0 に対して Zero 表現を返すべき`) を追加

### Stryker tick artifact の扱い

`/loop 10m /verify-loop` (verify-loop 運用) で発生する `stryker.tick{N}.config.mjs` / `vitest.stryker-tick{N}.config.ts` / 同ディレクトリの reports は **ephemeral**。

- 置き場所: `tmp/stryker-ticks/` または `.stryker-tmp/` (機械が生成する以上、追跡対象外)
- 必須: `.gitignore` に `stryker.tick*.config.mjs`, `vitest.stryker-*.config.ts`, `.stryker-tmp/`, `reports/stryker/` を登録
- 禁止: リポジトリ root に tick config を 10+ 個並べる運用 (実際の project で発生した事例あり、移行対象)

---

## 6. 既存コードの移行ルール

大規模リポジトリで `.pbt.test.ts` が多数存在する場合の扱い:

| 対象 | 扱い |
|---|---|
| **これから書く unit** | USS 必須。1 ファイル、Rule 14 命名 |
| 既存 `{m}.test.ts` + `{m}.pbt.test.ts` ペア | **移行 backlog 行き**。takumi の自己増殖型計画に挿入し、Wave 分けて解消 |
| 既存 `{m}.test.ts` 単独 | test 名が機構語彙を含むなら**リネームのみ**先行 |

移行手順 (1 unit あたり 1 Wave):

1. `{m}.pbt.test.ts` の各 `it('P?: …')` を **仕様文に翻訳** (`{Subject} は ... べき`)
2. `{m}.test.ts` に describe を揃え、**重複する invariant を統合** (example が PBT で包含される場合は example を削除)
3. fc.assert を含む it は `{m}.test.ts` に移す
4. `{m}.pbt.test.ts` を削除、git mv ではなく新旧 diff が残るように消す
5. `pnpm test --run {m}` で緑、`pnpm stryker run --incremental` で mutation score が劣化しないことを確認

---

## 7. describe 階層の指針

仕様書として読める構造にする:

```ts
describe('imageUrl', () => {
  describe('パス生成', () => {
    it('imageUrl は thumbnail 種別に対して /{id}/thumbnail で終わるパスを返すべき', ...)
    it('imageUrl は full 種別に対して /{id}/file で終わるパスを返すべき', ...)
    it('imageUrl は id をパス中に 1 回だけ含めて返すべき', ...)
  })

  describe('キャッシュキー付与', () => {
    it('imageUrl は cacheKey があるとき "?v=<key>" を末尾に付けて返すべき', ...)
    it('imageUrl は cacheKey が空文字のとき "?v=" を含まないパスを返すべき', ...)
    it('imageUrl は cacheKey が undefined のとき "?v=" を含まないパスを返すべき', ...)
  })
})
```

- **describe ブロックは仕様の章立て**。`パス生成` / `キャッシュキー付与` のようにドメイン語彙で切る。
- 「no-snap cases」「happy path」「edge cases」等の**テスト技法語**で切らない。

---

## 8. チェックリスト (計画生成時)

takumi が task を生成する際、test 生成を含む task には以下を満たすこと:

- [ ] test ファイルは `{module}.test.ts` **1 本のみ**
- [ ] `it('…')` 名が `{Subject} は {input} に対して {output} を返すべき` 骨格
- [ ] 禁止語彙 (PBT / P1 / property / 〜できるべき / 快適に / 裸の DB・API) を含まない
- [ ] describe 階層はドメイン章立て
- [ ] 機構 (fc.assert 等) は it body 内部に留まる
- [ ] 新規 `.pbt.test.ts` / `.mutation.test.ts` を作っていない
- [ ] (verify-loop 実行系の場合) tick artifact を tmp/gitignore 側に吐いている

---

## 関連リソース

| file | 用途 |
|---|---|
| `~/.claude/skills/takumi/strict-refactoring/rules-heuristics.md` (§14 テスト命名) | 命名規約の起源。本ドキュメントはこれを verify 側に継承 |
| `property-based.md` (同ディレクトリ) | PBT 6 流派。USS の it body で使う機構の詳細 |
| `component-test.md` (同ディレクトリ) | L2 の it body で使う機構 |
| `model-based.md` (同ディレクトリ) | L3 の it body (state 数 3+ の取扱) |
| `mutation.md` (同ディレクトリ) | Stryker 設定と tick artifact の ephemeral 化 |
| `README.md` (同ディレクトリ) | 5 原則の 6 番目として USS を参照 |
