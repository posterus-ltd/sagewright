# Spec: Worker auth tokens via `.env`, remove the secrets store

**Date:** 2026-06-24
**Status:** Approved (design), pending implementation plan

## Problem

`GITHUB_TOKEN` (and `NODE_AUTH_TOKEN`) are currently stored in an encrypted
`secrets` table and entered through the **Settings UI**. The control-plane
resolves them at task-creation time and injects them into each spawned worker
container. Configuring deployment credentials through a runtime UI is awkward and
couples the control-plane to secret material it has no reason to hold.

We want auth tokens provided as **`.env` variables**, not set over the UI.

## Goal

- Worker GitHub/npm tokens (`GITHUB_TOKEN`, `NODE_AUTH_TOKEN`) are **baked into
  the worker image at build time** from root `.env`, read by the worker process
  directly from `process.env` (unchanged in `gh-ops.ts` / `git-ops.ts`).
- The control-plane **stops resolving or injecting** these tokens.
- The Linear API key (`LINEAR_API_KEY`), the only other consumer of the secrets
  store, moves to the control-plane **`.env`/config**.
- The generic encrypted **secrets store is removed entirely** (table, routes,
  cipher, `SECRETS_KEY`, Settings UI) — nothing consumes it after the above.

## Non-goals

- No change to how the worker reads tokens at runtime (`process.env.GITHUB_TOKEN`).
- No change to the Linear integration's behavior (still no-ops when the key is
  absent).
- No runtime token rotation mechanism. Rotating a worker token requires a rebuild
  (`docker compose --profile build build worker`); this is an accepted tradeoff
  for the single-user, local MVP (consistent with the existing Docker-socket
  blast-radius tradeoff in the README).

## Decisions (resolved during brainstorming)

1. **Delivery:** Bake into the worker image via Dockerfile build args sourced from
   root `.env` (vs. spawner pass-through or a runtime-mounted `.env`). Tradeoff
   accepted: tokens are visible in `docker history` and rotation needs a rebuild.
2. **Secrets store:** Remove entirely (vs. keep for arbitrary secrets).
3. **Linear key:** Move `LINEAR_API_KEY` to control-plane `.env` too (vs. keep the
   secrets store just for Linear).

## Data flow (new)

```
root .env
  ├─ GITHUB_TOKEN, NODE_AUTH_TOKEN ──▶ docker compose build args
  │                                      └─▶ worker/Dockerfile ARG → ENV (baked)
  │                                            └─▶ worker process.env (gh-ops, git-ops)
  └─ LINEAR_API_KEY ─────────────────▶ control-plane env (compose)
                                         └─▶ config.linearApiKey ─▶ linear-client
control-plane worker-spawner: creates container, injects NO token env
```

## Changes

### Worker image build

- **`worker/Dockerfile`** — before `ENTRYPOINT`, add:
  ```dockerfile
  ARG GITHUB_TOKEN=""
  ARG NODE_AUTH_TOKEN=""
  ENV GITHUB_TOKEN=$GITHUB_TOKEN \
      NODE_AUTH_TOKEN=$NODE_AUTH_TOKEN
  ```
  Empty defaults so the build never fails when a token is absent.

- **`docker-compose.yml`** — add a build-only `worker` service so
  `docker compose build worker` reads `.env` and passes build args. Use a
  `build` profile so `docker compose up` never tries to *run* it:
  ```yaml
  worker:
    profiles: ["build"]
    image: sage-worker:latest
    build:
      context: .
      dockerfile: worker/Dockerfile
      args:
        GITHUB_TOKEN: ${GITHUB_TOKEN:-}
        NODE_AUTH_TOKEN: ${NODE_AUTH_TOKEN:-}
  ```
  Build command: `docker compose --profile build build worker`.
  Also: remove `SECRETS_KEY` from the `control-plane` service `environment`; add
  `LINEAR_API_KEY: ${LINEAR_API_KEY:-}`.

### Control-plane: stop injecting worker tokens

- **`apps/control-plane-api/src/tasks/task-service.ts`** — delete the
  `GITHUB_TOKEN`/`NODE_AUTH_TOKEN` resolution loop, the `cipher`, `resolveSecret`,
  and the now-unused `createSecretCipher` + `secrets` imports. Call `spawner.spawn`
  without an `env` payload.
- **`apps/control-plane-api/src/tasks/worker-spawner.ts`** — drop `env` from
  `SpawnInput` and the `...input.env` spread.
- **`apps/control-plane-api/src/tasks/worker-spawner.test.ts`** — update spawn
  input/assertions (no `env`).
- **`apps/control-plane-api/src/tasks/internal-routes.test.ts`** — drop the
  `config: { secretsKey: ... }` test stub (line ~253).

