# Wave Formula — plan の wave 数を機械算出する補助 (executor / sprint-mode 内部参照)

> [!NOTE]
> **plan の Wave 数を「規模 × 機能数 × 複雑度」から機械算出**する補助式。`SKILL.md` Step 1 で mode 判定後、Continuous / Full Spec mode の plan 起草時に呼出。Quick / Standard / Large は formula を厳格適用せず、本書を**参考値**として使う。

---

## 1. 計算式

```
Wave_total = Wave_setup + Σ(Wave_per_feature_i) + Wave_cross_cutting + Wave_sync + Wave_final
```

各項:

| 変数 | 値 |
|---|---|
| `Wave_setup` | 5-10 (PCR / RED / freeze の重さで決定、Full Spec pilot は 15-25 に override 可) |
| `Wave_per_feature` | `base + complexity_modifier` (下表) |
| `Wave_cross_cutting` | `max(0, N_features / 5)` (5 機能毎に 1 Sync wave) |
| `Wave_sync` | `max(3, N_features / 10)` (全体 Sync の数) |
| `Wave_final` | 3-5 (verdict / retro / 反映分岐) |

### `base_per_feature` (lookup、変更禁止)

| 機能種別 | base |
|---|---|
| CRUD-like (明確機能、既存 pattern) | 4 |
| state management あり | 5 |
| 協調機能 (複数 module 跨ぎ) | 7 |
| **Continuous / pilot 形式** (Sprint × N 構造) | **10** (= base 7 + Continuous 補正 +3、本書 §4 参照) |
| 新概念導入 (takumi に類似なし) | 15 |

### `complexity_modifier` (加算規則、変更禁止)

```
modifier = 0
if 既存 module 改修なし (新規):       modifier += 2
if N_AC >= 3:                          modifier += 3
if requires_gunshi_review:             modifier += 2
if has_UI:                             modifier += 3
if has_new_concept:                    modifier += 5
if has_migration:                      modifier += 2
```

---

## 2. 入力変数

| 変数 | 取得方法 | 範囲 |
|---|---|---|
| `N_features` | plan の主機能数 (1 機能 = 1 主目的、設定追加や typo は数えない) | 整数 |
| `N_AC` | 各機能の AC-ID 数 | 整数 |
| `has_UI` | UI 含むか (design_profile_ref 必要) | bool |
| `has_new_concept` | takumi に類似 skill / 機能なし | bool |
| `has_migration` | backward compat 必要 | bool |
| `requires_gunshi_review` | security / data integrity / 設計変更 含む | bool |

---

## 3. 評価指標

| 指標 | 計算 | 用途 |
|---|---|---|
| **MAPE** | `mean(|predicted - actual| / actual)` | 主指標、推奨閾値 ≤ 25% (forward 検証時 critical) |
| **within-20% rate** | `count(error <= 0.20) / N` | 補助、≥ 75% で安定 |

外れ値 (誤差 ≥ 50%) は記録するが除外しない (= 全件で MAPE 計算)。

---

## 4. Continuous mode `+3` 補正の根拠

Formula が pilot 形式 (Sprint × N 構造) の plan を `base 7 (協調機能)` で扱うと、Sprint × N 構造の過小評価 (S1 spec error) で wave 数が 30% 程度低く出る。

対処:
- **Continuous / pilot 形式の `base` を 7 → 10 (+3) に補正** (本書 §1 lookup table 反映済)

`+3` の発火条件:
- plan が Sprint × N 構造を持つ (sprint-mode.md 適用)、OR
- plan 種別が "pilot / iteration / cycle / Sprint" を含む

---

## 5. 自己適用手順 (Full Spec plan 起草時)

Full Spec mode を採用する plan は **自身に Formula を適用して Wave 数下限を確認**:

1. plan の `N_features`, `N_AC`, `has_*` を抽出
2. 各 `Wave_per_feature_i = base + modifier_i` を計算
3. `Wave_total = setup + Σ + cross + sync + final` を算出
4. plan の実際の sub-wave 数 (= `grep -cE "^\s*- \[[ x]\]" plan.md`) と比較
5. 誤差 (= `|recommended - actual| / actual`) を記録
6. 推奨 Wave 数 ≥ 100 で Full Spec mode の必要条件成立 (本書 §1 表 と整合)

---

## 6. retro / forward / 自己適用 の役割

| set | 役割 | 採否寄与 |
|---|---|---|
| **retro 過去 plan** | Formula の **calibration / 重み調整** | observation のみ、採否寄与なし (overfit 排除) |
| **forward 新規 task** | Formula の **検証** (未使用 sample) | critical gate (MAPE ≤ 25%) |
| **自己適用 (Full Spec plan)** | **自己整合性** (推奨 ≥ 200 + 誤差 ≤ 20%) | sufficient gate |

---

## 7. S1-S5 Error Attribution (検証由来の追跡)

forward / retro の誤差を 5 source に分解、Formula 改修判断に使用:

| source | 定義 |
|---|---|
| **S1 spec error** | spec 自体の重み / lookup table が誤り (= 全 plan で同方向 bias) |
| **S2 input classification** | base_per_feature / modifier の入力分類誤り (= 再分類で誤差消失) |
| **S3 prior estimation noise** | 適正値見積もりの個人差 noise |
| **S4 size variability** | 同規模 plan でも著者 / 文脈で ±20% 揺れる固有変動 |
| **S5 structural mismatch** | Formula で表現不能な構造的特徴 (= 個別分析で要因抽出) |

S1 が contribution 30% 以上 → spec 改修 trigger (例: 本書 §4 Continuous `+3` 補正)。S2/S3/S4 は通常運用 noise として許容。S5 は次 pilot で要追跡。

---

## 8. retro caveat (汎用保証なし)

本 Formula は予測式であり汎用保証ではない。未検証領域:
- UI / design profile を含む plan
- 長期 (30 日超) plan
- 別 repo / 別 project

新規 project で初採用する際は forward MAPE を再測定して妥当性確認。詳細 caveat は `3lane-discovery.md` §「未検証領域と再確認」 + `sprint-mode.md` §「未検証領域と再確認」参照。

---

## 9. 呼出 site (どこから参照されるか)

- `SKILL.md` Step 1: 5-mode 判定の Full Spec trigger (Formula 推奨 ≥ 100 wave)
- `sprint-mode.md` §「起動条件」: 5-mode algorithm 内の Formula trigger 参照
- `plan-template.md`: Full Spec plan 起草時の自己適用 step
- pilot 計画書 (`.takumi/pilots/*/`): retro / forward / self-apply の検証手順

呼出は **読み手 (棟梁 / 軍師 / 職人) の判断に使う**、自動化 script は不要 (= 人間が 1 plan に 1 度算出すれば足る)。
