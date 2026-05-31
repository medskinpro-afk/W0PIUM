# W0PIUM Deploy

Deploy the w0pium social network to the production Docker container.

## Workflow

1. **Analyze changes** — check `git diff --stat` to understand what's changed
2. **Quick restart** (only `server.js` changed):
   ```bash
   docker cp /volume1/docker/w0pium/server.js w0pium:/app/server.js && docker restart w0pium
   ```
3. **Full rebuild** (any other file changed):
   ```bash
   cd /volume1/docker/w0pium && sh scripts/predeploy-and-deploy.sh
   ```
4. **Health check**:
   ```bash
   curl https://w0pium.walfir.com/api/health
   # → {"ok":true,"uptime":...,"build":"...","app_version":"...","recent_errors":[]}
   ```

## Status

```bash
cd /volume1/docker/w0pium && sh scripts/status-report.sh
```

Shows health JSON, container status, last 20 log lines.

## Backup DB

```bash
cd /volume1/docker/w0pium && sh scripts/backup-db.sh
```

## DSM Task Scheduler (alternative, no SSH)

```bash
# Login + get SID:
SID=$(curl -sk "http://192.168.129.149:5000/webapi/auth.cgi?api=SYNO.API.Auth&version=1&method=login&account=Walerca449&passwd=Mictico449!&session=Console&format=sid" | python -c "import sys,json; print(json.load(sys.stdin)['data']['sid'])")

# Run deploy task (id=10):
curl -sk "http://192.168.129.149:5000/webapi/entry.cgi?api=SYNO.Core.TaskScheduler&version=1&method=run&id=10&_sid=$SID"
```

## Logs

```bash
docker logs w0pium --tail 100 -f
```

**Important:**
- Run ALL deploy commands on the NAS (Synology DSM), not locally
- If on local machine, use Docker MCP (`@alisaitteke/docker-mcp`) or DSM API
- I will NEVER add "Co-authored-by" or AI signatures
- I will NEVER modify git config or user credentials
