# T2 reviewers — 隔離レビュアー契約

> T2 = LLM 判断が要るが**専用 subagent が当該1ファイルを fresh full 読み**して verdict のみ親に返すことで
> 主文脈ゼロコスト・full fidelity を得る層。各 reviewer は `enforcement/reviewers/{rule}.md` の prompt。
> 設計: `../README.md` (enforcement-coverage)。registry の `mechanism: enforcement/reviewers/*.md`。

## なぜ subagent か (希釈の核)

棟梁 (orchestrator) は craft-layer.md (349行) 等を**自文脈に読まない**。代わりに reviewer subagent を
spawn し、その fresh 文脈に (a) 当該 rule-file 全文 + (b) 判定対象 diff だけを渡す。
→ enforcement fidelity が orchestrator 文脈長に**非依存**。これが「読まない JIT」でなく
「full 読みを隔離する JIT」= user 要求 (全ファイル徹底反映 かつ 希釈なし) の答え。

## reviewer の I/O 契約

**入力** (executor が組み立て、subagent prompt に埋込):
- `RULE_FILE`: 当該 rule-file の全文 (例 contract/contract-spine.md の H1-H6 節)
- `DIFF`: 判定対象の Wave diff (該当 surface に限定)
- `CONTEXT`: surface tag / AC-ID / risk (frontmatter 由来、最小)

**出力** (StructuredOutput、autonomy.md §3 adjudication と同形):
```json
{ "verdict": "pass | fix | escalate",
  "confidence": "high | medium | low",
  "rationale": "1-2 行",
  "violations": [{ "rule_anchor": "matrix-H2", "where": "file:line", "why": "..." }],
  "fix_instruction": "(verdict=fix のみ) 職人への repair 指示" }
```
棟梁は verdict で機械分岐 (pass→継続 / fix→職人 repair / escalate→human)。**rule-file は親文脈に残らない**。

## go-live ゲート (seeded)

reviewer は **seeded違反スイート** (`_seeded/{rule}.jsonl`) を pass して初めて registry で live
(未pass = unenforced = orphan 扱い)。seeded は **検出ロジックと共謀させない**
(注入は reviewer prompt と独立に著者)。各 case = `{kind: bad|clean, diff, must: catch|pass}`。
- 合格基準: 通常 reviewer seeded pass ≥ 既定、**safety reviewer seeded pass ≥0.95** (`registry.yaml#thresholds`)
- runner `scripts/check-reviewer-seeded.mjs` (subagent 起動) が pass 率を `enforcement-coverage.jsonl#reviewer_seeded` に記録

## quorum (揺れ対策)

| 対象 | reviewer 数 | 合格 | agreement (直近50) |
|---|---|---|---|
| 通常 | 2 | 2 一致 | — |
| **safety/高リスク** | 3 | 2 一致 (3of2) | ≥0.90 |
- agreement <0.85 → advisory 降格、<0.80 → human-only (`registry.yaml#thresholds`)
- **safety は T2 単独禁止** (`safety_policy.t2_solo_forbidden`): safety rule に T2 を当てる時も最終 floor は T1 or human

## go-live 前提条件の機械化

`scripts/check-reviewer-seeded.mjs` (T1) が「**live を主張する (evidence_required:true) T2 reviewer は両極性 (bad∧clean) seeded スイート + verdict 契約を持つ**」を deterministic に強制 (欠ければ exit 1 = orphan)。LLM pass 率は測れないので前提条件のみ。実 pass 率は takumi runtime (executor が reviewer subagent を各 seeded case に起動) が `enforcement-coverage.jsonl#reviewer_seeded` に記録。

## 一覧
| reviewer | rule | safety | 状態 |
|---|---|---|---|
| `oracle.md` | oracle-review-f (最終敵対レビュー) | none | **live (empirical 7/7)** — bad5→escalate / clean2→pass、pass率 1.00 ≥0.95 |
| `plan-contract.md` | plan-contract-misimpl-oracle | none | live (seeded 7/7、precondition gate 維持) |
| `contract-conformance.md` | contract-conformance-h | none | 予定 (provisional) |
| `craft.md` | craft-h1-h6 (H1-H6) | none (H 対は human-gated) | 予定 (provisional) |
| `ac-quality.md` | ac-quality-c (advisory) | none | 予定 (provisional) |
