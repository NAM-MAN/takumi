# 3-Lane Discovery — 自己増殖で発見された task を P0/P1/P2 で分離する補助モード

> [!NOTE]
> 本書は `self-multiplying.md` の **発見 task 分類の補助レイヤ**。self-multiplying は単一 backlog で発見を扱うが、3-Lane Discovery は発見を緊急度 / scope で **3 lane に分離**し、Main context の Wave 内 task 数を抑制する。Sprint mode (`sprint-mode.md`) 内では 3-Lane が default。

---

## いつ使うか

- 自己増殖型 plan で **発見が多発** する (1 Wave で 4+ 件想定)
- Sprint mode (`sprint-mode.md`) の Discovery Phase
- probe / sweep mode の Wave 内 task 数が肥大化 (中央値 8+ 件)

Quick / Standard mode (`SKILL.md` Step 1) では発見数が少なく、単一 backlog (= self-multiplying default) で十分。Large / Continuous / Full Spec では 3-Lane を推奨。

---

## 3 Lane 定義

| lane | 配置 | 処理タイミング | 例 |
|---|---|---|---|
| **P0** | 現 Wave 内割込 (Main context に即追加) | 即対応 (Wave 完了まで) | critical bug、build 破壊、scope 内致命的欠落 |
| **P1** | 次 Wave 投入候補 (Main context に追加だが priority queue) | 次 Wave 開始時 | high severity、関連 task |
| **P2** | `pool.md` (別ファイル) に隔離 | 後 Cycle revive 候補 | medium/low、scope 外、関連薄い |

P2 は **Main context に追加しない** ことで Wave 内 task 数の中央値を抑える。

---

## Lane Assignment Rule

各発見 task に対し:

| 条件 | lane |
|---|---|
| `severity == "critical"` AND `scope.relation == "same-task"` | **P0** |
| `severity in ["critical", "high"]` AND `scope.relation != "same-task"` | **P1** |
| `severity == "high"` AND `scope.relation == "same-task"` | **P1** (= critical 限定で P0) |
| `severity in ["medium", "low"]` OR `original_lane == "deferred"` | **P2** |

### `scope.relation` の値

| 値 | 意味 |
|---|---|
| `same-task` | 現 Wave で対応中の task と同じ scope |
| `sibling-task` | 同じ機能 / module 内の別 task |
| `downstream-task` | 同 Wave 後段の task で発生 |
| `cross-feature` | 別機能を跨ぐ |
| `global` | scope 不明 / 影響範囲広 (保守的に P2 / P1) |

### 保守的方針 (P0 false negative ≤ P0 false positive)

「critical & same-task のみ P0」とすることで:
- P0 false positive 低 (= 真の P0 のみ即対応、無駄な割込みなし)
- P0 false negative 低 (= 取りこぼしリスクを P1 で吸収)
- 結果: Main context の中央値削減と P0 取りこぼしゼロを両立

---

## frozen-pool spec (input 同一性保証)

3-Lane を arm 比較 / 再現実験 で使う場合は **frozen pool** で入力固定。

### `frozen-pool.jsonl` schema

```json
{
  "entry_id": "POOL-001",
  "source_sprint": "2026-04-15",
  "observation_tag": "security",
  "file_line": ["src/auth/login.ts:42"],
  "summary": "login endpoint lacks rate limiting",
  "severity": "critical | high | medium | low",
  "scope": {
    "relation": "same-task | sibling-task | downstream-task | cross-feature | global",
    "affects_module": ["auth"],
    "blocks_ac": ["AC-XXX"]
  },
  "original_lane": null
}
```

### `scope.relation` 自動推論 rule (extract-pool 時)

| 入力条件 | 推論 `scope.relation` |
|---|---|
| `file_line[]` が 1 module 内 + 既存 task が当該 module を含む | `same-task` |
| `file_line[]` が 1 module 内 + 既存 task に該当なし | `sibling-task` |
| `file_line[]` が 2 module 跨ぐ | `cross-feature` |
| `file_line[]` 空 / 推論不能 | `global` (保守的に高 scope) |

