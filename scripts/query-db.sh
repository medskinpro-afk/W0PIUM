#!/bin/bash
# W0PIUM — read-only SQLite query helper via SSH
# Usage: ./query-db.sh ".schema users" or ./query-db.sh "SELECT * FROM users LIMIT 1"
set -eu

NAS_HOST="${NAS_HOST:-192.168.129.149}"
NAS_USER="${NAS_USER:-Walerca449}"
NAS_PASS="${NAS_PASS:-Mictico449!}"

QUERY="$1"

sshpass -p "$NAS_PASS" ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
  "$NAS_USER@$NAS_HOST" \
  "echo '$NAS_PASS' | sudo -S /usr/local/bin/docker exec w0pium sqlite3 -readonly /app/data/w0pium.db '$QUERY'"
