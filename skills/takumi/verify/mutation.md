# Mutation Testing (verify skill 内部参照)

`StrykerJS` でコードを意図的に壊し、テストが気づくか測る。
**coverage は「実行された」だけ。mutation score は「検証された」を測る**。

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

`.gitignore` に追加:

```
.stryker-tmp/
reports/mutation/
```

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
