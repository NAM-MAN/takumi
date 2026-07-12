---
source_rule_id: auto-continue-stop-contract
source_path: skills/takumi/dispatch/executor.md
source_hash: sha256:c6ba331e4da05809d3391f13d1d120837446f848e11cd3508c3ed2553c7ea8ac
generated_at: 2026-07-02T04:49:37.716Z
compiler_version: 1.0.0
tier: 3
safety: none
applies: autonomy.level != manual
applicability_degraded: false
---
## scope
Wave 完了後の継続/停止判断

## shall
3 停止点 (G1/G3・human floor/G6) 以外で止まらず次 Wave へ無人継続

## not
「続けますか?」質問

## applicability
autonomy.level != manual

## evidence
true
