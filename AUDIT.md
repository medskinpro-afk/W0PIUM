# W0PIUM — QA Audit Guide

**Site:** https://w0pium.walfir.com  
**Last updated:** 2026-05-05  
**Repo:** `\\MedSkin\docker\w0pium\`

---

## Test Accounts

| Username | Password | Role | Notes |
|----------|----------|------|-------|
| `wf` | `WF-W0PIUM-2026` | Admin | Main admin — do NOT delete or ban |
| `vf` | `VF-W0PIUM-2026` | Regular user | Social testing account — do NOT delete |
| `616` | `[CONFIRM WITH OWNER]` | Regular user | Owner's friend — do NOT delete |

> ⚠️ These three accounts must always exist in the DB. Never delete, ban, or wipe them.  
> To reset `wf` / `vf` passwords: run `node scripts/reset-wf-vf.js` on the NAS.

---

## How to Run a Test Pass

1. Open https://w0pium.walfir.com in two browser windows/tabs  
   — Window A: logged in as **`wf`** (admin)  
   — Window B: logged in as **`vf`** (test user)
2. Work through each section below
3. Mark `[x]` for pass, `[!]` for fail, `[-]` for skipped
4. Log all failures in **Bug Report** section at the bottom

---

## Recently Fixed (test these first)

These were broken and just deployed — verify they're working:

- [ ] **Nav strip on Notifications** — `/notifs` should show Feed/DM/Discover/Drops/Disk/Search strip at top
- [ ] **Nav strip on Settings** — `/settings` should show the strip
- [ ] **Nav strip on Profile** — `/profile/wf` should show the strip
- [ ] **Nav strip on Bookmarks** — `/bookmarks` should show the strip
- [ ] **Artists page title order** — strip → ARTISTS → metric cards (not cards before title)
- [ ] **Disk toolbar alignment** — ПАПКА / ЗАГРУЗИТЬ buttons should be right-aligned
- [ ] **Notification comment icon** — should show `◈ прокомментировал` (not a broken emoji)
- [ ] **Direct URL to `/bookmarks`** — hard-navigate (paste in address bar), should land on Bookmarks, not Feed
- [ ] **Direct URL to `/notifications`** — should resolve to Notifications page (alias)
- [ ] **`/artists` direct URL** — should stay on Artists page after hard reload

---

## 1. Auth

- [ ] Login as `wf` — Feed opens, URL = `/`
- [ ] Login as `vf` in second window
- [ ] Refresh on Feed — stays on Feed
- [ ] Hard-navigate to `/disk` — stays on Disk after load
- [ ] Hard-navigate to `/settings` — stays on Settings after load
- [ ] Hard-navigate to `/notifs` — stays on Notifications after load
- [ ] Hard-navigate to `/bookmarks` — stays on Bookmarks after load
- [ ] Hard-navigate to `/profile/vf` — stays on VF profile after load
- [ ] Browser Back button — navigates correctly
- [ ] Logout — redirects to login page, session cleared

---

## 2. Navigation — Command Strip

Check every main page has the strip (`Feed · DM · Discover · Drops · Disk · Search`) and the active item is highlighted:

- [ ] Feed — `Feed` highlighted
- [ ] DM (`/chats`) — `DM` highlighted
- [ ] Discover — `Discover` highlighted
- [ ] Drops — `Drops` highlighted
- [ ] Disk — `Disk` highlighted
- [ ] Search — `Search` highlighted
- [ ] Notifications (`/notifs`) — strip present, no item highlighted
- [ ] Settings — strip present, no item highlighted
- [ ] Profile (`/profile/wf`) — strip present, no item highlighted
- [ ] Bookmarks — strip present, no item highlighted
- [ ] Artists — strip present (`Search` highlighted or none)

**Title ordering** — on every page verify: Strip → Title → Metric cards → Content (never cards before title):

- [ ] Feed: strip → FEED → composer → posts
- [ ] Discover: strip → DISCOVER → metric cards → posts
- [ ] Drops: strip → DROPS → composer → list
- [ ] Disk: strip → DISK → metric cards → toolbar → files
- [ ] Search: strip → ПОИСК → metric cards → search bar
- [ ] DM: strip → DM → metric cards → chat list
- [ ] Artists: strip → ARTISTS → metric cards → list
- [ ] Notifications: strip → УВЕДОМЛЕНИЯ → list
- [ ] Settings: strip → НАСТРОЙКИ → form
- [ ] Profile: strip → profile card → metric cards → tabs → posts

---

## 3. Feed

- [ ] Post plain text (as `wf`)
- [ ] Post with image
- [ ] Post with poll — vote on it
- [ ] Post with scheduled time — post appears at the right time
- [ ] Like a post from `vf`
- [ ] Comment on a post
- [ ] Repost
- [ ] Follow `vf` — their posts appear in feed
- [ ] Pin post to profile
- [ ] Archive post — disappears from feed, visible in profile Archive tab
- [ ] Report a post
- [ ] Delete own post

---

## 4. Discover

- [ ] Posts from all users visible
- [ ] Sort: fresh / signal
- [ ] Mode: public / all network
- [ ] React (like, save, report) from discover

---

## 5. Drops

- [ ] Create drop (image + description) as `wf`
- [ ] View a drop — view counter increments
- [ ] Delete own drop

---

## 6. DM / Chats

- [ ] Open chat with `vf`
- [ ] Send text message — received in `vf` window in real-time (SSE)
- [ ] Send image
- [ ] Send file attachment (non-image)
- [ ] Edit a sent message
- [ ] Delete a message
- [ ] React to a message
- [ ] Voice message (requires mic permission)
- [ ] Typing indicator visible on receiving side
- [ ] Pin a message
- [ ] Reply to a message
- [ ] Forward a message
- [ ] Message details (timestamp, read receipts)
- [ ] Archive chat — moves to archive section
- [ ] Unarchive chat — returns to main list
- [ ] Group chat — create, send messages
- [ ] Chat request flow: send from unknown user → accept/decline

---

## 7. Disk

- [ ] Upload audio file — waveform player shows
- [ ] Player: play/pause, seek via waveform click, volume slider, mute
- [ ] Upload image — preview with scroll-zoom
- [ ] Upload video — player works
- [ ] Upload text file — text preview shown
- [ ] Create folder
- [ ] Navigate into folder — breadcrumb shows path
- [ ] Breadcrumb "Диск" link → back to root
- [ ] Move file to folder via edit form
- [ ] Rename file
- [ ] Download single file
- [ ] Multi-select files → ZIP download
- [ ] Public link — open in incognito → file accessible without login
- [ ] Search files by name
- [ ] Sort by date / name / size (asc & desc)
- [ ] Toggle grid / list view
- [ ] Delete file
- [ ] Delete folder with contents
- [ ] ПАПКА / ЗАГРУЗИТЬ buttons — right-aligned, not left

---

## 8. Search

- [ ] Search by username — results appear
- [ ] Search by post content
- [ ] Search in DM messages
- [ ] Search files
- [ ] Tab switching: ВСЕ / ЛЮДИ / ПОСТЫ / СООБЩЕНИЯ / ФАЙЛЫ
- [ ] Keyboard navigation: up/down arrows, Enter to open

---

## 9. Profile

- [ ] View own profile (`/profile/wf`) — avatar, name, stats
- [ ] Change avatar
- [ ] Edit display name, bio, social links in Settings → save
- [ ] View VF profile — follow/unfollow buttons
- [ ] Follow `vf` → follower count updates
- [ ] POSTS tab — own posts listed
- [ ] ТРЕКИ tab — posts with track links
- [ ] СОХРАНЁННЫЕ tab (own profile only) — bookmarked posts
- [ ] АРХИВ tab (own profile, if any) — archived posts

---

## 10. Notifications

- [ ] From `vf`: like a post of `wf` → notification arrives for `wf`
- [ ] From `vf`: follow `wf` → notification
- [ ] From `vf`: comment on `wf` post → notification shows `◈ прокомментировал`
- [ ] Click notification → navigates to correct place
- [ ] Unread badge clears after opening `/notifs`
- [ ] Follow request flow: private account → request sent → accept/decline

---

## 11. Bookmarks

- [ ] Bookmark a post from Feed
- [ ] Open `/bookmarks` — post appears
- [ ] Hard-navigate directly to `/bookmarks` — page loads (not Feed)
- [ ] Remove bookmark — post disappears

---

## 12. Settings

- [ ] Change display name — saved, visible on profile
- [ ] Change bio — saved
- [ ] Change social links (SC, IG, TG, Spotify, site) — saved
- [ ] Change password — logout → login with new password → works
- [ ] Privacy: toggle private profile
- [ ] Read receipts / typing indicator toggles
- [ ] Push notifications — allow in browser, verify they arrive
- [ ] Copy invite link
- [ ] Rotate invite code — new code generated
- [ ] Export personal data — ZIP downloads
- [ ] Submit verification request

---

## 13. Artists

- [ ] List loads with all users
- [ ] Search input filters by username
- [ ] Click user row → opens their profile

---

## 14. Admin Panel (logged in as `wf` only)

- [ ] Stats: users, posts, messages, drops counts visible
- [ ] Users tab: all users listed
- [ ] Ban user (use a throwaway — NOT wf/vf/616)
- [ ] Unban user
- [ ] Drops tab: drop list visible
- [ ] Invites tab: invite codes visible
- [ ] Жалобы (Reports): list visible
- [ ] Верификации: requests visible
- [ ] DIAG tab: diagnostics data loads

---

## 15. Hub (`/hub`) — logged in as `wf`

- [ ] W0PIUM stats block visible (posts, followers, etc.)
- [ ] Social platform rows visible (YT, IG, TikTok, etc.)
- [ ] ОБНОВИТЬ button refreshes live data
- [ ] API keys section — save a key, confirm saved toast
- [ ] ПРОФИЛЬ / АНАЛИТИКА links open correctly

---

## 16. PWA / Mobile

- [ ] Install prompt appears (desktop Chrome or mobile)
- [ ] After install — opens as standalone app (no browser chrome)
- [ ] Offline page — shows fallback when network is off
- [ ] Push notification arrives after being triggered from another account

---

## 17. Forgot Password

- [ ] Logout → "Забыл пароль?" → enter email → if RESEND_API_KEY set, email arrives → reset → login

> ⚠️ Only works if `RESEND_API_KEY` is configured in `.env`. Skip if not set.

---

## Bug Report Format

For each bug found, copy this block:

```
## BUG: [short title]

