# W0PIUM — Project Rules

## Stack

| Layer      | Tech                                      |
|------------|-------------------------------------------|
| Runtime    | Node.js 20+ / Express 4                   |
| Database   | better-sqlite3 (native SQLite, synchronous, file-based) |
| Frontend   | Vanilla JS SPA — no React, no TypeScript  |
| CSS        | Custom CSS vars + Tailwind utilities (via Vite/PostCSS) |
| Build tool | Vite 5 (dev server + CSS pipeline only)   |
| Auth       | Session cookie (`httpOnly`, `sameSite:lax`) |
| Realtime   | Server-Sent Events (`/api/events`)        |
| Email      | Resend API via native `fetch()`           |
| Files      | Multer → local disk under `DATA_DIR/`     |
| PWA        | Web App Manifest + Service Worker (cache-first for assets) |

## File Structure

```
w0pium/
├── server.js              # All Express routes + DB logic (single file)
├── public/
│   ├── index.html         # SPA shell — one page, no framework
│   ├── app.js             # All frontend logic (~2300+ lines, vanilla JS)
│   ├── style.css          # Custom CSS vars + Tailwind utilities
│   ├── manifest.json      # PWA manifest
│   ├── service-worker.js  # PWA service worker (cache-first assets, network-only API)
│   ├── utils/
│   │   ├── toast.js       # Sonner-style toast notifications (window.toast)
│   │   └── cn.js          # clsx-style class name utility (window.cn)
│   └── hooks/
│       └── useVoice.js    # MediaRecorder wrapper (legacy, not loaded in index.html)
├── data/                  # Runtime data (git-ignored)
│   ├── w0pium.db          # SQLite DB file (sql.js snapshot)
│   ├── avatars/
│   ├── images/
│   ├── files/
│   ├── msg_images/
│   └── disk/              # Shared file storage (DISK tab)
├── dist/                  # Vite production build output (git-ignored)
├── tailwind.config.js
├── postcss.config.js
├── vite.config.mjs
├── eslint.config.mjs
├── Dockerfile
├── docker-compose.yml
├── .env.example           # Copy to .env, fill in secrets
└── CLAUDE.md              # This file
```

## Development Workflow

```bash
# 1. Install
npm install

# 2. Copy env and fill in values
cp .env.example .env

# 3a. Start API server (port 3000)
npm start

# 3b. Start Vite dev server in a separate terminal (port 5173)
#     Proxies /api/* → :3000 automatically
npm run dev

# Lint + format
npm run lint
npm run format
```

For quick local testing without Vite, just open `http://localhost:3000` directly — Express serves `public/` as static and CSS runs without Tailwind purging (all classes present).

## Frontend Utilities

### `window.toast` — Toast notifications (`public/utils/toast.js`)
```js
toast('Сохранено')                             // default
toast.success('Готово')                        // green ✓
toast.error('Ошибка сервера')                  // red ✕, 5s
toast.loading('Загрузка...')                   // spinning ⟳, no auto-dismiss
toast.promise(fetchCall, {
  loading: 'Отправляем...',
  success: 'Отправлено',
  error:   'Ошибка',
})
```

### `window.cn` — Class name utility (`public/utils/cn.js`)
```js
cn('foo', 'bar')                          // → 'foo bar'
cn('foo', { bar: true, baz: false })      // → 'foo bar'
cn('base', condition && 'extra')          // conditional
```

### Voice recording (inline in `app.js`)
Button-based flow built directly into the chat composer:
- **Idle** — `#voiceBtn` 🎙 visible; click to start
- **Recording** — `#voiceRecBar` shown (✕ ОТМЕНА | pulsing dot | timer | ⏹ СТОП); mic hidden
- **Preview** — `#voicePreviewBar` shown (✕ ОТМЕНА | `<audio>` | ✓ ОТПРАВИТЬ)

Key functions: `startRecording(cid)`, `stopRecordingPreview()`, `cancelRecording()`, `sendVoiceMessage(cid, blob, mime)`

## Theme System

