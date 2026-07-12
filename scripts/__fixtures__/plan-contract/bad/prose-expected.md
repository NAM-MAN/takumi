# prose-expected (fixture, EXAMPLE ONLY) — 期待値が機械照合不能な自由散文 (英数字/= 皆無)

## TODOs

### Wave 1: base

- [ ] 1. **散文期待値 task**
  - **file_scope**: src/issues/updateIssue.ts
  - **acceptance**: AC-ISSUE-010
  - **constraints**: 既存の issue.list キャッシュ形状を変えない
  - **implementation_hint**: `updateIssue()` の楽観更新後に invalidate する
  - **verification**: `pnpm vitest run src/issues/updateIssue.test.ts` で exit=0
  - **gates**: [GATE: ddp-d2-list-invalidation | templates/ddp-lint.mjs#D2 | 正しく動作することを確認する]
