const p = require('path');
require('dotenv').config({ path: p.join(__dirname, '.env') });

const express = require('express');
const crypto = require('crypto');
const helmet = require('helmet');
const compression = require('compression');
const { rateLimit } = require('express-rate-limit');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const cookieParser = require('cookie-parser');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const pino = require('pino');
const pinoHttp = require('pino-http');
const webpush = require('web-push');
const archiver = require('archiver');
const sharp = require('sharp');

const APP_VERSION = require('./package.json').version;

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });
const IS_PROD = process.env.NODE_ENV === 'production';
const RECENT_ERRORS = [];
const MAX_RECENT_ERRORS = 40;

// ── STARTUP SECRETS CHECK ──
// Fail immediately in production if critical secrets are missing.
if (IS_PROD) {
  const missing = ['ENCRYPTION_KEY', 'MASTER_CODE', 'VAPID_PUBLIC', 'VAPID_PRIVATE']
    .filter(k => !process.env[k]);
  if (missing.length) {
    logger.error({ missing }, 'FATAL: required env vars not set — refusing to start');
    process.exit(1);
  }
}

// ── EMAIL ENCRYPTION (AES-256-GCM) ──
// Key must be 32 bytes. In production ENCRYPTION_KEY is required (checked above).
// In development a deterministic fallback is used for convenience only.
const ENC_KEY = process.env.ENCRYPTION_KEY
  ? Buffer.from(process.env.ENCRYPTION_KEY, 'hex')
  : crypto.scryptSync('w0pium-dev-key', 'salt', 32);

function encryptEmail(plain) {
  if (!plain) return '';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', ENC_KEY, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return iv.toString('hex') + ':' + enc.toString('hex') + ':' + tag.toString('hex');
}

function decryptEmail(stored) {
  if (!stored || !stored.includes(':')) return stored; // plaintext (legacy)
  try {
    const [ivHex, encHex, tagHex] = stored.split(':');
    const decipher = crypto.createDecipheriv('aes-256-gcm', ENC_KEY, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    return decipher.update(Buffer.from(encHex, 'hex')) + decipher.final('utf8');
  } catch (e) {
    logger.warn({ error: e.message, stored: stored.slice(0, 20) + '...' }, 'email decryption failed');
    return stored; // fallback: return as-is if decryption fails
  }
}
function hashEmail(plain) {
  return crypto.createHmac('sha256', ENC_KEY).update((plain||'').toLowerCase()).digest('hex');
}
function makeCsrf(sessionToken) {
  return crypto.createHmac('sha256', ENC_KEY).update(sessionToken || '').digest('hex').slice(0, 32);
}

// ── RATE LIMITERS ──
const _rl = opts =>
  rateLimit({
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => res.status(429).json({ error: opts.message || 'Слишком много запросов' }),
    ...opts,
  });

const limiterRegister = _rl({ windowMs: 60_000, limit: 5,  message: 'Слишком много регистраций. Попробуй позже' });
const limiterLogin    = _rl({ windowMs: 60_000, limit: 10, message: 'Слишком много попыток. Попробуй позже' });
const limiterResend   = _rl({ windowMs: 300_000, limit: 3, message: 'Подожди немного' });
const limiterForgot      = _rl({ windowMs: 300_000, limit: 3,  message: 'Подожди немного' });
const limiterResetPwd    = _rl({ windowMs: 300_000, limit: 10, message: 'Подожди немного' });
const limiterPosts    = _rl({ windowMs: 60_000, limit: 10, keyGenerator: req => req.uid || req.ip, message: 'Слишком много постов. Попробуй позже' });
const limiterDrops    = _rl({ windowMs: 60_000, limit: 5,  keyGenerator: req => req.uid || req.ip, message: 'Слишком много дропов' });
const limiterMsg      = _rl({ windowMs: 60_000, limit: 20, keyGenerator: req => req.uid || req.ip, message: 'Слишком много сообщений. Попробуй позже' });
const limiterReport   = _rl({ windowMs: 60_000, limit: 5, keyGenerator: req => req.uid || req.ip });
const limiterExport = _rl({ windowMs: 3_600_000, limit: 3, keyGenerator: req => req.uid || req.ip, message: 'Подожди немного' });
const limiterPlay   = _rl({ windowMs: 60_000, limit: 30, keyGenerator: req => req.ip });
const limiterFiles    = _rl({ windowMs: 60_000, limit: 120, keyGenerator: req => req.uid || req.ip });
const limiterDmSearch = _rl({ windowMs: 60_000, limit: 30, keyGenerator: req => req.uid || req.ip });
const limiterTyping   = _rl({ windowMs: 10_000,  limit: 10, keyGenerator: req => req.uid || req.ip });
const limiterReact    = _rl({ windowMs: 60_000,  limit: 30, keyGenerator: req => req.uid || req.ip });
const limiterComment  = _rl({ windowMs: 60_000, limit: 20, keyGenerator: req => req.uid || req.ip, message: 'Слишком много комментариев' });
const limiterLinkPreview = _rl({ windowMs: 60_000, limit: 20, keyGenerator: req => req.uid || req.ip });
const limiterPostReact = _rl({ windowMs: 60_000, limit: 60, keyGenerator: req => req.uid || req.ip });
const limiterProfileUpdate = _rl({ windowMs: 60_000, limit: 20, keyGenerator: req => req.uid || req.ip, message: 'Слишком много изменений профиля' });
const limiterPasswordChange = _rl({ windowMs: 300_000, limit: 5, keyGenerator: req => req.uid || req.ip, message: 'Слишком много попыток смены пароля' });
const limiterSessionManage = _rl({ windowMs: 60_000, limit: 30, keyGenerator: req => req.uid || req.ip });
const limiterAccountDelete = _rl({ windowMs: 3_600_000, limit: 2, keyGenerator: req => req.uid || req.ip, message: 'Подожди немного перед повтором' });
const limiterAvatarUpload = _rl({ windowMs: 60_000, limit: 10, keyGenerator: req => req.uid || req.ip, message: 'Слишком много загрузок аватара' });
const limiterAdminJobTest = _rl({ windowMs: 60_000, limit: 30, keyGenerator: req => req.uid || req.ip });
const limiterFollow    = _rl({ windowMs: 60_000, limit: 30, keyGenerator: req => req.uid || req.ip, message: 'Слишком много подписок' });
const limiterBlockMute = _rl({ windowMs: 60_000, limit: 20, keyGenerator: req => req.uid || req.ip, message: 'Слишком много действий' });
const limiterLike      = _rl({ windowMs: 60_000, limit: 60, keyGenerator: req => req.uid || req.ip, message: 'Слишком много оценок' });

const PORT = process.env.PORT || 3000;
const DATA = process.env.DATA_DIR || './data';
const AVA_DIR  = p.join(DATA, 'avatars');
const IMG_DIR  = p.join(DATA, 'images');
const FILE_DIR = p.join(DATA, 'files');
const MSG_DIR  = p.join(DATA, 'msg_images');
const DISK_DIR = p.join(DATA, 'disk');
const DISK_PREV_DIR = p.join(DISK_DIR, 'previews');
const DB_PATH  = p.join(DATA, 'w0pium.db');
[AVA_DIR, IMG_DIR, MSG_DIR, FILE_DIR, DISK_DIR, DISK_PREV_DIR].forEach(d => fs.mkdirSync(d, { recursive: true }));

const INVITE_ONLY = process.env.INVITE_ONLY === '1';
let MASTER_CODE = (process.env.MASTER_CODE || '').toUpperCase();
if (!MASTER_CODE) {
  MASTER_CODE = crypto.randomUUID().slice(0, 8).toUpperCase();
  logger.info({ master_code: MASTER_CODE }, 'DEV: MASTER_CODE not set — generated random one-time code');
}
const RESEND_KEY  = process.env.RESEND_API_KEY || '';
const EMAIL_FROM  = process.env.EMAIL_FROM || 'onboarding@resend.dev';
const VAPID_PUBLIC  = process.env.VAPID_PUBLIC  || '';
const VAPID_PRIVATE = process.env.VAPID_PRIVATE || '';
// Only initialise web-push when both keys are present — push notifications
// are silently disabled otherwise (safe in dev, blocked by startup check in prod).
if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails('mailto:noreply@w0pium.app', VAPID_PUBLIC, VAPID_PRIVATE);
}

// ── SSRF GUARD ──────────────────────────────────────────────────────────────
// Block private/loopback/link-local IPs to prevent server-side request forgery.
// Two-stage check:
//   1. Regex on the raw hostname string (catches localhost, 10.x, 192.168.x etc.)
//   2. DNS resolution — resolves the hostname to an IP and re-checks the result,
//      which defeats alternate IP formats (0x7f000001, octal, decimal) and
//      DNS rebinding attacks where a hostname resolves to a private address.
const { promises: dns } = require('dns');
const _ssrfBlockedRe = /^(127\.|0\.0\.0\.0|localhost|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|::1|fc00:|fe80:)/i;
async function isSsrfBlocked(rawUrl) {
  try {
    const { hostname, protocol } = new URL(rawUrl);
    if (!['http:', 'https:'].includes(protocol)) return true;
    if (_ssrfBlockedRe.test(hostname)) return true;
    // Resolve to IP and re-check — catches non-standard formats and DNS rebinding
    const { address } = await dns.lookup(hostname, { verbatim: false });
    return _ssrfBlockedRe.test(address);
  } catch (e) { logger.debug({ url: rawUrl?.slice(0, 50), error: e.message }, 'SSRF check failed - blocking'); return true; }
}

let db;
function save() { /* better-sqlite3 writes directly to disk — no-op kept for SIGINT/SIGTERM compat */ }
function run(s, params = []) { return db.prepare(s).run(params); }
function get(s, params = []) { return db.prepare(s).get(params) ?? null; }
function all(s, params = []) { return db.prepare(s).all(params); }

