---
source_rule_id: loop-stop-predicate
source_path: skills/takumi/dispatch/executor.md
source_hash: sha256:8f6f3156cf9b5ee09cfe57c52f8e0459812e159e6b616c2134fce3231daaae2f
generated_at: 2026-07-09T07:35:36.697Z
compiler_version: 1.0.0
tier: 1
safety: irreversible
applies: loop == true
applicability_degraded: false
---
## scope
self-paced loop の継続/停止

## shall
state.json+plan の機械的事実で決める

## not
希釈散文判断で継続

## applicability
loop == true

## evidence
autonomy-decision.jsonl
