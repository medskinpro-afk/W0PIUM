const crypto = require('crypto');
const path = require('path');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');

const ROOT = path.resolve(__dirname, '..');
const DATA = process.env.DATA_DIR || path.join(ROOT, 'data');
const DB_PATH = process.env.DB_PATH || path.join(DATA, 'w0pium.db');

const accounts = [
  {
    username: 'wf',
    display_name: process.env.WF_DISPLAY_NAME || 'WF',
    password: process.env.WF_PASSWORD || 'WF-W0PIUM-2026',
    is_admin: 1,
    bio: 'Owner admin account.',
  },
  {
    username: 'vf',
    display_name: process.env.VF_DISPLAY_NAME || 'VF',
    password: process.env.VF_PASSWORD || 'VF-W0PIUM-2026',
    is_admin: 0,
    bio: 'Social testing account.',
  },
];

function cols(db, table) {
  return new Set(db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name));
}

function onlyKnown(known, row) {
  return Object.fromEntries(Object.entries(row).filter(([key]) => known.has(key)));
}

function hashEmail(username) {
  return crypto.createHash('sha256').update(`${username}@w0pium.local`).digest('hex');
}

const db = new Database(DB_PATH);
db.pragma('foreign_keys = ON');
const userCols = cols(db, 'users');

db.transaction(() => {
  for (const account of accounts) {
    const existing = db.prepare('SELECT id FROM users WHERE LOWER(username)=LOWER(?)').get(account.username);
    const passwordHash = bcrypt.hashSync(account.password, 10);

    if (existing) {
      db.prepare(`
        UPDATE users
        SET password=?,
            display_name=?,
            email_verified=1,
            is_admin=?,
            banned_at=NULL,
            ban_reason='',
            reset_token=NULL,
            reset_token_exp=NULL
        WHERE id=?
      `).run(passwordHash, account.display_name, account.is_admin, existing.id);
      db.prepare('DELETE FROM sessions WHERE user_id=?').run(existing.id);
      continue;
    }

    const row = onlyKnown(userCols, {
      id: crypto.randomUUID(),
      username: account.username,
      display_name: account.display_name,
      password: passwordHash,
      bio: account.bio,
      avatar: '',
      email: `${account.username}@w0pium.local`,
      email_hash: hashEmail(account.username),
      email_verified: 1,
      invite_code: `${account.username.toUpperCase()}2026`,
      used_code: 'RESET',
      is_private: 0,
      dm_requests: 1,
      show_read_receipts: 1,
      show_typing: 1,
      is_admin: account.is_admin,
      banned_at: null,
      ban_reason: '',
      last_seen: new Date().toISOString(),
    });
    const keys = Object.keys(row);
    db.prepare(`INSERT INTO users (${keys.join(',')}) VALUES (${keys.map(k => '@' + k).join(',')})`).run(row);
  }
})();

const result = db.prepare(`
  SELECT username,display_name,is_admin,email_verified,banned_at
  FROM users
  WHERE username IN ('wf','vf')
  ORDER BY username
`).all();

console.log(JSON.stringify({
  ok: true,
  db: DB_PATH,
  accounts: result,
  passwords: Object.fromEntries(accounts.map(a => [a.username, a.password])),
}, null, 2));
