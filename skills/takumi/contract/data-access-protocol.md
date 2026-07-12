# data-access-protocol (DDP、内部仕様書) — サーバー状態/キャッシュ/楽観 UI の生成 discipline

> [!NOTE]
> `strict-refactoring/rules-ui-state.md` (**local component state** の tier A-D) の **server-state 双子**。あちらが「画面内の状態」を守るのに対し、本書は「**サーバーから来る状態 = キャッシュ・取得・更新**」を守る。`domain-data-primitives.md` §9-10 の projection (ObjectModel = contract index、層別 projection) を **read/cache/mutation 側で具体化**したもの。

## 思想 (3 行)

- 「指定なし実装」は毎回サーバー問い合わせ・楽観 UI 無視・cache key 手書きに堕ちる。**生成空間を狭め**、楽観既定・契約導出キャッシュを構成的に強制する。
- ただし **既定は最小実装**。複雑度が閾値を超えて初めて機構を足す (`rules-ui-state.md` の「state 0-2 個なら useState 直書きで OK」と同型)。シンプルで足りる所に codegen を建てるのは過剰実装。
- fate (使い捨て View 合成) も Next.js RSC (View 層を RSC が吸収 + colocation) も本質を近似しているだけ。本質 = 「read は使い捨て projection の宣言、cache は契約から機械導出、AI が触る面は極小」。framework に依存せずこれを蒸留する。

---

## Tier 表 (DDP の核心、過剰実装防止) <!-- RULE: ddp-da-tier-escalation T1:TODO-static-check -->
<!-- scope:DA tier selection / shall:default DA-0; escalate only on measurable trigger; demote if trigger unmet / not:skip tier-0 without trigger evidence / applicability:task.data_access != null / evidence:gate warning enforced; script TODO -->

> [!IMPORTANT]
> **既定は DA-0。機構は測定可能なトリガが発火して初めて昇格する。迷ったら下の tier に倒す** (`rules-ui-state.md` の「判定不能は小規模側」と同じ)。

| tier | 設計 | 何を使う | 典型 surface |
|---|---|---|---|
| **DA-0** (既定・大多数) | **framework-native colocation** | Next.js: Server Component fetch + Server Action + `revalidateTag` / TanStack Query: `useQuery`+`useMutation` 組込 `onMutate` 楽観。**custom 機構ゼロ** | settings / simple CRUD / form / list-detail |
| **DA-1** (中) | **library 提供の正規化** | TanStack structural sharing + queryKey 規約 / RTK Query / urql graphcache。**custom codegen なし** | 同一 entity を多数 view が異 shape で消費、手動 invalidation が痛む |
| **DA-2** (重・希少) | **full DDP** (宣言→codegen→canonical AST key→connection-invalidation SoT) | fate / Relay 圏。**大多数の project は到達しない** | realtime + 大規模 entity graph + cross-view consistency で library が破綻 |

### 昇格トリガー (測定可能、AST/観測ベース)

- **DA-0 → DA-1**: 同一 entity を **≥3 view** が異なる shape で消費する、OR 手動 invalidation 起因のバグを観測した。
- **DA-1 → DA-2**: realtime 購読 + ordered connection + aggregate への楽観更新が同時に要る、OR library の正規化 cache が consistency 要件を表現できない。
- **降格も可**: トリガー未達なのに上位機構があれば剥がす (gate が warning、後述)。

---

## DA-0 (既定・最優先) — framework-native で 5 行<!-- RULE: ddp-d7-no-overengineering T1:TODO-static-check -->
<!-- scope:DA-0 tier boundary / shall:zero custom mechanisms at DA-0; gate warns/fails on codegen or normalized store at DA-0 without trigger / not:add codegen/canonical-AST/normalization-store before escalation trigger fires / applicability:task.data_access != null && task.data_access.tier == "DA-0" / evidence:false -->

大多数の surface はここで完結する。**守るのは 4 つだけ** (どれも framework 機能の範囲、機構は足さない。以下 4 sub-section):

### 1. 楽観を既定にする <!-- RULE: ddp-optimistic-default T1:TODO-static-check -->
<!-- scope:mutation polarity / shall:default optimistic unless I6 or input-loss risk / not:pessimistic without I6 factor or input-loss axis documented / applicability:task.data_access != null / evidence:false -->

framework の楽観ワンライナー (`useOptimistic` / `useMutation.onMutate`)。await してから反映は pessimistic を選んだ時だけ。**ただし入力喪失リスクのある操作は除外** (後述「楽観 UI 既定」の安全軸)。

