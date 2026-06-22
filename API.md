# W0PIUM — API Reference

> **Base URL:** `https://w0pium.walfir.com`
> **Auth:** token-based cookie (`token` cookie, set on login).
> **Middleware chain:** `helmet → compression → pinoHttp → json parser → cookieParser → csrfCheck → static`
> **Rate limiters:** see individual endpoints below.

---

## Auth

| Method | Path | Auth | Limiter | Body / Notes |
|--------|------|------|---------|-------------|
| POST | `/api/register` | — | `limiterRegister` | `{ username, display_name, password, invite_code }` → `{ ok, user }` |
| POST | `/api/login` | — | `limiterLogin` | `{ username, password }` → `{ ok, user }` + Set-Cookie `token` |
| GET | `/api/dev/email-code/:username` | — | — | DEV only: returns email verification code |
| POST | `/api/verify-email` | — | `limiterResend` | `{ username, code }` → `{ ok }` |
| POST | `/api/resend-verification` | — | `limiterResend` | `{ username }` → `{ ok }` |
| POST | `/api/forgot-password` | — | `limiterForgot` | `{ email }` — sends reset code |
| POST | `/api/reset-password` | — | `limiterResetPwd` | `{ email, code, newPassword }` |
| POST | `/api/logout` | auth | `limiterSessionManage` | Clears token cookie |
| GET | `/api/logout` | — | — | Same — clears cookie |

---

## Sessions

| Method | Path | Auth | Limiter | Notes |
|--------|------|------|---------|-------|
| GET | `/api/sessions` | auth | — | `{ sessions: [...] }` |
| DELETE | `/api/sessions/others` | auth | `limiterSessionManage` | Revoke all except current |
| DELETE | `/api/sessions/all` | auth | `limiterSessionManage` | Revoke all sessions |

---

## User Profile

| Method | Path | Auth | Limiter | Body / Notes |
|--------|------|------|---------|-------------|
| GET | `/api/me` | auth | — | `{ user }` — own profile |
| PUT | `/api/profile` | auth | `limiterProfileUpdate` | `{ display_name, bio, link_*, is_private }` |
| PUT | `/api/password` | auth | `limiterPasswordChange` | `{ currentPassword, newPassword }` |
| DELETE | `/api/me` | auth | `limiterAccountDelete` | Delete own account |
| POST | `/api/invite/rotate` | auth | `limiterProfileUpdate` | Rotate invite code |
| POST | `/api/avatar` | auth | `limiterAvatarUpload` | multipart: `avatar` file |
| GET | `/api/user/:u` | oAuth | — | Public profile `{ user, isFollowing, isBlocked }` |
| GET | `/api/user/:u/followers` | oAuth | — | `{ followers: [...] }` |
| GET | `/api/user/:u/following` | oAuth | — | `{ following: [...] }` |

---

## Follow / Block / Mute

| Method | Path | Auth | Limiter | Notes |
|--------|------|------|---------|-------|
| POST | `/api/follow/:id` | auth | 30/min | Send follow request |
| DELETE | `/api/follow/:id` | auth | 30/min | Unfollow |
| GET | `/api/follow-requests` | auth | — | Pending follow requests |
| POST | `/api/follow-requests/:id/accept` | auth | 30/min | Accept follow request |
| DELETE | `/api/follow-requests/:id` | auth | 30/min | Decline follow request |
| POST | `/api/user/:u/block` | auth | 20/min | Block user |
| DELETE | `/api/user/:u/block` | auth | 20/min | Unblock user |
| POST | `/api/user/:u/mute` | auth | 20/min | Mute user |
| DELETE | `/api/user/:u/mute` | auth | 20/min | Unmute user |

---

## Posts

| Method | Path | Auth | Limiter | Body / Notes |
|--------|------|------|---------|-------------|
| POST | `/api/posts` | auth | `limiterPosts` | multipart: `content`, `image?`, `track_url?`, `poll?`, `scheduled_at?` |
| GET | `/api/posts/:id` | auth | — | Full post with comments |
| PUT | `/api/posts/:id` | auth | `limiterPosts` | `{ content }` — edit post |
| PATCH | `/api/posts/:id` | auth | `limiterPosts` | Partial update |
| DELETE | `/api/posts/:id` | auth | `limiterPosts` | Delete post |
| POST | `/api/posts/:id/pin` | auth | `limiterPostReact` | Pin post to profile |
| DELETE | `/api/posts/:id/pin` | auth | `limiterPostReact` | Unpin |
| POST | `/api/posts/:id/archive` | auth | `limiterPostReact` | Archive post |
| DELETE | `/api/posts/:id/archive` | auth | `limiterPostReact` | Unarchive |
| POST | `/api/posts/:id/play` | auth | `limiterPlay` | Track play count |
| POST | `/api/posts/:id/poll/:optId` | auth | `limiterPostReact` | Vote on poll option |

