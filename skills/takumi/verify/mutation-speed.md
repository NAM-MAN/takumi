# Mutation 速度 tuning (verify skill 内部参照)

`mutation.md` から分離した Stryker 速度化 decision tree と config tuning。**単発で速度を稼ぐ** (incremental / scope 絞り) のか、**verify-loop で鋭くしていく** のかを分けて考える。

> [!NOTE]
> **単発 Stryker は measurement 用途、sharpening は verify-loop 前提**。速度化は主に「観測サイクルを短くして feedback を速める」のが目的。詳細 → [`mutation.md`](mutation.md) の CAUTION、[`../verify-loop/README.md`](../verify-loop/README.md)。

---

## 速度 decision tree (経験則、数値は環境依存)

遅いと感じたら上から順に適用。下ほど高負荷なので早期に止める。**数値は 1 repo / 1 環境 で観測した目安**で、実 test 数 / mutant 数 / warm cache 有無で大きく変動する。

軸は「ファイル数」だけでなく以下も合わせて判断:
- **推定 mutant 数** (1 huge file は 20 tiny files と同等以上にかかる)
- **touched pure modules** の比率 (I/O 系が多いと per-mutant が遅い)
- **cold vs warm cache** (初回 vs 再実行)

```
推定 mutant 数 / scope?
├─ mutant < 30 (1 小 file)         → pnpm stryker run --mutate <path>          (warm: ~15-20s)
├─ mutant 30-200 (PR 差分 <20 files) → --incremental + 単一 run                 (~1-3min)
├─ mutant 200-1000 (feature)         → pnpm stryker run --incremental           (5-15 min)
└─ mutant > 1000 (全量)              → CI weekly のみ、ローカルでやらない         (30min+)
```

### ローカル現実時間 (M3 Mac、Stryker-JS)

| 対象 | 時間 | 使用シーン |
|---|---|---|
| 1 ファイル `--mutate <path>` cold | **~50 秒** | 初回 / incremental state 破棄時 |
| 1 ファイル `--mutate <path>` warm (incremental) | **~15-20 秒** | incremental cache hit で 3x 速い |
| 差分のみ (10 ファイル、incremental) | 20-40 秒 | pre-push hook |
| feature 単位 | 3-5 分 | feature 完了時の自己チェック |
| 全 `src/` | 30 分+ | CI weekly のみ |

実測例 (name_editor、M3 Mac):
- 同 project で `--mutate src/lib/utils.ts` 初回実行 = **50 秒**
- 続いて `--mutate src/lib/prompt-engine/expand.ts` = **16 秒** (incremental 再利用で 3.1x 速い)

---

## `--in-diff` 相当を Stryker JS で実現する

Stryker JS には `--in-diff` フラグは無いが、`--mutate` と git-diff の組合せで同じことができる。**複数ファイルを 1 回の Stryker run に渡す**のが重要 (ファイル毎に起動すると process overhead で遅くなる):

```bash
# PR 差分の src/ ファイルだけを 1 run で mutate (カンマ区切りで --mutate に渡す)
CHANGED=$(git diff --name-only origin/master...HEAD -- 'src/**/*.ts' 'src/**/*.tsx' \
  | grep -v test | paste -sd ',' -)

[ -n "$CHANGED" ] && pnpm stryker run --mutate "$CHANGED" --incremental
```

ファイル数が 20 を超えたら `--mutate` の引数肥大より `--incremental` 単独にフォールバックする方が安定する。Rust cargo-mutants は **`--in-diff` が本物の CLI フラグ** として実装されており、JS/TS は snippet で代替する (思想は同じ)。

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

### 主要 config の効果 (環境依存、目安)

数値は小中規模の JS/TS repo + Vitest + M3 Mac での観測。**SLO ではなく運用上の当たり**として扱い、自 project で必ず計測してから結論する。

| config | 効果 | 観測目安 (環境依存) |
|---|---|---|
| `coverageAnalysis: 'perTest'` | 無関係 test の skip | 大幅な短縮、**必須**級 |
| `concurrency: N` | N worker 並列 | CPU 数 × 0.7 が sweet spot |
| `incremental: true` | 前回 state 再利用 | 再実行で顕著に速い (cold→warm) |
| `checkers: ['typescript']` | 型エラー mutant 事前排除 | mutant 数を数%〜 reduction |
| `ignoreStatic: true` | 静的値 skip (Stryker 6.x 以降想定、installed version を必ず確認) | 数%〜 reduction |
| `excludedMutations` | mutator 除外 | 個別 mutator の fp 率依存 |

> [!WARNING]
> config 例は **Stryker 6.x 系列で確認**。installed version が異なる場合は `pnpm stryker --version` を確認し、公式 docs で option 名が変わっていないか検証してから適用してください。

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
  | grep -v test | paste -sd ',' -)

[ -z "$CHANGED" ] && exit 0