### 2. 失敗時 UX を必ず書く (楽観の代償) <!-- RULE: ddp-d1-silent-catch T1:templates/ddp-lint.mjs -->
<!-- scope:optimistic mutation error handling / shall:every optimistic mutation must have failure UX (re-sync+notify+retain-input); no silent catch / not:swallow server error after optimistic display / applicability:task.data_access != null / evidence:true -->

楽観にした mutation は失敗時に **再同期 + 通知 + 入力保持** を必須にする。「楽観表示しっぱなしで server 失敗を握り潰す」は data-loss。最小形は `catch { refresh(); toast.error(...) }` (name_editor の gallery approve が実例)。

### 3. entity tag だけでなく list-affecting も invalidate <!-- RULE: ddp-d2-list-invalidation T1:templates/ddp-lint.mjs -->
<!-- scope:cache invalidation completeness / shall:if mutation affects list membership/order/count then invalidate entity tag + list tag / not:invalidate entity tag only when list membership changes / applicability:task.data_access != null / evidence:true -->

mutation が list の membership/順序/件数を変えるか (insert/remove/reorder) を判定し、変えるなら **entity tag + 該当 list tag の両方**を invalidate。detail だけ直して list を腐らせるのが「最初に壊れる 1 点」。**該当 list が無い / 契約から導出できない mutation は entity tag のみで十分** — DA-0 で connection-invalidation の機構 (effect enum 宣言など) を建てる必要はない (それは DA-2)。realtime でない polling app は次 poll でも修復される。

### 4. cache key を手書きしない <!-- RULE: ddp-d5-stringify-key T1:templates/ddp-lint.mjs -->
<!-- scope:cache key construction / shall:use framework key convention (RSC dedupe / TanStack queryKey array / URLSearchParams) / not:raw string key or JSON.stringify(object) as cache key / applicability:task.data_access != null / evidence:true -->

framework 規約 (RSC fetch dedupe / TanStack queryKey 配列 / `URLSearchParams` のような順序安定 string 化) に従う。生 string key・`JSON.stringify` の object key は禁止。

### Next.js App Router (RSC + Server Action)

```tsx
// app/issues/[id]/actions.ts — mutation は Server Action、invalidate を同居
export async function renameIssue(id: string, title: string) {
  "use server"
  await db.issue.update(id, { title })   // ③ DB 直、API route 不要 = 高凝集
  revalidateTag(`issue:${id}`)           // ② invalidate 宣言 (entity から導く tag)
}

// app/issues/[id]/page.tsx — read は Server Component で直 fetch (cache 規約に従う)
export default async function Page({ params }) {
  const issue = await getIssue(params.id)   // fetch dedupe / unstable_cache に乗る
  return <IssueView issue={issue} action={renameIssue} />
}
```

```tsx
// 楽観 UI: 即時反映 + 失敗時 再同期/通知 (rollback は明示実装、「自動」に頼らない)
const [optimisticTitle, setOptimisticTitle] = useOptimistic(issue.title)
async function onSubmit(next: string) {
  setOptimisticTitle(next)                       // ① 即時反映
  try { await renameIssue(id, next) }            // Server Action
  catch { router.refresh(); toast.error("保存に失敗。再同期しました") }  // ② 再同期+通知 (握り潰し禁止)
}
```

### TanStack Query (client cache が要る場合)

```tsx
useMutation({
  mutationFn: renameIssue,
  onMutate: async (next) => {                      // ① 楽観既定 (組込)
    await qc.cancelQueries({ queryKey: ["issue", id] })
    const prev = qc.getQueryData(["issue", id])
    qc.setQueryData(["issue", id], { ...prev, title: next })
    return { prev }                                 // rollback context
  },
  onError: (_e, _v, ctx) => qc.setQueryData(["issue", id], ctx.prev),  // 自動 rollback
  onSettled: () => qc.invalidateQueries({ queryKey: ["issue", id] }),  // ② invalidate 宣言
})
```

> [!WARNING]
> **DA-0 に codegen / 正規化 store / canonical AST key 機構を持ち込むな**。昇格トリガー未達でこれらが現れたら過剰実装。gate が warning を出す (後述)。シンプルで足りるならシンプルに。

---

## DA-1 (中) — library の正規化に乗る

同一 entity を複数 view が異 shape で消費し、DA-0 の手動 invalidation が痛くなったら、**library が既に持つ正規化**を使う (自前で作らない)。

