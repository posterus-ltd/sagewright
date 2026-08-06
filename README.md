# Sagewright

Run your favorite agent harnesses — Claude Code, Codex, opencode, Aider, or your own — **remotely
and at scale**. Sagewright is a control plane that spawns a fresh, isolated container per agent
session, so you can run **one agent or a hundred in parallel** from any browser. Give it a repo and
a task; it spins up a runner, streams the agent's live transcript, lets you interject mid-run, and
opens a PR on GitHub when it's done.

You control the whole execution surface:

- **Execution environment** — each agent runs in a throwaway Docker container you define (the
  **runner image**): its OS, tooling, and resource limits are yours to set.
- **Context** — bake your org's harness config, system prompt / alignment (`SOUL.md`), MCP servers,
  and skills into that image, so every session starts already aligned.
- **Agent access control** — a runner only sees the repos, files, and secrets you mount into its
  sandbox; nothing else on the host is reachable.
- **Accessibility** — the control plane lives on remote infra and is reachable from any device.
  Start a run on your phone, close your laptop, and reconnect to the live transcript later.

**Scale is the point.** A fresh runner spawns per task, so fanning routine work out across repos —
or running the same task a hundred ways in parallel — is just launching more sessions. Nothing runs
on your machine, and nothing is left open.

It ships with an [opencode](https://opencode.ai) harness, but the runner is just a box you connect
to: the control plane spawns it, runs a predefined start script over a terminal (`docker exec`),
streams that terminal back as the live transcript, and opens the PR when the run finishes. The
harness is whatever you install and configure in the **runner image** — swap it by editing one
block of `runners/opencode/Dockerfile` (see [Use a different harness](#use-a-different-harness)). And because
opencode supports every major provider, you can drive sessions with **any inference model** —
OpenAI, Anthropic, Google, local models via Ollama, or anything else opencode reaches (see
[Use a different model](#use-a-different-model)).

<table>
  <tr>
    <td width="50%"><img src="./screenshots/harness.png" alt="Remote execution — live harness for interactive sessions" width="100%"></td>
    <td width="50%"><img src="./screenshots/canvas.png" alt="Canvas — run several sessions in parallel" width="100%"></td>
  </tr>
  <tr>
    <td width="50%"><img src="./screenshots/work-galaxy.png" alt="Galaxy — visualise your agents work" width="100%"></td>
    <td width="50%"><img src="./screenshots/workflows.png" alt="Build workflow loops — create and schedule workflow runs built from different roles" width="100%"></td>
  </tr>
</table>

---

> [!CAUTION]
> ## 🚨 SECURITY WARNING — DO NOT EXPOSE THIS TO THE PUBLIC INTERNET 🚨
>
> Sagewright now has **real per-user authentication**: a seeded **`root`** account (initial password
> from `ROOT_PASSWORD`), **per-user credentials** with salted **scrypt** password hashes, **roles**
> (`root` / `admin` / `user`), a **forced password change** on first login and after any admin reset,
> and an **admin-only User Management** panel to create users, reset passwords, promote/demote, and
> delete. Logging in no longer auto-creates accounts — only users an admin provisions can sign in.
>
> **This is still not a hardened, internet-facing service.** Combined with the
> [Docker socket mount](#architecture-note-the-docker-socket-mount) — which grants the control plane
> **root-equivalent control over the host** — any account that reaches the app has a large blast
> radius, so a compromised or weak credential is a serious risk. There is no MFA, no rate limiting,
> no account lockout, and no audit log.
>
> **You MUST run Sagewright only on a trusted private network — behind a VPN or on an internal LAN
> that is not reachable from the internet.** Treat it as a **single-user / trusted-team local tool**,
> not a multi-tenant hosted service. **Never** bind it to a public IP, port-forward it, or place it
> behind a plain public reverse proxy. Choose a strong `ROOT_PASSWORD`, change it on first login, and
> give each teammate their own account.

---

## How it works

Sagewright is **one control plane that spawns a fresh, throwaway container per agent session**.
You talk to it from the browser; it talks to Docker, to your model provider, and to GitHub on your
behalf. The control plane serves the web app, holds the host's Docker socket, and streams every
runner's terminal back to you live.

```mermaid
flowchart LR
    user["User's browser<br/>PWA · localhost:3001"]

    subgraph host["Docker host — single box"]
        direction TB
        subgraph cp["control-plane container"]
            web["control-plane-web<br/>React SPA"]
            api["control-plane-api<br/>Fastify · auth · REST · SSE"]
        end
        pg[("PostgreSQL<br/>pgdata volume")]
        sock{{"/var/run/docker.sock"}}
        subgraph pool["Runners — one container per session"]
            direction LR
            rA["sagewright-runner A<br/>harness + baked role"]
            rB["sagewright-runner B<br/>harness + baked role"]
        end
    end

    gh["GitHub"]
    model["Model provider<br/>OpenAI · Anthropic · Ollama · …"]

    user -->|"load SPA + REST calls"| api
    web -->|"served to the browser"| user
    api -->|"live transcript · resumable SSE"| user
    api <-->|"sessions · events · settings"| pg
    api -->|"spawn / stop containers"| sock
    sock -.->|"controls"| pool
    api -->|"docker exec PTY · run start-agent ·<br/>stream terminal · stdin interjections"| rA
    api -->|"docker exec PTY"| rB
    api -->|"clone repos → shared volume"| gh
    rA -->|"push branch + open PR"| gh
    rA -->|"inference"| model
    rB -->|"inference"| model
```

- **Control plane** — a single long-lived container running the Fastify API (auth, REST, resumable
  SSE) and serving the React SPA. It owns Postgres for all state and mounts the host's Docker socket
  so it can spawn runners on demand.
- **Runners** — one `sagewright-runner` container per active session. Each bakes in a harness
  (opencode by default) plus your org's config; the control plane execs `start-agent` over a PTY,
  streams that terminal back as the live transcript, and opens a PR when the script exits.
- **You** — open the web app the control plane hosts on `:3001`, create a task, watch the transcript
  stream live, and interject mid-run (interjections are written straight to the agent's stdin).

---

## Prerequisites

You need these installed and working before you start. Each line has a quick command to check it.

| Requirement             | Why                                                                  | Check                                                                                           |
| ----------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| **Docker** + Compose v2 | Runs the whole stack and spawns agent runners                        | `docker compose version`                                                                        |
| **Node.js 22+**         | Local builds, tests, and helper scripts                              | `node --version`                                                                                |
| **A GitHub token**      | Lets runners clone repos, push branches, and open PRs                | [Create one →](https://github.com/settings/tokens) (scope: `repo`)                              |
| **A model API key**     | The agent's inference provider — without one the runner does nothing | OpenAI is the default ([get a key →](https://platform.openai.com/api-keys)); any provider works |

> No Docker experience? You only need to run the handful of `docker compose` commands below —
> you don't have to understand Docker internals to get this running.

---

## Setup

### 1. Create your config file

```bash
cp .env.example .env
```

Open `.env` and fill in the five values you must set. Leave everything else at its default.

```env
# Initial password for the seeded `root` account. You log in as `root` with this the
# first time and are then forced to change it — pick anything you'll remember for now.
ROOT_PASSWORD=changeme

# Two random secrets, each EXACTLY 32 characters long.
SESSION_SECRET=change-this-32-byte-secret-value!!
SECRETS_KEY=change-this-32-char-secrets-key!!

# Your GitHub token and model API key from the table above. OPENAI_API_KEY is the
# default; to use a different provider/model see "Use a different model" below.
# This kind of env vars can be set on per user base in the frontend
OPENAI_API_KEY=
```

> **Tip:** generate a 32-character secret with `openssl rand -base64 24 | cut -c1-32`.

### 2. Build the agent runner image

This bakes your `GITHUB_TOKEN` and `OPENAI_API_KEY` into a Docker image the agents run inside.
Re-run this whenever you change those tokens.

```bash
docker compose --profile build build
```

> **Tip:** `scripts/build-runners.sh` is a convenience wrapper for this — see
> [Rebuilding the runner images](#rebuilding-the-runner-images).

### 3. Start everything

```bash
docker compose up --build -d
```

Or use the convenience start script for your OS, which runs the same command:

```bash
./start.sh     # Linux / macOS
start.bat      # Windows
```

That's it. This launches PostgreSQL and the control plane on port 3001.

To wipe the database on startup, pass `--reset` (**destructive — all data is lost**). It applies
only to that run; a normal start afterwards keeps your data:

```bash
./start.sh --reset     # Linux / macOS
start.bat --reset      # Windows
```

### 4. Open the app

Go to **[http://localhost:3001](http://localhost:3001)** and log in as **`root`** with the
`ROOT_PASSWORD` you set. You'll be prompted to **choose a new password** before the app opens — this
forced change happens on first login and after any admin reset. Then:

1. **Add your repos** — open **Settings** and list your HTTPS repo URLs (one per line, e.g.
   `https://github.com/owner/repo`, not SSH syntax like `git@github.com:owner/repo.git`). They're
   yours alone; see [Global defaults vs per-user settings](#global-defaults-vs-per-user-settings).
2. **(Optional) Set a personal `.env`** — under **Settings → Environment**, override the org
   defaults for your sessions (e.g. your own `GITHUB_TOKEN`).
3. **(Optional) Add teammates** — as `root` (or an admin), open **Settings → User Management** to
   create accounts. Each gets a one-time password, shown once, that you share out-of-band; they're
   forced to change it on first login. Promote a teammate to **admin** to let them manage users too.
4. **Create a task** — describe what you want; the transcript streams live as the agent works.

### Stopping and restarting

```bash
docker compose down      # stop (your data persists in the pgdata volume)
docker compose up -d     # start again
```

### Installing as a PWA (optional HTTPS)

The control plane is installable as a PWA, but browsers only treat plain HTTP as a secure context
on `localhost` — if you reach it via a LAN IP or hostname instead (e.g. to install it on your
phone), they won't offer the install prompt over HTTP. An optional `https` compose profile adds a
[Traefik](https://traefik.io) sidecar that generates a self-signed certificate and terminates
HTTPS in front of the control plane. It's entirely decoupled from the app itself — skip it if your
deployment already terminates TLS some other way (a real reverse proxy, a cloud load balancer, …).

```bash
docker compose --profile https up -d
```

Open **https://\<host\>:8443** (override the port with `HTTPS_PORT` in `.env`) and accept the
browser's "not private" warning — expected, since the cert is self-signed rather than CA-issued.
The install prompt becomes available once you do. The generated cert/key live in
`./traefik/certs/`; delete them to force regeneration.

---

## Advanced: customizing the runner image

Everything an agent can see and do lives inside the **runner image** (`runners/opencode/Dockerfile`). It has
one clearly-marked **`YOUR HARNESS`** block — the single place you install and authenticate your
harness, configure its MCP servers / skills / plugins / alignment, and point the start script at it.
The control plane is harness-agnostic: it only knows to run `start-agent` and stream the result. Bake
in your organization's defaults here, then rebuild with `docker compose --profile build build`.

Each active session runs in its own `sagewright-runner` container spawned by the control plane
alongside the long-lived `control-plane` and `postgres` services — `docker ps` shows them all:

![docker ps — control plane, spawned runners, and postgres](./screenshots/docker-ps.png)

### Rebuilding the runner images

Runner images bake the host `.env` auth tokens in as build args, so you must rebuild after
**any** of: rotating a token in `.env`, editing a runner `Dockerfile`, or changing a harness
config (e.g. `opencode.config.json`, `SOUL.md`). The images sit behind the `build` compose
profile because the control plane spawns them on demand — so `docker compose up --build` alone
**skips** them, and you must build them explicitly.

```bash
scripts/build-runners.sh                 # rebuild every runner image
scripts/build-runners.sh --no-cache      # force-rebuild (re-bake stale/rotated tokens)
scripts/build-runners.sh runner-opencode # rebuild a single runner image
```

The script is a thin wrapper around `docker compose --profile build build` that runs from the
repo root and passes its arguments straight through. Use `--no-cache` when you've only changed a
token: Docker caches the `ARG`/`ENV` layers, so a plain rebuild can keep an old key baked in.

> Rebuilding only affects **new** sessions. Already-running runner containers keep the image they
> were spawned from until they're replaced.

### Override the opencode config (models & MCP servers)

The runner bakes a global opencode config into every session. Edit
[`runners/opencode/opencode.config.json`](./runners/opencode/opencode.config.json)
to change the default model, add providers, or register MCP servers org-wide:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    // Register your own MCP servers here — they appear in every agent session.
    // Secrets are injected at runtime via {env:VAR} placeholders:
    "example": {
      "type": "local",
      "command": ["npx", "-y", "@your-org/mcp-example"],
      "environment": { "EXAMPLE_API_KEY": "{env:EXAMPLE_API_KEY}" },
      "enabled": true,
    },
  },
}
```

The Dockerfile copies this to `/root/.config/opencode/opencode.json` so it applies globally. Secrets
are injected at runtime via `{env:VAR}` placeholders (never hard-code them in this file).

### Use a different model

You are **not tied to OpenAI**. opencode supports every major provider — Anthropic, Google,
OpenRouter, Groq, local models via Ollama, and more. To switch providers:

1. Set the provider's credentials in `.env` (e.g. `ANTHROPIC_API_KEY=…` instead of, or alongside,
   `OPENAI_API_KEY`) and forward them into the runner image as a build arg in
   [`runners/opencode/Dockerfile`](./runners/opencode/Dockerfile) (see how `OPENAI_API_KEY` is wired up).
2. Pin the default model in the opencode config above, e.g.:

   ```jsonc
   {
     "$schema": "https://opencode.ai/config.json",
     "model": "anthropic/claude-sonnet-4-6", // provider/model — any opencode-supported id
   }
   ```

opencode auto-detects a provider from whichever API key is present and picks a sensible default
model, so for common providers just supplying the key is enough. See the
[opencode models docs](https://opencode.ai/docs/models) for the full list and id format.

### Use a different harness

opencode is just the default. The control plane never hardcodes a harness — it spawns the runner
box, runs the predefined start script ([`runners/opencode/start-agent`](./runners/opencode/start-agent)) over a terminal,
streams that terminal as the transcript, and runs git push + PR when the script exits. **Any agent
CLI** that runs in a terminal (Claude Code, Aider, a custom runner, etc.) works.

To swap it in, edit only the **`YOUR HARNESS`** block of [`runners/opencode/Dockerfile`](./runners/opencode/Dockerfile)
and the start script — nothing outside the image changes:

1. Replace the install step (`npm install -g opencode-ai`) with your harness's install + auth.
2. Update [`runners/opencode/start-agent`](./runners/opencode/start-agent) to launch your harness against `"$PROMPT"` in
   the current directory, in the foreground, exiting when done (its exit code decides DONE/FAILED).
3. Rebuild: `docker compose --profile build build`.

The transcript is the agent's raw terminal output, so a chatty CLI gives a rich transcript. Mid-run
interjections are written to the agent's stdin — they take effect only if your harness reads stdin.

Each runner's `Dockerfile` also sets `LABEL sagewright.runner.name="..."` — the label shown in the
New Session / Settings pickers. Shipped runners name it after the harness (`Codex`, `Pi`, `Opencode`,
`Claude Code`), but that's just a convention: the label is a free-form string, so you can just as
well name a runner after a role or persona instead — e.g. `Bob the CTO`, `Alice the Reviewer` — if
that reads better for your team. Keep the folder/`id`/image tag tied to the underlying harness so
the mapping stays traceable.

### Override the agent's system prompt / alignment ("soul")

The agent's base instructions live in [`runners/opencode/SOUL.md`](./runners/opencode/SOUL.md), baked into the image and
prepended to every task's prompt by `start-agent`. Edit it to set your org's engineering standards,
tone, or guardrails — or configure alignment through your harness's own config (e.g. opencode's
`instructions`) inside the `YOUR HARNESS` block.

### Bake in extra tooling or org configuration

To add CLIs, linters, language runtimes, or pre-seeded config files your agents should always have,
edit [`runners/opencode/Dockerfile`](./runners/opencode/Dockerfile):

```dockerfile
# Install extra tooling
RUN apt-get update && apt-get install -y ripgrep jq && rm -rf /var/lib/apt/lists/*

# Bake in an org-wide config file or credentials template
COPY my-org/.npmrc /root/.npmrc
COPY my-org/lint-rules.json /root/.config/my-tool/config.json
```

Anything you `COPY` or `RUN` here becomes part of the image, so every spawned runner starts with it
already in place. Rebuild the image after any change.

> **Security:** `GITHUB_TOKEN`, `NODE_AUTH_TOKEN`, and `OPENAI_API_KEY` are baked into the runner
> image as build args, so they're visible via `docker history`. Rotating a token means rebuilding
> the image. This is fine for a single-user local setup — **do not push the runner image to a shared
> registry** with real tokens baked in.

---

## Workflows & roles

A **runner image is a role.** Everything an agent _is_ — which harness and model it runs, its system
prompt and guardrails (`SOUL.md`), its MCP servers, skills, and baked-in tooling — is fixed in the
image under `runners/<id>/`. The image's `LABEL sagewright.runner.name` is how that role shows up in
the New Session / workflow pickers, so you can name it after a persona or job (`Alice the Reviewer`,
`Bob the CTO`) rather than the harness underneath. Picking a runner _is_ picking a role, with its
context and guardrails already baked in.

```mermaid
flowchart TB
    subgraph img["runners/&lt;id&gt;/  →  runner image = a role"]
        direction TB
        harness["Harness CLI<br/>opencode · Claude Code · Codex · Pi"]
        soul["SOUL.md<br/>system prompt · alignment · guardrails"]
        cfg["harness config<br/>default model · MCP servers · skills"]
        tools["baked tooling & org config<br/>CLIs · linters · .npmrc · templates"]
        secrets["build-arg tokens<br/>GITHUB_TOKEN · model API key"]
        label["LABEL sagewright.runner.name<br/>e.g. 'Alice the Reviewer'"]
    end

    harness --> role(["Configured role<br/>context + guardrails baked in"])
    soul --> role
    cfg --> role
    tools --> role
    secrets --> role
    label --> role
    role -->|"selected per session or per workflow step"| run["Runs a goal with its<br/>baked-in context + guardrails"]
```

Because each role carries its own context and guardrails, you can compose several of them into an
**automatable workflow loop**. A workflow is a JSON-configured sequence of steps (visualised like a
GitHub Actions graph); each step names a _goal_ and the _role_ (runner image) that should accomplish
it. A run drives the steps sequentially on **one shared worktree**, carries a `handoff.md` forward
between steps, and **loops on validation failure** until it passes or hits `maxIterations` — then
pushes the branch and opens a PR.

```mermaid
flowchart TB
    trig(["Trigger — manual Run or cron"]) --> seed["Seed input +<br/>one shared worktree on workflow/&lt;runId&gt;"]
    seed --> plan
    subgraph loopbox["Steps run sequentially · handoff.md carried forward"]
        direction TB
        plan["Plan · WORK<br/>role: Claude Code"] --> impl["Implement · WORK<br/>role: opencode"]
        impl --> val{"Validate · VALIDATION<br/>role: opencode"}
        val -->|"verdict passed = true<br/>AND every validateCommand exits 0"| pass(["pass"])
        val -->|"fail → jump to onFailureGoTo<br/>iteration + 1"| impl
    end
    pass --> done["Push branch + open PR<br/>status: done"]
    val -->|"iteration ≥ maxIterations"| capped["Push branch + open PR<br/>status: max_iterations"]
```

Steps come in two kinds:

- **Work steps** run a role against a goal and hand off to the next step in declared order.
- **Validation steps** _gate the loop_: they pass only when the agent writes a `passed: true`
  verdict **and** every `validateCommand` exits 0 in the worktree. On failure the run jumps back to
  the step named by `onFailureGoTo` for another iteration.

A run is just a `kind='workflow'` session whose steps are its children, so it streams and reconciles
like any other session. A passing run settles `done`; an exhausted loop still ships its work as
`max_iterations`; a hard step error is `failed`.

```mermaid
stateDiagram-v2
    [*] --> running: trigger (manual / cron)
    running --> running: work step advances to next
    running --> validating: reach a validation step
    validating --> done: verdict pass AND commands exit 0
    validating --> running: fail, jump to onFailureGoTo (iteration + 1)
    validating --> max_iterations: iteration reaches maxIterations
    running --> failed: step exits non-zero / hard error
    done --> [*]: push branch + open PR
    max_iterations --> [*]: push branch + open PR
    failed --> [*]
```

---

## Global defaults vs per-user settings

Two layers decide what a runner session can see and which repos it works on. **Global defaults**
come from the host `.env` and apply to everyone; **per-user settings** are managed by each user in
the web UI (**Settings**) and only affect that user's own sessions.

### Environment variables

**Rule of thumb:** configure **org-wide environment variables in the runner `Dockerfile`** (baked
into the image so every session, for every user, gets them); let each user add **personal overrides
in the control plane** (**Settings → Environment**), which apply only to their own sessions and take
effect at runtime with no rebuild.

| Layer                    | Where it's set                                          | Scope                     | When it applies                                 |
| ------------------------ | ------------------------------------------------------- | ------------------------- | ----------------------------------------------- |
| **Global / org default** | Host `.env`, baked into the runner image as a build arg | Every session, every user | Build time — rebuild the image to change it     |
| **Per-user override**    | **Settings → Environment** in the web UI                | Only that user's sessions | Runtime — takes effect next session, no rebuild |

To add a **global** variable, put it in `.env` and wire it into the runner image as an `ARG`/`ENV`
in the Dockerfile (see how `OPENAI_API_KEY` is forwarded in
[`runners/opencode/Dockerfile`](./runners/opencode/Dockerfile)), then rebuild with
`docker compose --profile build build`.

A **per-user** `.env` is entered in the web UI, stored **encrypted at rest** (aes-256-gcm, keyed by
`SECRETS_KEY`) and injected into that user's runner containers **at runtime**. It **overrides** the
image's baked defaults — e.g. a user can set their own `GITHUB_TOKEN` so commits and PRs are
attributed to them instead of the org token, with no rebuild. Operational keys the control plane
sets itself (`TASK_ID`, `PROMPT`, `SESSION_DIR`, …) are reserved and can't be overridden.

Precedence, lowest to highest: **image `ENV` (baked from `.env`) → per-user `.env` (Settings) →
control-plane operational vars**.

### Repositories

Repositories are **per-user**, configured in **Settings → Your repositories** (one HTTPS repo URL
per line, e.g. `https://github.com/owner/repo`, not SSH syntax like
`git@github.com:owner/repo.git`) — there is no global repo list in `.env`. Each user keeps their own
list; the control plane clones each repo onto the shared volume (deduplicated by slug, so two users
who add the same repo share a single clone) and gives every session a worktree per repo.

---

## Architecture note: the Docker socket mount

The control-plane container mounts the host's Docker socket so it can spawn runner containers:

```yaml
volumes:
  - /var/run/docker.sock:/var/run/docker.sock
```

**Blast radius:** anything with access to that socket can control _any_ container on the host —
effectively root. Acceptable for a single-user local MVP. For anything beyond that, mitigate with
rootless Docker, a [docker-socket-proxy](https://github.com/Tecnativa/docker-socket-proxy) limited to
the container APIs the spawner needs, and a dedicated `docker` group.

---

## Development

```bash
npx vitest run                    # run tests
npx nx build control-plane-api    # → apps/control-plane-api/dist/
npx nx build control-plane-web    # → dist/control-plane-web/
```

Run DB migrations manually:

```bash
DATABASE_URL=postgres://postgres:postgres@localhost:5432/sage \
  node apps/control-plane-api/dist/db/migrate.js
```

#### `DB_RESET` — destructive clean slate

`DB_RESET` is an opt-in switch on the migrate step. When truthy (`1`, `true`, or
`yes`, case-insensitive) it **drops and re-creates the entire `public` schema** before
applying migrations, so **all data is lost**. It is **off by default** and must be set
explicitly.

It exists for one situation: the migration history was squashed into a single `0000`
baseline, so a database that already ran the old numbered migrations conflicts (its
tables still exist and its `__drizzle_migrations` log no longer matches the journal,
making the fresh `CREATE TABLE`s fail). Set `DB_RESET` once to wipe such a database so
the squashed baseline applies cleanly, then leave it unset. It's also handy for
resetting a throwaway dev database.

> **Never** set `DB_RESET` against a database whose contents you need.

The compose stack forwards it from the host into the control-plane container
(`DB_RESET: ${DB_RESET:-}`), so you can run the migrate step with it for a one-time wipe:

```bash
# One-time wipe before bringing the stack up (clears pre-squash data).
DB_RESET=1 docker compose up --build -d
```

Or pass it directly to a manual migration run:

```bash
DB_RESET=1 DATABASE_URL=postgres://postgres:postgres@localhost:5432/sage \
  node apps/control-plane-api/dist/db/migrate.js
```

### Verification scripts

This proves the hardest system assumption and requires a live environment.

```bash
# SSE stream is resumable — reconnecting replays missed events with no gaps/dupes.
npx tsx --tsconfig tsconfig.base.json scripts/verify-sse-reconnect.ts <taskId> <cookie>
```

---

## Project structure

```
apps/
  control-plane-api/   Fastify API — routes, auth, DB, event streaming
  control-plane-web/   React SPA — task list, canvas, transcript viewer, settings
libs/
  shared/              Shared types (TaskStatus, EventType, etc.)
runners/               Per-runner agent boxes (runners/<name>/) — each a Dockerfile + start-agent + baked harness config
scripts/               Spike/verification scripts
```

The control plane drives a headless run from `apps/control-plane-api/src/tasks/agent-driver.ts`:
it execs `start-agent` over a PTY (`docker exec`), streams the terminal as `OUTPUT` events,
forwards interjections to stdin, and runs `git-pr.ts` on a clean exit.

## Known limitations

- A headless run is driven from within the control-plane process; restarting the control plane
  while a run is in flight orphans it (the container is later reclaimable via cancel/remove).
- Mid-run interjections are written to the agent's stdin, so they only take effect if the configured
  harness reads stdin while running.

---

## License

Sagewright is source-available under the [Elastic License 2.0](./LICENSE) (ELv2). You're free to
self-host, modify, and use it internally — you just can't offer it to third parties as a hosted or
managed service.
