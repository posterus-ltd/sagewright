# Crosscutting Concepts

The load-bearing ideas that recur across the system. Kept short on purpose.

## Resumable event log

Nothing an agent emits is a raw socket. Every output is an **event row**
(`events(id, session_id, seq, type, payload, created_at)`) with a per-session
monotonic `seq`. The browser reads via SSE: on connect it replays `seq >
Last-Event-ID`, then tails a per-session in-memory pub/sub (`event-bus`, with a
DB-poll fallback). A dropped mobile connection reconnects and replays with **no
gaps or duplicates**. This is the feature to protect above all others.

Event types: `output` (raw PTY — the headless transcript), `log`, `status`,
`user_message`, `error`, `pr_opened`. `tool`/`assistant` are legacy — kept only so
historical rows still parse.

## Harness-agnostic "remote box"

A runner is a generic box you connect to and run *any* agent inside, as if over
SSH. The control plane knows how to start *an* agent, never *which* one. A harness
is added as a folder under `runners/<id>/` containing a `Dockerfile`, a `SOUL.md`
(alignment/personality), and two scripts:

- `start-agent` — launch the harness against the task prompt, foreground TTY.
- `continue-agent` — resume/steer an existing session.

Transport is a `docker exec -t` PTY (not literal SSH — control plane and runners
share a host). One PTY channel, two drivers: a **human** (browser WebSocket,
interactive) or the **control plane** (headless, automated). Both persist to the
event store.

## Work → validate → reflect

Each runner self-corrects: it does the work, runs the repo's `validateCmds`, and
reflects on failures — up to **3 iterations**, then stops at `needs_assistance`
(or `max_iterations` for a workflow parent that shipped but never went green).

## Steering (interjection)

Messages are never pushed into the agent mid-token. `POST …/messages` writes an
`inbound_messages` row; the runner drains pending messages on its next loop step,
marks them consumed, and echoes a `user_message` event into the log so the
transcript stays complete.

## Secrets & trust

The control plane owns all privileged surface — Docker socket, Postgres, GitHub
and Linear credentials. Secrets are **encrypted at rest** (`crypto` module, key
from env) and injected into runners as env vars at spawn. Runners never see the
Linear key; the control plane does the mirroring. Single login; user identity is a
label, not an isolation boundary. See [`adr.md`](./adr.md) and
`../../alignment/VISION.md` (Trust Model).

## Ownership of git & PR

The runner only launches the harness. When it exits, the **control plane** pushes
the branch and runs `gh pr create`. Git plumbing stays uniform across all
harnesses, so users customize the agent, never the git flow.

## Completion detection

Determined by the exec **exit code**, which is reliable — never by parsing
terminal output, which is not.

## Shared contracts

FE and BE share one source of truth in `libs/shared`: Zod schemas + enums for
sessions, events, messages, and status. Validation happens at the boundary; types
flow from the schemas.

## Frontend conventions

React 19 + MUI + react-router + `@tanstack/react-query`; `notistack` for toasts;
`react-i18next` for i18n; `@xyflow/react` for the meta/workflow graph. Transcript
is rendered in xterm — every agent looks like an SSH session regardless of harness.
