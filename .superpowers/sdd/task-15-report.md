# Task 15 Report: Worker Entrypoint Wiring + Dockerfile

## Status: COMPLETE

## Files Created / Modified

| File | Action |
|------|--------|
| `worker/src/main.ts` | Created — thin entrypoint per brief |
| `worker/esbuild.config.mjs` | Created — esbuild config bundling workspace libs |
| `worker/package.json` | Modified — added `build` script + `esbuild` devDependency |
| `worker/Dockerfile` | Created — node:22-bookworm, git, gh CLI, opencode-ai, npm ci, bundle build |
| `worker/.dockerignore` | Created — excludes node_modules, dist, .git, .nx, logs |

## main.ts Implementation

Matches the brief exactly:
- Reads env vars: `TASK_ID`, `WORKER_TOKEN`, `CONTROL_PLANE_URL`, `GIT_URL`, `BRANCH`, `DEFAULT_BRANCH`, `PROMPT`, `VALIDATE_CMDS`
- `mkdtemp` → `cloneAndCheckout` → `writeSoul` → parse `VALIDATE_CMDS` → `runLoop`
- On `DONE`: emits `PUSHING` status → `pushBranch` → `openPr` → emits `PR_OPENED` (if url) → emits `DONE`
- Otherwise: emits the terminal status
- Top-level catch: emits `ERROR` + `STATUS failed`, exits 1

## Bundle Build

**esbuild config** (`worker/esbuild.config.mjs`):
- Entry: `worker/src/main.ts`
- Output: `worker/dist/main.js`  (12K)
- `platform: node`, `format: esm`, `target: node22`
- `packages: 'external'` — keeps npm deps (execa) external
- `alias` overrides resolve `@sagewright/shared` and `@sagewright/harness` to their TypeScript source so they get bundled in
- Result: `node --check worker/dist/main.js` → `syntax OK`
- Verification: `grep -c "TaskStatus|EventType|runLoop|OpencodeHarness"` returns 28 matches — workspace lib code is inlined

## Docker Build

**Deferred** — network timeout when Docker attempted to pull `node:22-bookworm` from Docker Hub. The Docker daemon is running but has no connectivity to the registry in this environment. No local base images are available. The Dockerfile is correct by inspection:

1. `FROM node:22-bookworm` — standard LTS node
2. Installs git, curl
3. Installs `gh` CLI via the official GitHub apt repository
4. Installs `opencode-ai` via `npm install -g opencode-ai`
5. Sets `WORKDIR /app`, copies manifests and full source, runs `npm ci`
6. Runs `node worker/esbuild.config.mjs` to build the bundle
7. Sets git author env vars
8. `ENTRYPOINT ["node", "worker/dist/main.js"]`

The full image build will be exercised in Task 19 (docker compose).

## Test Suite

All 47 tests pass across 20 test files: `npx vitest run` → `Test Files 20 passed (20), Tests 47 passed (47)`.

## Commit

SHA: `6e578a2`  
Message: `feat(worker): entrypoint wiring and Dockerfile`

---

## Fix: setupCmds, pinned opencode, root .dockerignore (commit a877e5d)

### Changes

| File | Change |
|------|--------|
| `worker/src/main.ts` | Parse `SETUP_CMDS` env var; run each command after `cloneAndCheckout`+`writeSoul`, before `runLoop`; emit LOG per cmd; on failure emit ERROR + STATUS=failed and exit(1) |
| `worker/Dockerfile` | Pin opencode to `opencode-ai@1.14.46` (was unpinned `opencode-ai`) |
| `.dockerignore` | New root-level file: excludes `node_modules`, `**/node_modules`, `**/dist`, `.git`, `.nx`, `.superpowers`, `coverage`, `tmp` |
| `worker/.dockerignore` | Deleted — was silently ignored by Docker since build context is repo root; replaced by root `.dockerignore` |

### esbuild rebuild

```
node worker/esbuild.config.mjs
# worker bundle built: dist/main.js
node --check worker/dist/main.js
# SYNTAX OK
```

### Test suite

`npx vitest run` → Test Files 20 passed (20), Tests 47 passed (47). No regressions.

## esbuild.config.mjs note on external deps

The `external: ['execa', 'node:*']` ensures execa and Node built-ins remain external (resolved at runtime from `node_modules` in the container after `npm ci`). The workspace packages `@sagewright/shared` and `@sagewright/harness` are resolved via `alias` to their TS source and bundled — no separate build step for libs is needed.
