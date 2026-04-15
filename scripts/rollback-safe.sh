#!/bin/sh
set -eu

_SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
. "$_SCRIPT_DIR/dsm-env.sh"
ROOT_DIR="$(CDPATH= cd -- "$_SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

if ! command -v docker >/dev/null 2>&1; then
  echo "rollback-safe: docker not found." >&2
  exit 1
fi
if ! command -v curl >/dev/null 2>&1; then
  echo "rollback-safe: curl not found." >&2
  exit 1
fi

echo "==> Rollback-safe routine started: $(date)"
echo "==> Restarting container"
docker restart w0pium

echo "==> Health check"
curl -fsS --max-time 30 https://w0pium.walfir.com/api/health
echo

echo "==> Recent logs"
docker logs w0pium --tail 80

echo "==> Rollback-safe routine finished"
