# Architecture Decisions

Significant, hard-to-reverse choices. Records are **append-only**: supersede rather
than rewrite. The canonical, fuller record lives in
[`../../alignment/ARD.md`](../../alignment/ARD.md); this is the light index.

| # | Decision | Status |
|---|---|---|
| 0001 | Harness-agnostic runner via the "remote box" model | Accepted |
| 0002 | Everything is a persisted event log (resumable streaming) | Accepted |
| 0003 | Control plane owns all privileged surface | Accepted |
| 0004 | Single-team trust model on one Docker host | Accepted |

---

## ADR-0001 — Harness-agnostic runner ("remote box")

**Context.** The harness (opencode) was hardwired into the runner in three places,
so swapping agents meant editing TypeScript and coupled the control plane to one
agent's event shape.

**Decision.** The runner is a generic box; the harness is chosen and configured in
`runners/<id>/` (Dockerfile + `SOUL.md` + `start-agent`/`continue-agent`). The
control plane exposes only three primitives — **spawn, exec (PTY), inject env** —
and holds no harness-specific knowledge. Completion via exit code; git push + PR by
the control plane. Full rationale: `alignment/ARD.md#adr-0001`.

**Consequences.** Add a harness by adding a folder, not by changing code. The
structured-event transcript becomes a raw terminal recording rendered in xterm.
A control-plane restart orphans an in-flight headless run.

## ADR-0002 — Everything is a persisted event log

**Context.** Mobile connections drop; a raw socket loses output on reconnect.

**Decision.** Persist every emission as an event row with a per-session monotonic
`seq`. Stream over SSE with replay-from-offset then tail. See
[`concepts.md`](./concepts.md#resumable-event-log).

**Consequences.** Resumability is a first-class, testable property. Slightly more
write traffic and a store/bus to maintain; worth it — this is the product's spine.

## ADR-0003 — Control plane owns all privileged surface

**Context.** Secrets must not spread to disposable runner containers.

**Decision.** Docker socket, Postgres, and all credentials live only in the control
plane. Secrets are encrypted at rest and injected as env at spawn; runners never
hold the Linear key.

**Consequences.** One hardened surface to protect. The control plane is a single
point of failure and the sole holder of the Docker-socket blast radius.

## ADR-0004 — Single-team trust model, one Docker host

**Context.** V1 targets one trusted team, not multi-tenant SaaS.

**Decision.** Shared secrets, single login; user identity is a label on sessions,
not an isolation boundary. Only the control plane mounts the Docker socket; the
root-on-host blast radius is accepted and documented.

**Consequences.** Simple and fast to ship. Real multi-tenant isolation is
explicitly deferred and must be revisited before opening beyond one team.

---

*New decisions: append the next `ADR-000N` here and add a row to the table. Prefer
superseding an old record over editing it.*
