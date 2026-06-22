#!/bin/sh
# Smart deploy — three paths depending on what changed:
#   public/ only  → docker compose up -d  (instant; override.yml mounts live filesystem)
#   server.js     → docker cp + restart   (~5s; no image rebuild)
#   package.json  → full rebuild          (~2 min with node:20-slim pre-built binaries)
# If Playwright is installed, smoke tests run before deploy.
set -eu

_SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
. "$_SCRIPT_DIR/dsm-env.sh"
ROOT_DIR="$(CDPATH= cd -- "$_SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

# Enable BuildKit so --mount=type=cache works (speeds up future cold rebuilds)
export DOCKER_BUILDKIT=1
export COMPOSE_DOCKER_CLI_BUILD=1

# ── Detect what changed ──────────────────────────────────────────────────────
CHANGED_PACKAGES=false
CHANGED_SERVER=false

if git rev-parse HEAD >/dev/null 2>&1; then
  DIFF="$(git diff HEAD~1 --name-only 2>/dev/null || true)"
  echo "$DIFF" | grep -qE '^package(-lock)?\.json$' && CHANGED_PACKAGES=true || true
  echo "$DIFF" | grep -q '^server\.js$'             && CHANGED_SERVER=true  || true
  echo "==> Changed files: $(echo "$DIFF" | tr '\n' ' ')"
fi

# ── Smoke tests (optional) ──────────────────────────────────────────────────
PW_BIN="$ROOT_DIR/node_modules/.bin/playwright"
if [ -x "$PW_BIN" ] && command -v node >/dev/null 2>&1 \
    && node -e "const{chromium}=require('@playwright/test');require('fs').accessSync(chromium.executablePath())" 2>/dev/null; then
  echo "==> Pre-deploy smoke checks"
  node scripts/run-e2e-all.js
else
  echo "==> Smoke skipped"
fi

# ── Deploy ───────────────────────────────────────────────────────────────────
if [ "$CHANGED_PACKAGES" = "true" ]; then
  echo "==> Full rebuild (package.json changed — expect ~2 min with pre-built binaries)"
  docker compose --profile remote-tunnel up --build -d

elif [ "$CHANGED_SERVER" = "true" ]; then
  echo "==> Fast deploy (server.js only)"
  docker cp server.js w0pium:/app/server.js
  docker restart w0pium

else
  echo "==> Quick start (public/ or config — volume mount serves live files)"
  docker compose --profile remote-tunnel up -d
fi

# ── Health check ─────────────────────────────────────────────────────────────
if ! command -v curl >/dev/null 2>&1; then
  echo "==> curl not found — skipping health check" >&2
  exit 0
fi

sleep 3
echo "==> Verifying health endpoint"
HEALTH="$(curl -fsS --max-time 30 "$W0PIUM_HEALTH_URL")"
echo "$HEALTH"
echo "==> Done"
