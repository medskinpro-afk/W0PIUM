# DSM Task Scheduler Commands

Use `User-defined script` tasks with `User: root`.

All `scripts/*.sh` source `scripts/dsm-env.sh` to resolve `docker`, `node`, and `curl` on Synology's minimal cron PATH.

---

## Основные задачи

### 1) Деплой (rebuild + health check)

```sh
cd /volume1/docker/w0pium && sh scripts/predeploy-and-deploy.sh
```

- Если Playwright установлен — сначала прогоняет smoke-тесты
- Затем `docker compose up --build -d`
- Затем проверяет `/api/health`
- **Работает без Playwright** — smoke пропускается автоматически

### 2) Полный pipeline (то же самое, обёртка)

```sh
cd /volume1/docker/w0pium && sh scripts/auto-pipeline.sh
```

### 3) Статус (health + контейнер + последние логи)

```sh
cd /volume1/docker/w0pium && sh scripts/status-report.sh
```

Не требует Playwright. Показывает health JSON, статус контейнера, последние 20 строк логов.

### 4) Чеклист (health + опциональный smoke)

```sh
cd /volume1/docker/w0pium && sh scripts/checklist.sh
```

### 5) Ночной smoke prod (требует Playwright)

```sh
cd /volume1/docker/w0pium && sh scripts/nightly-prod-smoke.sh
```

Завершается с ошибкой если Playwright не установлен — задача в DSM будет помечена как failed.

### Бэкап БД

```sh
cd /volume1/docker/w0pium && sh scripts/backup-db.sh
```

Копирует `data/w0pium.db` с датой, удаляет копии старше 7 дней.

### Быстрый рестарт без rebuild

```sh
docker cp /volume1/docker/w0pium/server.js w0pium:/app/server.js && docker restart w0pium
```

---

## Установка Playwright (один раз, если нужны E2E)

```sh
cd /volume1/docker/w0pium && npm ci --ignore-scripts --no-audit --no-fund && npx playwright install chromium
```

После этого все скрипты автоматически начнут прогонять smoke-тесты перед деплоем.

Альтернатива — запуск browser-тестов в Docker (не нужно ничего устанавливать на NAS):

```sh
cd /volume1/docker/w0pium && sh scripts/e2e-docker.sh smoke-prod
```
