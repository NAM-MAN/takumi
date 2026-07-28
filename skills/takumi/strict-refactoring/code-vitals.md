# Code Vitals — コード形状の report (`templates/code-vitals.mjs`)

production コードの形状を計測して**見えるようにする**だけの report。
gate にも KPI にもしない。

> [!IMPORTANT]
> **`smd.md` の「LoC は指標でなく副産物」は今も有効**。本書はそれを覆さない。
> 測る根拠は `ai-brevity.md` §1 の「AI-first pipeline では token 数が**測定可能な実コスト**であり、
> brevity に SMD が拾わない二次的価値がある」という位置づけに限られる。
> production 品質の指標は今も LoC ではなく **public exports / branching / dependency edges / config knobs**。

---

## 1. 出力

| # | 指標 | 何のために見るか |
|---|---|---|
| **V1** | LOC (production / test / generated / config / docs) | context コスト。後続の read / review / gate が払う実コスト |
| **V2** | 関数長分布 `1-2 / 3-7 / 8-20 / 21-100 / 101+` と **`≤7 行率`** | 抽象度のバランス |
| **V3** | `delegation_only` / `single_callsite_helper` / `mean_callsites` | V2 の裏返し (B3 Premature Abstraction) |
| **V4** | ファイル長分布 / 引数個数分布 / 最大ネスト深度 | Rule 7・file organization・ネスト規律 |
| **V5** | public export 数 / 未参照 export 候補 / `common`・`shared`・`utils` の LOC | Rule 16 (表面積) / Rule 13 |

```bash
cd <project>
node <takumi>/templates/code-vitals.mjs src \
  --config .takumi/profiles/code-vitals.json \
  --baseline .takumi/telemetry/code-vitals-baseline.json   # 悪化した項目だけ出す
```

---

## 2. V1 — なぜ cloc を使わず git で数えるのか

`git ls-files` は **untracked と gitignore 対象を構造的に除外**する。cloc / tokei の言語推定より、
profile が宣言した glob の方がそのプロジェクトの「production とは何か」に忠実になる。
副次的に `node_modules` / `dist` / lock file の混入事故が起きない。

分類は宣言 (`--config`) が最優先。宣言が無ければ既定パターン (test / generated / docs / config) で
判定し、残りを production とする。`@generated` マーカーはファイル冒頭 5 行を見る。

---

## 3. V2 + V3 — `≤7 行率` は方向性を持つ。ただし単独では読まない

**小さいほうがよい**を既定の方向として扱う。適切な抽象化を施せば大半の関数は 5 行以下に収まり、
30 行の関数を 3 分割するだけでも命名によって責務が可視化されるぶん改修として前進する。
分割そのものは害ではない。

一方で「意味のない分割で率だけ上げる」余地は実在する。そこで **同じ report に B3 カウンタを並置**する:

| カウンタ | 定義 |
|---|---|
| `delegation_only` | body が単一の return call だけの関数 (薄い forwarding、`smd.md` の PRUNE 候補) |
| `single_callsite_helper` | 呼び出し箇所が 1 以下の非 export helper (`ai-brevity.md` B3 の定義そのもの) |
| `mean_callsites` | 非 export helper 1 個あたりの平均呼び出し箇所数 |

分割で `≤7 行率` を上げると `single_callsite_helper` が同時に増えるため、**同じ画面で自壊する**。
gate にする必要はなく、並置するだけで足りる。

> [!NOTE]
> `single_callsite_helper` は**悪ではない**。命名による責務可視化は正当な理由になる。
> 見るのは絶対値ではなく **急増** (baseline 比較で `⚠` が出たとき)。

### 数える対象

call の引数として渡される**インライン callback** (`items.map(x => ...)`) は抽象化の単位ではないため
**数えない**。これを 1 関数として数えると 1-2 行 bucket が膨らみ `≤7 行率` が意味を失う。

---

## 4. V5 — 未参照 export は「候補」までしか言えない

`smd.md` の失敗モード **Invisible Consumer Breakage** のとおり、plugin / reflection / 動的 import /
外部 SDK consumer は静的解析に映らない。したがって:

- 未参照 export は**候補列挙のみ**。削除判断の根拠に使わない
- gate にしてよいのは **新規追加分だけ** (既存資産に誤検出の被害を及ぼさない)

---

## 5. baseline 差分 — 全量サマリを出さない

report は「レビューで見る人」がいないと飾りになる。既定の提示は
**baseline 比較で悪化した項目のみ + ワースト N** とする。

```
-- baseline 比較 (悪化した項目のみ) --
  ⚠ single_callsite_helper: 0 → 3 (+3)
  ⚠ args_3plus: 1 → 3 (+2)
```

悪化なしなら 1 行で終わる。毎回の全量表は出さない。
`--json` 出力にも `worsened` 配列を含めるので、機械集計でも「何が悪化したか」の意図が消えない。

---

## 6. 言語 tier

L4 Mutation の tier 構造と同型:

| tier | 対象 | 出力 |
|---|---|---|
| **primary** | TS / JS (project に typescript 5.x がある) | V1-V5 すべて |
| **degraded** | それ以外の言語、typescript 未解決 | V1 のみ (git ベース LOC)。AST 系は skip |

TypeScript 7 (Go port) の `typescript` entry は JS compiler API を持たないため、
`createSourceFile` の有無で検証し、無ければ未解決として degrade する。

---

## 7. 主張規律

> 本 script が主張できるのは「**測れる**」ことまで。
> 「LOC を減らすと品質が上がる」「`≤7 行率` を上げると保守性が上がる」は**未証明**。
> 特に関数長 bucket の境界値 (1-2 / 3-7 / 8-20 / 21-100 / 101+) に統計的裏付けはない。
> 分布を見るために区切っているだけであり、「3-7 が最良」という主張ではない。

---

## 関連リソース

| file | 用途 |
|---|---|
| `smd.md` (同ディレクトリ) | Rule 16 (表面積)。「LoC は指標でなく副産物」の出典 |
| `ai-brevity.md` (同ディレクトリ) | B1-B5。token 経済として LoC を測る根拠と priority lattice |
| `review-checklist.md` (同ディレクトリ) | advisory 項目 (関数の行数 / ネスト / メソッド数) の判定先 |
| `carrier-consistency.md` (同ディレクトリ) | carrier 一貫性の機械検査 |
| `../templates/code-vitals.mjs` | 本書の計測実体 |
