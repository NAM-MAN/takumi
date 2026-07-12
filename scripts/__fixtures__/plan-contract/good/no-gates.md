# no-gates (fixture, EXAMPLE ONLY) — gate 行 optional の後方互換確認

## TODOs

### Wave 1: base

- [ ] 1. **ログイン画面のバリデーション修正**
  - **file_scope**: src/auth/login.ts
  - **acceptance**: AC-AUTH-002
  - **constraints**: 既存の session cookie 形式を変えない
  - **implementation_hint**: `validateLoginForm()` にメール形式チェックを追加
  - **verification**: `pnpm vitest run src/auth/login.test.ts` で exit=0
