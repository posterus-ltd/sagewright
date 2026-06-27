# Scalable Agentic Infrastructure For Software Development

Run multiple coding agents at once without juggling terminals.
Work remotely over ssh where the control plane is hosted over the browser (so it works on mobile, tablet & desktop with session persistence).

## Components

### Control plane

- it is a docker container (with access to the docker socket so it can spawn/retire worker containers)
- it hosts the UI and has access to s postgresql db where necessary metadata is being persisted
- it is written in typescript
- frontend uses vanilla react with typescript (with the react-router framework)
- standard component library for the frontend is @mui/material-ui
- the backend uses fastify also with typescript
- allows the user to configure envs (Github SSH, NODE_AUTH_TOKEN) and repos that will be accessible to the workers
- spawn docker containers on demand (for new task)
- builds the target environment and configuration for each new worker to be spawned
- the UI shows all sessions (being able to choose mine or all users, or scheduled)
- each session shows the project and full chat history of what happened
- logs are persisted for each worker that is retired for future auditing/reference
- enable scheduling of recuring tasks (refactor, fix tests for a specific project/repo or multiple)

### Workers

- using opencode as a harness
- setting up alignmet for the agent with multiple skills and personality (SOUL.md)
- each spawned worker is a loop with steps for task work, validaiton and reflection (3 iterations before requiesting assistance)

## Integrations

- Linear to fetch ticket descriptions, add comments and update status
- Github over `gh` CLI on the image

## UI

- Send messages to the agent
- Send files to the agent

## Techstack

- typescript
- fastify
- react (@mui/material-ui, vite, react-router)
- nx (use monorepo approach for the repo and have the frontend and backend projects in apps)
- docker
- have a docker-compose file to setup the initial control plane and the postgresql (having a persisted volume)

---

## Iteration 1 — Detailed Design

This section narrows the spec above into an achievable-yet-powerful first slice. It keeps
the parts that make the system genuinely useful to a dev team and explicitly defers the rest.

### The core loop (the whole point)

> Open the browser on your phone → describe a task for a repo → a container spawns → the
> agent **works → validates → reflects** (≤3 iterations) → it pushes a branch and opens a
> PR via `gh` → you watch live, can interject, and reconnect after a dropped connection
> without losing any output.

If only this works reliably, it is already a product. Everything else is a layer on top.

### Locked decisions

| Fork | Decision |
|---|---|
| Output handoff | Worker pushes branch + opens a PR via `gh`. Review happens on GitHub. No in-app diff/merge in v1. |
| Task entry | **Both** UI-chat prompt and Linear ticket. |
| Steering | Watch + **interject anytime**; messages are picked up on the agent's next loop step. |
| Trust model | **Single trusted team, one Docker host.** Shared secrets, single login, sessions tagged by user (not isolated). |
| Harness | **Harness-agnostic adapter.** Implement `opencode` first behind a `Harness` interface; Claude Agent SDK later. |
| Deferred from v1 | Scheduling/recurring tasks · file upload to session · all-users/scheduled tabs · multi-repo per task · real multi-tenant isolation. |

### Architecture (nx monorepo)

- `apps/control-plane-api` — Fastify + TS backend (REST + SSE; owns Postgres + Docker socket)
- `apps/control-plane-web` — React + MUI + react-router + vite frontend
- `libs/harness` — `Harness` adapter interface + opencode implementation
- `libs/shared` — zod schemas + types shared FE/BE (task, event, status enums)
- `worker/` — Dockerfile + runner-loop image (git, `gh`, harness, node runner)

#### Control Plane API (Fastify)

Owns all privileged surface so secrets never spread to workers:

- **Postgres** via Drizzle (typed schema + migrations).
- **Docker** via `dockerode` against the mounted socket — spawn/retire worker containers.
- **Linear** creds live here only. Fetches the ticket description on task create; mirrors
  status/comments back when a worker reports completion (worker never sees the Linear key).
- Endpoints:
  - `repos` CRUD — name, git URL, default branch, `setupCmds[]`, `validateCmds[]`, env refs
  - `secrets` CRUD — GitHub token/SSH key, `NODE_AUTH_TOKEN`, Linear key; encrypted at rest
  - `POST /tasks` — `{ repoId, source: ui|linear, prompt | linearRef }` → queued
  - `GET /tasks` (filter by user), `GET /tasks/:id`, `POST /tasks/:id/cancel`
  - `GET /tasks/:id/stream` — **SSE**, replay-from-offset then tail
  - `POST /tasks/:id/messages` — inbound interjection
  - `POST /internal/tasks/:id/events` — worker → control-plane event ingest (worker-token auth)

