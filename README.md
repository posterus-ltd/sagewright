# Sagewright

A control plane for running coding agents inside Docker containers. You give it a repo and a task;
it spins up a worker, streams the agent's live transcript, lets you interject mid-run, and opens a
PR on GitHub when it's done.

It ships with an [opencode](https://opencode.ai) harness, but the worker is just a box you connect
to: the control plane spawns it, runs a predefined start script over a terminal (`docker exec`),
streams that terminal back as the live transcript, and opens the PR when the run finishes. The
harness is whatever you install and configure in the **worker image** — swap it by editing one
block of `workers/opencode/Dockerfile` (see [Use a different harness](#use-a-different-harness)). And because
opencode supports every major provider, you can drive sessions with **any inference model** —
OpenAI, Anthropic, Google, local models via Ollama, or anything else opencode reaches (see
[Use a different model](#use-a-different-model)).

![Harness — live transcript of a single session](./screenshots/harness.png)
![Canvas — run several agent sessions side by side](./screenshots/canvas.png)

---

## Prerequisites

You need these installed and working before you start. Each line has a quick command to check it.

| Requirement             | Why                                                                  | Check                                                                                           |
| ----------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| **Docker** + Compose v2 | Runs the whole stack and spawns agent workers                        | `docker compose version`                                                                        |
| **Node.js 22+**         | Local builds, tests, and helper scripts                              | `node --version`                                                                                |
| **A GitHub token**      | Lets workers clone repos, push branches, and open PRs                | [Create one →](https://github.com/settings/tokens) (scope: `repo`)                              |
| **A model API key**     | The agent's inference provider — without one the worker does nothing | OpenAI is the default ([get a key →](https://platform.openai.com/api-keys)); any provider works |

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
# A password you'll type to log into the web UI — pick anything you'll remember.
APP_PASSWORD=changeme

# Two random secrets, each EXACTLY 32 characters long.
SESSION_SECRET=change-this-32-byte-secret-value!!
SECRETS_KEY=change-this-32-char-secrets-key!!

# Your GitHub token and model API key from the table above. OPENAI_API_KEY is the
# default; to use a different provider/model see "Use a different model" below.
GITHUB_TOKEN=
OPENAI_API_KEY=
```

> **Tip:** generate a 32-character secret with `openssl rand -base64 24 | cut -c1-32`.

> `LINEAR_API_KEY` is optional — only fill it in if you want to pull tasks from Linear.

### 2. Build the agent worker image

This bakes your `GITHUB_TOKEN` and `OPENAI_API_KEY` into a Docker image the agents run inside.
Re-run this whenever you change those tokens.

```bash
docker compose --profile build build
```

> **Tip:** `scripts/build-workers.sh` is a convenience wrapper for this — see
> [Rebuilding the worker images](#rebuilding-the-worker-images).

### 3. Start everything

```bash
docker compose up --build -d
```

Or use the convenience start script for your OS, which runs the same command:

```bash
./start.sh     # Linux / macOS
start.bat      # Windows
```

That's it. This launches PostgreSQL and the control plane on port 3000.

### 4. Open the app

Go to **[http://localhost:3000](http://localhost:3000)**, log in with your `APP_PASSWORD`, then:

1. **Add your repos** — open **Settings** and list your HTTPS repo URLs (one per line, e.g.
   `https://github.com/owner/repo`, not SSH syntax like `git@github.com:owner/repo.git`). They're
   yours alone; see [Global defaults vs per-user settings](#global-defaults-vs-per-user-settings).
2. **(Optional) Set a personal `.env`** — under **Settings → Environment**, override the org
   defaults for your sessions (e.g. your own `GITHUB_TOKEN`).
3. **Create a task** — describe what you want; the transcript streams live as the agent works.

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

## Advanced: customizing the worker image

Everything an agent can see and do lives inside the **worker image** (`workers/opencode/Dockerfile`). It has
one clearly-marked **`YOUR HARNESS`** block — the single place you install and authenticate your
harness, configure its MCP servers / skills / plugins / alignment, and point the start script at it.
The control plane is harness-agnostic: it only knows to run `start-agent` and stream the result. Bake
in your organization's defaults here, then rebuild with `docker compose --profile build build`.

Each active session runs in its own `sagewright-worker` container spawned by the control plane
alongside the long-lived `control-plane` and `postgres` services — `docker ps` shows them all:

![docker ps — control plane, spawned workers, and postgres](./screenshots/docker-ps.png)

### Rebuilding the worker images

Worker images bake the host `.env` auth tokens in as build args, so you must rebuild after
**any** of: rotating a token in `.env`, editing a worker `Dockerfile`, or changing a harness
config (e.g. `opencode.config.json`, `SOUL.md`). The images sit behind the `build` compose
profile because the control plane spawns them on demand — so `docker compose up --build` alone
**skips** them, and you must build them explicitly.

```bash
scripts/build-workers.sh                 # rebuild every worker image
scripts/build-workers.sh --no-cache      # force-rebuild (re-bake stale/rotated tokens)
scripts/build-workers.sh worker-opencode # rebuild a single worker image
```

The script is a thin wrapper around `docker compose --profile build build` that runs from the
repo root and passes its arguments straight through. Use `--no-cache` when you've only changed a
token: Docker caches the `ARG`/`ENV` layers, so a plain rebuild can keep an old key baked in.

> Rebuilding only affects **new** sessions. Already-running worker containers keep the image they
> were spawned from until they're replaced.

### Override the opencode config (models & MCP servers)

The worker bakes a global opencode config into every session. Edit
[`workers/opencode/opencode.config.json`](./workers/opencode/opencode.config.json)
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
   `OPENAI_API_KEY`) and forward them into the worker image as a build arg in
   [`workers/opencode/Dockerfile`](./workers/opencode/Dockerfile) (see how `OPENAI_API_KEY` is wired up).
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

opencode is just the default. The control plane never hardcodes a harness — it spawns the worker
box, runs the predefined start script ([`workers/opencode/start-agent`](./workers/opencode/start-agent)) over a terminal,
streams that terminal as the transcript, and runs git push + PR when the script exits. **Any agent
CLI** that runs in a terminal (Claude Code, Aider, a custom runner, etc.) works.

To swap it in, edit only the **`YOUR HARNESS`** block of [`workers/opencode/Dockerfile`](./workers/opencode/Dockerfile)
and the start script — nothing outside the image changes:

1. Replace the install step (`npm install -g opencode-ai`) with your harness's install + auth.
2. Update [`workers/opencode/start-agent`](./workers/opencode/start-agent) to launch your harness against `"$PROMPT"` in
   the current directory, in the foreground, exiting when done (its exit code decides DONE/FAILED).
3. Rebuild: `docker compose --profile build build`.

The transcript is the agent's raw terminal output, so a chatty CLI gives a rich transcript. Mid-run
interjections are written to the agent's stdin — they take effect only if your harness reads stdin.

### Override the agent's system prompt / alignment ("soul")

The agent's base instructions live in [`workers/opencode/SOUL.md`](./workers/opencode/SOUL.md), baked into the image and
prepended to every task's prompt by `start-agent`. Edit it to set your org's engineering standards,
tone, or guardrails — or configure alignment through your harness's own config (e.g. opencode's
`instructions`) inside the `YOUR HARNESS` block.

### Bake in extra tooling or org configuration

To add CLIs, linters, language runtimes, or pre-seeded config files your agents should always have,
edit [`workers/opencode/Dockerfile`](./workers/opencode/Dockerfile):

```dockerfile
# Install extra tooling
RUN apt-get update && apt-get install -y ripgrep jq && rm -rf /var/lib/apt/lists/*

# Bake in an org-wide config file or credentials template
COPY my-org/.npmrc /root/.npmrc
COPY my-org/lint-rules.json /root/.config/my-tool/config.json
```

Anything you `COPY` or `RUN` here becomes part of the image, so every spawned worker starts with it
already in place. Rebuild the image after any change.

> **Security:** `GITHUB_TOKEN`, `NODE_AUTH_TOKEN`, and `OPENAI_API_KEY` are baked into the worker
> image as build args, so they're visible via `docker history`. Rotating a token means rebuilding
> the image. This is fine for a single-user local setup — **do not push the worker image to a shared
> registry** with real tokens baked in.

---

## Global defaults vs per-user settings

Two layers decide what a worker session can see and which repos it works on. **Global defaults**
come from the host `.env` and apply to everyone; **per-user settings** are managed by each user in
the web UI (**Settings**) and only affect that user's own sessions.

### Environment variables

**Rule of thumb:** configure **org-wide environment variables in the worker `Dockerfile`** (baked
into the image so every session, for every user, gets them); let each user add **personal overrides
in the control plane** (**Settings → Environment**), which apply only to their own sessions and take
effect at runtime with no rebuild.

| Layer                    | Where it's set                                          | Scope                     | When it applies                                 |
| ------------------------ | ------------------------------------------------------- | ------------------------- | ----------------------------------------------- |
| **Global / org default** | Host `.env`, baked into the worker image as a build arg | Every session, every user | Build time — rebuild the image to change it     |
| **Per-user override**    | **Settings → Environment** in the web UI                | Only that user's sessions | Runtime — takes effect next session, no rebuild |

To add a **global** variable, put it in `.env` and wire it into the worker image as an `ARG`/`ENV`
in the Dockerfile (see how `OPENAI_API_KEY` is forwarded in
[`workers/opencode/Dockerfile`](./workers/opencode/Dockerfile)), then rebuild with
`docker compose --profile build build`.

A **per-user** `.env` is entered in the web UI, stored **encrypted at rest** (aes-256-gcm, keyed by
`SECRETS_KEY`) and injected into that user's worker containers **at runtime**. It **overrides** the
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

The control-plane container mounts the host's Docker socket so it can spawn worker containers:

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
workers/               Per-worker agent boxes (workers/<name>/) — each a Dockerfile + start-agent + baked harness config
scripts/               Spike/verification scripts
```

The control plane drives a headless run from `apps/control-plane-api/src/tasks/agent-runner.ts`:
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
