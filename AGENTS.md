# AGENTS.md — Технический гайд для AI-агентов

> Этот файл предназначен для Claude Code, Codex и других AI-агентов.
> Содержит всё необходимое для немедленного начала работы без лишних вопросов.
> **Обновляй этот файл при каждом значимом изменении архитектуры или найденном баге.**

---

## Быстрая ориентация

| Параметр | Значение |
|---|---|
| Тип | Закрытая социальная сеть (инвайт-коды) |
| URL (прод) | https://w0pium.walfir.com |
| Хостинг | Docker на Synology NAS, Cloudflare Tunnel |
| Репо | `\\MedSkin\docker\w0pium\` (сетевой путь Windows) |
| Рабочая ветка | `main` |

---

## Архитектура — главное

### Принцип "один файл"

- **`server.js`** — весь бэкенд: Express-маршруты, логика, DB-хелперы, миграции. Один файл ~2500+ строк.
- **`public/app.js`** — основной фронтенд: роутер, большинство страниц, SSE-клиент. ~5000+ строк.
- **`public/pages/chat.js`** — логика чатов (голосовые, медиа-галерея, поиск по переписке). Загружается отдельно.
- **`public/pages/drops.js`** — логика дропов (IntersectionObserver, просмотры). Загружается отдельно.
- Нет микросервисов, нет слоёв, нет ORM.

### Фоновые задачи (без Redis)

- Таблица **`background_jobs`**, воркер — `setInterval` (~2.5s) в `server.js`, один job за тик.
- Типы: `noop` (тест), `image_webp` (payload: путь под `DATA`, `destKey`), `disk_image_preview` (превью для картинок на диске).
- Админ: `GET /api/admin/jobs`, `POST /api/admin/jobs/test`, счётчики в `GET /api/admin/diagnostics`.

### База данных

- **better-sqlite3** (синхронный SQLite). Все запросы синхронные — `get()`, `all()`, `run()`.
- Хелперы объявлены в начале `server.js` (до `main()`):
  ```js
  function run(s, p=[]) { db.prepare(s).run(p); }
  function get(s, p=[]) { return db.prepare(s).get(p) ?? null; }
  function all(s, p=[]) { return db.prepare(s).all(p); }
  ```
- **КРИТИЧНО:** SQLite в newer версиях трактует `""` как имя колонки, не строку.  
  Всегда используй **одинарные кавычки** для строковых литералов:
  ```sql
  -- ✅ правильно
  WHERE content = '' AND created_at > datetime('now', '-1 day')
  -- ❌ сломает запрос (SqliteError: no such column)
  WHERE content = "" AND created_at > datetime("now")
  ```

### Фронтенд

- Vanilla JS SPA. Нет React, нет TypeScript, нет компонентов.
- Роутер: функция `go(page, param)` в `app.js`.
- Каждая страница — `render<Name>(appEl)` async-функция.
- Real-time — SSE (`/api/events`), клиент в `initEvents()`.
- Утилиты: `window.toast` (уведомления), `window.cn` (классы).

---

## Добавление нового функционала

### Новый API-маршрут

```js
// В server.js — ДО catch-all app.get('*', ...)
app.post('/api/something', auth, rateLimiter, async (req, res) => {
  try {
    const result = run('INSERT INTO ...', [req.body.field]);
    pushEvent(req.uid, 'event_name', { payload });
    res.json({ ok: true });
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});
```

Middleware:
- `auth` — требует авторизации, кладёт `req.uid`, `req.user`
- `oAuth` — опциональная авторизация
- `adminAuth` — только для администраторов
- Rate limiter: создать `rateLimit({ windowMs, max, keyGenerator: (r) => r.uid || r.ip })`

### Новая страница (фронтенд)

```js
// В app.js:
async function renderMyPage(app) {
  app.innerHTML = `<div>...</div>`;
  // навесить обработчики
}

// Добавить в go() → routes:
mypage: () => renderMyPage(app),

// Добавить в renderNav() → items (если нужен пункт меню):
{ id: 'mypage', label: '◎  Название', title: 'Описание' },
```

### Новая колонка в БД

**Никогда не редактируй существующий `CREATE TABLE`.**  
Добавляй только через `alterStatements` в `main()`:

```js
const alterStatements = [
  // существующие...
  'ALTER TABLE users ADD COLUMN new_field TEXT DEFAULT ""',
];
alterStatements.forEach(s => { try { db.exec(s); } catch {} });
```

### SSE-событие (real-time push)

```js
// Сервер (server.js):
pushEvent(userId, 'my_event', { data: 'payload' });

// Клиент (app.js → initEvents()):
eventSrc.addEventListener('my_event', e => {
  const data = JSON.parse(e.data);
  // обработка
});
```

---

## Защищённые данные — НЕ ТРОГАТЬ

| Объект | Причина |
|---|---|
| `data/` | Live-данные: БД, аватары, файлы пользователей |
| `.env` | Секреты: API-ключи, VAPID, токены |
| Пользователь `wf` | Admin-аккаунт владельца |
| Пользователь `vf` | Тестовый аккаунт |
| Пользователь `616` | Аккаунт друга |

Любые изменения `.env` и `data/` — только с явным подтверждением пользователя.

---

## Деплой на Synology

Команды для планировщика DSM: **`scripts/DSM-TASKS.md`**.

### Полный пересборка (зависимости, Dockerfile, **или фронт `public/`**)

```bash
cd /volume1/docker/w0pium
docker compose up --build -d
```

**`public/` и bind-mount:** в базовом `docker-compose.yml` каталог `public/` **не** монтируется с хоста — статика берётся из образа после `COPY public/` в Dockerfile. Иначе старые файлы на диске перекрыли бы образ, и пересборка не обновила бы UI. Для локальной правки `public/` без rebuild см. комментарии в `docker-compose.yml` и файл **`docker-compose.override.example.yml`** → скопировать в `docker-compose.override.yml` (он в `.gitignore`).

### Быстрый рестарт (только изменился server.js — без пересборки)

```bash
docker cp /volume1/docker/w0pium/server.js w0pium:/app/server.js
docker restart w0pium
```

### Проверка что задеплоилось

```bash
curl https://w0pium.walfir.com/api/health
# → {"ok":true,"uptime":...,"build":"<маркер>"}
```

Перед деплоем обновляй `build`-маркер в `/api/health`:
```js
app.get('/api/health', (req, res) =>
  res.json({ ok: true, uptime: process.uptime(), build: 'my-feature-name' })
);
```

### Логи

```bash
docker logs w0pium --tail 100 -f
# или через DSM Task Scheduler — Задача 6 → output.log
```

---

## Известные ловушки и уже решённые баги

### 1. CSP блокирует onclick-атрибуты (Helmet 7+)

**Проблема:** Helmet 7+ добавляет `script-src-attr 'none'` по умолчанию. Все `onclick="..."` в HTML становятся `null` — кнопки не реагируют на клики. Нет JS-ошибок.

**Фикс в `server.js`:**
```js
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      scriptSrcAttr: ["'unsafe-inline'"],  // ← обязательно
      // ...
    }
  }
}));
```

**Диагностика:** `typeof document.getElementById('burger').onclick` — если `"object"` (null), CSP режет обработчики.

---

### 2. SQLite: двойные кавычки = имя колонки

**Проблема:** `WHERE field = ""` вызывает `SqliteError: no such column`. Better-sqlite3 использует SQLite версию, где `""` — идентификатор.

**Правило:** всегда одинарные кавычки для литералов: `''`, `'now'`, `'%text%'`.

---

### 3. Dockerfile: native модули после --ignore-scripts

**Проблема:** `npm ci --ignore-scripts` нужен чтобы не упасть на `husky` (devDependency). Но `--ignore-scripts` также пропускает `postinstall` для better-sqlite3 и sharp — native bindings не компилируются, все DB-запросы падают с 500.

**Правильный Dockerfile:**
```dockerfile
RUN npm ci --omit=dev --ignore-scripts && npm rebuild better-sqlite3 sharp
```

---

### 4. git safe.directory на Windows (UNC-путь)

**Проблема:** `\\MedSkin\docker\w0pium` — сетевой путь, владелец файлов отличается от текущего пользователя Windows.

**Фикс (однократно):**
```bash
git config --global --add safe.directory "//MedSkin/docker/w0pium"
```

---

### 5. npm / ESLint на UNC-пути

**Проблема:** `npm` / `npm.cmd` поднимает **`cmd.exe`**, который **не держит UNC как cwd** → рабочая папка становится **`C:\Windows`**, отсюда `ENOENT` / `EPERM` на `package.json` / `package-lock.json`. В PowerShell **`npm.ps1`** ещё и ловит политику выполнения.

**Установка зависимостей с UNC:** только через **`pushd`** (даёт букву диска) или готовый **`scripts\npm-install.cmd`**:

```bat
"\\MedSkin\docker\w0pium\scripts\npm-install.cmd"
```

Или одной строкой из PowerShell:

```powershell
cmd /c "pushd \\MedSkin\docker\w0pium && npm install && popd"
```

**Lint без npm на UNC:** `package.json` вызывает **`node scripts/run-eslint.js`**. С UNC надёжно так:

```powershell
node "\\MedSkin\docker\w0pium\scripts\run-eslint.js"
```

Или обёртки (они вызывают только **node** + `run-eslint.js`):

```bat
"\\MedSkin\docker\w0pium\scripts\lint.cmd"
```

```powershell
& "\\MedSkin\docker\w0pium\scripts\lint.ps1"
```

Если репозиторий на **букве диска** (например после `pushd` / `subst`), обычный **`npm run lint`** снова ок:

```powershell
pushd \\MedSkin\docker\w0pium
npm run lint
popd
```

**E2E / Playwright** на этой машине без Docker CLI не гонялись; смоки — на NAS (`scripts/auto-pipeline.sh`) или после установки Docker: `npm run e2e:docker:smoke`.

---

## Текущее состояние проекта

### Последние коммиты (актуальное состояние)

| Коммит | Что сделано |
|---|---|
| `55f67b5` | fix: disable `upgrade-insecure-requests` CSP (Helmet v7 default — ломал весь сайт на HTTP) |
| `f4f685b` | fix: 12 багов — auth, security, UX, logic (IDOR на /disk/*, реакции, chat lazy-load и др.) |
| `2de6f0d` | fix: 13 багов — server.js + app.js (bcrypt async, SQL single-quotes, SSE payload и др.) |

> ⚠️ Эти коммиты **ещё не задеплоены** на NAS (Docker rebuild нужен). SSH на NAS недоступен — деплой нужно сделать вручную через DSM или когда SSH заработает.

### Работает полностью
- Авторизация, профили, подписки, лента, дропы
- Чаты (DM + групповые), голосовые сообщения
- Диск, поиск, уведомления, push
- Adminка, верификация, жалобы
- PWA, link preview, реакции, опросы, планировщик постов
- CSP-hardened UI events: inline DOM handlers migrated to delegated `data-post-action` flow (no `onclick`/`on*` attributes in `public/`)
- Observability baseline: every API response now returns `x-request-id`; error JSON includes `req_id`
- CSP debt audit script: `npm run audit:inline-handlers`
- DM command center: message action menu (reply/copy/edit/pin/forward/report/details/delete/save), richer file cards, media gallery tabs for photos/videos/audio/files/links, pinned/archive chats, saved messages modal, and read-receipt privacy based on the reader's own setting
- DM archive UX guard: archived chats must remain reachable from the top-level DM page; keep the archive toggle in `/chats`, not only inside an open chat sidebar.

### Требует настройки в `.env`
- **Email** (`RESEND_API_KEY`) — верификация и сброс пароля не работают без ключа
- **Push** (`VAPID_PUBLIC`, `VAPID_PRIVATE`) — Web Push не работает без ключей; **в production сервер не запустится** если ключи не заданы (fail-close)
- Сгенерировать VAPID: `node -e "const wp=require('web-push');const k=wp.generateVAPIDKeys();console.log(k)"`
- **Cloudflare Tunnel** (`CLOUDFLARE_TUNNEL_TOKEN`) — токен туннеля; в `docker-compose.yml` используется через `${CLOUDFLARE_TUNNEL_TOKEN}`

### В разработке / частично реализовано
- **Hub / федерация** — страница есть, логика распределённых узлов не завершена

---

### 5. Fail-close: сервер не стартует без обязательных секретов (production)

**Поведение:** При `NODE_ENV=production` сервер проверяет наличие `ENCRYPTION_KEY`, `MASTER_CODE`, `VAPID_PUBLIC`, `VAPID_PRIVATE`. Если хотя бы одна не задана — `process.exit(1)` при старте.

**Это намеренно** — не пытайся убрать или обойти проверку. Если сервер падает при старте, проверь `.env`.

---

### 6. upgrade-insecure-requests ломает HTTP-сервер

**Проблема:** Helmet v7 добавляет `upgrade-insecure-requests` в CSP по умолчанию. Директива заставляет браузер делать все суб-ресурсы (скрипты, CSS, API) через HTTPS. Если сервер — HTTP (за reverse proxy), все ресурсы возвращают 503: страница загружается как белый экран, JS не запускается вообще, ни одной JS-ошибки в консоли.

**Диагностика:** В DevTools → Network все ресурсы кроме HTML идут на `https://`, а не `http://`.

