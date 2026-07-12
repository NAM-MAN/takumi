# verify-loop 初回 seed 手順

`state.json` が無い時に実行する。glob でファイルを集め layer A-E に分類する。

## 手順 (Agent 内で実行)

```ts
import { globSync } from 'glob' // or shell
import { writeFileSync, mkdirSync } from 'fs'

const LAYERS = {
  A: [
    'src/lib/**/*.ts',
    'src/features/*/utils/**/*.ts',
  ],
  B: [
    'src/features/*/store/**/*.ts',
    'src/features/*/hooks/use-*.ts',
  ],
  C: [
    'src/features/*/actions/**-repository.ts',
    'src/lib/db/**/*.ts',
  ],
  D: [
    'src/app/api/**/route.ts',
  ],
  E: [
    'src/features/*/components/**/*.tsx',
  ],
}

const EXCLUDE = [
  '**/*.test.ts',
  '**/*.test.tsx',
  '**/*.spec.ts',
  '**/__tests__/**',
  '**/types/**',   // 型定義はロジックではない
  '**/schemas.ts', // zod schema は外部実装
]

function buildLayer(globs: string[]) {
  const files = new Set<string>()
  for (const g of globs) {
    for (const f of globSync(g, { ignore: EXCLUDE })) {
      files.add(f)
    }
  }
  return [...files].sort().map(path => ({
    path,
    status: 'pending',
    best_score: 0,
    last_score: 0,
    last_tick_at: null,
    tick_count: 0,
    survivors_hash: null,
    rolling_avg: 0,
  }))
}

const state = {
  status: 'in_progress',
  started_at: new Date().toISOString(),
  current_layer: 'A',
  layer_order: ['A', 'B', 'C', 'D', 'E'],
  layers: {
    A: { status: 'in_progress', files: buildLayer(LAYERS.A), score_goal: 80, rolling_threshold_files: 5 },
    B: { status: 'pending', files: buildLayer(LAYERS.B), score_goal: 80, rolling_threshold_files: 5 },
    C: { status: 'pending', files: buildLayer(LAYERS.C), score_goal: 80, rolling_threshold_files: 5 },
    D: { status: 'pending', files: buildLayer(LAYERS.D), score_goal: 80, rolling_threshold_files: 5 },
    E: { status: 'pending', files: buildLayer(LAYERS.E), score_goal: 80, rolling_threshold_files: 5 },
  },
  tabu_patterns: [],
  tick_counter: 0,
  history: [],
}

mkdirSync('.takumi/verify-loop', { recursive: true })
mkdirSync('.takumi/verify-loop/reports', { recursive: true })
writeFileSync('.takumi/verify-loop/state.json', JSON.stringify(state, null, 2))
```

## サイズ感 (中規模 Next.js app の目安)

| Layer | 推定ファイル数 | 1 file あたり tick 数 | 期待 tick 数 |
|-------|---------------|----------------------|-------------|
| A 純粋ロジック | 50-100 | 2-3 | 100-300 |
| B 状態 | 15-30 | 3-5 | 45-150 |
| C 永続化境界 | 30-60 | 2-4 | 60-240 |
| D API 入口 | 80+ | 2-3 | 160-240 |
| E UI component | 50+ | 3-5 | 150-250 |

10 分/tick で合計 **500-1200 tick ≈ 80-200 時間** の継続ループ。
`/loop 10m /verify-loop` をバックグラウンドで回し続ける想定。

## 初期 layer を変更したい場合

`state.json` を編集するのではなく、**新規 seed を走らせるか、CLI で graduated を reset** する:

```bash
# layer A を graduated から pending に戻す
jq '.layers.A.files |= map(.status = "pending")' \
  .takumi/verify-loop/state.json > tmp && mv tmp .takumi/verify-loop/state.json
```

## ファイル除外ポリシー

以下は layer に含めない (mutation testing に向かない):
- test ファイル自身
- `types/` 配下 (型だけ)
- `schemas.ts` (zod 宣言)
- 生成コード (`*.generated.ts` など)
- `constants/` 配下 (定数のみ)

必要に応じて `EXCLUDE` に追加。
