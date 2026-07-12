# takumi の内部モード接続ガイド

`/takumi` 本体 (`SKILL.md`) から参照される補助ドキュメント。内部モード (test-strategy / design mode / verify 運用 / telemetry) の接続を記述する。これらはいずれも takumi の内部ロール / 内部モードであり、人間が直接叩く別コマンドは存在しない (対外コマンドは `/takumi` 1 つのみ、`natural-language.md` 参照)。

## contract-spine 連携 (頂点契約 → UI/API/AC 並列導出)

Step 0a/0c で surface 分解 + TopContract (ドメイン不変 I1-I6 + タスク契約 T1-T4) を確立し、UI/API/ロジック AC を**並列導出**する (`contract-spine.md`)。各 task に `surface_ref` / `top_contract_refs` / `domain_slice` を埋め、Wave gate G/H/I (ConsistencyMatrix 機械対 M1-M12 / contract_conformance / boundary_lint) で層間整合を機械強制。

- **業務ロジック/DB/分離の生成 discipline**: `domain-data-primitives.md` (不変条件 property seed 化 / 集約・tx 境界 / greenfield・brownfield / boundary 分類)
- **UI 派生**: `design/derivation-pipeline.md` (ObjectModel→ViewModel→AppFrame→primitive→style)
- **surface 分類**: `surface-archetypes.md` (6 軸 → spine profile)
- **後方互換**: 全 field optional。`ac_ids` のみの旧 plan は A-F gate だけで従来通り動く

## test-strategy 連携 (AC-ID → verify_profile_ref)

各 task の `verify_profile_ref` は takumi 内部の test-strategy ロジックで決定する (`test-strategy.md` に詳細)。task 生成時に以下の擬似呼出を行う:

```
for ac in task.ac_ids:
  result = test-strategy.select({
    ac_id, ac_text, ac_class?, context: {layer, risk, project_mode}
  })
  task.verify_profile_ref = result.verify_profile_ref
```

`ac_class` が明示されていれば archetype 直引き (A ルート)、未指定ならキーワード推論 (B)、曖昧なら 軍師 判定 (C) にフォールバック。詳細は `test-strategy.md`。

## design mode 連携 (ui/mixed のみ)

Step 0d の design mode で生成済みの design artifact (`.takumi/design/`) から `design_profile_ref` を task に埋める:

- screen が dashboard 系 → `design_profile_ref: dashboard-dense`
- screen が list + detail → `design_profile_ref: list-standard`
- screen が form 中心 → `design_profile_ref: form-heavy`
- screen が landing → `design_profile_ref: landing`

project 固有 profile を `.takumi/profiles/design/*.yaml` に追加している場合は、そちらを優先。

## verify 運用連携 (USS 原則)

各 task の test 生成は USS (Unified Spec Test) イディオムに従う。詳細は `verify/spec-tests.md`:

- 1 unit = 1 test file (`{module}.test.ts`)、`.pbt.test.ts` / `.mutation.test.ts` 等の分割は禁止
- `it('{Subject} は {input} に対して {output} を返すべき')` の body 内部で PBT / metamorphic / commands を選ぶ
- 命名規約は strict-refactoring Rule 14 を継承

executor は task 実装中、職人 (Sonnet Agent) にこの原則を遵守させる。違反を検出したら `gate_failed` emit。

## frontmatter 肥大化防止 (reference-first)

task frontmatter が 50+ 行になると破綻する。遵守ルール:

- task 行数の平均は **20 行以下** (ac_ids / verify_profile_ref / design_profile_ref / mutation_tier + 本文)
- profile 本体の上書きは `task.verify_profile_override: {...}` のような差分だけ
- **override 率 30% 超えたら defaults 再設計** (telemetry で監視)

## telemetry 連携 (儀式化 drift 検出)

task 作成時に `.takumi/telemetry/profile-usage.jsonl` に `task_created` event を emit:

```json
{
  "ts": "2025-01-01T12:00:00Z",
  "event": "task_created",
  "task_id": "T-042",
  "ac_ids": ["AC-AUTH-002"],
  "verify_profile_ref": "state-transition",
  "design_profile_ref": "dashboard-dense",
  "mutation_tier": "standard",
  "derivation_path": "A",
  "context": { "layer": "ui", "risk": "standard", "project_mode": "ui" }
}
```

