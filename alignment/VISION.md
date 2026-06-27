---
purpose: Roadmap context, user personas, goals, and success metrics
type: shared
category: project
project: Agentic
---

# Product Vision

## The Pitch

Run multiple coding agents at once without juggling terminals. The control plane
is hosted in the browser and reached over the network, so it works on mobile,
tablet, and desktop with full session persistence — start a task on your phone,
watch it run, reconnect after a dropped connection without losing any output.

## The Name

**Sagewright** (`sagewright.dev`) is a coined compound: *sage* — a wise or
prudent person — joined with *-wright*, the archaic suffix for a craftsman or
builder (as in "playwright" or "shipwright"). Together it reads as a *craftsman
of wisdom* or *builder of knowledge*.

The name is the product in one word: every agent we spawn is a sagewright — it
reasons (the sage) and it builds (the wright), looping work → validate → reflect
until it ships. The control plane is the workshop where the fleet of sagewrights
is dispatched and watched.

## The Core Loop

> Open the browser on your phone → describe a task for a repo → a container
> spawns → the agent **works → validates → reflects** (≤3 iterations) → it pushes
> a branch and opens a PR via `gh` → you watch live, can interject anytime, and
> reconnect after a dropped connection without losing any output.

If only this works reliably, it is already a product. Everything else is a layer
on top.

## Personas

- **The dev running many agents at once** — wants to fan out routine work
  (features, refactors, test fixes) across repos without babysitting terminals,
  and to drive it all from whatever device is at hand.
- **The team lead / reviewer** — receives finished work as GitHub PRs and Linear
  ticket updates; review happens in the tools the team already uses, not in a
  bespoke in-app diff viewer.

## Goals

- **Many agents, one control plane.** Spawn a fresh worker container per task on
  demand; the control plane owns all privileged surface (Docker socket, Postgres,
  secrets) so credentials never spread to workers.
- **Mobile-first, resumable.** Everything an agent emits is a persisted event
  log, never a raw socket — a dropped connection replays from the last seen event
  with no gaps or duplicates.
- **Steerable agents.** Watch a session live and interject at any time; messages
  are picked up on the agent's next loop step.
- **Two ways in.** Create a task from a UI chat prompt or from a Linear ticket;
  on completion, status and comments mirror back to Linear.
- **Self-correcting work.** Each worker loops work → validate → reflect up to 3
  times before asking a human for assistance.
- **Harness-agnostic.** Implement `opencode` first behind a `Harness` interface,
  so swapping in the Claude Agent SDK later is a contained change.

## V1 Scope

**In:** repo + secret config · create task (UI prompt or Linear ticket) · spawn
worker · work/validate/reflect ×3 · live resumable streaming · interject
messages · push branch + open PR · my-sessions list + detail · persisted logs for
auditing.

**Deferred:** scheduling / recurring tasks · file upload to a session ·
all-users and scheduled tabs · multi-repo per task · real multi-tenant isolation ·
in-app diff / merge.

## Trust Model

Single trusted team on one Docker host. Shared secrets, single login; user
identity is a label on sessions rather than an isolation boundary. Secrets are
encrypted at rest. Only the control plane mounts the Docker socket — the
root-on-host blast radius is accepted and documented.

## Success Metrics

- **Reliability of the core loop** — a task created on mobile produces a PR on
  GitHub with the transcript streamed live and an interjection visibly changing
  the agent's next step.
- **Resumability** — kill a connection mid-task, reconnect, and the transcript is
  identical with no lost output.
- **End-to-end Linear flow** — a Linear ticket becomes a task, opens a PR, and
  moves the ticket to In Review with a comment.
- **Autonomy** — share of tasks completed within the 3-iteration loop without
  reaching `needs_assistance`.
