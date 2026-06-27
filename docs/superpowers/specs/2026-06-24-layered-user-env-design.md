# Layered env/secrets handling: org base + per-user override

Date: 2026-06-24
Status: Approved

## Context

In commit `aff3058` the encrypted secrets store (table, AES-256-GCM cipher, `/api/secrets`
routes, Settings UI) was removed in favor of baking `GITHUB_TOKEN` / `NODE_AUTH_TOKEN` /
`OPENAI_API_KEY` into the worker image at **build time** via Dockerfile `ARG`→`ENV`.

That gives one shared "agent" identity for the whole deployment — fine for a pipeline-managed
bot, but wrong the moment a team wants per-user attribution (PRs from the human who triggered the
run) or per-user repo permissions (enterprise). The three tokens are also not the same kind of
secret: `OPENAI_API_KEY` (billing) and `NODE_AUTH_TOKEN` (npm read) are org/infra-level and
identical for everyone, while `GITHUB_TOKEN` is an *identity* token that should vary per user.

**Goal:** keep build-time baking as the org/base layer, and add a per-user, DB-persisted custom
`.env` (edited in control-plane Settings) that is injected at agent spawn and **overrides** the
baked values. Encrypted at rest; shown masked with a reveal toggle. The MVP UI is single-user, but
the data model keys env blobs per user so SSO later is a drop-in.

## Design

### Precedence (three layers, highest wins)

1. **Org/base** — baked into the worker image at build time (Dockerfile `ARG`→`ENV`). Pipeline-managed.
2. **Per-user** — the user's custom `.env` blob, parsed and added to the container `Env` at spawn.
   Docker makes container `Env` override image `ENV`, so this beats the base layer for free.
3. **Operational** — vars the spawner sets (`WORKER_TOKEN`, `TASK_ID`, `CONTROL_PLANE_URL`,
   `SESSION_DIR`, `REPO_MANIFEST`, `PROMPT`, `SESSION_MODE`, `LINEAR_API_KEY`). These must win over
   the user blob and are protected via a reserved-keys guard.

Merge in `worker-spawner.ts`: `Env: toEnvArray({ ...userEnv, ...operationalEnv })`.

### Encryption at rest

Restore the cipher deleted in `aff3058` — `createSecretCipher` (AES-256-GCM) — keyed by a new
control-plane `SECRETS_KEY` (32 chars, used as a raw utf8 256-bit key). The **whole `.env` blob**
is encrypted as one column; we never query by value.

### Reveal-to-edit UX (option A)

The Settings textarea shows the env **masked and read-only** by default: every value after `=` is
rendered as `*******`, keys/comments/blank lines preserved. A reveal toggle fetches plaintext and
makes the textarea editable. Save persists plaintext. This avoids the bug where saving while masked
overwrites real secrets with asterisks.

## Components

- **`libs/shared/src/dotenv-blob.ts`** — `parseEnvBlob`, `maskEnvBlob`, `RESERVED_ENV_KEYS`.
- **`apps/control-plane-api/src/crypto/secret-cipher.ts`** — restored AES-256-GCM cipher.
- **`config.ts`** — new `SECRETS_KEY` (zod `.length(32)`).
- **`db/schema.ts`** — `user_envs` table (`userKey` unique, `envEncrypted`, `updatedAt`) + migration.
- **`user-env/user-env-service.ts`** — `get`/`set` keyed by `userKey`, encrypts/decrypts.
- **`user-env/user-env-routes.ts`** — `GET /api/user-env` (masked), `GET /api/user-env/reveal`
  (plaintext), `PUT /api/user-env`.
- **`tasks/worker-spawner.ts` + `tasks/task-service.ts`** — load + parse + reserved-key-strip the
  requester's blob, merge into container env (operational wins).
- **`control-plane-web` SettingsPage** — an Environment section (masked textarea + reveal toggle +
  save) wired through `api/hooks.ts`.

## Data flow

```
Settings UI ──PUT plaintext──▶ user-env-routes ──▶ service.set ──encrypt──▶ user_envs.envEncrypted
                                                                                      │
task create (createdBy) ──▶ service.get ──decrypt──▶ parseEnvBlob ──strip reserved──┘
        │
        ▼
worker-spawner: { ...userEnv, ...operationalEnv } ──▶ container Env (overrides image ENV)
```

## Non-goals

- No per-key encryption (whole blob only).
- No runtime rotation of baked org secrets (still a rebuild).
- No real multi-tenant isolation yet — `userKey` = `displayName` until SSO lands.

## Testing

- Unit: cipher round-trip; `parseEnvBlob` (quotes/comments/blanks); `maskEnvBlob`; reserved-key strip.
- Service/routes: PUT→GET returns masked; `/reveal` returns plaintext; malformed body → 400; rows
  isolated per `userKey`.
- Spawner: a user blob setting `GITHUB_TOKEN` reaches the container env; operational vars still win;
  a user-supplied `WORKER_TOKEN` is ignored.
- Regression: `nx run-many -t build,test`; run the new drizzle migration.
- Manual e2e: Settings → paste `GITHUB_TOKEN=...` → save → reload masked → reveal → create task →
  worker pushes/opens PR under the user's token.
