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

## 3. 命名規約 (strict-refactoring Rule 14 を継承) — 3 階層で切り替える

### 3.1 骨格 (階層ごとに必須パターンが異なる)

| テスト種別 | パターン | 典型対象 |
|---|---|---|
| **ユニット (単体)** | `{Subject} は {input} に対して {output} を返すべき` | pure 関数、utils、parser、builder、reducer の遷移 |
| **結合** | `{A} を {action} すると {result} として記録されるべき` | repository、state machine 全体、画面コンポーネント、Pending Object のコミット |
| **ユーザー (E2E)** | `{User} が {action} すると {observable} が表示されるべき` | Playwright smoke、ユーザーシナリオ |

### 3.2 階層判定フロー (AI が迷わないように)

```
テストが叩いているもの は?
├─ 純粋関数 (副作用なし、入力 → 出力)         → ユニット
├─ 状態を持つ reducer / selector (pure)        → ユニット
├─ repository / DB アクセス層 (副作用あり)     → 結合
├─ React component (render + event)            → 結合
├─ state machine 全体を操作列で歩く            → 結合
├─ Pending Object を作って commit まで一気通貫 → 結合
├─ 実ブラウザ + 実ネットワーク (Playwright)    → ユーザー
└─ 複数 system 境界をまたぐ (DB + API + UI)    → ユーザー
```

verify 6 層との対応:

| verify layer | 命名階層 |
|---|---|
| L1 Property-Based (pure) | **ユニット** |
| L2 Component Test | **結合** (DOM + interaction を叩くため) |
| L3 Model-based / Differential | **結合** |
| L4 Mutation | (命名対象外、L1-L3 の鋭さを測る手段) |
| L5 Smoke E2E | **ユーザー** |
| L6 AI Review | (命名対象外) |

### 3.3 ファイル内の統一性 (重要)

> [!IMPORTANT]
> **1 ファイル (= 1 unit) 内で異なる階層の命名を混在させない**。
> 対象の layer はファイル名と対象コードから自動的に決まるため、同一 test file では**常に同じ骨格**を使う。
>
> - `src/lib/images/__tests__/cache-key.test.ts` → 全部ユニット骨格
> - `src/features/editor/__tests__/snap.test.ts` → 全部ユニット骨格 (pure 幾何計算)
> - `src/components/ui/__tests__/button.ct.test.tsx` → 全部結合骨格 (DOM 叩く)
> - `e2e/login.spec.ts` → 全部ユーザー骨格
>
> 混在させてはいけない理由: 読者が "この test は何階層?" と毎 it で判断しなければならず、**仕様書としての読みやすさが崩れる**。

### 3.4 禁止語彙 (全階層共通)

- **機構名**: `PBT:`, `P1`/`P2`, `property:`, `metamorphic:`, `commands:`, `mutation-killer:`, `regression:`
- **曖昧表現**: 「〜できるべき」「正しく動くべき」「快適に」「適切に」「きちんと」
- **裸の技術語**: `DB`, `API`, `HTTP`, `endpoint`, `handler`, `controller` (ドメイン語彙に翻訳する)
- **番号接頭辞**: `01`, `T1`, `case A` (順序に意味があるなら describe ブロックに切り出す)

### 3.5 具体例 (○ / ×) — 階層ごと

#### ユニット (単体)

```ts
// × 機構名、番号接頭辞
it('P1: without cacheKey → no "?v=" suffix', ...)
it('PBT: base path always contains /api/images/{id}', ...)

// ○ {Subject} は {input} に対して {output} を返すべき
it('imageUrl は cacheKey が無いとき "?v=" を含まないパスを返すべき', ...)
it('imageUrl は id をパス中に 1 回だけ含めて返すべき', ...)
it('imageCacheKey は同じ image に対して同じ文字列を返すべき', ...)
it('calcSnap は rect の幅と高さを変えずに返すべき', ...)
```

#### 結合

```ts
// × 曖昧 / 機構名
it('CartReducer properly handles add action', ...)
it('commands: item added', ...)

// ○ {A} を {action} すると {result} として記録されるべき
it('カートに商品を追加すると items に 1 件増えて total が加算されるべき', ...)
it('Note を submit すると SubmittedNote として repository に保存されるべき', ...)
it('Button をクリックすると onClick 引数に渡した関数が 1 回だけ呼ばれるべき', ...)
```

#### ユーザー (E2E)

