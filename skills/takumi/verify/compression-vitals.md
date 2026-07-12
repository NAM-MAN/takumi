# Compression Vitals — 寿命 ledger と cost-aware PRUNE (B-stack)

`verify/compression.md` §6 から分離した「**時間軸の寿命 ledger (B1)**」と「**cost-aware PRUNE 順序 (B2)**」の詳細 recipe。

> [!IMPORTANT]
> **このファイルは L4 Mutation primary tier (`mutation.md` 参照) の project のみ適用**。advisory tier (Python / Go) では mutation 結果から得られる ledger 精度が薄く運用効果が出ない。
>
> precision 評価は **3 ヶ月 ledger + 独立 oracle (人手 / 別実装)** で行う。同一スクリプトの self-check は循環論証になる。

---

## 1. 寿命 ledger の schema (B1)

`.takumi/verify-loop/test-vitals.jsonl` に append-only で記録。1 test = 1 行:

```jsonc
{
  "test_id": "11",
  "test_name": "snapToEdge は threshold 内に edge があるとき最も近い edge にスナップするべき",
  "file": "tests/boundary.test.ts",
  "killed_mutants_count": 8,
  "covered_mutants_count": 12,
  "unique_kills": 3,             // この test だけが殺した mutant 数
  "spec_density": 0.6,           // unique_kills / test_loc
  "cost_ms_p95": 12,             // per-test 実行時間の p95
  "subsumed_by": ["13", "14"],   // この test を完全に包含する test_id
  "zero_contribution": false,    // covered だが killed 0 のフラグ
  "kill_count_30d": 8,           // 直近 30 日の累積 kill 数 (初回は killed_mutants_count、運用で increment)
  "last_seen": "2026-05-24T08:35:00Z"
}
```

### schema 不変条件

- `test_id` は同一 test の `name + file` が不変な限り変わらない
- `kill_count_30d` は 30 日 sliding window、append-only で正しい運用が必要
- `subsumed_by` は同じ tick の Stryker report 内で算出 (tick 跨ぎでは再計算)

### builder ロジック (Node 1 行コマンドで実装可)

Stryker `mutation.json` の `files[].mutants[].killedBy/coveredBy` と `testFiles[].tests[]` から組み立てる:

```js
// build-vitals.mjs — Stryker JSON → test-vitals JSONL
import fs from 'node:fs'

const r = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
const tests = new Map()
for (const [file, fe] of Object.entries(r.testFiles ?? {})) {
  for (const t of fe.tests ?? []) {
    tests.set(t.id, { test_id: t.id, test_name: t.name, file,
      loc_start: t.location?.start?.line ?? 0, loc_end: t.location?.end?.line ?? 0,
      killed: new Set(), covered: new Set() })
  }
}
for (const fe of Object.values(r.files)) {
  for (const m of fe.mutants) {
    for (const tid of m.killedBy ?? []) tests.get(tid)?.killed.add(m.id)
    for (const tid of m.coveredBy ?? []) tests.get(tid)?.covered.add(m.id)
  }
}
// subsumption + unique kills + spec_density
const arr = [...tests.values()]
for (const t of arr) {
  t.subsumed_by = arr.filter(u => u.test_id !== t.test_id
    && u.killed.size > t.killed.size
    && [...t.killed].every(m => u.killed.has(m))).map(u => u.test_id)
  t.unique_kills = [...t.killed].filter(mid => {
    const all = Object.values(r.files).flatMap(f => f.mutants).find(m => m.id === mid)
    return (all?.killedBy ?? []).length === 1
  }).length
  const loc = Math.max(1, (t.loc_end - t.loc_start) || 1)
  t.spec_density = +(t.unique_kills / loc).toFixed(3)
}
const today = new Date().toISOString()
fs.writeFileSync(process.argv[3], arr.map(t => JSON.stringify({
  test_id: t.test_id, test_name: t.test_name, file: t.file,
  killed_mutants_count: t.killed.size, covered_mutants_count: t.covered.size,
  unique_kills: t.unique_kills, spec_density: t.spec_density,
  cost_ms_p95: t.covered.size, // proxy; replace with vitest per-test timing if available
  subsumed_by: t.subsumed_by,
  zero_contribution: t.covered.size > 0 && t.killed.size === 0,
  kill_count_30d: t.killed.size, last_seen: today,
})).join('\n') + '\n')
```