function main() {
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, display_name TEXT NOT NULL,
    password TEXT NOT NULL, bio TEXT DEFAULT '', avatar TEXT DEFAULT '',
    link_sc TEXT DEFAULT '', link_ig TEXT DEFAULT '', link_tg TEXT DEFAULT '',
    link_spotify TEXT DEFAULT '', link_site TEXT DEFAULT '',
    is_private INTEGER NOT NULL DEFAULT 0, invite_code TEXT DEFAULT '',
    created_at DATETIME DEFAULT (datetime('now'))
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS posts (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, content TEXT NOT NULL,
    track_url TEXT DEFAULT '', image TEXT DEFAULT '', repost_of TEXT DEFAULT '',
    created_at DATETIME DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS likes (
    user_id TEXT NOT NULL, post_id TEXT NOT NULL, PRIMARY KEY (user_id, post_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS comments (
    id TEXT PRIMARY KEY, post_id TEXT NOT NULL, user_id TEXT NOT NULL,
    content TEXT NOT NULL, created_at DATETIME DEFAULT (datetime('now')),
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS follows (
    follower_id TEXT NOT NULL, following_id TEXT NOT NULL,
    PRIMARY KEY (follower_id, following_id),
    FOREIGN KEY (follower_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (following_id) REFERENCES users(id) ON DELETE CASCADE
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY, user_id TEXT NOT NULL,
    created_at DATETIME DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, from_id TEXT NOT NULL,
    type TEXT NOT NULL, ref_id TEXT DEFAULT '', seen INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (from_id) REFERENCES users(id) ON DELETE CASCADE
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY, created_at DATETIME DEFAULT (datetime('now'))
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS conversation_members (
    conv_id TEXT NOT NULL, user_id TEXT NOT NULL,
    last_read DATETIME DEFAULT (datetime('now')),
    PRIMARY KEY (conv_id, user_id),
    FOREIGN KEY (conv_id) REFERENCES conversations(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY, conv_id TEXT NOT NULL, sender_id TEXT NOT NULL,
    content TEXT NOT NULL, image TEXT DEFAULT '',
    created_at DATETIME DEFAULT (datetime('now')),
    FOREIGN KEY (conv_id) REFERENCES conversations(id) ON DELETE CASCADE,
    FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS message_reactions (
  msg_id TEXT NOT NULL, user_id TEXT NOT NULL, emoji TEXT NOT NULL,
  created_at DATETIME DEFAULT (datetime('now')),
  PRIMARY KEY (msg_id, user_id),
  FOREIGN KEY (msg_id) REFERENCES messages(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
)`);
  db.exec(`CREATE TABLE IF NOT EXISTS saved_messages (
  user_id TEXT NOT NULL, msg_id TEXT NOT NULL,
  created_at DATETIME DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, msg_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (msg_id) REFERENCES messages(id) ON DELETE CASCADE
)`);
  db.exec(`CREATE TABLE IF NOT EXISTS drops (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL,
    content TEXT DEFAULT '', track_url TEXT DEFAULT '', image TEXT DEFAULT '',
    created_at DATETIME DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS drop_views (
    drop_id TEXT NOT NULL, user_id TEXT NOT NULL,
    PRIMARY KEY (drop_id, user_id),
    FOREIGN KEY (drop_id) REFERENCES drops(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS disk_files (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL,
    name TEXT NOT NULL, size INTEGER DEFAULT 0,
    mime TEXT DEFAULT '', path TEXT NOT NULL,
    description TEXT DEFAULT '',
    created_at DATETIME DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS disk_folders (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    parent_id TEXT DEFAULT NULL,
    name TEXT NOT NULL,
    created_at DATETIME DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  reporter_id TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  reason TEXT DEFAULT '',
  status TEXT DEFAULT 'open',
  created_at DATETIME DEFAULT (datetime('now')),
  FOREIGN KEY (reporter_id) REFERENCES users(id) ON DELETE CASCADE
)`);
  db.exec(`CREATE TABLE IF NOT EXISTS push_subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  endpoint TEXT UNIQUE NOT NULL,
  p256dh TEXT NOT NULL,
  auth_key TEXT NOT NULL,
  created_at DATETIME DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
)`);
  db.exec(`CREATE TABLE IF NOT EXISTS verification_requests (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    badge_type TEXT NOT NULL DEFAULT 'artist',
    reason TEXT DEFAULT '',
    status TEXT DEFAULT 'pending',
    reviewed_by TEXT,
    created_at DATETIME DEFAULT (datetime('now')),
    reviewed_at DATETIME,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS hub_api_keys (
    platform TEXT PRIMARY KEY,
    api_key  TEXT NOT NULL DEFAULT '',
    updated_at DATETIME DEFAULT (datetime('now'))
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS polls (
  id TEXT PRIMARY KEY, post_id TEXT NOT NULL,
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
)`);
  db.exec(`CREATE TABLE IF NOT EXISTS poll_options (
  id TEXT PRIMARY KEY, poll_id TEXT NOT NULL, text TEXT NOT NULL,
  FOREIGN KEY (poll_id) REFERENCES polls(id) ON DELETE CASCADE
)`);
  db.exec(`CREATE TABLE IF NOT EXISTS poll_votes (
  poll_id TEXT NOT NULL, option_id TEXT NOT NULL, user_id TEXT NOT NULL,
  PRIMARY KEY (poll_id, user_id),
  FOREIGN KEY (poll_id) REFERENCES polls(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
)`);
  db.exec(`CREATE TABLE IF NOT EXISTS bookmarks (
  user_id TEXT NOT NULL, post_id TEXT NOT NULL,
  created_at DATETIME DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, post_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
)`);
  db.exec(`CREATE TABLE IF NOT EXISTS blocks (
  blocker_id TEXT NOT NULL, blocked_id TEXT NOT NULL,
  created_at DATETIME DEFAULT (datetime('now')),
  PRIMARY KEY (blocker_id, blocked_id),
  FOREIGN KEY (blocker_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (blocked_id) REFERENCES users(id) ON DELETE CASCADE
)`);
  db.exec(`CREATE TABLE IF NOT EXISTS mutes (
  muter_id TEXT NOT NULL, muted_id TEXT NOT NULL,
  created_at DATETIME DEFAULT (datetime('now')),
  PRIMARY KEY (muter_id, muted_id),
  FOREIGN KEY (muter_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (muted_id) REFERENCES users(id) ON DELETE CASCADE
)`);

  [
    'ALTER TABLE conversations ADD COLUMN is_group INTEGER NOT NULL DEFAULT 0',
    'ALTER TABLE conversations ADD COLUMN title TEXT DEFAULT \'\'',
    'ALTER TABLE conversations ADD COLUMN owner TEXT DEFAULT \'\'',
    'ALTER TABLE conversation_members ADD COLUMN role TEXT DEFAULT \'member\'',
    'ALTER TABLE messages ADD COLUMN file TEXT DEFAULT \'\'',
    'ALTER TABLE messages ADD COLUMN file_type TEXT DEFAULT \'\'',
    'ALTER TABLE messages ADD COLUMN file_size INTEGER DEFAULT 0',
    'ALTER TABLE messages ADD COLUMN edited_at DATETIME',
    'ALTER TABLE messages ADD COLUMN deleted_at DATETIME',
    'ALTER TABLE users ADD COLUMN is_private INTEGER NOT NULL DEFAULT 0',
    'ALTER TABLE users ADD COLUMN invite_code TEXT DEFAULT \'\'',
    'ALTER TABLE users ADD COLUMN email TEXT DEFAULT \'\'',
    'ALTER TABLE users ADD COLUMN email_verified INTEGER DEFAULT 0',
    'ALTER TABLE users ADD COLUMN email_token TEXT DEFAULT \'\'',
    'ALTER TABLE users ADD COLUMN email_token_exp DATETIME',
    'ALTER TABLE users ADD COLUMN is_admin INTEGER DEFAULT 0',
    'ALTER TABLE users ADD COLUMN banned_at DATETIME',
    'ALTER TABLE users ADD COLUMN ban_reason TEXT DEFAULT \'\'',
    'ALTER TABLE drops ADD COLUMN caption TEXT DEFAULT \'\'',
    'ALTER TABLE drops ADD COLUMN img TEXT DEFAULT \'\'',
    'ALTER TABLE drops ADD COLUMN expires_at DATETIME',
    'ALTER TABLE users ADD COLUMN used_code TEXT DEFAULT \'\'',
    'ALTER TABLE users ADD COLUMN email_hash TEXT DEFAULT \'\'',
    'ALTER TABLE messages ADD COLUMN file_name TEXT DEFAULT \'\'',
    "ALTER TABLE conversation_members ADD COLUMN accepted INTEGER DEFAULT 1",
    "ALTER TABLE users ADD COLUMN dm_requests INTEGER DEFAULT 1",
    "ALTER TABLE users ADD COLUMN pinned_post_id TEXT DEFAULT NULL",
    "ALTER TABLE users ADD COLUMN reset_token TEXT DEFAULT NULL",
    "ALTER TABLE users ADD COLUMN reset_token_exp DATETIME",
    "ALTER TABLE users ADD COLUMN is_verified INTEGER DEFAULT 0",
    "ALTER TABLE posts ADD COLUMN archived INTEGER DEFAULT 0",
    "ALTER TABLE posts ADD COLUMN play_count INTEGER DEFAULT 0",
    'ALTER TABLE users ADD COLUMN badge_type TEXT DEFAULT \'\'',
    'ALTER TABLE verification_requests ADD COLUMN reject_reason TEXT DEFAULT \'\'',
    'ALTER TABLE disk_files ADD COLUMN folder_id TEXT DEFAULT NULL',
    'ALTER TABLE disk_files ADD COLUMN public_token TEXT DEFAULT NULL',
    'ALTER TABLE posts ADD COLUMN text_pos TEXT NOT NULL DEFAULT \'above\'',
    'ALTER TABLE messages ADD COLUMN reply_to TEXT DEFAULT NULL',
    'ALTER TABLE messages ADD COLUMN reply_text TEXT DEFAULT \'\'',
    'ALTER TABLE users ADD COLUMN show_read_receipts INTEGER DEFAULT 1',
    'ALTER TABLE users ADD COLUMN show_typing INTEGER DEFAULT 1',
    'ALTER TABLE sessions ADD COLUMN ip TEXT DEFAULT \'\'',
    'ALTER TABLE sessions ADD COLUMN user_agent TEXT DEFAULT \'\'',
    'ALTER TABLE posts ADD COLUMN edited_at DATETIME',
    'CREATE TABLE IF NOT EXISTS follow_requests (id TEXT PRIMARY KEY, from_id TEXT NOT NULL, to_id TEXT NOT NULL, created_at DATETIME DEFAULT (datetime(\'now\')), FOREIGN KEY (from_id) REFERENCES users(id) ON DELETE CASCADE, FOREIGN KEY (to_id) REFERENCES users(id) ON DELETE CASCADE)',
    'CREATE TABLE IF NOT EXISTS post_reactions (post_id TEXT NOT NULL, user_id TEXT NOT NULL, emoji TEXT NOT NULL, created_at DATETIME DEFAULT (datetime(\'now\')), PRIMARY KEY (post_id, user_id), FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE, FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE)',
    'ALTER TABLE posts ADD COLUMN scheduled_at DATETIME DEFAULT NULL',
    'ALTER TABLE messages ADD COLUMN forwarded_from TEXT DEFAULT NULL',
    'ALTER TABLE conversations ADD COLUMN pinned_msg_id TEXT DEFAULT NULL',
    'ALTER TABLE conversation_members ADD COLUMN muted_until DATETIME DEFAULT NULL',
    'ALTER TABLE conversation_members ADD COLUMN pinned_at DATETIME DEFAULT NULL',
    'ALTER TABLE conversation_members ADD COLUMN archived_at DATETIME DEFAULT NULL',
    'ALTER TABLE users ADD COLUMN last_seen DATETIME DEFAULT NULL',
    'ALTER TABLE conversations ADD COLUMN avatar TEXT DEFAULT \'\'',
    'CREATE TABLE IF NOT EXISTS background_jobs (id TEXT PRIMARY KEY, type TEXT NOT NULL, status TEXT NOT NULL DEFAULT \'pending\', payload TEXT NOT NULL DEFAULT \'\', result TEXT NOT NULL DEFAULT \'\', error TEXT NOT NULL DEFAULT \'\', attempts INTEGER NOT NULL DEFAULT 0, max_attempts INTEGER NOT NULL DEFAULT 5, created_at TEXT DEFAULT (datetime(\'now\')), updated_at TEXT DEFAULT (datetime(\'now\')), run_after TEXT DEFAULT (datetime(\'now\')))',
    'ALTER TABLE disk_files ADD COLUMN preview_path TEXT DEFAULT \'\'',
    'ALTER TABLE comments ADD COLUMN parent_id TEXT DEFAULT \'\'',
    'ALTER TABLE comments ADD COLUMN edited_at DATETIME',
    'CREATE TABLE IF NOT EXISTS comment_likes (comment_id TEXT NOT NULL, user_id TEXT NOT NULL, created_at DATETIME DEFAULT (datetime(\'now\')), PRIMARY KEY (comment_id, user_id), FOREIGN KEY (comment_id) REFERENCES comments(id) ON DELETE CASCADE, FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE)',
    'CREATE INDEX IF NOT EXISTS idx_comments_post_parent ON comments(post_id, parent_id, created_at)',
    'CREATE INDEX IF NOT EXISTS idx_comment_likes_comment ON comment_likes(comment_id)',
  ].forEach(s => { try { db.exec(s); } catch (e) { logger.debug({ sql: s.slice(0, 60), error: e.message }, 'migration skipped'); } });
  try { run(`UPDATE background_jobs SET status='pending', updated_at=datetime('now') WHERE status='running'`); } catch (e) { logger.warn({ error: e.message }, 'background jobs reset failed'); }
  // FTS5 for full-text post search
  db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS posts_fts USING fts5(content, post_id UNINDEXED, tokenize='unicode61')`);
  db.exec(`CREATE TRIGGER IF NOT EXISTS posts_fts_insert AFTER INSERT ON posts BEGIN
    INSERT INTO posts_fts(content, post_id) VALUES(new.content, new.id);
  END`);
  db.exec(`CREATE TRIGGER IF NOT EXISTS posts_fts_update AFTER UPDATE OF content ON posts BEGIN
    UPDATE posts_fts SET content=new.content WHERE post_id=new.id;
  END`);
  db.exec(`CREATE TRIGGER IF NOT EXISTS posts_fts_delete AFTER DELETE ON posts BEGIN
    DELETE FROM posts_fts WHERE post_id=old.id;
  END`);
  // Populate FTS for existing posts (idempotent via INSERT OR IGNORE)
  try {
    db.exec(`INSERT OR IGNORE INTO posts_fts(content, post_id) SELECT content, id FROM posts WHERE content != ''`);
  } catch (e) { logger.debug({ error: e.message }, 'FTS population failed'); }

  // backfill expires_at for drops that have none
  try { db.exec('UPDATE drops SET expires_at=datetime(created_at,\'+24 hours\') WHERE expires_at IS NULL'); } catch (e) { logger.debug({ error: e.message }, 'drops expires_at backfill failed'); }
  // Grandfather existing users — they registered before email verification was required
  try { db.exec('UPDATE users SET email_verified=1 WHERE email=\'\' OR email IS NULL'); } catch (e) { logger.debug({ error: e.message }, 'users email_verified grandfathering failed'); }
  // Legacy bootstrap is disabled by default; enable only for one-off recovery.
  if (process.env.BOOTSTRAP_ADMIN_USERNAME) {
    try {
      run('UPDATE users SET is_admin=1 WHERE username=?', [process.env.BOOTSTRAP_ADMIN_USERNAME]);
      logger.warn(`bootstrap_admin: granted admin to ${process.env.BOOTSTRAP_ADMIN_USERNAME}`);
    } catch (e) { logger.debug({ error: e.message }, 'bootstrap admin failed'); }
  }

  // Performance indexes
  [
    'CREATE INDEX IF NOT EXISTS idx_posts_user_id ON posts(user_id)',
    'CREATE INDEX IF NOT EXISTS idx_posts_created ON posts(created_at DESC)',
    'CREATE INDEX IF NOT EXISTS idx_follows_follower ON follows(follower_id)',
    'CREATE INDEX IF NOT EXISTS idx_follows_following ON follows(following_id)',
    'CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conv_id)',
    'CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id)',
    'CREATE INDEX IF NOT EXISTS idx_notifs_user ON notifications(user_id, seen)',
    'CREATE INDEX IF NOT EXISTS idx_likes_post ON likes(post_id)',
    'CREATE INDEX IF NOT EXISTS idx_blocks_blocker ON blocks(blocker_id)',
    'CREATE INDEX IF NOT EXISTS idx_blocks_blocked ON blocks(blocked_id)',
    'CREATE INDEX IF NOT EXISTS idx_mutes_muter ON mutes(muter_id)',
    'CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)',
  ].forEach(s => { try { db.exec(s); } catch(e) { logger.warn('index: ' + e.message); } });

  const app = express();
  app.set('trust proxy', 1);
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc:  ["'self'"],
        scriptSrcAttr: ["'unsafe-inline'"],
        styleSrc:   ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc:    ["'self'", "https://fonts.gstatic.com"],
        imgSrc:     ["'self'", "data:", "blob:"],
        mediaSrc:   ["'self'", "blob:"],
        connectSrc: ["'self'"],
        frameSrc:   ["https://w.soundcloud.com"],
        workerSrc:  ["'self'", "blob:"],
        upgradeInsecureRequests: null, // disabled — server is HTTP-only (behind reverse proxy)
      }
    },
    crossOriginEmbedderPolicy: false,
  }));
  app.use(compression());
  app.use(pinoHttp({ logger, autoLogging: { ignore: req => req.url === '/api/events' } }));
  app.use((req, res, next) => {
    const reqId = req.headers['x-request-id'] || crypto.randomUUID();
    req.id = String(reqId);
    res.setHeader('x-request-id', req.id);
    next();
  });
  app.use(express.json());
  app.use(cookieParser());
  app.use(csrfCheck);
  app.use((req, res, next) => {
    if (
      req.path === '/' ||
      req.path === '/index.html' ||
      req.path === '/service-worker.js' ||
      /\.(?:js|css)$/.test(req.path)
    ) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
    next();
  });
  app.use(express.static(p.join(__dirname, 'public'), {
    etag: false,
    lastModified: false,
  }));
  app.use('/icons_cut', express.static(p.join(__dirname, 'icons_cut')));
  app.use('/avatars',    express.static(AVA_DIR));
  app.use('/images',     express.static(IMG_DIR));
  app.get('/msg_images/:file', auth, limiterFiles, (req, res) => {
    const fname = req.params.file;
    const allowed = get(
      `SELECT m.id FROM messages m JOIN conversation_members cm ON cm.conv_id=m.conv_id WHERE m.file=? AND cm.user_id=? LIMIT 1`,
      ['/msg_images/'+fname, req.uid]
    );
    if (!allowed) return res.status(403).end();
    res.sendFile(p.join(MSG_DIR, fname));
  });
  app.get('/files/:file', auth, limiterFiles, (req, res) => {
    const fname = req.params.file;
    const allowed = get(
      `SELECT m.id FROM messages m JOIN conversation_members cm ON cm.conv_id=m.conv_id WHERE m.file=? AND cm.user_id=? LIMIT 1`,
      ['/files/'+fname, req.uid]
    );
    if (!allowed) return res.status(403).end();
    res.sendFile(p.join(FILE_DIR, fname));
  });

  const lastSeenCache = new Map(); // uid → timestamp ms

  const clients = new Map();
  app.get('/api/events', auth, (req, res) => {
    res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.flushHeaders();
    const uid = req.uid;
    if (!clients.has(uid)) clients.set(uid, []);
    clients.get(uid).push(res);
    res.write(': connected\n\n');
    req.on('close', () => { clients.set(uid, (clients.get(uid)||[]).filter(r => r !== res)); });
  });

  const imgFilter = (req, file, cb) => /^image\/(jpeg|png|webp|gif)$/.test(file.mimetype) ? cb(null, true) : cb(new Error('Only images'));
  const avaUp  = multer({ dest: AVA_DIR,  limits: { fileSize: 2*1024*1024   }, fileFilter: imgFilter });
  const imgUp  = multer({ dest: IMG_DIR,  limits: { fileSize: 5*1024*1024   }, fileFilter: imgFilter });
  const dropUp = multer({ dest: IMG_DIR,  limits: { fileSize: 10*1024*1024  }, fileFilter: imgFilter });
  const fileFilter = (req, file, cb) => {
    // Block executable / script MIME types in chat uploads
    const blocked = /^(application\/(x-msdownload|x-executable|x-sh|x-bat|x-php|x-perl|x-python|x-ruby|javascript)|text\/(javascript|x-shellscript)|image\/svg\+xml)/i;
    if (blocked.test(file.mimetype)) return cb(new Error('File type not allowed'));
    cb(null, true);
  };
  const fileUp = multer({ dest: FILE_DIR, limits: { fileSize: 4*1024*1024*1024 }, fileFilter });

  function auth(req, res, next) {
    const t = req.cookies.token || req.headers['x-token'];
    if (!t) return res.status(401).json({ error:'unauthenticated' });
    const s = get('SELECT user_id FROM sessions WHERE token=?', [t]);
    if (!s) return res.status(401).json({ error:'unauthenticated' });
    const u = get('SELECT banned_at FROM users WHERE id=?', [s.user_id]);
    if (u && u.banned_at) return res.status(403).json({ error:'banned' });
    req.uid = s.user_id;
    const now = Date.now();
    const last = lastSeenCache.get(s.user_id) || 0;
    if (now - last > 60_000) { // update at most once per minute
      lastSeenCache.set(s.user_id, now);
      run('UPDATE users SET last_seen=datetime(\'now\') WHERE id=?', [s.user_id]);
    }
    next();
  }
  function adminAuth(req, res, next) {
    const t = req.cookies.token || req.headers['x-token'];
    if (!t) return res.status(401).json({ error:'unauthenticated' });
    const s = get('SELECT user_id FROM sessions WHERE token=?', [t]);
    if (!s) return res.status(401).json({ error:'unauthenticated' });
    const u = get('SELECT is_admin, banned_at FROM users WHERE id=?', [s.user_id]);
    if (!u || !u.is_admin) return res.status(403).json({ error:'forbidden' });
    if (u.banned_at) return res.status(403).json({ error:'banned' });
    req.uid = s.user_id; next();
  }
  function oAuth(req, res, next) {
    const t = req.cookies.token || req.headers['x-token'];
    if (t) { const s = get('SELECT user_id FROM sessions WHERE token=?', [t]); if (s) req.uid = s.user_id; }
    next();
  }
  function csrfCheck(req, res, next) {
    if (['GET','HEAD','OPTIONS'].includes(req.method)) return next();
    const noAuth = ['/api/login','/api/register','/api/verify-email','/api/resend-verification','/api/forgot-password','/api/reset-password'];
    if (noAuth.includes(req.path)) return next();
    const token = req.cookies.token || req.headers['x-token'];
    if (!token) return next(); // unauthenticated — skip
    const expected = makeCsrf(token);
    const sent = (req.headers['x-csrf-token'] || '').slice(0, 32).padEnd(32, '0');
    const expPad = expected.padEnd(32, '0');
    try {
      if (!crypto.timingSafeEqual(Buffer.from(sent), Buffer.from(expPad))) {
        return res.status(403).json({ error:'Неверный CSRF-токен' });
      }
    } catch (e) { logger.debug({ error: e.message }, 'CSRF timingSafeEqual failed'); return res.status(403).json({ error:'Неверный CSRF-токен' }); }
    next();
  }
  function notify(userId, fromId, type, refId) {
    if (userId === fromId) return;
    if (get('SELECT 1 FROM blocks WHERE (blocker_id=? AND blocked_id=?) OR (blocker_id=? AND blocked_id=?)', [userId,fromId,fromId,userId])) return;
    run('INSERT INTO notifications (id,user_id,from_id,type,ref_id) VALUES(?,?,?,?,?)', [uuidv4(),userId,fromId,type,refId||'']);
    const fromU = get('SELECT display_name FROM users WHERE id=?', [fromId]);
    const name = fromU?.display_name || 'Кто-то';
    const msgs = { like:'лайкнул твой пост', comment:'прокомментировал твой пост', follow:'подписался на тебя', follow_request:'хочет подписаться на тебя', repost:'репостнул твой пост', dm:'написал тебе' };
    if (msgs[type]) sendPush(userId, `W0PIUM · ${name}`, msgs[type], '/');
  }
  function publicEsc(v='') {
    return String(v).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  }
  function publicShareHtml({ title, description, image, url, type='website' }) {
    const origin = process.env.PUBLIC_ORIGIN || 'https://w0pium.walfir.com';
    const img = image ? new URL(image, origin).toString() : '';
    const canonical = url || origin;
    return `<!DOCTYPE html><html lang="ru"><head>
      <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${publicEsc(title)}</title>
      <meta name="description" content="${publicEsc(description)}">
      <meta property="og:type" content="${publicEsc(type)}">
      <meta property="og:title" content="${publicEsc(title)}">
      <meta property="og:description" content="${publicEsc(description)}">
      ${img ? `<meta property="og:image" content="${publicEsc(img)}">` : ''}
      <meta property="og:url" content="${publicEsc(canonical)}">
      <meta name="twitter:card" content="${img ? 'summary_large_image' : 'summary'}">
      <meta http-equiv="refresh" content="0;url=${publicEsc(canonical)}">
      <style>body{font-family:system-ui,sans-serif;background:#050505;color:#f5f5f5;display:grid;place-items:center;min-height:100vh;margin:0}main{max-width:620px;padding:24px}a{color:#fff}</style>
    </head><body><main><h1>${publicEsc(title)}</h1><p>${publicEsc(description)}</p><p><a href="${publicEsc(canonical)}">Open W0PIUM</a></p></main></body></html>`;
  }
  function pushEvent(userId, event, data) {
    const list = clients.get(userId);
    if (!list) return;
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    list.forEach(res => { try { res.write(payload); } catch (e) { logger.debug({ userId, event, error: e.message }, 'SSE write failed'); } });
  }
  function genCode() { return crypto.randomBytes(4).toString('hex').toUpperCase().slice(0,6); }
  function ensureInviteCode(userId) {
    const u = get('SELECT invite_code FROM users WHERE id=?', [userId]);
    if (u && u.invite_code) return u.invite_code;
    const code = genCode();
    run('UPDATE users SET invite_code=? WHERE id=?', [code, userId]);
    return code;
  }
  function enrichMessages(msgs, uid) {
    if (!msgs.length) return msgs;
    const ids = msgs.map(m => m.id);
    const ph = ids.map(() => '?').join(',');
    const rows = all(`SELECT emoji, user_id, msg_id FROM message_reactions WHERE msg_id IN (${ph})`, ids);
    const savedRows = uid ? all(`SELECT msg_id FROM saved_messages WHERE user_id=? AND msg_id IN (${ph})`, [uid, ...ids]) : [];
    const savedSet = new Set(savedRows.map(r => r.msg_id));
    const byMsg = {};
    rows.forEach(r => {
      if (!byMsg[r.msg_id]) byMsg[r.msg_id] = {};
      if (!byMsg[r.msg_id][r.emoji]) byMsg[r.msg_id][r.emoji] = { emoji: r.emoji, count: 0, users: [] };
      byMsg[r.msg_id][r.emoji].count++;
      byMsg[r.msg_id][r.emoji].users.push(r.user_id);
    });
    return msgs.map(m => ({
      ...m,
      saved: savedSet.has(m.id),
      reactions: Object.values(byMsg[m.id] || {})
        .map(r => ({ ...r, me: uid ? r.users.includes(uid) : false }))
    }));
  }

  function cleanUserFiles(uid) {
    // Disk files (+ async-generated previews)
    all('SELECT path, preview_path FROM disk_files WHERE user_id=?', [uid])
      .forEach(f => {
        try { if (f.path) fs.unlinkSync(p.join(DATA, f.path.replace(/^\//, ''))); } catch (e) { logger.debug({ path: f.path, error: e.message }, 'failed to delete disk file'); }
        try { if (f.preview_path) fs.unlinkSync(p.join(DATA, f.preview_path.replace(/^\//, ''))); } catch (e) { logger.debug({ preview: f.preview_path, error: e.message }, 'failed to delete preview'); }
      });
    // Avatar
    const u = get('SELECT avatar FROM users WHERE id=?', [uid]);
    if (u?.avatar) try { fs.unlinkSync(p.join(DATA, u.avatar.replace(/^\//, ''))); } catch (e) { logger.debug({ avatar: u.avatar, error: e.message }, 'failed to delete avatar'); }
    // Post images
    all('SELECT image FROM posts WHERE user_id=? AND image IS NOT NULL AND image != \'\'', [uid])
      .forEach(r => { try { fs.unlinkSync(p.join(DATA, r.image.replace(/^\//, ''))); } catch (e) { logger.debug({ image: r.image, error: e.message }, 'failed to delete post image'); } });
    // Message file attachments
    all('SELECT file FROM messages WHERE sender_id=? AND file IS NOT NULL AND file != \'\'', [uid])
      .forEach(r => { try { fs.unlinkSync(p.join(DATA, r.file.replace(/^\//, ''))); } catch (e) { logger.debug({ file: r.file, error: e.message }, 'failed to delete message file'); } });
    // Drop images
    all('SELECT image FROM drops WHERE user_id=? AND image IS NOT NULL AND image != \'\'', [uid])
      .forEach(r => { try { fs.unlinkSync(p.join(DATA, r.image.replace(/^\//, ''))); } catch (e) { logger.debug({ image: r.image, error: e.message }, 'failed to delete drop image'); } });
  }

  async function processImage(srcPath, destDir, opts = {}) {
    const id = require('crypto').randomBytes(16).toString('hex');
    const outName = id + '.webp';
    const outPath = p.join(destDir, outName);
    let s = sharp(srcPath);
    if (opts.width || opts.height) {
      s = s.resize(opts.width || null, opts.height || null, { fit: opts.fit || 'inside', withoutEnlargement: true });
    }
    await s.webp({ quality: 82 }).toFile(outPath);
    fs.unlinkSync(srcPath);
    return outName;
  }

  function _pathUnderDir(absPath, rootAbs) {
    const norm = p.resolve(absPath);
    const root = p.resolve(rootAbs);
    return norm === root || norm.startsWith(root + p.sep);
  }

  function enqueueBackgroundJob(type, payloadObj, maxAttempts = 5) {
    const id = uuidv4();
    const payload = JSON.stringify(payloadObj && typeof payloadObj === 'object' ? payloadObj : {});
    run(`INSERT INTO background_jobs (id,type,status,payload,max_attempts) VALUES(?,?,?,?,?)`, [id, type, 'pending', payload, maxAttempts]);
    return id;
  }

  async function executeBackgroundJob(job) {
    let payload = {};
    try { payload = JSON.parse(job.payload || '{}'); } catch (e) { logger.warn({ jobId: job.id, error: e.message }, 'failed to parse job payload'); payload = {}; }
    if (job.type === 'noop') return { ok: true };
    if (job.type === 'image_webp') {
      const { srcPath, destKey, opts } = payload;
      const dirMap = { images: IMG_DIR, avatars: AVA_DIR, msg_images: MSG_DIR };
      const destDir = dirMap[destKey];
      if (!destDir) throw new Error('invalid destKey');
      const resolvedSrc = p.resolve(srcPath);
      if (!_pathUnderDir(resolvedSrc, DATA)) throw new Error('invalid src path');
      if (!fs.existsSync(resolvedSrc)) throw new Error('src missing');
      const nm = await processImage(resolvedSrc, destDir, opts || {});
      return { outName: nm };
    }
    if (job.type === 'disk_image_preview') {
      const diskFileId = payload.disk_file_id;
      if (!diskFileId) throw new Error('missing disk_file_id');
      const df = get('SELECT path, mime FROM disk_files WHERE id=?', [diskFileId]);
      if (!df) return { skipped: true, reason: 'file_deleted' };
      const mime = (df.mime || '').toLowerCase();
      if (!mime.startsWith('image/')) return { skipped: true, reason: 'not_image' };
      const absSrc = p.resolve(p.join(DATA, df.path.replace(/^\/disk\//, 'disk/')));
      if (!_pathUnderDir(absSrc, DISK_DIR)) throw new Error('bad disk path');
      if (!fs.existsSync(absSrc)) throw new Error('source missing');
      fs.mkdirSync(DISK_PREV_DIR, { recursive: true });
      const outName = diskFileId + '.webp';
      const outAbs = p.join(DISK_PREV_DIR, outName);
      await sharp(absSrc).resize({ width: 320, withoutEnlargement: true }).webp({ quality: 78 }).toFile(outAbs);
      const previewRel = '/disk/previews/' + outName;
      run('UPDATE disk_files SET preview_path=? WHERE id=?', [previewRel, diskFileId]);
      return { preview_path: previewRel };
    }
    throw new Error('unknown job type');
  }

  let bgWorkerBusy = false;
  async function backgroundWorkerTick() {
    if (bgWorkerBusy) return;
    bgWorkerBusy = true;
    try {
      const pick = get(`SELECT id FROM background_jobs WHERE status='pending' AND datetime(run_after) <= datetime('now') ORDER BY created_at ASC LIMIT 1`);
      if (!pick) return;
      const info = db.prepare(`UPDATE background_jobs SET status='running', attempts=attempts+1, updated_at=datetime('now') WHERE id=? AND status='pending'`).run(pick.id);
      if (info.changes !== 1) return;
      const job = get(`SELECT * FROM background_jobs WHERE id=?`, [pick.id]);
      if (!job) return;
      try {
        const result = await executeBackgroundJob(job);
        run(`UPDATE background_jobs SET status='done', result=?, error='', updated_at=datetime('now') WHERE id=?`, [JSON.stringify(result), job.id]);
      } catch (e) {
        const attempts = job.attempts;
        const maxA = job.max_attempts || 5;
        const errMsg = String(e && e.message ? e.message : e);
        if (attempts >= maxA) {
          run(`UPDATE background_jobs SET status='failed', error=?, updated_at=datetime('now') WHERE id=?`, [errMsg, job.id]);
        } else {
          const delaySec = Math.min(300, 5 * attempts * attempts);
          run(`UPDATE background_jobs SET status='pending', error=?, run_after=datetime('now', ?), updated_at=datetime('now') WHERE id=?`, [errMsg, `+${delaySec} seconds`, job.id]);
        }
        logger.error({ err: e, jobId: job.id, jobType: job.type }, 'background job failed');
      }
    } finally {
      bgWorkerBusy = false;
    }
  }

  async function sendEmail(to, subject, html) {
    if (!RESEND_KEY) {
      logger.info({ to, subject }, '[email] dev fallback — no RESEND_API_KEY');
      return;
    }
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: EMAIL_FROM, to, subject, html })
    });
    if (!r.ok) logger.error({ status: r.status, body: await r.text() }, '[email] send failed');
  }

  async function sendPush(userId, title, body, url) {
    const subs = all('SELECT endpoint,p256dh,auth_key FROM push_subscriptions WHERE user_id=?', [userId]);
    for (const sub of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } },
          JSON.stringify({ title, body, url: url || '/', tag: url || '/' })
        );
      } catch (e) {
        if (e.statusCode === 410 || e.statusCode === 404) {
          run('DELETE FROM push_subscriptions WHERE endpoint=?', [sub.endpoint]);
        } else {
          logger.debug({ endpoint: sub.endpoint.slice(0, 30), error: e.message }, 'push notification failed');
        }
      }
    }
  }

  // AUTH
  app.post('/api/register', limiterRegister, async (req, res) => {
    const { username, display_name, password, email, invite_code } = req.body;
    if (!username||!password||!display_name||!email) return res.status(400).json({ error:'Заполни все поля' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error:'Неверный формат email' });
    if (username.length<2||username.length>24) return res.status(400).json({ error:'Username 2-24 символов' });
    if (!/^[a-z0-9_]+$/.test(username)) return res.status(400).json({ error:'Только a-z, 0-9, _' });
    if (password.length<8) return res.status(400).json({ error:'Пароль должен быть не менее 8 символов' });
    const hasLetter = /[a-zA-Zа-яА-Я]/.test(password);
    const hasDigit  = /[0-9]/.test(password);
    if (!hasLetter || !hasDigit) return res.status(400).json({ error: 'Пароль должен содержать буквы и цифры' });
    if (INVITE_ONLY) {
      if (!invite_code) return res.status(400).json({ error:'Нужен инвайт-код' });
      const upper = invite_code.toUpperCase();
      if (upper !== MASTER_CODE && !get('SELECT id FROM users WHERE invite_code=?', [upper]))
        return res.status(400).json({ error:'Неверный инвайт-код' });
    }
    if (get('SELECT id FROM users WHERE LOWER(username)=LOWER(?)', [username])) return res.status(409).json({ error:'Username занят' });
    if (get('SELECT id FROM users WHERE email_hash=?', [hashEmail(email)])) return res.status(409).json({ error:'Email уже используется' });
    const id = uuidv4(), hash = bcrypt.hashSync(password,10), myCode = genCode();
    const verifyToken = String(crypto.randomInt(100000, 1000000));
    const tokenExp = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const usedCode = invite_code ? invite_code.toUpperCase() : '';
    run('INSERT INTO users (id,username,display_name,password,invite_code,used_code,email,email_hash,email_token,email_token_exp) VALUES(?,?,?,?,?,?,?,?,?,?)',
      [id,username,display_name,hash,myCode,usedCode,encryptEmail(email),hashEmail(email),verifyToken,tokenExp]);
    await sendEmail(email, 'W0PIUM — подтверди email',
      `<p>Привет, ${display_name}!</p><p>Твой код подтверждения: <strong style="font-size:24px;letter-spacing:4px">${verifyToken}</strong></p><p>Действует 15 минут.</p>`);
    res.json({ ok:1, pending:true });
  });

  app.post('/api/login', limiterLogin, (req, res) => {
    const { username, password } = req.body;
    // accept email OR username (case-insensitive)
    const u = get("SELECT * FROM users WHERE LOWER(username)=LOWER(?) OR (email_hash!='' AND email_hash=?)", [username, hashEmail(username)]);
    if (!u||!bcrypt.compareSync(password,u.password)) return res.status(401).json({ error:'Неверные данные' });
    if (!u.email_verified) return res.status(403).json({ error:'Email не подтверждён', pending:true });
    const token = uuidv4();
    run('INSERT INTO sessions (token,user_id,ip,user_agent) VALUES(?,?,?,?)', [token, u.id, req.ip||'', (req.headers['user-agent']||'').slice(0,200)]);
    res.cookie('token', token, { httpOnly:true, maxAge:30*24*3600000, sameSite:'lax', secure:process.env.NODE_ENV==='production' });
    res.json({ ok:1, user:{ id:u.id, username:u.username, display_name:u.display_name } });
  });

  // DEV ONLY — get email verification code by username (no auth needed)
  if (process.env.NODE_ENV !== 'production') {
    app.get('/api/dev/email-code/:username', (req, res) => {
      const u = get('SELECT username, email_token, email_token_exp, email_verified FROM users WHERE username=?', [req.params.username]);
      if (!u) return res.status(404).json({ error: 'not found' });
      res.json(u);
    });
  }

  app.post('/api/verify-email', limiterResend, (req, res) => {
    const { username, token } = req.body;
    if (!username || !token) return res.status(400).json({ error:'Нет данных' });
    const u = get('SELECT * FROM users WHERE username=?', [username]);
    if (!u) return res.status(404).json({ error:'Пользователь не найден' });
    // Already verified — don't create a new session without password auth
    if (u.email_verified) return res.json({ ok:1, already_verified:true });
    if (u.email_token_exp && new Date(u.email_token_exp) < new Date())
      return res.status(400).json({ error:'Код истёк. Запроси новый' });
    if (!u.email_token || u.email_token !== String(token).trim())
      return res.status(400).json({ error:'Неверный код' });
    run('UPDATE users SET email_verified=1, email_token=\'\', email_token_exp=NULL WHERE id=?', [u.id]);
    const t = uuidv4();
    run('INSERT INTO sessions (token,user_id,ip,user_agent) VALUES(?,?,?,?)', [t, u.id, req.ip||'', (req.headers['user-agent']||'').slice(0,200)]);
    res.cookie('token', t, { httpOnly:true, maxAge:30*24*3600000, sameSite:'lax', secure:process.env.NODE_ENV==='production' });
    res.json({ ok:1 });
  });

  app.post('/api/resend-verification', limiterResend, async (req, res) => {
    const { username } = req.body;
    const u = get('SELECT * FROM users WHERE username=?', [username]);
    if (!u || u.email_verified) return res.json({ ok:1 });
    const verifyToken = String(crypto.randomInt(100000, 1000000));
    const tokenExp = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    run('UPDATE users SET email_token=?, email_token_exp=? WHERE id=?', [verifyToken, tokenExp, u.id]);
    try {
      await sendEmail(decryptEmail(u.email), 'W0PIUM — новый код',
        `<p>Новый код: <strong style="font-size:24px;letter-spacing:4px">${verifyToken}</strong></p><p>Действует 15 минут.</p>`);
    } catch (e) { logger.warn({ error: e.message, user: u.id }, 'resend verification email failed'); }
    res.json({ ok:1 });
  });

  app.post('/api/forgot-password', limiterForgot, async (req, res) => {
    const { email } = req.body;
    if (!email) return res.json({ ok:1 });
    const u = get('SELECT id,email,display_name,email_verified FROM users WHERE email_hash=?', [hashEmail(email)]);
    if (!u || !u.email_verified) return res.json({ ok:1 }); // don't leak existence
    const token = String(crypto.randomInt(100000, 1000000));
    const exp = new Date(Date.now() + 15*60*1000).toISOString();
    run('UPDATE users SET reset_token=?, reset_token_exp=? WHERE id=?', [token, exp, u.id]);
    try {
      await sendEmail(decryptEmail(u.email), 'W0PIUM — сброс пароля',
        `<p>Твой код для сброса пароля: <strong style="font-size:24px;letter-spacing:4px">${token}</strong></p><p>Действует 15 минут.</p>`);
    } catch (e) { logger.warn({ error: e.message, user: u.id }, 'password reset email failed'); }
    res.json({ ok:1 });
  });

  app.post('/api/reset-password', limiterResetPwd, async (req, res) => {
    const { email, token, password } = req.body;
    if (!email || !token || !password || password.length < 8) return res.status(400).json({ error:'Заполни все поля' });
    const u = get('SELECT id,reset_token,reset_token_exp FROM users WHERE email_hash=?', [hashEmail(email)]);
    if (!u || u.reset_token !== token) return res.status(400).json({ error:'Неверный код' });
    if (!u.reset_token_exp || new Date(u.reset_token_exp) < new Date()) return res.status(400).json({ error:'Код устарел' });
    const hash = await bcrypt.hash(password, 10);
    run('UPDATE users SET password=?, reset_token=NULL, reset_token_exp=NULL WHERE id=?', [hash, u.id]);
    // Invalidate all existing sessions after password reset
    run('DELETE FROM sessions WHERE user_id=?', [u.id]);
    res.json({ ok:1 });
  });

  const doLogout = (req, res) => {
    run('DELETE FROM sessions WHERE token=?', [req.cookies.token||req.headers['x-token']]);
    res.clearCookie('token');
    if (req.method === 'GET') return res.redirect('/');
    res.json({ ok:1 });
  };
  app.post('/api/logout', auth, limiterSessionManage, doLogout);
  app.get('/api/logout', doLogout);

  // SESSION MANAGEMENT
  app.get('/api/sessions', auth, (req,res) => {
    const sessions = all('SELECT token, ip, user_agent, created_at FROM sessions WHERE user_id=? ORDER BY created_at DESC', [req.uid]);
    const currentToken = req.cookies.token || req.headers['x-token'];
    res.json(sessions.map(s => ({ ...s, is_current: s.token === currentToken, token: s.token.slice(0,8)+'...' })));
  });
  app.delete('/api/sessions/others', auth, limiterSessionManage, (req,res) => {
    const current = req.cookies.token || req.headers['x-token'];
    run('DELETE FROM sessions WHERE user_id=? AND token!=?', [req.uid, current]);
    res.json({ ok:1 });
  });
  app.delete('/api/sessions/all', auth, limiterSessionManage, (req,res) => {
    run('DELETE FROM sessions WHERE user_id=?', [req.uid]);
    res.clearCookie('token');
    res.json({ ok:1, logout:true });
  });

  app.get('/api/me', auth, (req, res) => {
    const u = get('SELECT id,username,display_name,bio,avatar,link_sc,link_ig,link_tg,link_spotify,link_site,is_private,is_admin,invite_code,dm_requests,show_read_receipts,show_typing,is_verified,badge_type FROM users WHERE id=?', [req.uid]);
    const unseen = get('SELECT COUNT(*) AS c FROM notifications WHERE user_id=? AND seen=0', [req.uid]);
    const unreadChats = get('SELECT COUNT(DISTINCT m.conv_id) AS c FROM messages m JOIN conversation_members cm ON cm.conv_id=m.conv_id AND cm.user_id=? WHERE m.sender_id!=? AND m.created_at>cm.last_read AND m.deleted_at IS NULL', [req.uid, req.uid]);
    const sessionToken = req.cookies.token || req.headers['x-token'];
    res.json({ ...u, notif_count: unseen?.c||0, unread_chats: unreadChats?.c||0, csrf_token: makeCsrf(sessionToken) });
  });

  // PROFILE
  app.put('/api/profile', auth, limiterProfileUpdate, (req, res) => {
    const safeLink = u => { const s=(u||'').trim(); return (s&&s.startsWith('https://'))?s:''; };
    const { display_name,bio,is_private,dm_requests,show_read_receipts,show_typing } = req.body;
    const link_sc=safeLink(req.body.link_sc), link_ig=safeLink(req.body.link_ig),
          link_tg=safeLink(req.body.link_tg), link_spotify=safeLink(req.body.link_spotify),
          link_site=safeLink(req.body.link_site);
    run('UPDATE users SET display_name=?,bio=?,link_sc=?,link_ig=?,link_tg=?,link_spotify=?,link_site=?,is_private=?,dm_requests=?,show_read_receipts=?,show_typing=? WHERE id=?',
      [display_name||'',bio||'',link_sc,link_ig,link_tg,link_spotify,link_site,is_private?1:0,dm_requests?1:0,show_read_receipts?1:0,show_typing?1:0,req.uid]);
    res.json({ ok:1 });
  });
  app.put('/api/password', auth, limiterPasswordChange, async (req, res) => {
    const { old_password,new_password } = req.body||{};
    if (!old_password||!new_password) return res.status(400).json({ error:'Заполни все поля' });
    if (new_password.length<8) return res.status(400).json({ error:'Пароль должен быть не менее 8 символов' });
    const _hasLetter = /[a-zA-Zа-яА-Я]/.test(new_password);
    const _hasDigit  = /[0-9]/.test(new_password);
    if (!_hasLetter || !_hasDigit) return res.status(400).json({ error: 'Пароль должен содержать буквы и цифры' });
    const u = get('SELECT password FROM users WHERE id=?', [req.uid]);
    if (!u||!bcrypt.compareSync(old_password,u.password)) return res.status(400).json({ error:'Неверный текущий пароль' });
    run('UPDATE users SET password=? WHERE id=?', [await bcrypt.hash(new_password,10),req.uid]);
    res.json({ ok:1 });
  });
  app.delete('/api/me', auth, limiterAccountDelete, (req, res) => {
    cleanUserFiles(req.uid);
    run('DELETE FROM users WHERE id=?', [req.uid]);
    res.clearCookie('token'); res.json({ ok:1 });
  });
  app.post('/api/invite/rotate', auth, (req, res) => {
    const code = genCode();
    run('UPDATE users SET invite_code=? WHERE id=?', [code, req.uid]);
    res.json({ ok:1, invite_code: code });
  });
  app.post('/api/avatar', auth, limiterAvatarUpload, avaUp.single('avatar'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error:'No file' });
    try {
      const nm = await processImage(req.file.path, AVA_DIR, { width: 400, height: 400, fit: 'cover' });
      run('UPDATE users SET avatar=? WHERE id=?', ['/avatars/'+nm, req.uid]);
      res.json({ avatar: '/avatars/'+nm });
    } catch(e) {
      logger.error(e, 'avatar processImage failed');
      // fallback: just rename as-is
      const ext = p.extname(req.file.originalname) || '.jpg';
      const nm = req.uid + ext;
      try { fs.renameSync(req.file.path, p.join(AVA_DIR, nm)); } catch (e) { logger.debug({ path: req.file.path, error: e.message }, 'failed to rename avatar fallback'); }
      run('UPDATE users SET avatar=? WHERE id=?', ['/avatars/'+nm, req.uid]);
      res.json({ avatar: '/avatars/'+nm });
    }
  });

  app.get('/api/user/:u', oAuth, (req, res) => {
    const u = get('SELECT id,username,display_name,bio,avatar,link_sc,link_ig,link_tg,link_spotify,link_site,is_private,pinned_post_id,created_at,is_verified,badge_type,last_seen FROM users WHERE username=?', [req.params.u]);
    if (!u) return res.status(404).json({ error:'Not found' });
    const followers = get('SELECT COUNT(*) AS c FROM follows WHERE following_id=?',[u.id]).c;
    const following = get('SELECT COUNT(*) AS c FROM follows WHERE follower_id=?',[u.id]).c;
    const posts     = get('SELECT COUNT(*) AS c FROM posts WHERE user_id=?',[u.id]).c;
    let is_following = false;
    if (req.uid) is_following = !!get('SELECT 1 AS x FROM follows WHERE follower_id=? AND following_id=?',[req.uid,u.id]);
    const is_blocked = req.uid ? !!get('SELECT 1 FROM blocks WHERE blocker_id=? AND blocked_id=?', [req.uid, u.id]) : false;
    const blocks_me  = req.uid ? !!get('SELECT 1 FROM blocks WHERE blocker_id=? AND blocked_id=?', [u.id, req.uid]) : false;
    const is_muted   = req.uid ? !!get('SELECT 1 FROM mutes WHERE muter_id=? AND muted_id=?', [req.uid, u.id]) : false;
    const is_pending = req.uid ? !!get('SELECT 1 FROM follow_requests WHERE from_id=? AND to_id=?', [req.uid, u.id]) : false;
    res.json({ ...u, followers, following, posts, is_following, is_pending, is_blocked, blocks_me, is_muted });
  });

  app.get('/api/user/:u/followers', oAuth, (req, res) => {
    const u = get('SELECT id FROM users WHERE username=?', [req.params.u]);
    if (!u) return res.status(404).json({ error:'Not found' });
    const list = all('SELECT u.username,u.display_name,u.avatar,u.is_verified,u.badge_type FROM follows f JOIN users u ON u.id=f.follower_id WHERE f.following_id=? ORDER BY f.rowid DESC LIMIT 100', [u.id]);
    res.json(list);
  });
  app.get('/api/user/:u/following', oAuth, (req, res) => {
    const u = get('SELECT id FROM users WHERE username=?', [req.params.u]);
    if (!u) return res.status(404).json({ error:'Not found' });
    const list = all('SELECT u.username,u.display_name,u.avatar,u.is_verified,u.badge_type FROM follows f JOIN users u ON u.id=f.following_id WHERE f.follower_id=? ORDER BY f.rowid DESC LIMIT 100', [u.id]);
    res.json(list);
  });

  // FOLLOW
  app.post('/api/follow/:id', auth, limiterFollow, (req, res) => {
    if (req.params.id === req.uid) return res.status(400).json({ error:'no' });
    const target = get('SELECT id,is_private FROM users WHERE id=?', [req.params.id]);
    if (!target) return res.status(404).json({ error:'not found' });
    // Already following — idempotent
    if (get('SELECT 1 FROM follows WHERE follower_id=? AND following_id=?', [req.uid, req.params.id]))
      return res.json({ ok:1 });
    if (target.is_private) {
      // Already requested — idempotent
      if (get('SELECT 1 FROM follow_requests WHERE from_id=? AND to_id=?', [req.uid, req.params.id]))
        return res.json({ ok:1, pending:true });
      run('INSERT INTO follow_requests (id,from_id,to_id) VALUES(?,?,?)', [uuidv4(), req.uid, req.params.id]);
      notify(target.id, req.uid, 'follow_request', '');
      pushEvent(target.id, 'follow_request', { from_id: req.uid });
      return res.json({ ok:1, pending:true });
    }
    try {
      run('INSERT INTO follows (follower_id,following_id) VALUES(?,?)', [req.uid, req.params.id]);
      notify(req.params.id, req.uid, 'follow', '');
      pushEvent(req.params.id, 'notif', { type:'follow', ref:'' });
    } catch (e) { logger.debug({ error: e.message }, 'follow notification failed'); }
    res.json({ ok:1 });
  });
  app.delete('/api/follow/:id', auth, limiterFollow, (req, res) => {
    run('DELETE FROM follows WHERE follower_id=? AND following_id=?', [req.uid, req.params.id]);
    run('DELETE FROM follow_requests WHERE from_id=? AND to_id=?', [req.uid, req.params.id]);
    res.json({ ok:1 });
  });

  // FOLLOW REQUESTS
  app.get('/api/follow-requests', auth, (req, res) => {
    const requests = all(`SELECT fr.id, fr.created_at, u.id AS from_id, u.username, u.display_name, u.avatar
      FROM follow_requests fr JOIN users u ON fr.from_id=u.id
      WHERE fr.to_id=? ORDER BY fr.created_at DESC`, [req.uid]);
    res.json(requests);
  });
  app.post('/api/follow-requests/:id/accept', auth, limiterFollow, (req, res) => {
    const row = get('SELECT from_id FROM follow_requests WHERE id=? AND to_id=?', [req.params.id, req.uid]);
    if (!row) return res.status(404).json({ error:'not found' });
    try { run('INSERT INTO follows (follower_id,following_id) VALUES(?,?)', [row.from_id, req.uid]); } catch (e) { logger.debug({ from_id: row.from_id, to_id: req.uid, error: e.message }, 'follow request accept insert failed'); }
    run('DELETE FROM follow_requests WHERE id=?', [req.params.id]);
    run('DELETE FROM notifications WHERE user_id=? AND from_id=? AND type=?', [req.uid, row.from_id, 'follow_request']);
    notify(row.from_id, req.uid, 'follow', '');
    pushEvent(row.from_id, 'notif', { type:'follow_accepted', ref:'' });
    res.json({ ok:1 });
  });
  app.delete('/api/follow-requests/:id', auth, limiterFollow, (req, res) => {
    const row = get('SELECT from_id FROM follow_requests WHERE id=? AND to_id=?', [req.params.id, req.uid]);
    run('DELETE FROM follow_requests WHERE id=? AND to_id=?', [req.params.id, req.uid]);
    if (row) run('DELETE FROM notifications WHERE user_id=? AND from_id=? AND type=?', [req.uid, row.from_id, 'follow_request']);
    res.json({ ok:1 });
  });

  // POSTS
  app.post('/api/posts', auth, limiterPosts, imgUp.single('image'), async (req, res) => {
    const stripHtml = s => (s||'').replace(/<[^>]*>/g,'').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&').trim();
    const content=stripHtml(req.body.content||''), track_url=req.body.track_url||'', repost_of=req.body.repost_of||'', text_pos=(['above','below'].includes(req.body.text_pos)?req.body.text_pos:'above');
    if (!content&&!req.file&&!repost_of) return res.status(400).json({ error:'Пустой пост' });
    if (track_url&&!content&&!req.file&&!repost_of) return res.status(400).json({ error:'Добавь описание к треку' });
    if (content.length>2000) return res.status(400).json({ error:'Макс. 2000' });
    // Block duplicate direct reposts (no content, same post)
    if (repost_of && !content && !req.file) {
      if (get("SELECT 1 AS x FROM posts WHERE user_id=? AND repost_of=? AND content=''",[req.uid,repost_of]))
        return res.status(409).json({ error:'Уже репостнул' });
    }
    const scheduled_at = req.body.scheduled_at ? new Date(req.body.scheduled_at).toISOString() : null;
    if (scheduled_at && new Date(scheduled_at) <= new Date()) return res.status(400).json({ error: 'Дата должна быть в будущем' });
    let image='';
    if (req.file) {
      try {
        const nm = await processImage(req.file.path, IMG_DIR, { width: 1200, fit: 'inside' });
        image = '/images/' + nm;
      } catch (e) {
        logger.debug({ path: req.file.path, error: e.message }, 'image processing failed, using fallback');
        const ext = p.extname(req.file.originalname) || '.jpg';
        const nm = uuidv4() + ext;
        try { fs.renameSync(req.file.path, p.join(IMG_DIR, nm)); } catch (e2) { logger.debug({ path: req.file.path, error: e2.message }, 'failed to rename uploaded image'); }
        image = '/images/' + nm;
      }
    }
    const id=uuidv4();
    run('INSERT INTO posts (id,user_id,content,track_url,image,repost_of,text_pos,scheduled_at) VALUES(?,?,?,?,?,?,?,?)',[id,req.uid,content,track_url,image,repost_of,text_pos,scheduled_at]);
    if (repost_of) {
      const orig=get('SELECT user_id FROM posts WHERE id=?',[repost_of]);
      if (orig?.user_id) { notify(orig.user_id,req.uid,'repost',id); pushEvent(orig.user_id,'notif',{type:'repost',ref:id}); }
    }
    // create poll if options provided
    let pollOptions=[];
    try { pollOptions=JSON.parse(req.body.poll_options||'[]'); } catch (e) { logger.debug({ poll_options: req.body.poll_options, error: e.message }, 'failed to parse poll options'); }
    pollOptions=(pollOptions||[]).filter(o=>typeof o==='string'&&o.trim()).slice(0,4);
    if (pollOptions.length>=2) {
      const pollId=uuidv4();
      run('INSERT INTO polls (id,post_id) VALUES(?,?)',[pollId,id]);
      pollOptions.forEach(o=>run('INSERT INTO poll_options (id,poll_id,text) VALUES(?,?,?)',[uuidv4(),pollId,o.trim().slice(0,100)]));
    }
    res.json({ ok:1, id });
  });
  app.delete('/api/posts/:id', auth, (req, res) => {
    run('UPDATE users SET pinned_post_id=NULL WHERE id=? AND pinned_post_id=?',[req.uid,req.params.id]);
    run('DELETE FROM posts WHERE id=? AND user_id=?',[req.params.id,req.uid]); res.json({ ok:1 });
  });

  app.post('/api/posts/:id/pin', auth, (req, res) => {
    const post = get('SELECT id FROM posts WHERE id=? AND user_id=?',[req.params.id,req.uid]);
    if (!post) return res.status(404).json({ error:'Not found' });
    run('UPDATE users SET pinned_post_id=? WHERE id=?',[req.params.id,req.uid]);
    res.json({ ok:1 });
  });
  app.delete('/api/posts/:id/pin', auth, (req, res) => {
    run('UPDATE users SET pinned_post_id=NULL WHERE id=? AND pinned_post_id=?',[req.uid,req.params.id]);
    res.json({ ok:1 });
  });

  // ARCHIVE
  app.post('/api/posts/:id/archive', auth, (req, res) => {
    const post=get('SELECT id FROM posts WHERE id=? AND user_id=?',[req.params.id,req.uid]);
    if (!post) return res.status(404).json({ error:'Not found' });
    run('UPDATE posts SET archived=1 WHERE id=?',[req.params.id]);
    // Unpin if this was the pinned post
    run('UPDATE users SET pinned_post_id=NULL WHERE id=? AND pinned_post_id=?',[req.uid,req.params.id]);
    res.json({ ok:1 });
  });
  app.delete('/api/posts/:id/archive', auth, (req, res) => {
    run('UPDATE posts SET archived=0 WHERE id=? AND user_id=?',[req.params.id,req.uid]);
    res.json({ ok:1 });
  });

  // PLAY COUNT
  app.post('/api/posts/:id/play', limiterPlay, (req, res) => {
    run('UPDATE posts SET play_count=play_count+1 WHERE id=?',[req.params.id]);
    res.json({ ok:1 });
  });

  // POLL VOTE
  app.post('/api/posts/:id/poll/:optId', auth, (req, res) => {
    const poll=get('SELECT id FROM polls WHERE post_id=?',[req.params.id]);
    if (!poll) return res.status(404).json({ error:'Not found' });
    const opt=get('SELECT id FROM poll_options WHERE id=? AND poll_id=?',[req.params.optId,poll.id]);
    if (!opt) return res.status(404).json({ error:'Not found' });
    const existing=get('SELECT option_id FROM poll_votes WHERE poll_id=? AND user_id=?',[poll.id,req.uid]);
    if (existing) {
      run('UPDATE poll_votes SET option_id=? WHERE poll_id=? AND user_id=?',[req.params.optId,poll.id,req.uid]);
    } else {
      run('INSERT INTO poll_votes (poll_id,option_id,user_id) VALUES(?,?,?)',[poll.id,req.params.optId,req.uid]);
    }
    const options=all('SELECT o.id,o.text,COUNT(v.user_id) AS votes FROM poll_options o LEFT JOIN poll_votes v ON v.option_id=o.id WHERE o.poll_id=? GROUP BY o.id ORDER BY o.rowid',[poll.id]);
    const total=options.reduce((s,o)=>s+o.votes,0);
    res.json({ ok:1,options,total,my_vote:req.params.optId });
  });

  function enrich(posts, uid) {
    if (!posts.length) return posts;
    const ids = posts.map(po => po.id);
    const ph = ids.map(() => '?').join(',');

    // Batch counts
    const likesMap = {};
    all(`SELECT post_id, COUNT(*) AS c FROM likes WHERE post_id IN (${ph}) GROUP BY post_id`, ids)
      .forEach(r => { likesMap[r.post_id] = r.c; });

    const cmtsMap = {};
    all(`SELECT post_id, COUNT(*) AS c FROM comments WHERE post_id IN (${ph}) GROUP BY post_id`, ids)
      .forEach(r => { cmtsMap[r.post_id] = r.c; });

    const repostsMap = {};
    all(`SELECT repost_of, COUNT(*) AS c FROM posts WHERE repost_of IN (${ph}) GROUP BY repost_of`, ids)
      .forEach(r => { repostsMap[r.repost_of] = r.c; });

    const likedSet = new Set();
    const repostedSet = new Set();
    if (uid) {
      all(`SELECT post_id FROM likes WHERE user_id=? AND post_id IN (${ph})`, [uid, ...ids])
        .forEach(r => likedSet.add(r.post_id));
      all(`SELECT repost_of FROM posts WHERE user_id=? AND repost_of IN (${ph})`, [uid, ...ids])
        .forEach(r => repostedSet.add(r.repost_of));
    }

    // Batch originals for reposts
    const repostIds = [...new Set(posts.filter(po => po.repost_of).map(po => po.repost_of))];
    const originalsMap = {};
    if (repostIds.length) {
      const rph = repostIds.map(() => '?').join(',');
      all(`SELECT po.*,u.username,u.display_name,u.avatar,u.is_verified,u.badge_type FROM posts po JOIN users u ON po.user_id=u.id WHERE po.id IN (${rph})`, repostIds)
        .forEach(r => { originalsMap[r.id] = r; });
    }

    // Batch polls
    const pollPostMap = {};
    all(`SELECT id, post_id FROM polls WHERE post_id IN (${ph})`, ids)
      .forEach(r => { pollPostMap[r.post_id] = r.id; });
    const pollIds = Object.values(pollPostMap);
    const pollOptionsMap = {};
    const myVoteMap = {};
    if (pollIds.length) {
      const pph = pollIds.map(() => '?').join(',');
      all(`SELECT o.id,o.poll_id,o.text,COUNT(v.user_id) AS votes FROM poll_options o LEFT JOIN poll_votes v ON v.option_id=o.id WHERE o.poll_id IN (${pph}) GROUP BY o.id ORDER BY o.rowid`, pollIds)
        .forEach(r => {
          if (!pollOptionsMap[r.poll_id]) pollOptionsMap[r.poll_id] = [];
          pollOptionsMap[r.poll_id].push(r);
        });
      if (uid) {
        all(`SELECT poll_id,option_id FROM poll_votes WHERE user_id=? AND poll_id IN (${pph})`, [uid, ...pollIds])
          .forEach(r => { myVoteMap[r.poll_id] = r.option_id; });
      }
    }

    // Batch bookmarks
    const bookmarkedSet = new Set();
    if (uid) {
      all(`SELECT post_id FROM bookmarks WHERE user_id=? AND post_id IN (${ph})`, [uid, ...ids])
        .forEach(r => bookmarkedSet.add(r.post_id));
    }

    // Batch post reactions
    const postReactionsMap = {};
    const rawPostReactions = all(`SELECT post_id, user_id, emoji FROM post_reactions WHERE post_id IN (${ph})`, ids);
    rawPostReactions.forEach(r => {
      if (!postReactionsMap[r.post_id]) postReactionsMap[r.post_id] = {};
      if (!postReactionsMap[r.post_id][r.emoji]) postReactionsMap[r.post_id][r.emoji] = { emoji: r.emoji, count: 0, me: false };
      postReactionsMap[r.post_id][r.emoji].count++;
      if (uid && r.user_id === uid) postReactionsMap[r.post_id][r.emoji].me = true;
    });

    return posts.map(po => {
      const likes    = likesMap[po.id]    || 0;
      const comments = cmtsMap[po.id]     || 0;
      const reposts  = repostsMap[po.id]  || 0;
      const liked      = likedSet.has(po.id);
      const reposted   = repostedSet.has(po.id);
      const original   = po.repost_of ? (originalsMap[po.repost_of] || null) : null;
      const bookmarked = bookmarkedSet.has(po.id);
      let poll = null;
      const pollId = pollPostMap[po.id];
      if (pollId) {
        const options = pollOptionsMap[pollId] || [];
        const myVote  = myVoteMap[pollId] || null;
        const total   = options.reduce((s, o) => s + o.votes, 0);
        poll = { id: pollId, options, total, my_vote: myVote };
      }
      const post_reactions = Object.values(postReactionsMap[po.id] || {});
      return { ...po, likes, comments, reposts, liked, reposted, original, poll,
               play_count: po.play_count || 0, text_pos: po.text_pos || 'above', bookmarked, post_reactions };
    });
  }

  app.get('/api/feed', auth, (req, res) => {
    const lim=Math.min(+req.query.limit||30,50), off=+req.query.offset||0;
    const sort = String(req.query.sort || 'fresh').toLowerCase();
    const orderBy = sort === 'ranked'
      ? `((SELECT COUNT(*) FROM likes WHERE post_id=p.id) * 2 +
          (SELECT COUNT(*) FROM comments WHERE post_id=p.id) * 3 +
          (SELECT COUNT(*) FROM post_reactions WHERE post_id=p.id) * 2 +
          (SELECT COUNT(*) FROM bookmarks WHERE post_id=p.id) +
          CASE WHEN datetime(p.created_at)>datetime('now','-6 hours') THEN 8
               WHEN datetime(p.created_at)>datetime('now','-1 day') THEN 4 ELSE 0 END) DESC, p.created_at DESC`
      : 'p.created_at DESC';
    let posts;
    if (req.uid) posts=all(`SELECT p.*,u.username,u.display_name,u.avatar,u.is_verified,u.badge_type FROM posts p JOIN users u ON p.user_id=u.id WHERE (p.user_id=? OR p.user_id IN (SELECT following_id FROM follows WHERE follower_id=?)) AND p.archived=0 AND (p.scheduled_at IS NULL OR datetime(p.scheduled_at) <= datetime('now')) AND (p.repost_of='' OR p.content!='') AND p.user_id NOT IN (SELECT blocked_id FROM blocks WHERE blocker_id=?) AND p.user_id NOT IN (SELECT blocker_id FROM blocks WHERE blocked_id=?) AND p.user_id NOT IN (SELECT muted_id FROM mutes WHERE muter_id=?) ORDER BY ${orderBy} LIMIT ? OFFSET ?`,[req.uid,req.uid,req.uid,req.uid,req.uid,lim,off]);
    else posts=all(`SELECT p.*,u.username,u.display_name,u.avatar,u.is_verified,u.badge_type FROM posts p JOIN users u ON p.user_id=u.id WHERE p.archived=0 AND (p.scheduled_at IS NULL OR datetime(p.scheduled_at) <= datetime('now')) AND (p.repost_of='' OR p.content!='') ORDER BY ${orderBy} LIMIT ? OFFSET ?`,[lim,off]);
    res.json(enrich(posts,req.uid));
  });
  app.get('/api/discover', auth, (req, res) => {
    const lim=Math.min(+req.query.limit||30,50), off=+req.query.offset||0;
    const sort = String(req.query.sort || 'fresh').toLowerCase();
    const orderBy = sort === 'hot'
      ? `score DESC, p.created_at DESC`
      : `p.created_at DESC`;
    // exclude private accounts (unless following), blocked users, and users who blocked you
    const posts = all(`
      SELECT p.*,u.username,u.display_name,u.avatar,u.is_verified,u.badge_type,
        ((SELECT COUNT(*) FROM likes WHERE post_id=p.id) +
         (SELECT COUNT(*) FROM comments WHERE post_id=p.id) +
         (SELECT COUNT(*) FROM post_reactions WHERE post_id=p.id)) AS score
      FROM posts p JOIN users u ON p.user_id=u.id
      WHERE p.archived=0 AND (p.repost_of='' OR p.content!='')
        AND (p.scheduled_at IS NULL OR datetime(p.scheduled_at) <= datetime('now'))
        AND (u.is_private=0 OR p.user_id=? OR p.user_id IN (SELECT following_id FROM follows WHERE follower_id=?))
        AND p.user_id NOT IN (SELECT blocked_id FROM blocks WHERE blocker_id=?)
        AND p.user_id NOT IN (SELECT blocker_id FROM blocks WHERE blocked_id=?)
        AND p.user_id NOT IN (SELECT muted_id FROM mutes WHERE muter_id=?)
        AND u.banned_at IS NULL
      ORDER BY ${orderBy} LIMIT ? OFFSET ?
    `, [req.uid, req.uid, req.uid, req.uid, req.uid, lim, off]);
    res.json(enrich(posts, req.uid));
  });

  app.get('/api/social/overview', auth, (req, res) => {
    const u = get(`SELECT id,username,display_name,bio,avatar,link_sc,link_ig,link_tg,link_spotify,link_site,is_private,email_verified
      FROM users WHERE id=?`, [req.uid]);
    const stats = {
      posts: get('SELECT COUNT(*) AS c FROM posts WHERE user_id=? AND archived=0', [req.uid]).c,
      drops: get("SELECT COUNT(*) AS c FROM drops WHERE user_id=? AND datetime(created_at)>datetime('now','-24 hours')", [req.uid]).c,
      followers: get('SELECT COUNT(*) AS c FROM follows WHERE following_id=?', [req.uid]).c,
      following: get('SELECT COUNT(*) AS c FROM follows WHERE follower_id=?', [req.uid]).c,
      unread_chats: get('SELECT COUNT(DISTINCT m.conv_id) AS c FROM messages m JOIN conversation_members cm ON cm.conv_id=m.conv_id AND cm.user_id=? WHERE m.sender_id!=? AND m.created_at>cm.last_read AND m.deleted_at IS NULL', [req.uid, req.uid]).c,
      notifications: get('SELECT COUNT(*) AS c FROM notifications WHERE user_id=? AND seen=0', [req.uid]).c,
    };
    const suggestions = all(`
      SELECT u.id,u.username,u.display_name,u.avatar,u.bio,u.is_verified,u.badge_type,
        (SELECT COUNT(*) FROM follows f WHERE f.following_id=u.id) AS followers,
        (SELECT COUNT(*) FROM follows mf WHERE mf.following_id=u.id AND mf.follower_id IN (SELECT following_id FROM follows WHERE follower_id=?)) AS mutuals
      FROM users u
      WHERE u.id!=? AND u.banned_at IS NULL AND u.email_verified=1
        AND u.id NOT IN (SELECT following_id FROM follows WHERE follower_id=?)
        AND u.id NOT IN (SELECT blocked_id FROM blocks WHERE blocker_id=?)
        AND u.id NOT IN (SELECT blocker_id FROM blocks WHERE blocked_id=?)
      ORDER BY mutuals DESC, followers DESC, u.created_at DESC
      LIMIT 6
    `, [req.uid, req.uid, req.uid, req.uid, req.uid]);
    const hotPosts = all(`
      SELECT p.*,u.username,u.display_name,u.avatar,u.is_verified,u.badge_type,
        ((SELECT COUNT(*) FROM likes WHERE post_id=p.id) + (SELECT COUNT(*) FROM comments WHERE post_id=p.id) + (SELECT COUNT(*) FROM post_reactions WHERE post_id=p.id)) AS score
      FROM posts p JOIN users u ON u.id=p.user_id
      WHERE p.archived=0 AND (p.scheduled_at IS NULL OR datetime(p.scheduled_at) <= datetime('now'))
        AND (u.is_private=0 OR p.user_id=? OR p.user_id IN (SELECT following_id FROM follows WHERE follower_id=?))
        AND p.user_id NOT IN (SELECT blocked_id FROM blocks WHERE blocker_id=?)
        AND p.user_id NOT IN (SELECT blocker_id FROM blocks WHERE blocked_id=?)
      ORDER BY score DESC, p.created_at DESC
      LIMIT 5
    `, [req.uid, req.uid, req.uid, req.uid]);
    const recentText = all(`
      SELECT content FROM posts p JOIN users u ON u.id=p.user_id
      WHERE p.archived=0 AND p.content LIKE '%#%' AND u.banned_at IS NULL
      ORDER BY p.created_at DESC LIMIT 80
    `);
    const tagCounts = {};
    recentText.forEach(row => {
      String(row.content || '').match(/#[\p{L}\p{N}_]{2,32}/gu)?.forEach(tag => {
        const key = tag.toLowerCase();
        tagCounts[key] = (tagCounts[key] || 0) + 1;
      });
    });
    const trending_tags = Object.entries(tagCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([tag, count]) => ({ tag, count }));
    const activeDrops = all(`
      SELECT d.id,d.content,d.image,d.created_at,d.expires_at,u.username,u.display_name,u.avatar,
        (SELECT COUNT(*) FROM drop_views WHERE drop_id=d.id) AS view_count
      FROM drops d JOIN users u ON u.id=d.user_id
      WHERE datetime(d.created_at)>datetime('now','-24 hours')
        AND (d.user_id=? OR d.user_id IN (SELECT following_id FROM follows WHERE follower_id=?))
      ORDER BY d.created_at DESC LIMIT 4
    `, [req.uid, req.uid]);
    // Follow threshold: min(3, other users in system) so it's always achievable
    const otherUserCount = (get('SELECT COUNT(*) AS n FROM users WHERE id != ? AND banned_at IS NULL', [req.uid])?.n || 0);
    const followThreshold = Math.max(1, Math.min(3, otherUserCount));
    const followDone = stats.following >= followThreshold;
    const completion = [
      !!u.avatar,
      !!u.bio,
      !!(u.link_sc || u.link_ig || u.link_tg || u.link_spotify || u.link_site),
      followDone,
      stats.posts > 0,
      stats.drops > 0,
    ].filter(Boolean).length;
    res.json({
      stats,
      onboarding: {
        completion,
        total: 6,
        steps: [
          { id: 'avatar', done: !!u.avatar, label: 'добавить фото' },
          { id: 'bio', done: !!u.bio, label: 'написать bio' },
          { id: 'links', done: !!(u.link_sc || u.link_ig || u.link_tg || u.link_spotify || u.link_site), label: 'добавить ссылки' },
          { id: 'follow', done: followDone, label: followThreshold === 1 ? 'подписаться' : `подписаться на ${followThreshold}` },
          { id: 'post', done: stats.posts > 0, label: 'первый пост' },
          { id: 'drop', done: stats.drops > 0, label: 'опубликовать дроп' },
        ],
      },
      suggestions,
      trending_tags,
      hot_posts: enrich(hotPosts, req.uid),
      active_drops: activeDrops,
    });
  });

  app.get('/api/explore/overview', auth, (req, res) => {
    const hotPosts = all(`
      SELECT p.*,u.username,u.display_name,u.avatar,u.is_verified,u.badge_type,
        ((SELECT COUNT(*) FROM likes WHERE post_id=p.id) * 2 +
         (SELECT COUNT(*) FROM comments WHERE post_id=p.id) * 3 +
         (SELECT COUNT(*) FROM post_reactions WHERE post_id=p.id) * 2 +
         (SELECT COUNT(*) FROM bookmarks WHERE post_id=p.id)) AS score
      FROM posts p JOIN users u ON u.id=p.user_id
      WHERE p.archived=0 AND (p.repost_of='' OR p.content!='')
        AND (p.scheduled_at IS NULL OR datetime(p.scheduled_at) <= datetime('now'))
        AND (u.is_private=0 OR p.user_id=? OR p.user_id IN (SELECT following_id FROM follows WHERE follower_id=?))
        AND p.user_id NOT IN (SELECT blocked_id FROM blocks WHERE blocker_id=?)
        AND p.user_id NOT IN (SELECT blocker_id FROM blocks WHERE blocked_id=?)
        AND p.user_id NOT IN (SELECT muted_id FROM mutes WHERE muter_id=?)
        AND u.banned_at IS NULL
      ORDER BY score DESC, p.created_at DESC
      LIMIT 10
    `, [req.uid, req.uid, req.uid, req.uid, req.uid]);
    const creators = all(`
      SELECT u.id,u.username,u.display_name,u.avatar,u.bio,u.is_verified,u.badge_type,
        (SELECT COUNT(*) FROM follows WHERE following_id=u.id) AS followers,
        (SELECT COUNT(*) FROM posts WHERE user_id=u.id AND archived=0) AS posts,
        (SELECT COUNT(*) FROM drops WHERE user_id=u.id AND datetime(created_at)>datetime('now','-24 hours')) AS drops,
        (SELECT COUNT(*) FROM follows mf WHERE mf.following_id=u.id AND mf.follower_id IN (SELECT following_id FROM follows WHERE follower_id=?)) AS mutuals
      FROM users u
      WHERE u.id!=? AND u.banned_at IS NULL AND u.email_verified=1
        AND (u.is_private=0 OR u.id IN (SELECT following_id FROM follows WHERE follower_id=?))
        AND u.id NOT IN (SELECT blocked_id FROM blocks WHERE blocker_id=?)
        AND u.id NOT IN (SELECT blocker_id FROM blocks WHERE blocked_id=?)
      ORDER BY drops DESC, mutuals DESC, followers DESC, posts DESC
      LIMIT 8
    `, [req.uid, req.uid, req.uid, req.uid, req.uid]);
    const files = all(`
      SELECT df.id,df.name,df.mime,df.size,df.description,df.public_token,df.created_at,
             u.username,u.display_name,u.avatar
      FROM disk_files df JOIN users u ON u.id=df.user_id
      WHERE df.public_token IS NOT NULL AND df.public_token!=''
        AND u.banned_at IS NULL
        AND (u.is_private=0 OR df.user_id=? OR df.user_id IN (SELECT following_id FROM follows WHERE follower_id=?))
        AND df.user_id NOT IN (SELECT blocked_id FROM blocks WHERE blocker_id=?)
        AND df.user_id NOT IN (SELECT blocker_id FROM blocks WHERE blocked_id=?)
      ORDER BY df.created_at DESC LIMIT 8
    `, [req.uid, req.uid, req.uid, req.uid]);
    const recentText = all(`
      SELECT content FROM posts p JOIN users u ON u.id=p.user_id
      WHERE p.archived=0 AND p.content LIKE '%#%' AND u.banned_at IS NULL
      ORDER BY p.created_at DESC LIMIT 120
    `);
    const tagCounts = {};
    recentText.forEach(row => {
      String(row.content || '').match(/#[\p{L}\p{N}_]{2,32}/gu)?.forEach(tag => {
        const key = tag.toLowerCase();
        tagCounts[key] = (tagCounts[key] || 0) + 1;
      });
    });
    const tags = Object.entries(tagCounts).sort((a,b)=>b[1]-a[1]).slice(0,12).map(([tag,count])=>({tag,count}));
    res.json({ hot_posts: enrich(hotPosts, req.uid), creators, files, tags });
  });

  app.get('/api/user/:u/posts', oAuth, (req, res) => {
    const u=get('SELECT id,is_private,pinned_post_id FROM users WHERE username=?',[req.params.u]);
    if (!u) return res.status(404).json({ error:'nf' });
    if (u.is_private && req.uid!==u.id) {
      const following=req.uid?!!get('SELECT 1 FROM follows WHERE follower_id=? AND following_id=?',[req.uid,u.id]):false;
      if (!following) return res.json({ private:true, posts:[] });
    }
    if (req.uid && req.uid !== u.id) {
      const blocked = get('SELECT 1 FROM blocks WHERE (blocker_id=? AND blocked_id=?) OR (blocker_id=? AND blocked_id=?)', [req.uid, u.id, u.id, req.uid]);
      if (blocked) return res.json({ private:true, posts:[] });
    }
    const isOwner = req.uid === u.id;
    const raw = all(`SELECT p.*,u.username,u.display_name,u.avatar,u.is_verified,u.badge_type FROM posts p JOIN users u ON p.user_id=u.id WHERE p.user_id=? AND (p.archived=0 OR ?) AND (p.scheduled_at IS NULL OR datetime(p.scheduled_at) <= datetime('now') OR ?) ORDER BY p.created_at DESC LIMIT 50`,[u.id, isOwner?1:0, isOwner?1:0]);
    const enriched = enrich(raw, req.uid);
    // Sort: pinned post first, mark with is_pinned flag
    if (u.pinned_post_id) {
      const idx = enriched.findIndex(p => p.id === u.pinned_post_id);
      if (idx > 0) {
        const [pinned] = enriched.splice(idx, 1);
        enriched.unshift(pinned);
      }
      if (enriched.length && enriched[0].id === u.pinned_post_id) enriched[0].is_pinned = true;
    }
    res.json(enriched);
  });

  app.get('/api/user/:u/drops', oAuth, (req, res) => {
    const u=get('SELECT id,is_private FROM users WHERE username=?',[req.params.u]);
    if (!u) return res.status(404).json({ error:'nf' });
    if (u.is_private && req.uid!==u.id) {
      const following=req.uid?!!get('SELECT 1 FROM follows WHERE follower_id=? AND following_id=?',[req.uid,u.id]):false;
      if (!following) return res.json([]);
    }
    if (req.uid && req.uid !== u.id) {
      const blocked = get('SELECT 1 FROM blocks WHERE (blocker_id=? AND blocked_id=?) OR (blocker_id=? AND blocked_id=?)', [req.uid, u.id, u.id, req.uid]);
      if (blocked) return res.json([]);
    }
    const drops=all(`SELECT d.*,u.username,u.display_name,u.avatar,
        (SELECT COUNT(*) FROM drop_views WHERE drop_id=d.id) AS view_count,
        (SELECT COUNT(*) FROM drop_views WHERE drop_id=d.id AND user_id=?) AS viewed
      FROM drops d JOIN users u ON u.id=d.user_id
      WHERE d.user_id=? AND datetime(d.created_at)>datetime('now','-24 hours')
      ORDER BY d.created_at DESC LIMIT 24`,[req.uid || '',u.id]);
    res.json(drops);
  });

  app.get('/api/user/:u/public-files', oAuth, (req, res) => {
    const u=get('SELECT id,is_private FROM users WHERE username=?',[req.params.u]);
    if (!u) return res.status(404).json({ error:'nf' });
    if (u.is_private && req.uid!==u.id) {
      const following=req.uid?!!get('SELECT 1 FROM follows WHERE follower_id=? AND following_id=?',[req.uid,u.id]):false;
      if (!following) return res.json([]);
    }
    if (req.uid && req.uid !== u.id) {
      const blocked = get('SELECT 1 FROM blocks WHERE (blocker_id=? AND blocked_id=?) OR (blocker_id=? AND blocked_id=?)', [req.uid, u.id, u.id, req.uid]);
      if (blocked) return res.json([]);
    }
    const files=all(`SELECT id,name,mime,size,description,public_token,created_at,preview_path
      FROM disk_files
      WHERE user_id=? AND public_token IS NOT NULL AND public_token!=''
      ORDER BY created_at DESC LIMIT 24`,[u.id]);
    res.json(files);
  });

  app.get('/api/user/:u/showcase', oAuth, (req, res) => {
    const u=get('SELECT id,is_private,pinned_post_id FROM users WHERE username=?',[req.params.u]);
    if (!u) return res.status(404).json({ error:'nf' });
    if (u.is_private && req.uid!==u.id) {
      const following=req.uid?!!get('SELECT 1 FROM follows WHERE follower_id=? AND following_id=?',[req.uid,u.id]):false;
      if (!following) return res.json({ private:true });
    }
    if (req.uid && req.uid !== u.id) {
      const blocked = get('SELECT 1 FROM blocks WHERE (blocker_id=? AND blocked_id=?) OR (blocker_id=? AND blocked_id=?)', [req.uid, u.id, u.id, req.uid]);
      if (blocked) return res.json({ private:true });
    }
    const pinned = u.pinned_post_id ? get(`
      SELECT p.*,usr.username,usr.display_name,usr.avatar,usr.is_verified,usr.badge_type
      FROM posts p JOIN users usr ON usr.id=p.user_id
      WHERE p.id=? AND p.archived=0`, [u.pinned_post_id]) : null;
    const topPost = get(`
      SELECT p.*,usr.username,usr.display_name,usr.avatar,usr.is_verified,usr.badge_type,
        ((SELECT COUNT(*) FROM likes WHERE post_id=p.id) + (SELECT COUNT(*) FROM comments WHERE post_id=p.id) * 2 + (SELECT COUNT(*) FROM post_reactions WHERE post_id=p.id)) AS score
      FROM posts p JOIN users usr ON usr.id=p.user_id
      WHERE p.user_id=? AND p.archived=0
      ORDER BY score DESC, p.created_at DESC LIMIT 1`, [u.id]);
    const drop = get(`SELECT d.*,usr.username,usr.display_name,usr.avatar,
        (SELECT COUNT(*) FROM drop_views WHERE drop_id=d.id) AS view_count,
        (SELECT COUNT(*) FROM drop_views WHERE drop_id=d.id AND user_id=?) AS viewed
      FROM drops d JOIN users usr ON usr.id=d.user_id
      WHERE d.user_id=? AND datetime(d.created_at)>datetime('now','-24 hours')
      ORDER BY d.created_at DESC LIMIT 1`, [req.uid || '', u.id]);
    const file = get(`SELECT id,name,mime,size,description,public_token,created_at,preview_path
      FROM disk_files
      WHERE user_id=? AND public_token IS NOT NULL AND public_token!=''
      ORDER BY created_at DESC LIMIT 1`, [u.id]);
    const mutuals = req.uid ? all(`
      SELECT u.username,u.display_name,u.avatar
      FROM follows mine
      JOIN follows theirs ON theirs.follower_id=? AND theirs.following_id=mine.following_id
      JOIN users u ON u.id=mine.following_id
      WHERE mine.follower_id=? AND u.banned_at IS NULL
      LIMIT 5`, [u.id, req.uid]) : [];
    res.json({
      pinned_post: pinned ? enrich([pinned], req.uid)[0] : null,
      top_post: topPost ? enrich([topPost], req.uid)[0] : null,
      latest_drop: drop || null,
      featured_file: file || null,
      mutuals,
    });
  });

  // LIKES
  app.post('/api/posts/:id/like', auth, limiterLike, (req, res) => {
    try {
      run('INSERT INTO likes (user_id,post_id) VALUES(?,?)',[req.uid,req.params.id]);
      const po=get('SELECT user_id FROM posts WHERE id=?',[req.params.id]);
      if (po) { notify(po.user_id,req.uid,'like',req.params.id); pushEvent(po.user_id,'notif',{type:'like',ref:req.params.id}); }
    } catch (e) { logger.debug({ post_id: req.params.id, error: e.message }, 'like notification failed'); }
    res.json({ likes:get('SELECT COUNT(*) AS c FROM likes WHERE post_id=?',[req.params.id]).c });
  });
  app.delete('/api/posts/:id/like', auth, limiterLike, (req, res) => {
    run('DELETE FROM likes WHERE user_id=? AND post_id=?',[req.uid,req.params.id]);
    res.json({ likes:get('SELECT COUNT(*) AS c FROM likes WHERE post_id=?',[req.params.id]).c });
  });

  // POST REACTIONS
  const ALLOWED_POST_EMOJI = ['🔥','💀','🎵','👀','✅','😭','❤️','💯'];
  app.post('/api/posts/:id/react', auth, limiterPostReact, (req, res) => {
    const { emoji } = req.body;
    if (!emoji || !ALLOWED_POST_EMOJI.includes(emoji)) return res.status(400).json({ error: 'invalid emoji' });
    const post = get('SELECT id FROM posts WHERE id=?', [req.params.id]);
    if (!post) return res.status(404).json({ error: 'not found' });
    const existing = get('SELECT emoji FROM post_reactions WHERE post_id=? AND user_id=?', [req.params.id, req.uid]);
    if (existing && existing.emoji === emoji) {
      run('DELETE FROM post_reactions WHERE post_id=? AND user_id=?', [req.params.id, req.uid]);
    } else if (existing) {
      run('UPDATE post_reactions SET emoji=? WHERE post_id=? AND user_id=?', [emoji, req.params.id, req.uid]);
    } else {
      run('INSERT INTO post_reactions (post_id,user_id,emoji) VALUES(?,?,?)', [req.params.id, req.uid, emoji]);
    }
    const reactions = all('SELECT emoji, COUNT(*) AS count FROM post_reactions WHERE post_id=? GROUP BY emoji', [req.params.id]);
    const myReacts = new Set(all('SELECT emoji FROM post_reactions WHERE post_id=? AND user_id=?', [req.params.id, req.uid]).map(r => r.emoji));
    reactions.forEach(r => { r.me = myReacts.has(r.emoji); });
    res.json({ ok: 1, reactions });
  });
  app.delete('/api/posts/:id/react', auth, (req, res) => {
    run('DELETE FROM post_reactions WHERE post_id=? AND user_id=?', [req.params.id, req.uid]);
    const reactions = all('SELECT emoji, COUNT(*) AS count FROM post_reactions WHERE post_id=? GROUP BY emoji', [req.params.id]);
    reactions.forEach(r => { r.me = false; });
    res.json({ ok: 1, reactions });
  });

  // BOOKMARKS
  app.post('/api/posts/:id/bookmark', auth, (req, res) => {
    const has = get('SELECT 1 FROM bookmarks WHERE user_id=? AND post_id=?', [req.uid, req.params.id]);
    if (has) {
      run('DELETE FROM bookmarks WHERE user_id=? AND post_id=?', [req.uid, req.params.id]);
      res.json({ bookmarked: false });
    } else {
      try { run('INSERT INTO bookmarks (user_id,post_id) VALUES(?,?)', [req.uid, req.params.id]); } catch (e) { logger.debug({ post_id: req.params.id, error: e.message }, 'bookmark insert failed'); }
      res.json({ bookmarked: true });
    }
  });

  app.get('/api/bookmarks', auth, (req, res) => {
    const raw = all(`SELECT p.*,u.username,u.display_name,u.avatar,u.is_verified,u.badge_type FROM bookmarks b JOIN posts p ON p.id=b.post_id JOIN users u ON p.user_id=u.id WHERE b.user_id=? AND p.archived=0 ORDER BY b.created_at DESC LIMIT 50`, [req.uid]);
    res.json(enrich(raw, req.uid));
  });

  // SINGLE POST (admin reports modal + any future per-post deep link)
  app.get('/api/posts/:id', auth, (req, res) => {
    const rows = all(`SELECT p.*,u.username,u.display_name,u.avatar,u.is_verified,u.badge_type
      FROM posts p JOIN users u ON u.id=p.user_id WHERE p.id=?`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error:'not found' });
    res.json(enrich(rows, req.uid)[0]);
  });

  // LIKERS
  app.get('/api/posts/:id/likes', auth, (req, res) => {
    res.json(all('SELECT u.username,u.display_name,u.avatar FROM likes l JOIN users u ON u.id=l.user_id WHERE l.post_id=? LIMIT 50', [req.params.id]));
  });

  // EDIT POST
  app.put('/api/posts/:id', auth, (req, res) => {
    const po = get('SELECT id,user_id,created_at FROM posts WHERE id=?', [req.params.id]);
    if (!po) return res.status(404).json({ error: 'Пост не найден' });
    if (po.user_id !== req.uid) return res.status(403).json({ error: 'Нет прав' });
    const created = new Date(po.created_at.includes('Z') ? po.created_at : po.created_at + 'Z');
    const ageMin = (Date.now() - created.getTime()) / 60000;
    if (ageMin > 5) return res.status(403).json({ error: 'Редактировать можно только первые 5 минут' });
    const content = (req.body.content || '').replace(/<[^>]*>/g, '').trim();
    if (!content) return res.status(400).json({ error: 'Пустой текст' });
    if (content.length > 2000) return res.status(400).json({ error: 'Макс. 2000 символов' });
    run('UPDATE posts SET content=?, edited_at=datetime(\'now\') WHERE id=?', [content, po.id]);
    res.json({ ok: 1, content });
  });

  app.patch('/api/posts/:id', auth, (req,res) => {
    const post = get('SELECT id,user_id,created_at FROM posts WHERE id=?', [req.params.id]);
    if (!post) return res.status(404).json({error:'not found'});
    if (post.user_id !== req.uid) return res.status(403).json({error:'forbidden'});
    const _ts = post.created_at.includes('T') ? post.created_at : post.created_at.replace(' ', 'T');
    const ageMs = Date.now() - new Date(_ts.includes('Z') ? _ts : _ts + 'Z').getTime();
    if (ageMs > 24 * 3600 * 1000) return res.status(400).json({error:'Редактировать можно только в течение 24 часов'});
    const content = (req.body.content || '').trim();
    if (!content) return res.status(400).json({error:'empty'});
    const now = new Date().toISOString();
    run('UPDATE posts SET content=?, edited_at=? WHERE id=?', [content, now, req.params.id]);
    res.json({ok:1, edited_at: now});
  });

  // COMMENTS
  app.get('/api/posts/:id/comments', oAuth, (req, res) => {
    const po = get('SELECT p.id,u.is_private,u.id AS author_id FROM posts p JOIN users u ON p.user_id=u.id WHERE p.id=? AND p.archived=0', [req.params.id]);
    if (!po) return res.status(404).json({ error:'not found' });
    if (po.is_private && req.uid !== po.author_id) {
      const following = req.uid ? !!get('SELECT 1 FROM follows WHERE follower_id=? AND following_id=?',[req.uid,po.author_id]) : false;
      if (!following) return res.status(403).json({ error:'private' });
    }
    if (req.uid && req.uid !== po.author_id) {
      if (get('SELECT 1 FROM blocks WHERE (blocker_id=? AND blocked_id=?) OR (blocker_id=? AND blocked_id=?)',[req.uid,po.author_id,po.author_id,req.uid])) return res.status(403).json({ error:'blocked' });
    }
    const rows = all(`
      SELECT c.*,u.username,u.display_name,u.avatar,u.is_verified,u.badge_type,
        (SELECT COUNT(*) FROM comment_likes WHERE comment_id=c.id) AS likes,
        (SELECT COUNT(*) FROM comment_likes WHERE comment_id=c.id AND user_id=?) AS liked,
        (SELECT COUNT(*) FROM comments r WHERE r.parent_id=c.id) AS replies
      FROM comments c JOIN users u ON c.user_id=u.id
      WHERE c.post_id=?
      ORDER BY CASE WHEN IFNULL(c.parent_id,'')='' THEN c.created_at ELSE (SELECT created_at FROM comments p WHERE p.id=c.parent_id) END ASC,
               IFNULL(c.parent_id,''), c.created_at ASC
    `,[req.uid || '', req.params.id]);
    res.json(rows);
  });
  app.post('/api/posts/:id/comments', auth, limiterComment, (req, res) => {
    const c=(req.body.content||'').trim();
    const parentId=(req.body.parent_id||'').trim();
    if (!c) return res.status(400).json({ error:'empty' });
    if (c.length > 1000) return res.status(400).json({ error:'Максимум 1000 символов' });
    const po=get('SELECT p.user_id,u.is_private FROM posts p JOIN users u ON u.id=p.user_id WHERE p.id=? AND p.archived=0',[req.params.id]);
    if (!po) return res.status(404).json({ error:'not found' });
    if (po.is_private && req.uid !== po.user_id) {
      const following = !!get('SELECT 1 FROM follows WHERE follower_id=? AND following_id=?',[req.uid, po.user_id]);
      if (!following) return res.status(403).json({ error:'private' });
    }
    let parent = null;
    if (parentId) {
      parent = get('SELECT id,user_id FROM comments WHERE id=? AND post_id=?', [parentId, req.params.id]);
      if (!parent) return res.status(400).json({ error:'bad parent' });
    }
    const id=uuidv4();
    run('INSERT INTO comments (id,post_id,user_id,content,parent_id) VALUES(?,?,?,?,?)',[id,req.params.id,req.uid,c,parentId]);
    if (parent && parent.user_id !== req.uid) {
      notify(parent.user_id,req.uid,'comment_reply',req.params.id);
      pushEvent(parent.user_id,'notif',{type:'comment_reply',ref:req.params.id});
    } else if (po.user_id !== req.uid) {
      notify(po.user_id,req.uid,'comment',req.params.id);
      pushEvent(po.user_id,'notif',{type:'comment',ref:req.params.id});
    }
    const mentioned = [...new Set((c.match(/@([a-zA-Z0-9_]{1,32})/g) || []).map(x => x.slice(1).toLowerCase()))];
    mentioned.slice(0, 8).forEach(username => {
      const mu = get('SELECT id FROM users WHERE LOWER(username)=LOWER(?) AND id!=?', [username, req.uid]);
      if (mu) { notify(mu.id, req.uid, 'mention', req.params.id); pushEvent(mu.id, 'notif', { type:'mention', ref:req.params.id }); }
    });
    res.json({ ok:1, id });
  });
  app.post('/api/comments/:id/like', auth, limiterLike, (req, res) => {
    const c = get('SELECT c.id,c.user_id,c.post_id FROM comments c WHERE c.id=?', [req.params.id]);
    if (!c) return res.status(404).json({ error:'not found' });
    try { run('INSERT INTO comment_likes (comment_id,user_id) VALUES(?,?)',[req.params.id,req.uid]); } catch {}
    if (c.user_id !== req.uid) { notify(c.user_id, req.uid, 'comment_like', c.post_id); pushEvent(c.user_id, 'notif', { type:'comment_like', ref:c.post_id }); }
    res.json({ likes:get('SELECT COUNT(*) AS c FROM comment_likes WHERE comment_id=?',[req.params.id]).c });
  });
  app.delete('/api/comments/:id/like', auth, limiterLike, (req, res) => {
    run('DELETE FROM comment_likes WHERE comment_id=? AND user_id=?',[req.params.id,req.uid]);
    res.json({ likes:get('SELECT COUNT(*) AS c FROM comment_likes WHERE comment_id=?',[req.params.id]).c });
  });

  // NOTIFICATIONS
  app.get('/api/notifications', auth, (req, res) => {
    const notifs=all(`SELECT n.*,u.username,u.display_name,u.avatar,
        p.content AS post_content,p.image AS post_image,
        c.title AS conv_title,c.is_group
      FROM notifications n
      JOIN users u ON n.from_id=u.id
      LEFT JOIN posts p ON p.id=n.ref_id
      LEFT JOIN conversations c ON c.id=n.ref_id
      WHERE n.user_id=? ORDER BY n.created_at DESC LIMIT 50`,[req.uid]);
    run('UPDATE notifications SET seen=1 WHERE user_id=? AND seen=0',[req.uid]);
    // Sync badge reset to all other open tabs/devices
    pushEvent(req.uid, 'notifs_read', {});
    res.json(notifs);
  });

  // SEARCH
  app.get('/api/users/suggest', auth, (req, res) => {
    const q = (req.query.q || '').trim().replace(/^@/, '');
    if (!q) return res.json([]);
    const like = `${q}%`;
    res.json(all(`
      SELECT username,display_name,avatar FROM users
      WHERE (username LIKE ? OR display_name LIKE ?)
        AND banned_at IS NULL
        AND id NOT IN (SELECT blocked_id FROM blocks WHERE blocker_id=?)
        AND id NOT IN (SELECT blocker_id FROM blocks WHERE blocked_id=?)
      LIMIT 6
    `, [like, like, req.uid, req.uid]));
  });

  app.get('/api/search', auth, (req, res) => {
    const q = (req.query.q || '').trim();
    const type = req.query.type || 'all';
    if (!q || q.length < 2) return res.json({ users:[], posts:[], messages:[], files:[] });
    const like = `%${q}%`;
    const result = { users:[], posts:[], messages:[], files:[] };
    if (type === 'all' || type === 'users') {
      // exclude blocked/blocking users
      result.users = all(`
        SELECT id,username,display_name,avatar,bio FROM users
        WHERE (username LIKE ? OR display_name LIKE ?)
          AND banned_at IS NULL
          AND id NOT IN (SELECT blocked_id FROM blocks WHERE blocker_id=?)
          AND id NOT IN (SELECT blocker_id FROM blocks WHERE blocked_id=?)
        LIMIT 10
      `, [like, like, req.uid, req.uid]);
    }
    if (type === 'all' || type === 'posts') {
      // exclude private accounts (unless following or own), blocked users
      const raw = all(`
        SELECT p.*,u.username,u.display_name,u.avatar,u.is_verified,u.badge_type
        FROM posts p JOIN users u ON p.user_id=u.id
        WHERE p.id IN (SELECT post_id FROM posts_fts WHERE posts_fts MATCH ?)
          AND p.repost_of='' AND p.archived=0
          AND (u.is_private=0 OR p.user_id=? OR p.user_id IN (SELECT following_id FROM follows WHERE follower_id=?))
          AND p.user_id NOT IN (SELECT blocked_id FROM blocks WHERE blocker_id=?)
          AND p.user_id NOT IN (SELECT blocker_id FROM blocks WHERE blocked_id=?)
          AND u.banned_at IS NULL
        ORDER BY p.created_at DESC LIMIT 20
      `, [q + '*', req.uid, req.uid, req.uid, req.uid]);
      result.posts = enrich(raw, req.uid);
    }
    if (type === 'all' || type === 'messages') {
      result.messages = all(`
        SELECT m.id, m.conv_id, m.content, m.created_at, m.sender_id,
               u.display_name, u.avatar,
               c.is_group, c.title,
               (SELECT display_name FROM users u2 JOIN conversation_members cm2 ON cm2.user_id=u2.id WHERE cm2.conv_id=c.id AND cm2.user_id!=? LIMIT 1) AS other_name
        FROM messages m
        JOIN users u ON u.id=m.sender_id
        JOIN conversations c ON c.id=m.conv_id
        JOIN conversation_members cm ON cm.conv_id=m.conv_id AND cm.user_id=?
        WHERE m.content LIKE ? AND m.deleted_at IS NULL
        ORDER BY m.created_at DESC LIMIT 12
      `, [req.uid, req.uid, like]);
    }
    if (type === 'all' || type === 'files') {
      result.files = all(`
        SELECT id,name,mime,size,description,path,created_at,public_token
        FROM disk_files
        WHERE user_id=? AND (name LIKE ? OR IFNULL(description,'') LIKE ?)
        ORDER BY created_at DESC
        LIMIT 12
      `, [req.uid, like, like]);
    }
    res.json(result);
  });

  app.get('/api/search/messages', auth, (req, res) => {
    const q = (req.query.q || '').trim();
    if (!q || q.length < 2) return res.json([]);
    const like = `%${q}%`;
    const results = all(`
      SELECT m.id, m.conv_id, m.content, m.created_at, m.sender_id,
             u.display_name, u.avatar,
             c.is_group, c.title,
             (SELECT display_name FROM users u2 JOIN conversation_members cm2 ON cm2.user_id=u2.id WHERE cm2.conv_id=c.id AND cm2.user_id!=? LIMIT 1) AS other_name
      FROM messages m
      JOIN users u ON u.id=m.sender_id
      JOIN conversations c ON c.id=m.conv_id
      JOIN conversation_members cm ON cm.conv_id=m.conv_id AND cm.user_id=?
      WHERE m.content LIKE ? AND m.deleted_at IS NULL
      ORDER BY m.created_at DESC LIMIT 30
    `, [req.uid, req.uid, like]);
    res.json(results);
  });

  // HASHTAG
  app.get('/api/hashtag/:tag', auth, (req, res) => {
    const tag = (req.params.tag || '').toLowerCase().replace(/[^a-zа-я0-9_ёЁ]/gi, '');
    if (!tag) return res.json([]);
    const lim = Math.min(+req.query.limit||20, 50);
    const off = +req.query.offset||0;
    const raw = all(`
      SELECT p.*,u.username,u.display_name,u.avatar,u.is_verified,u.badge_type
      FROM posts p JOIN users u ON p.user_id=u.id
      WHERE LOWER(p.content) LIKE ? AND p.archived=0
        AND (u.is_private=0 OR p.user_id=? OR p.user_id IN (SELECT following_id FROM follows WHERE follower_id=?))
        AND p.user_id NOT IN (SELECT blocked_id FROM blocks WHERE blocker_id=?)
        AND p.user_id NOT IN (SELECT blocker_id FROM blocks WHERE blocked_id=?)
        AND u.banned_at IS NULL
      ORDER BY p.created_at DESC LIMIT ? OFFSET ?
    `, [`%#${tag}%`, req.uid, req.uid, req.uid, req.uid, lim, off]);
    res.json(enrich(raw, req.uid));
  });

  // ARTISTS
  app.get('/api/artists', auth, (req, res) => {
    res.json(all(`
      SELECT u.id,u.username,u.display_name,u.avatar,u.bio,u.created_at,u.is_verified,u.badge_type,
        (SELECT COUNT(*) FROM follows WHERE following_id=u.id) AS followers
      FROM users u
      WHERE u.email_verified=1 AND u.banned_at IS NULL
        AND u.id NOT IN (SELECT blocked_id FROM blocks WHERE blocker_id=?)
        AND u.id NOT IN (SELECT blocker_id FROM blocks WHERE blocked_id=?)
      ORDER BY followers DESC LIMIT 50
    `, [req.uid, req.uid]));
  });

  // LINK PREVIEW
  app.get('/api/link-preview', auth, limiterLinkPreview, async (req, res) => {
    const url = (req.query.url || '').trim();
    if (!url || !/^https?:\/\//i.test(url)) return res.status(400).json({ error: 'Invalid URL' });
    if (await isSsrfBlocked(url)) return res.status(400).json({ error: 'Invalid URL' });
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 5000);
      const r = await fetch(url, {
        signal: ctrl.signal,
        headers: { 'User-Agent': 'W0PIUMBot/1.0 (link preview)' }
      });
      clearTimeout(timer);
      if (!r.ok) return res.status(200).json({});
      const ct = r.headers.get('content-type') || '';
      if (!ct.includes('text/html')) return res.status(200).json({});
      const html = await r.text();
      const getMeta = (prop) => {
        const m = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["']`, 'i'))
               || html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${prop}["']`, 'i'));
        return m ? m[1].trim() : '';
      };
      const title = getMeta('og:title') || getMeta('twitter:title') || (html.match(/<title[^>]*>([^<]+)<\/title>/i)||[])[1] || '';
      const description = getMeta('og:description') || getMeta('twitter:description') || getMeta('description') || '';
      const image = getMeta('og:image') || getMeta('twitter:image') || '';
      const site = getMeta('og:site_name') || '';
      res.json({
        title: title.slice(0, 200),
        description: description.slice(0, 400),
        image: image.slice(0, 500),
        site: site.slice(0, 100),
        url
      });
    } catch (e) {
      logger.debug({ url, error: e.message }, 'link preview fetch failed');
      res.status(200).json({});
    }
  });

  // DROPS
  app.get('/api/drops', auth, (req, res) => {
    const drops=all(`SELECT d.*,u.username,u.display_name,u.avatar,(SELECT COUNT(*) FROM drop_views WHERE drop_id=d.id) AS view_count,(SELECT COUNT(*) FROM drop_views WHERE drop_id=d.id AND user_id=?) AS viewed FROM drops d JOIN users u ON u.id=d.user_id WHERE datetime(d.created_at)>datetime('now','-24 hours') AND (d.user_id=? OR d.user_id IN (SELECT following_id FROM follows WHERE follower_id=?)) ORDER BY viewed ASC, d.created_at DESC`,[req.uid,req.uid,req.uid]);
    res.json(drops);
  });
  app.post('/api/drops', auth, limiterDrops, dropUp.single('image'), async (req, res) => {
    const content=(req.body.content||'').trim(), track_url=(req.body.track_url||'').trim();
    let image='';
    if (req.file) {
      try {
        const nm = await processImage(req.file.path, IMG_DIR, { width: 1200, fit: 'inside' });
        image = '/images/' + nm;
      } catch (e) {
        logger.debug({ path: req.file.path, error: e.message }, 'drop image processing failed, using fallback');
        const ext = p.extname(req.file.originalname) || '.jpg';
        const nm = uuidv4() + ext;
        try { fs.renameSync(req.file.path, p.join(IMG_DIR, nm)); } catch (e2) { logger.debug({ path: req.file.path, error: e2.message }, 'failed to rename drop image'); }
        image = '/images/' + nm;
      }
    }
    if (!content&&!image&&!track_url) return res.status(400).json({ error:'Пустой drop' });
    const id=uuidv4();
    run('INSERT INTO drops (id,user_id,content,track_url,image,expires_at) VALUES(?,?,?,?,?,datetime(\'now\',\'+24 hours\'))',[id,req.uid,content,track_url,image]);
    res.json({ ok:1, id });
  });
  app.delete('/api/drops/:id', auth, (req, res) => {
    const d = get('SELECT image FROM drops WHERE id=? AND user_id=?', [req.params.id, req.uid]);
    if (d?.image) try { fs.unlinkSync(p.join(DATA, d.image.replace(/^\//, ''))); } catch (e) { logger.debug({ image: d.image, error: e.message }, 'failed to delete user drop image'); }
    run('DELETE FROM drops WHERE id=? AND user_id=?',[req.params.id,req.uid]); res.json({ ok:1 });
  });
  app.post('/api/drops/:id/view', auth, (req, res) => {
    const drop = get('SELECT user_id FROM drops WHERE id=?',[req.params.id]);
    if (drop && drop.user_id !== req.uid) {
      try { run('INSERT INTO drop_views (drop_id,user_id) VALUES(?,?)',[req.params.id,req.uid]); } catch (e) { logger.debug({ drop_id: req.params.id, error: e.message }, 'failed to record drop view'); }
    }
    res.json({ ok:1 });
  });

  // INVITE CODES
  app.get('/api/invite', auth, (req, res) => {
    res.json({ code: ensureInviteCode(req.uid), invite_only: INVITE_ONLY });
  });
  // CHATS
  app.post('/api/chats', auth, (req, res) => {
    const uid=req.uid, { target_id,members,title }=req.body||{};
    if (target_id) {
      if (target_id===uid) return res.status(400).json({ error:'no' });
      const conv=get(`SELECT c.id FROM conversations c JOIN conversation_members cm1 ON cm1.conv_id=c.id JOIN conversation_members cm2 ON cm2.conv_id=c.id WHERE c.is_group=0 AND cm1.user_id=? AND cm2.user_id=?`,[uid,target_id]);
      let convId;
      if (conv) { convId=conv.id; } else {
        const targetUser=get('SELECT dm_requests FROM users WHERE id=?',[target_id]);
        const needsRequest=targetUser&&targetUser.dm_requests!==0;
        convId=uuidv4();
        run('INSERT INTO conversations (id,is_group,title,owner) VALUES(?,?,?,?)',[convId,0,'','']);
        run('INSERT INTO conversation_members (conv_id,user_id,role,accepted) VALUES(?,?,?,?)',[convId,uid,'member',1]);
        run('INSERT INTO conversation_members (conv_id,user_id,role,accepted) VALUES(?,?,?,?)',[convId,target_id,'member',needsRequest?0:1]);
        if (needsRequest) { notify(target_id,uid,'dm',convId); pushEvent(target_id,'dm_request',{conv_id:convId}); }
      }
      return res.json({ id:convId });
    }
    const mems=(Array.isArray(members)?members:[]).filter(x=>x&&x!==uid); mems.push(uid);
    if (mems.length<2) return res.status(400).json({ error:'need_members' });
    const groupName=(title||'').trim()||'Group', convId=uuidv4();
    run('INSERT INTO conversations (id,is_group,title,owner) VALUES(?,?,?,?)',[convId,1,groupName,uid]);
    mems.forEach(id=>run('INSERT INTO conversation_members (conv_id,user_id,role) VALUES(?,?,?)',[convId,id,id===uid?'admin':'member']));
    mems.forEach(id=>{ if (id!==uid) { notify(id,uid,'dm',convId); pushEvent(id,'chat_invite',{id:convId,title:groupName}); } });
    res.json({ id:convId });
  });
  app.post('/api/chats/start/:id', auth, (req, res) => {
    const targetId=req.params.id;
    if (!targetId||targetId===req.uid) return res.status(400).json({ error:'no' });
    const blocked=get('SELECT 1 FROM blocks WHERE (blocker_id=? AND blocked_id=?) OR (blocker_id=? AND blocked_id=?)',[req.uid,targetId,targetId,req.uid]);
    if (blocked) return res.status(403).json({ error:'blocked' });
    const conv=get(`SELECT c.id FROM conversations c JOIN conversation_members cm1 ON cm1.conv_id=c.id JOIN conversation_members cm2 ON cm2.conv_id=c.id WHERE c.is_group=0 AND cm1.user_id=? AND cm2.user_id=?`,[req.uid,targetId]);
    let convId;
    if (conv) { convId=conv.id; } else {
      const targetUser=get('SELECT dm_requests FROM users WHERE id=?',[targetId]);
      const needsRequest=targetUser&&targetUser.dm_requests!==0;
      convId=uuidv4();
      run('INSERT INTO conversations (id,is_group,title,owner) VALUES(?,?,?,?)',[convId,0,'','']);
      run('INSERT INTO conversation_members (conv_id,user_id,role,accepted) VALUES(?,?,?,?)',[convId,req.uid,'member',1]);
      run('INSERT INTO conversation_members (conv_id,user_id,role,accepted) VALUES(?,?,?,?)',[convId,targetId,'member',needsRequest?0:1]);
      if (needsRequest) { notify(targetId,req.uid,'dm',convId); pushEvent(targetId,'dm_request',{conv_id:convId}); }
    }
    res.json({ id:convId });
  });
  app.post('/api/chats/:cid/accept', auth, (req, res) => {
    const cid=req.params.cid;
    const row=get('SELECT accepted FROM conversation_members WHERE conv_id=? AND user_id=?',[cid,req.uid]);
    if (!row) return res.status(403).json({ error:'forbidden' });
    run('UPDATE conversation_members SET accepted=1 WHERE conv_id=? AND user_id=?',[cid,req.uid]);
    // notify sender
    const other=all('SELECT user_id FROM conversation_members WHERE conv_id=? AND user_id!=?',[cid,req.uid]);
    other.forEach(m=>pushEvent(m.user_id,'dm_accepted',{conv_id:cid}));
    res.json({ ok:true });
  });
  app.post('/api/chats/:cid/decline', auth, (req, res) => {
    const cid=req.params.cid;
    if (!get('SELECT 1 AS x FROM conversation_members WHERE conv_id=? AND user_id=?',[cid,req.uid])) return res.status(403).json({ error:'forbidden' });
    // delete conversation entirely
    run('DELETE FROM messages WHERE conv_id=?',[cid]);
    run('DELETE FROM conversation_members WHERE conv_id=?',[cid]);
    run('DELETE FROM conversations WHERE id=?',[cid]);
    res.json({ ok:true });
  });

  // GROUP MEMBER MANAGEMENT
  app.post('/api/chats/:cid/members', auth, (req, res) => {
    const cid = req.params.cid;
    const conv = get('SELECT owner,is_group FROM conversations WHERE id=?', [cid]);
    if (!conv || !conv.is_group) return res.status(404).json({ error:'not found' });
    if (conv.owner !== req.uid) return res.status(403).json({ error:'only owner can add members' });
    const userId = req.body.user_id;
    if (!userId) return res.status(400).json({ error:'user_id required' });
    if (!get('SELECT 1 FROM users WHERE id=?', [userId])) return res.status(404).json({ error:'user not found' });
    if (get('SELECT 1 FROM conversation_members WHERE conv_id=? AND user_id=?', [cid, userId]))
      return res.status(400).json({ error:'already a member' });
    run('INSERT INTO conversation_members (conv_id,user_id,role,accepted) VALUES(?,?,?,?)', [cid, userId, 'member', 1]);
    notify(userId, req.uid, 'dm', cid);
    pushEvent(userId, 'chat_invite', { id:cid });
    res.json({ ok:1 });
  });
  app.delete('/api/chats/:cid/members/:uid', auth, (req, res) => {
    const { cid, uid } = req.params;
    const conv = get('SELECT owner FROM conversations WHERE id=?', [cid]);
    if (!conv) return res.status(404).json({ error:'not found' });
    if (conv.owner !== req.uid) return res.status(403).json({ error:'only owner can remove members' });
    if (uid === req.uid) return res.status(400).json({ error:'use leave to exit group' });
    if (!get('SELECT 1 FROM conversation_members WHERE conv_id=? AND user_id=?', [cid, uid]))
      return res.status(404).json({ error:'not a member' });
    run('DELETE FROM conversation_members WHERE conv_id=? AND user_id=?', [cid, uid]);
    pushEvent(uid, 'chat_removed', { conv_id:cid });
    res.json({ ok:1 });
  });
  app.post('/api/chats/:cid/leave', auth, (req, res) => {
    const cid = req.params.cid;
    const conv = get('SELECT owner,is_group FROM conversations WHERE id=?', [cid]);
    if (!conv || !conv.is_group) return res.status(404).json({ error:'not found' });
    if (!get('SELECT 1 FROM conversation_members WHERE conv_id=? AND user_id=?', [cid, req.uid]))
      return res.status(403).json({ error:'not a member' });
    run('DELETE FROM conversation_members WHERE conv_id=? AND user_id=?', [cid, req.uid]);
    if (conv.owner === req.uid) {
      const next = get('SELECT user_id FROM conversation_members WHERE conv_id=? LIMIT 1', [cid]);
      if (next) {
        run('UPDATE conversations SET owner=? WHERE id=?', [next.user_id, cid]);
        run('UPDATE conversation_members SET role=? WHERE conv_id=? AND user_id=?', ['admin', cid, next.user_id]);
      } else {
        run('DELETE FROM conversations WHERE id=?', [cid]);
      }
    }
    res.json({ ok:1 });
  });

  // Edit group title
  app.patch('/api/chats/:cid', auth, (req, res) => {
    const cid = req.params.cid;
    const conv = get('SELECT owner, is_group FROM conversations WHERE id=?', [cid]);
    if (!conv || !conv.is_group) return res.status(404).json({ error: 'not found' });
    if (conv.owner !== req.uid) return res.status(403).json({ error: 'only owner' });
    const title = (req.body.title || '').trim().slice(0, 100);
    if (!title) return res.status(400).json({ error: 'title required' });
    run('UPDATE conversations SET title=? WHERE id=?', [title, cid]);
    all('SELECT user_id FROM conversation_members WHERE conv_id=?', [cid])
      .forEach(r => pushEvent(r.user_id, 'group_updated', { conv_id: cid, title }));
    res.json({ ok: 1, title });
  });

  // Group avatar upload
  app.post('/api/chats/:cid/avatar', auth, avaUp.single('avatar'), async (req, res) => {
    const cid = req.params.cid;
    const conv = get('SELECT owner, is_group FROM conversations WHERE id=?', [cid]);
    if (!conv || !conv.is_group) return res.status(404).json({ error: 'not found' });
    if (conv.owner !== req.uid) return res.status(403).json({ error: 'only owner' });
    if (!req.file) return res.status(400).json({ error: 'no file' });
    try {
      const nm = await processImage(req.file.path, AVA_DIR, { width: 200, height: 200, fit: 'cover' });
      const avatar = '/avatars/' + nm;
      run('UPDATE conversations SET avatar=? WHERE id=?', [avatar, cid]);
      all('SELECT user_id FROM conversation_members WHERE conv_id=?', [cid])
        .forEach(r => pushEvent(r.user_id, 'group_updated', { conv_id: cid, avatar }));
      res.json({ ok: 1, avatar });
    } catch(e) {
      logger.error(e, 'group avatar failed');
      const ext = p.extname(req.file.originalname) || '.jpg';
      const nm = uuidv4() + ext;
      try { fs.renameSync(req.file.path, p.join(AVA_DIR, nm)); } catch (e2) { logger.debug({ path: req.file.path, error: e2.message }, 'failed to rename group avatar'); }
      const avatar = '/avatars/' + nm;
      run('UPDATE conversations SET avatar=? WHERE id=?', [avatar, cid]);
      res.json({ ok: 1, avatar });
    }
  });

  app.get('/api/chats', auth, (req, res) => {
    const includeArchived = req.query.archived === '1';
    const archiveWhere = includeArchived ? 'cm.archived_at IS NOT NULL' : 'cm.archived_at IS NULL';
    const convs=all(`SELECT c.id,c.is_group,c.title,c.owner,c.pinned_msg_id,c.avatar,cm.pinned_at,cm.archived_at FROM conversations c JOIN conversation_members cm ON cm.conv_id=c.id WHERE cm.user_id=? AND ${archiveWhere} ORDER BY cm.pinned_at IS NULL, datetime(cm.pinned_at) DESC, (SELECT created_at FROM messages m WHERE m.conv_id=c.id ORDER BY m.created_at DESC LIMIT 1) DESC NULLS LAST, c.created_at DESC`,[req.uid]);
    const result=convs.map(c=>{
      const members=all(`SELECT u.id,u.username,u.display_name,u.avatar,u.last_seen FROM conversation_members cm JOIN users u ON cm.user_id=u.id WHERE cm.conv_id=?`,[c.id]);
      const last=get(`SELECT m.id,m.sender_id,m.content,m.file,m.file_type,m.edited_at,m.deleted_at,m.created_at,u.username,u.display_name FROM messages m JOIN users u ON u.id=m.sender_id WHERE m.conv_id=? ORDER BY m.created_at DESC LIMIT 1`,[c.id]);
      const lr=get('SELECT last_read,accepted,muted_until,pinned_at,archived_at FROM conversation_members WHERE conv_id=? AND user_id=?',[c.id,req.uid]);
      const unread=lr?get('SELECT COUNT(*) AS c FROM messages WHERE conv_id=? AND datetime(created_at)>datetime(?) AND deleted_at IS NULL',[c.id,lr.last_read]).c:0;
      const my_accepted=lr?!!lr.accepted:true;
      let other_last_seen = null;
      if (!c.is_group) {
        const otherMember = members.find(m => m.id !== req.uid);
        if (otherMember) other_last_seen = otherMember.last_seen || null;
      }
      return { id:c.id, is_group:!!c.is_group, title:c.title, members, last, unread, my_accepted, pinned_msg_id: c.pinned_msg_id || null, pinned_at: lr?.pinned_at || c.pinned_at || null, archived_at: lr?.archived_at || c.archived_at || null, muted_until: lr?.muted_until || null, other_last_seen, avatar: c.avatar || '' };
    });
    res.json(result);
  });

  app.patch('/api/chats/:cid/state', auth, (req, res) => {
    const cid = req.params.cid;
    if (!get('SELECT 1 FROM conversation_members WHERE conv_id=? AND user_id=?', [cid, req.uid]))
      return res.status(403).json({ error:'forbidden' });
    const body = req.body || {};
    if (Object.prototype.hasOwnProperty.call(body, 'pinned')) {
      run('UPDATE conversation_members SET pinned_at=? WHERE conv_id=? AND user_id=?', [body.pinned ? new Date().toISOString() : null, cid, req.uid]);
    }
    if (Object.prototype.hasOwnProperty.call(body, 'archived')) {
      run('UPDATE conversation_members SET archived_at=? WHERE conv_id=? AND user_id=?', [body.archived ? new Date().toISOString() : null, cid, req.uid]);
    }
    const row = get('SELECT pinned_at,archived_at FROM conversation_members WHERE conv_id=? AND user_id=?', [cid, req.uid]);
    res.json({ ok:1, pinned_at: row?.pinned_at || null, archived_at: row?.archived_at || null });
  });

  app.get('/api/chats/saved', auth, (req, res) => {
    const rows = all(`
      SELECT m.id,m.conv_id,m.sender_id,m.content,m.file,m.file_type,m.file_name,m.file_size,m.edited_at,m.deleted_at,m.created_at,m.reply_to,m.reply_text,m.forwarded_from,
             sm.created_at AS saved_at,u.username,u.display_name,u.avatar,u.is_verified,c.is_group,c.title
      FROM saved_messages sm
      JOIN messages m ON m.id=sm.msg_id
      JOIN users u ON u.id=m.sender_id
      JOIN conversations c ON c.id=m.conv_id
      JOIN conversation_members cm ON cm.conv_id=m.conv_id AND cm.user_id=sm.user_id
      WHERE sm.user_id=? AND m.deleted_at IS NULL
      ORDER BY sm.created_at DESC LIMIT 100
    `, [req.uid]);
    res.json(enrichMessages(rows, req.uid));
  });
  app.get('/api/chats/:cid/messages', auth, (req, res) => {
    const cid=req.params.cid;
    if (!get('SELECT 1 AS x FROM conversation_members WHERE conv_id=? AND user_id=?',[cid,req.uid])) return res.status(403).json({ error:'forbidden' });
    const after=req.query.after;
    const before=req.query.before;
    const limit=50;
    let msgs;
    if (after) {
      msgs=all(`SELECT m.id,m.conv_id,m.sender_id,m.content,m.file,m.file_type,m.file_name,m.edited_at,m.deleted_at,m.created_at,m.reply_to,m.reply_text,m.forwarded_from,u.username,u.display_name,u.avatar,u.is_verified FROM messages m JOIN users u ON u.id=m.sender_id WHERE m.conv_id=? AND datetime(m.created_at)>datetime(?) ORDER BY m.created_at ASC`,[cid,after]);
    } else if (before) {
      msgs=all(`SELECT m.id,m.conv_id,m.sender_id,m.content,m.file,m.file_type,m.file_name,m.edited_at,m.deleted_at,m.created_at,m.reply_to,m.reply_text,m.forwarded_from,u.username,u.display_name,u.avatar,u.is_verified FROM messages m JOIN users u ON u.id=m.sender_id WHERE m.conv_id=? AND datetime(m.created_at)<datetime(?) ORDER BY m.created_at DESC LIMIT ?`,[cid,before,limit+1]);
    } else {
      msgs=all(`SELECT m.id,m.conv_id,m.sender_id,m.content,m.file,m.file_type,m.file_name,m.edited_at,m.deleted_at,m.created_at,m.reply_to,m.reply_text,m.forwarded_from,u.username,u.display_name,u.avatar,u.is_verified FROM messages m JOIN users u ON u.id=m.sender_id WHERE m.conv_id=? ORDER BY m.created_at DESC LIMIT ?`,[cid,limit+1]);
    }
    let has_more=false;
    if (before || (!after && !before)) {
      has_more=msgs.length>limit;
      if (has_more) msgs.pop();
      msgs.reverse(); // ASC for display
    }
    const others=all('SELECT cm.user_id,cm.last_read,u.show_read_receipts FROM conversation_members cm JOIN users u ON u.id=cm.user_id WHERE cm.conv_id=? AND cm.user_id!=?',[cid,req.uid]);
    const meRow=get('SELECT show_read_receipts FROM users WHERE id=?',[req.uid]);
    // A DM read timestamp is visible only when the other participant allows read receipts.
    const other_last_read=others.length===1&&others[0].show_read_receipts!==0?others[0].last_read:null;
    const now=new Date().toISOString();
    run('UPDATE conversation_members SET last_read=? WHERE conv_id=? AND user_id=?',[now,cid,req.uid]);
    // Only push msg_read events if this user has show_read_receipts on
    if (meRow?.show_read_receipts!==0) others.forEach(m=>pushEvent(m.user_id,'msg_read',{conv_id:cid,last_read:now}));
    const myRow=get('SELECT accepted FROM conversation_members WHERE conv_id=? AND user_id=?',[cid,req.uid]);
    const my_accepted=myRow?!!myRow.accepted:true;
    const convMeta=get('SELECT pinned_msg_id FROM conversations WHERE id=?',[cid]);
    const pinned_msg=convMeta?.pinned_msg_id
      ? get('SELECT id,content,file_type FROM messages WHERE id=? AND deleted_at IS NULL',[convMeta.pinned_msg_id])
      : null;
    res.json({messages:enrichMessages(msgs,req.uid),other_last_read,my_accepted,has_more,pinned_msg});
  });

  app.get('/api/chats/:cid/media', auth, (req, res) => {
    const cid = req.params.cid;
    if (!get('SELECT 1 FROM conversation_members WHERE conv_id=? AND user_id=?', [cid, req.uid]))
      return res.status(403).json({ error: 'forbidden' });
    const offset = +req.query.offset || 0;
    const media = all(`
      SELECT m.id, m.content, m.file, m.file_type, m.file_name, m.file_size, m.created_at, m.sender_id,
             u.display_name, u.avatar
      FROM messages m JOIN users u ON u.id=m.sender_id
      WHERE m.conv_id=? AND m.deleted_at IS NULL
        AND ((m.file IS NOT NULL AND m.file != '') OR m.content LIKE '%http://%' OR m.content LIKE '%https://%')
      ORDER BY m.created_at DESC LIMIT 50 OFFSET ?
    `, [cid, offset]);
    res.json(media);
  });
  app.get('/api/chats/:cid/messages/:mid/context', auth, (req, res) => {
    const { cid, mid } = req.params;
    if (!get('SELECT 1 FROM conversation_members WHERE conv_id=? AND user_id=?', [cid, req.uid]))
      return res.status(403).json({ error: 'forbidden' });
    const target = get('SELECT created_at FROM messages WHERE id=? AND conv_id=?', [mid, cid]);
    if (!target) return res.status(404).json({ error: 'not found' });
    // 15 messages before + the message + 15 after
    const before = all(`SELECT m.id,m.conv_id,m.sender_id,m.content,m.file,m.file_type,m.file_name,m.edited_at,m.deleted_at,m.created_at,m.reply_to,m.reply_text,m.forwarded_from,u.username,u.display_name,u.avatar,u.is_verified FROM messages m JOIN users u ON u.id=m.sender_id WHERE m.conv_id=? AND datetime(m.created_at)<datetime(?) ORDER BY m.created_at DESC LIMIT 15`, [cid, target.created_at]);
    const after  = all(`SELECT m.id,m.conv_id,m.sender_id,m.content,m.file,m.file_type,m.file_name,m.edited_at,m.deleted_at,m.created_at,m.reply_to,m.reply_text,m.forwarded_from,u.username,u.display_name,u.avatar,u.is_verified FROM messages m JOIN users u ON u.id=m.sender_id WHERE m.conv_id=? AND datetime(m.created_at)>=datetime(?) ORDER BY m.created_at ASC LIMIT 16`, [cid, target.created_at]);
    const msgs = [...before.reverse(), ...after];
    res.json({ messages: enrichMessages(msgs, req.uid), target_id: mid });
  });

  app.get('/api/chats/:cid/search', auth, limiterDmSearch, (req,res) => {
    const cid = req.params.cid;
    const q = (req.query.q || '').trim();
    if (!q || q.length < 2) return res.json([]);
    const member = get('SELECT 1 FROM conversation_members WHERE conv_id=? AND user_id=?', [cid, req.uid]);
    if (!member) return res.status(403).json({error:'forbidden'});
    const like = `%${q}%`;
    const msgs = all(`
      SELECT m.id,m.sender_id,m.content,m.created_at,u.display_name,u.avatar
      FROM messages m JOIN users u ON u.id=m.sender_id
      WHERE m.conv_id=? AND m.content LIKE ? AND m.deleted_at IS NULL
      ORDER BY m.created_at DESC LIMIT 30
    `, [cid, like]);
    res.json(msgs);
  });

  app.post('/api/chats/:cid/messages', auth, limiterMsg, fileUp.single('file'), (req, res) => {
    const cid=req.params.cid;
    if (!get('SELECT 1 AS x FROM conversation_members WHERE conv_id=? AND user_id=?',[cid,req.uid])) return res.status(403).json({ error:'forbidden' });
    // For 1-on-1 chats: block either direction prevents messaging
    const convMeta = get('SELECT is_group FROM conversations WHERE id=?',[cid]);
    if (convMeta && !convMeta.is_group) {
      const others = all('SELECT user_id FROM conversation_members WHERE conv_id=? AND user_id!=?',[cid,req.uid]);
      for (const m of others) {
        if (get('SELECT 1 FROM blocks WHERE (blocker_id=? AND blocked_id=?) OR (blocker_id=? AND blocked_id=?)',[req.uid,m.user_id,m.user_id,req.uid]))
          return res.status(403).json({ error:'blocked' });
      }
    }
    const text=(req.body.content||'').trim();
    const reply_to=(req.body.reply_to||'').trim();
    const reply_text=(req.body.reply_text||'').slice(0,200);
    let file='',fileType='',fileSize=0,fileName='';
    if (req.file) { const ext=p.extname(req.file.originalname)||'',nm=uuidv4()+ext; fs.renameSync(req.file.path,p.join(FILE_DIR,nm)); file='/files/'+nm; fileType=req.file.mimetype||''; fileSize=req.file.size||0; fileName=req.file.originalname||''; }
    if (!text&&!file) return res.status(400).json({ error:'empty' });
    const id=uuidv4();
    run('INSERT INTO messages (id,conv_id,sender_id,content,file,file_type,file_size,file_name,reply_to,reply_text) VALUES(?,?,?,?,?,?,?,?,?,?)',[id,cid,req.uid,text||'',file,fileType,fileSize,fileName,reply_to,reply_text]);
    run('UPDATE conversation_members SET last_read=datetime(\'now\') WHERE conv_id=? AND user_id=?',[cid,req.uid]);
    const members=all('SELECT user_id FROM conversation_members WHERE conv_id=?',[cid]);
    const payload={ id,conv_id:cid,sender_id:req.uid,content:text||'',file,file_type:fileType,file_size:fileSize,file_name:fileName,reply_to,reply_text,created_at:new Date().toISOString(),reactions:[] };
    members.forEach(row=>{ if (row.user_id!==req.uid) { notify(row.user_id,req.uid,'dm',cid); pushEvent(row.user_id,'message',payload); const memRow=get('SELECT muted_until FROM conversation_members WHERE conv_id=? AND user_id=?',[cid,row.user_id]); const isMuted=memRow?.muted_until&&new Date(memRow.muted_until)>new Date(); if (!isMuted) sendPush(row.user_id, `Новое сообщение`, payload.content ? payload.content.slice(0,80) : '📎 файл', '/'); } });
    // Detect @mentions and notify mentioned users
    const mentionMatches=(text||'').match(/@([a-z0-9_]+)/gi)||[];
    const mentionedUsernames=[...new Set(mentionMatches.map(m=>m.slice(1).toLowerCase()))];
    if (mentionedUsernames.length&&convMeta?.is_group) {
      mentionedUsernames.forEach(uname=>{
        const mentioned=get('SELECT id FROM users WHERE LOWER(username)=?',[uname]);
        if (mentioned&&mentioned.id!==req.uid) {
          if (get('SELECT 1 FROM conversation_members WHERE conv_id=? AND user_id=?',[cid,mentioned.id])) {
            pushEvent(mentioned.id,'mention',{conv_id:cid,msg_id:id,from_id:req.uid});
            sendPush(mentioned.id,`Упоминание`,`@${uname}: ${(text||'').slice(0,60)}`,'/');}
        }
      });
    }
    res.json({ ok:1, id });
  });
  app.put('/api/chats/:cid/messages/:mid', auth, (req, res) => {
    const { cid,mid }=req.params, newText=(req.body.content||'').trim();
    if (!newText) return res.status(400).json({ error:'empty' });
    const msg=get('SELECT sender_id FROM messages WHERE id=? AND conv_id=?',[mid,cid]);
    if (!msg||msg.sender_id!==req.uid) return res.status(403).json({ error:'forbidden' });
    run('UPDATE messages SET content=?,edited_at=datetime(\'now\') WHERE id=?',[newText,mid]);
    const payload={ id:mid,conv_id:cid,content:newText,edited_at:new Date().toISOString() };
    all('SELECT user_id FROM conversation_members WHERE conv_id=?',[cid]).forEach(r=>pushEvent(r.user_id,'edit',payload));
    res.json({ ok:1 });
  });
  app.delete('/api/chats/:cid/messages/:mid', auth, (req, res) => {
    const { cid,mid }=req.params;
    const msg=get('SELECT sender_id FROM messages WHERE id=? AND conv_id=?',[mid,cid]);
    if (!msg||msg.sender_id!==req.uid) return res.status(403).json({ error:'forbidden' });
    run('UPDATE messages SET deleted_at=datetime(\'now\') WHERE id=?',[mid]);
    run('DELETE FROM message_reactions WHERE msg_id=?',[mid]);
    all('SELECT user_id FROM conversation_members WHERE conv_id=?',[cid]).forEach(r=>pushEvent(r.user_id,'delete',{id:mid,conv_id:cid}));
    res.json({ ok:1 });
  });

  app.post('/api/chats/:cid/messages/:mid/forward', auth, limiterMsg, (req, res) => {
    const { cid, mid } = req.params;
    const { target_cid } = req.body;
    if (!target_cid) return res.status(400).json({ error: 'target_cid required' });
    // Must be member of source chat
    if (!get('SELECT 1 FROM conversation_members WHERE conv_id=? AND user_id=?', [cid, req.uid]))
      return res.status(403).json({ error: 'forbidden' });
    // Must be member of target chat
    if (!get('SELECT 1 FROM conversation_members WHERE conv_id=? AND user_id=?', [target_cid, req.uid]))
      return res.status(403).json({ error: 'forbidden' });
    const orig = get('SELECT content, file, file_type, file_size, file_name FROM messages WHERE id=? AND conv_id=? AND deleted_at IS NULL', [mid, cid]);
    if (!orig) return res.status(404).json({ error: 'not found' });
    const id = uuidv4();
    run('INSERT INTO messages (id,conv_id,sender_id,content,file,file_type,file_size,file_name,forwarded_from) VALUES(?,?,?,?,?,?,?,?,?)',
      [id, target_cid, req.uid, orig.content || '', orig.file || '', orig.file_type || '', orig.file_size || 0, orig.file_name || '', mid]);
    run('UPDATE conversation_members SET last_read=datetime(\'now\') WHERE conv_id=? AND user_id=?', [target_cid, req.uid]);
    const fwdMembers = all('SELECT user_id FROM conversation_members WHERE conv_id=?', [target_cid]);
    const payload = { id, conv_id: target_cid, sender_id: req.uid, content: orig.content || '', file: orig.file || '', file_type: orig.file_type || '', file_size: orig.file_size || 0, forwarded_from: mid, created_at: new Date().toISOString(), reactions: [] };
    fwdMembers.forEach(row => { if (row.user_id !== req.uid) { pushEvent(row.user_id, 'message', payload); } });
    res.json({ ok: 1, id });
  });

  app.post('/api/chats/:cid/pin', auth, (req, res) => {
    const cid = req.params.cid;
    const conv = get('SELECT owner, is_group FROM conversations WHERE id=?', [cid]);
    if (!conv) return res.status(404).json({ error: 'not found' });
    if (!get('SELECT 1 FROM conversation_members WHERE conv_id=? AND user_id=?', [cid, req.uid]))
      return res.status(403).json({ error: 'forbidden' });
    // In groups, only owner can pin. In DMs, anyone can.
    if (conv.is_group && conv.owner !== req.uid) return res.status(403).json({ error: 'only owner can pin' });
    const { msg_id } = req.body;
    if (!msg_id) return res.status(400).json({ error: 'msg_id required' });
    const msg = get('SELECT id, content, file_type FROM messages WHERE id=? AND conv_id=? AND deleted_at IS NULL', [msg_id, cid]);
    if (!msg) return res.status(404).json({ error: 'message not found' });
    run('UPDATE conversations SET pinned_msg_id=? WHERE id=?', [msg_id, cid]);
    all('SELECT user_id FROM conversation_members WHERE conv_id=?', [cid])
      .forEach(r => pushEvent(r.user_id, 'pin_update', { conv_id: cid, msg_id, preview: (msg.content || '').slice(0, 80) }));
    res.json({ ok: 1 });
  });

  app.delete('/api/chats/:cid/pin', auth, (req, res) => {
    const cid = req.params.cid;
    const conv = get('SELECT owner, is_group FROM conversations WHERE id=?', [cid]);
    if (!conv) return res.status(404).json({ error: 'not found' });
    if (conv.is_group && conv.owner !== req.uid) return res.status(403).json({ error: 'only owner can unpin' });
    run('UPDATE conversations SET pinned_msg_id=NULL WHERE id=?', [cid]);
    all('SELECT user_id FROM conversation_members WHERE conv_id=?', [cid])
      .forEach(r => pushEvent(r.user_id, 'pin_update', { conv_id: cid, msg_id: null, preview: null }));
    res.json({ ok: 1 });
  });

  app.patch('/api/chats/:cid/mute', auth, (req, res) => {
    const cid = req.params.cid;
    if (!get('SELECT 1 FROM conversation_members WHERE conv_id=? AND user_id=?', [cid, req.uid]))
      return res.status(403).json({ error: 'forbidden' });
    const { hours } = req.body; // 0 = unmute, 1/8/24/168 = mute for N hours
    const muted_until = hours && hours > 0
      ? new Date(Date.now() + hours * 3600000).toISOString()
      : null;
    run('UPDATE conversation_members SET muted_until=? WHERE conv_id=? AND user_id=?', [muted_until, cid, req.uid]);
    res.json({ ok: 1, muted_until });
  });

  // MESSAGE REACTIONS
  const ALLOWED_EMOJI=['🔥','💀','🎵','👀','✅','😭','❤️','💯'];
  app.post('/api/chats/:cid/messages/:mid/react', auth, limiterReact, (req, res) => {
    const { cid,mid }=req.params, { emoji }=req.body;
    if (!emoji||!ALLOWED_EMOJI.includes(emoji)) return res.status(400).json({ error:'invalid emoji' });
    if (!get('SELECT 1 FROM conversation_members WHERE conv_id=? AND user_id=?',[cid,req.uid])) return res.status(403).json({ error:'forbidden' });
    if (!get('SELECT id FROM messages WHERE id=? AND conv_id=?',[mid,cid])) return res.status(404).json({ error:'not found' });
    // Toggle: same emoji → remove. Different emoji → replace.
    const existing = get('SELECT emoji FROM message_reactions WHERE msg_id=? AND user_id=?',[mid,req.uid]);
    if (existing && existing.emoji === emoji) {
      run('DELETE FROM message_reactions WHERE msg_id=? AND user_id=?',[mid,req.uid]);
    } else if (existing) {
      run('UPDATE message_reactions SET emoji=? WHERE msg_id=? AND user_id=?',[emoji,mid,req.uid]);
    } else {
      run('INSERT INTO message_reactions (msg_id,user_id,emoji) VALUES(?,?,?)',[mid,req.uid,emoji]);
    }
    const reactions=enrichMessages([{ id: mid }], req.uid)[0].reactions;
    all('SELECT user_id FROM conversation_members WHERE conv_id=?',[cid]).forEach(r=>pushEvent(r.user_id,'reaction',{msg_id:mid,conv_id:cid,reactions}));
    res.json({ ok:1, reactions });
  });
  app.delete('/api/chats/:cid/messages/:mid/react', auth, (req, res) => {
    const { cid,mid }=req.params;
    run('DELETE FROM message_reactions WHERE msg_id=? AND user_id=?',[mid,req.uid]);
    const reactions=enrichMessages([{ id: mid }], req.uid)[0].reactions;
    all('SELECT user_id FROM conversation_members WHERE conv_id=?',[cid]).forEach(r=>pushEvent(r.user_id,'reaction',{msg_id:mid,conv_id:cid,reactions}));
    res.json({ ok:1, reactions });
  });

  // ── BLOCKS ──
  app.post('/api/chats/:cid/messages/:mid/save', auth, (req, res) => {
    const { cid, mid } = req.params;
    if (!get('SELECT 1 FROM conversation_members WHERE conv_id=? AND user_id=?', [cid, req.uid]))
      return res.status(403).json({ error:'forbidden' });
    if (!get('SELECT 1 FROM messages WHERE id=? AND conv_id=? AND deleted_at IS NULL', [mid, cid]))
      return res.status(404).json({ error:'not found' });
    run('INSERT OR IGNORE INTO saved_messages (user_id,msg_id) VALUES(?,?)', [req.uid, mid]);
    res.json({ ok:1, saved:true });
  });

  app.delete('/api/chats/:cid/messages/:mid/save', auth, (req, res) => {
    const { cid, mid } = req.params;
    if (!get('SELECT 1 FROM conversation_members WHERE conv_id=? AND user_id=?', [cid, req.uid]))
      return res.status(403).json({ error:'forbidden' });
    run('DELETE FROM saved_messages WHERE user_id=? AND msg_id=?', [req.uid, mid]);
    res.json({ ok:1, saved:false });
  });

  app.post('/api/user/:u/block', auth, limiterBlockMute, (req,res) => {
    const target = get('SELECT id FROM users WHERE username=?', [req.params.u]);
    if (!target) return res.status(404).json({error:'not found'});
    if (target.id === req.uid) return res.status(400).json({error:'cannot block yourself'});
    run('INSERT OR IGNORE INTO blocks (blocker_id,blocked_id) VALUES(?,?)', [req.uid, target.id]);
    // Remove follow relationship both ways
    run('DELETE FROM follows WHERE (follower_id=? AND following_id=?) OR (follower_id=? AND following_id=?)', [req.uid,target.id,target.id,req.uid]);
    res.json({ok:1});
  });
  app.delete('/api/user/:u/block', auth, limiterBlockMute, (req,res) => {
    const target = get('SELECT id FROM users WHERE username=?', [req.params.u]);
    if (!target) return res.status(404).json({error:'not found'});
    run('DELETE FROM blocks WHERE blocker_id=? AND blocked_id=?', [req.uid, target.id]);
    res.json({ok:1});
  });

  // ── MUTES ──
  app.post('/api/user/:u/mute', auth, limiterBlockMute, (req,res) => {
    const target = get('SELECT id FROM users WHERE username=?', [req.params.u]);
    if (!target) return res.status(404).json({error:'not found'});
    if (target.id === req.uid) return res.status(400).json({error:'cannot mute yourself'});
    run('INSERT OR IGNORE INTO mutes (muter_id,muted_id) VALUES(?,?)', [req.uid, target.id]);
    res.json({ok:1});
  });
  app.delete('/api/user/:u/mute', auth, limiterBlockMute, (req,res) => {
    const target = get('SELECT id FROM users WHERE username=?', [req.params.u]);
    if (!target) return res.status(404).json({error:'not found'});
    run('DELETE FROM mutes WHERE muter_id=? AND muted_id=?', [req.uid, target.id]);
    res.json({ok:1});
  });

  // TYPING
  app.post('/api/chats/:cid/typing', auth, limiterTyping, (req, res) => {
    const cid=req.params.cid;
    if (!get('SELECT 1 AS x FROM conversation_members WHERE conv_id=? AND user_id=?',[cid,req.uid])) return res.status(403).json({ error:'forbidden' });
    const u=get('SELECT show_typing FROM users WHERE id=?',[req.uid]);
    if (!u||u.show_typing===0) return res.json({ ok:1 }); // silently suppress
    all('SELECT user_id FROM conversation_members WHERE conv_id=?',[cid]).forEach(r=>{ if (r.user_id!==req.uid) pushEvent(r.user_id,'typing',{conv_id:cid,user_id:req.uid}); });
    res.json({ ok:1 });
  });

  // ── REPORTS ──
  app.post('/api/report', auth, limiterReport, (req, res) => {
    const { target_type, target_id, reason } = req.body;
    const allowed = ['post','user','message','drop'];
    if (!target_type || !allowed.includes(target_type) || !target_id) return res.status(400).json({ error:'Неверные данные' });
    // prevent duplicate open reports from same user
    const exists = get('SELECT id FROM reports WHERE reporter_id=? AND target_id=? AND status=?',[req.uid,target_id,'open']);
    if (exists) return res.status(409).json({ error:'Жалоба уже отправлена' });
    const id = uuidv4();
    run('INSERT INTO reports (id,reporter_id,target_type,target_id,reason) VALUES(?,?,?,?,?)',
      [id, req.uid, target_type, target_id, (reason||'').slice(0,200)]);
    // notify all admins via SSE
    const admins = all('SELECT id FROM users WHERE is_admin=1');
    admins.forEach(a => pushEvent(a.id, 'new_report', { id, target_type, target_id }));
    res.json({ ok:1 });
  });

  // ── PUSH NOTIFICATIONS ──
  app.get('/api/push/vapid-public', (req, res) => {
    res.json({ key: VAPID_PUBLIC });
  });

  app.post('/api/push/subscribe', auth, (req, res) => {
    const { endpoint, keys } = req.body;
    if (!endpoint || !keys?.p256dh || !keys?.auth) return res.status(400).json({ error:'Неверные данные' });
    const existing = get('SELECT id FROM push_subscriptions WHERE endpoint=?', [endpoint]);
    if (existing) {
      run('UPDATE push_subscriptions SET user_id=?,p256dh=?,auth_key=? WHERE endpoint=?',
        [req.uid, keys.p256dh, keys.auth, endpoint]);
    } else {
      run('INSERT INTO push_subscriptions (id,user_id,endpoint,p256dh,auth_key) VALUES(?,?,?,?,?)',
        [uuidv4(), req.uid, endpoint, keys.p256dh, keys.auth]);
    }
    res.json({ ok:1 });
  });

  app.delete('/api/push/subscribe', auth, (req, res) => {
    const { endpoint } = req.body;
    if (endpoint) run('DELETE FROM push_subscriptions WHERE endpoint=? AND user_id=?', [endpoint, req.uid]);
    else run('DELETE FROM push_subscriptions WHERE user_id=?', [req.uid]);
    res.json({ ok:1 });
  });

  // ── DATA EXPORT ──
  app.get('/api/export', auth, limiterExport, (req, res) => {
    const u = get('SELECT id,username,display_name,bio,avatar,link_sc,link_ig,link_tg,link_spotify,link_site,is_private,is_verified,created_at FROM users WHERE id=?', [req.uid]);
    if (!u) return res.status(404).json({ error:'Not found' });
    const posts    = all('SELECT id,content,track_url,image,created_at FROM posts WHERE user_id=? AND repost_of=\'\' ORDER BY created_at DESC', [req.uid]);
    const drops    = all('SELECT id,content,caption,image,created_at FROM drops WHERE user_id=? ORDER BY created_at DESC', [req.uid]);
    const files    = all('SELECT id,name,size,mime,description,created_at FROM disk_files WHERE user_id=? ORDER BY created_at DESC', [req.uid]);
    const convs    = all('SELECT conv_id FROM conversation_members WHERE user_id=?', [req.uid]);
    const messages = convs.flatMap(c =>
      all('SELECT id,conv_id,content,file_type,created_at FROM messages WHERE conv_id=? AND sender_id=? AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 500', [c.conv_id, req.uid])
    );
    const follows_out = all('SELECT u.username,u.display_name FROM follows f JOIN users u ON u.id=f.following_id WHERE f.follower_id=?', [req.uid]);
    const follows_in  = all('SELECT u.username,u.display_name FROM follows f JOIN users u ON u.id=f.follower_id WHERE f.following_id=?', [req.uid]);

    const payload = {
      profile: u,
      exported_at: new Date().toISOString(),
      stats: { posts: posts.length, drops: drops.length, files: files.length, messages: messages.length, following: follows_out.length, followers: follows_in.length },
      posts,
      drops,
      disk_files: files,
      messages,
      following: follows_out,
      followers: follows_in,
    };
    res.setHeader('Content-Disposition', `attachment; filename="w0pium-${u.username}-export.json"`);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.send(JSON.stringify(payload, null, 2));
  });

  // ── CHAT EXPORT ──
  app.get('/api/chats/:cid/export', auth, (req, res) => {
    const cid=req.params.cid;
    if (!get('SELECT 1 AS x FROM conversation_members WHERE conv_id=? AND user_id=?',[cid,req.uid]))
      return res.status(403).json({ error:'forbidden' });
    const msgs=all(`SELECT m.content,m.file_type,m.file_name,m.created_at,u.display_name
      FROM messages m JOIN users u ON u.id=m.sender_id
      WHERE m.conv_id=? AND m.deleted_at IS NULL ORDER BY m.created_at ASC`,[cid]);
    const lines=msgs.map(m=>{
      const d=new Date(m.created_at.endsWith('Z')?m.created_at:m.created_at.replace(' ','T')+'Z');
      const ts=d.toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
      let text=m.content||'';
      if (!text&&m.file_type){
        if(m.file_type.startsWith('audio/')) text='[голосовое сообщение]';
        else if(m.file_type.startsWith('image/')) text='[изображение]';
        else if(m.file_type.startsWith('video/')) text='[видео]';
        else text=`[файл: ${m.file_name||'attachment'}]`;
      }
      return `[${ts}] ${m.display_name}: ${text}`;
    });
    const conv=get('SELECT is_group,title FROM conversations WHERE id=?',[cid]);
    const partners=all(`SELECT u.display_name FROM conversation_members cm JOIN users u ON u.id=cm.user_id WHERE cm.conv_id=? AND cm.user_id!=?`,[cid,req.uid]);
    const title=conv.is_group?(conv.title||'Группа'):(partners[0]?.display_name||'Диалог');
    const header=`W0PIUM — ${title}\nЭкспорт: ${new Date().toLocaleString('ru-RU')}\n${'─'.repeat(40)}\n`;
    res.setHeader('Content-Disposition',`attachment; filename="chat-${cid.slice(0,8)}.txt"`);
    res.setHeader('Content-Type','text/plain; charset=utf-8');
    res.send(header+lines.join('\n'));
  });

  // ── HUB ──
  const hubStatsCache = {};   // platform -> { data, ts }
  const HUB_CACHE_TTL = 30 * 60 * 1000; // 30 min

  async function fetchPlatformStats(platform, apiKey) {
    try {
      if (platform === 'vk') {
        const r = await fetch(`https://api.vk.com/method/users.get?user_ids=walfir_off&fields=followers_count&v=5.131${apiKey ? '&access_token=' + apiKey : ''}`);
        const d = await r.json();
        if (d.response?.[0]) {
          const u = d.response[0];
          return { followers: u.followers_count ?? null };
        }
      }
      if (platform === 'youtube' && apiKey) {
        const r = await fetch(`https://www.googleapis.com/youtube/v3/channels?part=statistics&forHandle=%40Walfirrr&key=${apiKey}`);
        const d = await r.json();
        const ch = d.items?.[0]?.statistics;
        if (ch) return { subscribers: parseInt(ch.subscriberCount)||0, views: parseInt(ch.viewCount)||0, videos: parseInt(ch.videoCount)||0 };
      }
      if (platform === 'soundcloud' && apiKey) {
        const [clientId, clientSecret] = apiKey.split(':');
        const tokenRes = await fetch('https://api.soundcloud.com/oauth2/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `grant_type=client_credentials&client_id=${clientId}&client_secret=${clientSecret}`
        });
        const token = await tokenRes.json();
        if (token.access_token) {
          // client_credentials gives app-auth, use public user endpoint not /me
          const r = await fetch(`https://api.soundcloud.com/users?q=walfir&client_id=${clientId}&limit=1`, {
            headers: { 'Authorization': `Bearer ${token.access_token}`, 'Accept': 'application/json; charset=utf-8' }
          });
          const d = await r.json();
          const u = Array.isArray(d) ? d[0] : d?.collection?.[0];
          if (u?.id) return { followers: u.followers_count||0, tracks: u.track_count||0 };
        }
      }
      if (platform === 'x' && apiKey) {
        // apiKey = consumer_key:consumer_secret — generate bearer token via OAuth2
        const [consumerKey, consumerSecret] = apiKey.split(':');
        const b64 = Buffer.from(`${encodeURIComponent(consumerKey)}:${encodeURIComponent(consumerSecret)}`).toString('base64');
        const tokenRes = await fetch('https://api.twitter.com/oauth2/token', {
          method: 'POST',
          headers: { 'Authorization': `Basic ${b64}`, 'Content-Type': 'application/x-www-form-urlencoded' },
          body: 'grant_type=client_credentials'
        });
        const token = await tokenRes.json();
        if (token.access_token) {
          const r = await fetch('https://api.twitter.com/2/users/by/username/WalfirHere?user.fields=public_metrics', {
            headers: { 'Authorization': `Bearer ${token.access_token}` }
          });
          const d = await r.json();
          const m = d.data?.public_metrics;
          if (m) return { followers: m.followers_count||0, tweets: m.tweet_count||0 };
        }
      }
      if (platform === 'twitch' && apiKey) {
        // apiKey = "client_id:client_secret" or just client_id for token fetch
        const [clientId, clientSecret] = apiKey.split(':');
        const tokenRes = await fetch(`https://id.twitch.tv/oauth2/token?client_id=${clientId}&client_secret=${clientSecret}&grant_type=client_credentials`, { method: 'POST' });
        const token = await tokenRes.json();
        if (token.access_token) {
          const uRes = await fetch(`https://api.twitch.tv/helix/users?login=walfirrr`, { headers: { 'Client-Id': clientId, 'Authorization': `Bearer ${token.access_token}` } });
          const ud = await uRes.json();
          const uid = ud.data?.[0]?.id;
          if (uid) {
            const fRes = await fetch(`https://api.twitch.tv/helix/channels/followers?broadcaster_id=${uid}`, { headers: { 'Client-Id': clientId, 'Authorization': `Bearer ${token.access_token}` } });
            const fd = await fRes.json();
            return { followers: fd.total||0 };
          }
        }
      }
    } catch (e) { logger.debug({ platform, error: e.message }, 'platform stats fetch failed'); }
    return null;
  }

  app.get('/api/hub/external', adminAuth, async (req, res) => {
    const platforms = ['vk','youtube','soundcloud','x','twitch','tiktok','instagram'];
    const forceRefresh = req.query.refresh === '1';
    const keys = {};
    all('SELECT platform,api_key FROM hub_api_keys').forEach(r => { keys[r.platform] = r.api_key; });
    const result = {};
    await Promise.all(platforms.map(async platform => {
      const cached = hubStatsCache[platform];
      if (!forceRefresh && cached && Date.now() - cached.ts < HUB_CACHE_TTL) {
        result[platform] = { data: cached.data, cached: true, updated_at: new Date(cached.ts).toISOString() };
        return;
      }
      const data = await fetchPlatformStats(platform, keys[platform] || '');
      hubStatsCache[platform] = { data, ts: Date.now() };
      result[platform] = { data, cached: false, updated_at: new Date(hubStatsCache[platform].ts).toISOString() };
    }));
    res.json(result);
  });

  app.get('/api/hub/keys', adminAuth, (req, res) => {
    const rows = all('SELECT platform,api_key FROM hub_api_keys');
    const out = {};
    rows.forEach(r => { out[r.platform] = r.api_key ? '••••' + r.api_key.slice(-4) : ''; });
    res.json(out);
  });

  app.post('/api/hub/keys', adminAuth, (req, res) => {
    const { platform, api_key } = req.body;
    if (!platform) return res.status(400).json({ error: 'platform required' });
    run("INSERT INTO hub_api_keys (platform,api_key,updated_at) VALUES(?,?,datetime('now')) ON CONFLICT(platform) DO UPDATE SET api_key=excluded.api_key,updated_at=excluded.updated_at", [platform, api_key || '']);
    delete hubStatsCache[platform]; // invalidate cache
    res.json({ ok: 1 });
  });

  app.get('/api/hub/stats', adminAuth, (req, res) => {
    const posts      = get("SELECT COUNT(*) AS c FROM posts WHERE user_id=? AND archived=0 AND repost_of=''",[req.uid]).c;
    const followers  = get('SELECT COUNT(*) AS c FROM follows WHERE following_id=?',[req.uid]).c;
    const following  = get('SELECT COUNT(*) AS c FROM follows WHERE follower_id=?',[req.uid]).c;
    const likes      = get('SELECT COUNT(*) AS c FROM likes l JOIN posts p ON l.post_id=p.id WHERE p.user_id=?',[req.uid]).c;
    const drops      = get('SELECT COUNT(*) AS c FROM drops WHERE user_id=?',[req.uid]).c;
    const plays      = get('SELECT COALESCE(SUM(play_count),0) AS c FROM posts WHERE user_id=?',[req.uid]).c;
    const comments   = get('SELECT COUNT(*) AS c FROM comments c2 JOIN posts p ON c2.post_id=p.id WHERE p.user_id=?',[req.uid]).c;
    res.json({ posts, followers, following, likes, drops, plays, comments });
  });

  // ── ADMIN ──
  app.get('/api/admin/stats', adminAuth, (req, res) => {
    const users   = get('SELECT COUNT(*) AS c FROM users').c;
    const banned  = get('SELECT COUNT(*) AS c FROM users WHERE banned_at IS NOT NULL').c;
    const admins  = get('SELECT COUNT(*) AS c FROM users WHERE is_admin=1').c;
    const msgs    = get('SELECT COUNT(*) AS c FROM messages WHERE deleted_at IS NULL').c;
    const drops   = get("SELECT COUNT(*) AS c FROM drops WHERE datetime(created_at)>datetime('now','-24 hours')").c;
    const posts   = get('SELECT COUNT(*) AS c FROM posts WHERE archived=0').c;
    const comments= get('SELECT COUNT(*) AS c FROM comments').c;
    const files   = get('SELECT COUNT(*) AS c FROM disk_files').c;
    const publicFiles = get("SELECT COUNT(*) AS c FROM disk_files WHERE public_token IS NOT NULL AND public_token!=''").c;
    const sessions= get('SELECT COUNT(*) AS c FROM sessions').c;
    const today   = get("SELECT COUNT(*) AS c FROM users WHERE date(created_at)=date('now')").c;
    const msgToday= get("SELECT COUNT(*) AS c FROM messages WHERE date(created_at)=date('now') AND deleted_at IS NULL").c;
    const reports = get('SELECT COUNT(*) AS c FROM reports WHERE status=\'open\'').c;
    res.json({ users, banned, admins, msgs, drops, posts, comments, files, publicFiles, sessions, today, msgToday, reports });
  });

  app.get('/api/admin/users', adminAuth, (req, res) => {
    const maskEmail = e => {
      const d = decryptEmail(e);
      if (!d || !d.includes('@')) return '—';
      const [u, domain] = d.split('@');
      return (u[0] || '') + '***@' + domain;
    };
    const list = all('SELECT id,username,display_name,email,avatar,is_admin,is_verified,badge_type,banned_at,ban_reason,created_at FROM users ORDER BY created_at DESC')
      .map(u => ({ ...u, email: maskEmail(u.email) }));
    res.json(list);
  });

  app.post('/api/admin/users', adminAuth, (req, res) => {
    const username = String(req.body.username || '').trim().toLowerCase();
    const displayName = String(req.body.display_name || username).trim();
    const password = String(req.body.password || '').trim();
    const isAdmin = req.body.is_admin ? 1 : 0;
    if (!/^[a-z0-9_]{2,24}$/.test(username)) return res.status(400).json({ error:'Username 2-24: a-z, 0-9, _' });
    if (password.length < 8) return res.status(400).json({ error:'Пароль минимум 8 символов' });
    if (get('SELECT id FROM users WHERE LOWER(username)=LOWER(?)', [username])) return res.status(409).json({ error:'Username занят' });
    const email = `${username}@w0pium.local`;
    const id = uuidv4();
    run(`INSERT INTO users (id,username,display_name,password,bio,email,email_hash,email_verified,invite_code,is_admin)
      VALUES(?,?,?,?,?,?,?,?,?,?)`, [
      id, username, displayName, bcrypt.hashSync(password, 10), '',
      encryptEmail(email), hashEmail(email), 1, genCode(), isAdmin,
    ]);
    res.json({ ok:1, id, username, password });
  });

  app.post('/api/admin/users/:uid/password', adminAuth, (req, res) => {
    const uid = req.params.uid;
    const u = get('SELECT id,username FROM users WHERE id=?', [uid]);
    if (!u) return res.status(404).json({ error:'Не найден' });
    const password = String(req.body.password || `${u.username}-W0PIUM-${new Date().getFullYear()}`).trim();
    if (password.length < 8) return res.status(400).json({ error:'Пароль минимум 8 символов' });
    run('UPDATE users SET password=?,reset_token=NULL,reset_token_exp=NULL,email_verified=1,banned_at=NULL,ban_reason=\'\' WHERE id=?', [bcrypt.hashSync(password, 10), uid]);
    run('DELETE FROM sessions WHERE user_id=?', [uid]);
    res.json({ ok:1, username:u.username, password });
  });

  app.delete('/api/admin/users/:uid/sessions', adminAuth, (req, res) => {
    if (req.params.uid === req.uid) return res.status(400).json({ error:'Нельзя отозвать текущие сессии себя здесь' });
    const info = run('DELETE FROM sessions WHERE user_id=?', [req.params.uid]);
    res.json({ ok:1, revoked: info.changes || 0 });
  });

  app.post('/api/admin/users/:uid/ban', adminAuth, (req, res) => {
    const uid = req.params.uid;
    if (uid === req.uid) return res.status(400).json({ error:'Нельзя забанить себя' });
    const u = get('SELECT banned_at,is_admin FROM users WHERE id=?', [uid]);
    if (!u) return res.status(404).json({ error:'Не найден' });
    if (u.is_admin) return res.status(400).json({ error:'Нельзя забанить администратора' });
    if (u.banned_at) {
      run('UPDATE users SET banned_at=NULL,ban_reason=\'\' WHERE id=?', [uid]);
    } else {
      const reason = (req.body.reason || '').trim();
      run('UPDATE users SET banned_at=datetime(\'now\'),ban_reason=? WHERE id=?', [reason, uid]);
      // kick active sessions
      run('DELETE FROM sessions WHERE user_id=?', [uid]);
    }
    res.json({ ok:1, banned: !u.banned_at });
  });

  app.delete('/api/admin/users/:uid', adminAuth, (req, res) => {
    const uid = req.params.uid;
    if (uid === req.uid) return res.status(400).json({ error:'Нельзя удалить себя' });
    const u = get('SELECT is_admin FROM users WHERE id=?', [uid]);
    if (!u) return res.status(404).json({ error:'Не найден' });
    if (u.is_admin) return res.status(400).json({ error:'Нельзя удалить администратора' });
    run('DELETE FROM sessions WHERE user_id=?', [uid]);
    cleanUserFiles(uid);
    run('DELETE FROM users WHERE id=?', [uid]);
    res.json({ ok:1 });
  });

  app.post('/api/admin/users/:uid/promote', adminAuth, (req, res) => {
    const uid = req.params.uid;
    if (uid === req.uid) return res.status(400).json({ error:'Уже администратор' });
    const u = get('SELECT is_admin FROM users WHERE id=?', [uid]);
    if (!u) return res.status(404).json({ error:'Не найден' });
    run('UPDATE users SET is_admin=?,banned_at=NULL WHERE id=?', [u.is_admin ? 0 : 1, uid]);
    res.json({ ok:1, is_admin: !u.is_admin });
  });

  app.get('/api/admin/drops', adminAuth, (req, res) => {
    const list = all(`SELECT d.id,d.content,d.image,d.track_url,d.created_at,d.expires_at,u.username,u.display_name,u.avatar,
      (SELECT COUNT(*) FROM drop_views dv WHERE dv.drop_id=d.id) AS views
      FROM drops d JOIN users u ON u.id=d.user_id ORDER BY d.created_at DESC`);
    res.json(list);
  });

  app.delete('/api/admin/drops/:id', adminAuth, (req, res) => {
    const d = get('SELECT image FROM drops WHERE id=?', [req.params.id]);
    if (d?.image) try { fs.unlinkSync(p.join(DATA, d.image.replace(/^\//, ''))); } catch (e) { logger.debug({ image: d.image, error: e.message }, 'failed to delete admin drop image'); }
    run('DELETE FROM drops WHERE id=?', [req.params.id]);
    res.json({ ok:1 });
  });

  app.post('/api/admin/users/:uid/verify', adminAuth, (req, res) => {
    const u = get('SELECT is_verified FROM users WHERE id=?', [req.params.uid]);
    if (!u) return res.status(404).json({ error:'Не найден' });
    const badge_type = (req.body.badge_type || '').trim().toUpperCase().slice(0, 20);
    const newVerified = u.is_verified ? 0 : 1;
    run('UPDATE users SET is_verified=?,badge_type=? WHERE id=?', [newVerified, newVerified ? badge_type : '', req.params.uid]);
    res.json({ ok:1, is_verified: !!newVerified, badge_type: newVerified ? badge_type : '' });
  });

  // VERIFICATION REQUESTS
  app.post('/api/verify-request', auth, limiterMsg, (req, res) => {
    const { badge_type, reason } = req.body || {};
    const bt = (badge_type || '').trim().toUpperCase().slice(0, 20);
    const rs = (reason || '').trim().slice(0, 500);
    if (!bt || !rs) return res.status(400).json({ error:'Заполни все поля' });
    const existing = get('SELECT id,status FROM verification_requests WHERE user_id=? AND status=?', [req.uid, 'pending']);
    if (existing) return res.status(400).json({ error:'Заявка уже на рассмотрении' });
    const id = uuidv4();
    run('INSERT INTO verification_requests (id,user_id,badge_type,reason) VALUES(?,?,?,?)', [id, req.uid, bt, rs]);
    res.json({ ok:1 });
  });

  app.get('/api/admin/verify-requests', adminAuth, (req, res) => {
    const list = all(`SELECT vr.*,u.username,u.display_name,u.avatar,u.is_verified,u.badge_type
      FROM verification_requests vr JOIN users u ON u.id=vr.user_id
      WHERE vr.status='pending' ORDER BY vr.created_at ASC`);
    res.json(list);
  });

  app.post('/api/admin/verify-requests/:id/approve', adminAuth, (req, res) => {
    const vr = get('SELECT * FROM verification_requests WHERE id=?', [req.params.id]);
    if (!vr) return res.status(404).json({ error:'Не найдено' });
    run('UPDATE verification_requests SET status=? WHERE id=?', ['approved', vr.id]);
    run('UPDATE users SET is_verified=1,badge_type=? WHERE id=?', [vr.badge_type, vr.user_id]);
    pushEvent(vr.user_id, 'verify_approved', { badge_type: vr.badge_type });
    res.json({ ok:1 });
  });

  app.post('/api/admin/verify-requests/:id/reject', adminAuth, (req, res) => {
    const vr = get('SELECT * FROM verification_requests WHERE id=?', [req.params.id]);
    if (!vr) return res.status(404).json({ error:'Не найдено' });
    const reason = (req.body.reason || '').trim().slice(0, 200);
    run('UPDATE verification_requests SET status=?,reject_reason=? WHERE id=?', ['rejected', reason, vr.id]);
    pushEvent(vr.user_id, 'verify_rejected', { reason });
    res.json({ ok:1 });
  });

  app.get('/api/admin/reports', adminAuth, (req, res) => {
    const list = all(`SELECT r.*,u.username AS reporter_username,u.display_name AS reporter_name
      FROM reports r JOIN users u ON u.id=r.reporter_id
      WHERE r.status='open' ORDER BY r.created_at DESC LIMIT 100`);
    res.json(list);
  });
  app.post('/api/admin/reports/:id/resolve', adminAuth, (req, res) => {
    run('UPDATE reports SET status=? WHERE id=?',['resolved',req.params.id]);
    res.json({ ok:1 });
  });

  app.get('/api/admin/invites', adminAuth, (req, res) => {
    const list = all(`SELECT u.username AS owner, u.invite_code AS code,
      (SELECT COUNT(*) FROM users u2 WHERE u2.used_code=u.invite_code) AS used_count
      FROM users u ORDER BY used_count DESC, u.created_at ASC`);
    res.json(list);
  });

  app.get('/api/admin/diagnostics', adminAuth, (req, res) => {
    const dbStats = {
      users: get('SELECT COUNT(*) AS c FROM users').c,
      posts: get('SELECT COUNT(*) AS c FROM posts').c,
      messages: get('SELECT COUNT(*) AS c FROM messages WHERE deleted_at IS NULL').c,
      conversations: get('SELECT COUNT(*) AS c FROM conversations').c,
      files: get('SELECT COUNT(*) AS c FROM disk_files').c,
      sessions: get('SELECT COUNT(*) AS c FROM sessions').c,
      reports_open: get("SELECT COUNT(*) AS c FROM reports WHERE status='open'").c,
    };
    const jobStats = {
      pending: get(`SELECT COUNT(*) AS c FROM background_jobs WHERE status='pending'`).c,
      running: get(`SELECT COUNT(*) AS c FROM background_jobs WHERE status='running'`).c,
      failed: get(`SELECT COUNT(*) AS c FROM background_jobs WHERE status='failed'`).c,
      done_24h: get(`SELECT COUNT(*) AS c FROM background_jobs WHERE status='done' AND datetime(updated_at) > datetime('now', '-1 day')`).c,
    };
    const mem = process.memoryUsage();
    res.json({
      uptime_sec: Math.floor(process.uptime()),
      node: process.version,
      env: process.env.NODE_ENV || 'development',
      build: 'bg-jobs-skeleton',
      req_id: req.id || null,
      memory: {
        rss: mem.rss,
        heap_total: mem.heapTotal,
        heap_used: mem.heapUsed,
        external: mem.external,
      },
      db: dbStats,
      background_jobs: jobStats,
      recent_errors: RECENT_ERRORS.slice(-12).reverse(),
    });
  });

  app.get('/api/admin/jobs', adminAuth, (req, res) => {
    const limit = Math.min(80, Math.max(10, parseInt(req.query.limit, 10) || 40));
    const rows = all(`SELECT id,type,status,attempts,max_attempts,created_at,updated_at,run_after,substr(error,1,200) AS error_short,substr(result,1,120) AS result_short FROM background_jobs ORDER BY created_at DESC LIMIT ?`, [limit]);
    res.json({ jobs: rows });
  });

  app.post('/api/admin/jobs/test', adminAuth, limiterAdminJobTest, (req, res) => {
    const t = (req.body && req.body.type) || 'noop';
    if (t !== 'noop') return res.status(400).json({ error: 'only noop supported' });
    const id = enqueueBackgroundJob('noop', { at: new Date().toISOString() });
    res.json({ ok: 1, job_id: id });
  });

  // ── DISK ──
  const DISK_ALLOWED_EXT = new Set(['.mp3','.wav','.flac','.aac','.ogg','.m4a','.opus',
    '.mp4','.mov','.webm','.mkv','.avi',
    '.jpg','.jpeg','.png','.gif','.webp','.svg',
    '.pdf','.txt','.md','.zip','.rar','.7z','.tar','.gz',
    '.csv','.tsv','.json','.xml','.yaml','.yml',
    '.xlsx','.xls','.numbers',
    '.docx','.doc','.pages',
    '.pptx','.ppt','.key',
    '.odt','.ods','.odp','.rtf',
    '.sql','.log','.ini','.cfg','.conf',
    '.bsl','.erf','.epf','.dt']);
  const diskUp = multer({
    dest: DISK_DIR,
    limits: { fileSize: 4*1024*1024*1024 },
    fileFilter: (_req, file, cb) => {
      const ext = p.extname(file.originalname).toLowerCase();
      if (!DISK_ALLOWED_EXT.has(ext)) return cb(new Error('Недопустимый тип файла'));
      // Block dangerous MIME types even if extension is whitelisted
      const BLOCK_MIME = /^(application\/x-(executable|msdownload|sh|bat|php|perl)|text\/x-(sh|python|php|perl)|application\/(javascript|x-javascript|x-php|x-perl|x-sh))$/i;
      if (BLOCK_MIME.test(file.mimetype)) return cb(new Error('Недопустимый тип файла'));
      cb(null, true);
    }
  });
  const limiterDisk = _rl({ windowMs: 60_000, limit: 10, keyGenerator: req => req.uid || req.ip });

  // ── DISK FILES ──
  app.get('/api/disk', auth, (req, res) => {
    const folderId = req.query.folder_id || null;
    const files = all(`SELECT df.id,df.name,df.path,df.size,df.mime,df.description,df.folder_id,df.public_token,df.preview_path,df.created_at,
      u.username,u.display_name,u.avatar
      FROM disk_files df JOIN users u ON u.id=df.user_id
      WHERE df.user_id=? AND ${folderId ? 'df.folder_id=?' : 'df.folder_id IS NULL'}
      ORDER BY df.created_at DESC`, folderId ? [req.uid, folderId] : [req.uid]);
    res.json(files);
  });

  app.post('/api/disk', auth, limiterDisk, diskUp.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Нет файла' });
    const id = uuidv4();
    const origName = req.file.originalname || 'file';
    const ext = p.extname(origName);
    const storedName = id + ext;
    fs.renameSync(req.file.path, p.join(DISK_DIR, storedName));
    const desc = (req.body.description || '').trim().slice(0, 200);
    const folderId = req.body.folder_id || null;
    run('INSERT INTO disk_files (id,user_id,name,size,mime,path,description,folder_id) VALUES(?,?,?,?,?,?,?,?)',
      [id, req.uid, origName, req.file.size, req.file.mimetype || '', '/disk/' + storedName, desc, folderId]);
    const mime = (req.file.mimetype || '').toLowerCase();
    if (mime.startsWith('image/')) {
      try { enqueueBackgroundJob('disk_image_preview', { disk_file_id: id }); } catch (e) { logger.error(e, 'enqueue disk_image_preview'); }
    }
    res.json({ ok: 1, id });
  });

  app.delete('/api/disk/:id', auth, (req, res) => {
    const f = get('SELECT user_id,path,preview_path FROM disk_files WHERE id=?', [req.params.id]);
    if (!f) return res.status(404).json({ error: 'Not found' });
    const u = get('SELECT is_admin FROM users WHERE id=?', [req.uid]);
    if (f.user_id !== req.uid && !u?.is_admin) return res.status(403).json({ error: 'forbidden' });
    try { fs.unlinkSync(p.join(DATA, f.path.replace(/^\/disk\//, 'disk/'))); } catch (e) { logger.debug({ path: f.path, error: e.message }, 'failed to delete disk file'); }
    if (f.preview_path) try { fs.unlinkSync(p.join(DATA, f.preview_path.replace(/^\//, ''))); } catch (e) { logger.debug({ preview: f.preview_path, error: e.message }, 'failed to delete disk preview'); }
    run('DELETE FROM disk_files WHERE id=?', [req.params.id]);
    res.json({ ok: 1 });
  });

  app.get('/api/disk/stats', auth, (req, res) => {
    const r = get('SELECT COALESCE(SUM(size),0) AS used, COUNT(*) AS count FROM disk_files WHERE user_id=?', [req.uid]);
    res.json(r);
  });

  app.patch('/api/disk/:id', auth, (req, res) => {
    const f = get('SELECT user_id FROM disk_files WHERE id=?', [req.params.id]);
    if (!f) return res.status(404).json({ error: 'Not found' });
    if (f.user_id !== req.uid) return res.status(403).json({ error: 'forbidden' });
    const name = (req.body.name || '').trim().slice(0, 255);
    const description = (Object.prototype.hasOwnProperty.call(req.body, 'description') ? req.body.description : '').trim().slice(0, 200);
    if (name) run('UPDATE disk_files SET name=?,description=? WHERE id=?', [name, description, req.params.id]);
    else run('UPDATE disk_files SET description=? WHERE id=?', [description, req.params.id]);
    if (Object.prototype.hasOwnProperty.call(req.body, 'folder_id')) {
      const newFid = req.body.folder_id || null;
      if (newFid) {
        const folder = get('SELECT user_id FROM disk_folders WHERE id=?', [newFid]);
        if (!folder || folder.user_id !== req.uid) return res.status(403).json({ error: 'forbidden' });
      }
      run('UPDATE disk_files SET folder_id=? WHERE id=?', [newFid, req.params.id]);
    }
    res.json({ ok: 1 });
  });

  // ── DISK FOLDERS ──
  app.get('/api/disk/folders', auth, (req, res) => {
    const parentId = req.query.parent_id || null;
    const folders = all(
      `SELECT id, name, parent_id, created_at,
       (SELECT COUNT(*) FROM disk_files WHERE folder_id=df.id) +
       (SELECT COUNT(*) FROM disk_folders WHERE parent_id=df.id) AS item_count
       FROM disk_folders df
       WHERE user_id=? AND ${parentId ? 'parent_id=?' : 'parent_id IS NULL'}
       ORDER BY name ASC`,
      parentId ? [req.uid, parentId] : [req.uid]
    );
    res.json(folders);
  });

  app.get('/api/disk/folders/all', auth, (req, res) => {
    const folders = all('SELECT id, name, parent_id FROM disk_folders WHERE user_id=? ORDER BY name ASC', [req.uid]);
    res.json(folders);
  });

  app.post('/api/disk/folders', auth, (req, res) => {
    const name = (req.body.name || '').trim().slice(0, 100);
    if (!name) return res.status(400).json({ error: 'Нет имени' });
    const parentId = req.body.parent_id || null;
    if (parentId) {
      const par = get('SELECT user_id FROM disk_folders WHERE id=?', [parentId]);
      if (!par || par.user_id !== req.uid) return res.status(403).json({ error: 'forbidden' });
    }
    const id = uuidv4();
    run('INSERT INTO disk_folders (id,user_id,parent_id,name) VALUES(?,?,?,?)', [id, req.uid, parentId, name]);
    res.json({ ok: 1, id, name, parent_id: parentId, item_count: 0, created_at: new Date().toISOString() });
  });

  app.patch('/api/disk/folders/:id', auth, (req, res) => {
    const f = get('SELECT user_id FROM disk_folders WHERE id=?', [req.params.id]);
    if (!f) return res.status(404).json({ error: 'Not found' });
    if (f.user_id !== req.uid) return res.status(403).json({ error: 'forbidden' });
    const name = (req.body.name || '').trim().slice(0, 100);
    if (!name) return res.status(400).json({ error: 'Нет имени' });
    run('UPDATE disk_folders SET name=? WHERE id=?', [name, req.params.id]);
    res.json({ ok: 1 });
  });

  app.delete('/api/disk/folders/:id', auth, (req, res) => {
    const f = get('SELECT user_id FROM disk_folders WHERE id=?', [req.params.id]);
    if (!f) return res.status(404).json({ error: 'Not found' });
    if (f.user_id !== req.uid) return res.status(403).json({ error: 'forbidden' });
    // Collect all nested folder IDs recursively
    const toDelete = [req.params.id];
    const queue = [req.params.id];
    while (queue.length) {
      const cur = queue.shift();
      const subs = all('SELECT id FROM disk_folders WHERE parent_id=?', [cur]);
      subs.forEach(s => { toDelete.push(s.id); queue.push(s.id); });
    }
    toDelete.forEach(fid => {
      const files = all('SELECT path, preview_path FROM disk_files WHERE folder_id=?', [fid]);
      files.forEach(file => {
        try { fs.unlinkSync(p.join(DATA, file.path.replace(/^\/disk\//, 'disk/'))); } catch (e) { logger.debug({ path: file.path, error: e.message }, 'failed to delete folder disk file'); }
        if (file.preview_path) try { fs.unlinkSync(p.join(DATA, file.preview_path.replace(/^\//, ''))); } catch (e) { logger.debug({ preview: file.preview_path, error: e.message }, 'failed to delete folder disk preview'); }
      });
      run('DELETE FROM disk_files WHERE folder_id=?', [fid]);
      run('DELETE FROM disk_folders WHERE id=?', [fid]);
    });
    res.json({ ok: 1 });
  });

  app.get('/api/disk/breadcrumb/:id', auth, (req, res) => {
    const path = [];
    let cur = get('SELECT id,name,parent_id FROM disk_folders WHERE id=? AND user_id=?', [req.params.id, req.uid]);
    while (cur) {
      path.unshift({ id: cur.id, name: cur.name });
      cur = cur.parent_id ? get('SELECT id,name,parent_id FROM disk_folders WHERE id=? AND user_id=?', [cur.parent_id, req.uid]) : null;
    }
    res.json(path);
  });

  // ── DISK ZIP ──
  app.post('/api/disk/zip', auth, (req, res) => {
    const ids = Array.isArray(req.body.ids) ? req.body.ids.slice(0, 50) : [];
    if (!ids.length) return res.status(400).json({ error: 'Нет файлов' });
    const files = ids.map(id => get('SELECT user_id,path,name FROM disk_files WHERE id=?', [id]))
      .filter(f => f && f.user_id === req.uid);
    if (!files.length) return res.status(404).json({ error: 'Файлы не найдены' });
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="w0pium-files.zip"');
    const arc = archiver('zip', { zlib: { level: 0 } });
    arc.on('error', _err => { if (!res.headersSent) res.status(500).end(); else res.end(); });
    arc.pipe(res);
    files.forEach(f => {
      const filePath = p.join(DATA, f.path.replace(/^\/disk\//, 'disk/'));
      try { if (fs.existsSync(filePath)) arc.file(filePath, { name: f.name }); } catch (e) { logger.debug({ path: filePath, error: e.message }, 'ZIP add file failed'); }
    });
    arc.finalize();
  });

  // ── PUBLIC LINKS ──
  app.post('/api/disk/:id/publish', auth, (req, res) => {
    const f = get('SELECT user_id, public_token FROM disk_files WHERE id=?', [req.params.id]);
    if (!f) return res.status(404).json({ error: 'Not found' });
    if (f.user_id !== req.uid) return res.status(403).json({ error: 'forbidden' });
    const token = f.public_token || crypto.randomBytes(20).toString('hex');
    if (!f.public_token) run('UPDATE disk_files SET public_token=? WHERE id=?', [token, req.params.id]);
    res.json({ ok: 1, token });
  });

  app.delete('/api/disk/:id/publish', auth, (req, res) => {
    const f = get('SELECT user_id FROM disk_files WHERE id=?', [req.params.id]);
    if (!f) return res.status(404).json({ error: 'Not found' });
    if (f.user_id !== req.uid) return res.status(403).json({ error: 'forbidden' });
    run('UPDATE disk_files SET public_token=NULL WHERE id=?', [req.params.id]);
    res.json({ ok: 1 });
  });

  // Public file access (no auth required)
  app.get('/pub/:token', (req, res) => {
    const f = get('SELECT path, name, mime FROM disk_files WHERE public_token=?', [req.params.token]);
    if (!f) return res.status(404).send('Not found');
    const filePath = p.resolve(p.join(DATA, f.path.replace(/^\/disk\//, 'disk/')));
    if (!filePath.startsWith(p.resolve(DATA) + p.sep)) return res.status(403).send('Forbidden');
    const isSvg = (f.mime || '').toLowerCase().includes('svg') || (f.name || '').toLowerCase().endsWith('.svg');
    const disposition = isSvg ? 'attachment' : 'inline';
    res.setHeader('Content-Disposition', `${disposition}; filename="${encodeURIComponent(f.name)}"`);
    if (f.mime && !isSvg) res.setHeader('Content-Type', f.mime);
    res.sendFile(filePath, err => { if (err && !res.headersSent) res.status(404).send('Not found'); });
  });

  app.get('/post/:id', (req, res) => {
    const po = get(`SELECT p.id,p.content,p.image,p.created_at,u.username,u.display_name
      FROM posts p JOIN users u ON u.id=p.user_id
      WHERE p.id=? AND p.archived=0 AND u.is_private=0 AND u.banned_at IS NULL`, [req.params.id]);
    if (!po) return res.status(404).send('Not found');
    const origin = process.env.PUBLIC_ORIGIN || `${req.protocol}://${req.get('host')}`;
    res.send(publicShareHtml({
      title: `${po.display_name} on W0PIUM`,
      description: po.content || 'W0PIUM post',
      image: po.image || '',
      url: `${origin}/profile/${encodeURIComponent(po.username)}`,
      type: 'article',
    }));
  });

  app.get('/u/:username', (req, res) => {
    const u = get(`SELECT username,display_name,bio,avatar FROM users WHERE username=? AND is_private=0 AND banned_at IS NULL`, [req.params.username]);
    if (!u) return res.status(404).send('Not found');
    const origin = process.env.PUBLIC_ORIGIN || `${req.protocol}://${req.get('host')}`;
    res.send(publicShareHtml({
      title: `${u.display_name} (@${u.username}) on W0PIUM`,
      description: u.bio || 'W0PIUM profile',
      image: u.avatar || '',
      url: `${origin}/profile/${encodeURIComponent(u.username)}`,
      type: 'profile',
    }));
  });

  app.get('/drop/:id', (req, res) => {
    const d = get(`SELECT d.id,d.content,d.image,d.created_at,u.username,u.display_name
      FROM drops d JOIN users u ON u.id=d.user_id
      WHERE d.id=? AND u.is_private=0 AND u.banned_at IS NULL`, [req.params.id]);
    if (!d) return res.status(404).send('Not found');
    const origin = process.env.PUBLIC_ORIGIN || `${req.protocol}://${req.get('host')}`;
    res.send(publicShareHtml({
      title: `${d.display_name}'s Drop on W0PIUM`,
      description: d.content || '24h W0PIUM drop',
      image: d.image || '',
      url: `${origin}/profile/${encodeURIComponent(d.username)}`,
      type: 'article',
    }));
  });

  app.get('/disk/*', auth, (req, res) => {
    const relPath = req.params[0];
    if (!relPath) return res.status(400).send('Bad Request');
    const absPath = p.resolve(p.join(DISK_DIR, relPath));
    if (!_pathUnderDir(absPath, DISK_DIR)) return res.status(403).send('Forbidden');
    const filePath = '/disk/' + relPath;
    const f = relPath.startsWith('previews/')
      ? get('SELECT user_id FROM disk_files WHERE preview_path=?', [filePath])
      : get('SELECT user_id FROM disk_files WHERE path=?', [filePath]);
    if (!f) return res.status(404).send('Not found');
    if (f.user_id !== req.uid) {
      const admin = get('SELECT is_admin FROM users WHERE id=?', [req.uid]);
      if (!admin || !admin.is_admin) return res.status(403).send('Forbidden');
    }
    if (!fs.existsSync(absPath)) return res.status(404).send('Not found');
    res.sendFile(absPath);
  });

  app.get('/api/health', (req, res) => {
    let db = 'unknown';
    let social_schema = false;
    try {
      db = get('PRAGMA integrity_check').integrity_check;
      social_schema = !!get("SELECT 1 FROM pragma_table_info('comments') WHERE name='parent_id'")
        && !!get("SELECT 1 FROM sqlite_master WHERE type='table' AND name='comment_likes'");
    } catch (e) {
      db = e.message;
    }
    res.json({
      ok: true,
      uptime: process.uptime(),
      build: process.env.BUILD_ID || 'dev',
      app_version: APP_VERSION,
      db,
      social_schema,
    });
  });

  app.get('*', (req,res) => res.sendFile(p.join(__dirname,'public','index.html')));
  // Global error handler — never expose stack traces to clients
  app.use((err, req, res, _next) => {
    RECENT_ERRORS.push({
      at: new Date().toISOString(),
      req_id: req.id || null,
      path: req.path,
      method: req.method,
      message: err?.message || 'Unknown error',
      status: err?.status || 500,
    });
    if (RECENT_ERRORS.length > MAX_RECENT_ERRORS) RECENT_ERRORS.splice(0, RECENT_ERRORS.length - MAX_RECENT_ERRORS);
    logger.error({ err, reqId: req.id, path: req.path, method: req.method }, 'Unhandled error');
    res.status(err.status || 500).json({
      error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
      req_id: req.id || null
    });
  });
  process.on('SIGINT',  ()=>{ save(); process.exit(0); });
  process.on('SIGTERM', ()=>{ save(); process.exit(0); });
  app.listen(PORT, '0.0.0.0', () => logger.info({ port: PORT }, 'W0pium started'));

  setInterval(() => { backgroundWorkerTick().catch(e => logger.error(e, 'backgroundWorkerTick')); }, 2_500);

  setInterval(() => {
    try {
      const due = all(`SELECT p.id, p.user_id FROM posts p WHERE p.scheduled_at IS NOT NULL AND datetime(p.scheduled_at) <= datetime('now') AND p.archived=0 LIMIT 500`);
      if (!due.length) return;
      run(`UPDATE posts SET scheduled_at=NULL WHERE id IN (${due.map(() => '?').join(',')})`, due.map(p => p.id));
      const userIds = [...new Set(due.map(p => p.user_id))];
      userIds.forEach(uid => pushEvent(uid, 'post_published', { count: due.filter(p => p.user_id === uid).length }));
      if (due.length >= 500) logger.warn({ count: due.length }, 'scheduled post batch hit 500 limit — may have overflow');
    } catch (e) {
      logger.error(e, 'scheduled post publisher error');
    }
  }, 30_000);
}
main();
