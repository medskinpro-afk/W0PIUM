# W0PIUM — Frontend Component Index

> **For AI agents. BEFORE creating any new UI element, scan this list.**
> **If a function already exists — REUSE it. NEVER duplicate.**
> **Source:** `public/app.js` (~8100 lines, 250+ functions)

---

## Global Utilities

| Function | Signature | Where | Purpose |
|----------|-----------|-------|---------|
| `esc()` | — | `app.js` | HTML-escape user input. **ALWAYS use before injecting into HTML.** |
| `saLSet(k, v)` | — | `app.js` | Safe `localStorage.setItem` — catches quota errors silently |
| `api(path, opts)` | async | `app.js` | All API calls. Returns parsed JSON. Handle errors via `.catch()` |
| `go(p, param, hist)` | async | `app.js` | **SPA router.** Navigate to page. Never use `window.location.hash` directly |
| `toast` | — | `utils/toast.js` | `toast.ok(msg)`, `toast.error(msg)`, `toast.info(msg)` |
| `cn(...args)` | — | `utils/cn.js` | clsx-like className builder: `cn('base', active && 'active')` |

---

## UI Primitives

| Function | Signature | Purpose |
|----------|-----------|---------|
| `showModal(title, bodyHtml)` | — | Open modal dialog |
| `closeModal()` | — | Close modal dialog |
| `skeletonHtml(count)` | — | Loading skeleton placeholder |
| `avatarEl(url, cls, letter)` | — | Generate avatar HTML |
| `timeAgo(d)` | string | Human-readable relative time |
| `timeAgoEl(d)` | string | HTML-wrapped relative time |
| `initial(name)` | string | First letter upper-cased |
| `pluralRu(n, one, few, many)` | string | Russian plural forms |
| `openImg(src)` | — | Open image lightbox |
| `openVideo(src)` | — | Open video lightbox |
| `truncUrl(u)` | string | Truncate URL to 45 chars |
| `linkifyContent(text)` | string | Convert URLs and hashtags to links |
| `formatMsg(text)` | string | Parse markdown-like formatting |
| `fmtBytes(b)` | string | Human-readable file size |
| `fmtStat(n)` | string | K/M-formatted number |
| `fmtHubTs(ts)` | string | Hub timestamp formatting |

---

## Icons & Branding

| Function | Signature | Purpose |
|----------|-----------|---------|
| `iconCut(name, cls, w, h)` | string | PNG icon HTML (from `icons_cut/`) |
| `likeIconHtml(liked, w, h)` | string | Heart icon (filled/empty) |
| `bookmarkIconHtml(bookmarked, w, h)` | string | Bookmark icon |
| `playPauseIconHtml(playing, w, h)` | string | Play/Pause icon |
| `msgTickIcons(isRead)` | string | Message read receipts (sent/delivered/read) |
| `pageTitleIc(icon, text, iw, ih)` | string | Page title with icon |
| `pageTitleIcRaw(icon, htmlAfterIcon, iw, ih)` | string | Page title with raw HTML after icon |
| `navInner(iconName, text, iw, ih)` | string | Nav item HTML |
| `opiumCoreHero(mode)` | string | Hero header for feed/explore/discover |
| `opiumCommandStrip(active)` | string | Horizontal command strip (tabs) |
| `opiumMetricCards(cards)` | string | Metric card grid |
| `verifiedBadge(isVerified, badgeType)` | string | Verified badge icon |

---

## Auth Pages

| Function | Signature | Purpose |
|----------|-----------|---------|
| `renderAuth(app, mode)` | — | Render login/register form |
| `doAuth(mode)` | async | Submit login/register |
| `showVerifyStep(username)` | — | Show email verification step |
| `doVerify(username)` | async | Submit verification code |
| `resendVerify(username)` | async | Resend verification code |
| `showForgotStep()` | — | Show forgot password form |
| `doForgot()` | async | Submit forgot password |
| `showResetStep(email)` | — | Show reset password form |
| `doReset(email)` | async | Submit reset password |
| `doLogout()` | async | Logout user |

