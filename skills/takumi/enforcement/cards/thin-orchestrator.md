---
source_rule_id: thin-orchestrator
source_path: skills/takumi/dispatch/loop-invariant.md
source_hash: sha256:0dc426760038a19747562d4ff5ce067037150f2db222e8e9b4823d0ebc2c9119
generated_at: 2026-07-02T04:49:37.716Z
compiler_version: 1.0.0
tier: 3
safety: none
applies: always
applicability_degraded: false
---
## scope
orchestrator文脈

## shall
重い実装/テスト/調査/reviewerをsubagentに隔離し要約/verdictだけ戻す

## not
diff全文/testログ/rule本文を親に溜める

## applicability
always

## evidence
enforcement/README.md
