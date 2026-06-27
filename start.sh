#!/usr/bin/env bash
# Start Sagewright via Docker Compose (Linux / macOS).
set -euo pipefail

# Run from the repo root regardless of where the script is invoked.
cd "$(dirname "$0")"

# Build the worker images first. They live behind the `build` compose profile so
# that `up` never tries to *run* them (they're spawned on demand by the control
# plane), which also means `up --build` alone skips them — leaving the worker
# picker empty. Build them explicitly here so every host has them locally; worker
# images are never pushed to a registry, so each host must build its own.
docker compose --profile build build

docker compose up --build -d
