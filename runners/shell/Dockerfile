FROM node:22-bookworm
LABEL sagewright.runner=true \
      sagewright.runner.name="Shell" \
      sagewright.runner.description="Basic CLI runner (no agent) for terminal widgets"

# ─── Base tooling ─────────────────────────────────────────────────────────────
# This runner ships NO agent harness. It hosts `shell`-kind sessions: a chosen CLI
# command that the control plane runs in a persistent tmux over `docker exec` (e.g. a
# clock, `htop`, `npm run dev`) and streams back as a terminal widget on the canvas.
#
# So beyond the shared git/curl/tmux base, we install the handy interactive CLIs a
# "dev canvas" widget is likely to want: procps (watch/ps/top/uptime), htop, ncdu,
# tree, jq, less. git stays so a widget can poke at the mounted worktrees; no `gh` —
# a shell widget never opens PRs.
RUN apt-get update && apt-get install -y \
      git curl neovim tmux procps htop ncdu tree jq less \
 && rm -rf /var/lib/apt/lists/*

# ══════════════════════════════════════════════════════════════════════════════
# ═══ NO HARNESS ═══════════════════════════════════════════════════════════════
# There is deliberately no agent CLI here. `shell`-kind sessions are driven entirely
# by the control plane (it execs `tmux new-session` with the widget's command), so
# neither start-agent nor continue-agent is on the hot path. They exist only as a
# graceful fallback if this image is ever picked for a non-shell session: they drop
# into a plain shell rather than launch an agent.
COPY runners/shell/start-agent /usr/local/bin/start-agent
COPY runners/shell/continue-agent /usr/local/bin/continue-agent
RUN chmod +x /usr/local/bin/start-agent /usr/local/bin/continue-agent
# ═══ END NO HARNESS ═══════════════════════════════════════════════════════════

# Friendly interactive shell (aliases, prompt, history) for `docker exec` sessions.
COPY runners/shell/.bashrc /root/.bashrc

ENV GIT_AUTHOR_NAME=sagewright \
    GIT_AUTHOR_EMAIL=bot@sagewright \
    GIT_COMMITTER_NAME=sagewright \
    GIT_COMMITTER_EMAIL=bot@sagewright

# Auth tokens are baked in at build time from the host .env (via compose build args).
# git uses GITHUB_TOKEN if a widget touches a private remote; there is no agent, so no
# LLM provider key. Empty defaults so the build never fails when a token is absent.
# Note: these values are visible in `docker history` — do not push this image to a
# shared registry with real tokens baked in.
ARG GITHUB_TOKEN=""
ARG NODE_AUTH_TOKEN=""
ENV GITHUB_TOKEN=$GITHUB_TOKEN \
    NODE_AUTH_TOKEN=$NODE_AUTH_TOKEN

# The runner is a generic box: it just comes up and stays alive. The control plane
# execs the widget's command (shell sessions) or a shell (interactive) into it on
# demand over the docker socket.
ENTRYPOINT ["sleep", "infinity"]
