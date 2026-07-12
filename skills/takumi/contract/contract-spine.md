# contract-spine (内部仕様書) — 3 構造物 + 6 軸タグの source of truth

> [!NOTE]
> SKILL.md Step 0 / executor gate / design mode / test-strategy が参照する **契約スパインの定義**。人間の目視チェック (UI 自然さ / ロジック正しさ) を契約で代替し、Wave を細かく分けても職人の実装がぶれない土台。

## 思想 (3 行)

- 頂点契約 = **ドメイン不変条件 + ユーザータスク契約**。UI/API/ロジック AC はここから**並列導出**される従属物 (UI を頂点にするとドメインの沈黙が仕様漏れになる)。
- 目標は「バグ無し」でなく **「仕様漏れを露出させる pipeline」** + 人間レビューを高リスク差分へ圧縮。
- 新規構造物は **3 つのみ**。これ以上は仕様官僚制。発見は構造物を増やさず、既存の対 / 軸の値 / 問診観点の**行追加**として吸収する。

---

## 構造物 1: TopContract — surface ごとのドメイン契約 <!-- RULE: top-contract-i-t-completeness T2:isolated-judgment -->
<!-- scope:each .takumi/specs/{surface}.md / shall:I1-I6 全項 + T1-T4 全項が非空かつ機械検査可能粒度で記述される / not:I/T 項のいずれかが欠落または散文のみ / applicability:task.surface_ref != null / evidence:enforcement/reviewers/contract-conformance.md (未作成=TODO) -->

`.takumi/specs/{surface}.md` の frontmatter + 本文に格納。**ドメイン不変条件 6 種 + ユーザータスク契約 4 項**で構成。散文でなく、各項が機械検査 or property seed に落ちる粒度で書く (illegal state を型で表現不能に)。

### ドメイン不変条件 6 種 <!-- RULE: top-contract-i-t-completeness T2:isolated-judgment -->
<!-- scope:I1-I6 各項 / shall:identity/多重度/状態不変/遷移合法性/権限/volatility が全項 non-null で機械検査か property seed に落ちる粒度 / not:任意省略・散文のみ / applicability:task.surface_ref != null / evidence:false -->

| # | 不変条件 | 内容 | 落とし先 (projection) |
|---|---|---|---|
| I1 | **identity** | エンティティの同一性基準 (natural key / surrogate) | PK ↔ API id ↔ UI key |
| I2 | **多重度・所有** | 関連の cardinality と所有方向 (集約の境界) | FK・join ↔ API relation ↔ collection/detail |
| I3 | **状態不変** | 各状態で常に真な述語 (例: `Confirmed → customerId ≠ ⊥`) | DB constraint ↔ API validation ↔ UI prevention |
| I4 | **遷移合法性** | 許される状態遷移と precondition (全域関数化、未定義遷移は INVALID) | ConsistencyMatrix の遷移表 |
| I5 | **権限・所有境界** | 誰が何を変更できるか (authz) | command ↔ UI affordance ↔ API authz |
| I6 | **volatility・可逆性** | 並行性 / 単位 / 丸め / 鮮度 / 可逆性 | cache・refetch ↔ optimistic・rollback |

### ユーザータスク契約 4 項 <!-- RULE: top-contract-i-t-completeness T2:isolated-judgment -->
<!-- scope:T1-T4 各項 / shall:観測可能成果/事前条件/失敗例外/可逆性が全項 non-null / not:T1=曖昧な「正常動作する」等散文 / applicability:task.surface_ref != null / evidence:false -->

| # | 項 | 内容 |
|---|---|---|
| T1 | **観測可能成果** | 1 AC = 1 観測可能成果 + 主要条件。複数 archetype が要るなら粗いか**シナリオ AC** |
| T2 | **事前条件** | タスクが実行可能になる条件 (権限 / 状態 / 入力) |
| T3 | **失敗・例外業務** | 禁止状態 / 例外フロー / 失敗影響 (cosmetic→data-loss→security) |
| T4 | **可逆性・補正** | undo / rollback / 補償トランザクションの有無 |

