---
source_rule_id: wave-handoff-artifact
source_path: skills/takumi/dispatch/executor.md
source_hash: sha256:44211bc813e27993733376281f254484c3220744dd709cc976557f118ef48dfa
generated_at: 2026-07-02T04:49:37.716Z
compiler_version: 1.0.0
tier: 1
safety: none
applies: always
applicability_degraded: false
---
## scope
Wave 完了時の引き継ぎ記録

## shall
notepads/{name}/handoff-w{N}.md に ≤30行 (決定/発見/逸脱/未消化リスク の 4 見出し) で書き、次 Wave の dispatch prompt に本文添付

## not
handoff 無しで次 Wave dispatch・30行超過・会話記憶だけで引き継ぐ

## applicability
always

## evidence
false
