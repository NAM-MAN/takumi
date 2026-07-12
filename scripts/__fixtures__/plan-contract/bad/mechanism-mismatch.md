# mechanism-mismatch (fixture, EXAMPLE ONLY) — rule-id は実在するが mechanism-ref が registry と不一致 (reverse-orphan)

## TODOs

### Wave 1: base

- [ ] 1. **fragment 違い**
  - **file_scope**: src/issues/updateIssue.ts
  - **acceptance**: AC-ISSUE-010
  - **constraints**: 既存の issue.list キャッシュ形状を変えない
  - **implementation_hint**: `updateIssue()` の楽観更新後に invalidate する
  - **verification**: `pnpm vitest run src/issues/updateIssue.test.ts` で exit=0
  - **gates**: [GATE: ddp-d2-list-invalidation | templates/ddp-lint.mjs#D9 | findings=0]

- [ ] 2. **base path 自体が違う**
  - **file_scope**: docs/CONTRIBUTING/skill-contract.md
  - **acceptance**: AC-DOC-001
  - **constraints**: 既存の見出し構造を変えない
  - **implementation_hint**: `skill-contract.md` の semver 節を更新
  - **verification**: `node scripts/check-md-refs.mjs` で exit=0
  - **gates**: [GATE: md-ref-integrity | scripts/wrong-script.mjs | exit=0]