**Steps to reproduce:**
1.
2.
3.

**Expected:** 
**Actual:** 
**Account used:** wf / vf / 616
**Browser + device:** 
**Screenshot/video:** 
```

---

## Known Limitations (not bugs)

| Item | Status |
|------|--------|
| Email verification / password reset | Requires `RESEND_API_KEY` in `.env` |
| Web Push notifications | Requires `VAPID_PUBLIC` / `VAPID_PRIVATE` in `.env` |
| Hub live data | Requires platform API keys configured in Hub settings |
| Federation / Hub logic | UI exists, distributed sync not fully implemented |
| `/profile` (no username) on hard reload | Redirects to Feed — known SPA limitation; use `/profile/wf` instead |
| Same-browser dual-user testing | Tabs share the same `httpOnly` session cookie — logout in one tab clears all. **Use two different browsers** (e.g. Chrome for `wf`, Firefox for `vf`) to run both sessions simultaneously |
| Network Signal shows own posts | `hot_posts` query is platform-wide by design — includes your own content |
| Archive available from Discover view | Intentional — `actionsHtml()` gates archive on `isOwn`; owner can archive their post from any view |

---

## Audit Sign-off

| Section | Auditor | Pass/Fail | Notes |
|---------|---------|-----------|-------|
| Auth | | | |
| Navigation / Strip | | | |
| Feed | | | |
| Discover | | | |
| Drops | | | |
| DM / Chats | | | |
| Disk | | | |
| Search | | | |
| Profile | | | |
| Notifications | | | |
| Bookmarks | | | |
| Settings | | | |
| Artists | | | |
| Admin Panel | | | |
| Hub | | | |
| PWA / Mobile | | | |
