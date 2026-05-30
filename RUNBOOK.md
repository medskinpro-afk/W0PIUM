# W0PIUM Runbook (Autopilot)

## 1) Normal deploy (recommended)

Run only this:

```sh
cd /volume1/docker/w0pium && sh scripts/auto-pipeline.sh
```

What happens:
- smoke checks (local + production)
- guarded deploy (docker rebuild/restart)
- health verification

If any step fails, pipeline stops.

## 2) Quick health/status check

```sh
cd /volume1/docker/w0pium && sh scripts/status-report.sh
```

Shows:
- production health JSON
- smoke check result
- container status

Override target health endpoint (optional):

```sh
W0PIUM_HEALTH_URL="https://staging.example.com/api/health" sh scripts/status-report.sh
```

## 3) Safe manual deploy gate

```sh
cd /volume1/docker/w0pium && sh scripts/checklist.sh
```

Runs smoke and health checks only (no deploy).

## 4) Emergency rollback-safe action

```sh
cd /volume1/docker/w0pium && sh scripts/rollback-safe.sh
```

Performs:
- container restart
- health check
- recent logs tail

## 5) Rules to avoid mistakes

- Do not run random docker commands manually.
- Use root context for scheduled tasks.
- Keep `.env` and `data/` untouched unless explicitly required.
- If smoke fails, fix first, deploy later.

## 6) DM browser check (debug flow)

Use dedicated test credentials (not protected accounts), then run:

```sh
DM_E2E_USER='test_user' DM_E2E_PASS='test_pass' DM_E2E_TARGET='target_user' npm run e2e:dm
```

For production URL:

```sh
DM_E2E_USER='test_user' DM_E2E_PASS='test_pass' DM_E2E_TARGET='target_user' npm run e2e:dm:prod
```

If NAS browser libs are unstable, use Docker Playwright runner:

```sh
DM_E2E_USER='test_user' DM_E2E_PASS='test_pass' DM_E2E_TARGET='target_user' npm run e2e:docker:dm:prod
```
