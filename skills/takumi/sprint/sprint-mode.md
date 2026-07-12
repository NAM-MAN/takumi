# Sprint Mode — 大規模 plan を Cycle 化する Continuous Loop

> [!NOTE]
> Continuous / Full Spec mode (`SKILL.md` Step 1) で起動。3 Cycle 以上に Plan を分割、各 Cycle が **Plan Phase → Sprint Phase → Discovery Phase** の 3-phase。
>
> 3-Lane Discovery (`3lane-discovery.md`) と verify-loop (`verify-loop/runtime.md`) と統合。

---

## 起動条件 (5-mode の正規判定、SKILL.md Step 1 から委譲)

### 5 mode 境界条件 (5 軸 AND/OR)

| mode | 時間 | AC 数 | 依存ファイル | リスク (invalidating drift 想定) | 未知度 | trigger 語 |
|---|---|---|---|---|---|---|
| **Quick** | ≤ 30 分 | 1 | 1-3 | 0 | 既知 pattern | typo / rename / 単 line |
| **Standard** | 30 分 - 6h | 2-5 | 4-10 | ≤ 1 | 既知 + 軽微未知 | feature 追加 / 1-module refactor |
| **Large** | 6h - 3 日 | 5-15 | 10-50 | ≤ 3 | 一部新規概念 | refactor 系 / 設計変更 |
| **Continuous** | 3-30 日 | 15-50 | 50+ | ≤ 5 | 既知 + 探索 | issue 100 件 / 棚卸し後の長期 |
| **Full Spec** | 1-4 週 | 50+ | 50+ | ≤ 5 (per Sprint) | 新規概念主 | "確実に" / "完全に" / "マイクロ管理で" |

### 判定 algorithm

```python
def select_mode(time_est_min, ac_count, dep_files, risk_count, novelty, trigger):
    # 1. trigger 語 最優先 (user 発話 override)
    if "確実に" in trigger or "完全に" in trigger or "マイクロ管理" in trigger:
        return "Full Spec"
    # 2. Formula 推奨 ≥ 100 wave (wave-formula.md 参照) も Full Spec へ
    if formula_recommended_wave_count() >= 100:
        return "Full Spec"
    # 3. 時間ベース粗振分け
    if time_est_min <= 30 and ac_count == 1 and dep_files <= 3:
        return "Quick"
    if time_est_min <= 360 and ac_count <= 5:
        return "Standard"
    if time_est_min <= 4320 and dep_files <= 50:  # 4320 分 = 3 日
        return "Large"
    # 4. 規模ベース昇格
    if dep_files >= 50 or ac_count >= 30 or has_sprint_structure(plan):
        return "Continuous"
    return "Full Spec"
```

### AND / OR ロジック

- **Quick 採用**: 5 軸 (時間 / AC / dep / risk / 未知度) **全て** Quick 列を満たす (1 つでも上ブレで Standard 以上に格上げ)
- **Full Spec 採用**: trigger 語発火 **OR** Formula ≥ 100 **OR** (AC 数 50+ AND 新規概念主)
- 他 mode (Standard / Large / Continuous): 5 軸中 **3 軸以上一致** で採用、矛盾時は **小規模側に倒す** (= 保守判定)

### 例外 (境界グレーゾーン)

| 例 | 判定 | 理由 |
|---|---|---|
| 3 file rename + smoke test (時間 20 分、AC 1、dep 3) | Quick | 5 軸全て Quick 列 |
| feature 追加 + UI 仕様検討 (時間 4h、AC 3、dep 7、UI あり) | Standard | UI ありだが Large の dep / 時間に満たない |
| 1-skill 整合性 review + 微改修 (時間 2 日、AC 8、dep 30) | Large | 3 軸 (時間/AC/dep) が Large |
| issue 100 件 triage + Sprint × 3 (時間 2 週、AC 40) | Continuous | 時間 / AC / 反復構造で 3 軸一致 |
| skill 再設計 + 5 機能新規 + "確実に" 発話 | Full Spec | trigger 語発火 |

判定不能や複数 mode が拮抗時は **小規模側に倒す** + plan 起草内で「規模拡大時の昇格 trigger」を 1 行明記。

### 各 mode への分岐

| mode | 主処理 |
|---|---|
| Quick / Standard | normal plan フロー (SKILL.md Step 2-4)、subagent spawn は Standard 以上 |
| Large | normal + Inter-Wave Sync (Sprint Phase 中盤の drift 検出を流用、本書 §「Inter-Wave Sync」参照) |
| Continuous / Full Spec | **本書を主軸** (Plan/Sprint/Discovery 3-phase Cycle)、Full Spec は Hidden checklist + Cross-Sync 必須 |