> I1-I6 と T1-T4 は **強制問診 4 観点** (`SKILL.md` Step 3: 禁止状態 / 例外業務 / 権限境界 / 状態変化整合性) と対応する。問診はこの 6+4 を埋める対話。

---

## 構造物 2: DerivationMap — 何が契約のどこ由来か <!-- RULE: m9-orphan-zero T1:script -->
<!-- scope:DerivationMap 全エントリ / shall:orphan AC (derived_from 空) ゼロ + orphan TopContract 要素 (未参照 I/T 項) ゼロ / not:片方向検出のみ / applicability:task.surface_ref != null / evidence:scripts/spec-graph.mjs (実装済) -->

UI 画面・状態 / API エンドポイント / AC が TopContract のどの要素から導出されたかの対応表。**orphan を双方向検出**するのが本質 (片方向では仕様漏れが残る)。

```yaml
# DerivationMap エントリ
- artifact_id: "AC-ORDER-003"
  kind: ac | ui | api          # 導出物の種別
  derived_from: [I4, T3]       # TopContract のどの要素由来か (空 = orphan AC)
  status: draft | active | done
```

**orphan 双方向検出**:
- **orphan AC / UI / API** = `derived_from` が空 → 源なき成果物 (over-engineering or 仕様の幽霊)。
- **orphan TopContract 要素** = どの artifact からも参照されない I/T 項 → **未実装要件** (沈黙した仕様)。

> API 契約は新サブシステムを作らない。DerivationMap の `kind: api` 行 + ConsistencyMatrix の対で表現する。

### 仕様ライフサイクル: add / modify / delete <!-- RULE: tier0-contract-immutable T1:script -->
<!-- scope:TopContract I/T 項 (Tier-0保護核) / shall:サイクル内不変、変更は semver major 相当 + human/軍師 gate 必須 / not:AC 修正と同一手順での I/T 項変更 / applicability:task.surface_ref != null / evidence:false -->

要件の再組み込みは追加だけでなく既存仕様の修正・削除も含む。**2 層に分けて前提仕様を守る**:

- **Tier-0 (保護核)** = TopContract の I/T 項。サイクル内**不変**。変更は「再組み込み」でなく**契約改訂** (semver major 相当、人間/軍師 ゲート必須)。
- **Tier-1 (可変)** = AC 群。add/modify/delete 可。

操作別の安全規則:
- **add / modify**: 新規・改訂 AC は通常の `derived_from` + AC-coverage gate を通す。modify 時は旧 `covered_by` の test を **stale 候補**として再検証 (file 単位で「どの test が改訂後 Then と矛盾するか」を flag)。
- **delete**: (1) **M9 orphan 前提チェック** (Tier-0 項を孤児化しないこと) **に加えて** (2) **非 cosmetic AC の削除は既定で human/軍師 floor** <!-- RULE: human-floor-irreversible T1:script --> (`autonomy.md`)。決定的 floor は `risk: critical` **OR 失敗影響 ∈ {data-loss, security}** で発火 (6 軸タグの `失敗影響` を AC まで伝播)。
  > **M9 + risk:critical だけでは不十分**: standard-rated だが失敗モードが data-loss 級の AC (冪等破壊 / batch 部分 commit / クロスセル承認汚染 / page 重複) は risk field だけ見る floor をすり抜ける。根因は floor が AC の `risk` field のみ見て失敗モード深刻度を見ないこと、かつ M9 が **item 粒度**で「ある AC が唯一守る failure-mode invariant」を追えないこと。failure-mode 一意性は機構で完全保証できない → **非 cosmetic 削除は human が既定**、決定的 floor は失敗影響まで広げて取りこぼしを縮小する補助線にとどめる (機構を最後の砦と誤認しない)。

---

