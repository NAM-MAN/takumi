---
source_rule_id: per-wave-junshi-gate
source_path: skills/takumi/dispatch/executor.md
source_hash: sha256:40115383e139fb6eb755c6e1d85a4e1eeb10a401bcb17be438e1cc7b2f49fb1b
generated_at: 2026-07-02T04:49:37.716Z
compiler_version: 1.0.0
tier: 2
safety: none
applies: surface.behavioral == true
applicability_degraded: false
---
## scope
巡視 (junshi) 発火条件

## shall
harness+containment+spec 揃い+behavioral surface 時のみ起動

## not
欠落時に junshi を発火・修正を ungated 適用

## applicability
surface.behavioral == true

## evidence
false
