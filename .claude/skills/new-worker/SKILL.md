---
name: new-worker
description: Use when adding a new worker type or incorporating a new agent harness (Claude Code, Codex, opencode, Gemini, Aider, etc.) into Sagewright — scaffolding a workers/<id>/ folder, registering a new worker Docker image, or wiring up a new harness CLI for the control plane to run.
---

# Scaffolding a New Worker / Harness

## Overview

A **worker** is a Docker image labeled `sagewright.worker=true` that bundles one **harness** (an agent CLI like Claude Code, Codex, or opencode). The control plane is harness-agnostic: it spawns the container, execs `/usr/local/bin/start-agent` over a PTY for headless tasks and `/usr/local/bin/continue-agent` for interactive sessions, streams the terminal back as the transcript, and runs git push + PR when the script exits.

**Adding a harness requires ZERO control-plane, DB, API, or UI code changes.** Workers are discovered at runtime from Docker image labels (`apps/control-plane-api/src/workers/worker-registry.ts`), `worker_image` columns are plain text, and every dropdown auto-populates from `GET /api/workers`. Your whole job is: create a `workers/<id>/` folder, fill in the harness, and add a build service. This skill does exactly that.

## When to Use

- "Add a worker for <CLI>", "incorporate the <X> harness", "support <agent CLI> as a worker"
- Standing up a new agent CLI so it appears in the New Session / Settings / Workflow worker pickers
- **Not for:** swapping the harness inside an *existing* worker (just edit that folder's `Dockerfile` + `start-agent`), or anything that needs the control plane to behave differently per-harness (it never does).

## What You Collect (ask explicitly — do not infer)

Gather every field before writing anything. Validate `id` first.

| Field | Example | Lands in |
|---|---|---|
| `id` (kebab-case) | `gemini-cli` | folder `workers/<id>/`, image tag `sagewright-worker-<id>:latest`, compose service `worker-<id>` |
| `name` | `Gemini CLI` | `LABEL sagewright.worker.name` |
| `description` | `Google Gemini CLI harness` | `LABEL sagewright.worker.description` |
| install command | `npm install -g @google/gemini-cli@0.1.x` | Dockerfile `RUN` install line |
| auth env var | `GEMINI_API_KEY` (may be shared, e.g. `OPENAI_API_KEY`) | Dockerfile `ARG`/`ENV`, compose build arg, `.env.example` |
| headless launch line | `exec gemini -p "$PROMPT_TEXT" --yolo` | final `exec` line of `start-agent` |
| interactive resume line | `exec gemini --continue` | final `exec` line of `continue-agent` |
| base worker (optional) | `claude-code` (default) | folder copied as the starting point |
| extra config? (optional) | a config file to COPY, an extra `ENV` | extra Dockerfile lines (default: none) |

`id` MUST be kebab-case and `workers/<id>/` MUST NOT already exist — the folder name *is* the registry id (`libs/shared/src/worker.schema.ts` derives `id` from the `sagewright-worker-<id>` tag). Stop and ask if `id` is ambiguous.

## Procedure

1. **Validate** — confirm `workers/<id>/` does not exist and `id` is kebab-case.
2. **Copy the base** — `cp -r workers/claude-code workers/<id>` (or the chosen base).
3. **Rewrite `workers/<id>/Dockerfile`** — apply the checklist below.
4. **Rewrite `workers/<id>/start-agent`** — replace ONLY the final `exec <harness>` line with the headless launch line. Leave the `SOUL.md`-prepend logic intact.
5. **Rewrite `workers/<id>/continue-agent`** — replace ONLY the final `exec <harness>` line with the interactive resume line. If the harness has no real "resume" command (unlike `claude --continue` / `codex resume`), use its plain interactive launch; it will pick up whatever history it persists. Word the comment so it doesn't promise a session resume the CLI can't do.
6. **`workers/<id>/SOUL.md`** — keep verbatim by default; offer to edit the system prompt.
7. **Add the build service** to `docker-compose.yml` (template below).
8. **Wire the auth var into `.env.example`** — if `<AUTH_KEY>` is absent, add it with an empty default. If it's already there (a shared provider key like `OPENAI_API_KEY` that codex/opencode use), do NOT duplicate it — just extend its comment to mention the new harness. Either way the compose build arg in step 7 still references `<AUTH_KEY>`.
9. **Report & hand off** — list created/edited files, then tell the user to run the build (see Verify). Do not run the build yourself.

### Dockerfile rewrite checklist

Editing the copied `workers/<id>/Dockerfile`, change exactly these and nothing else:

- [ ] `LABEL sagewright.worker.name="<name>"` and `sagewright.worker.description="<description>"`
- [ ] The harness install line: `RUN npm install -g ...` → the new install command. **Check the base image has the right toolchain first:** the base (`node:22-bookworm`) ships Node, not Python/etc. If the harness installs via `pip`/`pipx`/`go`/`cargo`, add the needed runtime (e.g. `RUN apt-get update && apt-get install -y python3-pip pipx && rm -rf /var/lib/apt/lists/*`) *before* the install line, or change the `FROM`. A `pip: not found` build failure means you skipped this.
- [ ] **Repoint every `COPY workers/<base>/...` to `COPY workers/<id>/...`** — easy to miss; if you skip this the image silently bakes the *base's* scripts and runs the wrong harness
- [ ] The auth secret in all three spots near the bottom: `ARG <OLD_KEY>=""`, the `ENV <OLD_KEY>=$<OLD_KEY>` clause, and any comment → `<AUTH_KEY>`
- [ ] Base-specific extras: if copying from `claude-code`, decide whether `ENV IS_SANDBOX=1` (a Claude-Code-only flag) applies — drop it unless the new harness needs it. Flag any other base-specific `ENV`/`COPY`/config for keep-or-remove rather than carrying it blindly.

Leave untouched: the base tooling (`git`, `gh`, `curl`), the `GIT_AUTHOR_*` env, `GITHUB_TOKEN`/`NODE_AUTH_TOKEN` args, the `.bashrc` COPY (after repointing its path), the `RUN chmod +x` line, and `ENTRYPOINT ["sleep", "infinity"]`. The `RUN chmod +x` makes the scripts executable inside the image, so host file permissions on `start-agent`/`continue-agent` don't matter.

### docker-compose.yml build service

Append under the other `worker-*` services (mirrors `docker-compose.yml` lines 64–95). Build args are always `GITHUB_TOKEN` + `NODE_AUTH_TOKEN` plus the harness's `<AUTH_KEY>`:

```yaml
  worker-<id>:
    profiles: ["build"]
    image: sagewright-worker-<id>:latest
    build:
      context: .
      dockerfile: workers/<id>/Dockerfile
      args:
        GITHUB_TOKEN: ${GITHUB_TOKEN:-}
        NODE_AUTH_TOKEN: ${NODE_AUTH_TOKEN:-}
        <AUTH_KEY>: ${<AUTH_KEY>:-}
```

## Why No Other Code Changes Are Needed

Trace it once so you don't go hunting for an enum or a switch — there isn't one:

- **Discovery:** `worker-registry.ts` lists Docker images filtered by `label=sagewright.worker=true` and reads `name`/`description` from labels; `id` comes from the `sagewright-worker-<id>` tag.
- **Storage:** `tasks.worker_image`, `scheduled_prompts.worker_image`, `user_settings.default_worker_image` are nullable `text` — no migration.
- **Validation:** task / scheduled-prompt / workflow routes validate a chosen image against the live registry list, not a hardcoded enum.
- **UI:** `SettingsPage`, `NewSessionButton`, `WorkerChip`, and the workflow editor all read `GET /api/workers`.

So once the image builds with the right labels, the new worker shows up everywhere automatically.

## Common Mistakes

| Mistake | Consequence | Fix |
|---|---|---|
| Left `COPY workers/<base>/...` paths in the new Dockerfile | Image builds the base's harness; tasks run the wrong agent | Repoint all `workers/<base>/` → `workers/<id>/` |
| Folder name ≠ compose `<id>` ≠ tag suffix | Registry id is inconsistent; picker/labels mismatch | Keep `id` identical across folder, `image:` tag, and service name |
| Renamed auth `ENV` but not the `ARG` (or vice-versa) | Key not baked in; harness can't auth at runtime | Change `ARG`, `ENV`, and the compose build arg together |
| Edited control-plane / schema / UI to "register" the worker | Wasted change; nothing reads an enum | Revert — discovery is label-based |
| Carried `ENV IS_SANDBOX=1` into a non-Claude harness | Misleading/no-op env | Drop base-specific flags unless needed |

## Verify (hand back to the user)

Report the created folder + the two edited files, then:

```bash
# Build just the new worker image with auth tokens baked from your .env:
docker compose --profile build build worker-<id>

# Confirm it's discoverable (must list sagewright-worker-<id>:latest):
docker images --filter label=sagewright.worker=true
```

After the build, the worker appears in the New Session and Settings pickers and is selectable in workflow steps — no restart of already-running containers required for new sessions.