## 構造物 3: ConsistencyMatrix — 層をまたいだ整合の対

artifact 間の整合を **対 (pair)** で列挙し、`oracle` で機械判定 / 人間必須を分ける。surface の 6 軸タグで**適用する対を絞る** (backend surface は UI 系の対を落とす)。

### 機械判定 12 対 (deterministic / schema-checkable → gate G) <!-- RULE: consistency-matrix-m1-m12 T1:script -->
<!-- scope:M1-M12 全対 (surface タグで M10/M11 は UI 系のみ) / shall:各対の不一致が 0 であること (M9 orphan-zero 含む) / not:一部対の省略・人間目視代替 / applicability:task.surface_ref != null / evidence:scripts/spec-graph.mjs (M9 実装済、M1-M8 partial) -->

| # | 対 | 判定 |
|---|---|---|
| M1 | identity ↔ PK ↔ API id ↔ UI key | 同一概念に単一 id 系列 |
| M2 | 多重度 ↔ FK・join ↔ API relation ↔ collection/detail | cardinality の一致 |
| M3 | invariant ↔ DB constraint・tx ↔ API validation ↔ UI prevention | I3 が 4 層で表現される |
| M4 | action ↔ command ↔ UI affordance ↔ authz | I5 の 3 点一致 |
| M5 | volatility ↔ cache ↔ refetch・subscribe ↔ stale UI | I6 鮮度の一貫 + cache key canonical / entity↔list(connection) 別 SoT (DDP) |
| M6 | reversibility ↔ optimistic・pessimistic ↔ rollback | I6 可逆性の一貫 + **楽観既定** / patch は遷移関数再利用 / list-affecting invalidation (DDP) |
| M7 | aggregate ↔ tx ↔ command 境界 | 集約境界 = tx 境界 (PM: 高 ROI) |
| M8 | AC ↔ test layer ↔ fixture ↔ assertion 粒度 | test-strategy と接続 |
| M9 | AC ↔ derived_from(TopContract 要素) | orphan AC ゼロ |
| M10 | UI state ↔ AC (空 / エラー / loading / 長文) | 状態網羅 (design 状態 PBT) |
| M11 | enum・状態集合 ↔ 型 union ↔ UI option ↔ DB check | 状態集合の 4 層一致 |
| M12 | prohibited_creates ↔ 新規型定義 diff | 越境集約生成なし (`domain_slice`) |

### 人間必須 6 対 (heuristic → 圧縮人間ゲート、`autonomy.md`) <!-- RULE: craft-h1-h6 T2:isolated-judgment -->
<!-- scope:H1-H6 各対 (UI 系 surface のみ) / shall:brand tone / 情報優先度 / 例外画面 / ユーザー語彙 / 画面遷移 / 業務例外網羅の各観点で reviewer verdict を得る / not:T1 自動代替・省略 / applicability:surface.tags.UI in [human-UI, machine+human] / evidence:false -->

| # | 対 | 判定 (高リスク差分のみ) |
|---|---|---|
| H1 | brand tone ↔ 実装の見た目 | ブランド逸脱 |
| H2 | ドメイン重要度 ↔ 画面の視線誘導 | 情報優先度のズレ |
| H3 | 例外業務 (T3) ↔ エラー / 空画面 | 例外画面の違和感 |
| H4 | ユーザー語彙 ↔ コピー文言 | 専門用語の漏れ |
| H5 | タスク手順 (T1/T2) ↔ 画面遷移 | 導線の不自然さ |
| H6 | 現実の業務例外 ↔ モデルの網羅 | 例外業務の取りこぼし |

> M1-M8 の 8 対が **データ側 canonical 対** (UI 無し surface でも適用)。**M9 (orphan AC) と M12 (prohibited_creates) も常時適用** (backend surface でも orphan / 越境集約生成は問題)。**M10 / M11 (UI state 網羅・enum 4 層) のみ** UI 系 surface で発火 (6 軸タグで取捨)。

---

