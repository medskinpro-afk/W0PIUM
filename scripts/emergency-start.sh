#!/bin/sh
# Emergency recovery — output goes to /volume1/docker/w0pium/emergency.log
LOGFILE="/volume1/docker/w0pium/emergency.log"
exec > "$LOGFILE" 2>&1

_SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
. "$_SCRIPT_DIR/dsm-env.sh"
cd "$(CDPATH= cd -- "$_SCRIPT_DIR/.." && pwd)"

echo "=== Emergency start: $(date) ==="

echo "--- docker ps -a ---"
docker ps -a 2>&1

echo "--- docker images ---"
docker images 2>&1

echo "--- docker start w0pium ---"
docker start w0pium 2>&1 && echo "STARTED OK" || {
  echo "docker start failed — trying docker compose up -d"
  docker compose up -d 2>&1 || echo "docker compose up -d also failed"
}

echo "--- health ---"
sleep 8
curl -fsS --max-time 10 http://localhost:3000/api/health 2>&1 || echo "health FAIL"

echo "=== Done: $(date) ==="
