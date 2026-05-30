'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');

const ROOT = path.resolve(__dirname, '..');
const DATA = process.env.DATA_DIR || path.join(ROOT, 'data');
const DB_PATH = path.join(DATA, 'w0pium.db');
const IMG_DIR = path.join(DATA, 'images');
const DISK_DIR = path.join(DATA, 'disk');
const PASSWORD = process.env.W0PIUM_SEED_PASSWORD || 'w0pium-demo-2026';

if (!fs.existsSync(DB_PATH)) {
  console.error(`Database not found at ${DB_PATH}. Start the app once so migrations create it, then rerun seed:2.0.`);
  process.exit(1);
}

fs.mkdirSync(IMG_DIR, { recursive: true });
fs.mkdirSync(DISK_DIR, { recursive: true });

const db = new Database(DB_PATH);
db.pragma('foreign_keys = ON');

const demoUsers = [
  ['seed-user-artist', 'demo_artist', 'Demo Artist', 'Posts, drops and disk owner for W0PIUM 2.0 QA.'],
  ['seed-user-producer', 'demo_producer', 'Demo Producer', 'Chat partner with voice, files and requests.'],
  ['seed-user-label', 'demo_label', 'Demo Label', 'Group chat member and heavier feed content.'],
  ['seed-user-private', 'demo_private', 'Private Demo', 'Private profile and request-state coverage.'],
];

function cols(table) {
  return new Set(db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name));
}

const tableCols = new Map();
function insert(table, row) {
  if (!tableCols.has(table)) tableCols.set(table, cols(table));
  const known = tableCols.get(table);
  const filtered = Object.fromEntries(Object.entries(row).filter(([key]) => known.has(key)));
  const keys = Object.keys(filtered);
  const placeholders = keys.map(k => `@${k}`).join(',');
  db.prepare(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${placeholders})`).run(filtered);
}

function writeTextFile(dir, name, content) {
  const filePath = path.join(dir, name);
  fs.writeFileSync(filePath, content);
  return fs.statSync(filePath).size;
}

function svg(name, bg, fg, label) {
  const body = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="760" viewBox="0 0 1200 760">
  <rect width="1200" height="760" fill="${bg}"/>
  <path d="M0 560 C180 500 250 650 420 590 C610 522 710 390 930 430 C1060 452 1120 520 1200 488 L1200 760 L0 760 Z" fill="${fg}" opacity=".24"/>
  <circle cx="940" cy="174" r="116" fill="${fg}" opacity=".16"/>
  <text x="72" y="118" fill="${fg}" font-family="Arial, sans-serif" font-size="34" letter-spacing="8">${name}</text>
  <text x="72" y="408" fill="${fg}" font-family="Arial, sans-serif" font-size="92" font-weight="700">${label}</text>
</svg>`;
  return body;
}

function isoMinutesAgo(n) {
  return new Date(Date.now() - n * 60_000).toISOString();
}

