# Mutation Testing (verify skill 内部参照)

`StrykerJS` でコードを意図的に壊し、テストが気づくか測る。
**coverage は「実行された」だけ。mutation score は「検証された」を測る**。

---

## 対応言語と tier (判定の原則)

L4 Mutation は言語によって使えるツールと operator の質が異なる。**ツールが「枯れているか」ではなく、生成されるミュータントの質 (operator coverage)** で tier を決める:

| tier | 言語 | ツール | operator 覆盖 | 本番影響 | 速度 | 役割 |
|---|---|---|---|---|---|---|
| **primary** | JS/TS | Stryker-JS | 基準 | ゼロ (AST 変換、dev time) | incremental 完備 | **L4 hard gate** |
| **primary** | Java/Kotlin | **PIT (PITest)** | Stryker 同等以上 (学術的に精緻) | ゼロ (bytecode mutation) | **Stryker より速い** (再コンパイル不要) | **L4 hard gate** |
| **primary** | C# | Stryker.NET | Stryker 系列、同 philosophy | ゼロ | incremental (`--since`) 可 | **L4 hard gate** |
| **primary** | Rust | cargo-mutants | Stryker より薄いが実用十分 (arith/bool/match/return) | ゼロ | **`--in-diff` 必須**、フル run は遅い | **L4 hard gate (incremental only)** |
| **primary** | Scala | Stryker4s | Stryker 系列 | ゼロ | Scala 再コンパイルが足を引っ張るが incremental 可 | L4 hard gate |
| **advisory** | Python | mutmut / cosmic-ray | operator set が薄い (算術・比較・論理のみ、array/string/obj mutator 欠落) | ゼロ | subprocess overhead で遅い | telemetry 参考値、hard gate 不可 |
| **advisory** | Go | gremlins | operator set 薄い (条件・算術・±1 のみ) | ゼロ | Go コンパイル速で実行自体は OK | telemetry 参考値、hard gate 不可 |
| **skip** | その他 | — | — | — | — | L4 完全 skip |

### 判定原則

- **本番コードへの影響はどのツールもゼロ** (すべて dev-time のソース or bytecode mutation)
- **primary tier の条件**: Stryker 同等の operator 覆盖 + 実用可能な速度 (incremental を含む)
- **advisory tier の理由**: ツールが未成熟なのではなく、operator 覆盖が Stryker レベルに届かず、mutation score を **真の品質指標として hard gate に使うには不十分**
- advisory 言語では **L1 PBT + L6 AI Review を主守り** とし、L4 は telemetry で trend を記録するだけ

### profile への記録

`.takumi/profiles/verify/{name}.yaml` に以下を記録:

```yaml
mutation_tool: "stryker-js"     # pit / stryker-net / cargo-mutants / stryker4s / mutmut / gremlins / none
l4_role: "primary"              # primary | advisory | skip
mutation_mode: "default"        # incremental_only (Rust 必須) | default
mutation_floor:
  task: 0.65                    # primary のみ。advisory / skip では null
  epic: 0.80
```

---

## なぜ必要か

Coverage 80% でも、`expect` の無いテストでも到達する。
テストの真の鋭さは mutation testing でしか分からない。

```ts
// オリジナル
function add(a, b) { return a + b }

// Stryker が自動で入れる Mutant 例
function add(a, b) { return a - b }    // + を - に
function add(a, b) { return 0 }         // 戻り値を 0 に
function add(a, b) { return a * b }     // + を * に

// 各 Mutant に対して既存テストを実行:
//   テスト落ちる → 🟢 Mutant kill (テスト鋭い)
//   テスト通る   → 🔴 Mutant survived (テスト穴)
```

---

## インストール (TypeScript + Vitest)

```bash
pnpm add -D \
  @stryker-mutator/core \
  @stryker-mutator/vitest-runner \
  @stryker-mutator/typescript-checker
```

---

## stryker.config.mjs (推奨設定)

```js
export default {
  packageManager: "pnpm",
  testRunner: "vitest",
  checkers: ["typescript"],
  tsconfigFile: "tsconfig.json",
  reporters: ["html", "progress", "clear-text"],

  // 重要: 全コードを mutate しない。純粋ロジックだけ
  mutate: [
    "src/features/*/utils/**/*.ts",
    "src/lib/prompt/**/*.ts",
    "src/lib/layout/**/*.ts",
    "!src/**/*.test.ts",
    "!src/**/*.legacy.ts",
  ],

  // 差分実行 (前回からの変更だけ)
  incremental: true,
  incrementalFile: ".stryker-tmp/incremental.json",

  // ローカル CPU を殺さない
  concurrency: 4,
  timeoutMS: 30000,

  // 合格基準
  thresholds: { high: 80, low: 60, break: 50 },

  // ノイズ排除
  ignorePatterns: ["dist", "data", ".next", "**/*.d.ts"],
  disableTypeChecks: "src/**/*.{ts,tsx}",
}
```

`.gitignore` に追加 (takumi の Step 0b bootstrap で自動追加される):

```
.stryker-tmp/
reports/mutation/
reports/stryker/

# verify-loop が tick 毎に生成する tick config (ephemeral、追跡禁止)
stryker.tick*.config.mjs
vitest.stryker-*.config.ts
```

