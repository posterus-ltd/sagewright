---
purpose: Roadmap context, user personas, goals, and success metrics
type: shared
category: project
project: Agentic
---

# Product Vision

## The Problem

- **Uneven adoption.** Agents already run across the team, but every setup is
  bespoke and un-shared — results vary wildly and nobody learns from anybody
  else's config.
- **No org-wide control.** Nothing is centrally configured, monitored, or
  governed; usage is invisible above the individual developer.
- **Vendor lock-in.** Workflows get welded to one provider's CLI and model,
  leaving the org hostage to someone else's roadmap and pricing.
- **Tethered to a laptop.** Agents run locally, so the machine has to stay
  awake — sleep or a closed lid kills the session. "Let it run overnight"
  isn't real.
- **No home for repetitive work.** The tasks agents suit best — recurring,
  mechanical ones — have no reliable way to run on a schedule and just report
  back.

## The Pitch

Run multiple coding agents at once without juggling terminals, from a
browser-hosted control plane the org owns. Reachable over the network on
mobile, tablet, or desktop, with full session persistence — start a task on
your phone, watch it run, reconnect after a dropped connection without losing
output.

The strategic bet: capability and context should accumulate as an
organizational asset, not scatter across individual laptops and vendor CLIs.
Sagewright is model- and provider-agnostic by design — it draws on
best-available intelligence on demand, while the org stays sovereign over its
own agent workflows, data, and history.

## The Name

**Sagewright** (`sagewright.dev`) is a coined compound: *sage* — a wise or
prudent person — joined with *-wright*, the archaic suffix for a craftsman (as
in "playwright" or "shipwright"). Together: *craftsman of wisdom*, *builder of
knowledge*.

Every agent we spawn is a sagewright — it reasons (the sage) and builds (the
wright), looping work → validate → reflect until it ships. The control plane
is the workshop where the fleet is dispatched and watched.

## The Core Loop

> Open the browser on your phone → describe a task for a repo → a container
> spawns → the agent **works → validates → reflects** (≤3 iterations) → it pushes
> a branch and opens a PR via `gh` → you watch live, can interject anytime, and
> reconnect after a dropped connection without losing any output.

If only this works reliably, it is already a product. Everything else is a
layer on top.

## Personas

- **The dev running many agents at once** — wants to fan out routine work
  (features, refactors, test fixes) across repos without babysitting
  terminals, from whatever device is at hand.
- **The team lead / reviewer** — receives finished work as GitHub PRs and
  Linear ticket updates; review happens in the tools the team already uses,
  not a bespoke in-app diff viewer.

## Goals

- **Many agents, one control plane.** Spawn a fresh runner container per task
  on demand; the control plane owns all privileged surface (Docker socket,
  Postgres, secrets) so credentials never spread to runners.
- **Mobile-first, resumable.** Everything an agent emits is a persisted event
  log, never a raw socket — a dropped connection replays from the last seen
  event with no gaps or duplicates.
- **Steerable agents.** Watch a session live and interject at any time;
  messages are picked up on the agent's next loop step.
- **Two ways in.** Create a task from a UI chat prompt or a Linear ticket; on
  completion, status and comments mirror back to Linear.
- **Self-correcting work.** Each runner loops work → validate → reflect up to
  3 times before asking a human for assistance.
- **Harness-agnostic.** Implement `opencode` first behind a `Harness`
  interface, so swapping models or providers later is a contained change, not
  a rewrite.

## V1 Scope

**In:** repo + secret config · create task (UI prompt or Linear ticket) ·
spawn runner · work/validate/reflect ×3 · live resumable streaming · interject
messages · push branch + open PR · my-sessions list + detail · persisted logs
for auditing.

**Deferred:** scheduling / recurring tasks · file upload to a session ·
all-users and scheduled tabs · multi-repo per task · real multi-tenant
isolation · in-app diff / merge.

## Trust Model

Single trusted team on one Docker host. Shared secrets, single login; user
identity is a label on sessions rather than an isolation boundary. Secrets are
encrypted at rest. Only the control plane mounts the Docker socket — the
root-on-host blast radius is accepted and documented.

## Success Metrics

- **Reliability of the core loop** — a task created on mobile produces a PR on
  GitHub with the transcript streamed live and an interjection visibly
  changing the agent's next step.
- **Resumability** — kill a connection mid-task, reconnect, and the transcript
  is identical with no lost output.
- **End-to-end Linear flow** — a Linear ticket becomes a task, opens a PR, and
  moves the ticket to In Review with a comment.
- **Autonomy** — share of tasks completed within the 3-iteration loop without
  reaching `needs_assistance`.
