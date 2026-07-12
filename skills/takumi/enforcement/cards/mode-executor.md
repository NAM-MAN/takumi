---
generated_at: 2026-07-02T04:49:37.716Z
compiler_version: 1.0.0
source_files: [skills/takumi/dispatch/executor.md, skills/takumi/dispatch/loop-invariant.md]
budget_lines: 20
rule_count: 14
kernel_rules_excluded: [stop-points-only, gate-before-advance, thin-orchestrator, decision-dossier-required]
truncated_rules: []
---
- `codegen-exception-rule` (T2): shall 3 cell (python_migration/refactor/realistic_debug_repair) のみ直接 code-gen / not 他 category で棟梁が code-gen する [applies: always]
- `opus-delegation-policy` (T3): shall 自己完結可能作業は spawn しない・条件外 spawn 禁止 / not 条件外 subagent spawn [applies: always]
- `three-mode-routing` (T3): shall manual_override→mode_select→cell mapping の resolver order を守る / not routing を ad hoc に変更 [applies: always]
- `two-layer-supply` (T1): shall kernel 4条 + active mode card 1枚 (cards/mode-*.md、≤20行) + task slice + applicability match した mode prose 全文 ≤2本 を渡す / not 思想 file を 3 本以上・match しない prose・rule 本文の親文脈への転記 [applies: always]
- `plan-contract-misimpl-oracle` (T2): shall state machine 通りに block 判定・delegation は inline scoped / not T1 単独 block・親会話前提で dispatch [applies: plan.tasks != null]
- `wave-gate-pipeline` (T1): shall A-J 全フェーズを順に通過しなければ task 完了にしない / not gate をスキップ・省略 [applies: always]
- `wave-handoff-artifact` (T1): shall notepads/{name}/handoff-w{N}.md に ≤30行 (決定/発見/逸脱/未消化リスク の 4 見出し) で書き、次 Wave の dispatch prompt に本文添付 / not handoff 無しで次 Wave dispatch・30行超過・会話記憶だけで引き継ぐ [applies: always]
- `auto-continue-stop-contract` (T3): shall 3 停止点 (G1/G3・human floor/G6) 以外で止まらず次 Wave へ無人継続 / not 「続けますか?」質問 [applies: autonomy.level != manual]
- `per-wave-junshi-gate` (T2): shall harness+containment+spec 揃い+behavioral surface 時のみ起動 / not 欠落時に junshi を発火・修正を ungated 適用 [applies: surface.behavioral == true]
- `final-verification-step` (T1): shall F0 orphan-zero + AC-coverage + F1-F4 を全て通過 / not 最終検証スキップ [applies: task.surface_ref != null]
- `supervised-completion-loop` (T1 safety:irreversible): shall self-paced のみ使用・state.json 終端状態で ScheduleWakeup 判断 / not 固定間隔 /loop (gate 踏み潰し危険) [applies: loop == true]
- `loop-stop-predicate` (T1 safety:irreversible): shall state.json+plan の機械的事実で決める / not 希釈散文判断で継続 [applies: loop == true]
- `context-protection-pause` (T3): shall 残量 20% 以下で一時停止・resume.md 生成・ユーザー通知 / not 20% 突破して継続 [applies: always]
- `parent-checkpoint-respawn` (T3): shall 5 Wave ごとに plan + state.json + 直近 handoff + active card から状況を再構成し「現在地 5 行要約」を書き直す (context 20% 到達なら G6 で respawn) / not 10 Wave 超を要約更新なしで走る・実行を剥がした親の判断を古い会話記憶に依拠させる [applies: autonomy.level != manual]
