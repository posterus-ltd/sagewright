# Sagewright — Architecture Overview (arc42, light)

Run many coding agents at once from a browser-hosted control plane the org owns.
Describe a task → a container spawns → the agent **works → validates → reflects**
→ it opens a PR. Mobile-first and fully resumable.

This is a deliberately light arc42. Deep rationale lives in `../../alignment/`
(VISION, ARCHITECTURE, ARD). Companion docs:

- [`concepts.md`](./concepts.md) — crosscutting concepts (the load-bearing ideas)
- [`adr.md`](./adr.md) — architecture decisions

---

## 1. Introduction & Goals

Coding agents already run across the team, but every setup is bespoke, local to a
laptop, and welded to one vendor's CLI. Sagewright centralizes them: capability and
history accumulate as an **organizational asset**, not scattered across machines.

**Top quality goals**

| Goal | Meaning |
|---|---|
| Reliable core loop | A task from mobile reliably produces a PR with a live transcript. |
| Resumability | Drop the connection mid-task, reconnect, transcript is identical — no gaps or dupes. |
| Harness-agnostic | Swap agent CLI/model by editing one runner image; no control-plane changes. |
| Steerable | Watch live and interject anytime; picked up on the agent's next step. |

## 2. Constraints

- **Single trusted team, one Docker host.** Shared secrets, single login; user
  identity is a *label* on sessions, not an isolation boundary.
- Only the control plane mounts the Docker socket — the root-on-host blast radius
  is accepted and documented.
- TypeScript throughout; nx monorepo; npm; Postgres for all persisted state.

## 3. Context & Scope

```
        Browser (phone/tablet/desktop)
                 │ HTTPS + SSE
                 ▼
        ┌──────────────────┐   docker.sock   ┌──────────────┐
 GitHub │  Control Plane   │───────────────► │  Runner ×N   │
 Linear │  (API + Web)     │  exec PTY       │ (1 per task) │
   ◄────┤                  │◄─────────────── │              │
        └────────┬─────────┘                 └──────────────┘
                 │ Drizzle
                 ▼
             Postgres
```

- **Users** create tasks (UI prompt or Linear ticket) and watch/steer them.
- **GitHub** receives branches + PRs (`gh`). **Linear** supplies ticket text and
  gets status/comment mirrors — its credentials never leave the control plane.

## 4. Solution Strategy

- **Thin control plane, generic runner.** The control plane only *spawns* a
  container, *exec*s into it, and *injects env*. Every higher behavior is built on
  those three primitives. Which agent runs is a property of the runner image.
- **Everything is a persisted event log**, never a raw socket — that is what makes
  streaming resumable.
- **Harness behind an image contract** (`start-agent` / `continue-agent`), so a new
  agent is a new folder under `runners/`, not a code change.

## 5. Building Block View

| Block | Path | Responsibility |
|---|---|---|
| Control Plane API | `apps/control-plane-api` | Fastify. Owns Postgres, Docker socket, secrets, Linear/GitHub creds. REST + SSE + terminal WebSocket. |
| Control Plane Web | `apps/control-plane-web` | React 19 + MUI + react-router. Sessions list, transcript, steering, config. |
| Shared | `libs/shared` | Zod schemas + enums shared FE/BE (session, event, message, status). |
| Runners | `runners/*` | One Docker image per harness: `opencode`, `claude-code`, `codex`, `pi`, `shell`. Each ships a `SOUL.md` + `start-agent`/`continue-agent`. |
| Landing | `apps/landing` | Public marketing site. |

Key API modules: `sessions` (lifecycle + reconciler), `events` (store, bus, SSE +
terminal routes), `runners` (spawn/exec via dockerode), `tasks`, `workflows`,
`scheduled-prompts`, `github`, `git`, `crypto` (secrets at rest), `auth`.

## 6. Runtime View — the core loop

1. `POST` task (repo + UI prompt or Linear ref) → row created, status `queued`.
2. Control plane spawns a runner container, injects secrets, clones the repo,
   checks out `task/<id>` → `provisioning` → `running`.
3. Runner's `start-agent` launches the configured harness against the prompt in a
   foreground TTY. Loop ≤3×: **work → validate → reflect**.
4. PTY output is captured as `output` events → stored (`seq` monotonic per session)
   → fanned out over SSE. A reconnecting browser replays from `Last-Event-ID`.
5. Interjection: `POST …/messages` → `inbound_messages` row → drained on the next
   loop step → emitted back as a `user_message` event.
6. Exit code signals completion → control plane pushes the branch, runs
   `gh pr create`, mirrors status/comment to Linear when `source=linear`.

Status: `queued → provisioning → running → (detached) → needs_assistance →
pushing → done | failed | stopped | max_iterations`.

## 7. Deployment View

`docker-compose.yml` on a single host:

- `postgres` (named volume) — all state.
- `control-plane` — API + web; mounts `/var/run/docker.sock`; builds/spawns runners.
- `tls-proxy` + `cert-init` — HTTPS termination.
- `runner-*` — prebuilt per-harness images the control plane spawns on demand.

## 8. Risks & Debt

- **Root-on-host blast radius** from the Docker socket mount — accepted for the
  single-team trust model; revisit before multi-tenant.
- **Control-plane restart orphans in-flight headless runs** (same class as the
  idle-detection caveat).
- **No real multi-tenant isolation** in v1 — sessions are labeled, not sandboxed.
