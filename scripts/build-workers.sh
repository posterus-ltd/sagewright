#!/usr/bin/env bash
# Rebuild the agent worker images (Linux / macOS).
#
# Worker images bake the host `.env` auth tokens (GITHUB_TOKEN, OPENAI_API_KEY,
# ANTHROPIC_API_KEY, …) in as build args, so you must rebuild whenever you change
# a token or a worker's Dockerfile / harness config. The images live behind the
# `build` compose profile because the control plane spawns them on demand — they
# are never `up`-ed by compose, so `up --build` alone skips them.
#
# Usage:
#   scripts/build-workers.sh                 # rebuild every worker image
#   scripts/build-workers.sh --no-cache      # force-rebuild (re-bake stale tokens)
#   scripts/build-workers.sh worker-opencode # rebuild a single worker image
#   scripts/build-workers.sh --no-cache worker-opencode worker-codex
set -euo pipefail

# Run from the repo root regardless of where the script is invoked.
cd "$(dirname "$0")/.."

docker compose --profile build build "$@"

echo "✓ Worker images rebuilt. New sessions will use them; existing containers keep the old image."
