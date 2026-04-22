# SMD — Surface Minimization Discipline (Rule 16 実装 recipe)

`rules-heuristics.md` の **Rule 16** を実運用に落とすための recipe。**責務 / 品質 / 検知能力を落とさずに表面積を削る**。test 側 MSS (`verify/compression.md`) の production 版だが、意味が決定的に反転する点がある (後述)。

> [!IMPORTANT]
> 「LoC が短いほど良い」は**偽**。production は変更容易性・局所性・事故率を落とさずに **public exports / branching / dependency edges / config knobs** を減らすのが正しい。LoC は**指標でなく副産物**。

---

## 1. SHARPEN / PRUNE / ADD — test MSS との差分

| force | production code での意味 | test MSS との差分 |
|---|---|---|
| **SHARPEN** | 責務を保ったまま密度 ↑ | 同じ (assertion 鋭化 → 分岐正規化・defensive 型化) |
| **PRUNE** | 観測上不要なものを削除 | 同じ (subsumed test → dead export / branch) |
| **ADD** | **削除の前提条件を先に足す** | **反転**: test MSS の ADD は「新仕様追加」、production の ADD は「PRUNE のために型制約 / contract test / lint rule / boundary を置く」 |

### SHARPEN 具体例

- 分岐正規化 (ネスト if → early return / guard)
- 重複 validation / logging / authz の統合 (**同一責務かつ rule-of-three 満たす**場合のみ)
- 型で代替可能な runtime check の型化 (`typeof x === 'string'` → `x: string`、ただし外部境界は除外)
- defensive コメントで説明されている invariant を型制約に置換

### PRUNE 具体例

- dead export (外部 call sites = 0、知られた動的 import なし)
- dead branch (coverage 0、Stryker `NoCoverage`)
- 恒久 on / off の feature flag (TTL 切れ、owner 確定)
- 使われない error subtype (throw 先が区別して catch していない)
- 重複 DTO / mapper (同一 shape + 同一責務)
- 薄い forwarding layer (1 行 delegate)

### ADD 具体例 (必要な時だけ)

- PRUNE 後に型制約 / contract test で逆戻り防止
- lint rule 追加 (例: `no-unused-exports`) で再発を機械的に止める
- dependency boundary 追加で再発範囲を制限

**ADD の net LoC は PRUNE の削減 LoC を上回ってはならない**。上回るなら ADD しない = PRUNE もしない。

---

## 2. 必須 Gate (hard、全件通過必須)

PRUNE は 1 件 1 commit、**並列削除禁止**。各件で以下を順に確認:

1. **survived + no-coverage count ≤ baseline** — mutation score 絶対値は分母変動で誤発火する (PRUNE で killed mutant が消えると比率が下がる)。survived / no-cov 数の方が信頼できる。
2. **public API 署名不変** — 対象 unit が export するとき発火。grep 0 件 + 動的 import 確認 + plugin アーキテクチャ無しを確定してから承認。
3. **feature flag behavioral invariant 不変** — flag 参照を別 helper に隠す抜け穴があるため、direct reference 数ではなく **behavior** を見る (flag を toggle したときの挙動を test で固定し、PRUNE 前後で同じ挙動か確認)。
4. **tests pass** — 全 suite green。
5. **新規 no-cov の説明義務** — 変更行に新しい no-coverage mutant が出たら、「**テストを足す or defensive を削る**」の二択に倒す。放置は禁止 (可視化した以上、責任を取る)。

### 警告層 (soft、記録のみ)

- mutation score 絶対値 (経営指標としては便利だが gate には不適)
- cyclomatic complexity / fan-in-out
- perf non-regression (SHARPEN 系で alloc が増えないか、benchmark があれば)

---

## 3. 失敗モード名付き危険分類 (適用前に必ず照合)

抽象標語ではなく **failure mode label** として記憶する。レビュー時はラベルで指摘可能。

| ラベル | 症状 | なぜ危険か |
|---|---|---|
| **Premature DRY Trap** | 2 callsites のみで共通化 | 3 箇所目で条件分岐を追加して結局 LoC 増 + 可読性減 (Sandi Metz: "duplication is far cheaper than the wrong abstraction") |
| **Lifecycle Confusion** | 形は同じだが lifecycle / ownership が違う処理の DRY | 一方の lifecycle が変わった時にもう一方が壊れる。例: `normalizeUserInput` と `normalizeCsvCell` を統合して NUL バイト処理が漏れる |
| **Silent Contract Violation** | 空 catch / defensive check を「無意味」として削除 | 上位が throw を期待しない契約。prod で静かに 500 化 |
| **Invisible Consumer Breakage** | 「誰も呼んでない」export を grep 1 発で削除 | plugin / reflection / 動的 import / 外部 SDK consumer は grep に映らない。semver patch で破壊事故 |
| **Unbounded Rollout Risk** | rollout 100% 見える feature flag を撤去 | staging / 古い mobile client / 内部 admin が 3 ヶ月後に踏む。flag は TTL + owner で管理 |
| **Short-circuit Breakage** | 3 段 fallback を `candidates.find()` に統合 | 元は短絡評価で lookup コスト最小、統合後は全 candidate eager eval。DB / API 負荷に注意 |
| **Semantic Collapse** | 似て非なる概念 (`normalizeState` / `normalizeCardinality` 等) を DRY | 名前が似ているだけで別概念。統合は意味論を潰す |

