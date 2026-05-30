# shellcheck shell=sh
# Shared PATH for Synology DSM Task Scheduler (cron has a minimal PATH).
# Source from scripts in this directory:
#   _SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
#   . "$_SCRIPT_DIR/dsm-env.sh"

export PATH="/var/packages/Docker/target/usr/bin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:${PATH:-}"

# Synology Node.js package (folder name varies by DSM package version)
for _nd in \
  "/var/packages/Node.js_v22/target/usr/local/bin" \
  "/var/packages/Node.js_v20/target/usr/local/bin" \
  "/var/packages/Node.js_v18/target/usr/local/bin"; do
  if [ -x "$_nd/node" ]; then
    case ":${PATH}:" in *":${_nd}:"*) ;; *) PATH="${_nd}:${PATH}" ;; esac
    break
  fi
done
export PATH

# Override to target another environment from DSM tasks/scripts.
# Example: export W0PIUM_HEALTH_URL="https://staging.example.com/api/health"
: "${W0PIUM_HEALTH_URL:=http://localhost:3000/api/health}"
export W0PIUM_HEALTH_URL
