---
purpose: Architecture decision records — significant, hard-to-reverse design choices
type: shared
category: engineering
project: Sagewright
---

# Architecture Decision Records

Each record captures a decision, the context that forced it, and its consequences. Records are
append-only: supersede rather than rewrite.

---

## ADR-0001 — Harness-agnostic worker via the "remote box" model

- **Status:** Accepted
- **Date:** 2026-06-25

### Context

The agent harness (opencode) was hardwired into the worker in three places: `worker/Dockerfile`
installed `opencode-ai` and baked its config, and `worker/src/main.ts` constructed `OpencodeHarness`
and ran an opencode-specific orchestration loop. Swapping or configuring a harness meant editing
TypeScript in three spots, and the control plane was coupled to opencode's HTTP event shape.

We want the **worker Dockerfile to be the single place** a user installs and authenticates a harness
and configures its MCPs, skills, plugins, and alignment — and for the **control plane to stay a thin
infrastructure layer** that knows how to start *an* agent without knowing *which* one. The mental
model: the worker is a remote box you connect to and run any agent inside, as if over SSH; the agent
behaves exactly as if a human had connected and launched it.

### Decisions

1. **Worker = generic box; harness chosen and configured in `worker/Dockerfile`.** A single,
   clearly-commented "YOUR HARNESS" section is where you install the harness CLI, authenticate it
   against an LLM, and configure its MCPs, skills, plugins, and alignment. The default ships opencode.

2. **Predefined start-script contract.** The worker image exposes a known executable (the start
   script) whose only job is to launch the configured harness against the task prompt in the worktree
   working directory, as a foreground TTY process that exits when the agent is done. Swapping harness
   means editing the Dockerfile install lines plus this script — nothing else.

3. **Control plane is thin infrastructure: spawn + access + env-injection.** Its only worker-facing
   primitives are (a) spawn a worker container, (b) provide terminal/exec access into it, and
   (c) inject environment variables. Every higher-level behavior — running the start script, streaming
   it, forwarding interjections, detecting completion, pushing and opening the PR — is built on those
   three primitives. The control plane holds no harness-specific knowledge.

4. **Transport is a docker-exec PTY, not literal SSH.** The control plane and workers are always
   co-located on one host, so the `docker.sock` mount stays and "SSH" is the *experience* (attach to a
   box, run any agent in a real TTY), realized through the existing `docker exec -t` bridge. Only the
   browser loading the frontend is remote.

5. **One terminal channel, two drivers.** The same PTY into the worker is driven either by a human
   (interactive mode — browser WebSocket) or by the control plane (headless mode — automated). Both
   persist to the event store, which fans out over SSE to the UI.

6. **Headless transcript is a raw terminal recording.** It is rendered in xterm exactly like the
   interactive tabs; opencode's structured assistant/tool cards are retired. Every agent looks like an
   SSH session, regardless of harness.

7. **Completion is detected via the exec exit code**, which is reliable, rather than by parsing raw
   terminal output, which is not.

8. **The control plane owns git push and PR creation.** The start script only launches the harness;
   when it exits, the control plane pushes the branch and runs `gh pr create` via exec. The git flow
   stays uniform across all harnesses, so users only ever customize the harness, never the git plumbing.

### Consequences

- Bring any harness by editing only `worker/Dockerfile` and the start script; no control-plane or web
  changes are required.
- The worker's Node orchestration app and the `libs/harness` adapter are removed; push/PR logic moves
  into the control plane and the worker→control-plane HTTP callback (and its worker token) disappears.
- The structured-event transcript is replaced by a terminal recording. Headless interjections only
  land if the chosen harness reads stdin from its PTY.
- Headless runs are driven from within the control-plane process; a control-plane restart orphans an
  in-flight run (the same class of limitation as the existing idle-detection caveat).
