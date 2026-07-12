# applicability DSL — rule 発火条件の凍結文法 (P5 Rule Compiler 前提)

> [!IMPORTANT]
> `registry.yaml` の `applies_when` と RULE anchor 5字段の `applicability` はこの文法**のみ**で書く。
> compiler (`scripts/rule-compiler.mjs`) はこの文法で parse し、**parse 不能は `always` に降格 + warning**
> (過剰適用=品質税 < 強制欠落=事故)。文法の変更は minor 扱い + compiler_version bump。
> 本文法を先に凍結する理由: card の価値は selection (applicability) に全面依存するため、
> ここが曖昧なままだと compiler は「provenance 付き grep」に堕ちる。

## 文法 (これで全部、OR は無い)

```
expr    := "always" | clause ( " AND " clause )*
clause  := path op value                 // op 前後の空白は任意 (task.surface_ref!=null と task.surface_ref != null は等価)
op      := "==" | "!=" | "in"
path    := context ( "." key )+          // 例: task.data_access / surface.tags.UI
value   := literal | "[" literal ("," SP? literal)* "]" | "null"
literal := 英数・ハイフン・アンダースコアの連続 (quote なし)
```

- **AND のみ**。OR が要る規範は rule を 2 本に割る (registry entry を分ける)。
- 歴史的表記 `∧` は `AND` の別名として parse 可 (出力は `AND` に正規化)。
- registry に entry の無い RULE id は build fail (tier/safety を引けず card 化不能 = schema 破壊扱い、compiler 実装準拠)。

## context (path の先頭、これ以外は parse error → always 降格)

| context | 由来 | 例 |
|---|---|---|
| `task` | plan の task frontmatter | `task.data_access != null` |
| `plan` | plan 全体 | `plan.tasks != null` |
| `surface` | `.takumi/specs/{surface}.md` frontmatter | `surface.tags.UI in [human-UI, machine+human]` |
| `diff` | 当該 Wave の変更 | `diff.changed_paths != null` |
| `loop` / `autonomy` / `requirements` | `.takumi/state.json` / `project.yaml` | `loop == true` / `autonomy.level != manual` / `requirements.source == toishi` |

## 評価規則 (決定的)

1. `path != null` = **存在テスト** (キーが在り値が null でない)。
2. キー不在に対する `==` / `in` は **false** (エラーでない)。`!= null` 以外の `!=` はキー不在で **false** (不在 = 「その文脈でない」に倒す。過剰適用は `always` 降格側の役割で、個別 clause は保守的に)。
3. `in` の右辺は必ず list literal。
4. 短絡なし・副作用なし。全 clause の AND。

## 降格と warning の契約

| 事象 | compiler の挙動 |
|---|---|
| 文法通り parse 成功 | そのまま card / gate の発火条件に |
| parse 不能 (未知 context・未知 op・壊れた list 等) | **`always` に降格**、card に `applicability_degraded: true` を刻み、stderr + coverage report に warning |
| `applicability` 字段そのものが欠落 | shall/not と違い**欠落は fail にしない** — `always` 降格 + warning (anchor 忌避の防止) |

build fail (exit 1) にするのは **hash drift / shall・not 欠落 / RULE id 重複 / schema 破壊のみ** (`rule-compiler.mjs` 参照)。