Wave 数算出 (各 mode で Wave 数下限を満たす plan を生成) は `wave-formula.md` を参照。

> [!IMPORTANT]
> 5-mode は「**plan 起草時の規模見積もり**」、本走中の規模変動 (= 想定外発見で Continuous → Full Spec へ昇格) は drift 3 分類 (本書 §「Inter-Wave Sync」) で扱う。本走中の mode 変更は **clarifying / scope-expanding drift** として軍師 review pass + plan 修正で許容、未承認 scope-expanding は禁止。

---

## 3-Phase Cycle 構造

```
┌─ Cycle N ─────────────────────────────────────┐
│  Plan Phase                                    │
│    ├─ input 選定 + AC-ID 起草                  │
│    ├─ verify_profile / design_profile 紐付け   │
│    ├─ Theme bundling                           │
│    ├─ S-PCR (軍師に暗黙仕様抽出要請)           │
│    ├─ 暗黙 AC → 明示 AC 昇格                   │
│    ├─ Wave 数算出 (各 task 4-5 phase 展開)     │
│    └─ Plan Phase freeze                        │
│         ↓                                      │
│  Sprint Phase (task × 4-5 phase)               │
│    ├─ Task: 詳細設計 → 実装 → unit test →      │
│    │      verify → integrate                   │
│    ├─ Inter-Wave Sync (中盤、drift 検出)       │
│    ├─ implicit AC 達成検証                     │
│    └─ Sprint Phase gate                        │
│         ↓                                      │
│  Discovery Phase                               │
│    ├─ discovered task 集約                     │
│    ├─ 3-Lane 分類 (P0/P1/P2、3lane-discovery)  │
│    ├─ P0/P1 → 次 Cycle Plan Phase 入力に整形   │
│    ├─ P2 → pool.md に隔離                      │
│    └─ Handoff.md atomic 書出                   │
└────────────────────────────────────────────────┘
        ↓ (P0/P1 が次 Cycle Plan Phase 入力に環流)
   Cycle N+1 ...
```

最重要: Discovery → 次 Cycle Plan Phase **環流**。発見は即対応せず S-PCR を通って完全計画化される。

---

## Plan Phase の詳細

### 入力選定

1. 残 backlog (priority queue from Cycle N-1 P1 lane)
2. P2 pool revive 候補 (`3lane-discovery.md` §revive)
3. 新規要件 (user 追加 / external trigger)

### S-PCR (Sprint-PCR、暗黙仕様抽出)

各 Cycle Plan Phase で **軍師に「user 企業が言語化していない暗黙仕様」5-10 件抽出**要請。

#### 5 採用条件 (全件 AND、gold-plating 防止)

| 条件 | 定義 |
|---|---|
| **user-visible** | 失敗時に user が観察可能 |
| **failure-observable** | log / metric / assertion で pinpoint 可 |
| **testable** | 30 分以内に test を書ける |
| **non-duplicate** | 既存 AC と semantic overlap < 70% |
| **within-scope** | Sprint Theme + task scope 内 |

不適合は `defer` (後 Cycle 候補) or `reject` (外す)。

#### funnel

```
extracted (軍師から)
  → accepted (5 条件 AND pass)
  → implemented (Sprint Phase 着手 + integrate 通過)
  → user-visible impact (test で再現可能と確認)
```

#### funnel csv schema (`sprint-X-s-pcr-funnel.csv`)

append-only csv で各 Cycle 個別記録 (S-PCR trend の retrospective 用):

```csv
phase,count,timestamp
extracted,6,2026-05-24T10:00:00Z
accepted,5,...
deferred,1,...
rejected,0,...
implemented,5,...
user_visible_impact,5,...
```

`accepted_ratio = accepted/extracted` (≥ 50% で healthy)、`impact_ratio = user_visible_impact/accepted` (= 100% で fully verified)。Cross-Sprint Sync で 3 Cycle 累積 trend を軍師 review。

#### S-PCR 軍師起動 prompt template (運用時に pilot dir に配置)

実 prompt file は **pilot 起動時に `<pilot-dir>/prompts/gunshi-s-pcr.md` として作成し W0 freeze 対象に含める** (本走中変更禁止、`freeze-audit.md` の judge prompt freeze と整合)。skill repo には骨格のみ収録、実 file は pilot 各々で生成。最小骨格:

