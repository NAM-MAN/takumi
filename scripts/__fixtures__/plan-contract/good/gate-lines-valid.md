# gate-lines-valid (fixture, EXAMPLE ONLY)

## TODOs

### Wave 1: base

- [ ] 1. **DA-0 list mutation を実装**
  - **file_scope**: src/issues/updateIssue.ts
  - **acceptance**: AC-ISSUE-010
  - **constraints**: 既存の issue.list キャッシュ形状を変えない
  - **implementation_hint**: `updateIssue()` の楽観更新後に `issue.list@assignee` を invalidate する
  - **verification**: `pnpm vitest run src/issues/updateIssue.test.ts` で exit=0
  - **gates**: [GATE: ddp-d2-list-invalidation | templates/ddp-lint.mjs#D2 | findings=0]
  - **gates**: [GATE: md-ref-integrity | scripts/check-md-refs.mjs | exit=0]
  - **gates**: [GATE: ac-coverage-gate | scripts/spec-graph.mjs#coverage | verdict=pass]
