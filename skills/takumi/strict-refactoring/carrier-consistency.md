# Carrier Consistency — Rule 19 / 21 の機械検査 (`templates/carrier-lint.mjs`)

`behavior-carrier.md` が規定する carrier 選択を **script で測る**ための運用書。
`hoge.save()` と `saveHoge()` の混在のように、同じ概念が層内で 2 つの carrier で表現されている状態を
機械的に列挙する。規範そのものは `behavior-carrier.md` が authority、本書は検査の運用だけを扱う。

> [!IMPORTANT]
> **既存コードを一括是正しない**。`behavior-carrier.md` §5 の grandfathered 規定に従い、
> K4 (新設禁止 carrier) は **diff の追加行のみ**を対象にする。rename-only PR は禁止のまま。

---

## 1. 4 つの出力

| # | 検出 | 層 | 既定の扱い |
|---|---|---|---|
| **K1** | 同一概念の carrier 二重化 — メソッド `T.verb()` と関数 `verbT(...)` の併存 | T1 | **hard (0 が正)** |
| **K2** | 層別 carrier 分布 — method / function / class-DI / closure-factory / hook の占有率 | — | report |
| **K3** | Rule 19 違反候補 — domain 層の型が persistence/transport/I/O 動詞を持つ | — | report (候補列挙) |
| **K4** | Rule 21 new debt — `XxxService` / `XxxHandler.handle()` / 1-method `XxxExecutor.execute()` の新規追加 | T1 | **hard (0 が正)** |

```bash
cd <project>
node <takumi>/templates/carrier-lint.mjs src \
  --config .takumi/profiles/carrier.json \
  --strict            # gate 実行時のみ。既定は常に exit 0
```

`--config` の形:

```json
{
  "layers": {
    "domain": ["src/domain/**", "src/*/entities/**"],
    "application": ["src/usecases/**"],
    "infra": ["src/infra/**", "src/repositories/**"],
    "ui": ["src/components/**", "src/hooks/**"]
  },
  "expect": { "domain": "method", "application": "function", "ui": "hook" }
}
```

---

## 2. K1 — なぜ「同一動詞 かつ 同一名詞」だけを見るのか

carrier 二重化の証拠として強いのは「**同じ概念が 2 つの carrier で実在する**」ことだけ。
動詞が同じでも名詞が違えば別概念であり、混在ではない。

| 例 | 判定 | 理由 |
|---|---|---|
| `Order.save()` + `saveOrder()` | **検出** | (save, order) が一致 = 同一概念の二重化 |
| `TodoList.add()` + `addUser()` | 非検出 | (add, todolist) と (add, user) で名詞が異なる |
| `Money.add()` + `addMoney()` | 検出 | (add, money) が一致 |
| `cart.getTotal()` + `getTotal()` | 非検出 | `get` は汎用動詞 stoplist |

名詞はメソッド名の残りトークン、無ければ**受け手の型名**を使う (`Order.save()` → noun=`order`)。

### layer-local に閉じる

Rule 19 は **layer-local consistency** であり、cross-layer の carrier 差は違反ではない
(`behavior-carrier.md` SC4: hook → function → aggregate method の連鎖は正常)。
そのため K1 は **同一層、または層が未分類でも同一 file** の対だけを見る。

### 既知の限界 (false negative)

`OrderRepository.save(order)` と `saveOrder()` は名詞が `orderrepository` と `order` で一致しないため
検出されない。FP を最優先で抑える設計の代償であり、検出漏れ側に倒している。

---

## 3. K2 — 分布は規範判定と分けて読む

層ごとに carrier の占有率を出す。**`expect` 宣言がある層だけ**「既定と最頻 carrier の乖離」を判定し、
宣言が無い層と `unknown` 層は**分布だけ**を出す。

理由: 層の推定は path 規約に依存する heuristic であり、その正しさを規範判定に混ぜると
「分類器の誤りを違反として報告する」循環になる。`expect` は profile が宣言した意図なので、
それとの乖離だけが規範的に意味を持つ。

読み方:

| 分布 | 解釈 |
|---|---|
| dominant_share が高い (0.8+) かつ既定と一致 | 健全。SC8 の「refactor target ゼロ」状態 |
| dominant_share が高いが既定と不一致 | 層の既定を見直すか、層全体の移行を検討 |
| dominant_share が低い (0.5 前後) | **carrier ブレ**。minority 件数が是正候補 |

---

## 4. K3 — domain 層に限定する理由

`repo.save(order)` は Rule 12 (Repository = Aggregate Root 単位) の**正しい形**であり、
Rule 19 違反ではない。違反は「aggregate 自身が persistence/transport/I/O を持つ」場合だけ。

そのため K3 は二重に絞る:

1. 層が `domain` のときだけ発火する
2. 型名が `Repository` / `Repo` / `Adapter` / `Client` / `Gateway` / `Store` / `Dao` / `Mapper` /
   `Api` / `Service` で終わるものは除外する

層が path 推定の場合は severity を下げ (`low`)、メッセージに「層は path から推定」と明示する。

---

## 5. K4 — grandfathered を機構で保証する

`git diff` の**追加行**にある宣言だけを対象にする。既存の `XxxService` は何件あっても検出しない。
基点は `--base`、無指定なら `master` / `main` との merge-base。git が使えなければ K4 は skip する。

---

## 6. 例外の付け方

```ts
// carrier-lint-allow K1: 移行中。saveOrder() は 2026-09 の legacy 撤去で消す
export function saveOrder(order: Order): void { /* ... */ }
```

対象行または直前行に `carrier-lint-allow <rule>: 理由`。理由が無い抑制は書かない
(レビュー可能な opt-out であることが条件)。

---

## 7. 主張規律

> 本 script が主張できるのは「**測れる**」ことまで。
> 「carrier を揃えると事故が減る」「保守性が上がる」は**未証明**である。
> K1 / K3 の precision は実 repo + 独立 oracle での標本検証が前提で、それまでは advisory 扱いとする。

`behavior-carrier.md` SC8 が言うとおり、layer-consistent な codebase では K1/K3 の検出はゼロになる。
検出ゼロは「機能していない」ではなく「その codebase では規律が守られている」を意味する。

---

## 関連リソース

| file | 用途 |
|---|---|
| `behavior-carrier.md` (同ディレクトリ) | 規範本体 (層既定 → 4 力 → 構文、Rule 19/21、SC1-SC8) |
| `rules-heuristics.md` (同ディレクトリ) | Rule 19 / 21 の要約と L2 での位置づけ |
| `code-vitals.md` (同ディレクトリ) | コード形状の report (関数長分布・表面積) |
| `../templates/carrier-lint.mjs` | 本書の検査実体 |
| `../enforcement/registry.yaml` | K1 / K4 の T1 mechanism 登録先 |