---

## Profile

| Function | Signature | Purpose |
|----------|-----------|---------|
| `renderProfile(app, username)` | async | Render user profile page |
| `switchProfileTab(btn, tabId)` | — | Switch between profile tabs |
| `showPostsCount()` | — | Posts tab indicator |
| `profileShowcaseHtml(showcase)` | string | Profile showcase grid |
| `upAvaProfile()` | async | Upload avatar from profile page |
| `doFollow(id, u)` | async | Follow user |
| `unfollow(id, u)` | async | Unfollow user |
| `blockUser(username)` | async | Block user |
| `unblockUser(username)` | async | Unblock user |
| `muteUser(username)` | async | Mute user |
| `unmuteUser(username)` | async | Unmute user |
| `showFollowersList(username)` | async | Open followers list modal |
| `showFollowingList(username)` | async | Open following list modal |
| `followSuggested(id, btn)` | async | Follow suggested user |
| `acceptFollowReq(id, btn)` | async | Accept follow request |
| `declineFollowReq(id, btn)` | async | Decline follow request |

---

## Settings

| Function | Signature | Purpose |
|----------|-----------|---------|
| `renderSettings(app)` | async | Render settings page |
| `switchSettingsTab(tab, persist)` | — | Switch settings tab |
| `saveProfile()` | async | Save profile changes |
| `rotateInvite()` | async | Rotate invite code |
| `upAva()` | async | Upload avatar |
| `changePassword()` | async | Change password |
| `loadSessions()` | async | Load active sessions |
| `revokeOtherSessions()` | async | Revoke other sessions |
| `checkPwStrength(val)` | string | Password strength meter |
| `deleteAccount()` | async | Delete account |
| `toggleTheme()` | — | Toggle dark/light theme |
| `applyTheme(theme)` | — | Apply specific theme |
| `togglePushNotifications(enable)` | async | Enable/disable push |
| `initPushState()` | async | Initialize push notification state |
| `exportData()` | async | Export user data |
| `submitVerifyRequest()` | async | Submit verification request |
| `showPwaHint()` | — | Show PWA install hint |

---

## Feed & Discovery

| Function | Signature | Purpose |
|----------|-----------|---------|
| `renderFeed(app)` | async | Render main feed |
| `renderDiscover(app)` | async | Render discover page |
| `socialOverviewHtml(data)` | string | Social overview dashboard |
| `loadSocialOverview()` | async | Load social overview data |
| `exploreOverviewHtml(data)` | string | Explore overview dashboard |
| `loadExploreOverview()` | async | Load explore overview data |
| `renderHashtag(app, tag)` | async | Render hashtag page |
| `renderArtists(app)` | async | Render artists directory |
| `artRow(a)` | string | Artist row HTML |
| `searchArt(q)` | — | Filter artists by query |

---

## Posts