function seed() {
  const hash = bcrypt.hashSync(PASSWORD, 10);
  const userIds = demoUsers.map(u => u[0]);
  const q = userIds.map(() => '?').join(',');

  db.transaction(() => {
    db.prepare("DELETE FROM message_reactions WHERE msg_id LIKE 'seed-msg-%'").run();
    db.prepare("DELETE FROM saved_messages WHERE msg_id LIKE 'seed-msg-%'").run();
    db.prepare("DELETE FROM messages WHERE id LIKE 'seed-msg-%'").run();
    db.prepare("DELETE FROM conversation_members WHERE conv_id LIKE 'seed-chat-%'").run();
    db.prepare("DELETE FROM conversations WHERE id LIKE 'seed-chat-%'").run();
    db.prepare("DELETE FROM comment_likes WHERE comment_id LIKE 'seed-comment-%'").run();
    db.prepare("DELETE FROM comments WHERE id LIKE 'seed-comment-%' OR post_id LIKE 'seed-post-%'").run();
    db.prepare("DELETE FROM likes WHERE post_id LIKE 'seed-post-%'").run();
    db.prepare("DELETE FROM bookmarks WHERE post_id LIKE 'seed-post-%'").run();
    db.prepare("DELETE FROM post_reactions WHERE post_id LIKE 'seed-post-%'").run();
    db.prepare("DELETE FROM posts WHERE id LIKE 'seed-post-%'").run();
    db.prepare("DELETE FROM drop_views WHERE drop_id LIKE 'seed-drop-%'").run();
    db.prepare("DELETE FROM drops WHERE id LIKE 'seed-drop-%'").run();
    db.prepare("DELETE FROM disk_files WHERE id LIKE 'seed-disk-%'").run();
    db.prepare("DELETE FROM disk_folders WHERE id LIKE 'seed-folder-%'").run();
    db.prepare("DELETE FROM notifications WHERE id LIKE 'seed-notif-%'").run();
    db.prepare(`DELETE FROM follows WHERE follower_id IN (${q}) OR following_id IN (${q})`).run(...userIds, ...userIds);
    db.prepare(`DELETE FROM follow_requests WHERE id LIKE 'seed-follow-request-%' OR from_id IN (${q}) OR to_id IN (${q})`).run(...userIds, ...userIds);
    db.prepare(`DELETE FROM users WHERE id IN (${q}) OR username LIKE 'demo_%'`).run(...userIds);

    for (const [id, username, displayName, bio] of demoUsers) {
      insert('users', {
        id,
        username,
        display_name: displayName,
        password: hash,
        bio,
        avatar: '',
        email: `${username}@example.test`,
        email_hash: crypto.createHash('sha256').update(username).digest('hex'),
        email_verified: 1,
        invite_code: username.toUpperCase().slice(0, 10),
        is_private: username === 'demo_private' ? 1 : 0,
        dm_requests: 1,
        show_read_receipts: 1,
        show_typing: 1,
        link_site: `https://example.test/${username}`,
        link_ig: `https://instagram.com/${username}`,
        is_verified: username === 'demo_artist' || username === 'demo_label' ? 1 : 0,
        badge_type: username === 'demo_label' ? 'LABEL' : 'ARTIST',
        last_seen: isoMinutesAgo(username === 'demo_producer' ? 3 : 30),
      });
    }

    insert('follows', { follower_id: 'seed-user-artist', following_id: 'seed-user-producer' });
    insert('follows', { follower_id: 'seed-user-artist', following_id: 'seed-user-label' });
    insert('follows', { follower_id: 'seed-user-producer', following_id: 'seed-user-artist' });
    insert('follows', { follower_id: 'seed-user-label', following_id: 'seed-user-artist' });
    insert('follow_requests', { id: 'seed-follow-request-private', from_id: 'seed-user-artist', to_id: 'seed-user-private', created_at: isoMinutesAgo(1000) });

    const imageA = 'seed-feed-cover.svg';
    const imageB = 'seed-drop-cover.svg';
    fs.writeFileSync(path.join(IMG_DIR, imageA), svg('W0PIUM', '#101010', '#f4f4f4', 'FEED 2.0'));
    fs.writeFileSync(path.join(IMG_DIR, imageB), svg('DROPS', '#141414', '#76d4ff', '24H DROP'));

    const posts = [
      ['seed-post-1', 'seed-user-producer', 'First proper 2.0 feed sample: long-ish caption, mentions @demo_artist, and enough text to exercise wrapping across mobile cards.', '', `/images/${imageA}`, isoMinutesAgo(55)],
      ['seed-post-2', 'seed-user-label', 'Label update with #release and a repost-friendly amount of text. This should make the feed feel populated instead of sterile.', 'https://soundcloud.com/demo/track', '', isoMinutesAgo(250)],
      ['seed-post-3', 'seed-user-artist', 'Own post with comments, reactions and saved-state coverage for regression checks.', '', '', isoMinutesAgo(480)],
    ];
    for (const [id, userId, content, trackUrl, image, createdAt] of posts) {
      insert('posts', { id, user_id: userId, content, track_url: trackUrl, image, repost_of: '', created_at: createdAt, text_pos: 'above', archived: 0, play_count: 3 });
    }
    insert('comments', { id: 'seed-comment-1', post_id: 'seed-post-1', user_id: 'seed-user-artist', content: 'This is exactly the kind of density Feed 2.0 should handle.', parent_id: '', created_at: isoMinutesAgo(45) });
    insert('comments', { id: 'seed-comment-2', post_id: 'seed-post-1', user_id: 'seed-user-producer', content: '@demo_artist agreed, threaded replies make this feel alive.', parent_id: 'seed-comment-1', created_at: isoMinutesAgo(40) });
    insert('comment_likes', { comment_id: 'seed-comment-1', user_id: 'seed-user-producer', created_at: isoMinutesAgo(38) });
    insert('likes', { user_id: 'seed-user-artist', post_id: 'seed-post-1' });
    insert('bookmarks', { user_id: 'seed-user-artist', post_id: 'seed-post-2', created_at: isoMinutesAgo(30) });
    insert('post_reactions', { post_id: 'seed-post-1', user_id: 'seed-user-artist', emoji: '◆', created_at: isoMinutesAgo(25) });

    insert('drops', { id: 'seed-drop-1', user_id: 'seed-user-producer', content: 'Studio check. This drop should be active and image-backed.', track_url: '', image: `/images/${imageB}`, caption: 'active visual drop', created_at: isoMinutesAgo(30), expires_at: new Date(Date.now() + 23 * 60 * 60_000).toISOString() });
    insert('drops', { id: 'seed-drop-2', user_id: 'seed-user-artist', content: 'Text-only drop for spacing and delete control QA.', track_url: 'https://soundcloud.com/demo/drop', image: '', caption: 'text drop', created_at: isoMinutesAgo(90), expires_at: new Date(Date.now() + 22 * 60 * 60_000).toISOString() });
    insert('drop_views', { drop_id: 'seed-drop-1', user_id: 'seed-user-artist' });

    insert('conversations', { id: 'seed-chat-dm', is_group: 0, title: '', owner: '', pinned_msg_id: 'seed-msg-4', created_at: isoMinutesAgo(2000) });
    insert('conversations', { id: 'seed-chat-group', is_group: 1, title: '2.0 Release Room', owner: 'seed-user-artist', pinned_msg_id: 'seed-msg-g2', created_at: isoMinutesAgo(1900) });
    for (const convId of ['seed-chat-dm', 'seed-chat-group']) {
      insert('conversation_members', { conv_id: convId, user_id: 'seed-user-artist', last_read: isoMinutesAgo(convId === 'seed-chat-dm' ? 35 : 120), accepted: 1, role: convId === 'seed-chat-group' ? 'owner' : 'member', pinned_at: convId === 'seed-chat-group' ? isoMinutesAgo(100) : null });
      insert('conversation_members', { conv_id: convId, user_id: 'seed-user-producer', last_read: isoMinutesAgo(60), accepted: 1, role: 'member' });
    }
    insert('conversation_members', { conv_id: 'seed-chat-group', user_id: 'seed-user-label', last_read: isoMinutesAgo(240), accepted: 1, role: 'member' });

    const messages = [
      ['seed-msg-1', 'seed-chat-dm', 'seed-user-producer', 'Can Disk 2.0 show file context without opening every preview?', '', '', '', isoMinutesAgo(90)],
      ['seed-msg-2', 'seed-chat-dm', 'seed-user-artist', 'Yes. Details panel, preview metadata, and batch states are the main thing.', '', '', '', isoMinutesAgo(82)],
      ['seed-msg-3', 'seed-chat-dm', 'seed-user-producer', '', '/images/seed-feed-cover.svg', 'image/svg+xml', 'seed-feed-cover.svg', isoMinutesAgo(70)],
      ['seed-msg-4', 'seed-chat-dm', 'seed-user-artist', 'Pinned: 2.0 should make common actions visible, not hidden in prompts.', '', '', '', isoMinutesAgo(60)],
      ['seed-msg-5', 'seed-chat-dm', 'seed-user-producer', 'Unread marker should land above this message.', '', '', '', isoMinutesAgo(20)],
      ['seed-msg-g1', 'seed-chat-group', 'seed-user-label', 'Group room needs members, shared media and saved-message coverage.', '', '', '', isoMinutesAgo(180)],
      ['seed-msg-g2', 'seed-chat-group', 'seed-user-artist', 'Pinned group note: ship fewer surprises.', '', '', '', isoMinutesAgo(160)],
      ['seed-msg-g3', 'seed-chat-group', 'seed-user-producer', 'Adding a file row here for media gallery coverage.', '/disk/seed-brief.md', 'text/markdown', 'seed-brief.md', isoMinutesAgo(150)],
    ];
    for (const [id, convId, sender, content, file, fileType, fileName, createdAt] of messages) {
      insert('messages', { id, conv_id: convId, sender_id: sender, content, file, file_type: fileType, file_size: file ? 512 : 0, file_name: fileName, created_at: createdAt, reply_to: '', reply_text: '' });
    }
    insert('message_reactions', { msg_id: 'seed-msg-4', user_id: 'seed-user-producer', emoji: '◆', created_at: isoMinutesAgo(55) });
    insert('saved_messages', { user_id: 'seed-user-artist', msg_id: 'seed-msg-g2', created_at: isoMinutesAgo(40) });

    const folderId = 'seed-folder-2-0';
    insert('disk_folders', { id: folderId, user_id: 'seed-user-artist', parent_id: null, name: '2.0 QA Kit', created_at: isoMinutesAgo(500) });
    const diskFiles = [
      ['seed-disk-brief', 'seed-brief.md', '# W0PIUM 2.0 Brief\n\n- Chat details panel\n- Disk upload queue\n- Settings tabs\n', 'text/markdown', null, 'Brief for the 2.0 pass.'],
      ['seed-disk-csv', 'seed-metrics.csv', 'metric,value\nchats,2\ndisk_files,4\ndrops,2\n', 'text/csv', folderId, 'Small CSV for text preview and folder coverage.'],
      ['seed-disk-json', 'seed-config.json', '{"theme":"dark","surface":"disk","version":"2.0"}\n', 'application/json', folderId, 'JSON metadata preview.'],
      ['seed-disk-image', 'seed-disk-image.svg', svg('DISK', '#0b1418', '#8ee6ff', 'PREVIEW'), 'image/svg+xml', null, 'Image preview sample.'],
    ];
    for (const [id, name, content, mime, folder, description] of diskFiles) {
      const size = writeTextFile(DISK_DIR, name, content);
      insert('disk_files', { id, user_id: 'seed-user-artist', name, size, mime, path: `/disk/${name}`, description, folder_id: folder, public_token: id === 'seed-disk-brief' ? 'seed-public-brief' : null, created_at: isoMinutesAgo(Math.floor(Math.random() * 500) + 10) });
    }

    insert('notifications', { id: 'seed-notif-1', user_id: 'seed-user-artist', from_id: 'seed-user-producer', type: 'like', ref_id: 'seed-post-3', seen: 0, created_at: isoMinutesAgo(18) });
    insert('notifications', { id: 'seed-notif-2', user_id: 'seed-user-artist', from_id: 'seed-user-label', type: 'dm', ref_id: 'seed-chat-group', seen: 0, created_at: isoMinutesAgo(12) });
    insert('notifications', { id: 'seed-notif-3', user_id: 'seed-user-artist', from_id: 'seed-user-producer', type: 'comment_reply', ref_id: 'seed-post-1', seen: 0, created_at: isoMinutesAgo(8) });
    insert('notifications', { id: 'seed-notif-4', user_id: 'seed-user-artist', from_id: 'seed-user-producer', type: 'mention', ref_id: 'seed-post-1', seen: 0, created_at: isoMinutesAgo(7) });
  })();
}

seed();

console.log(`Seeded W0PIUM 2.0 demo data.
Login: demo_artist
Password: ${PASSWORD}`);
