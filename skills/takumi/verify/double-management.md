# Double Management — 文言は等値テストで守らない (`templates/dm-lint.mjs`)

**二重管理**とは、テストの失敗条件が実装値のコピーである状態を指す。
LP の見出しや CTA 文言のように「事実そのもの」を assertion に写すと、文言を変えるたびに
2 箇所を直すことになり、テストは仕様を守らず**変更の摩擦だけを増やす**。

> [!IMPORTANT]
> **率 (DMR) を KPI にしない**。候補列挙のみで削除圧にしない。
> 文言そのものが仕様である場合 (法務・広告審査済のコピーなど) は正当であり、除外タグで明示する。

---

## 1. 何が二重管理か

| 書き方 | 判定 | 理由 |
|---|---|---|
| `expect(hero.headline).toBe("はじめての方でも 5 分で…")` | **二重管理** | 文言の複製。変更で必ず両方直す |
| `expect(hero.headline).toBe(HERO_HEADLINE)` | OK | 同じ定数を参照。source of truth は 1 つ |
| `expect(hero.headline.trim().length).toBeGreaterThan(0)` | OK | 構造契約 (空でない) |
| `expect(price).toBe(4980)` | **二重管理** | 実装の定数を写している |
| `expect(total).toBe(price * qty)` | 要注意 | 実装式のコピー (implementation-derived assert) |

`README.md` の Q4 症状「実装コピペ assertion (production と同じ定数/式を assert に使う)」の
機械化にあたる。

---

## 2. 文言を守る正しい方法 — 構造契約

文言そのものを固定せず、**文言が満たすべき構造**を検証する。文言を変えてもテストは壊れない。

| 守りたいこと | 構造契約 |
|---|---|
| 文言が抜けていない | key 完全性 (i18n の全 locale に同じ key が存在する) |
| 差し込みが壊れていない | placeholder arity (`{name}` の個数と種類が locale 間で一致) |
| 空になっていない | 非空 + 前後空白なし |
| リンクが死んでいない | CTA の href が内部パス / 到達可能 |
| 型として妥当 | schema 検証 (zod 等) |
| 崩れていない | 長文・空・エラー状態の layout PBT (`../design/l7-invariant.md` §PBT) |

文言の**内容**が正しいかは人間の領域 (ConsistencyMatrix H4「ユーザー語彙 ↔ コピー文言」)。
機械は構造だけを守る。

---

## 3. 検出 (R1 / R2)

```bash
cd <project>
node <takumi>/templates/dm-lint.mjs src \
  --min-len 8 \
  --mutation reports/mutation/mutation.json --content-glob 'src/content/**'
```

| rule | 検出 | 条件 |
|---|---|---|
| **R1 literal-mirror** | assertion の literal が被テスト実装 (または相対 import 先の定数) に verbatim 出現 | 文字列は既定 8 文字以上。`0/1/-1/2/100` 等の自明な数値は除外 |
| **R2 content-lock** | killed mutant の 80% 以上が content module の `StringLiteral` | `--mutation` と `--content-glob` の両方が与えられたときのみ |

**R2 は単独では弱い**。R1 と重なったときだけ「強い候補」として扱う。

---

## 4. 除外タグ (必須)

文言が仕様そのものである場合は正当なので、理由付きで明示する。

```ts
// dm-lint-allow legal-copy: 特商法表記の CTA 文言は広告審査済みで文言自体が仕様
it("heroCopy は審査済み CTA 文言を返すべき", () => {
  expect(heroCopy().cta).toBe("無料ではじめる");
});
```

| tag | 使う場面 |
|---|---|
| `legal-copy` | 法務・広告審査済みのコピー。文言自体が仕様 |
| `public-api-contract` | 外部に公開している API の応答値・エラーコード |
| `snapshot-baseline` | 意図的に固定した baseline |
| `security-boundary` | 認可メッセージなど、変更が挙動差になるもの |
| `schema-migration` | migration が参照する固定値 |
| `i18n` | locale key 自体の検証 |

理由の無い抑制は書かない (レビュー可能な opt-out であることが条件)。

---

## 5. 主張規律

> 本 script が主張できるのは「**測れる**」ことまで。
> 「二重管理を減らすと保守コストが下がる」は**未証明**。R1 の precision は
> 実 repo + 独立 oracle での標本検証が前提であり、それまでは advisory 扱いとする。
>
> 既知の限界: 実装式のコピー (`expect(total).toBe(price * qty)`) は現状の R1 では検出しない
> (literal のみ)。式レベルの tautology 検出は T2 reviewer に残す。

---

## 関連リソース

| file | 用途 |
|---|---|
| `README.md` (同ディレクトリ) | 4 象限 Q4 の症状一覧 (実装コピペ assertion の出典) |
| `spec-tests.md` (同ディレクトリ) | USS / MSS。it 名は仕様文 |
| `cost-balance.md` (同ディレクトリ) | 層 obligation (姉妹) |
| `../contract/contract-spine.md` | H4 (ユーザー語彙 ↔ コピー文言) は人間ゲート |
| `../design/jp-typography.md` §11 | 日本語 microcopy の質は craft rubric 側 |
| `../templates/dm-lint.mjs` | 本書の検査実体 |
