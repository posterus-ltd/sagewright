# Sage v1 — Design

**Date:** 2026-06-23
**Status:** Approved (brainstorming → design)
**Source spec:** `spec.md` (Iteration 1 — Detailed Design)

## 1. Goal

Run multiple coding agents at once from a browser (mobile/tablet/desktop) without
juggling terminals. The core loop:

> Open the browser → describe a task for a repo → a container spawns → the agent
> **works → validates → reflects** (≤3 iterations) → it pushes a branch and opens a PR
> via `gh` → you watch live, can interject, and reconnect after a dropped connection
> without losing output.

If only this works reliably it is already a product. Everything else is a layer on top.

## 2. Locked decisions (from spec)

| Fork | Decision |
|---|---|
| Output handoff | Worker pushes branch + opens PR via `gh`. Review on GitHub. No in-app diff/merge in v1. |
| Task entry | Both UI-chat prompt and Linear ticket. |
| Steering | Watch + interject anytime; messages picked up on the agent's next loop step. |
| Trust model | Single trusted team, one Docker host. Shared secret login, sessions tagged by user (not isolated). |
| Harness | Harness-agnostic adapter. opencode first behind a `Harness` interface; Claude Agent SDK later. |
| Deferred from v1 | Scheduling/recurring · file upload to session · all-users/scheduled tabs · multi-repo per task · real multi-tenant isolation · in-app diff/merge. |

## 3. opencode capability verification (done 2026-06-23, v1.14.46)

The adapter's load-bearing assumptions are confirmed against the installed CLI:

- `opencode serve --port <p> --hostname <h>` → headless HTTP server (REST + event stream).
- `opencode run --attach <url> --session <id> <msg>` → send a message to an existing
  session on a running server ⇒ mid-run `sendMessage`.
- `opencode run --format json` → raw JSON event stream ⇒ source for normalized events.
- `opencode run --session <id>` / `opencode export <id>` → resume / dump session ⇒ resumability.
- Basic auth via `OPENCODE_SERVER_PASSWORD` / `--password`.

The opencode impl talks to the server's HTTP API (create session, subscribe to events,
post message). The `run --attach` path is the documented fallback.

## 4. Architecture — nx monorepo (npm)

```
apps/
  control-plane-api/    Fastify + TS backend (REST + SSE; owns Postgres + Docker socket)
  control-plane-web/    React 19 + MUI + react-router + vite frontend
libs/
  harness/              Harness adapter interface + opencode implementation
  shared/               zod schemas + types shared FE/BE (task, event, status enums)
worker/                 Dockerfile + runner-loop image (git, gh, opencode, node runner)
docker-compose.yml      control-plane (mounts /var/run/docker.sock) + postgres (named volume)
```

**Dependency rules** (per `alignment/ARCHITECTURE.md`): apps depend on libs, never on each
other. `harness` depends only on `shared`. No circular deps. External services (Docker,
Linear, GitHub, opencode) are wrapped in adapters and injected, never imported directly into
feature code.

## 5. Control Plane API (Fastify)

Owns all privileged surface so secrets never spread to workers.

- **Postgres** via Drizzle (typed schema + migrations).
- **Docker** via `dockerode` against the mounted socket — spawn/retire worker containers.
- **Linear** creds live here only. Fetches ticket description on task create; mirrors
  status/comments back when a worker reports completion. Worker never sees the Linear key.

### Endpoints

- `repos` CRUD — `{ name, gitUrl, defaultBranch, setupCmds[], validateCmds[], envRefs[] }`
- `secrets` CRUD — GitHub token/SSH key, `NODE_AUTH_TOKEN`, Linear key; encrypted at rest
- `POST /tasks` — `{ repoId, source: ui|linear, prompt? | linearRef? }` → queued
- `GET /tasks` (filter by user), `GET /tasks/:id`, `POST /tasks/:id/cancel`
- `GET /tasks/:id/stream` — **SSE**, replay-from-offset then tail
- `POST /tasks/:id/messages` — inbound interjection
- `POST /internal/tasks/:id/events` — worker → control-plane event ingest (worker-token auth)
- `GET /internal/tasks/:id/messages` — worker pulls pending interjections (worker-token auth)

### Resumable streaming (build first — hardest part)

Everything is a **persisted event log**, never a raw socket:

- `events(id, task_id, seq, type, payload jsonb, created_at)`, `seq` monotonic per task.
- Worker batches events → `POST /internal/.../events`.
- Browser `EventSource` → `GET /tasks/:id/stream`: on connect, replay `seq > Last-Event-ID`,
  then tail via in-memory per-task pub/sub (DB-poll fallback). A dropped mobile connection
  reconnects and replays from the last seq — no lost output, no dupes.
- Interjection: `POST /tasks/:id/messages` → row in `inbound_messages` → worker pulls
  pending on each loop step, marks consumed, emits a `user_message` event into the log.

## 6. Worker container (spawned per task)

Harness-agnostic runner loop. **The loop controller lives in the runner, not the adapter**,
so swapping to the Agent SDK later is a single file.

1. Clone repo, checkout `task/<id>`, run repo `setupCmds`.
2. Start opencode session with `SOUL.md` (system prompt + skills) + the task prompt.
3. Loop ≤3 iterations: **work → validate (`validateCmds`) → reflect** on failures; drain
   inbound messages each step. On validation failure, feed the failures back as a reflect
   message into the same session. Still failing after 3 → status `needs_assistance`.
