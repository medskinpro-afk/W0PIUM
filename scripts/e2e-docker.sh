#!/bin/sh
set -eu

_SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
. "$_SCRIPT_DIR/dsm-env.sh"
ROOT_DIR="$(CDPATH= cd -- "$_SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

if ! command -v docker >/dev/null 2>&1; then
  echo "e2e-docker: docker not found." >&2
  exit 1
fi

IMAGE="${PLAYWRIGHT_DOCKER_IMAGE:-mcr.microsoft.com/playwright:v1.59.1-jammy}"
CMD="${1:-smoke}"

case "$CMD" in
  smoke)
    INNER="npm ci --ignore-scripts --no-audit --no-fund && npx playwright test --config=playwright.config.js --project=chromium"
    ;;
  smoke-prod)
    INNER="npm ci --ignore-scripts --no-audit --no-fund && npx playwright test --config=playwright.prod.config.js --project=chromium"
    ;;
  dm-prod)
    INNER="npm ci --ignore-scripts --no-audit --no-fund && npx playwright test tests/e2e/dm.spec.js --config=playwright.prod.config.js --project=chromium"
    ;;
  *)
    echo "Usage: sh scripts/e2e-docker.sh [smoke|smoke-prod|dm-prod]"
    exit 2
    ;;
esac

echo "==> Running e2e in docker image: $IMAGE"
docker run --rm \
  -v "$ROOT_DIR:/work" \
  -w /work \
  -e DM_E2E_USER \
  -e DM_E2E_PASS \
  -e DM_E2E_TARGET \
  "$IMAGE" \
  /bin/bash -lc "$INNER"
