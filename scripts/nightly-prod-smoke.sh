#!/bin/sh
set -eu

_SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
. "$_SCRIPT_DIR/dsm-env.sh"
ROOT_DIR="$(CDPATH= cd -- "$_SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

PW_BIN="$ROOT_DIR/node_modules/.bin/playwright"
if ! [ -x "$PW_BIN" ]; then
  echo "nightly-prod-smoke: Playwright not installed. Run: npm ci && npx playwright install chromium" >&2
  exit 1
fi
if ! command -v node >/dev/null 2>&1; then
  echo "nightly-prod-smoke: node not found." >&2
  exit 1
fi

echo "==> Nightly production smoke started: $(date)"
node scripts/run-e2e-all.js
echo "==> Nightly production smoke passed: $(date)"