4. Stream normalized harness events out continuously via `/internal` ingest.
5. On success: `git push` + `gh pr create`; report the PR url. Report status to the control
   plane, which mirrors it to Linear when `source=linear`.

### Harness adapter (`libs/harness`)

```ts
interface Harness {
  start(opts: HarnessStartOpts): Promise<HarnessSession>
  resume(id: string): Promise<HarnessSession>
}
interface HarnessSession {
  sendMessage(text: string): Promise<void>
  events(): AsyncIterable<HarnessEvent>   // normalized union
  stop(): Promise<void>
}
```

The opencode impl normalizes its events → `HarnessEvent`.

## 7. Data model (Postgres / Drizzle)

- `repos` — id, name, gitUrl, defaultBranch, setupCmds[], validateCmds[], envRefs[], timestamps
- `secrets` — id, key (name), valueEncrypted, timestamps
- `tasks` — id, repo_id, source, linear_ref, prompt, status, branch, pr_url, created_by,
  container_id, worker_token_hash, timestamps
- `events` — id, task_id, seq, type, payload jsonb, created_at
- `inbound_messages` — id, task_id, body, consumed_at, created_at

**Status enum:** `queued → provisioning → running → needs_assistance → pushing → done | failed | cancelled`.

## 8. Frontend (React 19 / MUI / react-router / vite)

House libs: `@tanstack/react-query`, `notistack`, `zod`, `react-i18next`. Routes:

- `/` — sessions list (my sessions; filter trivial under single-team)
- `/repos`, `/settings` — repo + env/secret config
- `/tasks/:id` — transcript via `EventSource`, message box, status chip, PR link, cancel
- New-task dialog — pick repo, choose UI-prompt or Linear ticket id, submit
- `/login` — display name + shared password

Mobile-first (`alignment/DESIGN.md`): 44px touch targets, light/dark via CSS custom
properties, semantic HTML, keyboard nav.

## 9. Resolved open decisions

These were not fully specified in `spec.md`; resolved during brainstorming:

1. **Login** — single shared `APP_PASSWORD` (env). Login form takes display name + password
   → HMAC-signed session cookie (`SESSION_SECRET`). No user table; `created_by` = display
   name. Identity is a label, per the single-team trust model.
2. **Worker auth** — each task mints a short-lived random worker token, stored hashed
   (`worker_token_hash`) on the task row. Used for `/internal/*` calls only. Worker receives
   the GitHub token (for push) but never the Linear key or other tasks' tokens.
3. **Secrets at rest** — AES-256-GCM (node `crypto`), 32-byte key from `SECRETS_KEY` env.
4. **Linear / GitHub degrade gracefully** — `source=ui` works with no Linear key configured;
   PR push is skipped (status still `done`, transcript notes "no GitHub token configured")
   when no GitHub token. Both adapters are real but covered by mocked integration tests in
   this environment (no live creds), runnable for real once creds are added.
5. **Testing** — TDD per `alignment/SWE.md`: vitest unit + integration (mock `dockerode` +
   a fake opencode server), `msw` on the frontend, co-located tests. The Docker-spawn e2e is
   a scripted manual check (real Docker is available in this environment).

## 10. Security

Single login (env-configured); user identity is a label on sessions. Secrets encrypted at
rest. Worker token scoped to one task, short-lived. **Only the control plane mounts the
Docker socket — this is root-on-host blast radius; documented and accepted for the
single-trusted-team model.**

## 11. Infra

`docker-compose.yml`: `control-plane` (build, mounts `/var/run/docker.sock`) + `postgres`
(named volume). The worker image is built/tagged separately and referenced by the control
plane via an env-configured image tag.

## 12. v1 scope

**IN:** repo + secret config · create task (UI prompt or Linear ticket) · spawn worker ·
work/validate/reflect ×3 · live resumable streaming · interject messages · push branch + PR ·
my-sessions list + detail · persisted logs.

**OUT (deferred):** scheduling/recurring · file upload · all-users/scheduled tabs ·
multi-repo task · real multi-tenant isolation · in-app diff/merge.

## 13. Build sequence (within "full v1 in one go")

1. `libs/shared` — zod schemas + enums (foundation for everything).
2. `libs/harness` — `Harness` interface + opencode impl, tested against a fake opencode server.
3. `apps/control-plane-api` — Drizzle schema/migrations → secrets/repos → resumable SSE
   (events log) → tasks lifecycle → dockerode spawn → Linear adapter.
4. `worker/` — runner loop + Dockerfile + image.
5. `apps/control-plane-web` — auth → sessions list → task detail (EventSource) → config screens.
6. `docker-compose.yml` wire-up + scripted e2e verification.

## 14. Verification

- **SSE replay:** open the stream, kill the connection mid-task, reconnect → transcript
  identical (no gaps/dupes).
- **Harness:** a script drives opencode headless, sends a mid-run message, prints normalized events.
- **Docker spawn e2e:** `docker compose up`, create a task against a test repo via the UI →
  a PR appears on GitHub, the transcript streams live, an interjection changes the next step.
- **Linear happy path:** Linear ticket → task → PR opened → ticket moved to In Review with a
  comment (runnable once a Linear key is configured).
