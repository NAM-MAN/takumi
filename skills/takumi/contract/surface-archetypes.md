# surface-archetypes (内部仕様書) — 6 軸タグ → spine profile

> [!NOTE]
> `contract-spine.md` の 6 軸タグを **spine profile** (どの導出枝 / consistency 対 / oracle tier / gate / 自然さ哲学を有効化するか) に変換する。製品単位でなく **surface (機能面) 単位**で分類する (製品単位 archetype は混成を説明できない粗い箱)。

## なぜ surface 単位か

製品 = surface の合成。`project_mode` (ui/mixed/backend) は surface 構成比から導出される**要約**に格下げる。同一製品でも marketing-LP (bold) と dashboard (restraint) は自然さ哲学が逆。surface ごとに契約 / AC / oracle / gate / 哲学を切り替えることで、混成製品を正しく扱う。

**代表 surface**: `marketing-LP` / `auth` / `dashboard` / `settings-admin` / `public-API` / `billing-engine` / `data-pipeline` / `editor-canvas` 等。

---

## 製品 → surface 分解手順 (Step 0a で実行)

1. **機能面を列挙** — ユーザーが「別の目的で訪れる領域」を 1 surface とする (画面数でなく目的で割る)。
2. **各 surface に 6 軸タグを付与** — 下記判定フロー。
3. **構成比から project_mode を導出** — UI有無 が human-UI/machine+human の surface 比率で ui/mixed/backend を要約。
4. **3 階層契約を確認** — surface (一次) / screen (合成) / region (混載埋込)。

> 単一 surface 製品 (例: API のみ) は従来の単一 project_mode と等価 (後方互換)。

---

## 3 階層契約 (surface だけで UI を閉じると破綻)

| 階層 | 責務 | 契約内容 |
|---|---|---|
| **surface** (一次) | 機能面・ドメイン責務 | TopContract / AC / oracle / gate / 6 軸タグ |
| **screen** (合成) | region をどう合成するか | 画面固有の視覚密度 / ナビ階層 / レスポンシブ / 情報優先度 |
| **region** (上書き) | 混載埋込の境界 | 別 surface 断片の tag override (例: dashboard 内の billing widget) |

screen 契約が無いと画面固有の密度・ナビ・レスポンシブ崩れが surface から漏れる。region を一次にするとページ全体の自然さが死ぬ。**一次は surface**。

---

## 6 軸タグ判定フロー

各軸を独立に判定 (直交)。`contract-spine.md` の 6 軸定義を使う。

| 軸 | 判定の問い |
|---|---|
| **UI有無** | 人間が画面を見るか? (none=内部処理 / API-only / human-UI / machine+human=管理画面付き batch) |
| **状態複雑度** | 状態遷移があるか? (stateless / CRUD / workflow=承認経路等 / realtime=購読) |
| **オラクル有無** | 正しさを機械判定できるか? (deterministic / schema-checkable / heuristic / human-gated) |
| **変更リスク** | 壊れたときの波及範囲? (local / cross-surface / contract-breaking) |
| **利用者** | 誰が使うか? (end-user / operator / admin / developer) |
| **失敗影響** | 最悪何が起きるか? (cosmetic / recoverable / data-loss / security) |

---

## タグ → spine profile マッピング

profile は以下 5 軸の有効化を決める。

### (a) 導出枝 (どのパイプラインを回すか)

| 条件 | 有効化 |
|---|---|
| UI有無 ∈ {human-UI, machine+human} | UI 派生パイプライン (ObjectModel→ViewModel→AppFrame→LayoutPrimitive→StylePass、`design/`) |
| UI有無 ∈ {none, API-only} | UI 枝を**全て skip**。ロジック/データ projection のみ |
| 常時 | ロジック/データ projection (ObjectModel→DB/API、`domain-data-primitives.md`) |

### (b) ConsistencyMatrix 対の取捨 (`contract-spine.md`)

