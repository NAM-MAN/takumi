# Mutation 速度 tuning (verify skill 内部参照)

`mutation.md` から分離した Stryker 速度化 decision tree と config tuning。**単発で速度を稼ぐ** (incremental / scope 絞り) のか、**verify-loop で鋭くしていく** のかを分けて考える。

> [!NOTE]
> **単発 Stryker は measurement 用途、sharpening は verify-loop 前提**。速度化は主に「観測サイクルを短くして feedback を速める」のが目的。詳細 → [`mutation.md`](mutation.md) の CAUTION、[`../verify-loop/README.md`](../verify-loop/README.md)。

---

## 速度 decision tree

遅いと感じたら上から順に適用。下ほど高負荷なので早期に止める。

```
変更範囲は何ファイル?
├─ 1 ファイル                    → pnpm stryker run --mutate <path>          (最速、~20s)
├─ git diff (PR 差分、<20 files) → git-diff filter + --mutate                 (~30s-1min)
├─ feature 単位 (<100 files)     → pnpm stryker run --incremental             (2-5 min)
└─ 全量 (>100 files)             → CI weekly のみ、ローカルでやらない         (30min+)
```

### ローカル現実時間 (M3 Mac、Stryker-JS)

| 対象 | 時間 | 使用シーン |
|---|---|---|
| 1 ファイル `--mutate <path>` | **10-30 秒** | 開発中の確認、`it` 追加直後 |
| 差分のみ (10 ファイル、incremental) | 20-40 秒 | pre-push hook |
| feature 単位 | 3-5 分 | feature 完了時の自己チェック |
| 全 `src/` | 30 分+ | CI weekly のみ |

---

## `--in-diff` 相当を Stryker JS で実現する

Stryker JS には `--in-diff` フラグは無いが、`--mutate` と git-diff の組合せで同じことができる:

```bash
# PR 差分の src/ ファイルだけを mutate
git diff --name-only origin/master...HEAD -- 'src/**/*.ts' 'src/**/*.tsx' \
  | grep -v test \
  | xargs -I{} pnpm stryker run --mutate {} --incremental
```

Rust cargo-mutants は **`--in-diff` が本物の CLI フラグ** として実装されており、JS/TS は snippet で代替する (いずれも「差分だけ mutate」で速度を稼ぐ思想は同じ)。

---

## Stryker config での tuning

```js
// stryker.config.mjs
const config = {
  coverageAnalysis: 'perTest',    // ★ 最重要: dry-run 時に per-test coverage を取り、
                                  //   mutant 毎に無関係 test を skip。これが無いと毎 mutant で
                                  //   全 test 走行して 10-100 倍遅い
  concurrency: 4,                 // デフォルトは CPU 数。IO bound なら CPU-1 が最速
  checkers: ['typescript'],       // 型エラー mutant を事前に排除 (実行コスト 0)
  tempDirName: '.stryker-tmp',
  incremental: true,              // 前回 state を再利用、変化ない mutant は skip
  incrementalFile: '.stryker-tmp/incremental.json',
  mutator: {
    excludedMutations: [          // 効果の薄い mutator は除外
      'StringLiteral',            // 例: 文字列変更は表層すぎて fp 多
      'ArrayDeclaration',         // 配列宣言のゼロ化は誤検知多
    ],
  },
  ignoreStatic: true,             // 静的文字列/bool などホットパス外は skip (Stryker 5.x+)
}
```

### 主要 config の効果

| config | 効果 | 目安 |
|---|---|---|
| `coverageAnalysis: 'perTest'` | 無関係 test の skip | **10-100x** speed up、必須 |
| `concurrency: N` | N worker 並列 | CPU 数 × 0.7 が sweet spot |
| `incremental: true` | 前回 state 再利用 | **2-10x** speed up (2 回目以降) |
| `checkers: ['typescript']` | 型エラー mutant 事前排除 | **5-20% reduction** in mutant count |
| `ignoreStatic: true` | 静的値 skip | 5-15% reduction |
| `excludedMutations` | mutator 除外 | 個別 mutator の fp 率依存 |

---

## 単発 vs ループ の使い分け

| モード | 使いどころ | test は鋭くなる? |
|---|---|---|
| 単発 (`--mutate <file>`) | **観測** : release gate、PR チェック、健康診断 | ❌ (観測器具のみ) |
| verify-loop (`/loop 10m /verify-loop`) | **sharpening** : observe → fix → re-observe の機械化 | ✅ (10 分間隔で鋭くなる) |
| PBT (`fast-check` + `it(... PBT body)`) | **pure 層の先回り** : 1 property で多 mutant kill | ✅ (ループ不要、pure 限定) |

---

## pre-push hook 統合 (差分のみ、最速)

```bash
#!/usr/bin/env bash
# .husky/pre-push
set -euo pipefail

CHANGED=$(git diff --name-only origin/master...HEAD -- 'src/**/*.ts' 'src/**/*.tsx' \
  | grep -v test || true)

[ -z "$CHANGED" ] && exit 0

echo "$CHANGED" | xargs -I{} pnpm stryker run --mutate {} --incremental
```

差分が 0 件なら即 exit。1-10 ファイルなら 30 秒以内、それ以上なら「feature 単位で `--incremental` 回す」方が合理的。

---

## 関連

- [`mutation.md`](mutation.md) — tier 判定、config 全体、CI 週次
- [`../verify-loop/README.md`](../verify-loop/README.md) — sharpening の継続ループ
- [`property-based.md`](property-based.md) — pure 層の loop 代替手段
