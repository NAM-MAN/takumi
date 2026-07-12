# domain-data-primitives (内部仕様書) — 業務ロジック/DB/分離の生成 discipline

> [!NOTE]
> UI 側 `design/layout-primitives.md` の **backend 双子**。layout primitive が「崩れない部品からしか UI を組めなくする」のと同じ思想で、**ぶれない業務ロジック/データ構造からしか実装を組めなくする**。Wave を細かく分けても職人が勝手なドメイン構造を作れないよう、生成空間を狭める。

## 思想 (layout-primitives と対称)

- 「AI に自由にドメイン設計させ後段で直す」は負け筋。**生成空間を狭め**、ぶれを構成的に防ぐ。
- 散文の「ドメインモデル.md」は機械が読めず再びぶれる → **型定義が source of truth (SoT)**、不変条件は **property seed**。
- ROI は **集約境界 + トランザクション境界**に集中。命名揺れは後で直せる、集約/tx 境界ミスはデータ破損で取り返せない。
- 守る対象は `contract-spine.md` の **ドメイン不変条件 6 種 (I1-I6)**。本書はそれを「どう生成し、どこに置くか」の discipline。

---

# Part (i) ドメインモデリング discipline

## 1. 不変条件を property seed として書く (I3)

不変条件は散文でなく**実行可能な述語**で書き、そのまま L1 PBT になる。

```typescript
// NG: 散文コメント (機械が読めない、職人ごとにぶれる)
// 注文の合計は0以上

// OK: 述語 = property seed
// invariant ORDER-I3a: ∀ o: Order. o.total >= 0
//   → test/order.invariants.pbt.ts: fc.property(arbOrder, o => o.total >= 0)
```

**規律**: TopContract の各 I3/I4 項は `property_ref` (test ファイルパス) を持つ。`property_ref` 無しの不変条件は **domain-rich 以上で gate reject** (crud-simple は advisory)。`verify/property-based.md` と接続。

## 2. illegal state を型で表現不能に (型 = SoT)

```typescript
// NG: 文字列 status (タイポ・未定義状態が表現可能)
type Order = { status: string }

// OK: 直和型 (illegal state がコンパイル時に消える)
type OrderStatus = "draft" | "confirmed" | "shipped" | "cancelled"
type Email = string & { readonly __brand: "Email" }  // branded、smart constructor 経由のみ
```

`domain_slice.contract_ref` はこの型定義ファイルを指す。職人は独自の型を定義せず contract_ref を import する (M1: identity の単一系列)。

## 3. 集約境界 + トランザクション境界の同定 (I2 / 高 ROI)

| 手順 | 判定 |
|---|---|
| 1. 不変条件の影響範囲を引く | 「同時に真でなければならない」エンティティ群 = 1 集約 |
| 2. 集約ルートを 1 つ決める | 外部はルート経由でのみ子に触る (`strict-refactoring` Rule 12: Repository = Aggregate Root) |
| 3. **tx 境界 = 集約境界** | 1 トランザクションで複数集約を更新しない (結果整合性 or saga) |
| 4. 否定制約を宣言 | この task が作ってよい集約 / 作ってはいけない集約 → `domain_slice.prohibited_creates` |

> M7 (aggregate ↔ tx ↔ command 境界) が gate でこの一致を検査する。

## 4. ユビキタス言語 (業務知識の所在を固定)

「受注 / 注文 / オーダー」が同概念か別概念か、「キャンセル (営業) / 取消 (経理)」の状態差を `top_contract` の用語集に固定。職人はクラス名・カラム名・バリデーション語をここから引く (命名ぶれの源を断つ)。

---

# Part (ii) データベース設計 discipline

## 5. greenfield / brownfield 軸

| | source of truth | schema の扱い |
|---|---|---|
| **greenfield** | ドメイン型 (I1-I6) | schema は派生。Step 0 では**永続化インターフェース** (何を永続化するか) だけ固定、正規化/index/物理型は実装 Wave へ defer |
| **brownfield** (flag) | **既存 schema = 固定入力** | ドメイン型を schema の上に立て、**ACL (腐敗防止層)** で和解。乖離は `constraints` に**可視の技術的負債**として記録。`source_of_truth: schema` を明示 |

**ACL = 全域関数**: `LegacyRow → DomainType` を total function で書き、レガシーの汚染をドメイン層に浸透させない。型が境界を守る。