```
Sprint N の Plan Phase で user 企業が言語化していない暗黙仕様を 5-10 件抽出。日本語、jsonl 出力。

# 入力: Sprint N input task (jsonl)、Sprint Theme (1 文)
{各 task の id / title / 明示 AC、Theme を投入}

# 6 観点 (各 1-2 件目安)
UX / edge (空・null・巨大・並行・重複) / error (validation/network/timeout/permission) /
a11y (keyboard/SR/contrast、UI 含時) / performance / security

# 採用 5 条件 AND (gold-plating 防止)
user-visible / failure-observable / testable (30 分以内) / non-duplicate (既存 AC overlap < 70%) / within-scope

# 出力 schema (jsonl、1 件 = 1 行)
{"implicit_id":"IMP-S{N}-{seq}", "source_task":"WRP-W{X}-T{Y}", "category":"UX|edge|error|a11y|perf|security",
 "summary":"<1 sent>", "user_visible_failure":"<1 sent>", "test_outline":"<given/when/then>",
 "scope_in_theme": bool}
```

prompt size 1.2-1.5KB (gunshi-invocation.md hardening v2 整合)。`source_task` で Sprint Phase verification trace と連動。

### 軍師 invocation budget

heavy invocation は 1 Cycle あたり 1-2 回が目安 (Plan Phase S-PCR + 必要時の Inter-Wave Sync)。4 箇所集中型 (W1 前 / W7 後 / W9 前 等) も可。

S-PCR は **棟梁 self-extract で代替可能** (軍師 budget 節約時)。後で Cross-Sprint Sync で軍師に「S-PCR 質 review」を 1 invocation で集約させ、抽出漏れを補正する。

---

## Sprint Phase の詳細

### 5-phase per task (rubric)

| phase | 内容 | acceptance | reviewer |
|---|---|---|---|
| **P1 詳細設計** | API signature / data flow / 失敗時挙動 | 設計 doc 1-2 段落 | 棟梁 self |
| **P2 実装** | code 書き下ろし | lint + compile pass | 棟梁 gate |
| **P3 unit test** | example-based + boundary | smoke 全 pass | 棟梁 gate |
| **P4 verify** | L1 PBT + L4 mutation (or advisory tier) | mutation score ≥ 基準 OR L1 PBT 100% | 棟梁 + 職人 |
| **P5 integrate** | gate check (lint/test/周辺整合) + 説明 | regression 0 + 説明文 | 棟梁 |

### 4-phase 縮約条件

**CRUD-like AND complexity_modifier ≤ 5** の task は P3 unit test + P4 verify を 1 Wave に bundle 可。`phase-trace.csv` に `bundle_p3_p4: true` flag で根拠を残す。

### Inter-Wave Sync (中盤 1 回)

Task 半数完了時点で軍師 (or 棟梁 self、軍師 budget 節約時) が drift 検出:

- **invalidating drift**: AC 削除 → 件数記録 + 軍師 review pass 必須
- **clarifying drift**: AC 詳細化 → 許容、軍師 review pass で OK
- **scope-expanding drift**: AC 追加 → **承認済のみ OK**、未承認は 0 必須

詳細 3 分類は taxonomy 参照 (本書 §taxonomy 統合 と integrations.md)。

### implicit AC verify

S-PCR で promoted した implicit AC は Sprint Phase 完了時に **全件達成** 確認 (= 100% pass)。fail 1 件で当該 Sprint は **GO-with-fix 候補** に降格 (= verdict 1 段下げ)。

trace schema:
```csv
implicit_id,promoted_ac_id,verification_phase,verification_artifact,evidence_type,pass_fail
```

`evidence_type` ∈ {assertion, pbt, mutation, user_explanation, inspection}。

---

## Discovery Phase の詳細

### discovered task 集約

各 task の P1-P5 中に発見されたものを `sprint-X-discovered.md` に集約。**自己解決禁止** (= 担当外の発見は自分で対応せず記録)、3-Lane 分類で次 Cycle へ。

### 3-Lane 分類

`3lane-discovery.md` の lane rule で P0/P1/P2 振分け。

### 環流

P0/P1 → `cycle-(N+1)-input-from-cycle-N-discovery.md` に整形、次 Cycle Plan Phase 入力に。
P2 → `pool.md` に append。

### Handoff.md atomic 書出

Sprint 完了直前に **1 ファイルで完結状態を atomic に書出**。次 session が **本ファイル単独で復元** できることが契約 (= 別 session simulation の支柱)。

Handoff schema (8 カテゴリ × 2-3 項目):

| Cat | 例 |
|---|---|
| **A. State** | 完了 task 数、未完了 backlog、verify 結果 |
| **B. Requirement** | 明示 AC、implicit AC、drift 3 分類 |
| **C. Pool** | P2 件数、revive 候補 |
| **D. Theme** | 当 Sprint Theme、累積 history |
| **E. S-PCR** | extracted/promoted、funnel |
| **F. Discovery → 次 Cycle** | 環流 task list、累計 discovered ratio |
| **G. Verify/Sync** | Inter-Wave Sync、mutation/PBT 集計 |
| **H. Artifact** | 作成 file list、削除/統合 Wave、軍師 invocation 履歴 |