## 6 軸タグ — surface 分類 (網羅は catalog でなく軸で) <!-- RULE: surface-tags-complete T1:script -->
<!-- scope:.takumi/specs/{surface}.md の tags オブジェクト / shall:6 軸 (UI有無/状態複雑度/オラクル有無/変更リスク/利用者/失敗影響) が全て非空かつ許容値内 / not:軸の欠落・任意値 / applicability:task.surface_ref != null / evidence:false -->

製品は **surface (機能面)** に分解され、各 surface に 6 軸タグを付ける。タグ → spine profile (どの導出枝 / consistency 対 / oracle tier / gate / 自然さ哲学を有効化するか) を決める。詳細マッピングは `surface-archetypes.md`。

```
UI有無:       none / API-only / human-UI / machine+human
状態複雑度:    stateless / CRUD / workflow / realtime
オラクル有無:  deterministic / schema-checkable / heuristic / human-gated
変更リスク:    local / cross-surface / contract-breaking
利用者:       end-user / operator / admin / developer
失敗影響:      cosmetic / recoverable / data-loss / security
```

**タグ → 適用の例**:
- `UI有無 = none / API-only` → ConsistencyMatrix の UI 系対 (M10) と人間ゲート H1/H2/H3/H5 を**落とす**。M1-M8 + M12 のみ。
- `失敗影響 = data-loss / security` → `risk: critical` 扱い、human floor 発火、mutation_floor +10。
- `状態複雑度 = workflow / realtime` → I4 遷移表 + ConsistencyMatrix で L4 model-based 必須。

---

## surface frontmatter schema (`.takumi/specs/{surface}.md`) <!-- RULE: surface-frontmatter-valid T1:script -->
<!-- scope:.takumi/specs/**/*.md の YAML frontmatter / shall:必須 4 field (surface/tags/created/top_contract) + AC エントリの schema が全て valid / not:必須フィールド欠落・surface 重複・tags 6 軸不完全 / applicability:task.surface_ref != null / evidence:false -->

`backlog/schema-frontmatter.md` と対称。`.takumi/specs/**` は gitignore 例外済。

### 必須フィールド (4) <!-- ADVISORY: 規範本体は親 section の RULE surface-frontmatter-valid -->

| field | type | 説明 |
|---|---|---|
| `surface` | string | surface 名 (kebab-case、例: `auth`, `billing-engine`)。プロジェクト内一意 |
| `tags` | object | 6 軸タグ (上記 6 キー必須) |
| `created` | date | `YYYY-MM-DD` |
| `top_contract` | object | I1-I6 + T1-T4 のセクション (空項は `null` 明示) |

optional: `tier0_change_approved_by` (string) — Tier-0 (TopContract I/T 項) を契約改訂で変更した際の承認者。非空なら `spec-graph.mjs --tier0-guard` が当該 spec の Tier0 差分を承認済みとして pass (無承認の Tier0 変更は fail、`tier0-contract-immutable` の機構)。

### AC エントリ (本文、`backlog/acceptance.md` と整合)

```yaml
- id: AC-ORDER-003
  gwt: "Given 確定済注文, When キャンセル, Then 在庫が戻り status=Cancelled"
  ac_class: state-transition   # test-strategy の 5 archetype
  risk: low | standard | critical
  depends_on: [AC-ORDER-001]
  derived_from: [I4, T3]       # DerivationMap と同期 (orphan 検出の源)
  status: draft | active | done
  covered_by: []               # test ファイル参照 (M8)
  task_refs: []                # plan task 参照
```

> 外部要件 source 利用時の `toishi_acceptance_check_id` (`toishi-integration.md`) と矛盾しない (併存可、optional)。

### バリデーション <!-- RULE: surface-frontmatter-valid T1:script -->
<!-- scope:validation rules 1-5 (hard errors) / shall:必須 4 field 欠落/tags 軸欠落/surface 重複 を exit 1 で block / not:warning 扱い・スキップ / applicability:task.surface_ref != null / evidence:false -->

