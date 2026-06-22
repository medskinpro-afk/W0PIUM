-- ============================================================
-- W0PIUM — Database Schema (SQLite)
-- Auto-generated from server.js migrations
-- DO NOT EDIT MANUALLY — regenerate from live DB when schema changes
-- ============================================================

-- ── Core ────────────────────────────────────────────────────

CREATE TABLE users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    display_name TEXT NOT NULL,
    password TEXT NOT NULL,
    bio TEXT DEFAULT '',
    avatar TEXT DEFAULT '',
    link_sc TEXT DEFAULT '',
    link_ig TEXT DEFAULT '',
    link_tg TEXT DEFAULT '',
    link_spotify TEXT DEFAULT '',
    link_site TEXT DEFAULT '',
    is_private INTEGER NOT NULL DEFAULT 0,
    invite_code TEXT DEFAULT '',
    last_seen DATETIME DEFAULT NULL,
    created_at DATETIME DEFAULT (datetime('now'))
);

CREATE TABLE sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    created_at DATETIME DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ── Social ──────────────────────────────────────────────────

CREATE TABLE posts (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    content TEXT NOT NULL,
    track_url TEXT DEFAULT '',
    image TEXT DEFAULT '',
    repost_of TEXT DEFAULT '',
    scheduled_at DATETIME DEFAULT NULL,
    created_at DATETIME DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE polls (
    id TEXT PRIMARY KEY,
    post_id TEXT NOT NULL,
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
);

CREATE TABLE poll_options (
    id TEXT PRIMARY KEY,
    poll_id TEXT NOT NULL,
    text TEXT NOT NULL,
    FOREIGN KEY (poll_id) REFERENCES polls(id) ON DELETE CASCADE
);

CREATE TABLE poll_votes (
    poll_id TEXT NOT NULL,
    option_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    PRIMARY KEY (poll_id, user_id),
    FOREIGN KEY (poll_id) REFERENCES polls(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE likes (
    user_id TEXT NOT NULL,
    post_id TEXT NOT NULL,
    PRIMARY KEY (user_id, post_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
);

CREATE TABLE post_reactions (
    post_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    emoji TEXT NOT NULL,
    created_at DATETIME DEFAULT (datetime('now')),
    PRIMARY KEY (post_id, user_id),
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE bookmarks (
    user_id TEXT NOT NULL,
    post_id TEXT NOT NULL,
    created_at DATETIME DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, post_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
);

CREATE TABLE comments (
    id TEXT PRIMARY KEY,
    post_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    content TEXT NOT NULL,
    parent_id TEXT DEFAULT '',
    edited_at DATETIME,
    created_at DATETIME DEFAULT (datetime('now')),
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE comment_likes (
    comment_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    created_at DATETIME DEFAULT (datetime('now')),
    PRIMARY KEY (comment_id, user_id),
    FOREIGN KEY (comment_id) REFERENCES comments(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE follows (
    follower_id TEXT NOT NULL,
    following_id TEXT NOT NULL,
    PRIMARY KEY (follower_id, following_id),
    FOREIGN KEY (follower_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (following_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE follow_requests (
    id TEXT PRIMARY KEY,
    from_id TEXT NOT NULL,
    to_id TEXT NOT NULL,
    created_at DATETIME DEFAULT (datetime('now')),
    FOREIGN KEY (from_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (to_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE blocks (
    blocker_id TEXT NOT NULL,
    blocked_id TEXT NOT NULL,
    created_at DATETIME DEFAULT (datetime('now')),
    PRIMARY KEY (blocker_id, blocked_id),
    FOREIGN KEY (blocker_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (blocked_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE mutes (
    muter_id TEXT NOT NULL,
    muted_id TEXT NOT NULL,
    created_at DATETIME DEFAULT (datetime('now')),
    PRIMARY KEY (muter_id, muted_id),
    FOREIGN KEY (muter_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (muted_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE notifications (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    from_id TEXT NOT NULL,
    type TEXT NOT NULL,
    ref_id TEXT DEFAULT '',
    seen INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (from_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ── Chat ────────────────────────────────────────────────────

CREATE TABLE conversations (
    id TEXT PRIMARY KEY,
    avatar TEXT DEFAULT '',
    pinned_msg_id TEXT DEFAULT NULL,
    created_at DATETIME DEFAULT (datetime('now'))
);

CREATE TABLE conversation_members (
    conv_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    last_read DATETIME DEFAULT (datetime('now')),
    muted_until DATETIME DEFAULT NULL,
    pinned_at DATETIME DEFAULT NULL,
    archived_at DATETIME DEFAULT NULL,
    PRIMARY KEY (conv_id, user_id),
    FOREIGN KEY (conv_id) REFERENCES conversations(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE messages (
    id TEXT PRIMARY KEY,
    conv_id TEXT NOT NULL,
    sender_id TEXT NOT NULL,
    content TEXT NOT NULL,
    image TEXT DEFAULT '',
    forwarded_from TEXT DEFAULT NULL,
    created_at DATETIME DEFAULT (datetime('now')),
    FOREIGN KEY (conv_id) REFERENCES conversations(id) ON DELETE CASCADE,
    FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE message_reactions (
    msg_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    emoji TEXT NOT NULL,
    created_at DATETIME DEFAULT (datetime('now')),
    PRIMARY KEY (msg_id, user_id),
    FOREIGN KEY (msg_id) REFERENCES messages(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE saved_messages (
    user_id TEXT NOT NULL,
    msg_id TEXT NOT NULL,
    created_at DATETIME DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, msg_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (msg_id) REFERENCES messages(id) ON DELETE CASCADE
);

-- ── Drops ───────────────────────────────────────────────────

CREATE TABLE drops (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    content TEXT DEFAULT '',
    track_url TEXT DEFAULT '',
    image TEXT DEFAULT '',
    created_at DATETIME DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE drop_views (
    drop_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    PRIMARY KEY (drop_id, user_id),
    FOREIGN KEY (drop_id) REFERENCES drops(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ── Disk ────────────────────────────────────────────────────

CREATE TABLE disk_folders (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    parent_id TEXT DEFAULT NULL,
    name TEXT NOT NULL,
    created_at DATETIME DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE disk_files (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    size INTEGER DEFAULT 0,
    mime TEXT DEFAULT '',
    path TEXT NOT NULL,
    description TEXT DEFAULT '',
    preview_path TEXT DEFAULT '',
    created_at DATETIME DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ── Admin / System ──────────────────────────────────────────

CREATE TABLE reports (
    id TEXT PRIMARY KEY,
    reporter_id TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_id TEXT NOT NULL,
    reason TEXT DEFAULT '',
    status TEXT DEFAULT 'open',
    created_at DATETIME DEFAULT (datetime('now')),
    FOREIGN KEY (reporter_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE push_subscriptions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    endpoint TEXT UNIQUE NOT NULL,
    p256dh TEXT NOT NULL,
    auth_key TEXT NOT NULL,
    created_at DATETIME DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE verification_requests (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    badge_type TEXT NOT NULL DEFAULT 'artist',
    reason TEXT DEFAULT '',
    status TEXT DEFAULT 'pending',
    reviewed_by TEXT,
    created_at DATETIME DEFAULT (datetime('now')),
    reviewed_at DATETIME,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE hub_api_keys (
    platform TEXT PRIMARY KEY,
    api_key TEXT NOT NULL DEFAULT '',
    updated_at DATETIME DEFAULT (datetime('now'))
);

CREATE TABLE background_jobs (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    payload TEXT NOT NULL DEFAULT '',
    result TEXT NOT NULL DEFAULT '',
    error TEXT NOT NULL DEFAULT '',
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 5,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    run_after TEXT DEFAULT (datetime('now'))
);

CREATE TABLE schema_version (
    version INTEGER PRIMARY KEY,
    applied_at TEXT DEFAULT (datetime('now'))
);

-- ── Indexes ─────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_comments_post_parent ON comments(post_id, parent_id, created_at);
CREATE INDEX IF NOT EXISTS idx_comment_likes_comment ON comment_likes(comment_id);