**Фикс** (уже применён в `server.js`):
```js
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      upgradeInsecureRequests: null, // ← отключить, сервер HTTP-only (за Cloudflare)
      scriptSrcAttr: ["'unsafe-inline'"],
      // ...
    }
  }
}));
```

---

### 7. isSsrfBlocked() — асинхронная функция (await обязателен)

**Проблема:** После добавления DNS-резолвинга `isSsrfBlocked()` стала async. Вызов без `await` вернёт `Promise<boolean>` вместо `boolean` — SSRF-защита будет broken.

**Правило:** всегда `await isSsrfBlocked(url)`:
```js
// ✅ правильно
if (await isSsrfBlocked(url)) return res.status(400).json({ error: 'Blocked' });

// ❌ сломает защиту (Promise всегда truthy)
if (isSsrfBlocked(url)) return res.status(400).json({ error: 'Blocked' });
```

---

## Локальный дев-сервер (без Docker)

Удобно для быстрого тестирования без пересборки Docker. Данные берутся с NAS через сетевой диск.

```powershell
# Из PowerShell на основной машине (WF, 192.168.129.161):
cd //MedSkin/docker/w0pium
DATA_DIR="//MedSkin/docker/w0pium/data" PORT=3001 NODE_ENV=development node server.js
```

**Важно: `NODE_ENV=development`** — без этого `.env` подтянет `production`, сессионная cookie получит флаг `Secure`, и сессии не будут работать по HTTP.