#### Resumable streaming (the hard part — build first)

Everything is a **persisted event log**, never a raw socket:

- `events(id, task_id, seq, type, payload jsonb, created_at)`, `seq` monotonic per task.
- Worker batches events → `POST /internal/.../events`.
- Browser `EventSource` → `GET /tasks/:id/stream`: on connect, replay `seq > Last-Event-ID`,
  then tail via in-memory per-task pub/sub (DB-poll fallback). A dropped mobile connection
  reconnects and replays from the last seq — no lost output.
- Interjection: `POST /tasks/:id/messages` → row in `inbound_messages` → worker pulls
  pending on each loop step, marks consumed, and emits a `user_message` event into the log.

#### Worker container (spawned per task)

Harness-agnostic runner loop:

1. Clone repo, checkout `task/<id>`, run repo `setupCmds`.
2. Start harness with `SOUL.md` (system prompt + skills) + the task prompt.
3. Loop ≤3 iterations: **work → validate (`validateCmds`) → reflect** on failures; drain
   inbound messages each step. Still failing after 3 → status `needs_assistance`.
4. Stream normalized harness events out continuously.
5. On success: `git push` + `gh pr create`; report the PR url. Report status to the control
   plane, which mirrors it to Linear when `source=linear`.

#### Harness adapter (`libs/harness`)

```ts
interface Harness { start(opts): Promise<HarnessSession>; resume(id): Promise<HarnessSession> }
interface HarnessSession {
  sendMessage(text: string): Promise<void>
  events(): AsyncIterable<HarnessEvent>   // normalized union
  stop(): Promise<void>
}
```

The opencode impl normalizes its events → `HarnessEvent`. The loop controller lives in the
runner, not the adapter — so swapping to the Agent SDK later is a single file.

#### Data model (Postgres / Drizzle)

`repos`, `secrets`, `tasks(id, repo_id, source, linear_ref, prompt, status, branch, pr_url,
created_by, container_id, …)`, `events`, `inbound_messages`.
Status: `queued → provisioning → running → needs_assistance → pushing → done | failed | cancelled`.

#### Frontend (React / MUI / react-router)

Reuse house libs (`@tanstack/react-query`, `notistack`, zod). Routes:

- `/` — sessions list (my sessions; filter is trivial under single-team)
- `/repos`, `/settings` — repo + env/secret config
- `/tasks/:id` — transcript via `EventSource`, message box, status chip, PR link, cancel
- New-task dialog — pick repo, choose UI-prompt or Linear ticket id, submit.

#### Security

Single login (env-configured); user identity is a label on sessions. Secrets encrypted at
rest (node `crypto`, key from env). Worker token scoped to one task, short-lived. Only the
control plane mounts the Docker socket — **document the root-on-host blast radius**.

#### Infra

`docker-compose.yml`: `control-plane` (build, mounts `/var/run/docker.sock`) + `postgres`
(named volume). The worker image is built/tagged separately and referenced by the control plane.

### v1 scope

**IN:** repo + secret config · create task (UI prompt or Linear ticket) · spawn worker ·
work/validate/reflect ×3 · live resumable streaming · interject messages · push branch + PR ·
my-sessions list + detail · persisted logs.

**OUT (deferred):** scheduling/recurring · file upload · all-users/scheduled tabs ·
multi-repo task · real multi-tenant isolation · in-app diff/merge.

### De-risk first (spikes before committing)

1. **Harness headless** — confirm opencode supports headless run + mid-run `sendMessage` +
   an event stream + resume. Highest risk; spike standalone before building the adapter.
2. **SSE replay + tail** — prove reconnect replays from the last seq with no gaps/dupes.
3. **Docker spawn e2e** — control plane spawns a container with injected secrets, clones a
   private repo, pushes a branch, opens a PR.

### Verification

- Spike 1: a script drives the harness headless, sends a mid-run message, prints events.
- Spike 2: open the stream, kill the connection mid-task, reconnect → transcript identical.
- Spike 3: `docker compose up`, create a task against a test repo via the UI → a PR appears
  on GitHub, the transcript streams live, and an interjection changes the agent's next step.
- E2e happy path: Linear ticket → task → PR opened → ticket moved to In Review with a comment.
