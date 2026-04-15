#!/bin/sh
# Guarded deploy: optional smoke tests, then rebuild/restart stack.
# If Playwright is not installed, smoke tests are skipped and deploy proceeds.
set -eu

_SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
. "$_SCRIPT_DIR/dsm-env.sh"
ROOT_DIR="$(CDPATH= cd -- "$_SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

# ── Smoke tests (optional) ──────────────────────────────────────────────────
# Run only if Playwright package AND its Chromium browser binary are both present.
PW_BIN="$ROOT_DIR/node_modules/.bin/playwright"
if [ -x "$PW_BIN" ] && command -v node >/dev/null 2>&1 \
    && node -e "const{chromium}=require('@playwright/test');require('fs').accessSync(chromium.executablePath())" 2>/dev/null; then
  echo "==> Pre-deploy smoke checks"
  node scripts/run-e2e-all.js
else
  echo "==> Smoke skipped (Playwright or Chromium not installed — run 'npx playwright install chromium' to enable)"
fi

# ── Deploy ──────────────────────────────────────────────────────────────────
echo "==> Deploying container (rebuild)"
if docker compose version >/dev/null 2>&1; then
  docker compose up --build -d
elif command -v docker-compose >/dev/null 2>&1; then
  docker-compose up --build -d
else
  echo "predeploy: need 'docker compose' (Compose V2) or docker-compose (V1)." >&2
  exit 1
fi

# ── Health check ─────────────────────────────────────────────────────────────
if ! command -v curl >/dev/null 2>&1; then
  echo "predeploy: curl not found — skipping health check." >&2
  exit 0
fi

echo "==> Verifying health endpoint"
HEALTH="$(curl -fsS --max-time 30 https://w0pium.walfir.com/api/health)"
echo "$HEALTH"
echo "==> Done"