| Function | Signature | Purpose |
|----------|-----------|---------|
| `postHtml(p)` | string | Render single post HTML |
| `truncatedContent(text, id)` | string | Truncated content with "show more" |
| `expandPost(id)` | — | Expand truncated post |
| `actionsHtml(p)` | string | Post action buttons (like, comment, repost, bookmark) |
| `composerHtml()` | string | Post composer form |
| `submitPost()` | async | Submit new post |
| `editPost(id)` | async | Open post editor |
| `delPost(id)` | async | Delete post |
| `togLike(id, btn)` | async | Toggle like on post |
| `togBookmark(id, btn)` | async | Toggle bookmark |
| `showLikers(postId)` | async | Show who liked |
| `copyPostLink(id)` | async | Copy post link |
| `archivePost(id, btn)` | async | Archive post |
| `unarchivePost(id, btn)` | async | Unarchive post |
| `pinPost(id)` | async | Pin post |
| `unpinPost(id)` | async | Unpin post |
| `trackPlay(postId)` | — | Track play |
| `repostDirect(id)` | async | Direct repost |
| `showRepostMenu(id, btn, alreadyReposted)` | — | Open repost options menu |
| `showQuoteCompose(postId)` | — | Open quote repost composer |
| `submitQuote(postId)` | async | Submit quote repost |
| `voteOnPoll(postId, pollId, optId, btn)` | async | Vote on poll option |
| `togglePollComposer()` | — | Toggle poll composer UI |
| `addPollOption()` | — | Add poll option field |
| `toggleScheduler()` | — | Toggle schedule post UI |
| `bindComposerImg()` | — | Bind image upload to composer |
| `toggleTextPos()` | — | Toggle text position on image |
| `toggleAttachMenu(prefix)` | — | Toggle attachment menu |
| `closeAttachMenu(prefix)` | — | Close attachment menu |
| `bindMentionAutocomplete(textareaId, dropId)` | — | Bind mention autocomplete |
| `insertMention(textareaId, dropId, username)` | — | Insert mention into textarea |
| `loadLinkPreviews(container)` | async | Load link previews in post content |

---

## Post Reactions

| Function | Signature | Purpose |
|----------|-----------|---------|
| `togglePostReact(postId, emoji, btn)` | async | Toggle post reaction |
| `openPostReactPicker(postId, btn)` | async | Open emoji picker for post |
| `pickPostEmoji(postId, emoji, btn)` | async | Pick and apply emoji |
| `updateReactionsBar(bar, reactions, postId)` | — | Update reactions bar DOM |
| `reactionBarHtml(mid, reactions, cid)` | string | Render reaction bar |
| `getOrCreatePicker()` | — | Get or create emoji picker instance |
| `openPicker(mid, anchorEl)` | — | Open picker at position |
| `closePicker()` | — | Close picker |

---

## Comments

| Function | Signature | Purpose |
|----------|-----------|---------|
| `togCmts(id)` | async | Toggle comments visibility |
| `commentsHtml(postId, cmts)` | string | Render comments thread |
| `sendCmt(id)` | async | Submit comment |
| `toggleCommentLike(commentId, liked, btn)` | async | Toggle comment like |
| `startCommentReply(postId, commentId, username)` | — | Start reply to comment |

---

## Search

| Function | Signature | Purpose |
|----------|-----------|---------|
| `renderSearch(app, initQuery)` | async | Render search page |

---

## Notifications

| Function | Signature | Purpose |
|----------|-----------|---------|
| `renderNotifs(app)` | async | Render notifications page |
| `playNotifSound()` | — | Play notification sound |

---

## Chat (see also `public/pages/chat.js`)

