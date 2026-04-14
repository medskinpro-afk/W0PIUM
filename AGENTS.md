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
- **`public/app.js`** — весь фронтенд: роутер, все страницы, SSE-клиент. Один файл ~5000+ строк.
- Нет микросервисов, нет слоёв, нет ORM.

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

### Полный пересборка (при изменении зависимостей или Dockerfile)

```bash
# Запускается через DSM Task Scheduler — Задача 4
cd /volume1/docker/w0pium
/usr/local/bin/docker compose up --build -d
```

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

## Текущее состояние проекта

### Работает полностью
- Авторизация, профили, подписки, лента, дропы
- Чаты (DM + групповые), голосовые сообщения
- Диск, поиск, уведомления, push
- Adminка, верификация, жалобы
- PWA, link preview, реакции, опросы, планировщик постов

### Требует настройки в `.env`
- **Email** (`RESEND_API_KEY`) — верификация и сброс пароля не работают без ключа
- **Push** (`VAPID_PUBLIC`, `VAPID_PRIVATE`) — Web Push не работает без ключей
- Сгенерировать VAPID: `node -e "const wp=require('web-push');const k=wp.generateVAPIDKeys();console.log(k)"`

### В разработке / частично реализовано
- **Hub / федерация** — страница есть, логика распределённых узлов не завершена

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
