# too-many-per-task (fixture, EXAMPLE ONLY) — 1 task に gate 行 4 本 (上限 3 超過)、各行は schema/orphan 単体では正当

## TODOs

### Wave 1: base

- [ ] 1. **gate 行過多 task**
  - **file_scope**: src/issues/updateIssue.ts
  - **acceptance**: AC-ISSUE-010
  - **constraints**: 既存の issue.list キャッシュ形状を変えない
  - **implementation_hint**: `updateIssue()` の楽観更新後に invalidate する
  - **verification**: `pnpm vitest run src/issues/updateIssue.test.ts` で exit=0
  - **gates**: [GATE: ddp-d2-list-invalidation | templates/ddp-lint.mjs#D2 | findings=0]
  - **gates**: [GATE: md-ref-integrity | scripts/check-md-refs.mjs | exit=0]
  - **gates**: [GATE: ac-coverage-gate | scripts/spec-graph.mjs#coverage | verdict=pass]
  - **gates**: [GATE: m9-orphan-zero | scripts/spec-graph.mjs | orphan=0]
