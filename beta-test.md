# W0PIUM — Beta Test Script

**Site:** https://w0pium.walfir.com
**Account 1 (main):** `wf`
**Account 2 (social testing):** `vf`

---

## 1. Auth
- [ ] Login with `wf`
- [ ] After login — Feed opens, URL = `/`
- [ ] Refresh on Feed — stays on Feed
- [ ] Go to Disk, refresh — stays on `/disk`
- [ ] Go to Settings, refresh — stays on `/settings`
- [ ] Browser Back button — navigation works correctly

---

## 2. Feed
- [ ] Post plain text
- [ ] Post with track link
- [ ] Post with image (IMG button)
- [ ] Post with poll — vote on it
- [ ] Like a post from `vf` account
- [ ] Comment on a post
- [ ] Follow `vf` — their posts appear in feed
- [ ] Pin post to profile — it appears at the top
- [ ] Archive post — disappears from feed but not deleted
- [ ] Report someone else's post
- [ ] Delete own post

---

## 3. Disk
- [ ] Upload audio file (mp3 / wav)
- [ ] Custom player: ▶/⏸ button, progress bar, time display, volume slider
- [ ] Click waveform — seeks to that position
- [ ] Volume slider — changes volume smoothly
- [ ] Mute button — icon changes (🔊 / 🔉 / 🔇)
- [ ] Upload image — zoom with scroll wheel in preview
- [ ] Upload video — player works
- [ ] Upload text file — text preview shown
- [ ] Create folder
- [ ] Drag file into folder
- [ ] Move file via edit form (not drag-and-drop)
- [ ] Nested folders (folder inside folder) — breadcrumb navigation works
- [ ] Rename file
- [ ] Download single file
- [ ] Multi-select files → download as ZIP
- [ ] Open access (public link) — copy link, open in incognito, file is accessible without login
- [ ] Search files by name
- [ ] Sort: by date / by name / by size (asc & desc)
- [ ] Toggle view: grid / list
- [ ] Delete folder with files inside
- [ ] Delete file

---

## 4. Profile
- [ ] Open own profile
- [ ] Change avatar
- [ ] Edit bio / links
- [ ] Open `vf` profile — URL is `/profile/vf`
- [ ] Refresh on profile page — stays on `/profile/vf`
- [ ] Follow / unfollow

---

## 5. Chats
- [ ] Open chat with `vf`
- [ ] Send text message
- [ ] Send image
- [ ] Send file attachment (non-image)
- [ ] Verify message delivered (check from `vf`)
- [ ] Edit sent message
- [ ] Delete message
- [ ] React to a message (emoji reaction)
- [ ] Voice message (requires microphone)
- [ ] Typing indicator — visible on the other side
- [ ] Send chat request to unknown user → accept / decline from second account
- [ ] Export conversation

---

## 6. Drops
- [ ] Create Drop (image + description)
- [ ] View someone else's Drop — view counter increments
- [ ] Delete own Drop

---

## 7. Search
- [ ] Search user by username
- [ ] Search post by hashtag

---

## 8. Notifications
- [ ] From `vf`: like a post of `wf` — notification arrives for `wf`
- [ ] From `vf`: follow `wf` — notification
- [ ] From `vf`: comment on `wf` post — notification
- [ ] Push notifications — allow in browser, verify they arrive

---

## 9. Discover / Artists / Hub
- [ ] Open each section — loads correctly
- [ ] Refresh on each — stays in place

---

## 10. Settings
- [ ] Change display name / username
- [ ] Try to leave without saving — confirm dialog appears
- [ ] Change password
- [ ] Notification preferences
- [ ] Copy invite link
- [ ] Rotate (refresh) invite code
- [ ] Register new user via invite link — verify email flow works
- [ ] Export all personal data (downloads archive)
- [ ] Submit verification request

---

## 11. Forgot Password
- [ ] Logout → "Forgot password" → enter email → receive email → reset password → login with new password

---

## 12. Admin Panel (if `wf` is admin)
- [ ] Site stats (users, posts, activity)
- [ ] User list — ban / unban user
- [ ] Promote user to admin
- [ ] Approve / reject verification requests
- [ ] View reports → resolve
- [ ] View invite list
- [ ] Hub → external links, API keys

---

## 13. Account Deletion
- [ ] Settings → Delete account (**test on a throwaway account, not main**)
- [ ] Verify that login with deleted account is impossible

---

## Bug Report Format

For each bug found, include:
1. **What you did** (steps to reproduce)
2. **What you expected**
3. **What actually happened**
4. **Browser + device**
5. **Screenshot** (if possible)

---

**Test browsers:** Chrome (desktop), Safari (mobile — especially important)