1. 必須 4 field 欠落 → error
2. `tags` の 6 軸いずれか欠落 → error
3. AC の `derived_from` が空 → warning (orphan AC、M9 で検出)
4. `top_contract` の I/T 項が全 AC から未参照 → warning (orphan 要素 = 未実装要件)
5. `surface` 重複 → error
6. **AC 品質 (advisory, LLM)** <!-- RULE: ac-quality-c T2:isolated-judgment -->: gwt の Then が観測可能か (曖昧語 / oracle 不在 / scope 未定義 / mis-trace を検出)。authoring 時の **LLM advisory** で低品質 AC を author に flag する。**hard gate にしない** — 概念は有効だが検出力は **100% 非決定的 LLM 依存** (機械的禁止語彙チェックは subtle ケースを捕捉できない)。spec 品質は不可逆 action でないため advisory が適切 (「safety-critical は deterministic floor」原則の裏返し: 可逆な品質判断は LLM advisory で可)。

---

## 既存コードの監査 runbook (汎用、retrofit)

新規 plan でなく既存リポジトリを契約スパインで監査する手順 (probe/sweep からも起動可):

1. **surface 分解 + 6 軸タグ** — 既存コードを機能面に割り、タグ付け (`surface-archetypes.md`)。
2. **TopContract 逆生成** — 既存の型/スキーマ/バリデーションから I1-I6 を抽出 (brownfield: 既存 schema = 入力、`domain-data-primitives.md` §5)。
3. **DerivationMap orphan 検出** (M9) — 源なき AC / 実装、未実装の TopContract 要素を双方向で洗い出す。
4. **ConsistencyMatrix 機械対** (M1-M12) を当てる — id/多重度/不変条件/authz が 4 層で一致するか。不一致を列挙。
5. **boundary 違反検出** (R3) — `domain` が `infra`/ORM を import している箇所を dependency lint で抽出。
6. **レポート → 起票** — 発見を ICE で triage し backlog へ (`backlog/acceptance.md` の trace 構造で覆盖)。

> reference instance は `backlog/acceptance.md` (AC trace の実証)。

> **巡視による動的補完** (`junshi/`): 静的監査 (1-6) は read-only。behavioral surface で harness が揃えば、巡視が実アプリを走らせ TopContract (I/T) をオラクルに「触ると分かる」違反・回帰・視覚崩れ・摩擦を炙る (発見ラダー L6)。spec=I/T、differential=M5/M11、metamorphic=I4/I6/T4、taste=H1-H3 (advisory) に接地。確証は AC-ID / verify test に昇格。`junshi/oracles.md`。

## 関連リソース

| file | 用途 |
|---|---|
| `surface-archetypes.md` (同階層) | 6 軸 → spine profile マッピング、製品→surface 分解手順 |
| `domain-data-primitives.md` (同階層) | ロジック/DB/分離の生成 discipline (I1-I6 の落とし方) |
| `SKILL.md` Step 0/3 (同階層) | surface 分解 + TopContract 確立 + 強制問診 4 観点 |
| `executor.md` Wave gate (同階層) | gate G (機械対 M1-M12)、contract_conformance / boundary_lint |
| `test-strategy.md` (同階層) | AC ↔ verify profile (M8 の test layer 接続) |
| `autonomy.md` (同階層) | 圧縮人間ゲート (人間必須 6 対 H1-H6) |
| `design/README.md` (同階層配下) | UI 導出パイプライン (DerivationMap の kind:ui 行) |
| `data-access-protocol.md` (同階層) | M5/M6 の検査対象具体化 (DDP: 楽観既定・cache・connection-invalidation) |
| `backlog/acceptance.md` (同階層配下) | AC trace の reference instance |
| `junshi/oracles.md` (同階層配下) | 巡視が I/T/M をオラクル消費する接地仕様 (挙動/視覚発見) |