# 複数ファイルを 1 run に渡す (xargs で file 毎 spawn は overhead で遅くなる)
N=$(echo "$CHANGED" | tr ',' '\n' | wc -l)
if [ "$N" -lt 20 ]; then
  pnpm stryker run --mutate "$CHANGED" --incremental
else
  # 20 file 超は incremental 単独にフォールバック (scope 指定より state 再利用の方が効く)
  pnpm stryker run --incremental
fi
```

差分が 0 件なら即 exit。1-10 ファイルなら 30 秒以内、20+ なら `--incremental` 単独に切替。

---

## Worker pool sizing 公式 (D1) と RSS adaptive monitor (A3)

`concurrency: 4` のような手動マジック値を環境依存の機械算出に置き換え、加えて子 process tree の RSS を sample して OOM を早期検知する。

### D1: worker 数を機械的に決める公式

```
workers = min(
  cpu_cores * 0.7,                          # CPU 上限 (IO bound 込みで 0.7)
  floor(usable_RAM_GB / per_worker_RAM_GB)  # メモリ上限
)
usable_RAM_GB = total_RAM_GB - OS_overhead(4GB) - editor/browser(4GB)
```

### per_worker_RAM 経験値 (1 mutant 走行時、自 project で必ず計測)

| ツール | 経験値 |
|---|---|
| Stryker JS + vitest | 1.5-2.0 GB |
| Stryker JS + jest | 2.0-3.0 GB |
| PIT (Java) | 0.8-1.2 GB |
| cargo-mutants (Rust) | 0.5-1.0 GB |
| Stryker.NET | 1.5-2.5 GB |

### bash snippet (macOS / Linux)

```bash
#!/usr/bin/env bash
# .takumi/verify-loop/calc-workers.sh
set -euo pipefail
CPU=$(sysctl -n hw.ncpu 2>/dev/null || nproc 2>/dev/null || echo 8)
CPU_LIMIT=$(awk -v c="$CPU" 'BEGIN{print int(c*0.7)}')
[ "$CPU_LIMIT" -lt 1 ] && CPU_LIMIT=1
TOTAL_BYTES=$(sysctl -n hw.memsize 2>/dev/null || awk '/MemTotal/{print $2*1024}' /proc/meminfo)
TOTAL_GB=$((TOTAL_BYTES / 1024 / 1024 / 1024))
USABLE_GB=$((TOTAL_GB - 8)); [ $USABLE_GB -lt 2 ] && USABLE_GB=2
PER_WORKER_GB="${PER_WORKER_GB:-2}"
MEM_LIMIT=$((USABLE_GB / PER_WORKER_GB)); [ $MEM_LIMIT -lt 1 ] && MEM_LIMIT=1
W=$CPU_LIMIT; [ $MEM_LIMIT -lt $W ] && W=$MEM_LIMIT
echo $W
```

`pnpm stryker run --concurrency "$(./calc-workers.sh)" --incremental` のように Stryker の `--concurrency` 値として注入する。

### A3: RSS adaptive monitor

Stryker は process 起動後の concurrency を動的変更する API を持たない。代わりに `pgrep -P <pid>` で子 process tree を 1Hz で sample し、合計 RSS を ledger に記録。threshold 超過時は **(1) 次回 run で workers を 1 減らす**、**(2) 12GB 超で warning ledger entry**、**(3) 14GB 超で SIGTERM** のような段階対応を取る。

```bash
#!/usr/bin/env bash
# .takumi/verify-loop/rss-monitor.sh <parent_pid> <out_file> <threshold_mb>
set -uo pipefail
PARENT="${1:?}"; OUT="${2:?}"; TH="${3:-12000}"
MAX=0; OVER=0
while kill -0 "$PARENT" 2>/dev/null; do
  PIDS=$(pgrep -P "$PARENT" 2>/dev/null | tr '\n' ' ')
  TOTAL=0
  for p in $PARENT $PIDS; do
    R=$(ps -o rss= -p "$p" 2>/dev/null | tr -d ' ' || echo 0)
    [ -n "$R" ] && TOTAL=$((TOTAL + R))
  done
  MB=$((TOTAL / 1024))
  [ $MB -gt $MAX ] && MAX=$MB
  [ $MB -gt $TH ] && OVER=$((OVER + 1))
  sleep 1
done
echo "{\"max_rss_mb\":$MAX,\"above_threshold_count\":$OVER,\"threshold_mb\":$TH}" > "$OUT"
```

stryker を background で起動 → このスクリプトを並行起動 → wait stryker → monitor が exit 時に JSON 出力。集計は telemetry ledger に追記。

---

## 関連

- [`mutation.md`](mutation.md) — tier 判定、config 全体、CI 週次
- [`../verify-loop/README.md`](../verify-loop/README.md) — sharpening の継続ループ
- [`property-based.md`](property-based.md) — pure 層の loop 代替手段
- [`compression-vitals.md`](compression-vitals.md) — B-stack (寿命 ledger + cost-aware PRUNE)