Откроется на `http://192.168.129.161:3001` с того же LAN. Продакшн-сервер в Docker при этом продолжает работать на `:3000`.

---

## Визуальный язык и брендинг W0PIUM

W0PIUM — закрытая соцсеть для артистов. Эстетика: **raw, underground, минимализм**. Никаких ярких градиентов, никакого "стартап-глянца". Всё жёсткое, чёрное, монопространственное.

### Цвета (CSS-переменные в `style.css`)

**Тёмная тема (default):**
```
--bg:      #050505   фоновый чёрный
--bg2:     #0c0c0c   карточки, панели
--bg3:     #141414   вложенные элементы
--bg4:     #1c1c1c   ховер, активные
--fg:      #e8e8e8   основной текст
--fg2:     #c2c2c2   вторичный текст
--fg3:     #aaaaaa   мьютед
--accent:  #ffffff   акцент (белый)
--border:  rgba(255,255,255,0.07)
--red:     #e84040
--green:   #3ddc84
--blue:    #4da6ff
```

**Светлая тема (`.light` на `<html>`):**
```
--bg:      #f5f3ef   тёплый бумажный белый
--accent:  #8b6a40   тёплый бронза/охра
```

### Типографика

| Применение | Шрифт |
|---|---|
| Основной UI | **Tektur** (variable, wght 400–700) |
| Fallback | **Exo 2** (300–700) |
| Моно / код | **Space Mono** (400, 700) |
| Заголовки / лого | **Syncopate** (400, 700) |

