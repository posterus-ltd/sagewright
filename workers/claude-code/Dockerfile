FROM node:22-bookworm
LABEL sagewright.worker=true \
      sagewright.worker.name="Claude Code" \
      sagewright.worker.description="Anthropic Claude Code harness"

# ─── Base tooling ─────────────────────────────────────────────────────────────
# git + gh power the control plane's push + PR step; curl/neovim are for poking
# around during interactive `docker exec` sessions. tmux keeps the agent terminal
# alive across browser refreshes.
RUN apt-get update && apt-get install -y git curl neovim tmux && rm -rf /var/lib/apt/lists/*

# Install gh CLI via official apt repository.
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
      | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
 && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
      > /etc/apt/sources.list.d/github-cli.list \
 && apt-get update && apt-get install -y gh && rm -rf /var/lib/apt/lists/*

# ══════════════════════════════════════════════════════════════════════════════
# ═══ YOUR HARNESS ═════════════════════════════════════════════════════════════
# This block is the ONE place you choose and configure the agent. The control
# plane is harness-agnostic: it spawns this container, execs the start script
# below over a PTY, streams that terminal back as the live transcript, and runs
# git push + PR when the script exits. It never needs to know which harness ran.
#
#   1. INSTALL your harness CLI.
#   2. AUTHENTICATE it against an LLM — set the provider's API key as a build arg /
#      ENV (see ANTHROPIC_API_KEY at the bottom). Claude Code reads ANTHROPIC_API_KEY.
#   3. CONFIGURE its MCP servers, skills, plugins, and alignment (the system prompt /
#      rules) by baking the relevant config files into the image, as shown below.
#   4. POINT workers/claude-code/start-agent at the harness you installed (it launches the agent).
# ══════════════════════════════════════════════════════════════════════════════

# 1. Install the harness CLI.
RUN npm install -g @anthropic-ai/claude-code@2.1.193

# The container runs as root, where Claude Code refuses --dangerously-skip-permissions
# unless it's told it's in a sandbox. The container IS the sandbox, so opt in here;
# this lets start-agent / continue-agent use the flag without tripping the root guard.
ENV IS_SANDBOX=1

# 2. Auth: Claude Code picks up ANTHROPIC_API_KEY (baked in at the bottom of this
#    file) and talks to the Anthropic API directly.

# 3. Alignment / system prompt: start-agent prepends this to every task's prompt.
RUN mkdir -p /etc/sagewright
COPY workers/claude-code/SOUL.md /etc/sagewright/SOUL.md

# 4. The predefined scripts the control plane execs: start-agent launches the
#    headless task; continue-agent resumes it in the interactive "agent" terminal.
COPY workers/claude-code/start-agent /usr/local/bin/start-agent
COPY workers/claude-code/continue-agent /usr/local/bin/continue-agent
RUN chmod +x /usr/local/bin/start-agent /usr/local/bin/continue-agent
# ═══ END YOUR HARNESS ═════════════════════════════════════════════════════════

# Friendly interactive shell (aliases, prompt, history) for `docker exec` sessions.
COPY workers/claude-code/.bashrc /root/.bashrc

ENV GIT_AUTHOR_NAME=sagewright \
    GIT_AUTHOR_EMAIL=bot@sagewright \
    GIT_COMMITTER_NAME=sagewright \
    GIT_COMMITTER_EMAIL=bot@sagewright

# Auth tokens are baked in at build time from the host .env (via compose build
# args). git/gh use GITHUB_TOKEN for the push + PR step; the Claude Code harness
# inherits ANTHROPIC_API_KEY. Empty defaults so the build never fails when a token
# is absent. Note: these values are visible in `docker history` — do not push this
# image to a shared registry with real tokens baked in.
ARG GITHUB_TOKEN=""
ARG NODE_AUTH_TOKEN=""
ARG ANTHROPIC_API_KEY=""
ENV GITHUB_TOKEN=$GITHUB_TOKEN \
    NODE_AUTH_TOKEN=$NODE_AUTH_TOKEN \
    ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY

# The worker is a generic box: it just comes up and stays alive. The control plane
# execs `start-agent` (headless runs) or a shell (interactive sessions) into it on
# demand over the docker socket — see apps/control-plane-api/src/tasks/agent-runner.ts.
ENTRYPOINT ["sleep", "infinity"]