---

## 4. PRUNE 安全手順

```
候補特定 → 1 件削除 → tests pass? → Stryker incremental → gate 5 本全通過? → commit → 次の候補へ
                                                           │
                                                      NG なら revert + 失敗モードラベル記録
```

### 4.1 Stryker 引き抜きで gate 確認 (JS/TS primary tier)

```bash
pnpm stryker:incremental --mutate <target-file>
# .stryker-tmp/incremental.json を読む
python3 -c "
import json
with open('.stryker-tmp/incremental.json') as f: d=json.load(f)
m = d['files']['<target-file>']['mutants']
survived = [x for x in m if x['status']=='Survived']
nc = [x for x in m if x['status']=='NoCoverage']
print(f'survived={len(survived)} no_cov={len(nc)}')
"
```

baseline と比較、`survived + no_cov` が不変または減少なら gate 1 通過。

### 4.2 敵対レビュー (PRUNE 候補が 3 件以上なら必須)

軍師 (gpt-5.4) に敵対レビュー依頼:

```bash
codex exec -m gpt-5.4 -s read-only -C "$(pwd)" \
  "以下の PRUNE 候補を敵対的にレビュー。上記 7 失敗モード (Premature DRY Trap / Lifecycle Confusion / Silent Contract Violation / Invisible Consumer Breakage / Unbounded Rollout Risk / Short-circuit Breakage / Semantic Collapse) のいずれかに該当するか判定せよ。候補: {...}"
```

---

## 5. pilot 実測 (2026-04-22、`name_editor/src/lib/prompt-engine/resolve-slots.ts` + `staging-translate.ts.bak`)

| metric | before | after | Δ |
|---|---|---|---|
| 総 LoC (prod + test + bak) | 1303 | 1063 | **-240 (-18.4%)** |
| prod LoC (resolve-slots.ts) | 352 | 319 | -33 (-9.4%) |
| public exports | 6 | 5 | -1 (`walkParentChain` dead export) |
| survived mutants | 13 | 13 | **0 (不変)** |
| no-coverage mutants | 0 | 1 | +1 (SHARPEN-B で defensive fallback `?? []` surface) |
| tests passing | 23 | 20 | 23→20 (walkParentChain 関連 3 本も削除) |
| test runtime | 136ms | 72ms | -47% (副産物) |

**適用 bucket**: SHARPEN 2 件 (dedup Set one-liner / flatMap)、PRUNE 2 件 (dead export / untracked .bak 残骸)、DRY reject 3 件 (`Premature DRY Trap` / `Semantic Collapse` / `Short-circuit Breakage`)、ADD 0 件 (不要)。

---

## 6. Rule 17 (宣言的デフォルト) との関係

Rule 17 は SMD のミクロ層。Rule 16 が「何を削るか」なら Rule 17 は「どう書くか」。両者衝突時は **Rule 16 優先** — 宣言的化で一時配列 / fallback / 可読性負債が増えるなら退ける。

---

## 7. Rule 17 — 宣言的デフォルト (詳細)

**コア原則**: collection 変換は宣言的 default。`for` は 4 exception のいずれかのときだけ残す。

### 7.1 `for` を残して良い 4 exception

| # | exception | 判定基準 | 典型例 |
|---|---|---|---|
| 1 | **副作用が本質** | 外部 mutable state への conditional 操作、1 回 iterate で複数副作用を起こしたい | `tags.delete` / `tags.add` を action で分岐、DB insert batch |
| 2 | **早期中断 + 複雑 state** | `find` / `some` / `every` / `takeWhile` で表現できない、break に伴う状態蓄積がある | 条件満たしたら loop を抜けて accumulator を返す |
| 3 | **perf critical で benchmark 済み** | JIT が手書き loop を優先最適化、実測 10%+ 差 | hot path の内部ループ、V8 inlining 依存 |
| 4 | **可読性優位** | 宣言的にすると `?? default + conditional push + set/return` など **4 要素以上が 1 式で交差** | grouping accumulator (下記例) |

### 7.2 exception 4 の具体例 (pilot から)

