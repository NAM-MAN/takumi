---
source_rule_id: context-protection-pause
source_path: skills/takumi/dispatch/executor.md
source_hash: sha256:91218128834e6e7771f157939fc3208b2eeb3f63981204cc5f73d2ac82879b7d
generated_at: 2026-07-02T04:49:37.716Z
compiler_version: 1.0.0
tier: 3
safety: none
applies: always
applicability_degraded: false
---
## scope
Agent 文脈残量管理

## shall
残量 20% 以下で一時停止・resume.md 生成・ユーザー通知

## not
20% 突破して継続

## applicability
always

## evidence
true
