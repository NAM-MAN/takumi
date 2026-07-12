# malformed-schema (fixture, EXAMPLE ONLY) — 3 要素揃わない / 空要素

## TODOs

### Wave 1: base

- [ ] 1. **2 要素しかない gate 行**
  - **file_scope**: src/issues/updateIssue.ts
  - **acceptance**: AC-ISSUE-010
  - **constraints**: 既存の issue.list キャッシュ形状を変えない
  - **implementation_hint**: `updateIssue()` の楽観更新後に invalidate する
  - **verification**: `pnpm vitest run src/issues/updateIssue.test.ts` で exit=0
  - **gates**: [GATE: ddp-d2-list-invalidation | findings=0]

- [ ] 2. **rule-id が空の gate 行**
  - **file_scope**: src/issues/updateIssue.ts
  - **acceptance**: AC-ISSUE-010
  - **constraints**: 既存の issue.list キャッシュ形状を変えない
  - **implementation_hint**: `updateIssue()` の楽観更新後に invalidate する
  - **verification**: `pnpm vitest run src/issues/updateIssue.test.ts` で exit=0
  - **gates**: [GATE:  | templates/ddp-lint.mjs#D2 | findings=0]