Все шрифты — Google Fonts, загружаются в `style.css`.  
Логотип в навигации: `W<span class="logo-zero">Ø</span>PIUM` — буква Ø через CSS.

### Иконки

Иконки — PNG из папки `/icons_cut/` (кастомный спрайт-пак, не font-awesome).  
В `app.js` — функция `iconCut(name, className, w, h)`:
```js
iconCut('home', 'ui-icon', 16, 16)
// → <img src="/icons_cut/home.png" class="ui-icon" width="16" height="16" alt="">
```

На светлой теме иконки инвертируются CSS-фильтром (`.light nav .nav-icon-img { filter: brightness(0) ... }`).

### Анимации

- **Canvas-фон** (`#bg`): анимированные белые точки-частицы, связанные линиями. Запускается в `(function initCanvas(){...})()` в `app.js`.
- **Smoke-переход** между страницами: `smokeTransition()` — появляется только при входе/выходе.
- **Lightbox** для изображений: blur-фон, свайп для закрытия на мобильном.

### Тон и язык интерфейса

- **Основной язык UI: русский.** Все кнопки, метки, тосты — по-русски.
- **Технические термины / бренд — английские:** FEED, DROPS, DISK, DM, W0PIUM, HUB.
- Формат меток: `КАПСЛОК` для заголовков и кнопок, строчные для вторичного текста.
- Никаких вопросительных знаков в UI. Никаких `.` в конце кнопок.

