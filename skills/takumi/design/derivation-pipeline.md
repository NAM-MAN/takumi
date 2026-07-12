# derivation-pipeline (design mode 補助) — 契約 → UI の OOUI 派生

> [!NOTE]
> `design/README.md` / `runtime.md` から参照。TopContract (`contract-spine.md`) から UI を**契約駆動**で導出する 6 連鎖。新しい top-level 構造を作らず、DerivationMap が記録する導出経路 (`kind: ui` 行) として表現する (別 mode にすると OOUI 推論とドメイン契約が分断される)。

## 6 連鎖 (DerivationMap が記録)

```
TopContract → ObjectModel → ViewModel → AppFrame/Chrome → LayoutPrimitivePlan → StylePassPolicy
 (I1-I6 +     (domain/      (collection/  (header 所有・     (10 primitive       (layout/skin
  T1-T4)       workflow      detail/        nav model)        nest 合成)          class 分類)
               object 分離)  task-flow)
```

ロジック/データ側 (DB/API projection・楽観的 UI) は**対称の派生**として `domain-data-primitives.md` が担う。ObjectModel が両者の共有 index (同型禁止)。

---

## Stage 1: ObjectModel (契約駆動、Phase 1 IA を改訂)

object 抽出元を **AC 文言でなく TopContract** にする (AC 文言抽出は症状ベースで脆い、契約由来なら安定)。

- **domain object** と **workflow object** を分離 (前者 = I1-I6 のエンティティ/値、後者 = T1-T4 のタスク/手続き)。
- 既存 `phases-1-3.md` Phase 1 の OOUI (object→action→screen→sitemap) の **object 抽出元を TopContract に差し替え**。
- ObjectModel = **contract index** (source of truth でない)。共有は identity (I1) / 多重度 (I2) / 不変条件 (I3) / action 意味 (I5) / volatility (I6) / 権限境界 (I5) のみ。形は層ごと projection (`domain-data-primitives.md` §9)。

## Stage 2: ViewModel

object 中心か task 中心かは**二択でなく** `object view + task overlay`。

- **判定軸** = 主導権が「object の状態遷移」か「ユーザーの手順」か。
- collection / detail / task-flow の 3 形態に展開。
- 各 ViewModel は元 object に紐付き (M9 orphan 検出: source なき view はない)。

## Stage 3: AppFrame / ChromeContract (新規、共通 chrome を一級化)

共通 chrome (header/sidebar/nav) を screen 所有にも surface 所有にもしない (どちらも壊れる)。

| 要素 | 所有者 |
|---|---|
| global header | **AppFrame** (cross-surface 単一所有) |
| sidebar nav | surface / object-scope |
| content outlet | screen |

- surface 差分は **fork でなく nav model 差し替え** (header を複製しない)。
- surface は chrome policy を**選ぶ** (所有しない)。`SurfaceChromePolicy` で nav model を宣言。

## Stage 4-6: Layout + Style

- **Stage 4 LayoutPrimitivePlan**: `layout-primitives.md` の 10 primitive nest 合成 (骨格、styling 無)。
- **Stage 5-6 StylePassPolicy**: `layout-primitives.md` §4 の layout/skin 2-pass。Phase B は skin allowlist のみ (lint 強制)。
- intent→primitive routing / hack lint / 合成 component は `layout-primitives.md` §3/§5/§7。

---

## ロジック/データ派生 (UI と対称、`domain-data-primitives.md` 参照)

ObjectModel から **各層独自の形**へ projection (同型禁止、`aggregate 境界 = Object 境界` の前提禁止):

| 共有要素 | DB | API | UI |
|---|---|---|---|
| 多重度 (I2) | FK / join | relation shape | collection / detail |
| 不変条件 (I3) | constraint / tx | validation | prevention (disabled) |
| action (I5) | — | command | affordance + authz |
| volatility (I6) | cache | refetch / subscribe | stale 表示 |

**データ相互作用契約** は画面任意でなく契約導出 (`domain-data-primitives.md` §7 / `../contract/data-access-protocol.md`): **楽観的 UI は既定 ON**、pessimistic は I6 6 因子 + 入力喪失軸が立つ時のみ (payment / 希少資源競合 / フォーム保存)。fetch freshness = volatility × surface 失敗影響。read/cache/mutation の具体は DDP tier 制 (既定 DA-0 = framework-native)。

---

## 関連リソース

| file | 用途 |
|---|---|
| `../contract/contract-spine.md` | TopContract (I1-I6 + T1-T4)、DerivationMap、ConsistencyMatrix |
| `../contract/domain-data-primitives.md` | ロジック/DB/分離 projection (UI と対称の派生) |
| `layout-primitives.md` (同ディレクトリ) | Stage 4-6 (10 primitive / StylePassPolicy / lint) |
| `l7-invariant.md` (同ディレクトリ) | 構造化レンダー監査 (L-detect 保険網) |
| `phases-1-3.md` (同ディレクトリ) | Phase 1 IA (本書 Stage 1 で object 抽出元を TopContract に改訂) |
