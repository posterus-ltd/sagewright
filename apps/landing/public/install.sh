#!/bin/sh
# Sagewright installer — bootstrap a self-hosted fleet of coding agents.
#
#   curl -fsSL https://sagewright.dev/install.sh | sh
#
# Clones the repo, scaffolds .env with freshly generated secrets, and prints the
# two commands that bring the stack up. Re-runnable: an existing checkout is
# updated in place and an existing .env is left untouched.
#
# Environment overrides:
#   SAGEWRIGHT_DIR    target directory           (default: ./sagewright)
#   SAGEWRIGHT_REPO   git remote to clone         (default: the public GitHub repo)
#   SAGEWRIGHT_REF    branch / tag to check out   (default: the remote's default branch)
#   NO_COLOR          set to disable coloured output

set -eu

REPO="${SAGEWRIGHT_REPO:-https://github.com/posterus-ltd/sagewright.git}"
DIR="${SAGEWRIGHT_DIR:-sagewright}"
REF="${SAGEWRIGHT_REF:-}"

# ---- pretty output (plain when not a tty, or when NO_COLOR is set) ----------
if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
  BOLD=$(printf '\033[1m')
  DIM=$(printf '\033[2m')
  RESET=$(printf '\033[0m')
  ORANGE=$(printf '\033[38;5;208m')
  RED=$(printf '\033[31m')
  GREEN=$(printf '\033[32m')
else
  BOLD='' DIM='' RESET='' ORANGE='' RED='' GREEN=''
fi

say()  { printf '%s\n' "$*"; }
step() { printf '%s❯%s %s\n' "$ORANGE" "$RESET" "$*"; }
warn() { printf '%s!%s %s\n' "$RED" "$RESET" "$*" >&2; }
die()  { warn "$*"; exit 1; }

# ---- banner -----------------------------------------------------------------
say ""
say "${ORANGE}${BOLD}  ❯ Sagewright${RESET}"
say "${DIM}    a fleet of agents that reason & build${RESET}"
say ""

# ---- preflight --------------------------------------------------------------
command -v git >/dev/null 2>&1 || die "git is required — install it and re-run."

if command -v docker >/dev/null 2>&1; then
  docker compose version >/dev/null 2>&1 ||
    warn "docker found, but 'docker compose' (v2) is not — you'll need Compose v2 to run the stack."
else
  warn "docker not found — install Docker + Compose v2 before starting the stack (https://docs.docker.com/get-docker/)."
fi

# ---- clone or update --------------------------------------------------------
if [ -d "$DIR/.git" ]; then
  step "updating existing checkout in ${BOLD}$DIR${RESET}"
  git -C "$DIR" pull --ff-only || warn "could not fast-forward $DIR — leaving it as-is."
elif [ -e "$DIR" ]; then
  die "$DIR already exists and is not a git checkout — set SAGEWRIGHT_DIR to an empty path."
else
  step "cloning ${BOLD}$REPO${RESET} into ${BOLD}$DIR${RESET}"
  if [ -n "$REF" ]; then
    git clone --branch "$REF" --depth 1 "$REPO" "$DIR"
  else
    git clone --depth 1 "$REPO" "$DIR"
  fi
fi

cd "$DIR"

# ---- helpers ----------------------------------------------------------------
# Emit N hex chars — openssl if present, otherwise straight from /dev/urandom.
rand_hex() {
  n=$1
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex "$(( (n + 1) / 2 ))" | cut -c1-"$n"
  else
    LC_ALL=C tr -dc 'a-f0-9' < /dev/urandom | dd bs=1 count="$n" 2>/dev/null
  fi
}

# Replace `KEY=...` in a file (matched at line start), or append if absent.
set_kv() {
  key=$1 val=$2 file=$3
  if grep -q "^${key}=" "$file" 2>/dev/null; then
    tmp=$(mktemp "${TMPDIR:-/tmp}/sagewright.XXXXXX")
    awk -v k="$key" -v v="$val" '
      index($0, k "=") == 1 { print k "=" v; next }
      { print }
    ' "$file" > "$tmp"
    mv "$tmp" "$file"
  else
    printf '%s=%s\n' "$key" "$val" >> "$file"
  fi
}

# ---- .env -------------------------------------------------------------------
ROOT_PW=''
if [ -f .env ]; then
  step "found an existing ${BOLD}.env${RESET} — leaving it untouched"
else
  [ -f .env.example ] || die ".env.example not found — is this a Sagewright checkout?"
  step "scaffolding ${BOLD}.env${RESET} with freshly generated secrets"
  cp .env.example .env
  ROOT_PW=$(rand_hex 24)
  set_kv ROOT_PASSWORD  "$ROOT_PW"       .env
  set_kv SESSION_SECRET "$(rand_hex 32)" .env
  set_kv SECRETS_KEY    "$(rand_hex 32)" .env
fi

# ---- next steps -------------------------------------------------------------
say ""
say "${GREEN}${BOLD}Sagewright is staged.${RESET} Two things left before your first run:"
say ""
say "  ${BOLD}1.${RESET} Add your keys to ${BOLD}$DIR/.env${RESET}"
say "     ${DIM}OPENAI_API_KEY=…   provider key (or another provider — see the README)${RESET}"
say "     ${DIM}GITHUB_TOKEN=…     scope: repo — lets runners clone repos and open PRs${RESET}"
say ""
say "  ${BOLD}2.${RESET} Build the runner image, then bring the fleet up:"
step "cd $DIR"
step "docker compose --profile build build"
step "docker compose up -d      ${DIM}# or ./start.sh${RESET}"
say ""
say "Then open ${BOLD}http://localhost:3001${RESET} and sign in as ${BOLD}root${RESET}."
if [ -n "$ROOT_PW" ]; then
  say "Your generated ${BOLD}root${RESET} password (also saved in .env as ROOT_PASSWORD):"
  say ""
  say "     ${ORANGE}${BOLD}$ROOT_PW${RESET}"
  say ""
  say "${DIM}You'll be prompted to change it on first login.${RESET}"
fi
say ""
say "${DIM}Docs:  https://github.com/posterus-ltd/sagewright#readme${RESET}"
say "${RED}Heads up:${RESET} run Sagewright only on a trusted private network — it is not"
say "hardened for the public internet. See the security notice in the README."
say ""