> [!CAUTION]
> `/loop 10m /verify-loop` を回す運用では、tick 毎に `stryker.tick{N}.config.mjs` / `vitest.stryker-tick{N}.config.ts` が量産される。これらは **ephemeral** (1 tick 使い捨て) であり、**リポジトリに commit しない**。10+ 個の tick config が git 管理下に残ると構造的な debt になる (実際に発生した事例あり)。書き出し先は `tmp/stryker-ticks/` または `.stryker-tmp/` を推奨。

---

## 実行コマンド

```bash
# 開発時 (差分のみ、~30 秒)
pnpm stryker run --incremental

# 週次 CI (全量、~10 分)
pnpm stryker run --concurrency 8

# 特定ファイルだけ
pnpm stryker run --mutate src/lib/layout/calculate.ts
```

---

## ローカル現実時間 (M3 Mac)

| 対象 | 時間 |
|---|---|
| 差分のみ (10 ファイル) | **20-40 秒** ← pre-push でも余裕 |
| `src/features/*/utils` 全量 | 3-5 分 |
| 全 `src/` (やらない方がいい) | 30 分+ |

`mutate` を **pure utility に絞れば日常使える**。I/O 系を mutate するから遅くなる。

---

## どこを mutate すべきか / すべきでないか

### Mutate すべき (純粋ロジック)
- `src/features/*/utils/**` — 計算、変換、フィルタ
- `src/lib/prompt/**` — プロンプト構築
- `src/lib/layout/**` — レイアウト計算
- pure な validation, parser

### Mutate すべきでない (I/O 系、副作用持ち)
- `src/app/api/**/route.ts` — ルートハンドラ
- DB クエリ層
- React コンポーネント (DOM 検証は別物)
- 型定義のみのファイル

理由: I/O 系の mutation は実行コストが高い割に、何が壊れたか追いにくい。
**狙い撃ちで pure logic に集中するのが ROI 最大**。

---

## mutation score の解釈

| Score | 意味 | アクション |
|---|---|---|
| > 90% | 強い | 維持 |
| 70-90% | 平均的 | 生存 mutant を見て property 追加 |
| 50-70% | 弱い | テスト全体を見直す |
| < 50% | 飾り | テスト全削除して書き直しレベル |

`thresholds.break: 50` で 50% を下回ったら CI 失敗。

---

## PBT との連携 (相互強化)

PBT を書いて → mutation testing で property の鋭さを測る:

```
[ Property-Based Test を書く ]
         ↓
[ Mutation Testing で評価 ]
         ↓
Mutant 生き残った = property がまだ甘い
         ↓
[ 別の property を追加 ]
         ↓
Mutant kill → mutation score 上昇
```

→ **PBT がコードのバグ検出器、Mutation が PBT の検出器の検出器 (メタ)**。

---

## Subsumption 解析 (MSS compression 用)

Phase 2 Compression (`~/.claude/skills/takumi/verify/compression.md`) で test を削除判定するための前処理。

`stryker.config.mjs` に JSON reporter を有効化:

```js
reporters: ["json", "progress", "clear-text"],  // json を追加
jsonReporter: { fileName: "reports/mutation/mutation.json" }
```

full run で report 取得 (incremental は killed-by 情報が不十分):

```bash
pnpm stryker run --mutate src/path/to/file.ts
```

出力 `reports/mutation/mutation.json` の schema:

```jsonc
{
  "files": {
    "src/path/to/file.ts": {
      "mutants": [
        {
          "id": "0",
          "mutatorName": "StringLiteral",
          "status": "Killed",
          "killedBy": ["11"],    // 殺した test id
          "coveredBy": ["11", "12"]  // 実行した test id
        }
      ]
    }
  },
  "testFiles": {
    "src/path/to/__tests__/file.test.ts": {
      "tests": [{ "id": "11", "name": "...", "location": {...} }]
    }
  }
}
```

**subsumption 判定**: 各 test の `killed(t) = {mutant.id | t ∈ mutant.killedBy}` を計算し、`killed(A) ⊃ killed(B)` なら B を削除候補。削除手順は `compression.md` §4 を厳守 (1 件ずつ削除して再実行)。

**zero-contribution 判定**: test が `coveredBy` には含まれるが `killedBy` に一度も登場しない → 飾り、削除候補。

---

## CI 統合例 (週次)

```yaml
# .github/workflows/mutation.yml
on:
  schedule:
    - cron: "0 3 * * 0"  # 毎週日曜 3:00 UTC
  workflow_dispatch:

jobs:
  mutation:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
      - run: pnpm install
      - run: pnpm stryker run --concurrency 8
      - uses: actions/upload-artifact@v4
        with:
          name: mutation-report
          path: reports/mutation/
```

---

## pre-push hook 統合 (差分のみ)

```bash
# .husky/pre-push
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

pnpm stryker run --incremental || {
  echo "Mutation score below threshold. Push blocked."
  exit 1
}
```

---

## 制約

- **Full run は週次のみ**。pre-push は incremental
- `mutate` scope は pure logic に限定 (I/O 系を入れない)
- `thresholds.break` で CI 失敗を強制
- mutation score < coverage の関係を理解する (mutation は厳しい指標)