| 条件 | 適用対 |
|---|---|
| 常時 (UI 無しでも) | M1-M8 (データ canonical) + M9 (orphan) + M12 (prohibited_creates) |
| UI有無 = human-UI/machine+human | + M10 (UI state 網羅) + M11 (enum 4 層) + 人間対 H1-H6 |
| UI有無 = none/API-only | UI 系 (M10/M11, H1/H2/H3/H5) を**落とす** |

### (c) oracle tier (検証の重さ)

| オラクル有無 | tier |
|---|---|
| deterministic | 型 + 単純 assertion |
| schema-checkable | + L1 PBT / schema validation |
| heuristic | + L4 model-based / 圧縮人間ゲート |
| human-gated | 人間必須対 (H1-H6) を発火 |

### (d) gate strictness

| 失敗影響 | strictness |
|---|---|
| cosmetic | soft (warning) |
| recoverable | standard |
| data-loss / security | **critical** (human floor、mutation_floor +10、tx 境界必須) |

### (e) 自然さ哲学 (UI surface のみ)

| surface 種別 | 哲学 |
|---|---|
| marketing-LP / 演出系 | bold / distinctive (`frontend-design` 寄り、escape hatch 許可) |
| dashboard / form / admin | restraint (厳格 primitive のみ、escape 禁止) |

### (f) データアクセス既定 (DDP、`data-access-protocol.md`)

**まず DA tier を導出 (既定 DA-0、迷ったら下 tier)**:

| 条件 | DA tier |
|---|---|
| `状態複雑度=realtime` かつ大規模 entity graph・cross-view 整合 | DA-2 候補 |
| `状態複雑度=workflow` で同一 entity を ≥3 view が異 shape 消費 / 手動 invalidation 痛む | DA-1 候補 |
| それ以外 (stateless / CRUD、大多数) | **DA-0** |

> **非web の data-source surface (`data-pipeline` / `file-sync` / `scraper`) は DA-tier でなく I6 鮮度の非web射影を使う** (`domain-data-primitives.md` §10 「freshness projection」): refresh_strategy (全洗い替え/incremental/CDC) / cadence / staleness_sla / fallback。web の DDP とは別系統で、cache=同期の抽象を web を薄めずにカバー。

**次に楽観/cache 既定** (read/mutation 宣言の初期値、web surface のみ):

| 条件 | 既定 |
|---|---|
| `失敗影響=data-loss/security` ∨ 希少資源競合 ∨ 入力喪失軸 (stale overwrite/並行編集等) | **pessimistic** (or confirm/rebase) |
| `状態複雑度=realtime` | **subscribe** |
| それ以外 | **optimistic + cache** (既定 ON) |

store-scope は `利用者` / visibility (I5) から導出 (viewer ごとに見える field が違えば scope 分離)。**第7軸は作らず既存 6 軸の組合せで導出** (catalog 肥大化回避)。

> 楽観既定値の `null` は **「mutation 無し / 契約上 非該当」を意味する** (「未検討」ではない)。stateless surface (marketing-LP 等) は null。判定漏れと区別するため、mutation を持つ surface は必ず optimistic / pessimistic のいずれかを取る。

### (g) 巡視 enablement (挙動/視覚の発見、`junshi/`)

surface が **巡視対象** (実アプリ走行による挙動/視覚発見、発見ラダー L6 / per-Wave hook) になるかを導出する。

| 条件 | 巡視 |
|---|---|
| (`UI有無 ∈ {human-UI, machine+human}` または `状態複雑度 ∈ {workflow, realtime}`) かつ harness + 安全 containment + `.takumi/specs/{surface}.md` | **巡視対象**。実走行で TopContract 違反・回帰・視覚崩れ・摩擦を炙る |
| `UI有無 ∈ {none, API-only}` かつ `状態複雑度 ∈ {stateless, CRUD}` | 巡視 skip (静的 L0-L5 で足りる) |
| harness / containment / spec のいずれか欠落 | 巡視 skip (静かに縮退、後方互換) |

