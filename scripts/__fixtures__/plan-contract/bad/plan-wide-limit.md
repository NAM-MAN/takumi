# plan-wide-limit (fixture, EXAMPLE ONLY) — plan 全体で gate 行 >30 (各 task は 3 行以内)

## TODOs

### Wave 1: base

- [ ] 1. **task 1**
  - **file_scope**: src/mod1.ts
  - **acceptance**: AC-MOD-001
  - **constraints**: 既存挙動を変えない
  - **implementation_hint**: `mod1()` を修正
  - **verification**: `pnpm vitest run src/mod1.test.ts` で exit=0
  - **gates**: [GATE: md-ref-integrity | scripts/check-md-refs.mjs | exit=0]
  - **gates**: [GATE: md-ref-integrity | scripts/check-md-refs.mjs | exit=0]
  - **gates**: [GATE: md-ref-integrity | scripts/check-md-refs.mjs | exit=0]

- [ ] 2. **task 2**
  - **file_scope**: src/mod2.ts
  - **acceptance**: AC-MOD-002
  - **constraints**: 既存挙動を変えない
  - **implementation_hint**: `mod2()` を修正
  - **verification**: `pnpm vitest run src/mod2.test.ts` で exit=0
  - **gates**: [GATE: md-ref-integrity | scripts/check-md-refs.mjs | exit=0]
  - **gates**: [GATE: md-ref-integrity | scripts/check-md-refs.mjs | exit=0]
  - **gates**: [GATE: md-ref-integrity | scripts/check-md-refs.mjs | exit=0]

- [ ] 3. **task 3**
  - **file_scope**: src/mod3.ts
  - **acceptance**: AC-MOD-003
  - **constraints**: 既存挙動を変えない
  - **implementation_hint**: `mod3()` を修正
  - **verification**: `pnpm vitest run src/mod3.test.ts` で exit=0
  - **gates**: [GATE: md-ref-integrity | scripts/check-md-refs.mjs | exit=0]
  - **gates**: [GATE: md-ref-integrity | scripts/check-md-refs.mjs | exit=0]
  - **gates**: [GATE: md-ref-integrity | scripts/check-md-refs.mjs | exit=0]

- [ ] 4. **task 4**
  - **file_scope**: src/mod4.ts
  - **acceptance**: AC-MOD-004
  - **constraints**: 既存挙動を変えない
  - **implementation_hint**: `mod4()` を修正
  - **verification**: `pnpm vitest run src/mod4.test.ts` で exit=0
  - **gates**: [GATE: md-ref-integrity | scripts/check-md-refs.mjs | exit=0]
  - **gates**: [GATE: md-ref-integrity | scripts/check-md-refs.mjs | exit=0]
  - **gates**: [GATE: md-ref-integrity | scripts/check-md-refs.mjs | exit=0]

- [ ] 5. **task 5**
  - **file_scope**: src/mod5.ts
  - **acceptance**: AC-MOD-005
  - **constraints**: 既存挙動を変えない
  - **implementation_hint**: `mod5()` を修正
  - **verification**: `pnpm vitest run src/mod5.test.ts` で exit=0
  - **gates**: [GATE: md-ref-integrity | scripts/check-md-refs.mjs | exit=0]
  - **gates**: [GATE: md-ref-integrity | scripts/check-md-refs.mjs | exit=0]
  - **gates**: [GATE: md-ref-integrity | scripts/check-md-refs.mjs | exit=0]

- [ ] 6. **task 6**
  - **file_scope**: src/mod6.ts
  - **acceptance**: AC-MOD-006
  - **constraints**: 既存挙動を変えない
  - **implementation_hint**: `mod6()` を修正
  - **verification**: `pnpm vitest run src/mod6.test.ts` で exit=0
  - **gates**: [GATE: md-ref-integrity | scripts/check-md-refs.mjs | exit=0]
  - **gates**: [GATE: md-ref-integrity | scripts/check-md-refs.mjs | exit=0]
  - **gates**: [GATE: md-ref-integrity | scripts/check-md-refs.mjs | exit=0]

- [ ] 7. **task 7**
  - **file_scope**: src/mod7.ts
  - **acceptance**: AC-MOD-007
  - **constraints**: 既存挙動を変えない
  - **implementation_hint**: `mod7()` を修正
  - **verification**: `pnpm vitest run src/mod7.test.ts` で exit=0
  - **gates**: [GATE: md-ref-integrity | scripts/check-md-refs.mjs | exit=0]
  - **gates**: [GATE: md-ref-integrity | scripts/check-md-refs.mjs | exit=0]
  - **gates**: [GATE: md-ref-integrity | scripts/check-md-refs.mjs | exit=0]

- [ ] 8. **task 8**
  - **file_scope**: src/mod8.ts
  - **acceptance**: AC-MOD-008
  - **constraints**: 既存挙動を変えない
  - **implementation_hint**: `mod8()` を修正
  - **verification**: `pnpm vitest run src/mod8.test.ts` で exit=0
  - **gates**: [GATE: md-ref-integrity | scripts/check-md-refs.mjs | exit=0]
  - **gates**: [GATE: md-ref-integrity | scripts/check-md-refs.mjs | exit=0]
  - **gates**: [GATE: md-ref-integrity | scripts/check-md-refs.mjs | exit=0]

- [ ] 9. **task 9**
  - **file_scope**: src/mod9.ts
  - **acceptance**: AC-MOD-009
  - **constraints**: 既存挙動を変えない
  - **implementation_hint**: `mod9()` を修正
  - **verification**: `pnpm vitest run src/mod9.test.ts` で exit=0
  - **gates**: [GATE: md-ref-integrity | scripts/check-md-refs.mjs | exit=0]
  - **gates**: [GATE: md-ref-integrity | scripts/check-md-refs.mjs | exit=0]
  - **gates**: [GATE: md-ref-integrity | scripts/check-md-refs.mjs | exit=0]

- [ ] 10. **task 10**
  - **file_scope**: src/mod10.ts
  - **acceptance**: AC-MOD-010
  - **constraints**: 既存挙動を変えない
  - **implementation_hint**: `mod10()` を修正
  - **verification**: `pnpm vitest run src/mod10.test.ts` で exit=0
  - **gates**: [GATE: md-ref-integrity | scripts/check-md-refs.mjs | exit=0]
  - **gates**: [GATE: md-ref-integrity | scripts/check-md-refs.mjs | exit=0]
  - **gates**: [GATE: md-ref-integrity | scripts/check-md-refs.mjs | exit=0]

- [ ] 11. **task 11**
  - **file_scope**: src/mod11.ts
  - **acceptance**: AC-MOD-011
  - **constraints**: 既存挙動を変えない
  - **implementation_hint**: `mod11()` を修正
  - **verification**: `pnpm vitest run src/mod11.test.ts` で exit=0
  - **gates**: [GATE: md-ref-integrity | scripts/check-md-refs.mjs | exit=0]
  - **gates**: [GATE: md-ref-integrity | scripts/check-md-refs.mjs | exit=0]
  - **gates**: [GATE: md-ref-integrity | scripts/check-md-refs.mjs | exit=0]