---

## Hidden Checklist 採点 (Handoff 復元の客観 KPI)

Sprint 完了直前に棟梁が **20 項目 hidden checklist** を private dir に書出 (次 session 参照不可)。次 Sprint 開始時に新 session が Handoff.md だけで answer、棟梁が hidden と照合採点。

### 採点 4 段階 (atomic unit ごと)

| score | label | 定義 |
|---|---|---|
| 1.0 | **exact** | 全 atomic unit が完全一致 |
| 0.5 | **partial** | atomic unit の過半数 一致、数値誤差 ≤ 10% 許容 |
| 0 | **miss** | 情報なし正直 answer (誤答ではない) |
| -0.5 | **hallucinated** | 存在しない情報を捏造 |

### 合格条件

- 20 項目合計 ≥ **18.0** (= 90%) で当該 Sprint PASS
- `hallucinated` 1 件で **項目率関係なく FAIL** (= Handoff 改竄リスク)
- 3 Sprint 累積 (Cycle 1-3) で全 PASS 必須

### Hidden 設計時の注意

- atomic unit を identify (例: A1 = (a) 完了件数 (b) AC-ID list の 2 atomic)
- 次 session が答えられる粒度に分解 (= Handoff.md に書かれた情報のみで対応可能)
- artifact 名 / 件数 / ratio を中心に、subjective な judgment は避ける

---

## Cross-Sprint Sync (3 Sprint 累積 review)

通常 3 Cycle (W7 相当) で軍師 1 invocation で実施。drift を 4 type に分類:

| type | 例 |
|---|---|
| **仕様差分** | Sprint 1 と Sprint 2 で同じ AC の解釈が違う |
| **実装差分** | 同 AC を別 API / data flow で実装 |
| **優先度差分** | Cycle 間で task 順位が再評価 |
| **状態差分** | Sprint 1 完了済 task が後 Sprint で deferred 表記 |

drift ≥ 2 件検出が Continuous mode の健全性確認指標。resolved_ratio (resolved / total) ≥ 80% が望ましい。

---

## 統合ファイル

| 連携先 | 用途 |
|---|---|
| `3lane-discovery.md` | Discovery Phase の lane 分類 |
| `verify-loop/runtime.md` | P4 verify phase の mutation/PBT 運用 |
| `design/README.md` | UI 含む task の design_profile_ref 紐付け |
| `executor.md` + `routing-mode.md` | 各 task の職人 dispatch |
| `gunshi-invocation.md` | S-PCR / Inter-Wave Sync / Cross-Sync の codex 起動手順 |

---

## 未検証領域と再確認

本書の 3-phase Cycle / S-PCR / Hidden checklist / Cross-Sync が未検証の領域 (別 pilot 必須): UI/design profile 連携 / 長期運用 (30 日超の Cycle) / 多人数運用 (Hidden checklist の per-user 一貫性) / 外部 repo・別 project。

本書を新規 project で採用する際は、最小 1 Cycle の試行で hidden checklist 採点を取得して妥当性確認。

### 外部 drift 監査 runbook

pilot 中に skill repo が並行編集される (user / 別 session) ケースの検出: (1) W0 freeze + 各 Wave 開始時に `find skills/takumi -type f \( -name "*.md" -o -name "*.yaml" \) | sort | xargs sha256sum > snap-wN.sha256` で snapshot 取得 + 前 baseline と `diff`、(2) drift 検出時は本 session の Bash/Edit/Write 履歴を `grep skills/takumi/` で検証 → 履歴なしは external (caveat 記録、続行)、あれば真の skill 逆流 (当該 wave invalid + 中止候補)、(3) event は `<pilot-dir>/skill-drift-detected.md` に append、external 確認後 baseline 更新。軍師戦略 #7 micro-review (20-30 分) で resolve 可、解消不能なら Full RETREAT。

---

## 軍師 invocation budget (4 箇所集中型)

Cycle 開始前 (戦略確認) / 3 Cycle 完了後 (Cross-Sync drift 4 type) / 最終 verdict 前 (過剰汎化 check) / 緊急時 (drift overflow / 中止条件) = 4 箇所。S-PCR は棟梁 self-extract で代替可、Cross-Sync で集約 review。詳細手順は `gunshi-invocation.md`。

## backlog 連携

Sprint Wave で `bl_refs:` 埋め込み時に `OfferPolicy.shouldOffer('sprint_bl_refs')` 経由 (`SKILL.md` Step 0e)。`mode == enabled` なら S-PCR 経由で discovered → `.takumi/backlog/open/` に昇格、他 mode は従来通り plan TODO 追記。詳細: `backlog-mode.md` + `backlog/offer-policy.md`。