```ts
// for 版 (keep): 流れが自然
const byMacro = new Map<number, Entry>()
for (const row of rows) {
  let entry = byMacro.get(row.macro_id)
  if (!entry) {
    entry = { macro_id: row.macro_id, name: row.name, tags: [] }
    byMacro.set(row.macro_id, entry)
  }
  if (row.prompt_en) entry.tags.push(row.prompt_en)
}

// 宣言的試案 (reject): 4 要素交差で可読性低下
const byMacro = rows.reduce((map, row) => {
  const entry = map.get(row.macro_id) ?? { macro_id: row.macro_id, name: row.name, tags: [] }
  if (row.prompt_en) entry.tags.push(row.prompt_en)
  map.set(row.macro_id, entry)
  return map
}, new Map<number, Entry>())
```

`?? fallback` + `conditional push` + `.set()` + `return` の 4 要素が交差 → exception 4 発動、**for を keep**。

### 7.3 チェーン上限: 4 段以上は中間変数

**3 段固定 rule ではない**。下限は 1 段、上限の目安が「4 段以上になったら中間変数 or named helper に分解」。

```ts
// OK (3 段)
items.filter(isActive).map(toDto).sort(byDate)

// NG (5 段、レビューコスト跳ね)
items.filter(...).map(...).filter(...).flatMap(...).reduce(...)

// OK (分解後)
const active = items.filter(isActive)
const dtos = active.map(toDto)
const grouped = groupByCategory(dtos)
```

### 7.4 code golf 禁止

checkio のコードから参考にするのは **「状態を持たない組み合わせ」** のみ。

- ✅ 学ぶべき: `sum(1 for c in s if c.isdigit())` — 意図が直接読める
- ❌ 避ける: `reduce(lambda a,b: a|{b}, s, set())` — 同じだが読めない
- ❌ 避ける: 4 段以上のチェーン

**判定**: 「声に出して読んで何をしているか分かるか」。分かれば可、分からなければ分解。

---

## 8. Rule 17 追加原則 (pilot 実測ベース)

### 8.1 原則 17-A: untested 領域では Rule 16 PRUNE を先に

宣言的変換は ArrowFunction + ConditionalExpression を callback に持つため、**Stryker mutant 数を 2-3 倍に増やす**。対象領域が既にテストされていれば killed 数も増えるので net +、untested 領域では no-cov 一辺倒。

→ Rule 17 適用時は「対象領域が test されているか」を先に確認。untested なら **Rule 16 PRUNE を先に検討** (消せるなら消せ)。

### 8.2 原則 17-B: partition は declarative 優位

`add` / `remove` 分岐の 2 way partition は宣言的優位:

```ts
// for 版
const add: string[] = []
const remove: string[] = []
for (const r of rows) {
  if (r.action === 'add') add.push(r.prompt_en)
  else if (r.action === 'remove') remove.push(r.prompt_en)
}

// Rule 17 適用版 (prefer)
return {
  add: rows.filter((r) => r.action === 'add').map((r) => r.prompt_en),
  remove: rows.filter((r) => r.action === 'remove').map((r) => r.prompt_en),
}
```

alloc は 1 回 iterate → 2 回 iterate に増えるが、実 workload では sub-ms。10%+ 差の benchmark 実測があった時だけ for に戻す。

### 8.3 原則 17-C: `new Set(iterable)` / `new Set(flatMap)` は clean win

`for...of ... set.add(x)` を `new Set(iterable)` に置換するのは LoC 減 + perf 同等 + 意図直読。先行状態構築 (`const set = new Set<string>()` → `for { set.add }`) は ほぼ常に後続で mutate される → `const set = new Set<T>(iterable); for (x of more) set.add(x)` の形に集約。

---

## 9. Rule 17 pilot 実測 (2026-04-22、`name_editor/src/lib/prompt-engine/expand.ts`)

| metric | before | after | Δ |
|---|---|---|---|
| prod LoC | 400 | 391 | -9 (-2.25%) |
| killed mutants | 21 | 20 | -1 |
| survived mutants | 11 | 11 | **0 (不変)** |
| no-coverage | 40 | 41 | +1 (untested 領域の surface) |
| total mutants | 72 | 72 | unchanged |
| tests | 14 | 14 | pass |
| test runtime | 32ms | 26ms | -19% (副産物) |

**適用**: R1 (`new Set(iterable)`)、R2 (filter+map partition)、R3 (`new Set(flatMap)`)。
**keep as for**: 3 箇所 — exception 1 (副作用本質) × 2、exception 4 (可読性優位) × 1。
**未観測副作用**: 短絡破壊 (find 化) — 今回 unit に該当コードなし、別 unit で要再 pilot。

---

## 関連リソース

| file | 用途 |
|---|---|
| `rules-heuristics.md` (同ディレクトリ) | Rule 16 (本 skill entry point) |
| `review-checklist.md` (同ディレクトリ) | profile 別の hard/soft 適用マトリクス |
| `~/.claude/skills/takumi/verify/compression.md` | test 側 MSS (production 版の対比元) |
| `~/.claude/skills/takumi/verify/mutation.md` | Stryker 設定、subsumption 解析の JSON schema |
