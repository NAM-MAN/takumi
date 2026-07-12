---
source_rule_id: supervised-completion-loop
source_path: skills/takumi/dispatch/executor.md
source_hash: sha256:fae6374e94835e11a6574582031030090418e1d51746de683899026661cbfcfb
generated_at: 2026-07-02T04:49:37.716Z
compiler_version: 1.0.0
tier: 1
safety: irreversible
applies: loop == true
applicability_degraded: false
---
## scope
self-paced loop の起動・継続・終端

## shall
self-paced のみ使用・state.json 終端状態で ScheduleWakeup 判断

## not
固定間隔 /loop (gate 踏み潰し危険)

## applicability
loop == true

## evidence
false
