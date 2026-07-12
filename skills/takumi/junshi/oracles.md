# 巡視の 4 オラクル + 摩擦ログ — 接地・検出対象・gate 可否・昇格先

`runtime.md` ③照合 が読む詳細仕様。各オラクルは「正しさの源」を **TopContract (`../contract/contract-spine.md` の I1-I6/T1-T4 + ConsistencyMatrix M1-M12)** に接地し、発見を「派生仕様への違反」として表現する。接地できない発見は ④反証 で棄却する。

> [!IMPORTANT]
> 仕様・差分・変換不変の 3 つは **客観オラクル** = pilot GO 後に gate 化候補。趣きは **主観 = advisory・never-block** (`../design/taste-oracle.md` 方針を恒久継承)。raw taste を gate にしない。

---

## 1. 仕様オラクル (spec) — AC ← I/T 派生

### 接地
観測した状態/出力を、その surface の AC (TopContract から派生、`derived_from: [I.., T..]`) と突合する。AC が無い観測は「orphan な現実」= 仕様の幽霊 or 未文書化要件として摩擦ログ寄りに回す。

### 検出対象 (証拠付き、I/T 別)

| 由来 | 検出する違反 |
|---|---|
| I3 (状態不変) | ある状態で常に真であるべき述語が UI/挙動で破れている (例: `Confirmed` なのに顧客欄が空で表示) |
| I4 (遷移合法性) | 未定義遷移が UI 操作で発生 (禁止ボタンが押せる、不正な順序で進める) |
| I5 (権限境界) | 権限の無い操作の affordance が見える/押せる (authz の UI 漏れ) |
| I6 (volatility/可逆性) | mutation 後に list/detail が腐る、楽観更新の失敗時 UX 欠落 (DDP、`../contract/data-access-protocol.md`) |
| T1 (観測可能成果) | journey 完了後に約束した成果が観測できない |
| T3 (失敗・例外業務) | 例外フローでエラー/空画面が約束と違う (H3 の挙動版) |

### gate 可否 / 昇格先
- **gate 化候補** (pilot GO 後): I3/I4/I5 違反は決定的に判定できれば G (contract gate) に寄せる
- **昇格先**: 確証 → 新 **AC-{surface}-{seq}** を `.takumi/specs/{surface}.md` に追加 (`graduation.md`)。AC は DerivationMap に `derived_from` 付きで載り orphan 検出 (M9) の対象になる

---

## 2. 差分オラクル (differential) — 前 run / 姉妹 surface

### 接地
**維持するベースラインを持たない**。今回 run の **比較用 signature** (正規化 DOM 要約 / 状態ハッシュ / journey outcome、`runtime.md` ②) を「直前 run の signature」または「同 archetype の姉妹 surface の signature」と比較し、**AC で説明できない変化**を炙る。**raw screenshot は比較に使わない** (pixel diff の semantic ceiling を踏まない)。signature は run-scoped で回帰ベースラインにしない (確証は L3 test に昇格)。verify L3 differential (`../verify/differential.md`) の発見版。

### 検出対象
- 前 run では成立していた journey が今回 stall/失敗 (回帰)
- 同じ操作の結果が前回と構造的に変化 (件数/順序/可視 field) し、対応する AC 変更が無い
- 姉妹 surface (例: 別の list 画面) と振る舞いが不整合 (一貫性発見、M5/M11 の挙動版)

### gate 可否 / 昇格先
- **gate 化候補**: 「AC 変更を伴わない振る舞い変化」は決定的。changed surface のみ
- **昇格先**: 確証 → verify **L3 in-repo 2-export** か snapshot 不変条件の `it()` (USS、`../verify/spec-tests.md`)。維持は spec 由来の少数 invariant のみ

---

## 3. 変換不変オラクル (metamorphic) — 変換不変条件

### 接地
正解を直接書けない領域でも成り立つ**関係性**で守る (verify L1 metamorphic、`../verify/property-based.md`)。TopContract の I4 (遷移) / I6 (可逆性) / T4 (補正) から関係を導出する。

### 検出対象 (代表 metamorphic 関係)

| 関係 | 例 | 由来 |
|---|---|---|
| 可逆性 | 戻る→進む で元状態に戻る / undo→redo 不変 | I6 / T4 |
| 経路独立 | 同じ成果を 2 つの導線で達成 → 同じ最終状態 | T1 / H5 |
| 並べ替え不変 | filter/sort の順序を変えても結果集合は同じ | I6 |
| 冪等 | 同じ mutation を 2 回 → 1 回と同じ (二重送信耐性) | I4 |

