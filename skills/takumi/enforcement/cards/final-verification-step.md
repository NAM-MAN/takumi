---
source_rule_id: final-verification-step
source_path: skills/takumi/dispatch/executor.md
source_hash: sha256:15b0357437f8b9fc165f509896bb90f7fe072e8b0bb3baeb13438cdd79d1f15f
generated_at: 2026-07-09T07:35:36.697Z
compiler_version: 1.0.0
tier: 1
safety: none
applies: task.surface_ref != null
applicability_degraded: false
---
## scope
全 Wave 完了後の最終 gate

## shall
F0 orphan-zero + AC-coverage + F1-F4 を全て通過

## not
最終検証スキップ

## applicability
task.surface_ref != null

## evidence
true
