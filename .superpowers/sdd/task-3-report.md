# Task 3 Report: Harness Interfaces + Event Normalization

## Status: COMPLETE

## Commit
- SHA: `6c25541`
- Subject: `feat(harness): interfaces and opencode event normalizer`
- Branch: `impl/sagewright-v1`

## TDD Evidence

### RED (before implementation)
```
 FAIL  |harness| src/opencode/normalize.test.ts
Error: Cannot find package '@sagewright/shared' imported from '.../normalize.test.ts'
 Test Files  1 failed (1)
      Tests  no tests
```

### GREEN (after implementation)
```
 ✓ |harness| src/opencode/normalize.test.ts (3 tests) 1ms
 Test Files  1 passed (1)
      Tests  3 passed (3)
```

## Files Created

| File | Purpose |
|------|---------|
| `libs/harness/src/harness.ts` | Four interfaces: `HarnessStartOpts`, `HarnessEvent`, `HarnessSession`, `Harness` |
| `libs/harness/src/opencode/normalize.ts` | `normalizeOpencodeEvent(raw): HarnessEvent \| null` |
| `libs/harness/src/opencode/normalize.test.ts` | 3 vitest cases (verbatim from brief) |
| `libs/harness/src/index.ts` | Barrel — exports only `./harness` (interfaces only; `OpencodeHarness` deferred to Task 4) |
| `libs/harness/vitest.config.ts` | Vitest config with path alias for `@sagewright/shared` |

## Implementation Notes

- `index.ts` exports only `./harness` as directed — the `OpencodeHarness` re-export is intentionally omitted until Task 4.
- `vitest.config.ts` adds a `resolve.alias` for `@sagewright/shared` → `libs/shared/src/index.ts`. The shared lib's own vitest config lacks this (not needed there since it has no cross-lib imports), but harness needs it because `normalize.ts` and `harness.ts` import from `@sagewright/shared`.
- All conventions followed: named exports only, const arrow function for `normalizeOpencodeEvent`, TypeScript strict mode compatible.

## Concerns

None. Build is clean, tests are green, commit is clean.

---

## Fix: Portable Vitest Alias + Null Guard in Normalizer

### Command Run
```
npx vitest run libs/harness
```

### Full Passing Output
```
 DEPRECATED  The workspace file is deprecated and will be removed in the next major. Please, use the `test.projects` field in the root config file instead.

 RUN  v3.2.6 /Users/valado/repos/agentic

 ✓ |harness| src/opencode/normalize.test.ts (5 tests) 1ms

 Test Files  1 passed (1)
      Tests  5 passed (5)
   Start at  23:46:57
   Duration  222ms (transform 14ms, setup 0ms, collect 37ms, tests 1ms, environment 0ms, prepare 24ms)
```

### Files Changed

| File | Change |
|------|--------|
| `libs/harness/vitest.config.ts` | Replaced hardcoded absolute path with `path.resolve(__dirname, '../shared/src/index.ts')`; added `import path from 'node:path'` |
| `libs/harness/src/opencode/normalize.ts` | Added `if (typeof raw !== 'object' \|\| raw === null) return null;` guard before casting |
| `libs/harness/src/opencode/normalize.test.ts` | Added two tests: `normalizeOpencodeEvent(null)` → null, `normalizeOpencodeEvent('x')` → null |