---

## Скрипты и автоматизация

Все скрипты в папке `scripts/`. На NAS путь `/volume1/docker/w0pium/scripts/`.

| Скрипт | Что делает |
|---|---|
| `auto-pipeline.sh` | Полный деплой: smoke → rebuild → healthcheck |
| `predeploy-and-deploy.sh` | То же, но без smoke (если Playwright не установлен) |
| `status-report.sh` | Health JSON + статус контейнера + последние 20 строк логов |
| `checklist.sh` | Health + smoke, без деплоя |
| `rollback-safe.sh` | Рестарт контейнера + healthcheck + логи |
| `backup-db.sh` | Копия `data/w0pium.db` с датой, удаляет копии старше 7 дней |
| `nightly-prod-smoke.sh` | Ночной smoke на продакшне (требует Playwright) |
| `reset-wf-vf.js` | Сброс паролей защищённых аккаунтов `wf` / `vf` |
| `npm-install.cmd` | npm install через `pushd` (обходит UNC-ограничение cmd.exe) |
| `lint.cmd` / `lint.ps1` | ESLint без npm на UNC-пути |
| `windows-docker-rebuild.ps1` | Rebuild через Docker Desktop на Windows |

### DSM Task Scheduler (Synology)

Задачи настроены в DSM → Task Scheduler (`synoscheduler/` в репо содержит их конфиги).

```sh
# Деплой (задача DSM):
cd /volume1/docker/w0pium && sh scripts/predeploy-and-deploy.sh

# Статус:
cd /volume1/docker/w0pium && sh scripts/status-report.sh

# Быстрый рестарт (только server.js, без rebuild):
docker cp /volume1/docker/w0pium/server.js w0pium:/app/server.js && docker restart w0pium
```

