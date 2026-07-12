# fragment-base-match (fixture, EXAMPLE ONLY) — mechanism-ref が registry の fragment 無し base path と一致するケース

## TODOs

### Wave 1: base

- [ ] 1. **connection cache 書込に invalidation を追加**
  - **file_scope**: src/data/connectionCache.ts
  - **acceptance**: AC-DATA-004
  - **constraints**: 既存の DA-0 tier を変えない
  - **implementation_hint**: `writeConnectionCache()` に invalidate 呼出を追加
  - **verification**: `pnpm vitest run src/data/connectionCache.test.ts` で exit=0
  - **gates**: [GATE: ddp-d2-list-invalidation | templates/ddp-lint.mjs | findings=0]