---

## Post Social

| Method | Path | Auth | Limiter | Notes |
|--------|------|------|---------|-------|
| POST | `/api/posts/:id/like` | auth | 60/min | Like post |
| DELETE | `/api/posts/:id/like` | auth | 60/min | Unlike |
| GET | `/api/posts/:id/likes` | auth | — | List likers |
| POST | `/api/posts/:id/react` | auth | `limiterPostReact` | `{ emoji }` — add emoji reaction |
| DELETE | `/api/posts/:id/react` | auth | `limiterPostReact` | `{ emoji }` — remove reaction |
| POST | `/api/posts/:id/bookmark` | auth | `limiterPostReact` | Bookmark post |
| GET | `/api/bookmarks` | auth | — | List bookmarks |

---

## Comments

| Method | Path | Auth | Limiter | Notes |
|--------|------|------|---------|-------|
| GET | `/api/posts/:id/comments` | oAuth | — | Paginated comments `?limit=&before=` |
| POST | `/api/posts/:id/comments` | auth | `limiterComment` | `{ content, parent_id? }` |
| POST | `/api/comments/:id/like` | auth | 60/min | Like comment |
| DELETE | `/api/comments/:id/like` | auth | 60/min | Unlike comment |

---

## Feed & Discovery

| Method | Path | Auth | Limiter | Notes |
|--------|------|------|---------|-------|
| GET | `/api/feed` | auth | — | `?before=` — paginated feed |
| GET | `/api/discover` | auth | — | `?before=` — discover page |
| GET | `/api/social/overview` | auth | — | Social dashboard |
| GET | `/api/explore/overview` | auth | — | Explore dashboard |
| GET | `/api/user/:u/posts` | oAuth | — | User posts |
| GET | `/api/user/:u/drops` | oAuth | — | User drops |
| GET | `/api/user/:u/public-files` | oAuth | — | User\s public disk files |
| GET | `/api/user/:u/showcase` | oAuth | — | Profile showcase |

---

## Search

| Method | Path | Auth | Limiter | Notes |
|--------|------|------|---------|-------|
| GET | `/api/search` | auth | — | `?q=` — global search (users, posts, hashtags) |
| GET | `/api/search/messages` | auth | — | `?q=&cid=` — search in chat |
| GET | `/api/hashtag/:tag` | auth | — | Posts by hashtag |
| GET | `/api/artists` | auth | — | Artist directory |
| GET | `/api/link-preview` | auth | `limiterLinkPreview` | `?url=` — OpenGraph preview |
| GET | `/api/users/suggest` | auth | — | Suggested users to follow |

---

## Notifications

| Method | Path | Auth | Limiter | Notes |
|--------|------|------|---------|-------|
| GET | `/api/notifications` | auth | — | `?before=` — paginated |

---

## SSE (Server-Sent Events)

| Method | Path | Auth | Limiter | Notes |
|--------|------|------|---------|-------|
| GET | `/api/events` | auth | — | Real-time event stream (notifications, chat, typing) |

---

## Chat

| Method | Path | Auth | Limiter | Notes |
|--------|------|------|---------|-------|
| GET | `/api/chats` | auth | — | List conversations |
| POST | `/api/chats` | auth | `limiterMsg` | `{ member_ids, name? }` — create group chat |
| POST | `/api/chats/start/:id` | auth | `limiterMsg` | Start DM with user `:id` |
| POST | `/api/chats/:cid/accept` | auth | `limiterMsg` | Accept DM request |
| POST | `/api/chats/:cid/decline` | auth | `limiterMsg` | Decline DM request |
| PATCH | `/api/chats/:cid` | auth | `limiterMsg` | Edit group info `{ name?, avatar? }` |
| POST | `/api/chats/:cid/avatar` | auth | `limiterMsg` | multipart: group avatar |
| POST | `/api/chats/:cid/members` | auth | `limiterMsg` | `{ user_id }` — add member |
| DELETE | `/api/chats/:cid/members/:uid` | auth | `limiterMsg` | Remove member |
| POST | `/api/chats/:cid/leave` | auth | `limiterMsg` | Leave group |
| PATCH | `/api/chats/:cid/state` | auth | `limiterMsg` | `{ last_read?, archived_at? }` |
| PATCH | `/api/chats/:cid/mute` | auth | `limiterMsg` | `{ hours }` — mute for N hours |
| POST | `/api/chats/:cid/pin` | auth | `limiterMsg` | Pin conversation |
| DELETE | `/api/chats/:cid/pin` | auth | `limiterMsg` | Unpin |
| GET | `/api/chats/saved` | auth | — | Saved messages (cross-chat) |