- **TanStack Query**: queryKey 規約を `[entity, id, params]` に統一し、`structuralSharing` で参照安定化。`setQueryData` で entity 単位更新を伝播。
- **RTK Query / urql graphcache**: `__typename + id` で自動正規化させる。tag/typename invalidation を宣言。
- mutation は引き続き楽観既定。invalidate は entity tag + 影響する list を library の tag 機構で宣言。
- **まだ custom codegen は不要**。library の規約に AI が宣言を合わせるだけ。

---

## DA-2 (重・希少) — full DDP

> [!WARNING]
> **到達条件を満たした時のみ。** realtime + 大規模 entity graph + cross-view consistency で library の cache が破綻する surface に限る。大多数の project はここに来ない。来てもいないのに以下を建てるのは最大の過剰実装。

### 5 層アーキテクチャ

```
① read/mutation 宣言   ← AI が feature 実装で触る唯一の面 (極小)
        ↓ build 時 codegen (主役・決定論的)
② generated/           ← 手編集禁止・CI 差分検査
   keys / selectors / invalidation plans / rollback / queryFn・mutationFn wrappers / typed adapters
        ↓
③ runtime adapter      ← 薄い実行器 1 枚 (TanStack / RSC / Remix / raw fetch)
```

AI が触るのは①の宣言だけ。global cache 設定も framework の fetch 心象も保持不要 = **context 最小**。生成層は一度書かれ `generated/` に隔離・手編集禁止。

### 最小宣言 schema (AI が書く field を太字に限定)

```ts
read({ entity: "Issue", id: { orgId, issueId },     // **entity / id**
       shape: ["title", "status", "assignee.name"], // **shape** (projection)
       freshness: "revalidate",                      // **freshness tolerance**
       visibility: "viewer-scoped" })                // **visibility** (narrowing のみ)

mutate({ event: "IssueRenamed", input,               // **event / input**
         touches: {                                   // **touches** = invalidation の源
           entities: [{ entity: "Issue", id }],
           connections: [{ predicate: "Issue.list where assignee=me",
                           effect: "mayReorder|mayUpdateEdge" }] },  // ★必須
         optimistic: true })                          // **optimistic** (既定 true)
```

key / selector / invalidation plan / rollback / queryFn は **全て codegen が生成**。

> [!IMPORTANT]
> **connection 影響は契約から導出、AI は entity touches だけ書く**: `touches.connections` の predicate/effect は TopContract の list 定義 (ordering identity / filter) から **codegen が候補を導出**し、AI は確認・絞り込みのみ。AI が domain graph 全体を頭に入れて手書きするのではない (これが崩れると「触る面は宣言だけ = context 最小」が成立しない)。導出できない list は契約側の不足として露出させる (orphan、M9)。

### canonical AST key 規則 (cache key 衝突を証明可能にゼロへ) <!-- RULE: ddp-canonical-ast-key T1:TODO-static-check -->
<!-- scope:DA-2 cache key construction / shall:keys must be opaque structured tuples with entity, id, shape, freshness, visibility, tenant, auth-scope, schema-version; semantic equality by type-generated constructor only / not:string keys; JSON.stringify(object) keys; unversioned keys / applicability:task.data_access != null && task.data_access.tier == "DA-2" / evidence:false -->

文字列 key・`JSON.stringify` key は**禁止** (衝突・stale・dep 漏れの主因)。key は **canonical AST equality** で同値判定する (hash は単なる index)。条件:

1. opaque structured tuple (生 string にしない)
2. `entity` は globally-unique schema id
3. `id` は canonical encoder を通す (順序・型を正規化)
4. `shape` / `freshness` / `visibility` / `tenant` / `auth-scope` を key に含む
5. object キー順序を正規化、型タグ付き
6. schema version 付き (破壊変更で自動 miss)
7. 「同一 key ⇒ 同一意味」を**型生成でしか作れない**ようにする

### 正規化 store の罠 5 種 (設計で潰す) <!-- RULE: ddp-store-scope-discipline T1:TODO-static-check -->
<!-- scope:DA-2 normalized store design / shall:separate entity cache from list/connection SoT; track loadedAt+source per field; hold aggregate identity separately; distinguish derived vs server-authority fields; scope store per viewer / not:conflate entity cache with list ordering; conflate "absent" with "not fetched"; mix derived and server fields / applicability:task.data_access != null && task.data_access.tier == "DA-2" / evidence:false -->

| 罠 | 対処 |
|---|---|
| **partial entity** | field 毎に `loadedAt` / `source` を持つ。「未取得」と「不在」を混同しない |
| **pagination / list** | **entity cache と別 SoT**。list = ordered connection (cursor / filter / sort / membership) |
| **aggregate** (count/sum) | entity 正規化では保てない。**aggregate identity** を別に持つ |
| **derived field** | selector 由来か server-authority かを区別 (混ぜると drift) |
| **viewer 差** | viewer ごとに見える field が違うなら **store scope を分ける** |