| Function | Signature | Purpose |
|----------|-----------|---------|
| `renderChats(app)` | async | Render chat list |
| `renderChat(app, cid)` | async | Render single chat view |
| `chatRow(c, activeId)` | string | Chat list item HTML |
| `chatEmptyStateHtml(title, conv)` | string | Empty chat placeholder |
| `loadChats()` | async | Load chat list from API |
| `startChat(uid, username)` | async | Start DM with user |
| `acceptDmRequest(cid)` | async | Accept DM request |
| `declineDmRequest(cid)` | async | Decline DM request |
| `createGroup()` | async | Create group chat |
| `showCreateGroupModal()` | — | Open group creation modal |
| `sendMsg(cid)` | async | Send chat message |
| `msgHtml(m, prev, next)` | string | Single message HTML |
| `buildChatMessagesHtml(msgs, unreadCount, conv)` | string | Full message list HTML |
| `appendMessage(m)` | — | Append single message to DOM |
| `updateMessage(mid, content, edited_at)` | — | Update edited message |
| `removeMessage(mid)` | — | Remove deleted message |
| `startEditMsg(mid, cid)` | — | Enter edit mode for message |
| `submitEditMsg(mid, cid)` | async | Submit edited message |
| `cancelEditMsg(mid)` | — | Cancel message editing |
| `deleteMsg(mid, cid)` | async | Delete message |
| `forwardMsg(mid, cid)` | async | Open forward dialog |
| `doForwardMsg(mid, srcCid, targetCid, modal)` | async | Execute forward |
| `pinMessage(mid, cid)` | async | Pin message |
| `unpinMessage(cid)` | async | Unpin message |
| `copyMsgText(mid, modal)` | async | Copy message text |
| `scrollToPinned(msgId)` | — | Scroll to pinned message |
| `scrollToMsg(mid)` | — | Scroll to specific message |
| `jumpToMessage(mid, cid)` | async | Jump to message in chat |
| `highlightMsg(el)` | — | Highlight message temporarily |
| `startMsgReply(mid, text, btn)` | — | Start reply to message |
| `cancelMsgReply()` | — | Cancel reply |
| `openMsgMenu(btn)` | — | Open message context menu |
| `closeMsgMenuPopover()` | — | Close message context menu |
| `msgMenuRow(action, icon, label, attrs, danger)` | string | Menu row HTML |
| `showMsgDetails(mid, modal)` | — | Show message details modal |
| `toggleChatSearch(cid)` | — | Toggle chat search bar |
| `runChatSearch(cid)` | async | Execute chat search |
| `toggleChatMute(cid)` | async | Open mute dialog |
| `doChatMute(cid, hours, modal)` | async | Mute chat for N hours |
| `toggleChatPin(cid)` | async | Toggle pin conversation |
| `toggleChatArchive(cid, archivedNow)` | async | Toggle archive conversation |
| `toggleSaveMsg(mid, cid, savedNow)` | async | Toggle save message |
| `openSavedMessages(cid)` | async | Open saved messages panel |
| `toggleGroupMembers()` | — | Toggle group members panel |
| `addGroupMember(cid)` | async | Add member to group |
| `removeGroupMember(cid, uid, username)` | async | Remove member from group |
| `leaveGroupChat(cid)` | async | Leave group chat |
| `editGroupInfo(cid)` | async | Open group info editor |
| `saveGroupInfo(cid, modal)` | async | Save group info |
| `openUserInfoPanel(username)` | async | Open user info side panel |
| `closeUserInfoPanel()` | — | Close user info panel |
| `blockUserFromPanel(username)` | async | Block user from info panel |
| `openMediaGallery(cid)` | async | Open media gallery |
| `loadGalleryTab(tab, cid)` | async | Load gallery tab |
| `switchGalleryTab(btn, tab, cid)` | — | Switch gallery tab |
| `exportChat(cid)` | async | Export chat |
| `showTyping()` | — | Show typing indicator |
| `updateRealtimeStatus(disconnected)` | — | Update online/offline banner |
| `scrollChatToBottom()` | — | Scroll chat to bottom |
| `isNearBottom(threshold)` | bool | Check if viewport near bottom |
| `bindChatMentionAutocomplete(textarea, members)` | — | Chat mention autocomplete |
| `bindChatKeyboardShortcuts(cid)` | — | Chat keyboard shortcuts |
| `bindMsgFile()` | — | Bind file attachment to message composer |
| `bindChatDropAttach()` | — | Bind drag-and-drop attachment |
| `toggleChatAttach()` | — | Toggle attachment panel |
| `closeChatAttach()` | — | Close attachment panel |
| `formatLastSeen(isoTs)` | string | Format last seen timestamp |
| `parseChatDate(iso)` | — | Parse chat date |
| `chatDayKey(iso)` | string | Day key for date separator |
| `todayKey()` | string | Today key |
| `chatDateSeparatorHtml(iso)` | string | Date separator HTML |
| `formatChatMsgTime(iso)` | string | Message time format |
| `formatChatListTime(iso)` | string | Chat list time format |
| `sameMsgCluster(prev, m)` | bool | Check if messages cluster together |

