#!/bin/sh
# Full pipeline: optional smoke + rebuild + health check.
# Smoke tests are skipped if Playwright is not installed.
set -eu

_SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
. "$_SCRIPT_DIR/dsm-env.sh"
ROOT_DIR="$(CDPATH= cd -- "$_SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

echo "==> Auto pipeline started: $(date)"

sh "$_SCRIPT_DIR/predeploy-and-deploy.sh"

echo "==> Auto pipeline finished: $(date)"
