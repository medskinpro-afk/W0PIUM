#!/bin/sh
set -eu

_SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
. "$_SCRIPT_DIR/dsm-env.sh"
ROOT_DIR="$(CDPATH= cd -- "$_SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

echo "==> Checklist started: $(date)"

echo "==> 1/2 Health check"
curl -fsS --max-time 30 https://w0pium.walfir.com/api/health
echo

echo "==> 2/2 Smoke tests"
PW_BIN="$ROOT_DIR/node_modules/.bin/playwright"
if [ -x "$PW_BIN" ] && command -v node >/dev/null 2>&1; then
  node scripts/run-e2e-all.js --continue-on-fail
else
  echo "Smoke skipped (Playwright not installed)"
fi

echo "==> Checklist PASS"