---

## Chat Messages

| Method | Path | Auth | Limiter | Notes |
|--------|------|------|---------|-------|
| GET | `/api/chats/:cid/messages` | auth | — | `?before=&limit=` — paginated |
| POST | `/api/chats/:cid/messages` | auth | `limiterMsg` | multipart: `content`, `file?`, `reply_to?` |
| PUT | `/api/chats/:cid/messages/:mid` | auth | `limiterMsg` | `{ content }` — edit |
| DELETE | `/api/chats/:cid/messages/:mid` | auth | `limiterMsg` | Delete |
| POST | `/api/chats/:cid/messages/:mid/forward` | auth | `limiterMsg` | `{ target_cid }` — forward to another chat |
| POST | `/api/chats/:cid/messages/:mid/react` | auth | `limiterReact` | `{ emoji }` |
| DELETE | `/api/chats/:cid/messages/:mid/react` | auth | `limiterReact` | `{ emoji }` |
| POST | `/api/chats/:cid/messages/:mid/save` | auth | `limiterMsg` | Save message |
| DELETE | `/api/chats/:cid/messages/:mid/save` | auth | `limiterMsg` | Unsave |
| GET | `/api/chats/:cid/messages/:mid/context` | auth | — | Messages around `:mid` |
| GET | `/api/chats/:cid/media` | auth | — | Media gallery |
| GET | `/api/chats/:cid/search` | auth | `limiterDmSearch` | `?q=` — search messages in chat |
| POST | `/api/chats/:cid/typing` | auth | `limiterTyping` | Broadcast typing indicator |

---

## Drops

| Method | Path | Auth | Limiter | Notes |
|--------|------|------|---------|-------|
| GET | `/api/drops` | auth | — | `?before=` — drops feed |
| POST | `/api/drops` | auth | `limiterDrops` | multipart: `content`, `image?`, `track_url?` |
| DELETE | `/api/drops/:id` | auth | `limiterDrops` | Delete drop |
| POST | `/api/drops/:id/view` | auth | `limiterDrops` | Register view |

---

## Disk (File Storage)

| Method | Path | Auth | Limiter | Notes |
|--------|------|------|---------|-------|
| GET | `/api/disk` | auth | — | `?folder_id=?&sort=?&filter=?&search=?` — list files |
| POST | `/api/disk` | auth | `limiterDisk` | multipart: `file`, `folder_id?` |
| PATCH | `/api/disk/:id` | auth | `limiterFiles` | `{ name?, description?, folder_id? }` |
| DELETE | `/api/disk/:id` | auth | `limiterFiles` | Delete file |
| GET | `/api/disk/stats` | auth | — | Storage stats |
| POST | `/api/disk/zip` | auth | `limiterExport` | `{ file_ids }` — download as ZIP |
| POST | `/api/disk/:id/publish` | auth | `limiterFiles` | Make file public |
| DELETE | `/api/disk/:id/publish` | auth | `limiterFiles` | Make file private |
| GET | `/api/disk/folders` | auth | — | `?parent_id=` — list folders |
| GET | `/api/disk/folders/all` | auth | — | All folders (recursive) |
| POST | `/api/disk/folders` | auth | `limiterFiles` | `{ name, parent_id? }` — create |
| PATCH | `/api/disk/folders/:id` | auth | `limiterFiles` | `{ name }` — rename |
| DELETE | `/api/disk/folders/:id` | auth | `limiterFiles` | Delete folder |
| GET | `/api/disk/breadcrumb/:id` | auth | — | Folder breadcrumb path |

---

## Push Notifications

| Method | Path | Auth | Limiter | Notes |
|--------|------|------|---------|-------|
| GET | `/api/push/vapid-public` | — | — | VAPID public key |
| POST | `/api/push/subscribe` | auth | `limiterSessionManage` | `{ endpoint, keys: { p256dh, auth } }` |
| DELETE | `/api/push/subscribe` | auth | `limiterSessionManage` | `{ endpoint }` — unsubscribe |

---

## Export

| Method | Path | Auth | Limiter | Notes |
|--------|------|------|---------|-------|
| GET | `/api/export` | auth | `limiterExport` | Export all user data |
| GET | `/api/chats/:cid/export` | auth | — | Export chat |

---

## Reporting

| Method | Path | Auth | Limiter | Notes |
|--------|------|------|---------|-------|
| POST | `/api/report` | auth | `limiterReport` | `{ target_type, target_id, reason }` |

---

## Verification

