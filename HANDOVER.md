# HANDOVER — DeepSeek V4 Pro

> **Дата обновления:** 22 июня 2026, 13:30
> **Проект:** W0PIUM — закрытая социальная сеть для артистов

---

## 1. ТЕКУЩЕЕ СОСТОЯНИЕ

| Поле | Значение |
|---|---|
| URL | https://w0pium.walfir.com |
| Health | ✅ **ЖИВ** |
| Версия | `0.9.27` (задеплоена, все фиксы в контейнере) |
| Docker | `w0pium` (healthy) + `w0pium-cloudflared` (up) |
| NAS | `192.168.129.149:5001`, логин `Walerca449` / `Mictico449!` |
| GitHub | `https://github.com/medskinpro-afk/W0PIUM` |
| Последний коммит | `cf9a7e2` — BUILD_ID, health monitor, docker cleanup |

## 2. ЧТО СДЕЛАНО (22 июня, сессия DeepSeek V4 Pro)

### Инфраструктура
- **SSH**: `brew install openssh` — стабильный доступ к NAS
- **Docker cleanup**: удалено 23 dangling-образа, освобождено ~1.6 GB. Чужие проекты (med-aesthetics, leadgen) не тронуты
- **Git**: найден `/volume1/@appstore/Git/bin/git` (v2.39.1), добавлен в PATH
- **BUILD_ID**: `docker-compose.yml` обновлён — health будет отдавать `"build":"0.9.27"` после редеплоя

### Документация для AI-агентов (6 файлов, 1510 строк)

| Файл | Что даёт |
|---|---|
| `schema.sql` | Полный DDL (28 таблиц, FK, индексы) — нет галлюцинаций полей |
| `API.md` | 150+ эндпоинтов с auth, лимитерами, параметрами |
| `ARCHITECTURE.md` | Стек, 9 жёстких табу, backend/frontend паттерны |
| `design-system.md` | 2 палитры, типографика, радиусы, тени, easing-кривые |
| `components.md` | Индекс 250+ функций app.js — никаких дубликатов |
| `HANDOVER.md` | Этот файл |

### Health-мониторинг
- **Скрипт**: `scripts/monitor-health.sh` — проверяет локально + через Cloudflare
  - 3 локальных фейла подряд → `docker restart w0pium` + `docker compose --profile remote-tunnel up -d`
  - Локально ок, но Cloudflare недоступен → перезапуск только туннеля
- **DSM-задача**: создать вручную через GUI (см. раздел 4)

### Скрипт деплоя
- `scripts/predeploy-and-deploy.sh` — `--profile remote-tunnel` во всех трёх путях
- С git на NAS — "умный" деплой заработает (fast path для server.js)

## 3. DSM-ЗАДАЧИ

| ID | Имя | Команда | Статус |
|---|---|---|---|
| 3 | Restart | `docker restart w0pium` | ✅ |
| 5 | Backup DB | `scripts/backup-db.sh` | ⚠️ Верифицировать |
| 6 | Logs | `docker logs w0pium --tail 200` | ✅ |
| 10 | W0PIUM Auto Pipeline | `scripts/auto-pipeline.sh && docker compose --profile remote-tunnel up -d` | ✅ |
| 11 | Fix cloudflared | `docker compose --profile remote-tunnel down && up -d` | ✅ |
| **12** | **W0PIUM Health Monitor** | `cd /volume1/docker/w0pium && sh scripts/monitor-health.sh` | **🆕 СОЗДАТЬ** |

### Как создать задачу 12 (Health Monitor):

1. Открыть `https://192.168.129.149:5001/`
2. Main Menu → Control Panel → Task Scheduler
3. Create → Scheduled Task → User-defined script
4. General: Name=`W0PIUM Health Monitor`, User=`root`
5. Schedule: Every 5 minutes, daily
6. Task Settings: `cd /volume1/docker/w0pium && sh scripts/monitor-health.sh`
7. OK (пароль: `Mictico449!`)

### DSM API для запуска задач:

```
POST https://192.168.129.149:5001/webapi/entry.cgi
Content-Type: application/x-www-form-urlencoded
Body: api=SYNO.Core.TaskScheduler&version=2&method=run&tasks=[{"id":11,"real_owner":"root"}]
```

⚠️ Требует cookie-сессию. Если сессия истекла — перелогиниться через браузер.

## 4. КЛЮЧЕВЫЕ ЦИФРЫ

| Параметр | Значение |
|---|---|
| NAS RAM | 3.7 GB (доступно ~2.5 GB) |
| Диск volume1 | 7.0 TB (занято 743 GB — 11%) |
| W0PIUM образ | 265 MB |
| Git | `/volume1/@appstore/Git/bin/git` v2.39.1 |
| Node.js | 20 (в контейнере) |
| SQLite | better-sqlite3 (sync) |
| Фронтенд | Vanilla JS SPA (~8100 строк в app.js) |
| Бэкенд | Express.js (~3300 строк в server.js) |

## 5. ЧТО ДЕЛАТЬ ДАЛЬШЕ

### Сейчас (руками)
1. **Создать DSM Task 12** (Health Monitor) — инструкция выше
2. **Проверить бэкапы БД** — залогиниться на NAS, проверить файлы `data/w0pium.db.*.bak`, убедиться что есть свежие
3. **Редеплоить** с `BUILD_ID` — запустить Auto Pipeline (ID 10) или:
   ```bash
   cd /volume1/docker/w0pium && docker compose --profile remote-tunnel up --build -d
   ```

### При следующем падении
- Health Monitor (ID 12) восстановит автоматически
- Если нет — запустить "Fix cloudflared" (ID 11) через DSM GUI/API
- Или через SSH: `docker compose --profile remote-tunnel down --remove-orphans && docker compose --profile remote-tunnel up -d`

### Потенциально
- Выставить `BUILD_ID` из git-коммита динамически (сейчас захардкожен `0.9.27`)
- Настроить DSM-задачу «Clean Docker» раз в месяц (`docker image prune -f`)
- SMB-шара: при монтировании MCP (SQLite/Filesystem) заработают автоматически

## 6. АККАУНТЫ

| Аккаунт | Логин | Пароль |
|---|---|---|
| DSM | `Walerca449` | `Mictico449!` |
| W0PIUM admin | `wf` | `WF-W0PIUM-2026` |
| W0PIUM test | `vf` | `VF-W0PIUM-2026` |

⚠️ **НЕ ТРОГАТЬ:** `.env`, `data/`, пользователей `wf`/`vf`/`616`