### gate 可否 / 昇格先
- **gate 化候補**: 関係が deterministic に test 化できれば
- **昇格先**: 確証 → verify **L1 metamorphic** の `it('{Subject} は {変換} に対して {関係} を保つべき')` を既存 test file に追加 (新 `.metamorphic.test.ts` を作らない、USS)

---

## 4. 趣きオラクル (taste) — advisory・never-block

### 接地
`../design/taste-oracle.md` の **ArtCoT 3-stage** (Analyzer 観測 → Critic named-principle 判定 → Summarizer {pass/warn/fail}) をそのまま使う。絶対 0-3 スコアにしない。**changed surface のみ**走らせる。

### 検出対象 (gate にしてよい候補 / してはいけない)
- **指摘してよい**: 階層欠落 / CTA 埋没 / 余白リズム破綻 / 型スケール逆転 / 色数過剰 / shadow・border の濁り / 日本語の行長・行高 / overlap / truncation / contrast / 空・loading・error 状態の抜け
- **指摘しても gate にしない**: 総合 taste / 「プロっぽさ」/ 「AI っぽさ」/ ブランド適合 / 装飾の好み

### gate 可否 / 昇格先
- **never-block** (恒久 advisory)。残違反は PR description / 摩擦ログに記録
- **昇格先**: 頻出 defect (4 週で同 axis fail 10%+) は `../design/taste-oracle.md` の E→D promotion で決定論 preflight rule 化を検討 (gate 化はしない)

> [!WARNING]
> 趣きオラクルの自動修正ループは **1 round まで** (taste-oracle 方針)。過剰 iteration 禁止。design Phase 6.5 self-review (`../design/phases-4-6.md`) と役割が重なる場合は **Phase 6.5 を優先** (実装者自己監査が先、巡視は外部発見として補完)。重複指摘は dedup。

---

## 摩擦ログ (friction) — ユーザーニーズの発見

「不具合」ではないが**使いにくい** = 潜在ニーズ。②走行中に別系統で記録する。

### 摩擦シグナル

| シグナル | 説明 |
|---|---|
| 手数超過 | 期待手数 (T1 から推定) を超えるクリック/画面遷移で成果に到達 |
| 行き止まり | journey が完了不能、または明確な次アクションが無い |
| 推測強要 | ラベル/コピー不足で次操作を推測させる (H4 語彙の挙動版) |
| フィードバック欠如 | 操作後に成功/失敗の可視 feedback が無い |
| アフォーダンス欠如 | 操作可能だが操作可能に見えない/発見しにくい |

### 扱い
- `discovered-{id}.md` の `oracle_type: friction` / カテゴリ `Friction/Need` に流す
- **起票時 confidence を低めに** (人間/PM 判断を要する印)。バグ stream と混ぜない
- 昇格先は基本 `none` (= backlog の UX/Missing 候補)。AC 化は人間が要件と認めたときのみ

> 摩擦は「仕様違反」ではないので spec オラクルに乗らない。だが T1 (観測可能成果) と H5 (導線) を**参照点**にして「理想手数 vs 実手数」を測ることで、vibe でなく定量に寄せる。

---

## ④反証 (Devil's Advocate) — 全オラクル共通

候補は `../probe/triage.md` Step 4 の反論者 (軍師) を通す。生存 = 再現可 ∧ 接地 ∧ 既知でない。詳細は `runtime.md` ④。**反証は oracle_type 別の precision に効く** (⑥校正)。

---

## ⑥校正での oracle 別重み

`discovery-calibration.jsonl` に oracle_type 別で confirmed/rejected を記録 (`graduation.md`)。

- precision = confirmed / (confirmed + rejected)、oracle_type ごとに算出
- **precision < 30%** の oracle はその surface で **advisory 降格 or throttle** (出力を棟梁が低重み扱い)
- **precision ≥ 80%** の oracle は journey 数/レンズを増やす
- 趣き/摩擦は元々 advisory なので gate 昇格の対象外、precision は重み調整のみに使う

---

## 関連リソース

| file | 用途 |
|---|---|
| `runtime.md` (同) | ①-⑥ エンジン、③がここを読む |
| `graduation.md` (同) | 確証 → AC-ID / verify L1/L3、校正 ledger schema |
| `../contract/contract-spine.md` | I1-I6/T1-T4 + M1-M12/H1-H6 (接地源) |
| `../contract/data-access-protocol.md` | I6 由来の DDP 検査 (仕様オラクルの mutation 系) |
| `../verify/property-based.md` | 変換不変オラクルの昇格先 (L1 metamorphic) |
| `../verify/differential.md` | 差分オラクルの昇格先 (L3 in-repo 2-export) |
| `../design/taste-oracle.md` | 趣きオラクル本体 (ArtCoT、advisory) |
| `../probe/triage.md` | ④反証 (反論者) の手順 |