| Method | Path | Auth | Limiter | Notes |
|--------|------|------|---------|-------|
| POST | `/api/verify-request` | auth | `limiterMsg` | `{ badge_type, reason }` |

---

## Hub (External API Keys)

| Method | Path | Auth | Limiter | Notes |
|--------|------|------|---------|-------|
| GET | `/api/hub/external` | adminAuth | — | External service config |
| GET | `/api/hub/keys` | adminAuth | — | List API keys |
| POST | `/api/hub/keys` | adminAuth | `limiterAdminJobTest` | `{ platform, api_key }` |
| GET | `/api/hub/stats` | adminAuth | — | Hub statistics |

---

## Admin

All admin routes require `adminAuth` middleware. Limiter: `limiterAdminJobTest` (except GET).

| Method | Path | Limiter? | Notes |
|--------|------|----------|-------|
| GET | `/api/admin/stats` | — | System statistics |
| GET | `/api/admin/users` | — | `?q=` — user list |
| POST | `/api/admin/users` | ✓ | `{ username, display_name, password }` — create user |
| POST | `/api/admin/users/:uid/password` | ✓ | `{ password }` — reset password |
| DELETE | `/api/admin/users/:uid/sessions` | ✓ | Revoke all sessions |
| POST | `/api/admin/users/:uid/ban` | ✓ | `{ banned: true/false }` |
| DELETE | `/api/admin/users/:uid` | ✓ | Delete user |
| POST | `/api/admin/users/:uid/promote` | ✓ | `{ is_admin: true/false }` |
| POST | `/api/admin/users/:uid/verify` | ✓ | `{ is_verified, badge_type }` |
| GET | `/api/admin/drops` | — | All drops |
| DELETE | `/api/admin/drops/:id` | ✓ | Delete drop |
| GET | `/api/admin/verify-requests` | — | Pending verification requests |
| POST | `/api/admin/verify-requests/:id/approve` | ✓ | Approve |
| POST | `/api/admin/verify-requests/:id/reject` | ✓ | Reject |
| GET | `/api/admin/reports` | — | All reports |
| POST | `/api/admin/reports/:id/resolve` | ✓ | Resolve report |
| GET | `/api/admin/invites` | — | Invite code usage |
| GET | `/api/admin/diagnostics` | — | Deep diagnostics |
| GET | `/api/admin/jobs` | — | Background job list |
| POST | `/api/admin/jobs/test` | ✓ | Enqueue test job |

---

## Static / Public

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/msg_images/:file` | auth | Chat image serving |
| GET | `/files/:file` | auth | Disk file serving |
| GET | `/pub/:token` | — | Shared public file |
| GET | `/post/:id` | — | Public post page (meta tags) |
| GET | `/u/:username` | — | Public profile page (meta tags) |
| GET | `/drop/:id` | — | Public drop page (meta tags) |
| GET | `/disk/*` | auth | Disk file browsing |
| GET | `/api/health` | — | `{ ok, uptime, build, app_version, db }` |
| GET | `/*` | — | SPA fallback (index.html) |

---

## Rate Limiter Reference

| Limiter | Window | Limit |
|---------|--------|-------|
| `limiterRegister` | 5 min | 3 |
| `limiterLogin` | 1 min | 10 |
| `limiterResend` | 5 min | 3 |
| `limiterForgot` | 5 min | 5 |
| `limiterResetPwd` | 5 min | 5 |
| `limiterFollow` | 1 min | 30 |
| `limiterBlockMute` | 1 min | 20 |
| `limiterLike` | 1 min | 60 |
| `limiterPosts` | 1 min | 30 |
| `limiterPostReact` | 1 min | 60 |
| `limiterComment` | 1 min | 30 |
| `limiterMsg` | 1 min | 60 |
| `limiterReact` | 1 min | 60 |
| `limiterDrops` | 1 min | 20 |
| `limiterDisk` | 1 min | 30 |
| `limiterFiles` | 1 min | 60 |
| `limiterReport` | 5 min | 10 |
| `limiterExport` | 5 min | 3 |
| `limiterLinkPreview` | 1 min | 30 |
| `limiterMsgImages` | 1 min | 100 |
| `limiterProfileUpdate` | 1 min | 20 |
| `limiterPasswordChange` | 5 min | 5 |
| `limiterAccountDelete` | 5 min | 2 |
| `limiterAvatarUpload` | 1 min | 5 |
| `limiterPlay` | 1 min | 60 |
| `limiterTyping` | 1 min | 30 |
| `limiterDmSearch` | 1 min | 30 |
| `limiterAdminJobTest` | 1 min | 30 |
| `limiterSessionManage` | 1 min | 10 |
