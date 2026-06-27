# Interactive terminal sessions — design

Date: 2026-06-24
Status: Draft for review

## Context

A "session" is a task that runs in a Docker worker container. Today the worker is a one-shot
batch job: clone → run a headless opencode loop that streams events over SSE → validate → push
→ open PR → exit. The frontend renders those events as a JSON transcript and offers a text box
to message the agent.

Two problems surfaced while validating this against a running environment:

1. **The agent's work is neither captured nor used.** A live probe proved opencode itself works:
   given the baked-in `OPENAI_API_KEY`, a `POST /session/:id/message` with no model specified
   runs `openai/gpt-5.3-chat-latest`, performs the task (created a file), and returns the full
   result **synchronously in the HTTP response**. But the harness (`opencode-client.ts`) discards
   that response, and the `/event` SSE stream it relies on (`subscribe`/`drainUntilIdle`/`isIdle`)
   delivered only `server.connected` — no run events. Net: zero assistant/tool events captured
   (matches the empty transcript of the failing task), and with empty `validateCmds`,
   `runValidate` returns `{ok:true}` immediately, so the loop hits `DONE` on the first pass having
   observed nothing.
2. **`SOUL.md` is committed into the user's repo.** `writeSoul` writes it *inside* the worktree
   and `pushBranch` runs `git add -A && git commit`, so even when the agent changes nothing there
   is always one file to commit → "a PR containing only SOUL.md," and the container exits in ~30s.

The event-by-event architecture is the flaw. For an interactive session the **terminal is the
interface**: the harness runs in the container and the browser renders a real interactive terminal
attached to it. No event normalization, no SSE transcript, no message draining.

## Goal

Connecting to a session in the web app opens an interactive terminal, rendered in the browser,
attached to the harness running in the remote container — two tabs: **Agent** (opencode TUI) and
**Shell** (bash). Sessions are long-lived and restorable.

## Topology (remote)

Containers run on the remote host alongside the control-plane (docker socket + `sage` network).
The browser only ever talks to the control-plane's public URL.

```
browser ──HTTPS/WSS, logged in──▶ control-plane (remote host)
                                     │ requireUser (vm_session cookie)
                                     │ resolve task → containerId → container IP
                                     ▼
                          reverse-proxy HTTP+WS ──sage net──▶ worker container
                                                                ttyd opencode  (Agent)
                                                                ttyd bash      (Shell)
```

## Components

### Terminal transport — xterm + `docker exec` (implemented)

Chosen over ttyd-in-a-proxy because it renders **natively in the React UI** (no iframe), needs
**no per-container dynamic WebSocket reverse-proxy**, and behaves identically local or remote —
the browser only ever talks to the control-plane.

- Backend: a single WebSocket route `GET /api/tasks/:id/terminal?kind=shell|agent`
  (`events/terminal-route.ts`), guarded by `preHandler: app.requireUser`, registered inside a
  child context after `@fastify/websocket` (so the plugin's `onRoute` hook is active). It resolves
  `tasks.containerId`, opens a `docker exec({Tty:true})` PTY in `/workspace` via a shared dockerode
  client (`tasks/docker-client.ts`), and bridges bytes: client→server binary frames are keystrokes
  (written to the PTY), text frames are JSON `{type:'resize'}` control messages; server→client PTY
  bytes are forwarded as binary. The target container comes solely from the task row.
- Frontend: `tasks/Terminal.tsx` — `@xterm/xterm` + `@xterm/addon-fit`, opens the WebSocket,
  writes PTY bytes to xterm, sends keystrokes as binary and resize as a JSON text frame.
- Commands: Agent → `opencode --continue`, Shell → `bash` (both in `/workspace`).

### Control-plane — lifecycle (TTL/dismiss: deferred)

`Cancel` already retires the container (`taskService.cancel` → `spawner.retire`). The 12h TTL and
automatic reaping of idle interactive sessions are **not yet implemented** (see deferred items).

### Frontend — embedded terminal

The task detail page embeds the proxied ttyd terminal with MUI tabs **Agent | Shell**. Replaces
the JSON transcript box. The terminal is same-origin (served through the control-plane proxy), so
the `vm_session` cookie authorizes the WS upgrade automatically.

### Worker — interactive vs headless

- **Interactive** (started from the UI with a prompt): launch `ttyd` running the harness; the
  process stays alive until dismissed or the 12h TTL — it does not self-exit on "completion."
- **Headless** (Linear ticket / scheduled recurring): run `opencode run "<prompt>"` (opencode's
  non-interactive CLI) to completion, then validate → push → PR → expire on success. No event
  streaming.

### Session persistence & restore

Snapshot opencode's own session state (its session storage / sqlite db under
`~/.local/share/opencode`) to durable storage per task. Restore rehydrates it into a fresh
container so `opencode` resumes the exact session with full context — works even after the
container has expired. The harness `resume(id)` is reworked around this (currently a throwing
stub).

## Lifecycle rules

| Task kind             | While running        | On success            | Restore |
|-----------------------|----------------------|-----------------------|---------|
| Interactive (UI)      | stays alive          | stays alive until dismissed or 12h TTL | yes, from snapshot |
| Linear / scheduled    | runs headless        | push/PR, then expire  | yes, from snapshot |

## What is removed

`libs/harness/src/opencode/normalize.ts`; the `/event` `subscribe` + `drainUntilIdle` + `isIdle`
event machinery; the SSE event transcript on the task page; `SOUL.md` written into the worktree.

## Bug fixes folded in

- Write `SOUL.md` to a path **outside** the cloned worktree (or otherwise exclude it) so it is
  never committed.
- Remove the broken event loop; headless tasks rely on `opencode run`'s own completion.

## Status

**Implemented & verified end-to-end (this slice):** the WebSocket terminal route + bridge,
shared dockerode exec client, xterm frontend with Agent|Shell|Log tabs, interactive worker mode
(`source==='ui'` → clone into `/workspace`, seed an opencode session, stay alive), `SESSION_MODE`
derivation in the spawner, and the `SOUL.md`-out-of-worktree fix. Verified live: a UI task's
container stays alive past 70s, `kind=shell` runs commands in `/workspace`, `kind=agent` launches
the opencode TUI, and no `SOUL.md` lands in the repo. Unit + live-WS integration tests cover the
route, bridge, spawner mode, and `cmdForKind`.

**Deferred (follow-on slices):** 12h TTL + idle reaping; opencode session-state snapshot &
restore; reworking the headless (Linear/scheduled) path onto `opencode run` and removing the dead
event-streaming machinery (`normalize.ts`, `/event` subscribe loop); persisting `tasks.kind`/
`expiresAt` in the data model; surfacing dismiss/restore in the UI.

## Open items to settle during planning

- ttyd auth/handshake through the proxy (ttyd's own writable flag `-W`; whether to use ttyd's
  client cert/basic-auth in addition to the cookie gate, or rely solely on the proxy gate).
- Exact durable store for opencode session snapshots (volume vs object storage) and snapshot
  cadence (on dismiss/expiry vs periodic).
- Data-model changes: `tasks.kind`, `tasks.expiresAt`/TTL, snapshot reference; migration.
- How "dismiss" and "restore" surface in the UI and API.
- Headless `opencode run` output capture for the transcript/history of ticket/scheduled tasks.
```