巡視オラクルは contract-spine に接地: spec=I/T、differential=M5/M11、metamorphic=I4/I6/T4、taste=H1-H3 (advisory・never-block)。**pilot-gated** (`junshi/pilot.md`)。

> 例: `auth`(workflow) / `dashboard`(human-UI) / `editor-canvas`(realtime) は巡視対象。`billing-engine`(none/workflow) は harness 揃えば metamorphic/spec のみ (UI 枝 skip)。`marketing-LP`(stateless) は巡視 skip。

---

## 代表 surface の profile 例

| surface | UI有無 | 状態 | オラクル | リスク | 利用者 | 失敗影響 | 有効化される主なもの |
|---|---|---|---|---|---|---|---|
| `marketing-LP` | human-UI | stateless | heuristic | local | end-user | cosmetic | UI 枝 (bold 哲学・escape 許可) / H1-H2 / soft gate |
| `auth` | human-UI | workflow | schema-checkable | contract-breaking | end-user | security | UI 枝 (restraint) / I4 遷移表 / L4 / **critical gate** |
| `dashboard` | human-UI | CRUD | schema-checkable | cross-surface | operator | recoverable | UI 枝 (restraint) / M10/M11 / 標準 gate |
| `settings-admin` | human-UI | CRUD | deterministic | cross-surface | admin | data-loss | UI 枝 (restraint) / M4 authz / **critical gate** |
| `public-API` | API-only | CRUD | schema-checkable | contract-breaking | developer | data-loss | UI 枝 skip / M1-M9 / API validation / **critical gate** |
| `billing-engine` | none | workflow | deterministic | contract-breaking | — | data-loss | UI 枝 skip / M3/M6/M7 (tx 境界) / L4 / **critical gate** |
| `data-pipeline` | machine+human | realtime | schema-checkable | cross-surface | operator | recoverable | M5 (volatility) / 監視 UI のみ UI 枝 |
| `editor-canvas` | human-UI | realtime | heuristic | local | end-user | recoverable | UI 枝 (escape hatch 許可・所有者明示) / M5 / H5 |

### 代表 surface の DA tier / 楽観既定 (大多数は DA-0)

| surface | DA tier | 楽観既定 | 理由 |
|---|---|---|---|
| `marketing-LP` | DA-0 | (mutation 無) | stateless |
| `auth` | DA-0 | **pessimistic** | security / 不可逆 (login 失敗の楽観表示は危険) |
| `dashboard` | DA-0 | optimistic | CRUD・可逆 |
| `settings-admin` | DA-0 | optimistic (一部 confirm) | data-loss 設定のみ confirm |
| `public-API` | — (UI 無) | — | client 側で宣言 |
| `billing-engine` | DA-0/1 | **pessimistic** | 不可逆 + critical |
| `editor-canvas` | **DA-2 候補** | optimistic + subscribe | realtime + 大規模 graph |

大多数が DA-0 = シンプル既定。DA-2 は editor-canvas のような realtime + 大規模 graph のみ。

---

## 自己増殖時の扱い

surface を増やすより **6 軸タグの値の組合せ**で網羅する (catalog 肥大化を避ける)。新しい surface 種別が頻出したら代表 profile に行追加、軸そのものは 6 のまま (7 軸以上にしない)。

---

## 関連リソース

| file | 用途 |
|---|---|
| `contract-spine.md` (同階層) | 6 軸タグ定義 / 3 構造物 / ConsistencyMatrix 対 |
| `domain-data-primitives.md` (同階層) | ロジック/データ projection 枝の中身 |
| `SKILL.md` Step 0a (同階層) | surface 分解の起動点 |
| `design/README.md` (同階層配下) | UI 派生枝 (human-UI surface 時) |
| `data-access-protocol.md` (同階層) | (f) DA tier + 楽観/cache 既定の導出先 (DDP) |
| `executor.md` (同階層) | mode param で UI 枝 skip (none/API-only)、per-Wave 巡視 hook |
| `junshi/README.md` (同階層配下) | (g) 巡視 enablement の対象モード (挙動/視覚発見) |
