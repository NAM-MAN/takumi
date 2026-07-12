# unknown-rule-id (fixture, EXAMPLE ONLY) — registry に無い rule-id (forward-orphan)

## TODOs

### Wave 1: base

- [ ] 1. **存在しない rule を参照する task**
  - **file_scope**: src/issues/updateIssue.ts
  - **acceptance**: AC-ISSUE-010
  - **constraints**: 既存の issue.list キャッシュ形状を変えない
  - **implementation_hint**: `updateIssue()` の楽観更新後に invalidate する
  - **verification**: `pnpm vitest run src/issues/updateIssue.test.ts` で exit=0
  - **gates**: [GATE: not-a-real-rule-id | some/mechanism.mjs | findings=0]
