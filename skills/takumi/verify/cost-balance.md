# Cost Balance — 層 obligation (`templates/layer-vitals.mjs`)

「各層でできるだけ小さいコストで不具合を検出できているか」を、**score ではなく obligation
(説明責任)** として列挙する。減らす手段は「安い層で殺す」か「理由を書く」の 2 つだけ。

> [!IMPORTANT]
> **率にしない**。層効率を率で持つと「安い層で同じ mutant を殺す薄い test」を量産するだけで
> 改善して見える。件数と一覧だけを出し、gate にも KPI にもしない。

適用対象は **L4 Mutation が primary tier の project のみ** (`mutation.md` 参照)。
advisory tier (Python / Go) は operator 覆盖が薄く、層の帰属判定が信頼できない。

---

## 1. 定義

| 用語 | 定義 |
|---|---|
| `cheapest_kill_layer` | その mutant を殺した test のうち、最も安い層 (L1 < L2 < L3 < L5) |
| `expected_layers` | その production file に対して **profile が宣言した**期待層 |
| **layer-escape** | `cheapest_kill_layer` が `expected_layers` の最高位より高い = 期待より高い層でしか捕まえていない |
| **redundant-guard** | 高コスト層 (L3 以上) の test で `unique_kills = 0`。**L5 は対象外** |
| **type-killed** | Stryker `CompileError` = 型 (L0) が無料で落とした mutant。obligation ではなく可視化 |
| **no-coverage** | `NoCoverage` |

```bash
node <takumi>/templates/layer-vitals.mjs \
  --mutation reports/mutation/mutation.json \
  --config .takumi/profiles/layers.json \
  --runner reports/vitest.json \
  --justify .takumi/verify-loop/layer-justifications.yaml
```

---

## 2. L5 を redundant-guard から外す (絶対)

L5 E2E は `unique_kills = 0` になりやすい。しかし実際には **設定 / routing / 認可 / i18n /
ビルド成果物 / 外部連携**をまとめて守っている。

mutation はコード上の局所変異しか表現できず、以下を**構造的に見落とす**:

> 設定ミス / schema drift / DB migration / 権限境界 / race / timezone・locale /
> bundler 差分 / 外部 API 契約 / a11y / visual regression / copy・legal compliance / observability

したがって **mutation 由来の指標で L5 の価値を測ってはならない**。
script 側でも L5 を `redundant-guard` の候補集合から機構的に除外している (文書だけの約束にしない)。

同じ理由で、`smoke-e2e.md` の「smoke 5 本」は本指標の結果で増減させない。

### L5 以外にも同じ除外が要る test 群

mutation の unique kill で価値を測れないのは L5 だけではない。以下は
`redundant_guard_exclude` (config、glob) で除外する:

- **契約テスト** (外部 API / schema / public API の shape)
- **migration テスト** (up/down の可逆性、データ移行)
- **i18n テスト** (key 完全性 / placeholder arity)
- **a11y / observability の契約テスト** (role・label・計装の存在)

いずれも「production コードの局所変異」では表現できない不変条件を守っているため、
`unique_kills = 0` になっても冗長ではない。

---

## 3. 循環論証を避ける — `expected_layers` の出所

`expected_layers` は **profile 宣言を第一情報源**にする。`verify-profiles-defaults/*.yaml` は
既に `layers: ["L1", "L4"]` を宣言しており、これは「人間 / 計画が宣言した期待」なので、
実測との乖離は規範的に意味を持つ。

宣言が無い場合のみ path から推定し、その record に `expected_source: inferred` を付けて
**advisory 扱い**にする。分類器の正しさを指標に混ぜると「推定の誤りを違反として報告する」循環になる。

---

## 4. obligation の閉じ方

| 手段 | 意味 |
|---|---|
| **安い層で殺す** | 期待層に test を足して `cheapest_kill_layer` を下げる (本来の解決) |
| **理由を書く** | その mutant / test が高い層でしか守れない理由を justification に記録する |

justification は `.takumi/verify-loop/layer-justifications.yaml` (`<id>: 理由` の 1 行形式) か
test 側コメント。**20 字未満の理由は未処理扱い**にする (一言で片付けるのを防ぐ)。

```yaml
m2: 承認済み見積の金額不変は状態遷移の性質でありモデル層でのみ表現できるため L3 に置く
```

`redundant-guard` は **削除候補ではなく「要人間理由付け候補」**。削除する場合は
`compression.md` §4 の PRUNE 安全手順 (1 件ずつ / score 不変確認 / revert) に従う。

---

## 5. 数値の持ち方 — ratchet

唯一の数値は **未処理 obligation 件数**。率でも score でもない。
`--baseline` を渡すと前回値と比較し、**増加したときだけ**警告する (単調非増加の ratchet)。

`--strict` を付けた場合のみ、baseline 超過で exit 1。gate に組み込む場合も
**executor gate の hard fail 条件には加えない** (report/advisory 層に留める)。

---

## 6. type-killed は「勝ち」として読む

`CompileError` は「型が先に落とした = runtime test が不要になった」ことを意味する
(`type-discipline.md` L0)。obligation ではないので減らす対象ではなく、**増えてよい**。

ただし CompileError には「変異が単に構文的に無効だった」ケースも混ざるため、
**L0 の効き具合の proxy** として読む。厳密な指標ではない。

---

## 7. 主張規律

> 本 script が主張できるのは「**測れる**」ことまで。
> 「obligation を閉じると事故が減る」「層バランスが改善すると品質が上がる」は**未証明**。
> 検出 precision は実 repo + 独立 oracle での標本検証が前提 (同一 script の self-check は循環論証)。

---

## 関連リソース

| file | 用途 |
|---|---|
| `compression.md` (同ディレクトリ) | subsumption / zero-contribution / PRUNE 安全手順 |
| `compression-vitals.md` (同ディレクトリ) | 寿命 ledger と cost-aware PRUNE (B-stack) |
| `mutation.md` (同ディレクトリ) | L4 tier 判定 (primary のみ本書適用) |
| `smoke-e2e.md` (同ディレクトリ) | L5 の役割。本指標で本数を増減させない |
| `type-discipline.md` (同ディレクトリ) | L0。type-killed の位置づけ |
| `double-management.md` (同ディレクトリ) | 二重管理テストの検出 (姉妹) |
| `../templates/layer-vitals.mjs` | 本書の計測実体 |
