# HANDOVER — DeepSeek V4 Pro

> **Дата обновления:** 22 июня 2026, 13:10
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
| Последний коммит | `64d8b59` — docs: architecture manifesto, API, design system, components, schema |

## 2. ЧТО СДЕЛАНО (22 июня)

### SSH настроен
- `brew install openssh` — SSH работает
- Команда: `sshpass -p 'Mictico449!' ssh Walerca449@192.168.129.149`
- Docker требует `sudo`: `echo Mictico449! | sudo -S /usr/local/bin/docker ...`

### Все фиксы задеплоены
Вопреки предыдущему HANDOVER, все багфиксы уже в работающем контейнере:
- MASTER_CODE — случайная генерация ✅
- Rate limiters ✅
- upgradeInsecureRequests: null ✅
- Версия 0.9.27 ✅

### Скрипт деплоя исправлен
- `scripts/predeploy-and-deploy.sh` — `--profile remote-tunnel` во всех трёх путях
- Запушен в GitHub (`2da474a`)

### Создана документация для AI-агентов

| Файл | Строк | Назначение |
|---|---|---|
| `schema.sql` | 324 | Полный DDL SQLite (28 таблиц, все колонки, FK, индексы) |
| `API.md` | 352 | Все ~150 эндпоинтов с методами, auth, лимитерами, параметрами |
| `ARCHITECTURE.md` | 178 | Стек, структура, backend/frontend паттерны, жёсткие табу |
| `design-system.md` | 176 | Цвета (dark/light), типографика, отступы, радиусы, тени, анимации |
| `components.md` | 480 | Индекс 250+ функций frontend (app.js) — рендеры, UI, чат, disk, voice |

### MCP-серверы
Уже настроены в `.cursor/mcp.json`:
- **SQLite** (`mcp-sqlite` → `/Volumes/docker/w0pium/data/w0pium.db`) — работает при смонтированном SMB
- **Playwright** — e2e/smoke тесты
- **Docker** — управление контейнерами
- **Filesystem** — доступ к файлам проекта

## 3. DSM-ЗАДАЧИ

| ID | Имя | Команда | Статус |
|---|---|---|---|
| 3 | Restart | `docker restart w0pium` | ✅ |
| 5 | Backup DB | Бэкап БД | ✅ |
| 6 | Logs | `docker logs w0pium --tail 200` | ✅ |
| 10 | W0PIUM Auto Pipeline | `scripts/auto-pipeline.sh && docker compose --profile remote-tunnel up -d` | ✅ ИСПРАВЛЕН |
| 11 | Fix cloudflared | `docker compose --profile remote-tunnel down && up -d` | ✅ |

DSM API для запуска задач (требует cookie-сессию):
```
POST https://192.168.129.149:5001/webapi/entry.cgi
Body: api=SYNO.Core.TaskScheduler&version=2&method=run&tasks=[{"id":11,"real_owner":"root"}]
```

## 4. КЛЮЧЕВЫЕ ЦИФРЫ

| Параметр | Значение |
|---|---|
| NAS RAM | 3.7 GB (доступно ~2.5 GB) |
| Диск volume1 | 7.0 TB (занято 743 GB — 11%) |
| Git на NAS | ❌ Не установлен |
| Node.js | 20 (в контейнере) |
| SQLite | better-sqlite3 (sync) |
| Фронтенд | Vanilla JS SPA (~8100 строк в app.js) |
| Бэкенд | Express.js (~3300 строк в server.js) |

## 5. ЧТО ДЕЛАТЬ ДАЛЬШЕ

### Мониторинг
- Проверять `https://w0pium.walfir.com/api/health`
- При Error 1033 → запустить DSM Task "Fix cloudflared" (ID 11) через SSH или DSM API

### При смонтированном SMB
- MCP SQLite заработает автоматически
- Можно делать `docker cp` напрямую

### Потенциальные улучшения
- Установить git на NAS (`synopkg install Git`)
- Выставить `BUILD_ID` в `.env` или `docker-compose.yml`
- Настроить автоматический бэкап БД на внешний диск

## 6. АККАУНТЫ

| Аккаунт | Логин | Пароль |
|---|---|---|
| DSM | `Walerca449` | `Mictico449!` |
| W0PIUM admin | `wf` | `WF-W0PIUM-2026` |
| W0PIUM test | `vf` | `VF-W0PIUM-2026` |

⚠️ **НЕ ТРОГАТЬ:** `.env`, `data/`, пользователей `wf`/`vf`/`616`