## 6. データ設計の成果物 (tier-gated、ぶれが高コストな所だけ)

| 成果物 | crud-simple | domain-rich | integration-heavy |
|---|---|---|---|
| FK 方向 / 多重度 (I2) | ✓ | ✓ | ✓ |
| **整合性制約** (NOT NULL/FK/CHECK + 業務的意味、I3) | — | ✓ | ✓ |
| **トランザクション境界** (I2/I6、集約 = tx) | — | ✓ | ✓ |
| 正規化方針の宣言 | — | ✓ | ✓ |
| migration 順序 / rollback 手順 | — | — | ✓ |
| read model / CQRS 分離 | — | — | ✓ |

**整合性制約と tx 境界はデータ破損を生むから domain-rich 以上で必須**。migration/read-model は integration-heavy でのみ。crud-simple は FK 方向のみ (1 枚)。

## 7. tx 境界と楽観/悲観 (I6 / 6e と接続)

**楽観的 UI は既定 (default ON)**。毎回サーバー問い合わせ・spinner 待ちは「指定なし実装」の堕落形でありユーザビリティ既定にしない。pessimistic は**契約から justify した時のみ**選ぶ (極性は楽観←→悲観で楽観が原点):

```
pessimistic を選ぶ = 以下のいずれかが立つ時のみ (立たなければ optimistic)
  I6 6 因子:  不可逆 ∨ critical ∨ 希少資源競合 ∨ 非冪等 ∨ 競合解決未定義 ∨ 補正コスト大
  入力喪失軸 (別軸・可逆でも独立に効く): stale overwrite ∨ 並行編集 ∨ server canonicalization
                                        ∨ permission downgrade ∨ unique 制約補正
```

payment (不可逆 + critical) / 希少資源競合 (在庫・枠) = **pessimistic 必須**。入力喪失軸が立つフォーム保存は pessimistic か confirm/rebase。fetch freshness = volatility × surface 失敗影響で導出。**楽観既定・キャッシュの持ち方・list-affecting invalidation の tier 別具体は `data-access-protocol.md` (DDP)**、M5/M6 が gate で検査。

---

# Part (iii) 分離 (projection / boundary) discipline

## 8. boundary 分類表 (業務知識と非業務の線引きを設計時に固定)

各概念・判断をどの層に置くかを `domain_slice.boundary` で宣言。越境は `boundary_lint` で弾く (executor gate)。

```
業務ルールか?         → domain        (不変条件・遷移・計算ロジック)
永続化の都合か?       → infra         (Repository・ORM・SQL)
外部システムの言葉か? → adapter (ACL) (外部 API・レガシー schema の変換)
画面の都合か?         → presentation  (表示整形・入力補助)
```

**dependency 規律** (M3/M4 と整合): `domain` は `infra` / `adapter` / `presentation` を import しない (依存は逆向き)。`domain` で ORM クラスを import = `boundary_violation`。これを dependency-cruiser ルールに生成する。

## 9. ObjectModel = contract index (同型禁止)

ObjectModel は source of truth でなく **contract index**。UI/API/DB/test を**同一モデルにせず projection** で繋ぐ (過結合回避)。

- **共有するのはこれだけ**: canonical 概念 / identity (I1) / 多重度 (I2) / 不変条件 (I3) / action 意味 (I5) / volatility (I6) / 権限境界 (I5)。
- **形は層ごと projection**: read model = 画面最適化 / aggregate = 整合性境界 / DB = 永続化都合 / API = 契約都合。
- **`aggregate 境界 = Object 境界` の前提を禁止** (CQRS / read model はこれで破綻)。

## 10. projection 規則 (各層独自の形へ)

| 共有要素 | DB projection | API projection | UI projection |
|---|---|---|---|
| 多重度 (I2) | FK / join | relation shape | collection / detail |
| 不変条件 (I3) | constraint / tx | validation | prevention (disabled 等) |
| action (I5) | — | command | affordance + authz |
| volatility (I6) | — | cache header | refetch / subscribe |

ORM エンティティとドメイン型の**二重定義を禁止**: どちらが SoT か (greenfield=domain / brownfield=schema) を宣言し、他方は projection として導出する。

> **read/cache/mutation projection の具体化は `data-access-protocol.md` (DDP)**。volatility (I6) 行を tier 制 (DA-0 framework-native / DA-1 library 正規化 / DA-2 full DDP) に展開し、entity cache と list (ordered connection) を別 SoT に、cache key を canonical 化、楽観既定 + list-affecting invalidation を強制する。fate の「使い捨て View」= ここでの selector/projection、Next RSC の colocation = projection の宣言先、を framework 非依存に蒸留したもの。

