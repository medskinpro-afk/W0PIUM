#!/bin/sh
# Daily SQLite backup + prune backups older than 7 days. Use from DSM Task Scheduler:
#   cd /volume1/docker/w0pium && sh scripts/backup-db.sh
set -eu

_SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
. "$_SCRIPT_DIR/dsm-env.sh"
ROOT_DIR="$(CDPATH= cd -- "$_SCRIPT_DIR/.." && pwd)"
DATA_DIR="$ROOT_DIR/data"
DB="$DATA_DIR/w0pium.db"

if [ ! -f "$DB" ]; then
  echo "backup-db: missing $DB" >&2
  exit 1
fi

cp "$DB" "$DATA_DIR/w0pium.db.$(date +%Y-%m-%d).bak"
find "$DATA_DIR" -name 'w0pium.db.*.bak' -mtime +7 -delete
echo "backup-db: ok $(date)"
