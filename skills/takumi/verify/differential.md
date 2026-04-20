# Differential Testing (verify skill 内部参照)

旧実装 / 別実装と出力を比較する流派。
**「正解」が分からなくても「割れた = どっちかがバグ」は確実**。

---

## 結論: 同一ファイル 2 export が最軽

`git worktree` も `feature flag` も差分テストには重い。**同一ファイルに 2 export** が運用負荷最小。

---

## 3 アプローチ比較

### A. Feature flag (差分テスト用途では NG)

```ts
export function exportPsd(layout) {
  return process.env.PSD_V2 === "true"
    ? exportPsdV2(layout)
    : exportPsdV1(layout)
}
```

| 観点 | 評価 |
|---|---|
| テストでの差分検証 | flag を bypass して内部関数を import する必要 → 設計が破綻 |
| 本番デプロイ制御 | canary/A-B には最適 |
| 削除コスト | flag plumbing + impl の 2 段階削除 |

→ Feature flag は **本番ロールアウト管理**用。差分テスト用途では使わない。

### B. ファイル分割 (`.legacy.ts`)

```
src/features/export/
├── psd-exporter.ts          ← 本番
└── psd-exporter.legacy.ts   ← 旧実装 (差分比較の基準)
```

| 観点 | 評価 |
|---|---|
| テストでの差分検証 | import するだけ |
| 本番への混入リスク | 別ファイルなので誤 import のリスク微量 |
| 視認性 | 別ファイルだと「なぜ存在?」が分かりにくい |

→ 悪くないが C の方が良い。

### C. 同一ファイル・2 export (推奨)

```ts
// src/features/export/psd-exporter.ts

export function exportPsd(layout: Layout): Buffer {
  // 新実装 (本番用)
}

/**
 * @deprecated 差分テスト用に残置。2026-05-31 までに削除予定。
 * 本番コードからの import 禁止 (eslint-plugin-deprecation で警告)。
 */
export function exportPsdLegacy(layout: Layout): Buffer {
  // 旧実装 (差分比較の基準として残置)
}
```

| 観点 | 評価 |
|---|---|
| テストでの差分検証 | 同じファイルから 2 つ import |
| 本番への混入リスク | `@deprecated` + ESLint で誤 import 即警告 |
| 削除コスト | 関数 1 つ削除 |
| 視認性 | コメントで自己説明 |
| dead code 検出 | `knip` / `ts-prune` が legacy 未使用を検知 |

---

## 差分テストの書き方

```ts
// src/features/export/__tests__/psd-exporter.diff.test.ts
import fc from "fast-check"
import { exportPsd, exportPsdLegacy } from "../psd-exporter"
import { layoutArb } from "@/test/pbt-utils"

describe("PSD exporter differential", () => {
  test("v2 と legacy は同じ buffer を返す", () => {
    fc.assert(
      fc.asyncProperty(layoutArb, async (layout) => {
        const [a, b] = await Promise.all([
          exportPsd(layout),
          exportPsdLegacy(layout),
        ])
        expect(structuralEqual(a, b)).toBe(true)
      }),
      { numRuns: 50 }
    )
  })
})
```

---

## 運用ルール (3 点)

### 1. `@deprecated` JSDoc + 削除予定日

```ts
/**
 * @deprecated 差分テスト用。2026-05-31 削除予定。
 */
export function exportPsdLegacy(...) { ... }
```

→ IDE で取消線が出る + grep で削除候補が見つかる。

### 2. ESLint で本番からの import を禁止

```js
// .eslintrc.js
module.exports = {
  rules: {
    "no-restricted-imports": ["error", {
      patterns: [{
        group: ["**/psd-exporter"],
        importNames: ["exportPsdLegacy"],
        message: "legacy 実装は test ファイルからのみ使用可"
      }]
    }]
  },
  overrides: [{
    files: ["**/__tests__/**", "**/*.test.ts"],
    rules: { "no-restricted-imports": "off" }
  }]
}
```

### 3. knip で削除候補を週次通知

```js
// knip.json
{
  "ignore": ["**/*.test.ts"],
  "rules": {
    "exports": "warn"  // 未使用 export を警告
  }
}
```

→ 週次 CI で `knip` を走らせ、`exportPsdLegacy` が test からも未使用になったら削除候補として通知。

---

## 削除のタイミング

```
[ Day 0  ] legacy 関数を残置、2 export パターン開始
[ Day 1- ] 差分テストが通り続ける限り安全
[ Day N  ] リファクタが安定 → @deprecated コメントの削除予定日に達する
[ Day N+1] legacy export と差分テストを削除
```

削除コミット例:
```
chore(export): remove psd-exporter.ts legacy export
- exportPsdLegacy was kept for differential testing
- v2 stable for 30 days, no diffs detected
- removing to reduce maintenance burden
```

---

## 例外: git worktree (大規模アーキ刷新時のみ)

リポジトリ構造を大幅に変える刷新時のみ:

```bash
git worktree add ../project-stable v1.0.0
pnpm test:differential  # 内部で ../project-stable を import
```

→ **月 1 回あるかないかのケース**。default 無効。

---

## 本番 shadow traffic との区別

差分テストとは別に、**本番で両実装を並走** させたい時は feature flag:

```ts
async function exportPsdShadow(layout: Layout) {
  const [primary, shadow] = await Promise.all([
    exportPsd(layout),       // ユーザーに返す
    exportPsdLegacy(layout)  // 比較ログ用
  ])
  if (!structuralEqual(primary, shadow)) {
    logger.warn("psd_diff_detected", { layoutId: layout.id })
  }
  return primary
}
```

→ これは **本番監視であってローカルテストの代替ではない**。混同しないこと。

---

## 制約

- legacy 関数には `@deprecated` + 削除予定日を必ず明記
- ESLint で本番からの import を禁止 (test 例外)
- 削除予定日を過ぎたら必ず削除 (永続化禁止)
- git worktree は大規模刷新の例外用途のみ
- 差分テストは `numRuns: 50` 程度で十分 (出力比較が重い)
