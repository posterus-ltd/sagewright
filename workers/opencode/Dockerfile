FROM node:22-bookworm
LABEL sagewright.worker=true \
      sagewright.worker.name="Opencode" \
      sagewright.worker.description="Default opencode harness"

# ─── Base tooling ─────────────────────────────────────────────────────────────
# git + gh power the control plane's push + PR step; curl/neovim are for poking
# around during interactive `docker exec` sessions.
RUN apt-get update && apt-get install -y git curl neovim && rm -rf /var/lib/apt/lists/*

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
#      ENV (see OPENAI_API_KEY at the bottom), or run the harness's own `auth login`
#      here. opencode auto-detects a provider from whichever key is present.
#   3. CONFIGURE its MCP servers, skills, plugins, and alignment (the system prompt /
#      rules) by baking the relevant config files into the image, as shown below.
#   4. POINT workers/opencode/start-agent at the harness you installed (it launches the agent).
#
# The default harness is opencode. To use a different one, replace the steps in
# this block and edit workers/opencode/start-agent — nothing outside this image changes.
# ══════════════════════════════════════════════════════════════════════════════

# 1. Install the harness CLI.
RUN npm install -g opencode-ai@1.14.46

# 2. Auth: opencode picks up OPENAI_API_KEY (baked in at the bottom of this file)
#    and auto-selects the OpenAI provider. Add other providers' keys the same way.

# 3a. MCP servers / models: opencode reads this global config. Edit it to register
#     MCP servers or pin a model/provider.
RUN mkdir -p /root/.config/opencode
COPY workers/opencode/opencode.config.json /root/.config/opencode/opencode.json

# 3b. Alignment / system prompt: start-agent prepends this to every task's prompt.
RUN mkdir -p /etc/sagewright
COPY workers/opencode/SOUL.md /etc/sagewright/SOUL.md

# 4. The predefined scripts the control plane execs: start-agent launches the
#    headless task; continue-agent resumes it in the interactive "agent" terminal.
COPY workers/opencode/start-agent /usr/local/bin/start-agent
COPY workers/opencode/continue-agent /usr/local/bin/continue-agent
RUN chmod +x /usr/local/bin/start-agent /usr/local/bin/continue-agent
# ═══ END YOUR HARNESS ═════════════════════════════════════════════════════════

# Friendly interactive shell (aliases, prompt, history) for `docker exec` sessions.
COPY workers/opencode/.bashrc /root/.bashrc

ENV GIT_AUTHOR_NAME=sagewright \
    GIT_AUTHOR_EMAIL=bot@sagewright \
    GIT_COMMITTER_NAME=sagewright \
    GIT_COMMITTER_EMAIL=bot@sagewright

# Auth tokens are baked in at build time from the host .env (via compose build
# args). git/gh use GITHUB_TOKEN for the push + PR step; the opencode harness
# inherits OPENAI_API_KEY. Empty defaults so the build never fails when a token is
# absent. Note: these values are visible in `docker history` — do not push this
# image to a shared registry with real tokens baked in.
ARG GITHUB_TOKEN=""
ARG NODE_AUTH_TOKEN=""
ARG OPENAI_API_KEY=""
ENV GITHUB_TOKEN=$GITHUB_TOKEN \
    NODE_AUTH_TOKEN=$NODE_AUTH_TOKEN \
    OPENAI_API_KEY=$OPENAI_API_KEY

# The worker is a generic box: it just comes up and stays alive. The control plane
# execs `start-agent` (headless runs) or a shell (interactive sessions) into it on
# demand over the docker socket — see apps/control-plane-api/src/tasks/agent-runner.ts.
ENTRYPOINT ["sleep", "infinity"]
