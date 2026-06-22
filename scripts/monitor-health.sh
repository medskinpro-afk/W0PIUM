#!/bin/sh
# W0PIUM — Health monitor + auto-recovery
# Usage: set up in DSM Task Scheduler, run every 5 minutes
#   cd /volume1/docker/w0pium && sh scripts/monitor-health.sh
set -eu

W0PIUM_URL="${W0PIUM_HEALTH_URL:-http://localhost:3000/api/health}"
WEB_URL="${W0PIUM_WEB_URL:-https://w0pium.walfir.com/api/health}"
MAX_FAILS=3
FAIL_FILE="/tmp/w0pium_health_fails"

# Check local health
if ! curl -fsS --max-time 10 "$W0PIUM_URL" > /dev/null 2>&1; then
  fails=$(cat "$FAIL_FILE" 2>/dev/null || echo 0)
  fails=$((fails + 1))
  echo "$fails" > "$FAIL_FILE"
  echo "[$(date)] Health check FAILED ($fails/$MAX_FAILS) — local" >&2

  if [ "$fails" -ge "$MAX_FAILS" ]; then
    echo "[$(date)] THRESHOLD REACHED — restarting w0pium" >&2
    docker restart w0pium
    sleep 5
    docker compose --profile remote-tunnel down --remove-orphans 2>/dev/null || true
    sleep 2
    docker compose --profile remote-tunnel up -d
    rm -f "$FAIL_FILE"
    echo "[$(date)] Recovery complete" >&2
  fi
else
  rm -f "$FAIL_FILE"
  # Success — also check via Cloudflare
  if ! curl -fsS --max-time 15 "$WEB_URL" > /dev/null 2>&1; then
    echo "[$(date)] Local OK but Cloudflare UNREACHABLE — restarting tunnel" >&2
    docker compose --profile remote-tunnel down --remove-orphans
    sleep 3
    docker compose --profile remote-tunnel up -d
    echo "[$(date)] Tunnel restart complete" >&2
  fi
fi