---

## Chat — Voice Recording

| Function | Signature | Purpose |
|----------|-----------|---------|
| `initVoiceBtn(cid)` | — | Initialize voice record button |
| `startRecording(cid)` | async | Start voice recording |
| `stopRecording()` | — | Stop voice recording |
| `cancelRecording()` | — | Cancel recording |
| `setVoiceBtn(recording)` | — | Update voice button state |
| `showVoicePreview(cid, blob, mime)` | — | Show voice preview UI |
| `sendVoicePreview()` | async | Send voice message |
| `cancelVoicePreview()` | — | Cancel voice preview |
| `restartVoiceRecording()` | — | Re-record voice note |
| `sendVoiceMessage(cid, blob, mimeType)` | async | Send voice message directly |
| `stopRecordingPreview()` | — | Stop any active preview |

---

## Chat — Voice/Video Player

| Function | Signature | Purpose |
|----------|-----------|---------|
| `voicePlayerHtml(src, mid, fname, inChat)` | string | Voice player HTML |
| `vpToggle(id, src)` | async | Toggle voice player play/pause |
| `vpInit(audio)` | — | Initialize voice player |
| `vpUpdate(player, audio)` | — | Update player progress |
| `vpReset(player, audio)` | — | Reset player |
| `vpSeek(el, e)` | — | Seek in voice player |
| `vpPreviewToggle()` | — | Toggle preview player |
| `vpCycleSpeed(btn)` | — | Cycle playback speed |
| `vpStartWave(id, audio)` | — | Start waveform animation |
| `vpTimeUpdate(id)` | — | Update time display |
| `vpEnded(id)` | — | Handle playback ended |
| `vpFmt(s)` | string | Format seconds to mm:ss |
| `vpBars(seed)` | string | Generate waveform bars HTML |

---

## Drops (see also `public/pages/drops.js`)

| Function | Signature | Purpose |
|----------|-----------|---------|
| `renderDrops(app)` | async | Render drops page |
| `dropHtml(d)` | string | Single drop HTML |
| `dropComposerHtml()` | string | Drop composer HTML |
| `submitDrop()` | async | Submit new drop |
| `delDrop(id)` | async | Delete drop |
| `bindDropImg()` | — | Bind image upload to drop composer |

---

## Disk (File Storage)

| Function | Signature | Purpose |
|----------|-----------|---------|
| `renderDisk(app)` | async | Render disk page |
| `renderDiskBreadcrumb()` | — | Render breadcrumb |
| `renderDiskFiles()` | — | Render file list |
| `renderDiskInspector(folders, files)` | — | Inspector panel |
| `loadDiskFiles()` | async | Load disk files |
| `loadDiskFolder(folderId)` | async | Load folder contents |
| `loadDiskStats()` | async | Load storage stats |
| `setupDiskDropzone()` | — | Setup drag-and-drop upload |
| `uploadDiskFiles(fileList)` | async | Upload files |
| `deleteDiskFile(id, fromPreview)` | async | Delete file |
| `openDiskPreview(id)` | — | Open file preview |
| `closeDiskPreview(e)` | — | Close file preview |
| `openDiskEdit(id)` | async | Open file editor |
| `saveDiskEdit(id)` | async | Save file edit |
| `toggleDiskPublicLink(id)` | async | Toggle public link |
| `createDiskFolder()` | async | Create folder |
| `deleteDiskFolder(id)` | async | Delete folder |
| `diskCreateFolderPrompt()` | async | Prompt for folder name |
| `toggleDiskSelectMode()` | — | Toggle bulk select mode |
| `toggleDiskSelect(id)` | — | Toggle file selection |
| `updateDiskBulkBar()` | — | Update bulk action bar |
| `bulkDeleteDisk()` | async | Bulk delete files |
| `downloadDiskZip()` | async | Download selected as ZIP |
| `diskItemClick(id)` | — | Handle item click |
| `diskNavPreview(dir)` | — | Navigate preview |
| `setDiskView(v)` | — | Toggle grid/list view |
| `setDiskFilter(f)` | — | Set file type filter |
| `setDiskSort(field)` | — | Set sort field |
| `updateDiskSortUI()` | — | Update sort UI |
| `setDiskSearch(v)` | — | Set search query |
| `diskThumbHtml(f)` | string | File thumbnail HTML |
| `diskFolderCardHtml(folder)` | string | Folder card HTML |
| `diskFolderRowHtml(folder)` | string | Folder row HTML |
| `diskCardHtml(f)` | string | File card HTML |
| `diskRowHtml(f)` | string | File row HTML |
| `diskFileType(mime, name)` | string | Detect file type |