```ts
// × 技術語 / 観測が曖昧
it('POST /login returns 200', ...)
it('ログイン成功時の挙動', ...)

// ○ {User} が {action} すると {observable} が表示されるべき
it('ユーザーがメールとパスワードでログインすると、ダッシュボードのホーム画面が表示されるべき', ...)
it('未ログインユーザーが管理画面 URL を直接開くと、ログインページに遷移するべき', ...)
it('ユーザーがカートに 3 件追加して決済すると、注文完了メッセージと注文番号が表示されるべき', ...)
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

## 5. ミューテーションフィードバックの戻し方 (3 forces: SHARPEN > PRUNE > ADD)

Stryker が生き残った mutant を報告したとき、**新ファイルは作らない**。さらに、対応は 3 つの力があり**この優先順位を厳守**する。AI は ADD bias に陥りやすいため、明示的に順序を固定する:

### 5.1 SHARPEN (最優先) — 既存 `it('…べき')` の assertion を鋭くする

まず、生存 mutant を覆っているテストの **assertion を強化できないか** を検討。

| before (鈍い) | after (鋭い) |
|---|---|
| `expect(result).toBeTruthy()` | `expect(result).toBe('/api/images/42/file')` |
| `expect(arr.length).toBe(3)` | `expect(arr).toEqual([...expected 具体値])` |
| `expect(url).toContain('?v=')` | `expect(url).toBe(`${base}?v=${key}`)` |
| `expect(obj).toHaveProperty('id')` | `expect(obj).toEqual({ id: X, ... 完全形 })` |

**2 回以上 SHARPEN を試みる**。それでも殺せなければ次へ。

### 5.2 PRUNE (同格で重要) — 冗長・無意味なテストを削除

AI の add-bias を構造で矯正する **first-class action**。対象:

- **Subsumption**: test A が殺す mutant 集合が test B の上位集合 → **B を削除**
- **Zero-contribution**: mutate 範囲内のコードをカバーしているのに mutant を 1 つも殺さないテスト → **削除** (飾り)
- **機構名が残存するテスト**: `P1:`, `PBT:`, `regression:` 等の接頭辞は仕様文ではない → **リネーム or 削除**
- **spec-density < 0.3 killed/LOC のテスト**: 薄すぎる → リライト or 削除

削除後は必ず **mutation を再実行して score 不変を確認**。下がったら revert し「必須」flag を立てる。詳細 recipe は `compression.md`。

### 5.3 ADD (最後の手段) — 新しい `it('…べき')` を同じ describe 内に追加

SHARPEN で殺せず、かつその仕様が既存 `it` ではカバーされていない場合のみ。例: edge case を語るドメイン文 (`Money は 0 に対して Zero 表現を返すべき`) を追加。

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

## 8. Minimal Spec Suite (MSS) — 最小かつ最鋭

USS の構造 (1 unit = 1 test file) と SHARPEN > PRUNE > ADD の優先順位から導かれる自然な帰結:

> **テストは最小数かつ最鋭を目指す**。mutation score が目標に達したら、冗長・鈍・無意味なテストを削除して suite を圧縮する。**追加だけでなく削除も first-class action**。

MSS が達成された状態とは:

- 各 `it('…べき')` が **仕様の原子命題** 1 つに対応
- どの test を削っても mutation score が下がる (= 全 test が unique な仕様を守っている)
- suite 全体の実行時間が budget 以内 (pure logic < 500ms/file、component < 2s/file)
- spec-density ≥ 0.5 killed_mutants/LOC (per test)

到達経路:

1. **Phase 1 (Expansion)**: mutation score を目標 (通常 80%) まで引き上げる。SHARPEN > ADD
2. **Phase 2 (Compression)**: score 到達後、subsumption / zero-contribution / 低 spec-density テストを PRUNE
3. **Phase 3 (Maintenance)**: PR ごとに watch。drift したら tick で鋭化 or 削除

詳細 recipe は **`compression.md`**、Phase 実装は **`~/.claude/skills/takumi/verify-loop/runtime.md`** の 3 Phase 構成を参照。

---

## 9. チェックリスト (計画生成時)

takumi が task を生成する際、test 生成を含む task には以下を満たすこと:

- [ ] test ファイルは `{module}.test.ts` **1 本のみ**
- [ ] `it('…')` 名が `{Subject} は {input} に対して {output} を返すべき` 骨格
- [ ] 禁止語彙 (PBT / P1 / property / 〜できるべき / 快適に / 裸の DB・API) を含まない
- [ ] describe 階層はドメイン章立て
- [ ] 機構 (fc.assert 等) は it body 内部に留まる
- [ ] 新規 `.pbt.test.ts` / `.mutation.test.ts` を作っていない
- [ ] (verify-loop 実行系の場合) tick artifact を tmp/gitignore 側に吐いている
- [ ] **mutation 対応は SHARPEN > PRUNE > ADD の順で検討**
- [ ] **(compression phase の場合) 削除後に mutation 再実行で score 不変を確認**

---

## 関連リソース

| file | 用途 |
|---|---|
| `~/.claude/skills/takumi/strict-refactoring/rules-heuristics.md` (§14 テスト命名) | 命名規約の起源。本ドキュメントはこれを verify 側に継承 |
| `property-based.md` (同ディレクトリ) | PBT 6 流派。USS の it body で使う機構の詳細 |
| `component-test.md` (同ディレクトリ) | L2 の it body で使う機構 |
| `model-based.md` (同ディレクトリ) | L3 の it body (state 数 3+ の取扱) |
| `mutation.md` (同ディレクトリ) | Stryker 設定と tick artifact、subsumption 解析 |
| **`compression.md` (同ディレクトリ)** | **MSS の実装 recipe (subsumption / zero-contribution / runtime budget / spec-density)** |
| `README.md` (同ディレクトリ) | 7 原則の第 6 (USS) / 第 7 (MSS) として参照 |