推論不能 entry は `scope_unresolved.jsonl` に分離、棟梁 + 軍師 2 段 review で確定。

### Seed 固定 (再現性確保)

3 set 抽出等の sampling は seed 固定:

```python
import random
random.seed(20260524)  # 日付ベース等で固定
sample = random.sample(pool, min(10, len(pool)))
```

`seed-record.txt` に記録。

---

## Pool 運用 (P2 隔離 + revive + GC)

### revive simulation (次 Cycle 開始時)

P2 pool の entry を「**新文脈** (= 累積 knowledge を背景に)」で再評価:

1. pool.md を全件統合
2. 軍師に「現状の累積 knowledge で pool entry を再評価、P0/P1 昇格すべき item」要請
3. 昇格判定された件数 = `pool_revive_count`

### Pool GC (7 日経過 cleanup)

`P2 pool entry の滞留日数 ≥ 7 日`の項目に対し:

- 軍師 false negative review: 「P0/P1 にすべきだったが見落とした」item 検出
- false negative ≤ 1 件 で **隔離による損失なし** と判定
- 7 日 + fn miss ≤ 1 が長期 pool 運用の健全性指標

期間は project / pilot 期間に応じて 3 日 / 7 日 / 30 日 を調整 (短期 pilot は 3-7 日推奨)。

---

## self-multiplying.md との関係

| 観点 | self-multiplying (default) | 3-Lane Discovery (本書) |
|---|---|---|
| 発見 backlog | 単一 list、Wave に順次投入 | P0/P1/P2 分離、P2 は別ファイル |
| Main context 内 task 数中央値 | 線形に増加 | **約半減** (P2 隔離) |
| 復活機会 | なし (deferred は再 sweep 待ち) | revive simulation で復活 path 明示 |
| 適用規模 | Quick / Standard (発見 ≤ 3 件 / Wave) | Large / Continuous / Full Spec |

self-multiplying を 3-Lane に切替える場合は plan 起草時に明示、両者の混在は禁止。

---

## 「探索 task 分離」 (検証データの honest reporting)

> [!CAUTION]
> 3-Lane は **discovered_ratio (= discovered / sprint_input)** の評価で注意が必要。
>
> **self-application** (= plan 自身を Sprint task に充当) では exploration 副作用で discovered ratio が通常運用より高く出る (通常閾値 25% を超過しうる)。
>
> このため:
>
> - **plan に "探索 task" flag を立て**、discovered_ratio 評価対象から **分離して集計**
> - 評価は `discovered_ratio = discovered / non_exploration_input` で計算
> - exploration task 数 / 通常 task 数を `sprint-X-task-classification.csv` に明示

通常 product 開発で 3-Lane を使う際は、探索系 task (= 仕様明確でない / exploration phase) を fix-task と分離して ratio を測定する。

---

## 統合の最小契約

3-Lane を採用する plan は以下を満たす:

1. `frozen-pool.jsonl` が plan 起草時に確定 (W0 freeze 対象)
2. `seed-record.txt` (再現性) を記録
3. lane assignment rule を **本書の table** から逸脱しない
4. P0 false positive を `kpi.csv#p0_fp_rate` で測定 (閾値 ≤ 30% 推奨)
5. Main context median task per wave を arm A (= self-multiplying) との比較で記録 (B/A 比目標 ≤ 50%)
6. Pool revive simulation を 各 Cycle 開始時に実施
7. 7 日 GC で false negative review 実施

---

## 未検証領域と再確認

本書の `lane assignment rule` と `frozen-pool` 仕様が未検証の領域:

- UI 含む project (design_profile_ref 紐付け)
- 長期運用 (30 日超の pool GC)
- 多人数運用 (lane 判定の per-user 一貫性)
- 外部 repo / 別 project

これらは別 pilot 必須。本書を新規 project で初採用する際は、最小 1 cycle の比較実行で P0 FP / Main median を再確認。
