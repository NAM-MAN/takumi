---
generated_at: 2026-07-02T00:00:00Z
compiler_version: 1.0.0
source_files: [scripts/__fixtures__/rule-compiler/golden/source.md]
budget_lines: 20
rule_count: 2
kernel_rules_excluded: []
truncated_rules: []
---
- `stop-points-only` (T3): shall golden shall A / not golden not A [applies: always]
- `final-verification-step` (T1): shall golden shall B / not golden not B [applies: task.surface_ref != null]