---

## QA и тестирование

### Тест-аккаунты (НИКОГДА не удалять)

| Username | Password | Роль |
|---|---|---|
| `wf` | `WF-W0PIUM-2026` | Главный admin |
| `vf` | `VF-W0PIUM-2026` | Тестовый юзер |
| `616` | спросить у владельца | Друг |

Для разовых тестов создавать временных пользователей через DB, после теста удалять.

### Playwright E2E

```sh
# Smoke на продакшне через Docker (не нужен локальный Playwright):
cd /volume1/docker/w0pium && sh scripts/e2e-docker.sh smoke-prod

# DM тест:
DM_E2E_USER='testqa' DM_E2E_PASS='...' DM_E2E_TARGET='vf' npm run e2e:dm:prod
```

### Проверка деплоя

```sh
curl https://w0pium.walfir.com/api/health
# → {"ok":true,"uptime":...,"build":"feature-name"}
```

Полный тест-чеклист — файл **`beta-test.md`** (80+ пунктов по всем разделам).  
ChatGPT/агент-тестировщик промпт — **`beta-test-agent-prompt.md`**.

---

## Работа с двумя параллельными агентами (Cursor)

### Концепция

Два агента работают **одновременно** в Cursor на одном репозитории:
- **Агент A** (DeepSeek Reasoner) — глубокий анализ, рассуждения, планирование, сложная логика
- **Агент B** (Claude Sonnet) — реализация, исправление кода, проверка Агента A

Это НЕ разные ветки — оба агента работают на одной `main` ветке. Координация через задачи и явное разграничение зон ответственности.

### Правила параллельной работы

**1. Один файл — один агент в данный момент**
Никогда не редактировать одновременно один и тот же файл. Разграничение:
- Агент A берёт `server.js` → Агент B не трогает `server.js` пока A не сделал `git add`
- Агент B берёт `app.js` → Агент A ждёт

**2. Atomic commits — маркер завершения**
`git commit` = сигнал "файл свободен". Другой агент может взять файл после коммита.

**3. Зоны без конфликтов**
| Агент A может | Агент B может |
|---|---|
| `server.js` (бэкенд) | `public/app.js` (фронтенд) |
| `public/style.css` | `public/pages/chat.js`, `pages/drops.js` |
| Новые API-маршруты | Новые фронтенд-страницы |
| `package.json` | `index.html`, `manifest.json` |

**4. Shared-файлы — только через очередь**
`AGENTS.md`, `CLAUDE.md`, `docker-compose.yml` — редактировать строго по очереди, явно указывая "я беру этот файл".

### Типичный сценарий

```
Агент A: "Делаю эндпоинт POST /api/events/pin в server.js"
  → пишет код
  → git commit "feat: add event pin endpoint"
  → "готово, server.js свободен"

Агент B: "Делаю UI для пина сообщения в app.js"
  → читает что сделал A (через git log / git show)
  → пишет фронтенд
  → git commit "feat: pin message UI"
```

### Что НЕ делать параллельно

- Не запускать `npm install` одновременно — локи `package-lock.json` сломаются
- Не делать `ALTER TABLE` в двух агентах сразу — race condition в миграциях
- Не менять `APP_VERSION` в двух местах

### Синхронизация через этот файл

Если агент нашёл новый баг или паттерн — **сразу добавляет в AGENTS.md** в раздел "Известные ловушки". Это база знаний для обоих агентов.

---

## Git workflow (обязательно)

1. `git status` перед любыми изменениями
2. Назвать файлы которые будут изменены
3. После изменений — `git diff --stat` + краткое описание
4. Коммит после каждой завершённой задачи:
   - `feat: ...` — новая функция
   - `fix: ...` — исправление
   - `refactor: ...` — рефакторинг
   - `style: ...` — CSS/UI
5. Без подтверждения пользователя НЕ изменять: `.env`, `data/`, Docker volumes, БД