### connection-invalidation (最初に壊れる 1 点) <!-- RULE: ddp-connection-invalidation T1:TODO-static-check -->
<!-- scope:DA-2 connection/list cache invalidation / shall:every mutation declares touches.connections with predicate+effect enum; connection SoT invalidated independently from entity cache / not:omit connection invalidation when mutation may affect ordered list membership/order/cursor/filter / applicability:task.data_access != null && task.data_access.tier == "DA-2" / evidence:false -->

> entity touch は合っているのに **ordered connection の再評価条件が漏れ**、詳細は更新されるのに一覧順・件数・cursor・filter 結果が腐る。これが採用時に最初に壊れる箇所。

対策: mutation の `touches.connections` に **影響を必ず宣言**させる。effect enum:

```
mayInsert | mayRemove | mayReorder | mayUpdateEdge
```

entity cache と list cache を別 SoT にした以上、invalidation も別物として設計する。曖昧にすると DDP が「賢い key 生成器」で終わる。

---

## 契約由来 vs 宣言上書き (全 tier 共通の薄い不変条件) <!-- RULE: ddp-d6-contract-narrowing T1:TODO-static-check -->
<!-- scope:contract-to-declaration override policy / shall:declarations may only narrow TopContract axes (visibility, volatility, ordering); every read/mutation must carry a contract anchor / not:widen visibility; relax volatility; create undefined ordering; treat irreversible mutation as optimistic / applicability:task.data_access != null / evidence:false -->

DA-0 でも守る最小規律。`contract-spine.md` の TopContract から来る軸は宣言で**緩和できず、狭めるだけ**:

| 契約 (I1-I6) からしか来ない | 消費点が宣言で上書き可 |
|---|---|
| identity (I1) / visibility・authz (I5) / reversibility (I6) / volatility 鮮度クラス (I6) / ordering identity | shape (projection) / freshness tolerance / visibility **narrowing** / ordering **view 選択** |

**禁止 4 項**: visibility を広げる / volatility を下げる (鮮度要件を勝手に緩める) / 未定義 ordering を作る / 不可逆 mutation を optimistic 扱いする。例外は domain contract 側に昇格してレビュー対象にする (勝手に上書きさせない)。

> **各 read/mutation は contract anchor を持つ** (DA-0 でも必須): plan の `surface_ref` / `derived_from` (entity → I 項) を data_access 宣言に紐づける。これが無いと「狭めるだけ」(D6) と整合 (D8) が検査不能になり、規律が空文化する。DA-0 では colocation 先の surface が暗黙 anchor、DA-1/2 では明示。

---

## 楽観 UI 既定 (全 tier 共通) <!-- RULE: ddp-optimistic-discipline T2:LLM-advisory -->
<!-- scope:optimistic UI correctness discipline / shall:optimistic patch reuses rules-ui-state reducer/applyEvent; rollback is explicit snapshot; failure always triggers notify+resync; convergence property tested (reconcile(applyOptimistic)==serverOnly) / not:separate optimistic logic from domain transition function; rely on "auto rollback" without explicit error handling / applicability:task.data_access != null / evidence:false -->