### I6 鮮度の非web射影 (freshness projection)

I6 の鮮度・可逆性は web 専用でなく **「source → 派生コピー」エッジ全般の同期契約** (cache を抽象化すると同期)。web は DDP (上記、client↔server 射影) が担い、**非web の data-source surface は本表で I6 を射影する**。DDP には触れず、`sync protocol` と一般化もしない (統一抽象は実装判断の粒度を殺す god-abstraction、web の具体性を薄める)。surface tag が `data-pipeline / file-sync / scraper` の時のみ発火 (web surface は従来通り DA-tier)。

| source 種別 | refresh_strategy | cadence | staleness_sla | fallback |
|---|---|---|---|---|
| DWH / 分析テーブル | 全洗い替え / incremental / CDC / event-driven | nightly / 5min / on-event | 例「T+1 で可」 | last-good 区画 (partition swap) |
| file | mtime / hash 再検証 | on-access / watch | — | 前回読込値 |
| scraper | crawl + change-detection (dedup) | politeness 間隔 | 例「日次で可」 | 前回スナップショット |

最小 4 フィールド (`refresh_strategy` / `cadence` / `staleness_sla` / `fallback`) を surface の TopContract I6 に記録 (新 structure 不要、web の `data_access` 欄とは別系統)。**refresh が冪等か** (再洗い替えで重複しないか) と **部分 commit しないか** (洗い替えは all-or-nothing、tx 境界 = §3/M7) を必ず宣言。M5 (volatility↔cache) はここでは「staleness SLA ↔ cadence の一致」を検査。

---

## 強制ルール (lint / gate で機械検査)

| # | 禁止 | 検査 |
|---|---|---|
| R1 | ドメイン層で switch によるビジネスロジック分岐 | `strict-refactoring` Rule 3 (Interface + 実装クラス) |
| R2 | ドメインエラーの throw | `strict-refactoring` Rule 5 (Result 型) |
| R3 | `domain` 層が `infra`/`adapter`/ORM を import | `boundary_lint` → `boundary_violation` |
| R4 | task が `prohibited_creates` の集約型を新規定義 | `contract_conformance` (型定義 diff) |
| R5 | 不変条件 (domain-rich+) に `property_ref` 無し | gate reject |
| R6 | 1 tx で複数集約を更新 | M7 検査 (tx 境界 = 集約境界) |
| R7 | ORM とドメイン型の二重定義 (SoT 未宣言) | projection 規則違反 |
| R8 | justify 無しの pessimistic / 毎回サーバー問い合わせ既定 / 楽観なのに失敗時 UX 欠落 | `data-access-protocol.md` D1/D8 (楽観既定、pessimistic は I6+入力喪失軸でのみ) |

---

## tier 動的昇格

開始時 tier 判定は誤りうる (crud-simple と思ったら audit 要件が後出し)。discovery で昇格:

- `data-loss`/`security`/`workflow` タグ出現 → domain-rich へ昇格
- 外部システム / 分散 tx 出現 → integration-heavy へ昇格

昇格時は不足成果物 (制約 / tx 境界等) を self-multiplying タスクとして計画に追記。

---

## 関連リソース

| file | 用途 |
|---|---|
| `contract-spine.md` (同階層) | 守る対象 I1-I6 / ConsistencyMatrix 対 M1-M12 |
| `surface-archetypes.md` (同階層) | tier (crud/domain-rich/integration-heavy) の判定軸 |
| `strict-refactoring/rules-required.md` (同階層配下) | R1 (Rule 3) / R2 (Rule 5) の実装規則 |
| `strict-refactoring/rules-heuristics.md` (同階層配下) | R6 (Rule 12: Repository = Aggregate Root) |
| `verify/property-based.md` (同階層配下) | 不変条件 → L1 PBT (property_ref) |
| `executor.md` Wave gate (同階層) | R3 boundary_lint / R4 contract_conformance |
| `plan-template.md` (同階層) | `domain_slice` (prohibited_creates / property_ref / boundary) |
| `data-access-protocol.md` (同階層) | §7/§10 の read/cache/mutation projection 具体化 (DDP tier 制・楽観既定・cache 持ち方) |
