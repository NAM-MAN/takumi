# rule-compiler fixture: mode card 予算 (20行) 超過 → 優先度切捨て (EXAMPLE ONLY, 25 synthetic rule)
# 優先度: safety!=none(4) > T1(8) > T2(6) > T3(7) = 25件、budget20 → 下位5件 (T3の後半) が切捨てられる想定

## R01 <!-- RULE: ddp-d1-silent-catch T1:templates/ddp-lint.mjs#D1 -->
<!-- scope:s01 / shall:sh01 / not:n01 / applicability:always / evidence:e01 -->
body

## R02 <!-- RULE: human-floor-irreversible T1:scripts/check-irreversible-paths.mjs -->
<!-- scope:s02 / shall:sh02 / not:n02 / applicability:always / evidence:e02 -->
body

## R03 <!-- RULE: loop-stop-predicate T1:state.json-machine-predicate -->
<!-- scope:s03 / shall:sh03 / not:n03 / applicability:loop==true / evidence:e03 -->
body

## R04 <!-- RULE: layer2-hook-guard T1:scripts/hook-irreversible-guard.mjs -->
<!-- scope:s04 / shall:sh04 / not:n04 / applicability:always / evidence:e04 -->
body

## R05 <!-- RULE: wave-gate-pipeline T1:templates/ddp-lint.mjs -->
<!-- scope:s05 / shall:sh05 / not:n05 / applicability:always / evidence:e05 -->
body

## R06 <!-- RULE: final-verification-step T1:scripts/spec-graph.mjs -->
<!-- scope:s06 / shall:sh06 / not:n06 / applicability:task.surface_ref!=null / evidence:e06 -->
body

## R07 <!-- RULE: m9-orphan-zero T1:scripts/spec-graph.mjs -->
<!-- scope:s07 / shall:sh07 / not:n07 / applicability:task.surface_ref!=null / evidence:e07 -->
body

## R08 <!-- RULE: ac-coverage-gate T1:scripts/spec-graph.mjs#coverage -->
<!-- scope:s08 / shall:sh08 / not:n08 / applicability:task.surface_ref!=null / evidence:e08 -->
body

## R09 <!-- RULE: md-ref-integrity T1:scripts/check-md-refs.mjs -->
<!-- scope:s09 / shall:sh09 / not:n09 / applicability:always / evidence:e09 -->
body

## R10 <!-- RULE: telemetry-event-schema T1:scripts/validate-telemetry.mjs -->
<!-- scope:s10 / shall:sh10 / not:n10 / applicability:always / evidence:e10 -->
body

## R11 <!-- RULE: boundary-lint-r3 T1:dependency-cruiser -->
<!-- scope:s11 / shall:sh11 / not:n11 / applicability:task.domain_slice!=null / evidence:e11 -->
body

## R12 <!-- RULE: consistency-matrix-m1-m12 T1:scripts/spec-graph.mjs#consistency-pairs -->
<!-- scope:s12 / shall:sh12 / not:n12 / applicability:task.surface_ref!=null / evidence:e12 -->
body

## R13 <!-- RULE: oracle-review-f T2:enforcement/reviewers/oracle.md -->
<!-- scope:s13 / shall:sh13 / not:n13 / applicability:always / evidence:e13 -->
body

## R14 <!-- RULE: codegen-exception-rule T2:enforcement/reviewers/oracle.md -->
<!-- scope:s14 / shall:sh14 / not:n14 / applicability:always / evidence:e14 -->
body

## R15 <!-- RULE: per-wave-junshi-gate T2:enforcement/reviewers/oracle.md -->
<!-- scope:s15 / shall:sh15 / not:n15 / applicability:surface.behavioral==true / evidence:e15 -->
body

## R16 <!-- RULE: craft-h1-h6 T2:enforcement/reviewers/craft.md -->
<!-- scope:s16 / shall:sh16 / not:n16 / applicability:surface.tags==human-UI / evidence:e16 -->
body

## R17 <!-- RULE: ac-quality-c T2:enforcement/reviewers/ac-quality.md -->
<!-- scope:s17 / shall:sh17 / not:n17 / applicability:task.surface_ref!=null / evidence:e17 -->
body

## R18 <!-- RULE: plan-contract-misimpl-oracle T2:enforcement/reviewers/plan-contract.md -->
<!-- scope:s18 / shall:sh18 / not:n18 / applicability:plan.tasks!=null / evidence:e18 -->
body

## R19 <!-- RULE: stop-points-only T3:kernel-reanchor -->
<!-- scope:s19 / shall:sh19 / not:n19 / applicability:always / evidence:e19 -->
body

## R20 <!-- RULE: gate-before-advance T3:kernel-reanchor -->
<!-- scope:s20 / shall:sh20 / not:n20 / applicability:always / evidence:e20 -->
body

## R21 <!-- RULE: thin-orchestrator T3:kernel-reanchor -->
<!-- scope:s21 / shall:sh21 / not:n21 / applicability:always / evidence:e21 -->
body

## R22 <!-- RULE: g6-context-pause T3:kernel-reanchor -->
<!-- scope:s22 / shall:sh22 / not:n22 / applicability:always / evidence:e22 -->
body

## R23 <!-- RULE: decision-dossier-required T3:kernel-reanchor -->
<!-- scope:s23 / shall:sh23 / not:n23 / applicability:always / evidence:e23 -->
body

## R24 <!-- RULE: opus-delegation-policy T3:kernel-reanchor -->
<!-- scope:s24 / shall:sh24 / not:n24 / applicability:always / evidence:e24 -->
body

## R25 <!-- RULE: three-mode-routing T3:kernel-reanchor -->
<!-- scope:s25 / shall:sh25 / not:n25 / applicability:always / evidence:e25 -->
body
