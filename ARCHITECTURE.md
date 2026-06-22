# W0PIUM — Architecture Manifesto

> **For AI agents (Cursor, Claude, DeepSeek). Read before writing ANY code.**
> **Last updated:** 2026-06-22

---

## 1. Stack (NON-NEGOTIABLE)

| Layer | Technology | Version / Note |
|-------|-----------|----------------|
| runtime | Node.js 20 | Docker `node:20-slim` |
| Backend | Express.js | Single file `server.js`, no framework wrappers |
| Database | **SQLite via better-sqlite3** | Sync API. **No ORM.** Raw SQL with prepared statements |
| Frontend | **Vanilla JS SPA** | No React, Vue, Svelte, or any framework |
| CSS | Tailwind v3 utility classes + custom `style.css` | `preflight: false` — own reset |
| Build | None (no Vite/webpack in prod) | `public/` served as-is |
| Realtime | SSE (Server-Sent Events) | `/api/events` endpoint; no WebSocket |
| Auth | Cookie-based tokens + bcrypt | Sessions in `sessions` table |
| Deploy | Docker Compose + Cloudflare Tunnel | Synology NAS (DSM 7.x) |

### HARD TABOOS

- NEVER add a new npm dependency without explicit approval
- NEVER introduce React, Vue, or any frontend framework
- NEVER introduce an ORM — raw SQL only via `db.prepare()`
- NEVER use async SQLite — `better-sqlite3` is synchronous
- NEVER add TypeScript — project is plain JavaScript
- NEVER create new `.js` files for frontend outside `public/pages/` or `public/utils/`
- NEVER change existing API route signatures — frontend depends on them
- NEVER touch `.env`, `data/`, users `wf`/`vf`/`616`
- NEVER use `innerHTML` with unsanitized data — use `esc()` function

---

## 2. File Structure

```
w0pium/
├── server.js          ← ALL backend logic (routes, DB, migrations, middleware)
├── package.json       ← version, scripts, dependencies
├── Dockerfile
├── docker-compose.yml
├── .env               ← SECRETS — NEVER TOUCH
│
├── public/            ← Frontend SPA (served as static)
│   ├── index.html     ← Shell, cache-bust version
│   ├── app.js         ← ALL frontend logic (~8100 lines)
│   ├── style.css      ← ALL custom styles + CSS variables
│   ├── service-worker.js
│   ├── manifest.json
│   ├── pages/         ← Page modules loaded into SPA router
│   │   ├── chat.js    ← Chat UI
│   │   └── drops.js   ← Drops UI (IntersectionObserver)
│   └── utils/         ← Shared frontend utilities
│       ├── toast.js   ← window.toast notification system
│       └── cn.js      ← window.cn className helper
│
├── data/              ← LIVE DATA — git-ignored, NEVER TOUCH
│   ├── w0pium.db      ← SQLite database
│   ├── avatars/
│   ├── images/
│   ├── files/
│   ├── msg_images/
│   └── disk/
│
├── scripts/           ← Deployment & maintenance
├── schema.sql         ← DB schema (auto-generated)
├── API.md             ← All endpoints reference
├── ARCHITECTURE.md    ← This file
├── design-system.md   ← Design tokens reference
├── components.md      ← Frontend function index
└── HANDOVER.md        ← Project handover doc
```

---

## 3. Backend Patterns

### Database

- All queries go through `db.prepare().get()/.all()/.run()`
- SQL parameters: ALWAYS use `?` placeholders (never string interpolation)
- Transactions: wrap in `db.transaction(() => { ... })()`
- Migrations: inline in `server.js` at the bottom, use `CREATE TABLE IF NOT EXISTS`
- Schema reference: see `schema.sql`

### Route Handlers

```js
// CORRECT — sync handler
app.get('/api/posts/:id', auth, (req, res) => {
  const post = db.prepare('SELECT ... WHERE id = ?').get(req.params.id);
  if (!post) return res.status(404).json({ error: 'Not found' });
  res.json({ post });
});

// CORRECT — async handler with try/catch
app.post('/api/example', auth, async (req, res, next) => {
  try {
    // async work
  } catch (e) {
    next(e);
  }
});
```

### Error Handling

- ALWAYS wrap async route handlers in try/catch
- Call `next(e)` to pass to Express error handler
- Log errors with `logger.error({ err: e, ...context }, 'message')`
- Global error handler at bottom of `server.js` catches unhandled

### Middleware Chain

```
helmet -> compression -> pinoHttp -> jsonParser -> cookieParser -> csrfCheck -> static -> routes -> 404 -> errorHandler
```

---

## 4. Frontend Patterns

### Routing (SPA)

- Custom hash-based router via `go(pageName, param, hist)`
- Pages: `feed`, `discover`, `explore`, `profile/:username`, `chat/:cid`, `settings`, `notifs`, `admin`, `hub`, `disk`, `bookmarks`, `hashtag/:tag`, `artists`, `search`, `drops`, `auth/login`, `auth/register`
- Navigation: `go('profile', 'username')` — DO NOT use `window.location.hash =`
- Always abort stale renders: `_renderGen` counter in `go()`

### DOM Manipulation

- Use `textContent` for text, `esc()` for attributes
- Use `saLSet(key, value)` instead of direct `localStorage.setItem()` (catches quota errors)
- Always remove event listeners and observers on navigation (cleanup in `go()`)

### CSS Integration

- Tailwind utilities: use for layout, spacing, typography
- Custom CSS variables: use for colors, borders, shadows (see `design-system.md`)
- Dark mode (default): `:root` variables
- Light mode: `:root.light` overrides
- Theme toggle: `toggleTheme()` — sets class + localStorage

---

## 5. Security Rules

1. **XSS**: Always escape user input — use `esc()` on frontend, parameterized queries on backend
2. **CSRF**: Handled by `csrfCheck` middleware using double-submit cookie pattern
3. **Rate Limiting**: All mutation endpoints have rate limiters (see `API.md`)
4. **Auth**: `auth` middleware checks token cookie -> sets `req.uid`; `adminAuth` adds role check
5. **IDOR**: Always verify ownership before mutation — check `user_id` field
6. **CSP**: Helmet headers; `upgradeInsecureRequests: null` (disabled — behind Cloudflare proxy)

---

## 6. Commit Style

- `fix:` — bug fixes
- `feat:` — new features
- `style:` — CSS/visual changes
- `chore:` — maintenance, deps, scripts
- `docs:` — documentation only
- `refactor:` — code restructuring without behavior change
- Commit messages in English, descriptive
- Co-author: `Co-Authored-By: AI Agent`

---

## 7. Dependencies (as of 0.9.27)

```
express, better-sqlite3, bcrypt, cookie-parser, dotenv,
helmet, pino, pino-http, compression, sharp, multer,
express-rate-limit, web-push, uuid, node-fetch
```