- **既定は optimistic**。pessimistic は I6 の 6 因子 — 不可逆 / critical / 希少資源競合 / 非冪等 / 競合解決未定義 / 補正コスト大 — のいずれかが立つ時のみ (`domain-data-primitives.md` §7)。payment・在庫枠取りは pessimistic 必須。
- **入力喪失・誤確定リスクは別軸で pessimistic / confirm に倒す** (6 因子が可逆でも独立に効く): stale overwrite (古い値で上書き) / 複数タブ・並行編集 / server 側 canonicalization (整形で値が変わる) / permission downgrade / unique 制約による別値補正。これらは「楽観表示がユーザー入力を失わせる / 誤確定させる」ため、pessimistic か **confirm/rebase** (server 確定値で再描画) を必須にする。フォーム保存系で特に注意。
- **optimistic patch は別経路を作らない**: `rules-ui-state.md` の reducer / `applyEvent` (domain 遷移関数) を**再利用**する。楽観用に別ロジックを書くと drift する。
- **rollback は明示実装 (「自動」に頼らない)**: 更新前スナップショットを保持し server 失敗で差し戻す。`useOptimistic` は再 render で巻き戻るが、**エラー通知と再同期 (refresh/refetch) は別途必ず書く** (握り潰し禁止、上記 DA-0 #2)。
- **楽観の正しさは収束 property で検証** (`test-strategy.md`、metamorphic+differential): `reconcile(applyOptimistic(s, m)) == serverOnly(s, m)` (楽観経路と server-only 経路が同状態に収束) + 失敗時 rollback で `s` に戻る。`data_access.optimistic == true` で verify profile に L3 Differential が自動付加。

---

## 他 stack fallback

React/Next 以外でも原理は同じ (`rules-ui-state.md` の他言語節と対称):

- **SWR**: `useSWRMutation` + `mutate(key, optimisticData, { rollbackOnError })`。
- **Remix / React Router**: loader/action + `useFetcher` の楽観 UI (`fetcher.formData` で即時表示)。
- **Vue**: TanStack Query (Vue Query) / Pinia の楽観 patch + rollback。
- **Go / Rust (BFF/server)**: cache 層は ETag / version で stale 検出、楽観相当は client に委譲。`data_access` 宣言は server 側 read projection の shape 固定に使う。

---

## 強制ルール (tier で強制度が変わる、`executor.md` gate) <!-- RULE: ddp-gate-table T1:TODO-static-check -->
<!-- scope:D1-D8 enforcement matrix / shall:D1 hard all tiers; D2 hard all tiers; D5 warning DA-0 / hard-fail DA-1/2; D6 hard all tiers; D7 hard-fail DA-0; D4 hard-fail DA-1/2; D3 advisory DA-0 / hard DA-1/2; D8 advisory all tiers / not:treat advisory rules as unenforced; skip D1/D5 AST check / applicability:task.data_access != null / evidence:false -->

| # | ルール | DA-0 | DA-1/DA-2 |
|---|---|---|---|
| D1 | mutation に楽観 (or pessimistic+I6/入力喪失根拠) 宣言 **+ 楽観なら失敗時 UX (再同期/通知/入力保持)** | **hard** | **hard** |
| D2 | invalidate 対象が list-affecting を覆う | **hard** (entity tag + list-affecting なら list tag) | **hard** (connection effect 宣言) |
| D3 | read に shape / freshness 宣言 | advisory | **hard** |
| D4 | `generated/` 手編集禁止 (CI 差分) | — | **hard fail** |
| D5 | cache key lint (`JSON.stringify` object key 検出) | warning | **hard fail** |
| D6 | 「狭めるだけ」違反 (visibility 拡大等)・contract anchor 欠落 | **hard** | **hard** |
| D7 | **過剰実装 (DA-0 に codegen/正規化 store/AST 機構、昇格トリガー未達)** | **hard fail** (剥がす) | — |
| D8 | 楽観/pessimistic・tier 選択が I6/複雑度に整合 | advisory (LLM) | advisory (LLM) |

**存在 = hard / 選択妥当性 = advisory** (`autonomy.md` の floor 哲学: 可逆な品質判断は LLM advisory、不可逆 action は deterministic floor)。

> **D1 (silent-catch) / D5 (stringify key) は機械検査**: `templates/ddp-lint.mjs` (TS compiler AST、zero-extra-dep) が mutation の握り潰し catch と `JSON.stringify(object)` cache key を検出。read(GET)/URLSearchParams は対象外 (FP 回避)。意図的な fire-and-forget (telemetry 等) は `// ddp-lint-ignore R1: 理由` で明示 opt-out (レビュー可能)。`cd <project> && node .../ddp-lint.mjs src`、exit 1 = gate J fail。executor gate J が起動。

---

## 関連リソース

| file | 用途 |
|---|---|
| `strict-refactoring/rules-ui-state.md` | local state tier A-D (本書の双子、楽観 patch に reducer/applyEvent を再利用) |
| `domain-data-primitives.md` §7/§9-10 | 楽観適格性 6 因子 / projection (本書が read/cache 側で具体化) |
| `contract-spine.md` M5/M6 | volatility↔cache / reversibility↔optimistic の機械対 (DDP を検査) |
| `surface-archetypes.md` (f) | 6 軸タグ → DA tier + 楽観/cache 既定の導出 |
| `plan-template.md` `data_access` 欄 | read_projection / mutation_effect の記載 |
| `probe/discover.md` データアクセス発見者 | naive fetch / 楽観漏れ / cache 不具合の検出 |
| `executor.md` Wave gate | D1-D8 の tier-scaled 機械検査 |
| `templates/ddp-lint.mjs` | D1/D5 の機械検査実体 (AST lint、ignore directive 対応) |
| `test-strategy.md` | 楽観の収束 property (metamorphic+differential、optimistic==true で L3 付加) |
