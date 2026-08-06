#!/usr/bin/env bash
# Start Sagewright via Docker Compose (Linux / macOS).
set -euo pipefail

# Run from the repo root regardless of where the script is invoked.
cd "$(dirname "$0")"

# Optional --reset flag: wipe the database on this startup. It exports DB_RESET,
# which compose forwards to the control-plane; its migrate step then drops and
# re-creates the public schema before applying migrations. DESTRUCTIVE: ALL data
# is lost. Only affects this run — a normal start afterwards keeps the data.
for arg in "$@"; do
  case "$arg" in
    --reset|reset)
      export DB_RESET=true
      echo "WARNING: --reset set — the database will be wiped on startup (ALL data will be lost)."
      ;;
    *)
      echo "Unknown argument: $arg" >&2
      echo "Usage: $0 [--reset]" >&2
      exit 1
      ;;
  esac
done

# Build the runner images first. They live behind the `build` compose profile so
# that `up` never tries to *run* them (they're spawned on demand by the control
# plane), which also means `up --build` alone skips them — leaving the runner
# picker empty. Build them explicitly here so every host has them locally; runner
# images are never pushed to a registry, so each host must build its own.
docker compose --profile build build

docker compose --profile https up --build -d
