---
source_rule_id: gate-before-advance
source_path: skills/takumi/dispatch/loop-invariant.md
source_hash: sha256:62fc968b4f8ed01ee04426d6d0c41432d391c72a0d7cfdd66d1ac5e31d9ea259
generated_at: 2026-07-02T04:49:37.716Z
compiler_version: 1.0.0
tier: 3
safety: none
applies: always
applicability_degraded: false
---
## scope
Wave境界の前進判断

## shall
発火gateを機械実行しverdict全passで前進

## not
gate未起動/fail/uncertainのまま前進

## applicability
always

## evidence
enforcement/registry.yaml