---

## Disk — Audio Player

| Function | Signature | Purpose |
|----------|-----------|---------|
| `initDiskPlayer(audioPath, wfId, fileSize)` | async | Initialize player |
| `diskPlayPause()` | — | Toggle play/pause |
| `diskSeekBar(e)` | — | Seek in track |
| `diskToggleMute()` | — | Toggle mute |
| `diskSetVolume(val)` | — | Set volume |
| `_diskPlayerTick()` | — | Player update tick |
| `_diskDrawWf(canvas, peaks, progress)` | — | Draw waveform |

---

## Admin

| Function | Signature | Purpose |
|----------|-----------|---------|
| `renderAdmin(app)` | async | Render admin dashboard |
| `adminSwitch(tab)` | — | Switch admin tab |
| `loadAdminTab()` | async | Load admin tab content |
| `adminDiagRefresh()` | async | Refresh diagnostics |
| `adminEnqueueNoopJob()` | async | Enqueue test job |
| `adminResolveReport(rid)` | async | Resolve report |
| `adminUserRow(u)` | string | User row HTML |
| `adminFilterUsers()` | — | Filter users list |
| `adminBan(uid, username, isBanned)` | async | Ban/unban user |
| `adminCreateUser()` | async | Create user |
| `adminResetPass(uid, username)` | async | Reset user password |
| `adminRevokeSessions(uid, username)` | async | Revoke user sessions |
| `adminPromote(uid, username, isAdmin)` | async | Promote/demote user |
| `adminVerify(uid, username, isVerified, currentBadge)` | async | Verify user |
| `adminApproveVerify(reqId)` | async | Approve verification request |
| `adminRejectVerify(reqId)` | async | Reject verification request |
| `adminDeleteUser(uid, username)` | async | Delete user |
| `adminDelDrop(id)` | async | Delete drop |

---

## Hub

| Function | Signature | Purpose |
|----------|-----------|---------|
| `renderHub(app)` | async | Render hub page |
| `saveHubKey(platformId)` | async | Save API key |
| `refreshHubExternal()` | async | Refresh external services |

---

## Reporting

| Function | Signature | Purpose |
|----------|-----------|---------|
| `showReportMenu(postId, btn)` | — | Open report menu |
| `submitReport(type, id, reason)` | async | Submit report |
| `showMessageReport(mid, modal)` | — | Open message report form |
| `submitMessageReport(mid, reason, modal)` | async | Submit message report |

---

## SSE / Events

| Function | Signature | Purpose |
|----------|-----------|---------|
| `initEvents()` | — | Initialize SSE connection |
| `updateTicks()` | — | Update read receipts |

---

## Image / Media

| Function | Signature | Purpose |
|----------|-----------|---------|
| `isHeic(file)` | bool | Check if file is HEIC |
| `maybeConvertHeic(file)` | async | Convert HEIC to JPEG |
| `compressImage(file, maxMB)` | Promise | Compress image below max MB |
| `loadHeic2Any()` | — | Lazy load HEIC converter |
| `selectTrack(prefix)` | — | Open track URL input |