Dark (default) + Light mode. Toggle via nav → theme button; persisted in `localStorage`.
- Dark: `:root {}` in `style.css`
- Light: `:root.light {}` overrides in `style.css`
- `applyTheme(theme)` and `toggleTheme()` in `app.js` toggle `.light` on `<html>`
All design tokens live in `:root {}` in `style.css`; light overrides use same variable names.

## PWA

- `public/manifest.json` — app manifest (name, icons, theme color, display: standalone)
- `public/service-worker.js` — registered in `init()` via `navigator.serviceWorker.register`
  - Static assets: cache-first
  - `/api/*` and `/disk/*`: network-only (never cached)
  - SPA shell: network-first with fallback to cache
- Icons: `public/icons/icon-192.png` and `icon-512.png` (add manually)

## Database Patterns

```js
// Helpers defined at top of server.js (before main())
run(sql, params)   // INSERT / UPDATE / DELETE
get(sql, params)   // SELECT → single row object or null
all(sql, params)   // SELECT → array of row objects

// Schema migrations — add to alterStatements array, never edit CREATE TABLE
[
  'ALTER TABLE users ADD COLUMN new_col TEXT DEFAULT ""',
].forEach(s => { try { db.exec(s); } catch {} });
```

**Never edit existing `CREATE TABLE` statements** to add columns — always use `alterStatements`. This ensures existing DBs migrate safely on startup.

**CRITICAL — String literals in SQL:** Always use single quotes. Double quotes are treated as column identifiers in this SQLite version (causes `SqliteError: no such column`):
```js
// ✅ correct
get("SELECT * FROM posts WHERE content='' AND created_at > datetime('now','-1 day')", [])
// ❌ breaks at runtime
get('SELECT * FROM posts WHERE content="" AND created_at > datetime("now")', [])
```

## Adding a New Feature

### Backend route
1. Add the route in `server.js` before the `app.get('*', ...)` catch-all
2. Use `auth` middleware for protected routes, `oAuth` for optional auth
3. Use `adminAuth` for admin-only routes
4. Add a rate-limiter instance if the route is user-triggered (message, post, drop, etc.)
5. Push SSE events with `pushEvent(userId, eventName, payload)` for real-time updates

### Frontend page
1. Add a `render<PageName>(app)` async function in `app.js`
2. Add the route key to the `routes` object in `go()`
3. Add a nav item in `renderNav()` if it needs a nav link
4. Listen for SSE events in `initEvents()` if needed

### New DB table
1. Add `db.run('CREATE TABLE IF NOT EXISTS ...')` in `main()` after the existing creates
2. Add cascade deletes where appropriate (`ON DELETE CASCADE`)

## Security Rules

- All user input is parameterized (no string interpolation in SQL)
- File uploads: multer validates mime type; images limited to 5MB, files to 4GB
- Passwords: bcryptjs with cost factor 10
- Sessions: random UUID token stored in `httpOnly` cookie
- Rate limiting: `express-rate-limit` per route, UID-keyed for auth'd routes
- Security headers: `helmet()` applied globally
- Banned users: kicked from sessions immediately on ban, blocked by `auth` middleware
- Global error handler suppresses stack traces in production

**CRITICAL — Helmet CSP:** `helmet()` adds `script-src-attr 'none'` by default in v7+, which silently blocks all `onclick="..."` attribute handlers (they become `null`). Always include `scriptSrcAttr: ["'unsafe-inline'"]` in the CSP directives:
```js
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      scriptSrcAttr: ["'unsafe-inline'"],
      // ... other directives
    }
  }
}));
```

## CSS Conventions

- Custom design tokens live in `:root {}` in `style.css` — use `var(--name)`
- Light theme overrides live in `:root.light {}` — use same variable names
- Tailwind utilities (`preflight` disabled) can be added to HTML/app.js
- Never use inline styles except for dynamic values set by JS

## Commit Style

```
<verb> <what>

<optional body>

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
```

Prefixes: `feat`, `fix`, `refactor`, `style`, `docs`, `chore`