### Linear key from config

- **`apps/control-plane-api/src/config.ts`** — remove `SECRETS_KEY` from schema
  and `AppConfig`; add `LINEAR_API_KEY: z.string().optional()` → `linearApiKey`.
- **`apps/control-plane-api/src/linear/linear-client.ts`** — change signature to
  `createLinearClient(db, linearApiKey?: string)` reading the key directly from
  the passed value; remove the cipher, the `secrets` lookup, and `LINEAR_SECRET_KEY`.
  Behavior unchanged: `fetchTicket`/`mirrorStatus` no-op when the key is absent.
  (The `db` param may become unused — drop it if so, updating callers.)
- **`apps/control-plane-api/src/main.ts`** — `createLinearClient(db, config.linearApiKey)`.

### Remove the secrets store

- **Delete:**
  - `apps/control-plane-api/src/secrets/secret-routes.ts`
  - `apps/control-plane-api/src/secrets/secret-routes.test.ts`
  - `apps/control-plane-api/src/crypto/secret-cipher.ts`
  - `apps/control-plane-api/src/crypto/secret-cipher.test.ts`
  - `apps/control-plane-web/src/config/SettingsPage.tsx`
- **`apps/control-plane-api/src/app.ts`** — remove `registerSecretRoutes` import
  and call.
- **`apps/control-plane-api/src/db/schema.ts`** — remove the `secrets` table.
- **`apps/control-plane-api/drizzle/`** — add a migration that `DROP TABLE secrets`
  (new `0002_*` entry + `meta/_journal.json` update). Prefer `drizzle-kit generate`
  to produce the file and journal timestamp; hand-write only if generation isn't
  available in-environment.
- **`apps/control-plane-api/src/test/make-test-app.ts`** — remove the `secrets`
  `CREATE TABLE`, remove `SECRETS_KEY` from the test config, add `LINEAR_API_KEY`,
  and update the `createLinearClient` call.
- **`apps/control-plane-api/src/config.test.ts`** — remove `SECRETS_KEY`
  assertions; add `LINEAR_API_KEY` coverage as needed.
- **`libs/shared/src/task.schema.ts`** — remove `secretSchema` and the `Secret` type.
- **`apps/control-plane-web/src/api/hooks.ts`** — remove `useSecrets` and
  `useDeleteSecret`.
- **`apps/control-plane-web/src/api/hooks.test.tsx`** — remove the secrets tests.
- **`apps/control-plane-web/src/router.tsx`** — remove the `settings` route and
  `SettingsPage` import.
- **`apps/control-plane-web/src/components/Layout.tsx`** — remove the Settings nav
  button.

### Docs / env

- **`.env.example`** — remove `SECRETS_KEY`; add (with comments):
  - `GITHUB_TOKEN=` and `NODE_AUTH_TOKEN=` — **worker build args** (baked into the
    worker image; not used by the control-plane at runtime).
  - `LINEAR_API_KEY=` — control-plane runtime (optional; only for the Linear source).
- **`README.md`** —
  - Build step → `docker compose --profile build build worker` (note tokens are
    baked from `.env` at build time).
  - "Configure environment" block → drop `SECRETS_KEY`; add the three vars above.
  - Quick Start → remove step "Add a `GITHUB_TOKEN` secret in Settings" (line 62);
    note tokens are configured in `.env` before building the worker image.

## Testing

- **Unit:** `linear-client` returns `null`/no-ops when `linearApiKey` is undefined
  and calls the SDK when present (no DB/cipher path). `config` parses without
  `SECRETS_KEY` and surfaces `linearApiKey`. `worker-spawner` builds the container
  env without any token entries.
- **Integration (fastify inject):** `/api/secrets` routes are gone (404). Existing
  task-creation flow still spawns a worker (no token env injected by the
  control-plane).
- **Regression:** full `nx` test/lint/build for `control-plane-api`,
  `control-plane-web`, and `shared` pass with the secrets code and its tests
  removed. No dangling imports of deleted modules.
- **Manual:** `docker compose --profile build build worker` bakes a `GITHUB_TOKEN`
  from `.env`; a task can clone/push using it; the Settings page is no longer
  reachable.

## Risks / tradeoffs

- **Secret in image layers** — `GITHUB_TOKEN` is visible via `docker history` and
  persists in the image. Acceptable for the single-user local MVP; documented in
  README. Don't push the worker image to a shared/public registry with a real
  token baked in.
- **Rotation requires rebuild** — changing a token means rebuilding the worker
  image. Acceptable for MVP.
- **Dropping `secrets` is destructive** — the migration removes any stored values
  (incl. a previously-entered `LINEAR_API_KEY`). Operators must move that key to
  `.env` before/after migrating. Called out in README.