このファイルを `.takumi/verify-loop/build-vitals.mjs` に置き、`node build-vitals.mjs reports/mutation/mutation.json .takumi/verify-loop/test-vitals.jsonl` で実行。

---

## 2. cost-aware PRUNE 順序 (B2)

compression.md §4 の PRUNE 安全手順を **cost weight** で改良:

### 2.1 優先度ルール

| カテゴリ | 削除優先度 | 理由 |
|---|---|---|
| zero_contribution | **最優先 PRUNE** | covered だが killed 0、飾り |
| subsumed_by 非空 | **次優先 PRUNE** | 他 test に包含 |
| spec_density < 0.3 (killed > 0) | SHARPEN 候補 | PRUNE せず鋭くする |
| 上記以外 | 残す | |

### 2.2 同カテゴリ内の順序 (cost-aware)

```
1. cost_ms_p95 降順 (遅い test を先に削除候補)
2. spec_density 昇順 (薄い test を先)
3. last_seen 古い順 (3 ヶ月触られていない test を先)
```

理由: subsumption 関係が等しい 2 つの test では「**遅い test を消し、速い test を残す**」のが suite runtime にも質にもプラス。

### 2.3 Mutual subsumption の tie-break

`killed(A) = killed(B)` の対称ケースで現状 compression.md は基準曖昧。以下の優先順で残す test を決める:

1. **spec_density 高い方** を残す (より凝縮された仕様表現)
2. 同等なら **「べき」形式 (Rule 14 命名)** または `should` を含む方を残す
3. 同等なら **cost_ms_p95 が安い方** を残す
4. それでも同等なら test_id の小さい方を残す (deterministic)

### 2.4 PRUNE の安全手順 (compression.md §4 と同じ、ただし候補順序のみ B2 で上書き)

1. 候補特定 (上記 2.1/2.2/2.3)
2. **1 件ずつ削除** (バッチ削除禁止)
3. Stryker incremental 再実行
4. mutation score 不変 → commit、下がった → revert
5. 全候補処理後に full run で最終確認

---

## 3. ledger の運用

### 3.1 update タイミング

| タイミング | 動作 |
|---|---|
| verify-loop 各 tick 完了時 | mutation.json を読んで vitals JSONL を生成 (上書きでなく append、tick_id 付き) |
| 月次 (cron / CronCreate) | 30 日 window で `kill_count_30d` を再計算、3 ヶ月 unique_kills=0 の test を PRUNE 候補に escalate |

### 3.2 `kill_count_30d` の運用注意

- ledger は 3 ヶ月運用前提。短期 (24h) では schema 健全性のみ確認可、削除精度は **実 repo + 3 ヶ月 ledger** で測る
- 同 algorithm の self-check は循環論証リスクあり → 実 repo で **独立 oracle (人手 / 別実装) による標本検証** 必須

---

## 4. 軍師敵対レビュー (3 件以上で必須)

compression.md §4.1 と同じだが、ledger の cost desc 順序を提示して敵対レビュー:

```
以下のテスト削除候補 (cost desc 順) を敵対的にレビューせよ。
1) cost_ms_p95 が高くても spec_density が高いなら本当に削除して良いか?
2) zero_contribution は assertion 強化で復活させる余地はないか?
3) subsumed_by の test が将来削除される可能性は?
候補一覧 (cost desc):
{test_id, test_name, cost_ms_p95, spec_density, subsumed_by}
```

---

## 5. 期待効果 (理論値、実 repo で要計測)

| 指標 | 効果の源 | 見込み |
|---|---|---|
| suite runtime | zero_contribution + subsumed の PRUNE で test 数削減 | 5-15% 短縮 (delete 率に比例) |
| mutation score | PRUNE で score 不変 (subsumption の定義どおり) | 維持 |
| 削除 review コスト | 候補が自動順序化、軍師敵対レビューに整列入力可 | レビュー時間半減 |
| 長期 drift 検出 | `kill_count_30d` で 3 ヶ月触られない test を escalate | 月次運用で逓減 |

短期 (24h) では schema 健全性のみ評価可、削除 precision/recall の真値は **実 repo + 3 ヶ月 ledger + 独立 oracle 標本検証** で測る。

---

## 関連リソース

| file | 用途 |
|---|---|
| `compression.md` (同ディレクトリ) | 親 recipe (subsumption / zero-contribution / spec-density の基本) |
| `mutation.md` (同ディレクトリ) | L4 tier 判定 (primary のみ B-stack 適用) |
| `../verify-loop/runtime.md` | tick 内で ledger を update する hook |
