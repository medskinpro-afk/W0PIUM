#!/bin/sh
set -eu

_SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
. "$_SCRIPT_DIR/dsm-env.sh"
ROOT_DIR="$(CDPATH= cd -- "$_SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

echo "==> Status report: $(date)"

echo "==> Health"
curl -fsS --max-time 30 "$W0PIUM_HEALTH_URL"
echo

echo "==> Container state"
docker ps --filter "name=w0pium" --format "table {{.Names}}\t{{.Status}}\t{{.Image}}"

echo "==> Recent logs (last 20 lines)"
docker logs w0pium --tail 20 2>&1

echo "==> Done"