詳細 schema は `telemetry-spec.md` と `telemetry-schema.md`。週次レポートで「profile 起因 gate failure 率 < 10% が 4 週」を検出したら儀式化 drift 警告。

## 採用前に決める閾値

| 閾値 | 推奨値 |
|------|--------|
| mutation_floor | task 65-70% / epic 80% |
| layout_strictness | L7 hard gate 5-7 項目、soft FP < 5% |
| auto_ref_site 更新 | 30-45 日 |
| design_drift 粒度 | screen × primary_action 単位 |
| loop min/max | min 15 分 / max 72 時間 |

## toishi 連携 (`SKILL.md` Step 0 末尾 + `toishi-integration.md`)

`project.yaml.requirements.source == toishi` 時のみ発動 (`local / never / unset` では全 no-op、`ToishiGate.shouldFetch(stage)` 中央化で構造的に silent 保証)。AC / design / plan の 3 つを **toishi snapshot 経由で連携** する:

- **AC ↔ toishi**: AC frontmatter の `toishi_acceptance_check_id` / `toishi_snapshot_id: snap-{rfc3339}` で `.takumi/agreements/toishi-snapshot-*.json` の `verifications.acceptance_criteria_checks[]` を参照。adapter 内 LLM-assisted で Given/When/Then に分解
- **design ↔ toishi**: `screenTransition + screenDetail` を design mode の screens 入力に流用 (design_profile_ref は推論可能ならそれを使う、`design/README.md` 連携)
- **plan ↔ toishi (G1.5 gate)**: Wave 1 着手前に snapshot の item-level `approval_state` を確認、`pending_approval / draft` → 自動 defer、`rejected` → human 必須 (`autonomy.md` G1.5 行)
- **snapshot 凍結**: Cycle 単位で immutable cache、PdM 編集による plan 不整合を防ぐ (詳細 `toishi-integration.md`)

`mode == never / local / unset` では本連携は全て no-op (silent 違反防止、backlog の `external` 契約と同原則)。

## backlog 連携 (`SKILL.md` Step 0e + `backlog-mode.md`)

`mode == enabled` 時、AC / plan / backlog の 3 つを **ID で双方向接続** する:

- **AC ↔ backlog**: BL frontmatter の `ac_refs: [AC-AUTH-002]` で `.takumi/specs/{feature}.md` を参照。AC 完了で関連 BL を自動 `done/` 候補に挙げる (`backlog/ai-move-sync.md` の補助 sync)
- **plan ↔ backlog**: task frontmatter の `bl_refs: [BL-007]` で BL を参照 (`plan-template.md` 参照)。Wave 完了で BL を `doing/` → `done/` move 候補に
- **probe/sweep ↔ backlog**: triage / 自己増殖発見の出力先を `OfferPolicy` 経由で `.takumi/backlog/open/` に昇格 (詳細: `backlog/migration.md` および `probe/triage.md` / `self-multiplying.md` / `sprint-mode.md` 末尾の "backlog 連携" 節)

`mode == external` / `unset` / `deferred` 期限内では本連携は全て no-op (silent 違反防止)。

## 関連リソース

| file | 用途 |
|---|---|
| `SKILL.md` (同階層) | 本体 (entry point、対外コマンドは /takumi のみ、Step 0e に backlog 中央化) |
| `natural-language.md` (同階層) | 発話 → 6 mode 振り分けの辞書 + "backlog 操作" 発話辞書 |
| `backlog-mode.md` (同階層) | 内蔵 backlog 仕様 (要約) + `backlog/*.md` 7 本への入口 |
| `test-strategy.md` (同階層) | AC-ID → verify_profile_ref 選定ロジック (takumi 内部) |
| `design/README.md` (同階層配下) | design mode 本体 (takumi 内部モード) |
| `telemetry-spec.md` (同階層) | 儀式化 drift 検知の telemetry spec |
| `verify/README.md` (同階層配下) | L1-L6 + recipe library |
| `verify/spec-tests.md` (同階層配下) | Unified Spec Test (USS) 原則、Rule 14 命名規約 |
| `verify-profiles-defaults/*.yaml` (同階層配下) | 5 archetype defaults |
| `design/profiles-defaults/*.yaml` (同階層配下) | 4 design profile defaults |
| `.takumi/profiles/{verify,design}/*.yaml` | project 側 profile 本体 |
| `.takumi/telemetry/profile-usage.jsonl` | event log (append-only、backlog event も含む) |
