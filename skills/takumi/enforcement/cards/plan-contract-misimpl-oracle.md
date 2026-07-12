---
source_rule_id: plan-contract-misimpl-oracle
source_path: skills/takumi/dispatch/executor.md
source_hash: sha256:f1a2db5e1292f6e65c428ac4045407b34632948b9220343c2deda96f29f6da24
generated_at: 2026-07-09T07:35:36.697Z
compiler_version: 1.0.0
tier: 2
safety: none
applies: plan.tasks != null
applicability_degraded: false
---
## scope
dispatch 前の task 契約密度

## shall
state machine 通りに block 判定・delegation は inline scoped

## not
T1 単独 block・親会話前提で dispatch

## applicability
plan.tasks != null

## evidence
true
