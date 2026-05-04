// ── VERSION ──
const APP_VERSION = '0.9.16';

// ── IMAGE LIGHTBOX ──
function openImg(src) {
  const lb = document.createElement('div');
  lb.id = 'lightbox';
  lb.innerHTML = `<div class="lb-backdrop"></div><img class="lb-img" src="${src}" alt="">`;
  document.body.appendChild(lb);
  requestAnimationFrame(() => lb.classList.add('lb-in'));
  const close = () => {
    lb.classList.remove('lb-in');
    lb.addEventListener('transitionend', () => lb.remove(), { once: true });
  };
  lb.querySelector('.lb-backdrop').addEventListener('click', close);
  lb.querySelector('.lb-img').addEventListener('click', e => e.stopPropagation());
  document.addEventListener('keydown', function esc(e) {
    if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); }
  });
  // swipe to close on mobile
  let _tsX = 0, _tsY = 0;
  lb.addEventListener('touchstart', e => { _tsX = e.touches[0].clientX; _tsY = e.touches[0].clientY; }, { passive: true });
  lb.addEventListener('touchend', e => {
    const dx = Math.abs(e.changedTouches[0].clientX - _tsX);
    const dy = Math.abs(e.changedTouches[0].clientY - _tsY);
    if (dx > 50 || dy > 60) close();
  });
}

// ── SMOKE TRANSITION ──
function smokeTransition() {
  const W = window.innerWidth, H = window.innerHeight;
  const overlay = document.createElement('div');
  overlay.style.cssText = `position:fixed;inset:0;z-index:9998;pointer-events:none;opacity:0;transition:opacity .25s ease`;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%';
  overlay.appendChild(canvas);
  document.body.appendChild(overlay);

  requestAnimationFrame(() => { overlay.style.opacity = '1'; });

  const ctx = canvas.getContext('2d');

  class Puff {
    constructor(delay = 0) {
      this.delay = delay;
      this.reset();
    }
    reset() {
      this.x = W * (0.35 + Math.random() * 0.3);
      this.y = H * (0.55 + Math.random() * 0.25);
      this.r  = 12 + Math.random() * 24;
      this.vx = (Math.random() - 0.5) * 0.5;
      this.vy = -(0.5 + Math.random() * 0.9);
      this.a  = 0.09 + Math.random() * 0.11;
      this.life = -this.delay;
      this.maxLife = 100 + Math.random() * 60;
    }
    tick() { this.life++; if (this.life < 0) return; this.x += this.vx; this.y += this.vy; this.r += 0.25; this.vx += (Math.random() - 0.5) * 0.06; }
    draw() {
      if (this.life < 0) return;
      const t = this.life / this.maxLife;
      const alpha = this.a * (t < 0.15 ? t / 0.15 : 1 - t);
      if (alpha <= 0) return;
      const g = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.r);
      g.addColorStop(0, `rgba(200,192,184,${alpha})`);
      g.addColorStop(0.5, `rgba(140,130,120,${alpha * 0.5})`);
      g.addColorStop(1, `rgba(80,75,70,0)`);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2); ctx.fill();
    }
    done() { return this.life >= this.maxLife; }
  }

  const puffs = Array.from({length: 22}, (_, i) => new Puff(i * 4));
  let frame = 0;
  const TOTAL = 110;

  (function loop() {
    ctx.clearRect(0, 0, W, H);
    puffs.forEach(p => { p.tick(); p.draw(); if (p.done()) p.reset(); });
    frame++;
    if (frame < TOTAL) {
      requestAnimationFrame(loop);
    } else {
      overlay.style.transition = 'opacity .55s ease';
      overlay.style.opacity = '0';
      overlay.addEventListener('transitionend', () => overlay.remove(), { once: true });
    }
  })();
}

// ── STATE ──
let me = null;
let csrfToken = '';
let page = 'discover';
let pageParam = null;
const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);
const esc = s => { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; };
const ICON_CUT = '/icons_cut';
/** PNG from /icons_cut/{name}.png — filenames are allowlisted alphanumeric + hyphen */
function iconCut(name, cls = 'ui-icon', w = 20, h = 20) {
  const safe = String(name).replace(/[^a-z0-9-]/gi, '');
  return `<img class="${esc(cls)}" src="${ICON_CUT}/${safe}.png" alt="" width="${w}" height="${h}" decoding="async" aria-hidden="true">`;
}
function likeIconHtml(liked, w = 16, h = 16) {
  return iconCut(liked ? 'like-filled' : 'like', 'ui-icon', w, h);
}
function bookmarkIconHtml(bookmarked, w = 16, h = 16) {
  return iconCut(bookmarked ? 'bookmark-filled' : 'bookmark', 'ui-icon', w, h);
}
function playPauseIconHtml(playing, w = 16, h = 16) {
  return iconCut(playing ? 'pause' : 'play', 'ui-icon', w, h);
}
/** DM read receipts (delivered / read) */
function msgTickIcons(isRead) {
  const one = iconCut('check', 'ui-icon msg-tick-ic', 10, 10);
  return isRead ? `<span class="msg-tick-icons">${one}${one}</span>` : `<span class="msg-tick-icons">${one}</span>`;
}
/** Centered page heading with icons_cut (text is escaped). */
function pageTitleIc(icon, text, iw = 15, ih = 15) {
  return `<div class="page-title page-title--ic">${iconCut(icon, 'ui-icon page-title-ic', iw, ih)}${esc(text)}</div>`;
}
/** Same as pageTitleIc but trailing HTML is already safe (e.g. escaped fragments). */
function pageTitleIcRaw(icon, htmlAfterIcon, iw = 15, ih = 15) {
  return `<div class="page-title page-title--ic">${iconCut(icon, 'ui-icon page-title-ic', iw, ih)}${htmlAfterIcon}</div>`;
}

function opiumCoreHero(mode = 'feed') {
  const authed = !!me;
  const eyebrow = authed ? `@${esc(me.username || 'w0pium')}` : 'invite-only / opium core';
  const title = mode === 'auth' ? 'WOPIUM' : 'CORE';
  const copy = authed
    ? 'private feed, direct messages, drops and disk in one quiet place.'
    : 'closed social space for posts, drops, chats and files. minimal, invite-only, signal over noise.';
  const actions = authed
    ? `<button class="btn btn-sm btn-ic-row" data-post-action="go-chats">${iconCut('comment', 'ui-icon', 14, 14)}DM</button>
       <button class="btn btn-sm btn-ghost btn-ic-row" data-post-action="go-disk">${iconCut('disk', 'ui-icon', 14, 14)}DISK</button>
       <button class="btn btn-sm btn-ghost btn-ic-row" data-post-action="go-discover">${iconCut('search', 'ui-icon', 14, 14)}DISCOVER</button>`
    : `<button class="btn btn-sm btn-ic-row" data-post-action="go-register">${iconCut('add', 'ui-icon', 14, 14)}SIGN UP</button>
       <button class="btn btn-sm btn-ghost btn-ic-row" data-post-action="go-login">${iconCut('lock', 'ui-icon', 14, 14)}LOGIN</button>`;
  return `
    <section class="opium-hero opium-hero--${esc(mode)}">
      <div class="opium-hero-mark">W<span class="logo-zero">Ø</span></div>
      <div class="opium-hero-body">
        <div class="opium-kicker">${eyebrow}</div>
        <h1>${title}</h1>
        <p>${copy}</p>
        <div class="opium-hero-actions">${actions}</div>
      </div>
    </section>`;
}

function opiumCommandStrip(active = '') {
  const items = [
    ['feed', 'home', 'Feed', 'go-feed'],
    ['chats', 'comment', 'DM', 'go-chats'],
    ['discover', 'search', 'Discover', 'go', 'discover'],
    ['drops', 'media', 'Drops', 'go', 'drops'],
    ['disk', 'disk', 'Disk', 'go-disk'],
    ['search', 'search', 'Search', 'go', 'search'],
  ];
  return `<div class="opium-command-strip">${items.map(([id, icon, label, action, navPage]) =>
    `<button class="opium-command${active === id ? ' active' : ''}" data-post-action="${action}"${navPage ? ` data-nav-target="${navPage}"` : ''}>${iconCut(icon, 'ui-icon', 13, 13)}<span>${label}</span></button>`
  ).join('')}</div>`;
}

function opiumMetricCards(cards) {
  return `<div class="opium-metric-grid">${cards.map(c => `
    <div class="opium-metric-card">
      <span>${esc(c.label)}</span>
      <strong>${esc(String(c.value))}</strong>
      <em>${esc(c.note || '')}</em>
    </div>`).join('')}</div>`;
}
/** Nav / toolbar: icon + text */
function navInner(iconName, text, iw = 14, ih = 14) {
  if (!iconName) return esc(text);
  return `<span class="nav-item-inner">${iconCut(iconName, 'nav-icon-img', iw, ih)}<span class="nav-item-text">${esc(text)}</span></span>`;
}
const sameId = (a, b) => String(a ?? '') === String(b ?? '');
// Safe URL helper to prevent javascript: URI injection
// Accepts only http and https schemes. Returns '#' for invalid or unsafe URLs.
function safeUrl(u) {
  try {
    const parsed = new URL(u);
    return ['http:', 'https:'].includes(parsed.protocol) ? u : '#';
  } catch {
    return '#';
  }
}
// Chat state
let msgPoll = null;
let lastMsgTime = '';
let eventSrc = null;
let chatsCache = [];
let chatListShowArchived = false;
let currentChatId = null;
let chatOtherLastRead = null;
let typingTimer = null;
let replyToMsg = null; // { id, text }
let chatPinnedMsg = null;
let realtimeDisconnected = false;
let chatSidebarFilters = { unread: false, muted: false, pinned: false, archived: false };
let pendingChatQueue = [];
const CHAT_VIRTUAL_WINDOW = 180;
const CHAT_VIRTUAL_CHUNK = 120;

try {
  pendingChatQueue = JSON.parse(localStorage.getItem('pending_chat_queue') || '[]');
  if (!Array.isArray(pendingChatQueue)) pendingChatQueue = [];
} catch { pendingChatQueue = []; }

function persistPendingChatQueue() {
  try { localStorage.setItem('pending_chat_queue', JSON.stringify(pendingChatQueue.slice(-50))); } catch {}
}

function chatIsMuted(c) {
  return !!(c?.muted_until && new Date(c.muted_until) > new Date());
}

function chatIsPinned(c) {
  return !!(c?.pinned_at);
}

function sortChatsForSidebar(list = []) {
  return [...list].sort((a, b) => {
    const ap = chatIsPinned(a) ? 1 : 0;
    const bp = chatIsPinned(b) ? 1 : 0;
    if (ap !== bp) return bp - ap;
    const at = new Date(a?.last?.created_at || a?.updated_at || 0).getTime();
    const bt = new Date(b?.last?.created_at || b?.updated_at || 0).getTime();
    return bt - at;
  });
}

function updateRealtimeStatus(disconnected) {
  realtimeDisconnected = !!disconnected;
  const bar = document.getElementById('realtimeStatusBar');
  if (!bar) return;
  bar.classList.toggle('hidden', !realtimeDisconnected);
  if (realtimeDisconnected) {
    bar.textContent = 'Плохое соединение: переподключаем realtime...';
  } else if (pendingChatQueue.length) {
    bar.textContent = `В очереди: ${pendingChatQueue.length} сообщ. (клик: отправить)`;
    bar.classList.remove('hidden');
  }
}

function setComposerStatus(text = '', kind = '') {
  const nameEl = document.getElementById('msgFileName');
  if (!nameEl) return;
  nameEl.textContent = text;
  nameEl.classList.remove('status-ok', 'status-err', 'status-pending');
  if (kind === 'ok') nameEl.classList.add('status-ok');
  if (kind === 'err') nameEl.classList.add('status-err');
  if (kind === 'pending') nameEl.classList.add('status-pending');
}

function updateChatSendReady() {
  const sendBtn = document.getElementById('msgSendBtn');
  if (!sendBtn) return;
  const hasText = !!document.getElementById('msgText')?.value.trim();
  const hasFile = !!(document.getElementById('msgImgFile')?.files?.[0] || document.getElementById('msgFile')?.files?.[0]);
  sendBtn.classList.toggle('is-ready', hasText || hasFile);
}

function sendMessageWithProgress(cid, formData, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api/chats/${cid}/messages`);
    if (csrfToken) xhr.setRequestHeader('X-CSRF-Token', csrfToken);
    xhr.upload.onprogress = e => {
      if (e.lengthComputable && typeof onProgress === 'function') {
        const p = Math.round((e.loaded / e.total) * 100);
        onProgress(p);
      }
    };
    xhr.onerror = () => reject(new Error('Network error'));
    xhr.onload = () => {
      let data = {};
      try { data = JSON.parse(xhr.responseText || '{}'); } catch {}
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else reject(new Error(data.error || 'Error'));
    };
    xhr.send(formData);
  });
}

// ── THEME ──
function applyTheme(theme) {
  document.documentElement.classList.toggle('light', theme === 'light');
  localStorage.setItem('theme', theme);
}
function toggleTheme() {
  const current = document.documentElement.classList.contains('light') ? 'light' : 'dark';
  applyTheme(current === 'light' ? 'dark' : 'light');
  renderNav();
}
// Apply saved theme on load
(function() {
  const saved = localStorage.getItem('theme');
  if (saved === 'light') document.documentElement.classList.add('light');
})();

// UX state
let dirtySettings = false;
let pushSubscription = null;
let pendingVerifyUsername = null;

// Voice recording state
let mediaRecorder = null;
let audioChunks = [];
let recordingSeconds = 0;
let recordingInterval = null;
let recordingCancelled = false;
// Voice UX state
let vrWantPreview = false;   // show preview after stop
let vrPreviewBlob = null;    // stored blob for preview send

// Repost menu
let _repostMenuEl = null;
let _reportMenuEl = null;

// Reaction picker state
const ALLOWED_EMOJI = ['🖤','💀','🥀','👁️','🌹','🔮'];
let _pickerEl = null;
let _pickerMid = null;

// Infinite scroll state for feed and discover
let feedOffset = 0;
let feedLimit = 20;
let feedDone = false;
let feedFetching = false;
let discOffset = 0;
let discLimit = 20;
let discDone = false;
let discFetching = false;

/**
 * Initialize Server-Sent Events connection for real-time chat updates.
 * Called after successful authentication. If a connection already exists, it
 * will be closed and reopened. Listens for 'message', 'edit', 'delete',
 * 'typing' and 'chat_invite' events.
 */
function initEvents() {
  if (eventSrc) {
    try { eventSrc.close(); } catch {}
  }
  eventSrc = new EventSource('/api/events');
  eventSrc.onopen = () => {
    updateRealtimeStatus(false);
  };
  eventSrc.addEventListener('message', async e => {
    const data = JSON.parse(e.data);
    // If we are currently viewing this chat, append message
    if (page === 'chat' && currentChatId === data.conv_id) {
      appendMessage(data);
      // Play notification sound for incoming messages
      if (!document.hidden && !sameId(data.sender_id, me?.id)) playNotifSound();
    } else {
      // Update unread badge
      if (me) { me.unread_chats = (me.unread_chats || 0) + 1; renderNav(); }
      // Otherwise, refresh chat list to update unread counts
      await loadChats();
    }
  });
  eventSrc.addEventListener('edit', e => {
    const data = JSON.parse(e.data);
    if (page === 'chat' && currentChatId === data.conv_id) {
      updateMessage(data.id, data.content, data.edited_at);
    }
  });
  eventSrc.addEventListener('delete', e => {
    const data = JSON.parse(e.data);
    if (page === 'chat' && currentChatId === data.conv_id) {
      removeMessage(data.id);
    }
  });
  eventSrc.addEventListener('typing', e => {
    const data = JSON.parse(e.data);
    if (page === 'chat' && currentChatId === data.conv_id && !sameId(data.user_id, me?.id)) {
      showTyping();
    }
  });
  eventSrc.addEventListener('chat_invite', async e => {
    // new chat created or user added to chat
    await loadChats();
  });
  eventSrc.addEventListener('reaction', e => {
    const data = JSON.parse(e.data);
    if (page === 'chat' && currentChatId === data.conv_id) {
      applyReactions(data.msg_id, data.reactions);
    }
  });
  eventSrc.addEventListener('msg_read', e => {
    const data = JSON.parse(e.data);
    if (page === 'chat' && currentChatId === data.conv_id) {
      chatOtherLastRead = data.last_read;
      updateTicks();
    }
  });
  eventSrc.addEventListener('dm_request', async () => {
    await loadChats();
    if (page === 'chats') toast('Новый запрос на переписку');
  });
  eventSrc.addEventListener('dm_accepted', async e => {
    const data = JSON.parse(e.data);
    await loadChats();
    if (page === 'chat' && currentChatId === data.conv_id) {
      renderChat(document.getElementById('app'), data.conv_id);
    }
  });
  eventSrc.addEventListener('new_report', async () => {
    if (page === 'admin') loadAdminTab();
    if (me?.is_admin) toast('Новая жалоба');
  });
  eventSrc.addEventListener('notif', () => {
    if (me) { me.notif_count = (me.notif_count || 0) + 1; renderNav(); }
  });
  eventSrc.addEventListener('notifs_read', () => {
    if (me) { me.notif_count = 0; renderNav(); }
  });
  eventSrc.addEventListener('follow_request', () => {
    if (me) { me.notif_count = (me.notif_count || 0) + 1; renderNav(); }
  });
  eventSrc.addEventListener('chat_removed', e => {
    const data = JSON.parse(e.data);
    loadChats();
    if (page === 'chat' && currentChatId === data.conv_id) { go('chats'); toast('Тебя удалили из группы'); }
  });
  eventSrc.addEventListener('verify_approved', async e => {
    const data = JSON.parse(e.data);
    me = await api('/me'); csrfToken = me.csrf_token || ''; renderNav();
    toast.success(`Верификация одобрена${data.badge_type ? ': ' + data.badge_type : ''}`);
  });
  eventSrc.addEventListener('verify_rejected', e => {
    const data = JSON.parse(e.data);
    toast.error(`Верификация отклонена${data.reason ? ': ' + data.reason : ''}`);
  });
  eventSrc.addEventListener('post_published', () => {
    // Refresh feed if on feed page
    if (page === 'feed') renderFeed(document.getElementById('app'));
    toast('Запланированный пост опубликован!');
  });
  eventSrc.addEventListener('group_updated', e => {
    const data = JSON.parse(e.data);
    if (data.conv_id === currentChatId) {
      if (data.title) {
        const el = document.querySelector('.chat-title');
        if (el) el.textContent = data.title;
      }
    }
    // Refresh chat list
    if (document.getElementById('chatList')) renderChats(document.getElementById('app'));
  });
  eventSrc.addEventListener('pin_update', e => {
    const data = JSON.parse(e.data);
    if (data.conv_id === currentChatId) {
      const bar = document.getElementById('pinnedBar');
      if (data.msg_id && data.preview) {
        if (bar) {
          bar.querySelector('span').textContent = data.preview;
        } else {
          renderChat(document.getElementById('app'), currentChatId);
        }
      } else {
        bar?.remove();
      }
    }
  });
  eventSrc.addEventListener('mention', e => {
    const data = JSON.parse(e.data);
    if (data.conv_id !== currentChatId) {
      toast('Тебя упомянули в чате');
    }
  });
  eventSrc.onerror = () => {
    updateRealtimeStatus(true);
    eventSrc.close();
    eventSrc = null;
    setTimeout(initEvents, 3000);
  };
}

/**
 * Refresh the chat list from the server and update the chats page if it's active.
 */
async function loadChats() {
  try {
    const chats = await api(chatListShowArchived ? '/chats?archived=1' : '/chats');
    chatsCache = chats;
    if (page === 'chats') {
      const app = document.getElementById('app');
      const accepted = chats.filter(c => c.my_accepted !== false);
      const pending = chatListShowArchived ? [] : chats.filter(c => c.my_accepted === false);
      let html = `${opiumCommandStrip('chats')}${opiumMetricCards([
        { label: 'dialogs', value: accepted.length, note: 'active threads' },
        { label: 'requests', value: pending.length, note: 'pending inbox' },
        { label: 'archive', value: chatListShowArchived ? 'open' : 'hidden', note: 'stored chats' },
      ])}<div class="page-title-row"><span class="page-title page-title--ic">${iconCut('comment', 'ui-icon page-title-ic', 15, 15)}DM</span><div class="page-title-actions"><button class="btn btn-sm btn-ghost btn-ic-pad${chatListShowArchived ? ' active' : ''}" data-post-action="toggle-chat-list-archive" title="Архив">${iconCut('disk', 'ui-icon', 15, 15)} АРХИВ</button><button class="btn btn-sm btn-ghost btn-ic-pad" data-post-action="show-create-group-modal" title="Новая группа">${iconCut('add', 'ui-icon', 15, 15)} ГРУППА</button></div></div>`;
      if (!chatListShowArchived && pending.length) {
        html += `<div class="dm-section-title">ЗАПРОСЫ (${pending.length})</div>` + pending.map(chatRow).join('');
      }
      html += accepted.length ? accepted.map(chatRow).join('') : `<div class="empty">${chatListShowArchived ? 'Архив пуст' : 'Нет диалогов'}</div>`;
      app.innerHTML = html;
    } else {
      renderNav();
    }
  } catch {}
}

/**
 * Append a new message to the current chat view.
 */
function appendMessage(m) {
  const cont = document.getElementById('chatMsgs');
  if (!cont) return;
  if (Array.isArray(window._chatAllMsgs)) window._chatAllMsgs.push(m);
  const lastEl = [...cont.querySelectorAll('.msg[data-id]')].pop();
  const prev = lastEl
    ? { sender_id: lastEl.dataset.sender, deleted_at: null, created_at: lastEl.dataset.created }
    : null;
  if (lastEl && chatDayKey(m.created_at) !== chatDayKey(lastEl.dataset.created)) {
    cont.insertAdjacentHTML('beforeend', chatDateSeparatorHtml(m.created_at));
  }
  cont.insertAdjacentHTML('beforeend', msgHtml(m, prev, null));
  loadLinkPreviews(cont).catch(() => {});
  if (isNearBottom()) {
    scrollChatToBottom();
  } else {
    const btn = document.getElementById('scrollDownBtn');
    if (btn) {
      btn.classList.remove('hidden');
      const badge = btn.querySelector('.scroll-down-badge');
      const cur = badge ? parseInt(badge.textContent, 10) || 0 : 0;
      btn.innerHTML = `${iconCut('back', 'ui-icon ui-icon--scroll-rot', 18, 18)}<span class="scroll-down-badge">${cur + 1}</span>`;
    }
  }
}

function isNearBottom(threshold = 100) {
  const el = document.getElementById('chatMsgs');
  if (!el) return true;
  return el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
}

/**
 * Update an existing message text and mark as edited.
 */
function updateMessage(mid, content, edited_at) {
  const el = document.querySelector(`.msg[data-id="${mid}"]`);
  if (!el) return;
  // find text container
  const body = el.querySelector('.msg-body');
  if (!body) return;
  // rebuild message body: note that attachments remain untouched
  const parts = [];
  if (content) parts.push(`<div class="msg-text">${esc(content)}</div>`);
  // check for attachment
  if (el.dataset.file && el.dataset.fileType) {
    const file = el.dataset.file;
    const type = el.dataset.fileType;
    if (type.startsWith('image/')) {
      parts.push(`<div class="msg-img"><img src="${esc(file)}" loading="lazy" alt=""></div>`);
    } else {
      const label = type.split('/')[1] || 'file';
      parts.push(`<div class="msg-file"><a href="${esc(file)}" target="_blank">[${label}]</a></div>`);
    }
  }
  const created = el.dataset.created;
  const timeTitle = timeAgo(edited_at || new Date().toISOString());
  let timeLabel = formatChatMsgTime(created || edited_at) + ' · изм.';
  if (el.classList.contains('me')) {
    const isRead = chatOtherLastRead && new Date(chatOtherLastRead) >= new Date(el.dataset.created || 0);
    parts.push(`<div class="msg-time" title="${esc(timeTitle)}">${timeLabel}<span class="msg-tick${isRead ? ' read' : ''}">${msgTickIcons(isRead)}</span></div>`);
  } else {
    parts.push(`<div class="msg-time" title="${esc(timeTitle)}">${timeLabel}</div>`);
  }
  const existingBar = body.querySelector('.reaction-bar');
  body.innerHTML = parts.join('');
  if (existingBar) body.appendChild(existingBar);
}

/**
 * Mark a message as deleted in the UI.
 */
function removeMessage(mid) {
  const el = document.querySelector(`.msg[data-id="${mid}"]`);
  if (!el) return;
  const body = el.querySelector('.msg-body');
  if (!body) return;
  body.innerHTML = '<div class="msg-text msg-text--deleted">[удалено]</div>';
}

function startEditMsg(mid, cid) {
  const el = document.querySelector(`.msg[data-id="${mid}"]`);
  const textEl = el?.querySelector('.msg-text');
  if (!el || !textEl) return;
  const current = textEl.textContent;
  const body = el.querySelector('.msg-body');
  const bar = body.querySelector('.reaction-bar');
  body.innerHTML = `
      <div class="msg-edit-wrap">
      <input class="input msg-edit-input" id="editInput-${mid}" value="${esc(current)}">
      <div class="msg-edit-actions">
        <button class="btn-ghost" data-post-action="cancel-edit-msg" data-msg-id="${mid}" aria-label="Отмена">${iconCut('close', 'ui-icon', 16, 16)}</button>
        <button class="btn btn-sm" data-post-action="submit-edit-msg" data-msg-id="${mid}" data-conv-id="${cid}" aria-label="Сохранить">${iconCut('check', 'ui-icon', 16, 16)}</button>
      </div>
    </div>
  `;
  if (bar) body.appendChild(bar);
  const inp = document.getElementById(`editInput-${mid}`);
  inp?.focus();
  inp?.addEventListener('keydown', e => {
    if (e.key === 'Enter') submitEditMsg(mid, cid);
    if (e.key === 'Escape') cancelEditMsg(mid);
  });
}

async function submitEditMsg(mid, cid) {
  const inp = document.getElementById(`editInput-${mid}`);
  const content = (inp?.value || '').trim();
  if (!content) return;
  try {
    const now = new Date().toISOString();
    await api(`/chats/${cid}/messages/${mid}`, { method: 'PUT', body: { content } });
    updateMessage(mid, content, now);
    // SSE 'edit' also updates UI for other members
  } catch {}
}

function cancelEditMsg(mid) {
  // Re-render chat to restore original message
  renderChat($('#app'), currentChatId);
}

async function deleteMsg(mid, cid) {
  try {
    await api(`/chats/${cid}/messages/${mid}`, { method: 'DELETE' });
    removeMessage(mid);
    // SSE 'delete' also updates UI for other members
  } catch {}
}

/**
 * Show typing indicator for a short duration.
 */
function showTyping() {
  const msgs = document.getElementById('chatMsgs');
  if (!msgs) return;
  let ind = document.getElementById('typingIndicator');
  if (!ind) {
    ind = document.createElement('div');
    ind.id = 'typingIndicator';
    ind.className = 'typing-indicator';
    msgs.appendChild(ind);
  }
  ind.innerHTML = `<div class="typing-bubble"><span></span><span></span><span></span></div>`;
  const atBottom = msgs.scrollHeight - msgs.scrollTop - msgs.clientHeight < 120;
  if (atBottom) scrollChatToBottom();
  clearTimeout(typingTimer);
  typingTimer = setTimeout(() => { ind?.remove(); }, 3000);
}

// ── CANVAS PARTICLES ──
(function initCanvas() {
  const c = document.getElementById('bg');
  if (!c) return;
  const ctx = c.getContext('2d');
  let W, H, dots = [];
  const COUNT = 35; // reduced for Synology performance

  function resize() {
    W = c.width = window.innerWidth;
    H = c.height = window.innerHeight;
  }
  window.addEventListener('resize', resize, { passive: true });
  resize();

  for (let i = 0; i < COUNT; i++) {
    dots.push({
      x: Math.random() * W,
      y: Math.random() * H,
      vx: (Math.random() - 0.5) * 0.25,
      vy: (Math.random() - 0.5) * 0.25,
      r: Math.random() * 1.1 + 0.3,
      a: Math.random() * 0.35 + 0.08,
    });
  }

  const LINK_DIST2 = 110 * 110; // squared — avoids sqrt in hot loop
  let raf = null;
  let paused = false;

  function draw() {
    if (paused) return;
    ctx.clearRect(0, 0, W, H);
    for (let i = 0; i < dots.length; i++) {
      const d = dots[i];
      d.x += d.vx; d.y += d.vy;
      if (d.x < 0) d.x = W; else if (d.x > W) d.x = 0;
      if (d.y < 0) d.y = H; else if (d.y > H) d.y = 0;
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,255,255,${d.a})`;
      ctx.fill();
      for (let j = i + 1; j < dots.length; j++) {
        const d2 = dots[j];
        const dx = d.x - d2.x, dy = d.y - d2.y;
        const dist2 = dx * dx + dy * dy;
        if (dist2 < LINK_DIST2) {
          const t = 1 - dist2 / LINK_DIST2;
          ctx.beginPath();
          ctx.moveTo(d.x, d.y);
          ctx.lineTo(d2.x, d2.y);
          ctx.strokeStyle = `rgba(255,255,255,${0.04 * t})`;
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
      }
    }
    raf = requestAnimationFrame(draw);
  }

  document.addEventListener('visibilitychange', () => {
    paused = document.hidden;
    if (!paused && !raf) raf = requestAnimationFrame(draw);
  });

  raf = requestAnimationFrame(draw);
})();

// ── API ──
async function api(path, opts = {}) {
  const o = { headers: { 'Content-Type': 'application/json', ...opts.headers }, ...opts };
  if (o.method && o.method !== 'GET' && csrfToken) o.headers['X-CSRF-Token'] = csrfToken;
  if (o.body && typeof o.body !== 'string' && !(o.body instanceof FormData)) o.body = JSON.stringify(o.body);
  if (o.body instanceof FormData) delete o.headers['Content-Type'];
  const r = await fetch('/api' + path, o);
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || 'Error');
  return d;
}

// ── PWA INSTALL HINT ──
let _pwaPrompt = null;
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  _pwaPrompt = e;
  // Show subtle install hint in nav after a short delay
  setTimeout(() => {
    if (_pwaPrompt) showPwaHint();
  }, 3000);
});
window.addEventListener('appinstalled', () => {
  _pwaPrompt = null;
  document.getElementById('pwaHint')?.remove();
});

function showPwaHint() {
  if (document.getElementById('pwaHint')) return;
  const hint = document.createElement('span');
  hint.id = 'pwaHint';
  hint.className = 'pwa-hint';
  hint.textContent = 'DN INSTALL';
  hint.title = 'Установить приложение';
  hint.onclick = async () => {
    if (!_pwaPrompt) return;
    _pwaPrompt.prompt();
    const { outcome } = await _pwaPrompt.userChoice;
    if (outcome === 'accepted') { _pwaPrompt = null; hint.remove(); }
  };
  const nav = document.getElementById('navLinks');
  if (nav) nav.appendChild(hint);
}

// ── INIT ──
async function init() {
  document.querySelectorAll('.msg-menu-overlay').forEach(el => el.remove());
  closeMsgMenuPopover();
  initUiDelegates();
  // inject link preview styles
  if (!document.getElementById('lp-styles')) {
    const s = document.createElement('style');
    s.id = 'lp-styles';
    s.textContent = `.link-preview-card{display:flex;gap:12px;border:1px solid var(--border,#222);border-radius:8px;overflow:hidden;text-decoration:none;color:inherit;background:var(--card-bg,#111);margin-top:8px}.link-preview-img{width:100px;min-width:100px;height:75px;object-fit:cover}.link-preview-text{padding:8px;flex:1;min-width:0}.link-preview-site{font-size:11px;color:var(--muted,#666);text-transform:uppercase;margin-bottom:2px}.link-preview-title{font-size:13px;font-weight:600;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}.link-preview-desc{font-size:12px;color:var(--muted,#888);margin-top:4px;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}`;
    document.head.appendChild(s);
  }
  // inject post reactions styles
  if (!document.getElementById('pr-styles')) {
    const s = document.createElement('style');
    s.id = 'pr-styles';
    s.textContent = `.reaction-btn{background:var(--card-bg,#111);border:1px solid var(--border,#222);border-radius:20px;padding:2px 8px;cursor:pointer;font-size:14px;color:inherit;display:inline-flex;align-items:center;gap:4px}.reaction-btn.me{border-color:var(--accent,#7c3aed);background:var(--accent-dim,#1e1033)}.reaction-add-btn-post{background:none;border:1px solid var(--border,#222);border-radius:20px;padding:2px 8px;cursor:pointer;color:var(--muted,#888);font-size:14px}.post-reactions-bar{display:flex;flex-wrap:wrap;gap:4px;margin-top:6px;align-items:center}`;
    document.head.appendChild(s);
  }
  try { me = await api('/me'); if (me) csrfToken = me.csrf_token || ''; } catch { me = null; }
  const vEl = document.getElementById('appVersion');
  if (vEl) vEl.textContent = APP_VERSION;
  renderNav();
  const _pn = window.location.pathname.replace(/\/$/, '') || '/';
  let _startPage, _startParam = null;
  if (_pn.startsWith('/profile/')) { _startPage = 'profile'; _startParam = _pn.slice(9); }
  else if (_pn.startsWith('/chat/')) { _startPage = 'chat'; _startParam = _pn.slice(6); }
  else if (_pn.startsWith('/hashtag/')) { _startPage = 'hashtag'; _startParam = decodeURIComponent(_pn.slice(9)); }
  else {
    const _pm = { '/disk':'disk','/drops':'drops','/discover':'discover','/artists':'artists',
      '/settings':'settings','/notifs':'notifs','/chats':'chats','/admin':'admin','/hub':'hub','/search':'search' };
    _startPage = _pm[_pn] || 'feed';
  }
  if (me) go(_startPage, _startParam, 'replace');
  else go('login', null, 'replace');
  document.addEventListener('click', e => {
    const bar = e.target.closest('#realtimeStatusBar');
    if (bar && pendingChatQueue.length) {
      flushPendingChatQueue().catch(() => {});
    }
  });
  if (me) initEvents();
  window.addEventListener('online', () => {
    updateRealtimeStatus(false);
    flushPendingChatQueue().catch(() => {});
  });
  window.addEventListener('offline', () => {
    updateRealtimeStatus(true);
  });
  window.addEventListener('popstate', e => {
    const _s = e.state;
    if (_s?.p) { go(_s.p, _s.param || undefined, 'none'); return; }
    const _pp = window.location.pathname;
    if (_pp.startsWith('/profile/')) go('profile', _pp.slice(9), 'none');
    else if (_pp.startsWith('/chat/')) go('chat', _pp.slice(6), 'none');
    else if (_pp.startsWith('/hashtag/')) go('hashtag', decodeURIComponent(_pp.slice(9)), 'none');
    else {
      const _m2 = { '/disk':'disk','/drops':'drops','/discover':'discover','/artists':'artists',
        '/settings':'settings','/notifs':'notifs','/chats':'chats','/admin':'admin','/hub':'hub' };
      go(_m2[_pp] || 'feed', null, 'none');
    }
  });
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/service-worker.js').catch(() => {});
    // Auto-reload when a new SW version takes over (ensures fresh JS after deploy)
    if (navigator.serviceWorker.controller) {
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        window.location.reload();
      });
    }
  }
}

// ── NAV ──
function renderNav() {
  const el = $('#navLinks');
  const mob = $('#mobileMenu');
  let items;
  if (me) {
    const badge = me.notif_count > 0 ? ` <span class="nav-badge">${me.notif_count}</span>` : '';
    items = [
      { id: 'feed',     html: navInner('home', 'Лента'),         title: 'Посты твоих подписок' },
      { id: 'drops',    html: navInner('media', 'Дропы'),          title: 'Исчезают через 24ч' },
      { id: 'discover', html: navInner('search', 'Обзор'),          title: 'Все посты' },
      { id: 'artists',  html: navInner('profile', 'Артисты'),        title: 'Все пользователи' },
      { id: 'disk',     html: navInner('disk', 'Диск'),           title: 'Облачное хранилище' },
      ...(me.is_admin ? [{ id: 'hub', html: navInner('settings', 'Hub'), title: 'Метрики и платформы' }] : []),
      { sep: true },
      { id: 'chats',    html: `${navInner('comment', 'Чаты')}${me.unread_chats > 0 ? ` <span class="nav-badge">${me.unread_chats}</span>` : ''}`, title: 'Личные сообщения' },
      { id: 'notifs',   html: `${navInner('notifications', 'Уведомления')}${badge}`, title: 'Уведомления' },
      { id: 'search',   html: navInner('search', 'Поиск'),          title: 'Поиск' },
      { sep: true },
      { id: 'profile',  html: `${navInner('profile', me.display_name || 'Профиль')}`, param: me.username, title: 'Мой профиль' },
      { id: 'settings', html: navInner('settings', 'Настройки'),      title: 'Настройки профиля' },
      { sep: true },
      { id: '__theme', html: navInner('settings', document.documentElement.classList.contains('light') ? 'Светлая тема' : 'Тёмная тема'), title: 'Переключить тему', action: 'toggleTheme()' },
    ];
  } else {
    items = [
      { id: 'discover', html: navInner('home', 'Discover'), title: 'Глобальная лента — все посты' },
      { id: 'artists', html: navInner('profile', 'Artists'), title: 'Каталог всех пользователей' },
      { id: 'login', html: navInner('lock', 'Войти'), title: 'Войти или зарегистрироваться' },
      { sep: true },
      { id: '__theme', html: navInner('settings', document.documentElement.classList.contains('light') ? 'Светлая тема' : 'Тёмная тема'), title: 'Переключить тему', action: 'toggleTheme()' },
    ];
  }
  const html = items.map(i =>
    i.sep
      ? `<div class="nav-sep"></div>`
      : `<span role="button" tabindex="0" class="nav-item ${[page === i.id && !i.action ? 'active' : ''].filter(Boolean).join(' ')}" title="${esc(i.title || '')}" data-nav-action="${i.action ? 'theme' : 'go'}" data-nav-page="${i.id || ''}" data-nav-param="${i.param || ''}">${i.html}</span>`
  ).join('');
  el.innerHTML = html;
  mob.innerHTML = `
    <div class="mobile-menu-head">
      <div class="mobile-menu-brand">
        <div class="mobile-menu-logo">W<span class="logo-zero">Ø</span>PIUM</div>
        <div class="mobile-menu-user">${me ? `@${esc(me.username || '')}` : 'Guest access'}</div>
      </div>
      <button type="button" class="mobile-menu-close" data-ui-action="close-menu" aria-label="Close menu">${iconCut('close', 'ui-icon', 16, 16)}</button>
    </div>
    <div class="mobile-menu-list">${html}</div>
  `;
  // Admin FAB
  let fab = document.getElementById('adminFab');
  if (me?.is_admin) {
    if (!fab) {
      fab = document.createElement('button');
      fab.id = 'adminFab';
      fab.title = 'Панель администратора';
      fab.onclick = () => page === 'admin' ? go('feed') : go('admin');
      document.body.appendChild(fab);
    }
    fab.className = page === 'admin' ? 'active' : '';
    fab.innerHTML = iconCut('settings', 'ui-icon', 20, 20);
  } else if (fab) {
    fab.remove();
  }
}

function setMobileMenuOpen(open) {
  const menu = $('#mobileMenu');
  const burger = $('#burger');
  if (!menu) return;
  const shouldOpen = Boolean(open);
  menu.classList.toggle('hidden', !shouldOpen);
  document.body.classList.toggle('menu-open', shouldOpen);
  burger?.classList.toggle('active', shouldOpen);
  burger?.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
}

function toggleMenu(open) {
  const menu = $('#mobileMenu');
  if (!menu) return;
  setMobileMenuOpen(typeof open === 'boolean' ? open : menu.classList.contains('hidden'));
}

function initUiDelegates() {
  if (window.__uiDelegatesBound) return;
  window.__uiDelegatesBound = true;

  document.addEventListener('click', ev => {
    if (
      document.body.classList.contains('menu-open') &&
      !ev.target.closest('#mobileMenu') &&
      !ev.target.closest('#burger')
    ) {
      setMobileMenuOpen(false);
    }

    const uiActionEl = ev.target.closest('[data-ui-action]');
    if (uiActionEl) {
      const uiAction = uiActionEl.dataset.uiAction;
      if (uiAction === 'go-feed') return go('feed');
      if (uiAction === 'toggle-menu') return toggleMenu();
      if (uiAction === 'close-menu') return setMobileMenuOpen(false);
    }

    const navItem = ev.target.closest('.nav-item[data-nav-action]');
    if (navItem) {
      const action = navItem.dataset.navAction;
      if (action === 'theme') toggleTheme();
      else if (action === 'go') go(navItem.dataset.navPage || 'feed', navItem.dataset.navParam || undefined);
      if (navItem.closest('#mobileMenu')) setMobileMenuOpen(false);
      return;
    }

    const postActionEl = ev.target.closest('[data-post-action]');
    if (!postActionEl) return;
    const action = postActionEl.dataset.postAction;
    if (action !== 'toggle-chat-tools-menu' && postActionEl.closest('.chat-tools-menu')) {
      postActionEl.closest('.chat-tools-menu')?.classList.add('hidden');
    }
    const postId = postActionEl.dataset.postId || '';
    switch (action) {
      case 'like': return togLike(postId, postActionEl);
      case 'likers': return showLikers(postId);
      case 'comments': return togCmts(postId);
      case 'repost': return showRepostMenu(postId, postActionEl, postActionEl.dataset.reposted === '1');
      case 'bookmark': return togBookmark(postId, postActionEl);
      case 'edit': return editPost(postId);
      case 'pin': return pinPost(postId);
      case 'unpin': return unpinPost(postId);
      case 'archive': return archivePost(postId, postActionEl);
      case 'unarchive': return unarchivePost(postId, postActionEl);
      case 'delete': return delPost(postId);
      case 'report': return showReportMenu(postId, postActionEl);
      case 'copy-link': return copyPostLink(postId);
      case 'react-add': return openPostReactPicker(postId, postActionEl);
      case 'react-toggle': return togglePostReact(postId, postActionEl.dataset.emoji || '', postActionEl);
      case 'open-image': return openImg(postActionEl.dataset.image || '');
      case 'go-profile': return go('profile', postActionEl.dataset.username || '');
      case 'go-hashtag': return go('hashtag', postActionEl.dataset.tag || '');
      case 'track-play': return trackPlay(postId);
      case 'expand-post': return expandPost(postId);
      case 'send-comment': return sendCmt(postId);
      case 'cancel-edit-msg': return cancelEditMsg(postActionEl.dataset.msgId || '');
      case 'submit-edit-msg': return submitEditMsg(postActionEl.dataset.msgId || '', postActionEl.dataset.convId || '');
      case 'scroll-to-msg': return scrollToMsg(postActionEl.dataset.msgId || '');
      case 'jump-to-message':
        postActionEl.closest('.modal-overlay')?.remove();
        return jumpToMessage(postActionEl.dataset.msgId || '', postActionEl.dataset.convId || '');
      case 'go-chat': return go('chat', postActionEl.dataset.convId || '');
      case 'go-chats': return go('chats');
      case 'go-disk': return go('disk');
      case 'go-discover': return go('discover');
      case 'go-feed': return go('feed');
      case 'go': return go(postActionEl.dataset.navTarget || 'feed');
      case 'open-user-info-panel': return openUserInfoPanel(postActionEl.dataset.username || '');
      case 'leave-group-chat': return leaveGroupChat(postActionEl.dataset.convId || '');
      case 'toggle-group-members': return toggleGroupMembers();
      case 'edit-group-info': return editGroupInfo(postActionEl.dataset.convId || '');
      case 'open-media-gallery': return openMediaGallery(postActionEl.dataset.convId || '');
      case 'toggle-chat-search': return toggleChatSearch(postActionEl.dataset.convId || '');
      case 'toggle-chat-mute': return toggleChatMute(postActionEl.dataset.convId || '');
      case 'toggle-chat-pin': return toggleChatPin(postActionEl.dataset.convId || '');
      case 'toggle-chat-tools-menu': return toggleChatToolsMenu(postActionEl);
      case 'toggle-chat-list-archive':
        chatListShowArchived = !chatListShowArchived;
        return loadChats();
      case 'toggle-chat-archive': return toggleChatArchive(postActionEl.dataset.convId || '', postActionEl.dataset.archived === '1');
      case 'open-saved-messages': return openSavedMessages(postActionEl.dataset.convId || '');
      case 'export-chat': return exportChat(postActionEl.dataset.convId || '');
      case 'scroll-to-pinned':
        if (postActionEl.classList.contains('pinned-msg-unpin')) return;
        return scrollToPinned(postActionEl.dataset.msgId || '');
      case 'unpin-message':
        ev.stopPropagation();
        return unpinMessage(postActionEl.dataset.convId || '');
      case 'remove-group-member':
        return removeGroupMember(postActionEl.dataset.convId || '', postActionEl.dataset.memberId || '', postActionEl.dataset.username || '');
      case 'add-group-member': return addGroupMember(postActionEl.dataset.convId || '');
      case 'scroll-chat-bottom': return scrollChatToBottom();
      case 'toggle-chat-attach': return toggleChatAttach();
      case 'close-chat-attach': return closeChatAttach();
      case 'cancel-recording': return cancelRecording();
      case 'stop-recording-preview': return stopRecordingPreview();
      case 'cancel-voice-preview': return cancelVoicePreview();
      case 'restart-voice-recording': return restartVoiceRecording();
      case 'clear-chat-attachment': return clearChatAttachment();
      case 'vp-preview-toggle': return vpPreviewToggle();
      case 'vp-toggle': return vpToggle(postActionEl.dataset.vpId || '', postActionEl.dataset.vpSrc || '');
      case 'vp-cycle-speed': return vpCycleSpeed(postActionEl);
      case 'send-voice-preview': return sendVoicePreview();
      case 'accept-dm-request': return acceptDmRequest(postActionEl.dataset.convId || '');
      case 'decline-dm-request': return declineDmRequest(postActionEl.dataset.convId || '');
      case 'open-video': return openVideo(postActionEl.dataset.video || '');
      case 'start-msg-reply':
        closeMsgMenuPopover();
        return startMsgReply(postActionEl.dataset.msgId || '', postActionEl.dataset.replyText || '', postActionEl);
      case 'start-edit-msg':
        closeMsgMenuPopover();
        return startEditMsg(postActionEl.dataset.msgId || '', postActionEl.dataset.convId || '');
      case 'delete-msg':
        closeMsgMenuPopover();
        return deleteMsg(postActionEl.dataset.msgId || '', postActionEl.dataset.convId || '');
      case 'pin-message':
        closeMsgMenuPopover();
        return pinMessage(postActionEl.dataset.msgId || '', postActionEl.dataset.convId || '');
      case 'forward-msg':
        closeMsgMenuPopover();
        return forwardMsg(postActionEl.dataset.msgId || '', postActionEl.dataset.convId || '');
      case 'open-msg-menu': return openMsgMenu(postActionEl);
      case 'copy-msg-text': return copyMsgText(postActionEl.dataset.msgId || '', postActionEl.closest('.modal-overlay, .msg-menu-popover'));
      case 'report-msg': return showMessageReport(postActionEl.dataset.msgId || '', postActionEl.closest('.modal-overlay, .msg-menu-popover'));
      case 'msg-details': return showMsgDetails(postActionEl.dataset.msgId || '', postActionEl.closest('.modal-overlay, .msg-menu-popover'));
      case 'toggle-save-msg':
        closeMsgMenuPopover();
        return toggleSaveMsg(postActionEl.dataset.msgId || '', postActionEl.dataset.convId || '', postActionEl.dataset.saved === '1');
      case 'do-report-message':
        return submitMessageReport(postActionEl.dataset.msgId || '', postActionEl.dataset.reason || '', postActionEl.closest('.modal-overlay, .msg-menu-popover'));
      case 'cancel-msg-reply': return cancelMsgReply();
      case 'go-settings': return go('settings');
      case 'follow-user': return doFollow(postActionEl.dataset.userId || '', postActionEl.dataset.username || '');
      case 'unfollow-user': return unfollow(postActionEl.dataset.userId || '', postActionEl.dataset.username || '');
      case 'start-chat': return startChat(postActionEl.dataset.userId || '', postActionEl.dataset.username || '');
      case 'block-user': return blockUser(postActionEl.dataset.username || '');
      case 'unblock-user': return unblockUser(postActionEl.dataset.username || '');
      case 'mute-user': return muteUser(postActionEl.dataset.username || '');
      case 'unmute-user': return unmuteUser(postActionEl.dataset.username || '');
      case 'show-posts-count': return showPostsCount();
      case 'show-followers': return showFollowersList(postActionEl.dataset.username || '');
      case 'show-following': return showFollowingList(postActionEl.dataset.username || '');
      case 'profile-tab': return switchProfileTab(postActionEl, postActionEl.dataset.tabId || 'postsTab');
      case 'profile-avatar-pick': return document.getElementById('profileAvaFile')?.click();
      case 'settings-avatar-pick': return document.getElementById('avaFile')?.click();
      case 'save-profile': return saveProfile();
      case 'do-logout': return doLogout();
      case 'rotate-invite': return rotateInvite();
      case 'load-sessions': return loadSessions();
      case 'revoke-other-sessions': return revokeOtherSessions();
      case 'submit-verify-request': return submitVerifyRequest();
      case 'change-password': return changePassword();
      case 'export-data': return exportData();
      case 'delete-account': return deleteAccount();
      case 'refresh-hub-external': return refreshHubExternal();
      case 'save-hub-key': return saveHubKey(postActionEl.dataset.platformId || '');
      case 'admin-switch-tab': return adminSwitch(postActionEl.dataset.tab || 'stats');
      case 'admin-diag-refresh': return adminDiagRefresh();
      case 'admin-enqueue-noop-job': return adminEnqueueNoopJob();
      case 'admin-del-drop': return adminDelDrop(postActionEl.dataset.dropId || '');
      case 'delete-drop': return delDrop(postActionEl.dataset.dropId || '');
      case 'admin-resolve-report': return adminResolveReport(postActionEl.dataset.reportId || '');
      case 'admin-approve-verify': return adminApproveVerify(postActionEl.dataset.requestId || '');
      case 'admin-reject-verify': return adminRejectVerify(postActionEl.dataset.requestId || '');
      case 'admin-ban':
        return adminBan(postActionEl.dataset.userId || '', postActionEl.dataset.username || '', postActionEl.dataset.isBanned === '1');
      case 'admin-promote':
        return adminPromote(postActionEl.dataset.userId || '', postActionEl.dataset.username || '', postActionEl.dataset.isAdmin === '1');
      case 'admin-verify':
        return adminVerify(
          postActionEl.dataset.userId || '',
          postActionEl.dataset.username || '',
          postActionEl.dataset.isVerified === '1',
          postActionEl.dataset.badgeType || '',
        );
      case 'admin-delete-user':
        return adminDeleteUser(postActionEl.dataset.userId || '', postActionEl.dataset.username || '');
      case 'do-auth': return doAuth(postActionEl.dataset.mode || 'login');
      case 'show-forgot-step': return showForgotStep();
      case 'go-register': return go('register');
      case 'go-login': return go('login');
      case 'do-verify': return doVerify(postActionEl.dataset.username || '');
      case 'resend-verify': return resendVerify(postActionEl.dataset.username || '');
      case 'do-forgot': return doForgot();
      case 'do-reset': return doReset(postActionEl.dataset.email || '');
      case 'do-resend-reset': return doResendReset(postActionEl.dataset.email || '');
      case 'accept-follow-req': return acceptFollowReq(postActionEl.dataset.requestId || '', postActionEl);
      case 'decline-follow-req': return declineFollowReq(postActionEl.dataset.requestId || '', postActionEl);
      case 'close-group-modal': return document.getElementById('groupModal')?.remove();
      case 'close-modal-overlay': return postActionEl.closest('.modal-overlay')?.remove();
      case 'do-forward-msg':
        return doForwardMsg(
          postActionEl.dataset.mid || '',
          postActionEl.dataset.srcCid || '',
          postActionEl.dataset.targetCid || '',
          postActionEl.closest('.modal-overlay')
        );
      case 'do-chat-mute':
        return doChatMute(
          postActionEl.dataset.convId || '',
          Number(postActionEl.dataset.muteHours || 0),
          postActionEl.closest('.modal-overlay')
        );
      case 'show-create-group-modal':
      case 'open-new-group-chat':
        return showCreateGroupModal();
      case 'create-group': return createGroup();
      case 'modal-close': return closeModal();
      case 'modal-go-profile':
        closeModal();
        return go('profile', postActionEl.dataset.username || '');
      case 'switch-gallery-tab':
        return switchGalleryTab(postActionEl, postActionEl.dataset.galleryTab || 'images', postActionEl.dataset.convId || '');
      case 'save-group-info':
        return saveGroupInfo(postActionEl.dataset.convId || '', postActionEl.closest('.modal-overlay'));
      case 'close-user-info-panel': return closeUserInfoPanel();
      case 'open-profile-from-panel':
        go('profile', postActionEl.dataset.username || '');
        return closeUserInfoPanel();
      case 'follow-user-from-panel': return followUser(postActionEl.dataset.userId || '', postActionEl);
      case 'block-user-from-panel': return blockUserFromPanel(postActionEl.dataset.username || '');
      case 'repost-direct': return repostDirect(postId);
      case 'quote-compose': return showQuoteCompose(postId);
      case 'quote-cancel':
        document.getElementById(`qc-${postId}`)?.remove();
        return;
      case 'quote-submit': return submitQuote(postId);
      case 'add-poll-option': return addPollOption();
      case 'toggle-attach-menu': return toggleAttachMenu(postActionEl.dataset.prefix || '');
      case 'close-attach-menu': return closeAttachMenu(postActionEl.dataset.prefix || '');
      case 'select-track': return selectTrack(postActionEl.dataset.prefix || '');
      case 'toggle-poll-composer': return togglePollComposer();
      case 'toggle-text-pos': return toggleTextPos();
      case 'toggle-scheduler': return toggleScheduler();
      case 'submit-post': return submitPost();
      case 'submit-drop': return submitDrop();
      case 'disk-load-root': return loadDiskFolder(null);
      case 'disk-load-folder': return loadDiskFolder(postActionEl.dataset.folderId || '');
      case 'disk-delete-folder':
        ev.stopPropagation();
        return deleteDiskFolder(postActionEl.dataset.folderId || '');
      case 'disk-item-click': return diskItemClick(postActionEl.dataset.fileId || '');
      case 'disk-delete-file':
        ev.stopPropagation();
        return deleteDiskFile(postActionEl.dataset.fileId || '');
      case 'disk-play-pause': return diskPlayPause();
      case 'disk-seek-bar': return diskSeekBar(ev);
      case 'disk-toggle-mute': return diskToggleMute();
      case 'disk-open-edit': return openDiskEdit(postActionEl.dataset.fileId || '');
      case 'disk-copy-public-link':
        postActionEl.select?.();
        return navigator.clipboard.writeText(postActionEl.value || '').then(() => toast.success('Скопировано')).catch(() => {});
      case 'disk-toggle-public-link': return toggleDiskPublicLink(postActionEl.dataset.fileId || '');
      case 'disk-delete-file-preview': return deleteDiskFile(postActionEl.dataset.fileId || '', true);
      case 'disk-save-edit': return saveDiskEdit(postActionEl.dataset.fileId || '');
      case 'disk-cancel-edit': return _renderDiskPreview(_diskFiltered[diskPreviewIdx]);
      case 'disk-create-folder': return createDiskFolder();
      case 'disk-open-upload': return document.getElementById('diskFileInput')?.click();
      case 'disk-toggle-select-mode': return toggleDiskSelectMode();
      case 'disk-set-view': return setDiskView(postActionEl.dataset.view || 'grid');
      case 'disk-create-folder-prompt': return diskCreateFolderPrompt();
      case 'disk-set-sort': return setDiskSort(postActionEl.dataset.sortKey || 'date');
      case 'disk-set-filter': return setDiskFilter(postActionEl.dataset.filterKey || 'all');
      case 'disk-download-zip': return downloadDiskZip();
      case 'disk-bulk-delete': return bulkDeleteDisk();
      case 'disk-overlay-close': return closeDiskPreview(ev);
      case 'disk-preview-box':
        ev.stopPropagation();
        return;
      case 'disk-close-preview': return closeDiskPreview();
      case 'disk-nav-preview':
        ev.stopPropagation();
        return diskNavPreview(Number(postActionEl.dataset.navDir || 0));
      case 'submit-report':
        return submitReport(
          postActionEl.dataset.reportType || 'post',
          postActionEl.dataset.targetId || '',
          postActionEl.dataset.reason || '',
        );
      case 'poll-vote':
        return voteOnPoll(
          postActionEl.dataset.postId || '',
          postActionEl.dataset.pollId || '',
          postActionEl.dataset.optId || '',
          postActionEl,
        );
    }
  });

  document.addEventListener('keydown', ev => {
    if (ev.key === 'Escape' && document.body.classList.contains('menu-open')) {
      setMobileMenuOpen(false);
      return;
    }
    const navItem = ev.target.closest('.nav-item[data-nav-action]');
    if (navItem && (ev.key === 'Enter' || ev.key === ' ')) {
      ev.preventDefault();
      navItem.click();
      return;
    }
    const commentInput = ev.target.closest('input[data-post-action="comment-input"]');
    if (commentInput && ev.key === 'Enter') {
      ev.preventDefault();
      sendCmt(commentInput.dataset.postId || '');
      return;
    }
    const actionEl = ev.target.closest('[data-post-action]');
    if (actionEl && (ev.key === 'Enter' || ev.key === ' ')) {
      ev.preventDefault();
      actionEl.click();
    }
  });

  document.addEventListener('input', ev => {
    const actionInput = ev.target.closest('[data-post-action]');
    if (actionInput?.dataset.postAction === 'disk-search-input') return setDiskSearch(actionInput.value || '');
    if (actionInput?.dataset.postAction === 'disk-set-volume') return diskSetVolume(actionInput.value);
    const searchInput = ev.target.closest('input[data-post-action="chat-search-input"]');
    if (searchInput) debouncedChatSearch(searchInput.dataset.convId || '');
    const adminSearchInput = ev.target.closest('#adminUserSearch');
    if (adminSearchInput) adminFilterUsers();
  });

  document.addEventListener('change', ev => {
    const actionEl = ev.target.closest('[data-post-action]');
    if (actionEl?.dataset.postAction === 'disk-file-input') uploadDiskFiles(actionEl.files || []);
  });

  document.addEventListener('dragover', ev => {
    const dragEl = ev.target.closest('[data-post-action-dragover]');
    if (!dragEl) return;
    ev.preventDefault();
    ev.stopPropagation();
    if (dragEl.dataset.postActionDragover === 'disk-folder-dragover') dragEl.classList.add('drag-target');
  });

  document.addEventListener('dragleave', ev => {
    const dragEl = ev.target.closest('[data-post-action-dragleave]');
    if (!dragEl) return;
    if (dragEl.dataset.postActionDragleave === 'disk-folder-dragleave') dragEl.classList.remove('drag-target');
  });

  document.addEventListener('drop', ev => {
    const dragEl = ev.target.closest('[data-post-action-drop]');
    if (!dragEl) return;
    ev.preventDefault();
    ev.stopPropagation();
    dragEl.classList.remove('drag-target');
    if (dragEl.dataset.postActionDrop === 'disk-folder-drop') {
      diskFileDrop(dragEl.dataset.folderDropId || '', ev);
    }
  });

  document.addEventListener('mousedown', ev => {
    const actionEl = ev.target.closest('[data-post-action]');
    if (!actionEl) return;
    if (actionEl.dataset.postAction === 'insert-mention') {
      ev.preventDefault();
      insertMention(actionEl.dataset.textareaId || '', actionEl.dataset.dropId || '', actionEl.dataset.username || '');
    }
    if (actionEl.dataset.postAction === 'insert-chat-mention') {
      ev.preventDefault();
      insertChatMention(actionEl.dataset.textareaId || '', actionEl.dataset.username || '');
    }
  });

  document.addEventListener('dragstart', ev => {
    const dragEl = ev.target.closest('[data-post-action-dragstart]');
    if (!dragEl) return;
    if (dragEl.dataset.postActionDragstart === 'disk-drag-start') {
      diskDragStart(dragEl.dataset.dragFileId || '', ev);
    }
  });

  document.addEventListener('dragend', ev => {
    const dragEl = ev.target.closest('[data-post-action-dragend]');
    if (!dragEl) return;
    if (dragEl.dataset.postActionDragend === 'disk-drag-end') {
      dragEl.classList.remove('dragging-file');
    }
  });
}

// ── ROUTER ──
function go(p, param, _hist = 'push') {
  if (dirtySettings && page === 'settings' && p !== 'settings') {
    if (!confirm('Есть несохранённые изменения. Уйти без сохранения?')) return;
    dirtySettings = false;
  }
  if (pendingVerifyUsername && p !== 'register') {
    if (!confirm('Email не подтверждён. Покинуть регистрацию?')) return;
    pendingVerifyUsername = null;
  }
  if (p !== 'chat') {
    chatOtherLastRead = null; vrWantPreview = false;
    window._currentChatConv = null;
    document.body.classList.remove('in-chat');
    if (window._vpCleanup) { window._vpCleanup(); window._vpCleanup = null; }
    // Clean up user info panel and its close handler
    closeUserInfoPanel();
    // Clean up ResizeObserver for scroll-down button
    if (window._composerResizeObs) { window._composerResizeObs.disconnect(); window._composerResizeObs = null; }
  }
  cTextPos = 'above';
  page = p;
  pageParam = param;
  // Update browser URL
  if (_hist !== 'none') {
    const _url = (p === 'profile' && param) ? `/profile/${param}`
               : (p === 'chat' && param) ? `/chat/${param}`
               : (p === 'hashtag' && param) ? `/hashtag/${encodeURIComponent(param)}`
               : (p === 'search') ? '/search'
               : ['feed','login','register'].includes(p) ? '/'
               : `/${p}`;
    try {
      if (_hist === 'replace') history.replaceState({ p, param: param || null }, '', _url);
      else history.pushState({ p, param: param || null }, '', _url);
    } catch {}
  }
  $('#mobileMenu').classList.add('hidden');
  renderNav();
  // Stop any active voice recording when navigating away
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    recordingCancelled = true;
    mediaRecorder.stop();
    clearInterval(recordingInterval);
  }
  // stop chat polling when switching pages
  if (msgPoll) { clearInterval(msgPoll); msgPoll = null; }
  // clear infinite scroll handler when navigating away
  window.onscroll = null;
  const app = $('#app');
  app.innerHTML = '<div class="empty empty-big">· · ·</div>';

  const routes = {
    feed: () => renderFeed(app),
    drops: () => renderDrops(app),
    disk: () => renderDisk(app),
    discover: () => renderDiscover(app),
    artists: () => renderArtists(app),
    search: () => renderSearch(app, param),
    hashtag: () => renderHashtag(app, param),
    profile: () => renderProfile(app, param),
    settings: () => renderSettings(app),
    notifs: () => renderNotifs(app),
    login: () => renderAuth(app, 'login'),
    register: () => renderAuth(app, 'register'),
    chats: () => renderChats(app),
    chat: () => renderChat(app, param),
    hub:       () => renderHub(app),
    admin:     () => renderAdmin(app),
    bookmarks: () => renderBookmarks(app),
  };
  (routes[p] || routes.discover)();
}

// ── HELPERS ──
function timeAgo(d) {
  const str = d ? (d.endsWith('Z') ? d : d.replace(' ', 'T') + 'Z') : new Date().toISOString();
  const s = (Date.now() - new Date(str).getTime()) / 1000;
  if (s < 60) return 'сейчас';
  if (s < 3600) return Math.floor(s / 60) + 'м';
  if (s < 86400) return Math.floor(s / 3600) + 'ч';
  if (s < 604800) return Math.floor(s / 86400) + 'д';
  return new Date(str).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}
function timeAgoEl(d) {
  const str = d ? (d.endsWith('Z') ? d : d.replace(' ', 'T') + 'Z') : new Date().toISOString();
  const exact = new Date(str).toLocaleString('ru-RU', { day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });
  return `<span class="ts" title="${exact}">${timeAgo(d)}</span>`;
}

function avatarEl(url, cls = 'avatar', letter = '') {
  if (url) return `<div class="${cls}"><img src="${url}" loading="lazy" alt=""></div>`;
  return `<div class="${cls}">${letter}</div>`;
}

let cTextPos = 'above';

function composerHtml() {
  return `
    <div class="composer">
      <div style="position:relative">
        <textarea id="cText" placeholder="Что нового..." rows="3" maxlength="2000"></textarea>
        <div class="mention-dropdown hidden" id="cMentionDrop"></div>
      </div>
      <div class="char-counter" id="cCharCount"></div>
      <div id="cPollArea" class="poll-composer hidden">
        <div id="cPollOptions">
          <input class="input poll-opt-input" placeholder="Вариант 1" maxlength="100" autocomplete="off">
          <input class="input poll-opt-input" placeholder="Вариант 2" maxlength="100" autocomplete="off">
        </div>
        <button class="btn btn-sm btn-ghost btn-ic-row" data-post-action="add-poll-option" id="cPollAddBtn">${iconCut('add', 'ui-icon', 12, 12)}вариант</button>
      </div>
      <div class="composer-toolbar">
        <div class="composer-tools">
          <div class="attach-wrap" id="cAttachWrap">
            <button class="composer-tool attach-btn" data-post-action="toggle-attach-menu" data-prefix="c" title="Прикрепить">${iconCut('attach', 'ui-icon', 17, 17)}</button>
            <div class="attach-menu hidden" id="cAttachMenu">
              <label class="attach-opt" for="cImg" data-post-action="close-attach-menu" data-prefix="c">UP фото</label>
              <button class="attach-opt" data-post-action="select-track" data-prefix="c">SC soundcloud</button>
              <button class="attach-opt attach-opt--ic" id="cPollBtn" data-post-action="toggle-poll-composer">${iconCut('more-horizontal', 'ui-icon attach-opt-ic', 13, 13)}опрос</button>
            </div>
          </div>
          <input type="file" id="cImg" accept="image/*,.heic,.heif" style="display:none">
          <button class="composer-tool text-pos-btn" id="cTextPosBtn" data-post-action="toggle-text-pos" title="Текст сверху — нажми чтобы поставить снизу">${iconCut('upload', 'ui-icon', 15, 15)}</button>
          <button type="button" class="composer-btn composer-tool" id="scheduleToggle" data-post-action="toggle-scheduler" title="Запланировать" style="opacity:0.5">${iconCut('settings', 'ui-icon', 15, 15)}</button>
        </div>
        <div id="schedulerPanel" style="display:none;margin-top:8px">
          <input type="datetime-local" id="scheduledAt" class="composer-input input" style="width:100%;font-size:13px" />
          <div style="font-size:11px;color:var(--muted,#888);margin-top:4px">Пост опубликуется автоматически в выбранное время</div>
        </div>
        <div class="composer-submit">
          <input type="text" id="cTrack" placeholder="soundcloud.com/..." class="track-input hidden">
          <button class="btn btn-sm btn-ic-row" data-post-action="submit-post">${iconCut('send', 'ui-icon', 14, 14)}ОПУБЛИКОВАТЬ</button>
        </div>
      </div>
      <div id="cImgName" style="font-size:0.6rem;color:var(--fg3);margin-top:0.3rem"></div>
    </div>
  `;
}

function toggleAttachMenu(prefix) {
  const menu = $(`#${prefix}AttachMenu`);
  if (!menu) return;
  const isOpen = !menu.classList.contains('hidden');
  // close all attach menus first
  document.querySelectorAll('.attach-menu').forEach(m => m.classList.add('hidden'));
  if (!isOpen) {
    menu.classList.remove('hidden');
    // close on outside click
    setTimeout(() => {
      const handler = e => {
        if (!$(`#${prefix}AttachWrap`)?.contains(e.target)) {
          menu.classList.add('hidden');
          document.removeEventListener('click', handler);
        }
      };
      document.addEventListener('click', handler);
    }, 0);
  }
}

function closeAttachMenu(prefix) {
  $(`#${prefix}AttachMenu`)?.classList.add('hidden');
}

function selectTrack(prefix) {
  closeAttachMenu(prefix);
  const inp = $(`#${prefix}Track`);
  if (!inp) return;
  inp.classList.remove('hidden');
  inp.focus();
}

function toggleTextPos() {
  cTextPos = cTextPos === 'above' ? 'below' : 'above';
  const btn = $('#cTextPosBtn');
  if (btn) {
    const isBelow = cTextPos === 'below';
    btn.innerHTML = isBelow ? iconCut('download', 'ui-icon', 15, 15) : iconCut('upload', 'ui-icon', 15, 15);
    btn.title = isBelow ? 'Текст снизу — нажми чтобы вернуть вверх' : 'Текст сверху — нажми чтобы поставить снизу';
    btn.classList.toggle('on', isBelow);
  }
}

// ── @MENTION AUTOCOMPLETE ──
let _mentionTimer = null;
let _mentionActive = false;
let _mentionStart = 0;

function bindMentionAutocomplete(textareaId, dropId) {
  const ta = $(`#${textareaId}`);
  const drop = $(`#${dropId}`);
  if (!ta || !drop) return;

  ta.addEventListener('input', () => {
    clearTimeout(_mentionTimer);
    const val = ta.value, pos = ta.selectionStart;
    const before = val.slice(0, pos);
    const m = before.match(/@([a-zA-Z0-9_]*)$/);
    if (!m) { drop.classList.add('hidden'); _mentionActive = false; return; }
    _mentionActive = true;
    _mentionStart = pos - m[0].length;
    const q = m[1];
    if (!q) { drop.classList.add('hidden'); return; }
    _mentionTimer = setTimeout(async () => {
      try {
        const users = await api(`/users/suggest?q=${encodeURIComponent(q)}`);
        if (!users.length) { drop.classList.add('hidden'); return; }
        drop.innerHTML = users.map(u => `
          <div class="mention-opt" data-post-action="insert-mention" data-textarea-id="${textareaId}" data-drop-id="${dropId}" data-username="${esc(u.username)}">
            <span class="mention-name">${esc(u.display_name)}</span>
            <span class="mention-handle">@${esc(u.username)}</span>
          </div>`).join('');
        drop.classList.remove('hidden');
      } catch { drop.classList.add('hidden'); }
    }, 200);
  });

  ta.addEventListener('keydown', e => {
    if (drop.classList.contains('hidden')) return;
    if (e.key === 'Escape') { drop.classList.add('hidden'); }
  });
  ta.addEventListener('blur', () => setTimeout(() => drop.classList.add('hidden'), 150));
}

function insertMention(textareaId, dropId, username) {
  const ta = $(`#${textareaId}`);
  const drop = $(`#${dropId}`);
  if (!ta) return;
  const val = ta.value, pos = ta.selectionStart;
  const before = val.slice(0, _mentionStart);
  const after = val.slice(pos);
  ta.value = before + '@' + username + ' ' + after;
  const newPos = before.length + username.length + 2;
  ta.setSelectionRange(newPos, newPos);
  ta.focus();
  if (drop) drop.classList.add('hidden');
}

function togglePollComposer() {
  const area = $('#cPollArea');
  const btn = $('#cPollBtn');
  if (!area) return;
  const isOpen = !area.classList.contains('hidden');
  area.classList.toggle('hidden', isOpen);
  if (btn) btn.classList.toggle('on', !isOpen);
}

function addPollOption() {
  const container = $('#cPollOptions');
  if (!container) return;
  const count = container.querySelectorAll('.poll-opt-input').length;
  if (count >= 4) return;
  const inp = document.createElement('input');
  inp.className = 'input poll-opt-input';
  inp.placeholder = `Вариант ${count + 1}`;
  inp.maxLength = 100;
  inp.autocomplete = 'off';
  container.appendChild(inp);
  if (count + 1 >= 4) $('#cPollAddBtn')?.classList.add('hidden');
}

function toggleScheduler() {
  const panel = document.getElementById('schedulerPanel');
  const btn = document.getElementById('scheduleToggle');
  if (!panel) return;
  const show = panel.style.display === 'none';
  panel.style.display = show ? '' : 'none';
  if (btn) btn.style.opacity = show ? '1' : '0.5';
  if (show) {
    // Default to 1 hour from now
    const dt = new Date(Date.now() + 3600000);
    const local = new Date(dt.getTime() - dt.getTimezoneOffset() * 60000).toISOString().slice(0,16);
    const input = document.getElementById('scheduledAt');
    if (input && !input.value) input.value = local;
  }
}

// ── SKELETON LOADER ──
function skeletonHtml(count = 3) {
  return `<div class="skeleton-wrap">${Array.from({length: count}, () => `
    <div class="skeleton-post">
      <div class="skeleton-head">
        <div class="skeleton-avatar"></div>
        <div style="flex:1;display:flex;flex-direction:column;gap:0.3rem">
          <div class="skeleton-line w-40"></div>
          <div class="skeleton-line w-60 short"></div>
        </div>
      </div>
      <div class="skeleton-line w-80" style="margin-top:0.5rem"></div>
      <div class="skeleton-line w-100"></div>
      <div class="skeleton-line w-60"></div>
    </div>
  `).join('')}</div>`;
}

// ── TRUNCATED POST CONTENT ──
function truncatedContent(text, id) {
  if (!text) return '';
  if (text.length <= 300) return `<div class="post-body">${linkifyContent(text)}</div>`;
  const short = text.slice(0, 300);
  const rest = text.slice(300);
  return `<div class="post-body">
    <span class="post-trunc-text" id="pt-${id}">${linkifyContent(short)}<span class="post-read-more" data-post-action="expand-post" data-post-id="${id}">… читать дальше</span><span class="post-rest hidden" id="pr-${id}">${linkifyContent(rest)}</span></span>
  </div>`;
}
function expandPost(id) {
  document.getElementById(`pr-${id}`)?.classList.remove('hidden');
  document.querySelector(`#pt-${id} .post-read-more`)?.remove();
}

function postHtml(p) {
  let repostBanner = '';
  if (p.repost_of && p.original) {
    repostBanner = `<div class="post-repost">↻ ${esc(p.display_name)} reposted</div>`;
    // show original post content
    const o = p.original;
    let oTrack = '';
    if (o.track_url) {
      const url = o.track_url.trim();
      if (/soundcloud\.com/.test(url)) {
        const encoded = encodeURIComponent(url);
        oTrack = `<iframe class="sc-player" width="100%" height="166" scrolling="no" frameborder="no" allow="autoplay" src="https://w.soundcloud.com/player/?url=${encoded}&amp;color=%231c1c1c&amp;auto_play=false&amp;hide_related=true&amp;show_comments=false&amp;show_user=false&amp;show_reposts=false"></iframe>`;
      } else {
        oTrack = `<div class="post-track">${iconCut('mic', 'ui-icon post-track-ic', 12, 12)} <a href="${safeUrl(url)}" target="_blank" rel="noopener">${truncUrl(url)}</a></div>`;
      }
    }
    let oImg = '';
    if (o.image) oImg = `<div class="post-img" data-post-action="open-image" data-image="${esc(o.image)}"><img src="${esc(o.image)}" loading="lazy" alt=""></div>`;
    return `
      <div class="post" data-id="${p.id}">
        ${repostBanner}
        <div class="post-head">
          ${avatarEl(o.avatar, 'avatar', initial(o.display_name))}
          <span class="post-name" data-post-action="go-profile" data-username="${esc(o.username)}">${esc(o.display_name)}${verifiedBadge(o.is_verified, o.badge_type)}</span>
          <span class="post-handle">@${esc(o.username)}</span>
          <span class="post-time">${timeAgoEl(o.created_at)}</span>
        </div>
        ${o.text_pos === 'below'
          ? `${oImg}${oTrack}${o.content ? `<div class="post-body post-body-below">${linkifyContent(o.content)}</div>` : ''}`
          : `${o.content ? truncatedContent(o.content, o.id) : ''}${oImg}${oTrack}`}
        ${actionsHtml(p)}
        <div class="comments hidden" id="cmts-${p.id}"></div>
      </div>
    `;
  }

  let track = '';
  if (p.track_url) {
    const url = p.track_url.trim();
    if (/soundcloud\.com/.test(url)) {
      const encoded = encodeURIComponent(url);
      track = `<div class="sc-wrap" data-post-action="track-play" data-post-id="${p.id}"><iframe class="sc-player" width="100%" height="166" scrolling="no" frameborder="no" allow="autoplay" src="https://w.soundcloud.com/player/?url=${encoded}&amp;color=%231c1c1c&amp;auto_play=false&amp;hide_related=true&amp;show_comments=false&amp;show_user=false&amp;show_reposts=false"></iframe></div>`;
    } else {
      track = `<div class="post-track">${iconCut('mic', 'ui-icon post-track-ic', 12, 12)} <a href="${safeUrl(url)}" target="_blank" rel="noopener" data-post-action="track-play" data-post-id="${p.id}">${truncUrl(url)}</a></div>`;
    }
  }
  let img = '';
  if (p.image) img = `<div class="post-img" data-post-action="open-image" data-image="${esc(p.image)}"><img src="${esc(p.image)}" loading="lazy" alt=""></div>`;

  // poll
  let pollHtml = '';
  if (p.poll) {
    const voted = !!p.poll.my_vote;
    const opts = p.poll.options.map(o => {
      const pct = p.poll.total > 0 ? Math.round(o.votes / p.poll.total * 100) : 0;
      const isMine = p.poll.my_vote === o.id;
      if (voted) {
        return `<div class="poll-result ${isMine?'poll-mine':''}" style="cursor:pointer" data-post-action="poll-vote" data-post-id="${p.id}" data-poll-id="${p.poll.id}" data-opt-id="${o.id}" title="Изменить голос">
          <div class="poll-bar-wrap"><div class="poll-bar" style="width:${pct}%"></div></div>
          <span class="poll-label">${esc(o.text)}</span>
          <span class="poll-pct">${pct}%</span>
        </div>`;
      }
      return `<button class="poll-option" data-post-action="poll-vote" data-post-id="${p.id}" data-poll-id="${p.poll.id}" data-opt-id="${o.id}">${esc(o.text)}</button>`;
    }).join('');
    const total = p.poll.total;
    pollHtml = `<div class="poll-container" id="poll-${p.id}">${opts}<div class="poll-total">${total} ${total===1?'голос':total<5?'голоса':'голосов'}</div></div>`;
  }

  const pinBanner = p.is_pinned ? `<div class="post-pin-banner"><span class="pinned-bar-pin-ic">${iconCut('pin', 'ui-icon', 14, 14)}</span> Закреплено</div>` : '';
  const archBanner = p.archived ? `<div class="post-pin-banner" style="color:var(--fg3)"><span class="pinned-bar-pin-ic">${iconCut('bookmark-filled', 'ui-icon', 13, 13)}</span> Архив</div>` : '';
  const urlMatch = p.content ? p.content.match(/https?:\/\/[^\s<>"']+/) : null;
  const previewUrl = urlMatch ? urlMatch[0] : null;
  const linkPreviewEl = previewUrl ? `<div class="post-link-preview" data-url="${esc(previewUrl)}" style="display:none"></div>` : '';
  return `
    <div class="post" data-id="${p.id}">
      ${pinBanner}${archBanner}
      <div class="post-head">
        ${avatarEl(p.avatar, 'avatar', initial(p.display_name))}
        <span class="post-name" data-post-action="go-profile" data-username="${esc(p.username)}">${esc(p.display_name)}${verifiedBadge(p.is_verified, p.badge_type)}</span>
        <span class="post-handle">@${esc(p.username)}</span>
        <span class="post-time">${timeAgoEl(p.created_at)}</span>
      </div>
      ${p.text_pos === 'below'
        ? `${img}${track}${pollHtml}${p.content ? `<div class="post-body post-body-below">${linkifyContent(p.content)}</div>` : ''}${linkPreviewEl}`
        : `${p.content ? truncatedContent(p.content, p.id) : ''}${linkPreviewEl}${img}${track}${pollHtml}`}
      ${actionsHtml(p)}
      <div class="comments hidden" id="cmts-${p.id}"></div>
    </div>
  `;
}

async function loadLinkPreviews(container) {
  const previews = container.querySelectorAll('.post-link-preview[data-url]');
  for (const el of previews) {
    const url = el.dataset.url;
    if (!url || el.dataset.loaded) continue;
    el.dataset.loaded = '1';
    try {
      const data = await api('/link-preview?url=' + encodeURIComponent(url));
      if (!data || (!data.title && !data.image)) continue;
      el.style.display = '';
      // Build DOM nodes manually — no innerHTML to prevent XSS from og: fields
      const a = document.createElement('a');
      a.href = safeUrl(url);
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.className = 'link-preview-card';
      if (data.image) {
        const img = document.createElement('img');
        img.src = safeUrl(data.image) || '';
        img.alt = '';
        img.className = 'link-preview-img';
        img.onerror = () => { img.style.display = 'none'; };
        a.appendChild(img);
      }
      const text = document.createElement('div');
      text.className = 'link-preview-text';
      if (data.site) { const s = document.createElement('div'); s.className = 'link-preview-site'; s.textContent = data.site; text.appendChild(s); }
      if (data.title) { const t = document.createElement('div'); t.className = 'link-preview-title'; t.textContent = data.title; text.appendChild(t); }
      if (data.description) { const d2 = document.createElement('div'); d2.className = 'link-preview-desc'; d2.textContent = data.description; text.appendChild(d2); }
      a.appendChild(text);
      el.innerHTML = '';
      el.appendChild(a);
    } catch {}
  }
}

async function voteOnPoll(postId, pollId, optId, btn) {
  try {
    const d = await api(`/posts/${postId}/poll/${optId}`, { method: 'POST' });
    // Re-render poll in place
    const container = document.getElementById(`poll-${postId}`);
    if (!container) return;
    const opts = d.options.map(o => {
      const pct = d.total > 0 ? Math.round(o.votes / d.total * 100) : 0;
      const isMine = d.my_vote === o.id;
      return `<div class="poll-result ${isMine?'poll-mine':''}" style="cursor:pointer" data-post-action="poll-vote" data-post-id="${postId}" data-poll-id="${pollId}" data-opt-id="${o.id}" title="Изменить голос">
        <div class="poll-bar-wrap"><div class="poll-bar" style="width:${pct}%"></div></div>
        <span class="poll-label">${esc(o.text)}</span>
        <span class="poll-pct">${pct}%</span>
      </div>`;
    }).join('');
    const total = d.total;
    container.innerHTML = opts + `<div class="poll-total">${total} ${total===1?'голос':total<5?'голоса':'голосов'}</div>`;
  } catch (e) { toast.error(e.message); }
}

let _playedPosts = new Set();
function trackPlay(postId) {
  if (_playedPosts.has(postId)) return;
  _playedPosts.add(postId);
  api(`/posts/${postId}/play`, { method: 'POST' }).catch(() => {});
}

function actionsHtml(p) {
  const isOwn = me && me.id === p.user_id;
  const del = isOwn ? `<button class="act" title="Удалить" data-post-action="delete" data-post-id="${p.id}">${iconCut('trash', 'ui-icon', 16, 16)}</button>` : '';
  const pin = isOwn
    ? p.is_pinned
      ? `<button class="act act-pin on" title="Открепить" data-post-action="unpin" data-post-id="${p.id}">${iconCut('unpin', 'ui-icon', 16, 16)}</button>`
      : `<button class="act act-pin" title="Закрепить" data-post-action="pin" data-post-id="${p.id}">${iconCut('pin', 'ui-icon', 16, 16)}</button>`
    : '';
  const archive = isOwn
    ? p.archived
      ? `<button class="act act-archive on" title="Разархивировать" data-post-action="unarchive" data-post-id="${p.id}">${iconCut('unlock', 'ui-icon', 16, 16)}</button>`
      : `<button class="act act-archive" title="Архивировать" data-post-action="archive" data-post-id="${p.id}">${iconCut('lock', 'ui-icon', 16, 16)}</button>`
    : '';
  const report = (me && me.id !== p.user_id)
    ? `<button class="act act-report" title="Пожаловаться" data-post-action="report" data-post-id="${p.id}">${iconCut('warning', 'ui-icon', 16, 16)}</button>`
    : '';
  const copyLink = `<button class="act" title="Копировать ссылку" data-post-action="copy-link" data-post-id="${p.id}">${iconCut('share', 'ui-icon', 16, 16)}</button>`;
  const plays = (p.play_count > 0) ? `<span class="post-plays">${iconCut('play', 'ui-icon post-plays-ic', 12, 12)}<span class="post-plays-n">${p.play_count}</span></span>` : '';
  const bm = me ? `<button class="act${p.bookmarked?' on':''}" title="${p.bookmarked?'Убрать из сохранённых':'Сохранить'}" data-post-action="bookmark" data-post-id="${p.id}">${bookmarkIconHtml(!!p.bookmarked)}</button>` : '';
  const createdMs = new Date((p.created_at||'').replace(' ','T') + ((p.created_at||'').includes('Z')||(p.created_at||'').includes('T')?'':'Z')).getTime();
  const ageHr = (Date.now() - createdMs) / 3600000;
  const edit = (isOwn && ageHr < 24) ? `<button class="act" title="Редактировать (Ctrl+Enter)" data-post-action="edit" data-post-id="${p.id}">${iconCut('edit', 'ui-icon', 16, 16)}</button>` : '';
  return `
    <div class="post-actions">
      <div class="act-like-wrap">
        <button class="act ${p.liked?'on':''}" title="Лайк" data-post-action="like" data-post-id="${p.id}">${likeIconHtml(!!p.liked)}</button>${p.likes ? `<span class="act-like-count" data-post-action="likers" data-post-id="${p.id}" title="Посмотреть лайки">${p.likes}</span>` : ''}
      </div>
      <button class="act act-comments" title="Комментарии" data-post-action="comments" data-post-id="${p.id}">${iconCut('comment', 'ui-icon', 15, 15)}${p.comments ? `<span class="act-side-count">${p.comments}</span>` : ''}</button>
      <button class="act ${p.reposted?'on':''}" title="Репост" data-post-action="repost" data-post-id="${p.id}" data-reposted="${p.reposted ? '1' : '0'}">${iconCut('forward', 'ui-icon', 15, 15)}${p.reposts ? `<span class="act-side-count">${p.reposts}</span>` : ''}</button>
      ${bm}${plays}${edit}${pin}${archive}${del}${report}${copyLink}
    </div>
    <div class="post-reactions-bar" data-pid="${p.id}">
      ${(p.post_reactions||[]).map(r => `<button class="reaction-btn${r.me?' me':''}" data-post-action="react-toggle" data-post-id="${p.id}" data-emoji="${r.emoji}">${r.emoji}<span>${r.count}</span></button>`).join('')}
      <button class="reaction-add-btn-post" data-post-action="react-add" data-post-id="${p.id}" title="Реакция">${iconCut('add', 'ui-icon', 14, 14)}</button>
    </div>
  `;
}

const ALLOWED_POST_EMOJI = ['🔥','💀','🎵','👀','✅','😭','❤️','💯'];

async function togglePostReact(postId, emoji, btn) {
  const bar = btn.closest('.post-reactions-bar');
  const isActive = btn.classList.contains('me');
  try {
    const r = isActive
      ? await api(`/posts/${postId}/react`, { method: 'DELETE' })
      : await api(`/posts/${postId}/react`, { method: 'POST', body: { emoji } });
    if (r?.reactions !== undefined) updateReactionsBar(bar, r.reactions, postId);
  } catch(e) { toast.error(e.message || 'Ошибка'); }
}

async function openPostReactPicker(postId, btn) {
  // Remove any existing picker
  document.querySelectorAll('.react-picker').forEach(p => p.remove());
  const picker = document.createElement('div');
  picker.className = 'react-picker';
  picker.setAttribute('role', 'listbox');
  picker.innerHTML = ALLOWED_POST_EMOJI
    .map(
      e =>
        `<button type="button" class="react-picker-btn" data-post-id="${postId}" data-emoji="${e}" aria-label="Реакция ${e}">${e}</button>`,
    )
    .join('');
  picker.addEventListener('click', ev => {
    const pickBtn = ev.target.closest('.react-picker-btn');
    if (!pickBtn) return;
    pickPostEmoji(pickBtn.dataset.postId || postId, pickBtn.dataset.emoji || '', pickBtn);
  });
  const rect = btn.getBoundingClientRect();
  picker.style.top = (window.scrollY + rect.bottom + 4) + 'px';
  picker.style.left = rect.left + 'px';
  document.body.appendChild(picker);
  setTimeout(() => document.addEventListener('click', function h(ev) {
    if (!picker.contains(ev.target)) { picker.remove(); document.removeEventListener('click', h); }
  }), 0);
}

async function pickPostEmoji(postId, emoji, btn) {
  btn.closest('.react-picker')?.remove();
  const bar = document.querySelector(`.post-reactions-bar[data-pid="${postId}"]`);
  try {
    const r = await api(`/posts/${postId}/react`, { method: 'POST', body: { emoji } });
    if (r?.reactions !== undefined && bar) updateReactionsBar(bar, r.reactions, postId);
  } catch(e) { toast.error(e.message || 'Ошибка'); }
}

function updateReactionsBar(bar, reactions, postId) {
  if (!bar) return;
  const addBtn = bar.querySelector('.reaction-add-btn-post');
  // Remove old reaction buttons
  bar.querySelectorAll('.reaction-btn').forEach(b => b.remove());
  // Re-add updated ones before the add button
  reactions.forEach(r => {
    const b = document.createElement('button');
    b.className = 'reaction-btn' + (r.me ? ' me' : '');
    b.dataset.postAction = 'react-toggle';
    b.dataset.postId = postId;
    b.dataset.emoji = r.emoji;
    b.innerHTML = `${r.emoji}<span>${r.count}</span>`;
    bar.insertBefore(b, addBtn);
  });
}

async function copyPostLink(id) {
  try {
    await navigator.clipboard.writeText(window.location.origin + '/post/' + id);
    toast('Ссылка скопирована');
  } catch {
    toast.error('Не удалось скопировать');
  }
}

async function showFollowersList(username) {
  try {
    const list = await api(`/user/${username}/followers`);
    if (!list.length) { toast('Нет подписчиков'); return; }
    showModal('Подписчики', list.map(u =>
      `<div class="modal-user-row" data-post-action="modal-go-profile" data-username="${esc(u.username)}">
        ${avatarEl(u.avatar, 'avatar avatar-sm', initial(u.display_name))}
        <span class="modal-user-name">${esc(u.display_name)}${verifiedBadge(u.is_verified, u.badge_type)}</span>
        <span class="modal-user-handle">@${esc(u.username)}</span>
      </div>`
    ).join(''));
  } catch (e) { toast.error(e.message); }
}
async function showFollowingList(username) {
  try {
    const list = await api(`/user/${username}/following`);
    if (!list.length) { toast('Нет подписок'); return; }
    showModal('Подписки', list.map(u =>
      `<div class="modal-user-row" data-post-action="modal-go-profile" data-username="${esc(u.username)}">
        ${avatarEl(u.avatar, 'avatar avatar-sm', initial(u.display_name))}
        <span class="modal-user-name">${esc(u.display_name)}${verifiedBadge(u.is_verified, u.badge_type)}</span>
        <span class="modal-user-handle">@${esc(u.username)}</span>
      </div>`
    ).join(''));
  } catch (e) { toast.error(e.message); }
}

async function archivePost(id, btn) {
  try {
    await api(`/posts/${id}/archive`, { method: 'POST' });
    const postEl = document.querySelector(`.post[data-id="${id}"]`);
    if (postEl) postEl.remove();
    toast('Пост архивирован');
  } catch (e) { toast.error(e.message); }
}
async function unarchivePost(id, btn) {
  try {
    await api(`/posts/${id}/archive`, { method: 'DELETE' });
    toast.success('Пост восстановлён');
    // Reload profile to reflect restored post
    if (page === 'profile') go('profile', pageParam);
  } catch (e) { toast.error(e.message); }
}

async function pinPost(id) {
  try {
    await api(`/posts/${id}/pin`, { method: 'POST' });
    if (page === 'profile') go('profile', pageParam || me?.username);
    else toast.success('Пост закреплён');
  } catch (e) { toast.error(e.message); }
}
async function unpinPost(id) {
  try {
    await api(`/posts/${id}/pin`, { method: 'DELETE' });
    if (page === 'profile') go('profile', pageParam || me?.username);
    else toast('Пост откреплён');
  } catch (e) { toast.error(e.message); }
}

function initial(name) { return (name||'?')[0].toUpperCase(); }
function verifiedBadge(isVerified, badgeType) {
  if (!isVerified) return '';
  const title = badgeType ? `Верифицировано: ${badgeType}` : 'Верифицированный пользователь';
  if (badgeType) {
    return `<span class="verified-badge" title="${esc(title)}">${esc(badgeType.toUpperCase())}</span>`;
  }
  return `<span class="verified-badge verified-badge--ic" title="${esc(title)}">${iconCut('check', 'ui-icon verified-badge-img', 10, 10)}</span>`;
}
function truncUrl(u) { return u.length > 45 ? u.slice(0, 45) + '…' : u; }
function linkifyContent(text) {
  const escaped = esc(text);
  return escaped
    .replace(/#([a-zA-Zа-яА-ЯёЁ0-9_]+)/g, (_, tag) =>
      `<span class="hashtag" data-post-action="go-hashtag" data-tag="${tag.toLowerCase()}">#${tag}</span>`)
    .replace(/@([a-zA-Z0-9_]{1,32})/g, (_, u) =>
      `<span class="mention" data-post-action="go-profile" data-username="${u}">@${u}</span>`);
}

// ── FEED ──
async function renderFeed(app) {
  if (!me) return go('login');
  try {
    // Show skeleton while loading
    app.innerHTML = `
      ${opiumCommandStrip('feed')}
      ${pageTitleIc('home', 'FEED')}
      ${composerHtml()}
      <div id="posts">${skeletonHtml(3)}</div>
    `;
    // fetch first batch of posts with offset/limit
    const posts = await api(`/feed?offset=0&limit=${feedLimit}`);
    const postsEl = document.getElementById('posts');
    if (postsEl) postsEl.innerHTML = posts.length ? posts.map(postHtml).join('') :
        '<div class="onboarding-empty">' +
        `<div class="onboarding-icon">${iconCut('home', 'ui-icon', 28, 28)}</div>` +
        '<div class="onboarding-title">Лента пуста</div>' +
        '<div class="onboarding-text">Подпишись на артистов, чтобы видеть их посты здесь</div>' +
        '<button class="btn btn-sm btn-ic-row" data-post-action="go-discover" style="margin-top:1rem">' + iconCut('search', 'ui-icon', 14, 14) + 'ОБЗОР</button>' +
        '</div>';
    loadLinkPreviews(document.getElementById('app')).catch(()=>{});
    // initialise feed scroll state
    feedOffset = posts.length;
    feedDone = posts.length < feedLimit;
    // attach scroll listener for infinite scroll
    window.onscroll = async () => {
      if (page !== 'feed' || feedDone || feedFetching) return;
      if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight - 200) {
        feedFetching = true;
        try {
          const more = await api(`/feed?offset=${feedOffset}&limit=${feedLimit}`);
          if (more && more.length) {
            const cont = document.getElementById('posts');
            cont.insertAdjacentHTML('beforeend', more.map(postHtml).join(''));
            feedOffset += more.length;
            if (more.length < feedLimit) feedDone = true;
          } else {
            feedDone = true;
          }
        } catch { feedDone = true; }
        finally { feedFetching = false; }
      }
    };
    bindComposerImg();
  } catch (e) { app.innerHTML = `<div class="empty">${e.message}</div>`; }
}

async function renderDiscover(app) {
  if (!me) return go('login');
  try {
    // Show skeleton while loading
    app.innerHTML = `
      ${opiumCommandStrip('discover')}
      ${pageTitleIc('search', 'DISCOVER')}
      ${opiumMetricCards([
        { label: 'mode', value: 'public', note: 'all network posts' },
        { label: 'sort', value: 'fresh', note: 'latest signal first' },
        { label: 'action', value: 'react', note: 'like, save, report' },
      ])}
      <div id="posts">${skeletonHtml(3)}</div>
    `;
    // fetch first batch of discover posts
    const posts = await api(`/discover?offset=0&limit=${discLimit}`);
    const postsEl = document.getElementById('posts');
    if (postsEl) postsEl.innerHTML = posts.length ? posts.map(postHtml).join('') :
        '<div class="empty">Пока нет постов. Будь первым.</div>';
    loadLinkPreviews(document.getElementById('app')).catch(()=>{});
    // initialise discover scroll state
    discOffset = posts.length;
    discDone = posts.length < discLimit;
    // attach scroll listener for infinite scroll
    window.onscroll = async () => {
      if (page !== 'discover' || discDone || discFetching) return;
      if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight - 200) {
        discFetching = true;
        try {
          const more = await api(`/discover?offset=${discOffset}&limit=${discLimit}`);
          if (more && more.length) {
            const cont = document.getElementById('posts');
            cont.insertAdjacentHTML('beforeend', more.map(postHtml).join(''));
            discOffset += more.length;
            if (more.length < discLimit) discDone = true;
          } else {
            discDone = true;
          }
        } catch { discDone = true; }
        finally { discFetching = false; }
      }
    };
  } catch (e) { app.innerHTML = `<div class="empty">${e.message}</div>`; }
}

// ── HEIC CONVERTER ──
function isHeic(file) {
  return /heic|heif/i.test(file.type) || /\.(heic|heif)$/i.test(file.name);
}

function loadHeic2Any() {
  if (window.heic2any) return Promise.resolve(window.heic2any);
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js';
    s.onload = () => resolve(window.heic2any);
    s.onerror = () => reject(new Error('Не удалось загрузить конвертер HEIC'));
    document.head.appendChild(s);
  });
}

async function maybeConvertHeic(file) {
  if (!isHeic(file)) return file;
  const t = toast.loading('Конвертация HEIC → JPG...');
  try {
    const h2a = await loadHeic2Any();
    const blob = await h2a({ blob: file, toType: 'image/jpeg', quality: 0.92 });
    const out = new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' });
    toast.success(`HEIC → JPG (${(out.size / 1048576).toFixed(1)} МБ)`);
    return out;
  } catch (e) {
    toast.error('Ошибка конвертации HEIC');
    throw e;
  } finally {
    if (t?.dismiss) t.dismiss();
  }
}

// ── IMAGE COMPRESSOR ──
function compressImage(file, maxMB = 4.5) {
  return new Promise(resolve => {
    const maxBytes = maxMB * 1024 * 1024;
    if (file.size <= maxBytes) { resolve(file); return; }

    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      const MAX_DIM = 1920;
      if (width > MAX_DIM || height > MAX_DIM) {
        const r = Math.min(MAX_DIM / width, MAX_DIM / height);
        width = Math.round(width * r);
        height = Math.round(height * r);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);

      const attempt = (q) => {
        canvas.toBlob(blob => {
          if (!blob) { resolve(file); return; }
          if (blob.size <= maxBytes || q <= 0.3) {
            const out = new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' });
            const from = (file.size / 1048576).toFixed(1);
            const to   = (out.size  / 1048576).toFixed(1);
            if (out.size < file.size) toast(`Сжато: ${from} МБ → ${to} МБ`);
            resolve(out);
          } else {
            attempt(Math.round((q - 0.1) * 10) / 10);
          }
        }, 'image/jpeg', q);
      };
      attempt(0.85);
    };
    img.onerror = () => resolve(file);
    img.src = url;
  });
}

function bindComposerImg() {
  const inp = $('#cImg');
  if (inp) inp.addEventListener('change', () => {
    const nm = $('#cImgName');
    if (nm) nm.textContent = inp.files[0] ? inp.files[0].name : '';
  });
  bindMentionAutocomplete('cText', 'cMentionDrop');
  // char counter
  const ta = $('#cText');
  const counter = $('#cCharCount');
  if (ta && counter) {
    const updateCounter = () => {
      const len = ta.value.length;
      counter.textContent = len > 1500 ? `${len} / 2000` : '';
      counter.classList.toggle('char-warn', len > 1500 && len <= 1900);
      counter.classList.toggle('char-over', len > 1900);
    };
    ta.addEventListener('input', updateCounter);
  }
  // draft save/restore
  if (ta) {
    const draft = localStorage.getItem('draft_post') || '';
    if (draft) { ta.value = draft; ta.dispatchEvent(new Event('input')); }
    ta.addEventListener('input', () => localStorage.setItem('draft_post', ta.value));
  }
  // track preview
  const trackInp = $('#cTrack');
  if (trackInp) {
    trackInp.addEventListener('input', () => {
      const url = trackInp.value.trim();
      let preview = $('#cTrackPreview');
      if (!preview) {
        preview = document.createElement('div');
        preview.id = 'cTrackPreview';
        preview.className = 'track-preview';
        trackInp.insertAdjacentElement('afterend', preview);
      }
      if (/soundcloud\.com/.test(url)) {
        const encoded = encodeURIComponent(url);
        preview.innerHTML = `<iframe class="sc-player" width="100%" height="100" scrolling="no" frameborder="no" allow="autoplay" src="https://w.soundcloud.com/player/?url=${encoded}&color=%231c1c1c&auto_play=false&hide_related=true&show_comments=false&show_user=true&show_reposts=false"></iframe>`;
      } else {
        preview.innerHTML = '';
      }
    });
  }
}

async function submitPost() {
  const content = $('#cText')?.value?.trim() || '';
  const track = $('#cTrack')?.value?.trim() || '';
  const file = $('#cImg')?.files[0];
  // collect poll options
  const pollInputs = [...(document.querySelectorAll('.poll-opt-input') || [])];
  const pollOptions = pollInputs.map(i => i.value.trim()).filter(Boolean);
  const hasPoll = !$('#cPollArea')?.classList.contains('hidden') && pollOptions.length >= 2;
  if (!content && !file && !hasPoll) return;
  if (track && !content && !file) { toast.error('Добавь описание к треку'); return; }
  if (content && content.length > 2000) {
    toast.error('Максимум 2000 символов');
    return;
  }
  if (hasPoll && pollOptions.length < 2) {
    toast.error('Минимум 2 варианта для опроса');
    return;
  }
  const fd = new FormData();
  fd.append('content', content);
  fd.append('track_url', track);
  fd.append('text_pos', cTextPos);
  if (file) fd.append('image', await compressImage(await maybeConvertHeic(file)));
  if (hasPoll) fd.append('poll_options', JSON.stringify(pollOptions));
  const scheduledAtInput = document.getElementById('scheduledAt');
  const schedulerPanel = document.getElementById('schedulerPanel');
  const isScheduled = scheduledAtInput && schedulerPanel && schedulerPanel.style.display !== 'none' && scheduledAtInput.value;
  if (isScheduled) {
    fd.append('scheduled_at', new Date(scheduledAtInput.value).toISOString());
  }
  try {
    await api('/posts', { method: 'POST', body: fd });
    cTextPos = 'above';
    localStorage.removeItem('draft_post');
    if (isScheduled) {
      toast.success('Пост запланирован!');
      // Reset scheduler
      if (schedulerPanel) schedulerPanel.style.display = 'none';
      const btn = document.getElementById('scheduleToggle');
      if (btn) btn.style.opacity = '0.5';
      if (scheduledAtInput) scheduledAtInput.value = '';
    }
    go(page);
  } catch (e) { toast.error(e.message); }
}

async function togLike(id, btn) {
  if (!me) return go('login');
  const on = btn.classList.contains('on');
  const wrap = btn.closest('.act-like-wrap');
  const countEl = wrap?.querySelector('.act-like-count');
  const curCount = parseInt(countEl?.textContent) || 0;
  // Optimistic update
  btn.classList.toggle('on');
  btn.innerHTML = likeIconHtml(!on);
  if (countEl) countEl.textContent = Math.max(0, curCount + (on ? -1 : 1)) || '';
  if (!on) { btn.classList.add('like-pop'); btn.addEventListener('animationend', () => btn.classList.remove('like-pop'), {once:true}); }
  try {
    const d = await api(`/posts/${id}/like`, { method: on ? 'DELETE' : 'POST' });
    btn.innerHTML = likeIconHtml(btn.classList.contains('on'));
    if (countEl) {
      countEl.textContent = d.likes || '';
    } else if (d.likes && wrap) {
      const s = document.createElement('span');
      s.className = 'act-like-count';
      s.textContent = d.likes;
      s.title = 'Посмотреть лайки';
      s.onclick = () => showLikers(id);
      wrap.appendChild(s);
    }
  } catch {
    btn.classList.toggle('on');
    btn.innerHTML = likeIconHtml(on);
    if (countEl) countEl.textContent = curCount || '';
  }
}

async function togBookmark(id, btn) {
  if (!me) return go('login');
  const on = btn.classList.contains('on');
  btn.classList.toggle('on');
  btn.innerHTML = bookmarkIconHtml(!on);
  btn.title = on ? 'Сохранить' : 'Убрать из сохранённых';
  try {
    const d = await api(`/posts/${id}/bookmark`, { method: 'POST' });
    btn.classList.toggle('on', d.bookmarked);
    btn.innerHTML = bookmarkIconHtml(!!d.bookmarked);
    btn.title = d.bookmarked ? 'Убрать из сохранённых' : 'Сохранить';
    toast(d.bookmarked ? 'Сохранено' : 'Удалено из сохранённых');
  } catch (e) {
    btn.classList.toggle('on');
    btn.innerHTML = bookmarkIconHtml(on);
    toast.error(e.message);
  }
}

async function showLikers(postId) {
  try {
    const likers = await api(`/posts/${postId}/likes`);
    if (!likers.length) { toast('Никто ещё не лайкнул'); return; }
    showModal('Лайки', likers.map(u =>
      `<div class="modal-user-row" data-post-action="modal-go-profile" data-username="${esc(u.username)}">
        ${avatarEl(u.avatar, 'avatar avatar-sm', initial(u.display_name))}
        <span class="modal-user-name">${esc(u.display_name)}</span>
        <span class="modal-user-handle">@${esc(u.username)}</span>
      </div>`
    ).join(''));
  } catch (e) { toast.error(e.message); }
}

function showModal(title, bodyHtml) {
  let overlay = document.getElementById('w0piumModal');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'w0piumModal';
    overlay.className = 'modal-overlay';
    overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
    document.body.appendChild(overlay);
  }
  overlay.innerHTML = `
    <div class="modal-box">
      <div class="modal-header-row">
        <span class="modal-title">${esc(title)}</span>
        <button class="modal-close-btn" data-post-action="modal-close" aria-label="Закрыть">${iconCut('close', 'ui-icon', 18, 18)}</button>
      </div>
      <div class="modal-scroll-body">${bodyHtml}</div>
    </div>
  `;
  overlay.classList.remove('hidden');
}

function closeModal() {
  document.getElementById('w0piumModal')?.classList.add('hidden');
}

async function editPost(id) {
  const postEl = document.querySelector(`.post[data-id="${id}"]`);
  if (!postEl) return;
  const bodyEl = postEl.querySelector('.post-body, .post-body-below');
  if (!bodyEl) { toast.error('Нет текста для редактирования'); return; }
  const current = bodyEl.textContent.trim();
  const isBelow = bodyEl.classList.contains('post-body-below');
  const ta = document.createElement('textarea');
  ta.className = 'input edit-textarea';
  ta.value = current;
  ta.rows = 3;
  ta.placeholder = 'Ctrl+Enter — сохранить · Esc — отмена';
  bodyEl.replaceWith(ta);
  ta.focus();
  ta.setSelectionRange(ta.value.length, ta.value.length);
  const restore = text => {
    const newBody = document.createElement('div');
    newBody.className = isBelow ? 'post-body post-body-below' : 'post-body';
    newBody.innerHTML = linkifyContent(text);
    ta.replaceWith(newBody);
  };
  let saving = false;
  const save = async () => {
    if (saving) return;
    const newText = ta.value.trim();
    if (!newText || newText === current) { restore(current); return; }
    saving = true;
    try {
      await api(`/posts/${id}`, { method: 'PATCH', body: { content: newText } });
      restore(newText);
      toast.success('Изменено');
    } catch (e) {
      restore(current);
      toast.error(e.message);
    }
  };
  ta.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); save(); }
    if (e.key === 'Escape') { e.preventDefault(); restore(current); }
  });
  ta.addEventListener('blur', () => setTimeout(save, 100));
}

async function renderBookmarks(app) {
  if (!me) return go('login');
  try {
    const posts = await api('/bookmarks');
    app.innerHTML = `
      ${pageTitleIc('bookmark', 'СОХРАНЁННЫЕ')}
      <div id="posts">${posts.length ? posts.map(postHtml).join('') : '<div class="empty">Нет сохранённых постов</div>'}</div>
    `;
  } catch (e) { app.innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
}

async function delPost(id) {
  if (!confirm('Удалить пост?')) return;
  try { await api(`/posts/${id}`, { method: 'DELETE' }); $(`.post[data-id="${id}"]`)?.remove(); } catch {}
}

function showRepostMenu(id, btn, alreadyReposted) {
  if (!me) return go('login');
  // Close if already open for same post
  if (_repostMenuEl) {
    const same = _repostMenuEl.dataset.pid === id;
    _repostMenuEl.remove(); _repostMenuEl = null;
    if (same) return;
  }
  const menu = document.createElement('div');
  menu.className = 'repost-menu';
  menu.dataset.pid = id;
  const repostBtn = alreadyReposted
    ? `<button class="disabled" disabled>${iconCut('check', 'ui-icon', 14, 14)} Уже репостнул</button>`
    : `<button data-post-action="repost-direct" data-post-id="${id}">${iconCut('forward', 'ui-icon', 14, 14)} Репост</button>`;
  menu.innerHTML = `
    ${repostBtn}
    <button data-post-action="quote-compose" data-post-id="${id}">${iconCut('edit', 'ui-icon', 14, 14)} Цитата</button>
  `;
  document.body.appendChild(menu);
  _repostMenuEl = menu;
  const rect = btn.getBoundingClientRect();
  const mw = menu.offsetWidth;
  let left = rect.left + rect.width / 2 - mw / 2;
  left = Math.max(8, Math.min(left, window.innerWidth - mw - 8));
  menu.style.top = (rect.bottom + 6) + 'px';
  menu.style.left = left + 'px';
  setTimeout(() => {
    document.addEventListener('click', function close(e) {
      if (_repostMenuEl && !_repostMenuEl.contains(e.target)) {
        _repostMenuEl?.remove(); _repostMenuEl = null;
      }
      document.removeEventListener('click', close);
    });
  }, 0);
}

function showReportMenu(postId, btn) {
  const prevPid = _reportMenuEl?.dataset.pid;
  if (_reportMenuEl) { _reportMenuEl.remove(); _reportMenuEl = null; }
  if (prevPid === String(postId)) return; // toggle off
  const reasons = ['СПАМ','ОСКОРБИТЕЛЬНЫЙ КОНТЕНТ','НАРУШЕНИЕ АП','ДРУГОЕ'];
  const menu = document.createElement('div');
  menu.className = 'repost-menu report-menu';
  menu.dataset.pid = postId;
  menu.innerHTML = reasons.map(r =>
    `<button data-post-action="submit-report" data-report-type="post" data-target-id="${postId}" data-reason="${r}">${r}</button>`
  ).join('');
  btn.parentElement.appendChild(menu);
  _reportMenuEl = menu;
  const close = e => { if (!menu.contains(e.target)) { menu.remove(); _reportMenuEl = null; document.removeEventListener('click', close); } };
  setTimeout(() => document.addEventListener('click', close), 0);
}

async function submitReport(type, id, reason) {
  if (_reportMenuEl) { _reportMenuEl.remove(); _reportMenuEl = null; }
  try {
    await api('/report', { method:'POST', body:{ target_type:type, target_id:id, reason } });
    toast.success('Жалоба отправлена');
  } catch(e) { toast.error(e.message); }
}

async function repostDirect(id) {
  _repostMenuEl?.remove(); _repostMenuEl = null;
  const fd = new FormData();
  fd.append('content', ''); fd.append('repost_of', id);
  try { await api('/posts', { method: 'POST', body: fd }); go(page); } catch {}
}

function showQuoteCompose(postId) {
  _repostMenuEl?.remove(); _repostMenuEl = null;
  const existing = document.getElementById(`qc-${postId}`);
  if (existing) { existing.remove(); return; }
  const postEl = document.querySelector(`.post[data-id="${postId}"]`);
  if (!postEl) return;
  const div = document.createElement('div');
  div.id = `qc-${postId}`;
  div.className = 'quote-compose';
  div.innerHTML = `
    <textarea class="input" id="qt-${postId}" placeholder="Добавь комментарий к репосту..." rows="2"></textarea>
    <div class="quote-compose-actions">
      <button class="btn-ghost btn-ic-row" data-post-action="quote-cancel" data-post-id="${postId}">${iconCut('close', 'ui-icon', 14, 14)} ОТМЕНА</button>
      <button class="btn btn-sm btn-ic-row" data-post-action="quote-submit" data-post-id="${postId}">${iconCut('forward', 'ui-icon', 14, 14)} РЕПОСТ</button>
    </div>
  `;
  postEl.insertAdjacentElement('afterend', div);
  div.querySelector('textarea')?.focus();
}

async function submitQuote(postId) {
  const txt = (document.getElementById(`qt-${postId}`)?.value || '').trim();
  if (!txt) return;
  const fd = new FormData();
  fd.append('content', txt); fd.append('repost_of', postId);
  try {
    await api('/posts', { method: 'POST', body: fd });
    document.getElementById(`qc-${postId}`)?.remove();
    go(page);
  } catch {}
}

async function togCmts(id) {
  const sec = $(`#cmts-${id}`);
  if (!sec) return;
  if (!sec.classList.contains('hidden')) { sec.classList.add('hidden'); return; }
  sec.classList.remove('hidden');
  sec.innerHTML = '<div class="empty" style="padding:0.5rem 0">· · ·</div>';
  try {
    const cmts = await api(`/posts/${id}/comments`);
    let h = cmts.map(c => `
      <div class="cmt">
        <span class="cmt-name" data-post-action="go-profile" data-username="${esc(c.username)}">${esc(c.display_name)}</span>${esc(c.content)}
        <span class="cmt-time">${timeAgo(c.created_at)}</span>
      </div>
    `).join('');
    if (me) h += `
      <div class="cmt-form">
        <input type="text" placeholder="Комментарий..." id="ci-${id}" data-post-action="comment-input" data-post-id="${id}">
        <button class="cmt-send" data-post-action="send-comment" data-post-id="${id}" aria-label="Отправить">${iconCut('send', 'ui-icon', 18, 18)}</button>
      </div>
    `;
    sec.innerHTML = h || '<div class="empty" style="padding:0.5rem 0;font-size:0.7rem">Нет комментариев</div>' + (me ? h : '');
  } catch {}
}

async function sendCmt(id) {
  const inp = $(`#ci-${id}`);
  const content = inp?.value?.trim();
  if (!content) return;
  try {
    await api(`/posts/${id}/comments`, { method:'POST', body: { content } });
    if (inp) inp.value = '';
    // refresh comments if section is visible
    const sec = $(`#cmts-${id}`);
    if (sec) {
      // fetch updated comments list
      const cmts = await api(`/posts/${id}/comments`);
      let h = cmts.map(c => `
        <div class="cmt">
          <span class="cmt-name" data-post-action="go-profile" data-username="${esc(c.username)}">${esc(c.display_name)}</span>${esc(c.content)}
          <span class="cmt-time">${timeAgo(c.created_at)}</span>
        </div>
      `).join('');
      if (me) h += `
        <div class="cmt-form">
          <input type="text" placeholder="Комментарий..." id="ci-${id}" data-post-action="comment-input" data-post-id="${id}">
          <button class="cmt-send" data-post-action="send-comment" data-post-id="${id}" aria-label="Отправить">${iconCut('send', 'ui-icon', 18, 18)}</button>
        </div>
      `;
      sec.innerHTML = h || '<div class="empty" style="padding:0.5rem 0;font-size:0.7rem">Нет комментариев</div>' + (me ? h : '');
      sec.classList.remove('hidden');
    }
  } catch {}
}

// ── HASHTAG ──
async function renderHashtag(app, tag) {
  if (!me) return go('login');
  if (!tag) return go('feed');
  app.innerHTML = `${pageTitleIcRaw('search', '#' + esc(tag))}<div id="hashPosts"><div class="empty">· · ·</div></div>`;
  try {
    const posts = await api(`/hashtag/${encodeURIComponent(tag)}`);
    const el = $('#hashPosts');
    el.innerHTML = posts.length ? posts.map(postHtml).join('') : '<div class="empty">Нет постов с этим тегом</div>';
  } catch { $('#hashPosts').innerHTML = '<div class="empty">Ошибка загрузки</div>'; }
}

// ── ARTISTS ──
async function renderArtists(app) {
  const artists = await api('/artists');
  app.innerHTML = `
    ${opiumCommandStrip('search')}
    ${opiumMetricCards([
      { label: 'network', value: artists.length, note: 'artists inside' },
      { label: 'access', value: 'invite', note: 'closed graph' },
      { label: 'signal', value: 'profiles', note: 'links and posts' },
    ])}
    ${pageTitleIc('profile', 'ARTISTS')}
    <div class="search-wrap"><input class="input" id="artistsSearchInput" type="text" placeholder="Поиск артистов..."></div>
    <div id="artList">${artists.length ? artists.map(artRow).join('') : '<div class="empty">Пока никого нет</div>'}</div>
  `;
  const searchInput = document.getElementById('artistsSearchInput');
  if (searchInput) searchInput.addEventListener('input', e => searchArt(e.target.value));
}

function artRow(a) {
  return `
    <div class="artist-row" role="button" tabindex="0" data-post-action="go-profile" data-username="${esc(a.username)}">
      ${avatarEl(a.avatar, 'avatar', initial(a.display_name))}
      <div class="artist-info">
        <div class="artist-name">@${esc(a.username)}${verifiedBadge(a.is_verified, a.badge_type)}</div>
        <div class="artist-bio">${esc(a.bio || '')}</div>
      </div>
      <div class="artist-count"><div>${a.followers || 0}</div><div class="artist-since">${a.created_at ? timeAgo(a.created_at) : ''}</div></div>
    </div>
  `;
}

let _st;
function searchArt(q) {
  clearTimeout(_st);
  _st = setTimeout(async () => {
    if (!q.trim()) {
      const a = await api('/artists');
      $('#artList').innerHTML = a.length ? a.map(artRow).join('') : '<div class="empty">Пока никого нет</div>';
      return;
    }
    const r = await api('/search?q=' + encodeURIComponent(q) + '&type=users');
    $('#artList').innerHTML = r.users && r.users.length ? r.users.map(artRow).join('') : '<div class="empty">Ничего не найдено</div>';
  }, 250);
}

// ── SEARCH ──
async function renderSearch(app, initQuery) {
  if (!me) return go('login');
  let activeTab = 'all';
  let kbIndex = -1;
  let recentSearches = [];
  const searchCoreHeader = `
    ${opiumCommandStrip('search')}
    ${opiumMetricCards([
      { label: 'scope', value: 'all', note: 'users, posts, dm, files' },
      { label: 'keys', value: 'up/down', note: 'keyboard navigation' },
      { label: 'jump', value: 'enter', note: 'open result fast' },
    ])}`;
  try {
    recentSearches = JSON.parse(localStorage.getItem('search_recent_queries') || '[]');
    if (!Array.isArray(recentSearches)) recentSearches = [];
  } catch { recentSearches = []; }
  const persistRecent = q => {
    if (!q || q.length < 2) return;
    recentSearches = [q, ...recentSearches.filter(x => x !== q)].slice(0, 8);
    try { localStorage.setItem('search_recent_queries', JSON.stringify(recentSearches)); } catch {}
  };
  app.innerHTML = `
    ${searchCoreHeader}
    ${pageTitleIc('search', 'ПОИСК')}
    <div class="search-bar">
      <input class="input" id="searchInput" placeholder="Введи запрос..." value="${esc(initQuery||'')}" autocomplete="off" autocorrect="off" spellcheck="false">
    </div>
    <div class="search-tabs">
      <button class="search-tab active" data-post-action="search-tab" data-tab="all">${iconCut('search', 'ui-icon', 12, 12)} ВСЕ</button>
      <button class="search-tab" data-post-action="search-tab" data-tab="users">${iconCut('profile', 'ui-icon', 12, 12)} ЛЮДИ</button>
      <button class="search-tab" data-post-action="search-tab" data-tab="posts">${iconCut('home', 'ui-icon', 12, 12)} ПОСТЫ</button>
      <button class="search-tab" data-post-action="search-tab" data-tab="messages">${iconCut('comment', 'ui-icon', 12, 12)} СООБЩЕНИЯ</button>
      <button class="search-tab" data-post-action="search-tab" data-tab="files">${iconCut('disk', 'ui-icon', 12, 12)} ФАЙЛЫ</button>
    </div>
    <div id="searchRecent" class="search-recent"></div>
    <div id="searchResults"></div>
  `;
  const input = $('#searchInput');
  const recentEl = $('#searchRecent');
  const renderRecent = () => {
    if (!recentEl) return;
    if (!recentSearches.length || (input.value || '').trim().length >= 2) {
      recentEl.innerHTML = '';
      return;
    }
    recentEl.innerHTML = `<div class="search-recent-label">Недавние:</div>${recentSearches.map(q =>
      `<button class="search-recent-chip" data-post-action="search-recent-chip" data-query="${esc(q)}">${esc(q)}</button>`
    ).join('')}`;
  };
  let searchTimer = null;
  input.addEventListener('input', () => {
    kbIndex = -1;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => runSearch(activeTab), 350);
    renderRecent();
  });
  input.addEventListener('keydown', e => {
    const items = $$('#searchResults .search-kb-item');
    if (e.key === 'ArrowDown' && items.length) {
      e.preventDefault();
      kbIndex = (kbIndex + 1 + items.length) % items.length;
      items.forEach((it, i) => it.classList.toggle('search-kb-active', i === kbIndex));
      items[kbIndex]?.scrollIntoView({ block: 'nearest' });
      return;
    }
    if (e.key === 'ArrowUp' && items.length) {
      e.preventDefault();
      kbIndex = (kbIndex - 1 + items.length) % items.length;
      items.forEach((it, i) => it.classList.toggle('search-kb-active', i === kbIndex));
      items[kbIndex]?.scrollIntoView({ block: 'nearest' });
      return;
    }
    if (e.key === 'Enter' && kbIndex >= 0 && items[kbIndex]) {
      e.preventDefault();
      items[kbIndex].click();
      return;
    }
    if (e.key === 'Enter') {
      clearTimeout(searchTimer);
      runSearch(activeTab);
    }
  });
  const switchSearchTab = t => {
    activeTab = t;
    $$('.search-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === t));
    runSearch(t);
  };
  const tabsWrap = app.querySelector('.search-tabs');
  if (tabsWrap) {
    tabsWrap.addEventListener('click', e => {
      const btn = e.target.closest('[data-post-action="search-tab"]');
      if (!btn) return;
      switchSearchTab(btn.dataset.tab || 'all');
    });
  }
  app.addEventListener('click', e => {
    const chip = e.target.closest('[data-post-action="search-recent-chip"]');
    if (!chip) return;
    input.value = chip.dataset.query || '';
    kbIndex = -1;
    runSearch(activeTab);
  });
  if (initQuery) runSearch(activeTab);
  else {
    setTimeout(() => input.focus(), 50);
    renderRecent();
  }

  async function runSearch(tab) {
    const q = input.value.trim();
    const el = $('#searchResults');
    if (!q || q.length < 2) { el.innerHTML = ''; return; }
    el.innerHTML = '<div class="empty">· · ·</div>';
    try {
      // Hashtag shortcut: #tag → hashtag endpoint
      if (q.startsWith('#')) {
        const tag = q.slice(1).replace(/[^a-zа-яёa-z0-9_]/gi, '');
        if (!tag) { el.innerHTML = ''; return; }
        const posts = await api(`/hashtag/${encodeURIComponent(tag)}`);
        el.innerHTML = posts.length ? posts.map(postHtml).join('') : '<div class="empty">Постов с таким тегом не найдено</div>';
        return;
      }
      const r = await api(`/search?q=${encodeURIComponent(q)}&type=${tab}`);
      let html = '';
      if (tab === 'users') {
        html = r.users.length
          ? r.users.map(u => `<div class="artist-row search-kb-item" role="button" tabindex="0" data-post-action="go-profile" data-username="${esc(u.username)}">
              ${avatarEl(u.avatar,'avatar-sm',initial(u.display_name))}
              <div class="artist-info"><div class="artist-name">${esc(u.display_name)}</div><div class="artist-handle">@${esc(u.username)}</div></div>
            </div>`).join('')
          : '<div class="empty">Никого не найдено</div>';
      } else if (tab === 'posts') {
        html = r.posts.length ? r.posts.map(postHtml).join('') : '<div class="empty">Постов не найдено</div>';
      } else if (tab === 'messages') {
        html = r.messages?.length ? r.messages.map(m => {
          const chatName = m.is_group ? (m.title || 'Группа') : (m.other_name || 'Диалог');
          return `<div class="artist-row search-kb-item" role="button" tabindex="0" data-post-action="jump-to-message" data-msg-id="${esc(m.id)}" data-conv-id="${esc(m.conv_id)}">
            ${avatarEl(m.avatar, 'avatar-sm', initial(m.display_name))}
            <div class="artist-info">
              <div class="artist-name" style="font-size:12px;color:var(--muted)">${esc(chatName)} · ${esc(m.display_name)}</div>
              <div class="artist-bio">${esc((m.content||'').slice(0,80))}</div>
            </div>
          </div>`;
        }).join('') : '<div class="empty">Сообщений не найдено</div>';
      } else if (tab === 'files') {
        html = r.files?.length ? r.files.map(f => `
          <div class="artist-row search-kb-item" role="button" tabindex="0" data-post-action="go-disk">
            <div class="artist-info">
              <div class="artist-name">${esc(f.name)}</div>
              <div class="artist-bio">${fmtBytes(f.size || 0)} · ${esc((f.description || '').slice(0,80)) || 'Файл на диске'}</div>
            </div>
          </div>
        `).join('') : '<div class="empty">Файлов не найдено</div>';
      } else {
        const blocks = [];
        if (r.users?.length) blocks.push(`<div class="search-section"><div class="search-section-title">ЛЮДИ</div>${r.users.map(u => `<div class="artist-row search-kb-item" role="button" tabindex="0" data-post-action="go-profile" data-username="${esc(u.username)}">${avatarEl(u.avatar,'avatar-sm',initial(u.display_name))}<div class="artist-info"><div class="artist-name">${esc(u.display_name)}</div><div class="artist-handle">@${esc(u.username)}</div></div></div>`).join('')}</div>`);
        if (r.messages?.length) blocks.push(`<div class="search-section"><div class="search-section-title">СООБЩЕНИЯ</div>${r.messages.map(m => `<div class="artist-row search-kb-item" role="button" tabindex="0" data-post-action="jump-to-message" data-msg-id="${esc(m.id)}" data-conv-id="${esc(m.conv_id)}"><div class="artist-info"><div class="artist-name">${esc(m.display_name)}</div><div class="artist-bio">${esc((m.content||'').slice(0,80))}</div></div></div>`).join('')}</div>`);
        if (r.files?.length) blocks.push(`<div class="search-section"><div class="search-section-title">ФАЙЛЫ</div>${r.files.map(f => `<div class="artist-row search-kb-item" role="button" tabindex="0" data-post-action="go-disk"><div class="artist-info"><div class="artist-name">${esc(f.name)}</div><div class="artist-bio">${fmtBytes(f.size || 0)}</div></div></div>`).join('')}</div>`);
        if (r.posts?.length) blocks.push(`<div class="search-section"><div class="search-section-title">ПОСТЫ</div>${r.posts.map(postHtml).join('')}</div>`);
        html = blocks.join('') || '<div class="empty">Ничего не найдено</div>';
      }
      el.innerHTML = html;
      persistRecent(q);
      renderRecent();
      kbIndex = -1;
    } catch { el.innerHTML = '<div class="empty">Ошибка поиска</div>'; }
  }
}

// ── PROFILE ──
async function renderProfile(app, username) {
  if (!username && me) username = me.username;
  if (!username) return go('login');
  try {
    const u = await api(`/user/${username}`);
    const posts = await api(`/user/${username}/posts`);
    const isMe = me && me.id === u.id;

    const links = [];
    if (u.link_sc) links.push(`<a href="${safeUrl(u.link_sc)}" target="_blank">SC</a>`);
    if (u.link_ig) links.push(`<a href="${safeUrl(u.link_ig)}" target="_blank">IG</a>`);
    if (u.link_tg) links.push(`<a href="${safeUrl(u.link_tg)}" target="_blank">TG</a>`);
    if (u.link_spotify) links.push(`<a href="${safeUrl(u.link_spotify)}" target="_blank">SPOTIFY</a>`);
    if (u.link_site) links.push(`<a href="${safeUrl(u.link_site)}" target="_blank">SITE</a>`);

    let btns = '';
    if (isMe) {
      btns = `<button class="btn btn-sm btn-ghost btn-ic-pad" data-post-action="go-settings" title="Настройки">${iconCut('settings', 'ui-icon', 15, 15)}</button>`;
    } else if (me) {
      const followBtn = u.is_following
        ? `<button class="btn btn-sm btn-ghost btn-ic-pad" data-post-action="unfollow-user" data-user-id="${u.id}" data-username="${esc(username)}" title="Отписаться">${iconCut('remove', 'ui-icon', 15, 15)}</button>`
        : u.is_pending
        ? `<button class="btn btn-sm btn-ghost btn-ic-pad" data-post-action="unfollow-user" data-user-id="${u.id}" data-username="${esc(username)}" title="Запрос отправлен">${iconCut('close', 'ui-icon', 15, 15)}</button>`
        : `<button class="btn btn-sm btn-ic-pad" data-post-action="follow-user" data-user-id="${u.id}" data-username="${esc(username)}" title="Подписаться">${iconCut('add', 'ui-icon', 15, 15)}</button>`;
      const msgBtn = !u.blocks_me ? `<button class="btn btn-sm btn-ic-pad" data-post-action="start-chat" data-user-id="${u.id}" data-username="${esc(u.username)}" title="Написать">${iconCut('comment', 'ui-icon', 15, 15)}</button>` : '';
      const blockBtn = u.is_blocked
        ? `<button class="btn btn-sm btn-ghost btn-block-tog btn-ic-pad" data-post-action="unblock-user" data-username="${esc(username)}" title="Разблокировать">${iconCut('unlock', 'ui-icon', 15, 15)}</button>`
        : `<button class="btn btn-sm btn-ghost btn-block-tog btn-ic-pad" data-post-action="block-user" data-username="${esc(username)}" title="Заблокировать">${iconCut('lock', 'ui-icon', 15, 15)}</button>`;
      const muteBtn = u.is_muted
        ? `<button class="btn btn-sm btn-ghost btn-ic-pad" data-post-action="unmute-user" data-username="${esc(username)}" title="Включить в ленте">${iconCut('notifications', 'ui-icon', 15, 15)}</button>`
        : `<button class="btn btn-sm btn-ghost btn-ic-pad" style="color:var(--fg3)" data-post-action="mute-user" data-username="${esc(username)}" title="Скрыть из ленты">${iconCut('mute', 'ui-icon', 15, 15)}</button>`;
      const blockedNotice = u.blocks_me ? `<div class="profile-blocked-notice">Этот пользователь тебя заблокировал</div>` : '';
      btns = (u.is_blocked ? blockBtn : followBtn + msgBtn + blockBtn + muteBtn) + blockedNotice;
    }

    const allPosts = Array.isArray(posts) ? posts : (posts.posts || []);
    const trackPosts = allPosts.filter(p => p.track_url);
    const archivedPosts = isMe ? allPosts.filter(p => p.archived && !p.repost_of) : [];

    app.innerHTML = `
      <div class="profile-top">
        ${isMe ? `
          <div class="avatar avatar-lg profile-ava-wrap" data-post-action="profile-avatar-pick">
            ${u.avatar ? `<img src="${u.avatar}" loading="lazy" alt="">` : initial(u.display_name)}
            <div class="profile-ava-overlay">${iconCut('camera', 'ui-icon', 18, 18)}</div>
          </div>
          <input type="file" id="profileAvaFile" accept="image/*,.heic,.heif" style="display:none">
        ` : avatarEl(u.avatar, 'avatar avatar-lg', initial(u.display_name))}
        <div class="profile-name">${esc(u.display_name)}${verifiedBadge(u.is_verified, u.badge_type)}</div>
        <div class="profile-handle">@${esc(u.username)}</div>
        ${u.bio ? `<div class="profile-bio">${esc(u.bio)}</div>` : ''}
        <div class="profile-nums">
          <div class="profile-num" data-post-action="show-posts-count" style="cursor:${u.posts>0?'pointer':'default'}"><strong>${u.posts}</strong><span class="profile-num-lbl">${iconCut('home', 'ui-icon profile-num-ic', 11, 11)}POSTS</span></div>
          <div class="profile-num" data-post-action="show-followers" data-username="${esc(u.username)}" style="cursor:${u.followers>0?'pointer':'default'}"><strong>${u.followers}</strong><span class="profile-num-lbl">${iconCut('profile', 'ui-icon profile-num-ic', 11, 11)}FOLLOWERS</span></div>
          <div class="profile-num" data-post-action="show-following" data-username="${esc(u.username)}" style="cursor:${u.following>0?'pointer':'default'}"><strong>${u.following}</strong><span class="profile-num-lbl">${iconCut('forward', 'ui-icon profile-num-ic', 11, 11)}FOLLOWING</span></div>
        </div>
        ${links.length ? `<div class="profile-socials">${links.join('')}</div>` : ''}
        <div class="profile-btns">${btns}</div>
      </div>
      ${opiumMetricCards([
        { label: 'posts', value: u.posts || 0, note: 'public output' },
        { label: 'tracks', value: trackPosts.length, note: 'audio signal' },
        { label: 'links', value: links.length, note: 'outside presence' },
      ])}
      <div class="profile-tabs">
        <button class="profile-tab active" data-post-action="profile-tab" data-tab-id="postsTab">${iconCut('home', 'ui-icon', 12, 12)}ПОСТЫ</button>
        <button class="profile-tab" data-post-action="profile-tab" data-tab-id="tracksTab">${iconCut('mic', 'ui-icon', 12, 12)}ТРЕКИ${trackPosts.length ? ` <span class="tab-count">${trackPosts.length}</span>` : ''}</button>
        ${isMe ? `<button class="profile-tab" data-post-action="profile-tab" data-tab-id="bmTab">${iconCut('bookmark', 'ui-icon', 12, 12)}СОХРАНЁННЫЕ</button>` : ''}
        ${isMe && archivedPosts.length ? `<button class="profile-tab" data-post-action="profile-tab" data-tab-id="archTab">${iconCut('lock', 'ui-icon', 12, 12)}АРХИВ <span class="tab-count">${archivedPosts.length}</span></button>` : ''}
      </div>
      <div id="postsTab">${allPosts.filter(p=>!p.archived).length ? allPosts.filter(p=>!p.archived).map(postHtml).join('') : '<div class="empty">Нет постов</div>'}</div>
      <div id="tracksTab" class="hidden">${trackPosts.length ? trackPosts.map(postHtml).join('') : '<div class="empty">Нет треков</div>'}</div>
      ${isMe ? `<div id="bmTab" class="hidden"><div class="empty empty-big">· · ·</div></div>` : ''}
      ${isMe && archivedPosts.length ? `<div id="archTab" class="hidden">${archivedPosts.map(postHtml).join('')}</div>` : ''}
    `;
    const profileAvaFile = document.getElementById('profileAvaFile');
    if (profileAvaFile) profileAvaFile.addEventListener('change', upAvaProfile);
    loadLinkPreviews(app).catch(()=>{});
  } catch { app.innerHTML = '<div class="empty">Артист не найден</div>'; }
}

async function upAvaProfile() {
  const f = document.getElementById('profileAvaFile')?.files?.[0];
  if (!f) return;
  const fd = new FormData(); fd.append('avatar', f);
  try {
    const d = await api('/avatar', { method: 'POST', body: fd });
    me = await api('/me'); csrfToken = me.csrf_token || '';
    // update avatar in place
    const wrap = document.querySelector('.profile-ava-wrap');
    if (wrap) {
      wrap.innerHTML = `<img src="${d.avatar}" loading="lazy" alt=""><div class="profile-ava-overlay">${iconCut('camera', 'ui-icon', 18, 18)}</div>`;
    }
    toast.success('Фото обновлено');
  } catch (e) { toast.error(e.message); }
}

function showPostsCount() { /* posts tab is already visible */ }

async function doFollow(id, u) { try { await api(`/follow/${id}`, { method:'POST' }); go('profile',u); } catch(e) { toast.error(e.message); } }
async function unfollow(id, u) { try { await api(`/follow/${id}`, { method:'DELETE' }); go('profile',u); } catch(e) { toast.error(e.message); } }

async function blockUser(username) {
  if (!confirm(`Заблокировать @${username}?`)) return;
  try {
    await api(`/user/${username}/block`, { method: 'POST' });
    go('profile', username);
  } catch (e) { toast.error(e.message); }
}
async function unblockUser(username) {
  try {
    await api(`/user/${username}/block`, { method: 'DELETE' });
    go('profile', username);
  } catch (e) { toast.error(e.message); }
}

async function muteUser(username) {
  try {
    await api(`/user/${username}/mute`, { method: 'POST' });
    toast('Пользователь замьючен — его посты скрыты из ленты');
    go('profile', username);
  } catch(e) { toast.error(e.message); }
}
async function unmuteUser(username) {
  try {
    await api(`/user/${username}/mute`, { method: 'DELETE' });
    toast.success('Мьют снят');
    go('profile', username);
  } catch(e) { toast.error(e.message); }
}

function switchProfileTab(btn, tabId) {
  document.querySelectorAll('.profile-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  ['postsTab','tracksTab','archTab','bmTab'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('hidden', id !== tabId);
  });
  // lazy load bookmarks tab
  if (tabId === 'bmTab') {
    const cont = document.getElementById('bmTab');
    if (cont && cont.querySelector('.empty-big')) {
      api('/bookmarks').then(posts => {
        cont.innerHTML = posts.length ? posts.map(postHtml).join('') : '<div class="empty">Нет сохранённых постов</div>';
      }).catch(() => { cont.innerHTML = '<div class="empty">Ошибка загрузки</div>'; });
    }
  }
}

// ── SETTINGS ──
async function renderSettings(app) {
  if (!me) return go('login');
  let u;
  try { u = await api('/me'); } catch (e) { app.innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
  app.innerHTML = `
    ${pageTitleIc('settings', 'НАСТРОЙКИ')}
    <div class="settings">

      <!-- ── ПРОФИЛЬ ── -->
      <div class="settings-section">
        <div class="settings-section-title">ПРОФИЛЬ</div>
        <div class="settings-avatar-row">
          ${avatarEl(u.avatar, 'avatar avatar-lg', initial(u.display_name))}
          <div class="settings-avatar-info">
            <span class="settings-username">@${esc(u.username)}</span>
            <button class="btn btn-sm btn-ghost btn-ic-row" data-post-action="settings-avatar-pick">${iconCut('camera', 'ui-icon', 14, 14)}ИЗМЕНИТЬ ФОТО</button>
          </div>
          <input type="file" id="avaFile" accept="image/*,.heic,.heif" style="display:none">
        </div>
        <div class="field">
          <label>ИМЯ <span class="field-hint-inline">· видно всем в ленте и профиле</span></label>
          <input class="input" id="sName" value="${esc(u.display_name)}">
        </div>
        <div class="field">
          <label>BIO <span class="field-hint-inline">· до 200 символов</span></label>
          <textarea class="input" id="sBio" rows="3">${esc(u.bio)}</textarea>
        </div>
      </div>

      <!-- ── ССЫЛКИ ── -->
      <div class="settings-section">
        <div class="settings-section-title">ССЫЛКИ <span class="field-hint-inline">· только https://, показываются в профиле</span></div>
        <div class="field"><label>SOUNDCLOUD</label><input class="input" id="sSc" value="${esc(u.link_sc)}" placeholder="https://soundcloud.com/..." autocomplete="off"></div>
        <div class="field"><label>INSTAGRAM</label><input class="input" id="sIg" value="${esc(u.link_ig)}" placeholder="https://instagram.com/..." autocomplete="off"></div>
        <div class="field"><label>TELEGRAM</label><input class="input" id="sTg" value="${esc(u.link_tg)}" placeholder="https://t.me/..." autocomplete="off"></div>
        <div class="field"><label>SPOTIFY</label><input class="input" id="sSp" value="${esc(u.link_spotify)}" placeholder="https://open.spotify.com/..." autocomplete="off"></div>
        <div class="field"><label>WEBSITE</label><input class="input" id="sSite" name="website" autocomplete="url" value="${esc(u.link_site||'')}" placeholder="https://..."></div>
      </div>

      <!-- ── ПРИВАТНОСТЬ ── -->
      <div class="settings-section">
        <div class="settings-section-title">ПРИВАТНОСТЬ</div>
        <div class="stg-toggle-row">
          <div class="stg-toggle-info">
            <div class="stg-toggle-label">ПРИВАТНЫЙ ПРОФИЛЬ</div>
            <div class="stg-toggle-desc">Твои посты и дропы видны только подписчикам</div>
          </div>
          <label class="toggle-wrap">
            <input type="checkbox" id="sPrivate" ${u.is_private ? 'checked' : ''}>
            <span class="toggle-track"></span>
          </label>
        </div>
        <div class="stg-toggle-row">
          <div class="stg-toggle-info">
            <div class="stg-toggle-label">ЗАПРОСЫ НА ДМ</div>
            <div class="stg-toggle-desc">Незнакомые сначала отправляют запрос — ты решаешь принять или нет</div>
          </div>
          <label class="toggle-wrap">
            <input type="checkbox" id="sDmRequests" ${u.dm_requests !== 0 ? 'checked' : ''}>
            <span class="toggle-track"></span>
          </label>
        </div>
        <div class="stg-toggle-row">
          <div class="stg-toggle-info">
            <div class="stg-toggle-label">СТАТУС ПРОЧТЕНИЯ</div>
            <div class="stg-toggle-desc">Показывать собеседнику, что ты прочитал его сообщения</div>
          </div>
          <label class="toggle-wrap">
            <input type="checkbox" id="sReadReceipts" ${u.show_read_receipts !== 0 ? 'checked' : ''}>
            <span class="toggle-track"></span>
          </label>
        </div>
        <div class="stg-toggle-row">
          <div class="stg-toggle-info">
            <div class="stg-toggle-label">СТАТУС НАБОРА ТЕКСТА</div>
            <div class="stg-toggle-desc">Показывать собеседнику, что ты набираешь сообщение</div>
          </div>
          <label class="toggle-wrap">
            <input type="checkbox" id="sShowTyping" ${u.show_typing !== 0 ? 'checked' : ''}>
            <span class="toggle-track"></span>
          </label>
        </div>
        <div class="stg-toggle-row">
          <div class="stg-toggle-info">
            <div class="stg-toggle-label">PUSH-УВЕДОМЛЕНИЯ</div>
            <div class="stg-toggle-desc">Получай уведомления о новых сообщениях и активности, даже когда вкладка закрыта</div>
          </div>
          <label class="toggle-wrap" id="pushToggleWrap">
            <input type="checkbox" id="sPush">
            <span class="toggle-track"></span>
          </label>
        </div>
      </div>

      <div class="gap-row">
        <button class="btn btn-ic-row" data-post-action="save-profile">${iconCut('check', 'ui-icon', 15, 15)}СОХРАНИТЬ</button>
        <button class="btn btn-ghost btn-ic-row" data-post-action="do-logout">${iconCut('lock', 'ui-icon', 15, 15)}ВЫЙТИ</button>
      </div>

      <!-- ── ИНВАЙТ-КОД ── -->
      <div class="settings-section">
        <div class="settings-section-title">ИНВАЙТ-КОД</div>
        <div class="stg-toggle-desc" style="margin-bottom:0.5rem">Поделись с другом — он укажет при регистрации</div>
        <div class="invite-row">
          <span class="invite-code" id="sInviteCode">${esc(u.invite_code || '—')}</span>
          <button class="btn btn-sm btn-ghost btn-ic-row" data-post-action="rotate-invite">${iconCut('download', 'ui-icon', 13, 13)}SYNC</button>
        </div>
      </div>

      <!-- ── УСТРОЙСТВА ── -->
      <div class="settings-section">
        <div class="settings-section-title">УСТРОЙСТВА</div>
        <div class="stg-toggle-desc" style="margin-bottom:0.75rem">Активные сессии (все устройства где ты залогинен)</div>
        <div id="sessionsList"><div class="empty" style="font-size:0.7rem">· · ·</div></div>
        <div style="display:flex;gap:0.5rem;margin-top:0.75rem">
          <button class="btn btn-sm btn-ghost btn-ic-row" data-post-action="load-sessions">${iconCut('download', 'ui-icon', 13, 13)}SYNC</button>
          <button class="btn btn-sm btn-ghost btn-ic-row" style="border-color:var(--red);color:var(--red)" data-post-action="revoke-other-sessions">${iconCut('remove', 'ui-icon', 13, 13)}ВЫЙТИ НА ВСЕХ ДРУГИХ</button>
        </div>
      </div>

      <!-- ── ВЕРИФИКАЦИЯ ── -->
      <div class="settings-section">
        <div class="settings-section-title">ВЕРИФИКАЦИЯ</div>
        ${u.is_verified ? `
          <div class="verify-status verified">
            ${verifiedBadge(true, u.badge_type)} Аккаунт верифицирован
            ${u.badge_type ? `<span class="fg3">· ${esc(u.badge_type)}</span>` : ''}
          </div>
        ` : `
          <div class="stg-toggle-desc" style="margin-bottom:1rem">Подай заявку на верификацию — администратор рассмотрит в ближайшее время.</div>
          <div class="field">
            <label>ТИП ЗНАЧКА <span class="field-hint-inline">· напр. ARTIST, TEAM, LABEL</span></label>
            <input class="input" id="vBadgeType" placeholder="ARTIST" maxlength="20">
          </div>
          <div class="field">
            <label>ПРИЧИНА <span class="field-hint-inline">· до 500 символов</span></label>
            <textarea class="input" id="vReason" rows="3" placeholder="Кратко объясни, почему хочешь верификацию..."></textarea>
          </div>
          <div id="vReqErr" class="msg-err" style="margin-bottom:0.5rem"></div>
          <button class="btn btn-sm btn-ic-row" id="submitVerifyRequestBtn" data-post-action="submit-verify-request">${iconCut('forward', 'ui-icon', 14, 14)}ПОДАТЬ ЗАЯВКУ</button>
        `}
      </div>

      <!-- ── БЕЗОПАСНОСТЬ ── -->
      <div class="settings-section">
        <div class="settings-section-title">БЕЗОПАСНОСТЬ</div>
        <div class="field"><label>ТЕКУЩИЙ ПАРОЛЬ</label><input class="input" id="sOld" type="password" placeholder="Введи текущий пароль" autocomplete="current-password"></div>
        <div class="field"><label>НОВЫЙ ПАРОЛЬ</label><input class="input" id="sNew" type="password" placeholder="Мин. 8 символов" autocomplete="new-password"><div id="pwStrength" class="pw-strength"></div></div>
        <div class="field"><label>ПОВТОРИ НОВЫЙ</label><input class="input" id="sNew2" type="password" placeholder="Ещё раз новый пароль" autocomplete="new-password"></div>
        <div class="gap-row mt">
          <button class="btn btn-sm btn-ic-row" data-post-action="change-password">${iconCut('lock', 'ui-icon', 14, 14)}СМЕНИТЬ ПАРОЛЬ</button>
        </div>
        <div class="stg-danger-row">
          <button class="btn btn-sm btn-ghost btn-ic-row stg-export-data" data-post-action="export-data">${iconCut('download', 'ui-icon', 16, 16)}ЭКСПОРТ ДАННЫХ</button>
          <span class="stg-toggle-desc">Скачать все свои посты, сообщения и файлы в JSON</span>
        </div>
        <div class="stg-danger-row">
          <button class="btn btn-sm btn-danger btn-ic-row" data-post-action="delete-account">${iconCut('trash', 'ui-icon', 14, 14)}УДАЛИТЬ АККАУНТ</button>
          <span class="stg-toggle-desc">Удаляет все данные — необратимо</span>
        </div>
      </div>

    </div>
  `;
  dirtySettings = false;
  setTimeout(() => {
    document.querySelectorAll('.settings .input').forEach(el =>
      el.addEventListener('input', () => { dirtySettings = true; })
    );
    const newPassInput = document.getElementById('sNew');
    if (newPassInput) newPassInput.addEventListener('input', e => checkPwStrength(e.target.value));
    const avaFileInput = document.getElementById('avaFile');
    if (avaFileInput) avaFileInput.addEventListener('change', upAva);
    const pushToggle = document.getElementById('sPush');
    if (pushToggle) pushToggle.addEventListener('change', e => togglePushNotifications(e.target.checked));
    initPushState();
    loadSessions();
  }, 50);
}

function _beforeUnloadHandler(e) {
  if (dirtySettings) { e.preventDefault(); e.returnValue = ''; }
}
window.addEventListener('beforeunload', _beforeUnloadHandler);

async function saveProfile() {
  try {
    await api('/profile', { method:'PUT', body: {
      display_name: $('#sName').value,
      bio: $('#sBio').value,
      link_sc: $('#sSc').value,
      link_ig: $('#sIg').value,
      link_tg: $('#sTg').value,
      link_spotify: $('#sSp').value,
      link_site: $('#sSite').value,
      is_private: $('#sPrivate')?.checked ? 1 : 0,
      dm_requests: $('#sDmRequests')?.checked ? 1 : 0,
      show_read_receipts: $('#sReadReceipts')?.checked ? 1 : 0,
      show_typing: $('#sShowTyping')?.checked ? 1 : 0,
    }});
    me = await api('/me'); csrfToken = me.csrf_token || ''; renderNav();
    dirtySettings = false;
    toast.success('Настройки сохранены');
  } catch (e) { toast.error(e.message); }
}

async function rotateInvite() {
  try {
    const d = await api('/invite/rotate', { method: 'POST' });
    const el = document.getElementById('sInviteCode');
    if (el && d.invite_code) el.textContent = d.invite_code;
    toast.success('Инвайт-код обновлён');
  } catch (e) {
    toast.error(e.message);
  }
}

async function upAva() {
  const f = $('#avaFile').files[0];
  if (!f) return;
  const fd = new FormData(); fd.append('avatar', f);
  try { await api('/avatar', { method: 'POST', body: fd }); me = await api('/me'); csrfToken = me.csrf_token || ''; go('settings'); } catch {}
}

async function submitVerifyRequest() {
  const badge_type = ($('#vBadgeType')?.value || '').trim().toUpperCase();
  const reason = ($('#vReason')?.value || '').trim();
  const errEl = document.getElementById('vReqErr');
  if (errEl) errEl.textContent = '';
  if (!badge_type || !reason) {
    if (errEl) errEl.textContent = 'Заполни все поля';
    return;
  }
  try {
    await api('/verify-request', { method:'POST', body:{ badge_type, reason } });
    toast.success('Заявка отправлена');
    const btn = document.getElementById('submitVerifyRequestBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'ЗАЯВКА ОТПРАВЛЕНА'; }
  } catch (e) {
    if (errEl) errEl.textContent = e.message || 'Ошибка';
  }
}

// Change password handler
async function changePassword() {
  const oldPass = $('#sOld')?.value || '';
  const newPass = $('#sNew')?.value || '';
  const newPass2 = $('#sNew2')?.value || '';
  if (!oldPass || !newPass || !newPass2) { toast.error('Заполни все поля'); return; }
  if (newPass.length < 8) { toast.error('Новый пароль — мин. 8 символов'); return; }
  if (newPass !== newPass2) { toast.error('Пароли не совпадают'); return; }
  try {
    await api('/password', { method:'PUT', body: { old_password: oldPass, new_password: newPass } });
    toast.success('Пароль обновлён');
    $('#sOld').value = '';
    $('#sNew').value = '';
    $('#sNew2').value = '';
  } catch (e) {
    toast.error(e.message);
  }
}

// ── SESSION MANAGEMENT ──
async function loadSessions() {
  const list = document.getElementById('sessionsList');
  if (!list) return;
  try {
    const sessions = await api('/sessions');
    list.innerHTML = sessions.map(s => `
      <div class="session-row">
        <div class="session-info">
          <div class="session-ua">${esc(s.user_agent.slice(0,60) || 'Неизвестное устройство')}</div>
          <div class="session-meta">${esc(s.ip || '—')} · ${timeAgo(s.created_at)}${s.is_current ? ' · <span style="color:var(--green)">текущая</span>' : ''}</div>
        </div>
      </div>
    `).join('') || '<div class="empty" style="font-size:0.7rem">Нет данных</div>';
  } catch { }
}
async function revokeOtherSessions() {
  if (!confirm('Выйти со всех устройств кроме текущего?')) return;
  await api('/sessions/others', { method: 'DELETE' });
  toast.success('Выполнено');
  loadSessions();
}

// ── PASSWORD STRENGTH ──
function checkPwStrength(val) {
  const el = document.getElementById('pwStrength');
  if (!el) return;
  if (!val) { el.innerHTML = ''; return; }
  const checks = [val.length >= 8, /[a-zA-Zа-яА-Я]/.test(val), /[0-9]/.test(val)];
  const score = checks.filter(Boolean).length;
  const labels = ['', 'СЛАБЫЙ', 'СРЕДНИЙ', 'НАДЁЖНЫЙ'];
  const colors = ['', 'var(--red)', '#f59e0b', 'var(--green)'];
  el.innerHTML = `<span style="color:${colors[score]};font-size:0.62rem;letter-spacing:0.08em">${labels[score]}</span>`;
}

// Delete account handler
async function deleteAccount() {
  if (!confirm('Удалить аккаунт навсегда?')) return;
  try {
    await api('/me', { method:'DELETE' });
    me = null;
    renderNav();
    go('discover');
  } catch (e) {
    toast.error(e.message);
  }
}

async function doLogout() {
  try { await api('/logout', { method: 'POST' }); } catch {}
  me = null; renderNav(); go('discover');
}

// ── NOTIFICATIONS ──
async function renderNotifs(app) {
  if (!me) return go('login');
  let notifs;
  try { notifs = await api('/notifications'); } catch (e) { app.innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
  me.notif_count = 0; renderNav();
  if (!notifs.length) { app.innerHTML = `${pageTitleIc('notifications', 'УВЕДОМЛЕНИЯ', 16, 16)}<div class="onboarding-empty"><div class="onboarding-icon">${iconCut('notifications', 'ui-icon', 28, 28)}</div><div class="onboarding-title">Всё тихо</div><div class="onboarding-text">Здесь будут лайки, комментарии и новые подписчики</div></div>`; return; }

  const typeMap = { like: '♥ лайкнул пост', comment: '🥀 прокомментировал', follow: '→ подписался', repost: '↻ репостнул', dm: '✦ прислал сообщение', follow_request: 'хочет подписаться на тебя' };
  // Aggregate DM notifications: one entry per conversation
  const seen = new Set();
  const dedupedNotifs = notifs.filter(n => {
    if (n.type === 'dm' && n.ref_id) {
      if (seen.has(n.ref_id)) return false;
      seen.add(n.ref_id);
    }
    return true;
  });
  app.innerHTML = `
    ${pageTitleIc('notifications', 'УВЕДОМЛЕНИЯ', 16, 16)}
    ${dedupedNotifs.map(n => `
      <div class="artist-row" data-post-action="${n.type==='dm' && n.ref_id ? 'go-chat' : 'go-profile'}" data-conv-id="${esc(n.ref_id || '')}" data-username="${esc(n.username || '')}" style="cursor:pointer">
        ${avatarEl(n.avatar, 'avatar', initial(n.display_name))}
        <div class="artist-info">
          <div class="artist-name">${esc(n.display_name)}</div>
          <div class="artist-bio">${typeMap[n.type] || n.type}</div>
        </div>
        <div class="artist-count">${timeAgo(n.created_at)}</div>
      </div>
    `).join('')}
  `;
  // Show pending follow requests at top
  const requests = await api('/follow-requests').catch(() => []);
  if (requests.length) {
    const reqHtml = requests.map(r => `
      <div class="notif-row follow-req-row">
        ${avatarEl(r.avatar, 'avatar avatar-sm', initial(r.display_name))}
        <div class="notif-text">
          <strong data-post-action="go-profile" data-username="${esc(r.username)}" style="cursor:pointer">@${esc(r.username)}</strong>
          хочет подписаться на тебя
        </div>
        <div style="display:flex;gap:0.4rem;margin-left:auto">
          <button class="btn btn-sm btn-ic-pad" data-post-action="accept-follow-req" data-request-id="${esc(r.id)}" aria-label="Принять">${iconCut('check', 'ui-icon', 15, 15)}</button>
          <button class="btn btn-sm btn-ghost" data-post-action="decline-follow-req" data-request-id="${esc(r.id)}" aria-label="Отклонить">${iconCut('close', 'ui-icon', 15, 15)}</button>
        </div>
      </div>`).join('');
    app.insertAdjacentHTML('afterbegin', `<div class="follow-reqs-section">${reqHtml}</div>`);
  }
}

// ── CHATS ──
async function renderChats(app) {
  if (!me) return go('login');
  if (me) { me.unread_chats = 0; renderNav(); }
  await loadChats();
}

function showCreateGroupModal() {
  if (document.getElementById('groupModal')) return;
  const modal = document.createElement('div');
  modal.id = 'groupModal';
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-box">
      <div class="modal-title">НОВАЯ ГРУППА</div>
      <input class="input" id="gmTitle" placeholder="Название группы" maxlength="60">
      <div class="field-hint" style="margin:0.5rem 0 0.25rem">Участники (через запятую, @username):</div>
      <textarea class="input" id="gmMembers" rows="3" placeholder="@username1, @username2"></textarea>
      <div class="modal-btns">
        <button class="btn btn-sm btn-ghost btn-ic-row" data-post-action="close-group-modal">${iconCut('close', 'ui-icon', 14, 14)}ОТМЕНА</button>
        <button class="btn btn-sm btn-ic-row" data-post-action="create-group">${iconCut('add', 'ui-icon', 14, 14)}СОЗДАТЬ</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  document.getElementById('gmTitle')?.focus();
}

async function createGroup() {
  const title = document.getElementById('gmTitle')?.value?.trim();
  const membersRaw = document.getElementById('gmMembers')?.value || '';
  if (!title) { toast.error('Введи название группы'); return; }
  const names = membersRaw.split(',').map(s => s.trim().replace(/^@/, '')).filter(Boolean);
  if (!names.length) { toast.error('Добавь хотя бы одного участника'); return; }
  // resolve usernames to IDs via search
  let memberIds = [];
  for (const name of names) {
    try {
      const r = await api(`/user/${name}`);
      if (r.id) memberIds.push(r.id);
    } catch {}
  }
  if (!memberIds.length) { toast.error('Участники не найдены'); return; }
  try {
    const d = await api('/chats', { method: 'POST', body: { title, members: memberIds } });
    document.getElementById('groupModal')?.remove();
    if (d.id) go('chat', d.id);
    else go('chats');
  } catch (e) { toast.error(e.message); }
}

function chatRow(c, activeId = '') {
  const unread = c.unread || 0;
  // Determine display name and avatar(s)
  let name = '';
  let avatarHtml = '';
  const isOnline = !c.is_group && c.other_last_seen && (Date.now() - new Date(c.other_last_seen + (c.other_last_seen.includes('Z') ? '' : 'Z')).getTime()) < 3 * 60_000;
  if (c.is_group) {
    name = c.title || 'Группа';
    // show up to 3 member avatars
    const avatars = c.members.slice(0, 3).map(m => avatarEl(m.avatar, 'avatar-sm', initial(m.display_name))).join('');
    avatarHtml = `<div class="avatar-group">${avatars}</div>`;
  } else {
    // direct chat: find the other participant
    const other = c.members.find(u => !sameId(u.id, me?.id)) || c.members[0];
    if (other) {
      name = other.display_name;
      const rawAvatar = avatarEl(other.avatar, 'avatar', initial(other.display_name));
      avatarHtml = `<div class="chat-row-ava-wrap">${rawAvatar}${isOnline ? '<span class="online-dot"></span>' : ''}</div>`;
    }
  }
  // Determine last message preview. Escape text content but leave image tags intact.
  let lastHtml = '';
  const m = c.last;
  if (m) {
    if (m.deleted_at) lastHtml = '[удалено]';
    else if (m.content) lastHtml = esc(m.content);
    else if (m.file) {
      if (m.file_type && m.file_type.startsWith('image/')) {
        lastHtml = `<img src="${esc(m.file)}" class="chat-thumb" alt="">`;
      } else if (m.file_type && m.file_type.startsWith('video/')) {
        lastHtml = `<span class="chat-preview-kind">${iconCut('media', 'ui-icon chat-preview-ic', 12, 12)}видео</span>`;
      } else if (m.file_type && m.file_type.startsWith('audio/')) {
        lastHtml = `<span class="chat-preview-kind">${iconCut('mic', 'ui-icon chat-preview-ic', 12, 12)}голосовое</span>`;
      } else {
        lastHtml = `<span class="chat-preview-kind">${iconCut('file', 'ui-icon chat-preview-ic', 12, 12)}файл</span>`;
      }
    }
  }
  const isPending = c.my_accepted === false;
  const hasDraft = !!localStorage.getItem(`draft_${c.id}`);
  const rowTime = formatChatListTime(m?.created_at);
  const isMuted = !!(c.muted_until && new Date(c.muted_until) > new Date());
  const isPinned = chatIsPinned(c);
  const isArchived = !!c.archived_at;
  return `
    <div class="chat-row${isPending ? ' chat-row-pending' : ''}${activeId && c.id === activeId ? ' chat-row-active' : ''}" data-post-action="go-chat" data-conv-id="${c.id}" role="link" tabindex="0">
      <div class="chat-row-avatar">${avatarHtml}</div>
      <div class="chat-row-body">
        <div class="chat-row-top">
          <span class="chat-name">${esc(name)}${hasDraft ? '<span class="chat-draft-note">черновик</span>' : ''}</span>
          <span class="chat-row-meta">
            ${isPinned ? `<span class="chat-row-icon" title="Закреплен">${iconCut('pin', 'ui-icon', 11, 11)}</span>` : ''}
            ${isArchived ? `<span class="chat-row-icon" title="Архив">${iconCut('disk', 'ui-icon', 11, 11)}</span>` : ''}
            ${isMuted ? `<span class="chat-row-icon" title="Без звука">${iconCut('mute', 'ui-icon', 11, 11)}</span>` : ''}
            ${rowTime ? `<span class="chat-row-time">${esc(rowTime)}</span>` : ''}
          </span>
        </div>
        <div class="chat-last">${lastHtml}</div>
      </div>
      <div class="chat-row-badges">
        ${isPending ? `<div class="chat-pending-badge">ЗАПРОС</div>` : unread>0 ? `<div class="chat-unread">${unread}</div>` : ''}
      </div>
    </div>
  `;
}

function chatEmptyStateHtml(title = 'чат', conv = null) {
  const label = conv?.is_group ? 'Начните разговор в группе' : 'Напишите первое сообщение';
  return `<div class="chat-empty-state">
    <div class="chat-empty-icon">${iconCut(conv?.is_group ? 'comment' : 'send', 'ui-icon', 28, 28)}</div>
    <div class="chat-empty-title">${esc(title || 'Чат')}</div>
    <div class="chat-empty-sub">${esc(label)}</div>
  </div>`;
}

async function renderChat(app, cid) {
  if (!me) return go('login');
  if (!cid) return go('chats');

  // Save draft when leaving previous chat
  if (window._prevChatId && window._prevChatId !== cid) {
    const prevTxt = document.getElementById('msgText');
    if (prevTxt && prevTxt.value.trim()) {
      localStorage.setItem(`draft_${window._prevChatId}`, prevTxt.value);
    } else {
      localStorage.removeItem(`draft_${window._prevChatId}`);
    }
  }
  window._prevChatId = cid;

  currentChatId = cid;
  // fetch chat list and get conversation details
  let conv = null;
  let chats = [];
  let archivedChats = [];
  try {
    const both = await Promise.all([api('/chats'), api('/chats?archived=1')]);
    chats = both[0] || [];
    archivedChats = both[1] || [];
    conv = [...chats, ...archivedChats].find(c => c.id === cid);
  } catch {}
  // fetch messages with pagination support
  let msgs = [], myAccepted = true;
  let has_more = false;
  chatPinnedMsg = null;
  try {
    const r = await api(`/chats/${cid}/messages`);
    msgs = r.messages || [];
    chatOtherLastRead = r.other_last_read || null;
    if (r.my_accepted === false) myAccepted = false;
    has_more = !!r.has_more;
    chatPinnedMsg = r.pinned_msg || null;
  } catch {}
  window._chatHasMore = has_more;
  window._chatOldestTs = msgs.length ? msgs[0].created_at : null;
  window._chatLoadingMore = false;

  // Store muted state
  window._chatMutedUntil = conv?.muted_until || null;
  window._currentChatConv = conv;
  const isMuted = conv?.muted_until && new Date(conv.muted_until) > new Date();

  // build header title + avatar
  let title = 'Диалог';
  let headAvatarHtml = '';
  let dmOther = null;
  let lastSeenText = null;
  if (conv) {
    if (conv.is_group) {
      title = conv.title;
      const members = (conv.members || []).filter(m => !sameId(m.id, me?.id)).slice(0, 3);
      if (members.length) {
        headAvatarHtml = `<div class="avatar-group chat-head-group-ava">${members.map(m => avatarEl(m.avatar, 'avatar-sm', initial(m.display_name))).join('')}</div>`;
      }
    } else {
      const other = (conv.members || []).find(u => !sameId(u.id, me?.id)) || (conv.members || [])[0];
      if (other) {
        title = other.display_name;
        headAvatarHtml = avatarEl(other.avatar, 'avatar-sm', initial(other.display_name));
        dmOther = other;
      }
      if (conv.other_last_seen) lastSeenText = formatLastSeen(conv.other_last_seen);
    }
  }

  const unreadCount = conv?.unread || 0;
  const virtualRender = getVirtualChatRender(msgs, unreadCount, conv);
  const msgsHtml = virtualRender.html;
  const acceptedChats = sortChatsForSidebar(chats.filter(c => c.my_accepted !== false));
  const acceptedArchivedChats = sortChatsForSidebar(archivedChats.filter(c => c.my_accepted !== false));
  const pendingChats = chats.filter(c => c.my_accepted === false);
  const renderSidebarRows = () => {
    const source = chatSidebarFilters.archived ? acceptedArchivedChats : acceptedChats;
    const filtered = source.filter(c => {
      if (chatSidebarFilters.unread && !(c.unread > 0)) return false;
      if (chatSidebarFilters.muted && !chatIsMuted(c)) return false;
      if (chatSidebarFilters.pinned && !chatIsPinned(c)) return false;
      return true;
    });
    return `
      ${!chatSidebarFilters.archived && pendingChats.length ? `<div class="dm-section-title">ЗАПРОСЫ (${pendingChats.length})</div>${pendingChats.map(c => chatRow(c, cid)).join('')}` : ''}
      ${filtered.length ? filtered.map(c => chatRow(c, cid)).join('') : '<div class="empty">Нет диалогов</div>'}
    `;
  };

  lastMsgTime = msgs.length ? msgs[msgs.length-1].created_at : '';
  document.body.classList.add('in-chat');
  // render chat view
  app.innerHTML = `
  <div class="chat-layout">
    <aside class="chat-sidebar">
      <div class="chat-sidebar-head">
        <div class="chat-sidebar-title">ЧАТЫ</div>
        <button class="btn btn-sm btn-ic-pad" data-post-action="open-new-group-chat" title="Новая группа">${iconCut('add', 'ui-icon', 15, 15)} ГРУППА</button>
      </div>
      <div class="chat-sidebar-filters">
        <button type="button" id="chatFilterAll" class="chat-filter-btn${!chatSidebarFilters.unread && !chatSidebarFilters.muted && !chatSidebarFilters.pinned && !chatSidebarFilters.archived ? ' active' : ''}">ВСЕ</button>
        <button type="button" id="chatFilterUnread" class="chat-filter-btn chat-filter-btn--ic${chatSidebarFilters.unread ? ' active' : ''}">${iconCut('comment', 'ui-icon', 12, 12)}НЕПРОЧИТ.</button>
        <button type="button" id="chatFilterMuted" class="chat-filter-btn${chatSidebarFilters.muted ? ' active' : ''}">${iconCut('mute', 'ui-icon', 13, 13)}</button>
        <button type="button" id="chatFilterPinned" class="chat-filter-btn${chatSidebarFilters.pinned ? ' active' : ''}">${iconCut('pin', 'ui-icon', 13, 13)}</button>
        <button type="button" id="chatFilterArchived" class="chat-filter-btn${chatSidebarFilters.archived ? ' active' : ''}">${iconCut('disk', 'ui-icon', 13, 13)}</button>
      </div>
      <div class="chat-sidebar-search-wrap">
        <span class="chat-sidebar-search-ic" aria-hidden="true">${iconCut('search', 'ui-icon', 14, 14)}</span>
        <input class="chat-sidebar-search" id="chatSidebarSearch" placeholder="Поиск чатов..." autocomplete="off">
      </div>
      <div class="chat-sidebar-list" id="chatSidebarList">${renderSidebarRows()}</div>
    </aside>
    <div class="chat-view">
    <div id="realtimeStatusBar" class="realtime-status-bar${realtimeDisconnected ? '' : ' hidden'}"></div>
    <div class="chat-head">
      <button type="button" class="chat-back" data-post-action="go-chats" aria-label="Назад к чатам">${iconCut('back', 'ui-icon', 20, 20)}</button>
      <div class="chat-head-main${!conv?.is_group && dmOther ? ' chat-head-main--click' : ''}" ${!conv?.is_group && dmOther ? `data-post-action="open-user-info-panel" data-username="${esc(dmOther.username)}"` : ''}>
        <div class="chat-head-avatar">${headAvatarHtml}</div>
        <div class="chat-head-titles">
          <div class="chat-title">${esc(title)}</div>
          ${lastSeenText ? `<div class="chat-lastseen">${lastSeenText}</div>` : (conv?.is_group ? `<div class="chat-lastseen">${(conv.members||[]).length} участников</div>` : '')}
        </div>
      </div>
      <div class="chat-head-tools">
        ${conv && conv.is_group ? `<button type="button" class="chat-tool-btn chat-tool-btn--icon" data-post-action="leave-group-chat" data-conv-id="${conv.id}" title="Покинуть группу">${iconCut('remove', 'ui-icon', 18, 18)}</button>` : ''}
        ${conv && conv.is_group ? `<button type="button" class="chat-tool-btn chat-tool-btn--icon" data-post-action="toggle-group-members" title="Участники">${iconCut('more-horizontal', 'ui-icon', 18, 18)}</button>` : ''}
        ${conv && conv.is_group && conv.owner === me?.id ? `<button type="button" class="chat-tool-btn chat-tool-btn--icon" data-post-action="edit-group-info" data-conv-id="${conv.id}" title="Группа">${iconCut('edit', 'ui-icon', 18, 18)}</button>` : ''}
        <button type="button" class="chat-tool-btn chat-tool-btn--icon" data-post-action="open-media-gallery" data-conv-id="${cid}" title="Медиа">${iconCut('media', 'ui-icon', 18, 18)}</button>
        <button type="button" class="chat-tool-btn chat-tool-btn--icon" id="chatSearchBtn" data-post-action="toggle-chat-search" data-conv-id="${cid}" title="Поиск">${iconCut('search', 'ui-icon', 18, 18)}</button>
        <button type="button" class="chat-tool-btn chat-tool-btn--icon" data-post-action="toggle-chat-mute" data-conv-id="${cid}" title="Уведомления" id="chatMuteBtn">${isMuted ? iconCut('mute', 'ui-icon', 18, 18) : iconCut('notifications', 'ui-icon', 18, 18)}</button>
        <div class="chat-tools-more">
          <button type="button" class="chat-tool-btn chat-tool-btn--icon" data-post-action="toggle-chat-tools-menu" title="Еще">${iconCut('more-horizontal', 'ui-icon', 18, 18)}</button>
          <div class="chat-tools-menu hidden">
            <button type="button" data-post-action="toggle-chat-pin" data-conv-id="${cid}">${iconCut(conv?.pinned_at ? 'unpin' : 'pin', 'ui-icon', 15, 15)}<span>${conv?.pinned_at ? 'Открепить чат' : 'Закрепить чат'}</span></button>
            <button type="button" data-post-action="toggle-chat-archive" data-conv-id="${cid}" data-archived="${conv?.archived_at ? '1' : '0'}">${iconCut('disk', 'ui-icon', 15, 15)}<span>${conv?.archived_at ? 'Вернуть из архива' : 'В архив'}</span></button>
            <button type="button" data-post-action="open-saved-messages" data-conv-id="${cid}">${iconCut('bookmark', 'ui-icon', 15, 15)}<span>Сохраненные</span></button>
            <button type="button" data-post-action="export-chat" data-conv-id="${cid}">${iconCut('download', 'ui-icon', 15, 15)}<span>Скачать TXT</span></button>
          </div>
        </div>
      </div>
    </div>
    ${chatPinnedMsg ? `<div class="pinned-msg-bar" id="pinnedBar" data-post-action="scroll-to-pinned" data-msg-id="${chatPinnedMsg.id}">
      <span class="pinned-bar-pin-ic">${iconCut('pin', 'ui-icon', 14, 14)}</span>
      <span>${esc((chatPinnedMsg.content || (chatPinnedMsg.file_type ? '[file]' : '')).slice(0,60))}</span>
      ${conv && (conv.is_group ? conv.owner === (me?.id) : true) ? `<button type="button" class="pinned-msg-unpin" data-post-action="unpin-message" data-conv-id="${cid}" aria-label="Открепить">${iconCut('unpin', 'ui-icon', 16, 16)}</button>` : ''}
    </div>` : ''}
    <div id="chatSearchPanel" class="chat-search-panel hidden">
      <input id="chatSearchInput" class="chat-search-input" placeholder="Поиск в переписке..." data-post-action="chat-search-input" data-conv-id="${cid}">
      <div id="chatSearchResults" class="chat-search-results"></div>
    </div>
    ${conv && conv.is_group ? `<div id="groupMembersPanel" class="chat-search-panel hidden">
      ${(conv.members||[]).map(m => `<div class="group-member-row" style="display:flex;align-items:center;gap:0.5rem;padding:0.35rem 0.6rem">
        ${avatarEl(m.avatar,'avatar avatar-sm',initial(m.display_name))}
        <span data-post-action="go-profile" data-username="${esc(m.username)}" style="cursor:pointer;flex:1">${esc(m.display_name)}${m.id===conv.owner?' 👑':''}</span>
        ${conv.owner===me?.id && m.id!==me?.id ? `<button class="btn btn-sm btn-ghost" style="padding:0.1rem 0.4rem" data-post-action="remove-group-member" data-conv-id="${conv.id}" data-member-id="${m.id}" data-username="${esc(m.username)}" aria-label="Удалить">${iconCut('trash', 'ui-icon', 15, 15)}</button>` : ''}
      </div>`).join('')}
      ${conv.owner===me?.id ? `<div style="padding:0.35rem 0.6rem"><button class="btn btn-sm btn-ic-row" data-post-action="add-group-member" data-conv-id="${conv.id}" style="width:100%">${iconCut('add', 'ui-icon', 14, 14)}Добавить участника</button></div>` : ''}
    </div>` : ''}
        <button id="chatVirtualMoreBtn" class="chat-virtual-more${virtualRender.hiddenCount ? '' : ' hidden'}" type="button">Показать старые (${virtualRender.hiddenCount})</button>
        <div id="chatMsgs" class="chat-msgs">
      ${msgs.length ? msgsHtml : chatEmptyStateHtml(title, conv)}
    </div>
    <button id="scrollDownBtn" class="scroll-down-btn hidden" data-post-action="scroll-chat-bottom" aria-label="Вниз">${iconCut('back', 'ui-icon ui-icon--scroll-rot', 18, 18)}</button>
    <div class="composer chat-composer">
      ${myAccepted ? `
      <div id="composerNormal" class="composer-messenger">
        <div class="composer-messenger-row">
          <button type="button" class="chat-tool-btn chat-tool-btn--icon" id="voiceBtn" title="Голосовое">${iconCut('mic', 'ui-icon', 18, 18)}</button>
          <div class="chat-attach-wrap" id="chatAttachWrap">
            <button type="button" class="chat-tool-btn chat-tool-btn--icon" data-post-action="toggle-chat-attach" title="Прикрепить">${iconCut('attach', 'ui-icon', 18, 18)}</button>
            <div class="chat-attach-menu hidden" id="chatAttachMenu">
              <label class="attach-opt" for="msgImgFile" data-post-action="close-chat-attach">UP фото / видео</label>
              <label class="attach-opt" for="msgFile" data-post-action="close-chat-attach">FILE файл</label>
            </div>
          </div>
          <input type="file" id="msgImgFile" accept="image/*,video/*,.heic,.heif" class="hidden">
          <input type="file" id="msgFile" class="hidden">
          <div class="composer-messenger-input-wrap">
            <textarea id="msgText" placeholder="Сообщение..." rows="1" autocomplete="off"></textarea>
          </div>
          <button class="chat-send-btn" id="msgSendBtn" type="button" title="Отправить" aria-label="Отправить">${iconCut('send', 'ui-icon', 20, 20)}</button>
        </div>
        <div class="composer-messenger-meta"><span class="chat-attach-name" id="msgFileName"></span><button type="button" class="chat-attach-clear hidden" id="msgFileClear" data-post-action="clear-chat-attachment" aria-label="Убрать файл">${iconCut('close', 'ui-icon', 13, 13)}</button></div>
      </div>
      <div id="voiceRecBar" class="voice-rec-bar hidden">
        <button class="voice-circle-btn voice-circle-btn--ghost" data-post-action="cancel-recording" title="Отмена">${iconCut('close', 'ui-icon', 17, 17)}</button>
        <div class="voice-rec-main">
          <div class="voice-rec-top"><span class="vr-rec-dot"></span><span class="voice-rec-label">Запись голоса</span><span id="voiceTimer" class="vr-timer">00:00</span></div>
          <canvas id="voiceWaveCanvas" class="voice-rec-wave" width="220" height="32"></canvas>
        </div>
        <button class="voice-circle-btn voice-circle-btn--stop" data-post-action="stop-recording-preview" title="Прослушать">${iconCut('pause', 'ui-icon', 18, 18)}</button>
      </div>
      <div id="voicePreviewBar" class="voice-preview-bar hidden">
        <button class="voice-circle-btn voice-circle-btn--ghost" data-post-action="cancel-voice-preview" title="Удалить">${iconCut('trash', 'ui-icon', 16, 16)}</button>
        <button class="voice-circle-btn" id="vpPreviewPlay" data-post-action="vp-preview-toggle" aria-label="Воспроизвести">${playPauseIconHtml(false, 16, 16)}</button>
        <div class="voice-preview-main">
          <div class="voice-preview-top"><span class="voice-preview-title">Прослушать перед отправкой</span><span class="vp-time" id="vpPreviewTime">0:00</span></div>
          <div class="voice-preview-wave" id="voicePreviewWave" role="slider" aria-label="Позиция голосового сообщения">${vpBars('preview')}</div>
        </div>
        <button class="voice-mini-btn" data-post-action="restart-voice-recording">заново</button>
        <button class="voice-circle-btn voice-circle-btn--send vp-send-btn" data-post-action="send-voice-preview" title="Отправить">${iconCut('send', 'ui-icon', 18, 18)}</button>
        <audio id="voicePreviewAudio" style="display:none"></audio>
      </div>
      ` : `
      <div class="dm-request-banner">
        <span>Запрос на переписку</span>
        <div class="dm-request-btns">
          <button class="btn btn-sm btn-ic-row" data-post-action="accept-dm-request" data-conv-id="${cid}">${iconCut('check', 'ui-icon', 14, 14)}ПРИНЯТЬ</button>
          <button class="btn btn-sm btn-danger btn-ic-row" data-post-action="decline-dm-request" data-conv-id="${cid}">${iconCut('close', 'ui-icon', 14, 14)}УДАЛИТЬ</button>
        </div>
      </div>
      `}
    </div>
    </div>
  </div>
  `;
  scrollChatToBottom();
  bindMsgFile();
  initVoiceBtn(cid);
  if (msgPoll) { clearInterval(msgPoll); msgPoll = null; }
  loadLinkPreviews(document.getElementById('chatMsgs') || document.getElementById('app')).catch(() => {});
  flushPendingChatQueue().catch(() => {});
  document.getElementById('chatVirtualMoreBtn')?.addEventListener('click', () => {
    window._chatVisibleFrom = Math.max(0, (window._chatVisibleFrom || 0) - CHAT_VIRTUAL_CHUNK);
    rerenderVirtualMessages(conv);
    loadLinkPreviews(document.getElementById('chatMsgs')).catch(() => {});
  });
  const sideList = document.getElementById('chatSidebarList');
  const syncFilterButtons = () => {
    document.getElementById('chatFilterAll')?.classList.toggle('active', !chatSidebarFilters.unread && !chatSidebarFilters.muted && !chatSidebarFilters.pinned && !chatSidebarFilters.archived);
    document.getElementById('chatFilterUnread')?.classList.toggle('active', chatSidebarFilters.unread);
    document.getElementById('chatFilterMuted')?.classList.toggle('active', chatSidebarFilters.muted);
    document.getElementById('chatFilterPinned')?.classList.toggle('active', chatSidebarFilters.pinned);
    document.getElementById('chatFilterArchived')?.classList.toggle('active', chatSidebarFilters.archived);
  };
  const renderSidebarList = () => {
    if (!sideList) return;
    sideList.innerHTML = renderSidebarRows();
    syncFilterButtons();
  };
  document.getElementById('chatFilterAll')?.addEventListener('click', () => {
    chatSidebarFilters = { unread: false, muted: false, pinned: false, archived: false };
    renderSidebarList();
  });
  document.getElementById('chatFilterUnread')?.addEventListener('click', () => {
    chatSidebarFilters.unread = !chatSidebarFilters.unread;
    renderSidebarList();
  });
  document.getElementById('chatFilterMuted')?.addEventListener('click', () => {
    chatSidebarFilters.muted = !chatSidebarFilters.muted;
    renderSidebarList();
  });
  document.getElementById('chatFilterPinned')?.addEventListener('click', () => {
    chatSidebarFilters.pinned = !chatSidebarFilters.pinned;
    renderSidebarList();
  });
  document.getElementById('chatFilterArchived')?.addEventListener('click', () => {
    chatSidebarFilters.archived = !chatSidebarFilters.archived;
    renderSidebarList();
  });
  const sideSearch = document.getElementById('chatSidebarSearch');
  if (sideSearch) {
    let activeSearchRow = -1;
    const getVisibleRows = () => Array.from(document.querySelectorAll('.chat-sidebar .chat-row')).filter(r => r.style.display !== 'none');
    const updateSearchRowActive = (idx) => {
      const rows = getVisibleRows();
      rows.forEach((r, i) => r.classList.toggle('chat-row-search-active', i === idx));
    };
    sideSearch.addEventListener('input', () => {
      const q = sideSearch.value.trim().toLowerCase();
      const rows = Array.from(document.querySelectorAll('.chat-sidebar .chat-row'));
      rows.forEach(row => {
        const name = row.querySelector('.chat-name')?.textContent?.toLowerCase() || '';
        const last = row.querySelector('.chat-last')?.textContent?.toLowerCase() || '';
        row.style.display = !q || name.includes(q) || last.includes(q) ? '' : 'none';
      });
      document.querySelectorAll('.chat-sidebar .dm-section-title').forEach(title => {
        const nextRows = [];
        let n = title.nextElementSibling;
        while (n && !n.classList.contains('dm-section-title')) {
          if (n.classList.contains('chat-row')) nextRows.push(n);
          n = n.nextElementSibling;
        }
        title.style.display = nextRows.some(r => r.style.display !== 'none') ? '' : 'none';
      });
      activeSearchRow = -1;
      updateSearchRowActive(activeSearchRow);
    });
    sideSearch.addEventListener('keydown', e => {
      const rows = getVisibleRows();
      if (!rows.length) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        activeSearchRow = Math.min(rows.length - 1, activeSearchRow + 1);
        updateSearchRowActive(activeSearchRow);
        rows[activeSearchRow]?.scrollIntoView({ block: 'nearest' });
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        activeSearchRow = Math.max(0, activeSearchRow - 1);
        updateSearchRowActive(activeSearchRow);
        rows[activeSearchRow]?.scrollIntoView({ block: 'nearest' });
        return;
      }
      if (e.key === 'Enter') {
        if (activeSearchRow >= 0 && rows[activeSearchRow]) {
          e.preventDefault();
          rows[activeSearchRow].click();
        }
      }
    });
  }

  const txtEl = document.getElementById('msgText');
  if (txtEl) {
    // Clone to remove any stale event listeners
    const newTxtEl = txtEl.cloneNode(true);
    txtEl.parentNode.replaceChild(newTxtEl, txtEl);
    const freshTxtEl = document.getElementById('msgText');
    if (freshTxtEl) {
      // Auto-grow + typing indicator
      let typingThrottle = 0;
      freshTxtEl.addEventListener('input', () => {
        freshTxtEl.style.height = 'auto';
        freshTxtEl.style.height = Math.min(freshTxtEl.scrollHeight, 120) + 'px';
        const now = Date.now();
        if (now - typingThrottle > 2000) {
          typingThrottle = now;
          api('/chats/' + cid + '/typing', { method: 'POST' }).catch(() => {});
        }
        localStorage.setItem(`draft_${cid}`, freshTxtEl.value);
        updateChatSendReady();
      });
      freshTxtEl.addEventListener('keydown', e => {
        // Enter → send (without Shift/Ctrl/Alt)
        if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.altKey) {
          e.preventDefault();
          sendMsg(cid);
          return;
        }
        // Escape → cancel reply or clear text
        if (e.key === 'Escape') {
          if (replyToMsg) { cancelMsgReply(); return; }
          if (window._editingMsgId) { cancelEditMsg?.(window._editingMsgId); return; }
          freshTxtEl.blur();
          return;
        }
        // Arrow Up → edit last own message (if textarea is empty)
        if (e.key === 'ArrowUp' && !freshTxtEl.value.trim()) {
          e.preventDefault();
          const lastMine = [...document.querySelectorAll('.msg.me[data-id]')].pop();
          if (lastMine) {
            const mid = lastMine.dataset.id;
            startEditMsg(mid, cid);
          }
          return;
        }
      });
      // Restore draft
      const draft = localStorage.getItem(`draft_${cid}`);
      if (draft) { freshTxtEl.value = draft; freshTxtEl.dispatchEvent(new Event('input')); }
      updateChatSendReady();
      // @mention autocomplete for group chats
      if (conv?.is_group) {
        const memberSuggestions = (conv.members || []).filter(m => m.id !== me?.id);
        bindChatMentionAutocomplete(freshTxtEl, memberSuggestions);
      }
    }
  }
  // Rebind send button explicitly to avoid stale inline handlers on rerenders.
  const sendBtn = document.getElementById('msgSendBtn');
  if (sendBtn) {
    const newSendBtn = sendBtn.cloneNode(true);
    sendBtn.parentNode.replaceChild(newSendBtn, sendBtn);
    newSendBtn.addEventListener('click', () => sendMsg(cid));
  }

  // Show unread count on scroll-down button
  if (unreadCount > 0) {
    setTimeout(() => {
      const btn = document.getElementById('scrollDownBtn');
      if (btn) {
        btn.innerHTML = `${iconCut('back', 'ui-icon ui-icon--scroll-rot', 18, 18)}<span class="scroll-down-badge">${unreadCount}</span>`;
        btn.classList.remove('hidden');
      }
    }, 100);
  }

  // Touch: tap message body to show actions (for devices without hover)
  const chatMsgsEl = document.getElementById('chatMsgs');
  if (chatMsgsEl) {
    chatMsgsEl.addEventListener('click', e => {
      if (e.target.closest('.msg-actions')) return;
      const body = e.target.closest('.msg-body');
      const clickedMsg = body?.closest('.msg');
      const wasActive = clickedMsg?.classList.contains('active');
      chatMsgsEl.querySelectorAll('.msg.active').forEach(m => m.classList.remove('active'));
      if (clickedMsg && !wasActive) clickedMsg.classList.add('active');
    });
    // Combined scroll handler:
    // - toggles scroll-down button visibility
    // - lazy-loads older messages near top
    chatMsgsEl.addEventListener('scroll', async () => {
      const atBottom = chatMsgsEl.scrollHeight - chatMsgsEl.scrollTop - chatMsgsEl.clientHeight < 80;
      if (atBottom) {
        const btn = document.getElementById('scrollDownBtn');
        if (btn) { btn.innerHTML = iconCut('back', 'ui-icon ui-icon--scroll-rot', 18, 18); btn.classList.add('hidden'); }
      } else {
        document.getElementById('scrollDownBtn')?.classList.remove('hidden');
      }
      if (chatMsgsEl.scrollTop < 80 && window._chatVisibleFrom > 0) {
        return;
      }
      if (chatMsgsEl.scrollTop < 80 && window._chatHasMore && !window._chatLoadingMore && currentChatId) {
        window._chatLoadingMore = true;
        try {
          const r = await api(`/chats/${currentChatId}/messages?before=${encodeURIComponent(window._chatOldestTs)}`);
          const older = r.messages || [];
          if (older.length) {
            window._chatAllMsgs = [...older, ...(window._chatAllMsgs || [])];
            window._chatVisibleFrom = Math.max(0, (window._chatVisibleFrom || 0) + older.length);
            const prevH = chatMsgsEl.scrollHeight;
            const existingFirst = chatMsgsEl.querySelector('.msg[data-id]');
            const firstStub = existingFirst
              ? { sender_id: existingFirst.dataset.sender, deleted_at: null, created_at: existingFirst.dataset.created }
              : null;
            let olderHtml = '';
            let lastDay = null;
            for (let i = 0; i < older.length; i++) {
              const m = older[i];
              const dk = chatDayKey(m.created_at);
              if (dk !== lastDay) {
                const skipSep = i === 0 && firstStub && dk === chatDayKey(firstStub.created_at);
                if (!skipSep) olderHtml += chatDateSeparatorHtml(m.created_at);
                lastDay = dk;
              }
              olderHtml += msgHtml(m, i ? older[i - 1] : null, i < older.length - 1 ? older[i + 1] : firstStub);
            }
            chatMsgsEl.insertAdjacentHTML('afterbegin', olderHtml);
            chatMsgsEl.scrollTop = chatMsgsEl.scrollHeight - prevH;
            window._chatOldestTs = older[0].created_at;
            loadLinkPreviews(chatMsgsEl).catch(() => {});
          }
          window._chatHasMore = !!r.has_more;
        } catch {}
        window._chatLoadingMore = false;
      }
    });
  }

  // Dynamic scroll-down btn: always sit 8px above composer regardless of its height
  const composerEl = document.querySelector('.chat-composer');
  const scrollBtn = document.getElementById('scrollDownBtn');
  if (composerEl && scrollBtn && window.ResizeObserver) {
    const syncBtnPos = () => { scrollBtn.style.bottom = (composerEl.offsetHeight + 8) + 'px'; };
    syncBtnPos();
    if (window._composerResizeObs) window._composerResizeObs.disconnect();
    window._composerResizeObs = new ResizeObserver(syncBtnPos);
    window._composerResizeObs.observe(composerEl);
  }

  // Virtual keyboard: use visualViewport to keep chat sized to visible area
  if (window.visualViewport) {
    const _vpResize = () => {
      const main = document.querySelector('body.in-chat main');
      if (main) main.style.height = window.visualViewport.height + 'px';
      setTimeout(scrollChatToBottom, 50);
    };
    window.visualViewport.addEventListener('resize', _vpResize);
    window._vpCleanup = () => {
      window.visualViewport.removeEventListener('resize', _vpResize);
      const main = document.querySelector('main');
      if (main) main.style.height = '';
    };
  }

  bindChatKeyboardShortcuts(cid);
}

async function acceptDmRequest(cid) {
  try {
    await api(`/chats/${cid}/accept`, { method: 'POST' });
    renderChat(document.getElementById('app'), cid);
    await loadChats();
  } catch (e) { toast.error('Ошибка: ' + e.message); }
}

async function declineDmRequest(cid) {
  try {
    await api(`/chats/${cid}/decline`, { method: 'POST' });
    go('chats');
  } catch (e) { toast.error('Ошибка: ' + e.message); }
}

/** Parse API datetime to Date (UTC-safe). */
function parseChatDate(iso) {
  if (!iso) return new Date();
  const s = String(iso).endsWith('Z') ? iso : String(iso).replace(' ', 'T') + 'Z';
  return new Date(s);
}

function chatDayKey(iso) {
  const d = parseChatDate(iso);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function todayKey() {
  const n = new Date();
  return `${n.getFullYear()}-${n.getMonth() + 1}-${n.getDate()}`;
}

function chatDateSeparatorHtml(iso) {
  const d = parseChatDate(iso);
  const todayK = todayKey();
  const y = new Date();
  y.setDate(y.getDate() - 1);
  const yK = `${y.getFullYear()}-${y.getMonth() + 1}-${y.getDate()}`;
  const dk = chatDayKey(iso);
  let label;
  if (dk === todayK) label = 'Сегодня';
  else if (dk === yK) label = 'Вчера';
  else label = d.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
  return `<div class="msg-day-sep" role="separator"><span>${esc(label)}</span></div>`;
}

function formatChatMsgTime(iso) {
  return parseChatDate(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

function formatChatListTime(iso) {
  if (!iso) return '';
  const d = parseChatDate(iso);
  const now = new Date();
  if (chatDayKey(iso) === todayKey()) {
    return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  }
  if (now.getTime() - d.getTime() < 6 * 864e5) {
    return d.toLocaleDateString('ru-RU', { weekday: 'short' });
  }
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

function sameMsgCluster(prev, m) {
  if (!prev || !m) return false;
  return !prev.deleted_at && !m.deleted_at && sameId(prev.sender_id, m.sender_id);
}

function buildMsgsSequential(msgs) {
  let html = '';
  let lastDay = null;
  for (let i = 0; i < msgs.length; i++) {
    const m = msgs[i];
    const dk = chatDayKey(m.created_at);
    if (dk !== lastDay) {
      lastDay = dk;
      html += chatDateSeparatorHtml(m.created_at);
    }
    const prev = i > 0 ? msgs[i - 1] : null;
    const next = i < msgs.length - 1 ? msgs[i + 1] : null;
    html += msgHtml(m, prev, next);
  }
  return html;
}

function buildChatMessagesHtml(msgs, unreadCount, conv) {
  window._chatRenderConv = conv;
  let inner = '';
  if (unreadCount > 0 && msgs.length >= unreadCount) {
    const dividerIdx = msgs.length - unreadCount;
    inner += buildMsgsSequential(msgs.slice(0, dividerIdx));
    inner += `<div class="unread-divider"><span>${unreadCount} новых</span></div>`;
    inner += buildMsgsSequential(msgs.slice(dividerIdx));
  } else {
    inner = buildMsgsSequential(msgs);
  }
  window._chatRenderConv = null;
  return inner;
}

function getVirtualChatRender(msgs, unreadCount, conv) {
  window._chatAllMsgs = Array.isArray(msgs) ? msgs.slice() : [];
  window._chatVisibleFrom = Math.max(0, window._chatAllMsgs.length - CHAT_VIRTUAL_WINDOW);
  const visibleMsgs = window._chatAllMsgs.slice(window._chatVisibleFrom);
  const hiddenCount = window._chatVisibleFrom;
  const effectiveUnread = Math.min(unreadCount || 0, visibleMsgs.length);
  return {
    html: buildChatMessagesHtml(visibleMsgs, effectiveUnread, conv),
    hiddenCount,
    visibleMsgs
  };
}

function rerenderVirtualMessages(conv) {
  const chatMsgsEl = document.getElementById('chatMsgs');
  const virtualBtn = document.getElementById('chatVirtualMoreBtn');
  if (!chatMsgsEl || !Array.isArray(window._chatAllMsgs)) return;
  const allMsgs = window._chatAllMsgs;
  const from = Math.max(0, window._chatVisibleFrom || 0);
  const prevFirstId = chatMsgsEl.querySelector('.msg[data-id]')?.dataset?.id || null;
  const prevTop = chatMsgsEl.scrollTop;
  const visible = allMsgs.slice(from);
  chatMsgsEl.innerHTML = buildChatMessagesHtml(visible, 0, conv || window._chatRenderConv || window._currentChatConv);
  if (virtualBtn) {
    if (from > 0) {
      virtualBtn.classList.remove('hidden');
      virtualBtn.textContent = `Показать старые (${from})`;
    } else {
      virtualBtn.classList.add('hidden');
    }
  }
  if (prevFirstId) {
    const newFirst = chatMsgsEl.querySelector(`.msg[data-id="${prevFirstId}"]`);
    if (newFirst) {
      newFirst.scrollIntoView({ block: 'start' });
      return;
    }
  }
  chatMsgsEl.scrollTop = prevTop;
}

function chatFileKind(m) {
  const type = String(m.file_type || '');
  if (type.startsWith('image/')) return 'image';
  if (type.startsWith('video/')) return 'video';
  if (type.startsWith('audio/')) return 'audio';
  if (type.includes('pdf')) return 'pdf';
  if (type.includes('zip') || type.includes('archive')) return 'archive';
  return 'file';
}

function chatAttachmentCardHtml(m) {
  const label = m.file_name || (m.file_type ? m.file_type.split('/')[1] : 'file');
  const size = Number(m.file_size || 0);
  const meta = [m.file_type || 'file', size ? fmtBytes(size) : ''].filter(Boolean).join(' · ');
  const kind = chatFileKind(m);
  return `<div class="msg-file-card msg-file-card--${kind}">
    <div class="msg-file-ic">${iconCut('file', 'ui-icon', 18, 18)}</div>
    <div class="msg-file-main">
      <a class="msg-file-name" href="${esc(m.file)}" target="_blank" download="${esc(label)}">${esc(label)}</a>
      <div class="msg-file-meta">${esc(meta || 'attachment')}</div>
    </div>
    <a class="msg-file-download" href="${esc(m.file)}" download="${esc(label)}" title="Download">${iconCut('download', 'ui-icon', 16, 16)}</a>
  </div>`;
}

function msgHtml(m, prev, next) {
  const mine = me && sameId(m.sender_id, me.id);
  const conv = window._chatRenderConv || window._currentChatConv;
  const isGroup = !!(conv && conv.is_group);
  let clusterClass = '';
  if (sameMsgCluster(prev, m)) {
    clusterClass = sameMsgCluster(m, next) ? 'msg-cluster-mid' : 'msg-cluster-last';
  } else if (sameMsgCluster(m, next)) {
    clusterClass = 'msg-cluster-first';
  }
  const showSender = isGroup && !mine && !sameMsgCluster(prev, m) && (m.display_name || m.username);
  // if message is deleted
  if (m.deleted_at) {
    return `
      <div class="msg ${mine ? 'me' : ''} ${clusterClass}" data-id="${m.id}" data-sender="${m.sender_id || ''}" data-created="${m.created_at}">
        ${mine ? '' : avatarEl(m.avatar, 'avatar-sm', initial(m.display_name))}
        <div class="msg-body"><div class="msg-text msg-text--deleted">[удалено]</div></div>
      </div>
    `;
  }
  const parts = [];
  if (showSender) {
    parts.push(`<div class="msg-sender-label">${esc(m.display_name || m.username || '')}</div>`);
  }
  if (m.forwarded_from) {
    parts.push(`<div class="msg-forwarded">${iconCut('forward', 'ui-icon msg-inline-ic', 11, 11)}<span class="msg-forwarded-text">Переслано${typeof m.forwarded_from === 'string' && m.forwarded_from.trim() ? ` · ${esc(m.forwarded_from.trim())}` : ''}</span></div>`);
  }
  if (m.saved) {
    parts.push(`<div class="msg-saved-mark">${iconCut('bookmark-filled', 'ui-icon msg-inline-ic', 11, 11)}<span>Сохранено</span></div>`);
  }
  if (m.reply_to && m.reply_text) {
    parts.push(`<div class="msg-reply-quote" data-post-action="jump-to-message" data-msg-id="${m.reply_to}" data-conv-id="${currentChatId}">${iconCut('reply', 'ui-icon msg-inline-ic', 11, 11)} ${esc(m.reply_text.slice(0,80))}${m.reply_text.length>80?'…':''}</div>`);
  }
  if (m.content) parts.push(`<div class="msg-text">${formatMsg(m.content)}</div>`);
  if (m.content && !m.file) {
    const urlMatch = m.content.match(/https?:\/\/[^\s<>"']+/);
    if (urlMatch) {
      parts.push(`<div class="post-link-preview" data-url="${esc(urlMatch[0])}" style="display:none"></div>`);
    }
  }
  if (m.file) {
    if (m.file_type && m.file_type.startsWith('image/')) {
      parts.push(`<div class="msg-img" data-post-action="open-image" data-image="${esc(m.file)}"><img src="${esc(m.file)}" loading="lazy" alt=""></div>`);
    } else if (m.file_type && m.file_type.startsWith('audio/')) {
      parts.push(voicePlayerHtml(m.file, m.id, m.file_name, true));
    } else if (m.file_type && m.file_type.startsWith('video/')) {
      parts.push(`<video class="msg-video" controls src="${esc(m.file)}" preload="none" data-post-action="open-video" data-video="${esc(m.file)}"></video>`);
    } else {
      parts.push(chatAttachmentCardHtml(m));
    }
  }
  const timeTitle = timeAgo(m.created_at);
  let timeLabel = formatChatMsgTime(m.created_at);
  if (m.edited_at) timeLabel += ' · изм.';
  if (mine) {
    const isRead = chatOtherLastRead && new Date(chatOtherLastRead) >= new Date(m.created_at);
    parts.push(`<div class="msg-time" title="${esc(timeTitle)}">${timeLabel}<span class="msg-tick${isRead ? ' read' : ''}">${msgTickIcons(isRead)}</span></div>`);
  } else {
    parts.push(`<div class="msg-time" title="${esc(timeTitle)}">${timeLabel}</div>`);
  }
  parts.push(`<div class="reaction-bar" data-mid="${m.id}">${reactionBarHtml(m.id, m.reactions || [])}</div>`);
  const msgMenuText = (m.content || m.reply_text || m.file_name || '').slice(0, 500);
  const actions = `
    <div class="msg-actions">
      <button class="msg-more-btn" data-post-action="open-msg-menu" data-msg-id="${m.id}" data-conv-id="${currentChatId}" data-mine="${mine ? '1' : '0'}" data-saved="${m.saved ? '1' : '0'}" data-has-file="${m.file ? '1' : '0'}" data-file-name="${esc(m.file_name || '')}" data-file-size="${esc(String(m.file_size || 0))}" data-msg-text="${esc(msgMenuText)}" title="Actions">${iconCut('more-horizontal', 'ui-icon', 15, 15)}</button>
    </div>`;
  return `
    <div class="msg ${mine ? 'me' : ''} ${clusterClass}" data-id="${m.id}" data-sender="${m.sender_id ?? ''}" data-created="${m.created_at}" data-saved="${m.saved ? '1' : '0'}" data-file="${m.file || ''}" data-file-type="${m.file_type || ''}" data-file-name="${esc(m.file_name || '')}" data-file-size="${esc(String(m.file_size || 0))}" data-msg-text="${esc(msgMenuText)}" data-author="${esc(m.display_name || m.username || '')}">
      ${mine ? '' : avatarEl(m.avatar, 'avatar-sm', initial(m.display_name))}
      <div class="msg-body">
        ${parts.join('')}
      </div>
      ${actions}
    </div>
  `;
}

function msgMenuRow(action, icon, label, attrs = '', danger = false) {
  return `<button type="button" class="msg-menu-item${danger ? ' msg-menu-item--danger' : ''}" data-post-action="${action}" ${attrs}>${iconCut(icon, 'ui-icon', 15, 15)}<span>${label}</span></button>`;
}

function closeMsgMenuPopover() {
  document.querySelectorAll('.msg-menu-popover').forEach(el => {
    if (typeof el._cleanup === 'function') el._cleanup();
    el.remove();
  });
}

function openMsgMenu(btn) {
  const mid = btn.dataset.msgId || '';
  const cid = btn.dataset.convId || currentChatId || '';
  if (!mid || !cid) return;
  const openExisting = document.querySelector(`.msg-menu-popover[data-msg-id="${CSS.escape(mid)}"]`);
  closeMsgMenuPopover();
  if (openExisting) return;
  const mine = btn.dataset.mine === '1';
  const hasFile = btn.dataset.hasFile === '1';
  const text = btn.dataset.msgText || '';
  const canCopy = !!text;
  const menu = document.createElement('div');
  menu.className = 'msg-menu-popover';
  menu.dataset.msgId = mid;
  menu.innerHTML = `
    <div class="msg-menu-list">
      ${msgMenuRow('start-msg-reply', 'reply', 'Reply', `data-msg-id="${esc(mid)}" data-reply-text="${esc(text.slice(0,80))}"`)}
      ${canCopy ? msgMenuRow('copy-msg-text', 'file', 'Copy text', `data-msg-id="${esc(mid)}"`) : ''}
      ${mine && !hasFile ? msgMenuRow('start-edit-msg', 'edit', 'Edit', `data-msg-id="${esc(mid)}" data-conv-id="${esc(cid)}"`) : ''}
      ${msgMenuRow('pin-message', 'pin', 'Pin', `data-msg-id="${esc(mid)}" data-conv-id="${esc(cid)}"`)}
      ${msgMenuRow('toggle-save-msg', 'bookmark', btn.dataset.saved === '1' ? 'Unsave' : 'Save', `data-msg-id="${esc(mid)}" data-conv-id="${esc(cid)}" data-saved="${btn.dataset.saved === '1' ? '1' : '0'}"`)}
      ${msgMenuRow('forward-msg', 'forward', 'Forward', `data-msg-id="${esc(mid)}" data-conv-id="${esc(cid)}"`)}
      ${msgMenuRow('msg-details', 'settings', 'Details', `data-msg-id="${esc(mid)}"`)}
      ${!mine ? msgMenuRow('report-msg', 'warning', 'Report', `data-msg-id="${esc(mid)}"`, true) : ''}
      ${mine ? msgMenuRow('delete-msg', 'trash', 'Delete', `data-msg-id="${esc(mid)}" data-conv-id="${esc(cid)}"`, true) : ''}
    </div>
  `;
  document.body.appendChild(menu);
  const rect = btn.getBoundingClientRect();
  const width = Math.min(224, window.innerWidth - 16);
  const menuRect = menu.getBoundingClientRect();
  const desiredLeft = mine ? rect.right - width : rect.left;
  const left = Math.max(8, Math.min(window.innerWidth - width - 8, desiredLeft));
  const aboveTop = rect.top - menuRect.height - 8;
  const belowTop = rect.bottom + 8;
  const top = aboveTop > 8 ? aboveTop : Math.min(window.innerHeight - menuRect.height - 8, belowTop);
  menu.style.left = `${left}px`;
  menu.style.top = `${Math.max(8, top)}px`;
  menu.style.width = `${width}px`;
  const onDocClick = ev => {
    if (menu.contains(ev.target) || btn.contains(ev.target)) return;
    closeMsgMenuPopover();
  };
  const onKey = ev => {
    if (ev.key === 'Escape') closeMsgMenuPopover();
  };
  const onScroll = () => closeMsgMenuPopover();
  menu._cleanup = () => {
    document.removeEventListener('click', onDocClick, true);
    document.removeEventListener('keydown', onKey, true);
    document.getElementById('chatMsgs')?.removeEventListener('scroll', onScroll);
    window.removeEventListener('resize', onScroll);
  };
  setTimeout(() => document.addEventListener('click', onDocClick, true), 0);
  document.addEventListener('keydown', onKey, true);
  document.getElementById('chatMsgs')?.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
}

async function copyMsgText(mid, modal) {
  const msg = document.querySelector(`.msg[data-id="${CSS.escape(mid)}"]`);
  const text = msg?.querySelector('.msg-text')?.innerText || msg?.dataset.msgText || '';
  if (!text) { toast('Nothing to copy'); return; }
  try {
    await navigator.clipboard.writeText(text);
    toast.success('Copied');
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    toast.success('Copied');
  }
  if (modal?.classList?.contains('msg-menu-popover')) closeMsgMenuPopover();
  else modal?.remove();
}

function showMessageReport(mid, modal) {
  const reasons = ['SPAM', 'ABUSE', 'COPYRIGHT', 'OTHER'];
  if (!modal) return;
  const isPopover = modal.classList.contains('msg-menu-popover');
  if (!isPopover) {
    modal.querySelector('.modal')?.classList.add('msg-menu-modal');
    modal.querySelector('.modal')?.replaceChildren();
  }
  const box = isPopover ? modal : modal.querySelector('.modal');
  if (!box) return;
  box.innerHTML = `${isPopover ? '<div class="msg-menu-kicker">Report message</div>' : `<div class="modal-head"><b>Report message</b><button type="button" class="modal-icon-dismiss" data-post-action="close-modal-overlay" aria-label="Close">${iconCut('close', 'ui-icon', 18, 18)}</button></div>`}
    <div class="msg-menu-list">
      ${reasons.map(reason => msgMenuRow('do-report-message', 'warning', reason, `data-msg-id="${esc(mid)}" data-reason="${esc(reason)}"`, true)).join('')}
    </div>`;
}

async function submitMessageReport(mid, reason, modal) {
  await submitReport('message', mid, reason);
  if (modal?.classList?.contains('msg-menu-popover')) closeMsgMenuPopover();
  else modal?.remove();
}

function showMsgDetails(mid, modal) {
  const msg = document.querySelector(`.msg[data-id="${CSS.escape(mid)}"]`);
  if (!msg || !modal) return;
  const created = msg.dataset.created ? `${formatChatMsgTime(msg.dataset.created)} · ${timeAgo(msg.dataset.created)}` : 'n/a';
  const fileSize = Number(msg.dataset.fileSize || 0);
  const rows = [
    ['ID', mid],
    ['Author', msg.dataset.author || (msg.classList.contains('me') ? 'You' : 'n/a')],
    ['Time', created],
    ['Type', msg.dataset.fileType || (msg.dataset.file ? 'file' : 'text')],
    ['File', msg.dataset.fileName || ''],
    ['Size', fileSize ? fmtBytes(fileSize) : ''],
  ].filter(([, value]) => value);
  const isPopover = modal.classList.contains('msg-menu-popover');
  const box = isPopover ? modal : modal.querySelector('.modal');
  if (!box) return;
  box.innerHTML = `${isPopover ? '<div class="msg-menu-kicker">Details</div>' : `<div class="modal-head"><b>Details</b><button type="button" class="modal-icon-dismiss" data-post-action="close-modal-overlay" aria-label="Close">${iconCut('close', 'ui-icon', 18, 18)}</button></div>`}
    <div class="msg-detail-list">${rows.map(([k,v]) => `<div class="msg-detail-row"><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('')}</div>`;
}

function updateTicks() {
  document.querySelectorAll('.msg.me[data-created]').forEach(msgEl => {
    const tickEl = msgEl.querySelector('.msg-tick');
    if (!tickEl) return;
    const isRead = chatOtherLastRead && new Date(chatOtherLastRead) >= new Date(msgEl.dataset.created);
    tickEl.className = `msg-tick${isRead ? ' read' : ''}`;
    tickEl.innerHTML = msgTickIcons(isRead);
  });
}

function bindMsgFile() {
  const updateName = () => {
    const f = (document.getElementById('msgImgFile')?.files?.[0]) || (document.getElementById('msgFile')?.files?.[0]);
    setChatAttachmentLabel(f);
    updateChatSendReady();
  };
  document.getElementById('msgFile')?.addEventListener('change', updateName);
  document.getElementById('msgImgFile')?.addEventListener('change', updateName);
  bindChatDropAttach();
  updateChatSendReady();
}

function setChatAttachmentLabel(file) {
  const labelEl = document.getElementById('msgFileName');
  const clearBtn = document.getElementById('msgFileClear');
  if (!labelEl) return;
  if (!file) {
    labelEl.textContent = '';
    clearBtn?.classList.add('hidden');
    return;
  }
  const size = file.size ? ` · ${fmtBytes(file.size)}` : '';
  labelEl.innerHTML = `${iconCut(file.type?.startsWith('image/') || file.type?.startsWith('video/') ? 'media' : 'file', 'ui-icon chat-attach-ic', 13, 13)}<span>${esc(file.name)}${esc(size)}</span>`;
  clearBtn?.classList.remove('hidden');
}

function clearChatAttachment() {
  const fileEl = document.getElementById('msgFile');
  const imgFileEl = document.getElementById('msgImgFile');
  if (fileEl) fileEl.value = '';
  if (imgFileEl) imgFileEl.value = '';
  setChatAttachmentLabel(null);
  updateChatSendReady();
}

function bindChatDropAttach() {
  const composer = document.querySelector('.chat-composer');
  if (!composer || composer.dataset.dropBound === '1') return;
  composer.dataset.dropBound = '1';
  const setFiles = files => {
    const file = files?.[0];
    if (!file) return;
    const target = (file.type || '').startsWith('image/') || (file.type || '').startsWith('video/')
      ? document.getElementById('msgImgFile')
      : document.getElementById('msgFile');
    if (!target) return;
    const dt = new DataTransfer();
    dt.items.add(file);
    target.files = dt.files;
    setChatAttachmentLabel(file);
    updateChatSendReady();
  };
  composer.addEventListener('dragover', ev => {
    ev.preventDefault();
    composer.classList.add('chat-composer--drop');
  });
  composer.addEventListener('dragleave', ev => {
    if (!composer.contains(ev.relatedTarget)) composer.classList.remove('chat-composer--drop');
  });
  composer.addEventListener('drop', ev => {
    ev.preventDefault();
    composer.classList.remove('chat-composer--drop');
    setFiles(ev.dataTransfer?.files);
  });
}

function toggleChatAttach() {
  const menu = document.getElementById('chatAttachMenu');
  if (!menu) return;
  const open = !menu.classList.contains('hidden');
  if (open) { menu.classList.add('hidden'); return; }
  menu.classList.remove('hidden');
  setTimeout(() => {
    const close = e => {
      if (!document.getElementById('chatAttachWrap')?.contains(e.target)) {
        menu.classList.add('hidden');
        document.removeEventListener('click', close);
      }
    };
    document.addEventListener('click', close);
  }, 0);
}

function closeChatAttach() {
  document.getElementById('chatAttachMenu')?.classList.add('hidden');
}

function startMsgReply(mid, text, btn) {
  replyToMsg = { id: mid, text };
  let bar = document.getElementById('replyBar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'replyBar';
    bar.className = 'reply-bar';
    const composer = document.querySelector('.chat-composer');
    if (composer) composer.insertAdjacentElement('beforebegin', bar);
  }
  bar.innerHTML = `<span class="reply-bar-text"><span class="reply-bar-ic">${iconCut('reply', 'ui-icon', 13, 13)}</span> ${esc(text.slice(0,60))}${text.length>60?'…':''}</span><button class="reply-bar-cancel" data-post-action="cancel-msg-reply" aria-label="Отменить ответ">${iconCut('close', 'ui-icon', 16, 16)}</button>`;
  document.getElementById('msgText')?.focus();
}
function cancelMsgReply() {
  replyToMsg = null;
  document.getElementById('replyBar')?.remove();
}

async function sendMsg(cid) {
  const txtEl = $('#msgText');
  const fileEl = document.getElementById('msgFile');
  const imgFileEl = document.getElementById('msgImgFile');
  const sendBtn = document.getElementById('msgSendBtn');
  const content = (txtEl?.value || '').trim();
  const file = imgFileEl?.files?.[0] || fileEl?.files?.[0];
  if (!content && !file) return;
  if (window._chatSending) return;
  // Validate file size: maximum 4GB (4 * 1024^3 bytes)
  if (file && file.size > 4 * 1024 * 1024 * 1024) {
    toast.error('Максимум 4 ГБ для файла');
    return;
  }
  const fd = new FormData();
  if (content) fd.append('content', content);
  if (file) fd.append('file', file);
  if (replyToMsg) {
    fd.append('reply_to', replyToMsg.id);
    fd.append('reply_text', replyToMsg.text);
    cancelMsgReply();
  }
  window._chatSending = true;
  if (sendBtn) {
    sendBtn.disabled = true;
    sendBtn.style.opacity = '0.6';
  }
  setComposerStatus(file ? 'Загрузка 0%' : 'Отправка...', 'pending');
  try {
    if (file) {
      await sendMessageWithProgress(cid, fd, p => setComposerStatus(`Загрузка ${p}%`, 'pending'));
    } else {
      await api('/chats/'+cid+'/messages', { method:'POST', body: fd });
    }
    // Clear inputs
    if (txtEl) { txtEl.value = ''; txtEl.style.height = 'auto'; }
    if (fileEl) fileEl.value = '';
    if (imgFileEl) imgFileEl.value = '';
    updateChatSendReady();
    setChatAttachmentLabel(null);
    // Clear draft
    localStorage.removeItem(`draft_${cid}`);
    // Optimistically fetch any new messages posted after the last timestamp.
    // This prevents the sender from waiting on the SSE event to see their own message.
    if (page === 'chat' && currentChatId === cid) {
      try {
        const q = lastMsgTime ? `?after=${encodeURIComponent(lastMsgTime)}` : '';
        const r = await api(`/chats/${cid}/messages` + q);
        const msgs = r.messages || [];
        if (r.other_last_read) { chatOtherLastRead = r.other_last_read; updateTicks(); }
        if (msgs.length) {
          msgs.forEach(m => {
            if (!document.querySelector(`.msg[data-id="${m.id}"]`)) {
              appendMessage(m);
            }
          });
          lastMsgTime = msgs[msgs.length - 1].created_at;
        }
      } catch {}
    }
    setComposerStatus('Отправлено', 'ok');
    setTimeout(() => {
      const statusEl = document.getElementById('msgFileName');
      if (statusEl && statusEl.textContent === 'Отправлено') setComposerStatus('', '');
    }, 1200);
  } catch (e) {
    const isOffline = !navigator.onLine || /network|failed|fetch|offline/i.test(String(e?.message || ''));
    if (isOffline && content && !file) {
      pendingChatQueue.push({ cid, content, created_at: new Date().toISOString() });
      persistPendingChatQueue();
      if (txtEl) { txtEl.value = ''; txtEl.style.height = 'auto'; }
      updateChatSendReady();
      localStorage.removeItem(`draft_${cid}`);
      const nameEl = document.getElementById('msgFileName');
      if (nameEl) nameEl.textContent = 'Сообщение поставлено в очередь (offline)';
      toast('Нет сети: сообщение будет отправлено автоматически');
      setComposerStatus(`В очереди: ${pendingChatQueue.length}`, 'pending');
      updateRealtimeStatus(false);
    } else {
      toast.error(e.message);
      setComposerStatus('Ошибка отправки', 'err');
    }
  } finally {
    window._chatSending = false;
    if (sendBtn) {
      sendBtn.disabled = false;
      sendBtn.style.opacity = '';
    }
    updateChatSendReady();
  }
}

async function flushPendingChatQueue() {
  if (!navigator.onLine || !pendingChatQueue.length) return;
  setComposerStatus(`Отправка очереди (${pendingChatQueue.length})...`, 'pending');
  const rest = [];
  for (const item of pendingChatQueue) {
    try {
      await api(`/chats/${item.cid}/messages`, { method: 'POST', body: { content: item.content } });
    } catch {
      rest.push(item);
    }
  }
  pendingChatQueue = rest;
  persistPendingChatQueue();
  updateRealtimeStatus(false);
  if (!pendingChatQueue.length && page === 'chat' && currentChatId) {
    setComposerStatus('Очередь отправлена', 'ok');
    setTimeout(() => {
      const statusEl = document.getElementById('msgFileName');
      if (statusEl && /очеред/i.test(statusEl.textContent || '')) setComposerStatus('', '');
    }, 1200);
  } else if (pendingChatQueue.length) {
    setComposerStatus(`В очереди: ${pendingChatQueue.length}`, 'pending');
  }
}

function scrollChatToBottom() {
  const el = document.getElementById('chatMsgs');
  if (el) el.scrollTop = el.scrollHeight;
  const btn = document.getElementById('scrollDownBtn');
  if (btn) { btn.classList.add('hidden'); btn.innerHTML = iconCut('back', 'ui-icon ui-icon--scroll-rot', 18, 18); }
}

// ── CHAT SEARCH ──
function toggleChatSearch(cid) {
  const panel = document.getElementById('chatSearchPanel');
  if (!panel) return;
  document.getElementById('groupMembersPanel')?.classList.add('hidden');
  panel.classList.toggle('hidden');
  if (!panel.classList.contains('hidden')) document.getElementById('chatSearchInput')?.focus();
}
function toggleGroupMembers() {
  const panel = document.getElementById('groupMembersPanel');
  if (!panel) return;
  document.getElementById('chatSearchPanel')?.classList.add('hidden');
  panel.classList.toggle('hidden');
}

let _chatSearchTimer = null;
function debouncedChatSearch(cid) {
  clearTimeout(_chatSearchTimer);
  _chatSearchTimer = setTimeout(() => runChatSearch(cid), 350);
}

async function runChatSearch(cid) {
  const q = document.getElementById('chatSearchInput')?.value?.trim();
  const resultsEl = document.getElementById('chatSearchResults');
  if (!resultsEl) return;
  if (!q || q.length < 2) { resultsEl.innerHTML = ''; return; }
  try {
    const msgs = await api(`/chats/${cid}/search?q=${encodeURIComponent(q)}`);
    if (!msgs.length) { resultsEl.innerHTML = '<div class="chat-search-empty">Ничего не найдено</div>'; return; }
    const mark = (text = '') => {
      const safe = esc(String(text));
      const re = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'ig');
      return safe.replace(re, '<mark>$1</mark>');
    };
    resultsEl.innerHTML = msgs.map(m => `
      <div class="chat-search-item" data-post-action="scroll-to-msg" data-msg-id="${m.id}">
        <div class="chat-search-sender">${esc(m.display_name)}</div>
        <div class="chat-search-text">${mark((m.content || '').slice(0,120))}${!m.content && m.file_type ? `FILE ${esc(m.file_type)}` : ''}</div>
        <div class="chat-search-time">${timeAgo(m.created_at)}</div>
      </div>
    `).join('');
  } catch {}
}

function scrollToMsg(mid) {
  const el = document.querySelector(`.msg[data-id="${mid}"]`);
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('msg-highlight');
    setTimeout(() => el.classList.remove('msg-highlight'), 2000);
  }
}

function openVideo(src) {
  if (document.getElementById('lightbox')) return;
  const lb = document.createElement('div');
  lb.id = 'lightbox';
  lb.innerHTML = `<div class="lb-backdrop"></div><video class="lb-video" src="${src}" controls autoplay playsinline></video>`;
  document.body.appendChild(lb);
  requestAnimationFrame(() => lb.classList.add('lb-in'));
  const close = () => {
    lb.querySelector('video')?.pause();
    lb.classList.remove('lb-in');
    lb.addEventListener('transitionend', () => lb.remove(), { once: true });
  };
  lb.querySelector('.lb-backdrop').addEventListener('click', close);
  lb.querySelector('.lb-video').addEventListener('click', e => e.stopPropagation());
  document.addEventListener('keydown', function esc(e) {
    if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); }
  });
  let _tsX = 0, _tsY = 0;
  lb.addEventListener('touchstart', e => { _tsX = e.touches[0].clientX; _tsY = e.touches[0].clientY; }, { passive: true });
  lb.addEventListener('touchend', e => {
    const dx = Math.abs(e.changedTouches[0].clientX - _tsX);
    const dy = Math.abs(e.changedTouches[0].clientY - _tsY);
    if (dx > 50 || dy > 60) close();
  });
}

async function startChat(uid, username) {
  try {
    const d = await api(`/chats/start/${uid}`, { method: 'POST' });
    go('chat', d.id);
  } catch (e) { toast.error(e.message); }
}

// ── VOICE RECORDING ──
function initVoiceBtn(cid) {
  const btn = document.getElementById('voiceBtn');
  if (!btn) return;
  btn.addEventListener('click', () => {
    if (mediaRecorder && mediaRecorder.state === 'recording') return;
    startRecording(cid);
  });
}

function stopRecordingPreview() {
  vrWantPreview = true;
  if (window._voiceWaveAnim) { cancelAnimationFrame(window._voiceWaveAnim); window._voiceWaveAnim = null; }
  if (window._voiceAudioCtx) { window._voiceAudioCtx.close(); window._voiceAudioCtx = null; }
  stopRecording();
}

function showVoicePreview(cid, blob, mime) {
  vrPreviewBlob = blob;
  const bar = document.getElementById('voicePreviewBar');
  const audio = document.getElementById('voicePreviewAudio');
  if (!bar || !audio) { sendVoiceMessage(cid, blob, mime); return; }
  bar.dataset.cid = cid;
  bar.dataset.mime = mime;
  const url = URL.createObjectURL(blob);
  if (audio.dataset.objectUrl) URL.revokeObjectURL(audio.dataset.objectUrl);
  audio.dataset.objectUrl = url;
  audio.src = url;
  const timeEl = document.getElementById('vpPreviewTime');
  const playBtn = document.getElementById('vpPreviewPlay');
  const wave = document.getElementById('voicePreviewWave');
  if (wave) {
    wave.innerHTML = vpBars(String(blob.size) + String(Date.now()));
    wave.onclick = e => {
      if (!audio.duration || !isFinite(audio.duration)) return;
      const rect = wave.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      audio.currentTime = ratio * audio.duration;
      updateVoicePreviewProgress(audio);
    };
  }
  audio.ontimeupdate = () => updateVoicePreviewProgress(audio);
  audio.onloadedmetadata = () => {
    if (timeEl && isFinite(audio.duration)) timeEl.textContent = vpFmt(audio.duration);
    updateVoicePreviewProgress(audio);
  };
  audio.onended = () => {
    if (playBtn) playBtn.innerHTML = playPauseIconHtml(false, 16, 16);
    if (timeEl) timeEl.textContent = vpFmt(audio.duration || 0);
    updateVoicePreviewProgress(audio);
  };
  bar.classList.remove('hidden');
}

function updateVoicePreviewProgress(audio) {
  const timeEl = document.getElementById('vpPreviewTime');
  const wave = document.getElementById('voicePreviewWave');
  const pct = audio.duration && isFinite(audio.duration) ? audio.currentTime / audio.duration : 0;
  if (timeEl) {
    const current = audio.currentTime || 0;
    const total = audio.duration && isFinite(audio.duration) ? audio.duration : 0;
    timeEl.textContent = `${vpFmt(current)} / ${vpFmt(total)}`;
  }
  wave?.querySelectorAll('.vp-bar').forEach((bar, i, arr) => {
    bar.classList.toggle('active', i / Math.max(arr.length - 1, 1) <= pct);
  });
}

async function sendVoicePreview() {
  const bar = document.getElementById('voicePreviewBar');
  const audio = document.getElementById('voicePreviewAudio');
  if (!bar || !vrPreviewBlob) return;
  const cid = bar.dataset.cid, mime = bar.dataset.mime;
  if (audio) {
    audio.pause();
    if (audio.dataset.objectUrl) URL.revokeObjectURL(audio.dataset.objectUrl);
    audio.dataset.objectUrl = '';
    audio.src = '';
  }
  const playBtn = document.getElementById('vpPreviewPlay');
  if (playBtn) playBtn.innerHTML = playPauseIconHtml(false, 16, 16);
  bar.classList.add('hidden');
  const blob = vrPreviewBlob;
  vrPreviewBlob = null;
  await sendVoiceMessage(cid, blob, mime);
}

function cancelVoicePreview() {
  const bar = document.getElementById('voicePreviewBar');
  const audio = document.getElementById('voicePreviewAudio');
  const playBtn = document.getElementById('vpPreviewPlay');
  if (audio) {
    audio.pause();
    if (audio.dataset.objectUrl) URL.revokeObjectURL(audio.dataset.objectUrl);
    audio.dataset.objectUrl = '';
    audio.src = '';
  }
  if (playBtn) playBtn.innerHTML = playPauseIconHtml(false, 16, 16);
  bar?.classList.add('hidden');
  vrPreviewBlob = null;
  document.getElementById('composerNormal')?.classList.remove('hidden');
}

function restartVoiceRecording() {
  const cid = document.getElementById('voicePreviewBar')?.dataset.cid || currentChatId;
  cancelVoicePreview();
  if (cid) startRecording(cid);
}

async function startRecording(cid) {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    toast.error('Браузер не поддерживает запись аудио');
    return;
  }
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    toast.error('Нет доступа к микрофону');
    return;
  }

  audioChunks = [];
  recordingCancelled = false;

  // Pick best supported MIME type
  const mime =
    MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' :
    MediaRecorder.isTypeSupported('audio/webm')             ? 'audio/webm' :
    MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')  ? 'audio/ogg;codecs=opus' :
    '';

  mediaRecorder = new MediaRecorder(stream, mime ? { mimeType: mime } : {});

  mediaRecorder.ondataavailable = e => {
    if (e.data && e.data.size > 0) audioChunks.push(e.data);
  };

  mediaRecorder.onstop = () => {
    stream.getTracks().forEach(t => t.stop());
    clearInterval(recordingInterval);
    setVoiceBtn(false);
    if (recordingCancelled || audioChunks.length === 0) {
      vrWantPreview = false;
      document.getElementById('composerNormal')?.classList.remove('hidden');
      return;
    }
    const finalMime = mediaRecorder.mimeType || 'audio/webm';
    const blob = new Blob(audioChunks, { type: finalMime });
    if (blob.size < 1000) {
      vrWantPreview = false;
      document.getElementById('composerNormal')?.classList.remove('hidden');
      return;
    }
    if (vrWantPreview) {
      vrWantPreview = false;
      showVoicePreview(cid, blob, finalMime);
    } else {
      sendVoiceMessage(cid, blob, finalMime);
    }
  };

  mediaRecorder.start(250); // collect data every 250ms
  recordingSeconds = 0;
  document.getElementById('composerNormal')?.classList.add('hidden');
  document.getElementById('voiceRecBar')?.classList.remove('hidden');
  setVoiceBtn(true);

  // Voice waveform visualization via Web Audio API
  let audioCtx, analyser, waveAnim;
  try {
    audioCtx = new AudioContext();
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 64;
    const src = audioCtx.createMediaStreamSource(stream);
    src.connect(analyser);
    const waveCanvas = document.getElementById('voiceWaveCanvas');
    if (waveCanvas) {
      const waveCtx = waveCanvas.getContext('2d');
      const bufLen = analyser.frequencyBinCount;
      const dataArr = new Uint8Array(bufLen);
      function drawWave() {
        window._voiceWaveAnim = requestAnimationFrame(drawWave);
        analyser.getByteFrequencyData(dataArr);
        waveCtx.clearRect(0, 0, waveCanvas.width, waveCanvas.height);
        waveCtx.fillStyle = 'var(--accent, #7c3aed)';
        const barW = (waveCanvas.width / bufLen) * 2.5;
        let x = 0;
        for (let i = 0; i < bufLen; i++) {
          const barH = (dataArr[i] / 255) * waveCanvas.height;
          waveCtx.fillRect(x, waveCanvas.height - barH, barW, barH);
          x += barW + 1;
        }
      }
      drawWave();
    }
  } catch {}
  window._voiceAudioCtx = audioCtx;
  window._voiceAnalyser = analyser;

  // Timer: update label every second, auto-stop at 5 min
  recordingInterval = setInterval(() => {
    recordingSeconds++;
    setVoiceBtn(true);
    if (recordingSeconds >= 300) stopRecording();
  }, 1000);
}

function stopRecording() {
  if (!mediaRecorder || mediaRecorder.state === 'inactive') return;
  mediaRecorder.stop();
  // interval cleared in onstop
}

function cancelRecording() {
  recordingCancelled = true;
  if (window._voiceWaveAnim) { cancelAnimationFrame(window._voiceWaveAnim); window._voiceWaveAnim = null; }
  if (window._voiceAudioCtx) { window._voiceAudioCtx.close(); window._voiceAudioCtx = null; }
  stopRecording();
}

function setVoiceBtn(recording) {
  const s = recordingSeconds;
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  const timer = document.getElementById('voiceTimer');
  if (timer) timer.textContent = `${mm}:${ss}`;
  if (!recording) {
    document.getElementById('voiceRecBar')?.classList.add('hidden');
    // mic button visibility is handled by the caller (cancel/preview/send)
  }
}

async function sendVoiceMessage(cid, blob, mimeType) {
  // Determine extension from MIME
  const ext =
    mimeType.includes('ogg')  ? '.ogg'  :
    mimeType.includes('mp4')  ? '.mp4'  :
    mimeType.includes('mpeg') ? '.mp3'  : '.webm';

  const file = new File([blob], `voice_${Date.now()}${ext}`, { type: blob.type });
  const fd = new FormData();
  fd.append('file', file);

  try {
    await api('/chats/' + cid + '/messages', { method: 'POST', body: fd });
    // Fetch the new message so sender sees it immediately
    if (page === 'chat' && currentChatId === cid) {
      const q = lastMsgTime ? `?after=${encodeURIComponent(lastMsgTime)}` : '';
      const r = await api(`/chats/${cid}/messages${q}`);
      const msgs = r.messages || [];
      if (r.other_last_read) { chatOtherLastRead = r.other_last_read; updateTicks(); }
      if (msgs.length) {
        msgs.forEach(m => {
          if (!document.querySelector(`.msg[data-id="${m.id}"]`)) appendMessage(m);
        });
        lastMsgTime = msgs[msgs.length - 1].created_at;
      }
    }
  } catch (e) {
    toast.error('Ошибка отправки: ' + e.message);
  } finally {
    document.getElementById('composerNormal')?.classList.remove('hidden');
  }
}

// ── ADMIN ──
// ── HUB ──
const HUB_PLATFORMS = [
  { id: 'youtube',    name: 'YouTube',    icon: 'YT', handle: '@Walfirrr',   profile: 'https://www.youtube.com/@Walfirrr',        analytics: 'https://studio.youtube.com',                    group: 'SOCIALS',  keyHint: 'Google API key (Data API v3)' },
  { id: 'instagram',  name: 'Instagram',  icon: 'IG', handle: '@walfirrr',   profile: 'https://www.instagram.com/walfirrr/',      analytics: 'https://www.instagram.com/walfirrr/insights/',  group: 'SOCIALS',  keyHint: 'Meta Basic Display API token' },
  { id: 'tiktok',     name: 'TikTok',     icon: '♪', handle: '@walfirrr',   profile: 'https://www.tiktok.com/@walfirrr',         analytics: 'https://www.tiktok.com/tiktokstudio/content',   group: 'SOCIALS',  keyHint: 'TikTok API client key' },
  { id: 'x',          name: 'X',          icon: '✕', handle: '@WalfirHere', profile: 'https://x.com/WalfirHere',                 analytics: 'https://analytics.twitter.com',                 group: 'SOCIALS',  keyHint: null },
  { id: 'vk',         name: 'VK',         icon: '❖', handle: 'walfir_off',  profile: 'https://vk.com/walfir_off',                analytics: 'https://vk.com/stats?group=walfir_off',         group: 'SOCIALS',  keyHint: 'Необязательно (публичный API)' },
  { id: 'threads',    name: 'Threads',    icon: 'TH', handle: '@walfirrr',   profile: 'https://www.threads.com/@walfirrr',        analytics: null,                                            group: 'SOCIALS',  keyHint: null },
  { id: 'soundcloud', name: 'SoundCloud', icon: '◐', handle: 'walfir',      profile: 'https://soundcloud.com/walfir',            analytics: 'https://soundcloud.com/dashboard',              group: 'MUSIC',    keyHint: null },
  { id: 'twitch',     name: 'Twitch',     icon: '◈', handle: 'walfirrr',    profile: 'https://www.twitch.tv/walfirrr',           analytics: 'https://dashboard.twitch.tv',                   group: 'STREAMS',  keyHint: 'client_id:client_secret' },
  { id: 'kick',       name: 'Kick',       icon: '◆', handle: 'walfir',      profile: 'https://kick.com/walfir',                  analytics: 'https://kick.com/dashboard',                    group: 'STREAMS',  keyHint: null },
  { id: 'telegram',   name: 'Telegram',   icon: 'TG', handle: 'walfirhere',  profile: 'https://t.me/walfirhere',                  analytics: null,                                            group: 'CHATS',    keyHint: null },
  { id: 'discord',    name: 'Discord',    icon: '⬡', handle: 'WALFIR',      profile: 'https://discord.gg/9HmN7cRzT3',           analytics: 'https://discord.com/developers/servers',        group: 'CHATS',    keyHint: null },
];

function fmtStat(n) {
  if (n == null) return null;
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}

function fmtHubTs(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

async function renderHub(app) {
  if (!me || !me.is_admin) return go('feed');
  app.innerHTML = `<div class="page-title hub-page-title">${iconCut('settings', 'ui-icon hub-title-ic', 17, 17)}HUB</div><div class="empty">· · ·</div>`;

  let s, ext;
  try { [s, ext] = await Promise.all([api('/hub/stats'), api('/hub/external')]); }
  catch (e) { app.innerHTML = `<div class="page-title hub-page-title">${iconCut('settings', 'ui-icon hub-title-ic', 17, 17)}HUB</div><div class="empty">${esc(e.message)}</div>`; return; }

  const groups = ['SOCIALS','MUSIC','STREAMS','CHATS'];

  function statBadge(platId) {
    const wrap = ext[platId];
    const d = wrap?.data ?? wrap;
    if (!d) return '';
    const parts = [];
    if (d.subscribers != null) parts.push(`<span class="hub-live-stat">${fmtStat(d.subscribers)} <span class="hub-live-lbl">subs</span></span>`);
    if (d.followers  != null) parts.push(`<span class="hub-live-stat">${fmtStat(d.followers)} <span class="hub-live-lbl">foll</span></span>`);
    if (d.views      != null) parts.push(`<span class="hub-live-stat">${fmtStat(d.views)} <span class="hub-live-lbl">views</span></span>`);
    if (d.tracks     != null) parts.push(`<span class="hub-live-stat">${fmtStat(d.tracks)} <span class="hub-live-lbl">tracks</span></span>`);
    if (d.tweets     != null) parts.push(`<span class="hub-live-stat">${fmtStat(d.tweets)} <span class="hub-live-lbl">tweets</span></span>`);
    if (d.videos     != null) parts.push(`<span class="hub-live-stat">${fmtStat(d.videos)} <span class="hub-live-lbl">videos</span></span>`);
    const stamp = wrap?.updated_at
      ? `<div class="hub-live-lbl" style="margin-top:4px">${wrap.cached ? 'кеш' : 'live'} · ${fmtHubTs(wrap.updated_at)}</div>`
      : '';
    return parts.length ? `<div class="hub-live-stats">${parts.join('')}</div>${stamp}` : stamp;
  }

  app.innerHTML = `
    <div class="page-title-row">
      <span class="page-title hub-page-title">${iconCut('settings', 'ui-icon hub-title-ic', 17, 17)}HUB <span style="font-size:0.55rem;opacity:0.4;font-weight:400">METRICS</span></span>
      <button class="btn btn-sm btn-ghost btn-ic-row" data-post-action="refresh-hub-external">${iconCut('download', 'ui-icon', 12, 12)}SYNC ОБНОВИТЬ</button>
    </div>

    <div class="hub-w0pium">
      <div class="hub-section-title">W0PIUM</div>
      <div class="hub-stats-grid">
        ${[
          { label: 'ПОСТОВ',        val: s.posts, ic: 'home' },
          { label: 'ФОЛЛОВЕРОВ',   val: s.followers, ic: 'profile' },
          { label: 'ЛАЙКОВ',       val: s.likes, ic: 'like' },
          { label: 'ПРОСЛУШИВАНИЙ',val: s.plays, ic: 'play' },
          { label: 'ДРОПОВ',       val: s.drops, ic: 'media' },
          { label: 'КОММЕНТАРИЕВ', val: s.comments, ic: 'comment' },
        ].map(x => `<div class="hub-stat"><div class="hub-stat-val">${x.val}</div><div class="hub-stat-lbl">${iconCut(x.ic, 'ui-icon hub-stat-ic', 10, 10)}${x.label}</div></div>`).join('')}
      </div>
    </div>

    ${groups.map(grp => {
      const items = HUB_PLATFORMS.filter(p => p.group === grp);
      return `
        <div class="hub-group">
          <div class="hub-section-title">${grp}</div>
          <div class="hub-cards">
            ${items.map(p => `
              <div class="hub-card">
                <div class="hub-card-icon">${p.icon}</div>
                <div class="hub-card-info">
                  <div class="hub-card-name">${p.name}</div>
                  <div class="hub-card-handle">${p.handle}</div>
                  ${statBadge(p.id)}
                </div>
                <div class="hub-card-actions">
                  <a class="hub-btn" href="${p.profile}" target="_blank" rel="noopener">ПРОФИЛЬ</a>
                  ${p.analytics ? `<a class="hub-btn hub-btn-accent" href="${p.analytics}" target="_blank" rel="noopener">АНАЛИТИКА</a>` : '<span class="hub-btn hub-btn-dim">—</span>'}
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }).join('')}

    <div class="hub-group">
      <div class="hub-section-title">API КЛЮЧИ <span style="opacity:0.4;font-weight:400">· кешируется 30 мин</span></div>
      <div class="hub-keys">
        ${HUB_PLATFORMS.filter(p => p.keyHint).map(p => `
          <div class="hub-key-row">
            <div class="hub-key-name">${p.icon} ${p.name}</div>
            <input class="input hub-key-input" id="hkey-${p.id}" placeholder="${p.keyHint}" autocomplete="off" spellcheck="false">
            <button class="hub-btn hub-btn-save" data-post-action="save-hub-key" data-platform-id="${p.id}">СОХРАНИТЬ</button>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  // Load masked existing keys
  try {
    const keys = await api('/hub/keys');
    HUB_PLATFORMS.filter(p => p.keyHint).forEach(p => {
      const el = document.getElementById('hkey-' + p.id);
      if (el && keys[p.id]) el.placeholder = keys[p.id];
    });
  } catch {}
}

async function saveHubKey(platformId) {
  const el = document.getElementById('hkey-' + platformId);
  if (!el) return;
  const key = el.value.trim();
  try {
    await api('/hub/keys', { method: 'POST', body: { platform: platformId, api_key: key } });
    toast.success('Ключ сохранён');
    el.value = '';
    el.placeholder = '••••' + key.slice(-4);
  } catch (e) { toast.error(e.message); }
}

async function refreshHubExternal() {
  try {
    await api('/hub/external?refresh=1');
    toast.success('Hub обновлён');
    await renderHub(document.getElementById('app'));
  } catch (e) {
    toast.error(e.message);
  }
}

let adminTab = 'stats';

async function renderAdmin(app) {
  if (!me || !me.is_admin) return go('feed');
  app.innerHTML = `
    <div class="admin-wrap">
      <h2 class="admin-title admin-title-row">${iconCut('settings', 'ui-icon admin-title-ic', 18, 18)}ПАНЕЛЬ УПРАВЛЕНИЯ</h2>
      <div class="admin-tabs">
        <button class="admin-tab ${adminTab==='stats'?'active':''}" data-post-action="admin-switch-tab" data-tab="stats">${iconCut('home', 'ui-icon', 11, 11)}СТАТИСТИКА</button>
        <button class="admin-tab ${adminTab==='users'?'active':''}" data-post-action="admin-switch-tab" data-tab="users">${iconCut('profile', 'ui-icon', 11, 11)}ПОЛЬЗОВАТЕЛИ</button>
        <button class="admin-tab ${adminTab==='drops'?'active':''}" data-post-action="admin-switch-tab" data-tab="drops">${iconCut('media', 'ui-icon', 11, 11)}DROPS</button>
        <button class="admin-tab ${adminTab==='invites'?'active':''}" data-post-action="admin-switch-tab" data-tab="invites">${iconCut('add', 'ui-icon', 11, 11)}ИНВАЙТЫ</button>
        <button class="admin-tab ${adminTab==='reports'?'active':''}" data-post-action="admin-switch-tab" data-tab="reports">${iconCut('warning', 'ui-icon', 11, 11)}ЖАЛОБЫ</button>
        <button class="admin-tab ${adminTab==='verify'?'active':''}" data-post-action="admin-switch-tab" data-tab="verify">${iconCut('check', 'ui-icon', 11, 11)}ВЕРИФИКАЦИИ</button>
        <button class="admin-tab ${adminTab==='diag'?'active':''}" data-post-action="admin-switch-tab" data-tab="diag">${iconCut('more-horizontal', 'ui-icon', 11, 11)}DIAG</button>
      </div>
      <div id="adminContent" class="admin-content">
        <div class="empty">· · ·</div>
      </div>
    </div>
  `;
  loadAdminTab();
}

function adminSwitch(tab) {
  adminTab = tab;
  document.querySelectorAll('.admin-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  loadAdminTab();
}

async function loadAdminTab() {
  const el = document.getElementById('adminContent');
  if (!el) return;
  el.innerHTML = '<div class="empty">· · ·</div>';
  try {
    if (adminTab === 'stats') {
      const s = await api('/admin/stats');
      el.innerHTML = `
        <div class="admin-stats">
          <div class="stat-card"><div class="stat-val">${s.users}</div><div class="stat-lbl">пользователей</div></div>
          <div class="stat-card"><div class="stat-val">${s.today}</div><div class="stat-lbl">новых сегодня</div></div>
          <div class="stat-card"><div class="stat-val">${s.msgs}</div><div class="stat-lbl">сообщений</div></div>
          <div class="stat-card"><div class="stat-val">${s.msgToday}</div><div class="stat-lbl">сообщений сегодня</div></div>
          <div class="stat-card"><div class="stat-val">${s.drops}</div><div class="stat-lbl">активных drops</div></div>
          <div class="stat-card"><div class="stat-val">${s.banned}</div><div class="stat-lbl">забанено</div></div>
          <div class="stat-card"><div class="stat-val">${s.admins}</div><div class="stat-lbl">администраторов</div></div>
          <div class="stat-card"><div class="stat-val">${s.reports||0}</div><div class="stat-lbl">открытых жалоб</div></div>
        </div>
      `;
    } else if (adminTab === 'users') {
      const users = await api('/admin/users');
      el.innerHTML = `
        <div class="admin-search-row">
          <input class="input" id="adminUserSearch" placeholder="Поиск по нику..." style="max-width:260px">
        </div>
        <div id="adminUserList" class="admin-list">
          ${users.map(u => adminUserRow(u)).join('')}
        </div>
      `;
      el.dataset.users = JSON.stringify(users);
    } else if (adminTab === 'drops') {
      const drops = await api('/admin/drops');
      if (!drops.length) { el.innerHTML = '<div class="empty">Нет drops</div>'; return; }
      el.innerHTML = `<div class="admin-list">${drops.map(d => `
        <div class="admin-row" id="adrop-${esc(d.id)}">
          ${d.image ? `<img class="admin-drop-thumb" src="${esc(d.image)}" alt="">` : '<div class="admin-drop-thumb no-img"></div>'}
          <div class="admin-row-info">
            <span class="admin-row-name">${esc(d.display_name)} <span class="fg3">@${esc(d.username)}</span></span>
            <span class="admin-row-meta">${esc(d.content||'—')} · ${d.views} просмотров · ${timeAgo(d.created_at)}</span>
          </div>
          <button class="btn btn-sm btn-danger btn-ic-row" data-post-action="admin-del-drop" data-drop-id="${esc(d.id)}">${iconCut('trash', 'ui-icon', 14, 14)}УДАЛИТЬ</button>
        </div>
      `).join('')}</div>`;
    } else if (adminTab === 'invites') {
      const inv = await api('/admin/invites');
      el.innerHTML = `<div class="admin-list">${inv.map(i => `
        <div class="admin-row">
          <div class="admin-row-info">
            <span class="admin-row-name">${esc(i.owner)}</span>
            <span class="admin-row-meta">Код: <code>${esc(i.code)}</code> · Использован ${i.used_count} раз</span>
          </div>
        </div>
      `).join('')}</div>`;
    } else if (adminTab === 'reports') {
      const reports = await api('/admin/reports');
      if (!reports.length) { el.innerHTML = '<div class="empty">Нет открытых жалоб</div>'; return; }
      el.innerHTML = `<div class="admin-list">${reports.map(r => `
        <div class="admin-row" id="arep-${esc(r.id)}">
          <div class="admin-row-info">
            <span class="admin-row-name">${esc(r.target_type)} <span class="fg3">#${esc(r.target_id.slice(0,8))}</span></span>
            <span class="admin-row-meta">от @${esc(r.reporter_username)} · ${esc(r.reason)} · ${timeAgo(r.created_at)}</span>
          </div>
          <div class="admin-actions">
            ${r.target_type==='post'?`<button class="btn btn-sm btn-ghost btn-ic-row" data-post-action="go-feed">${iconCut('forward', 'ui-icon', 13, 13)}ПЕРЕЙТИ</button>`:''}
            <button class="btn btn-sm btn-ic-row" data-post-action="admin-resolve-report" data-report-id="${esc(r.id)}">${iconCut('check', 'ui-icon', 13, 13)}ЗАКРЫТЬ</button>
          </div>
        </div>
      `).join('')}</div>`;
    } else if (adminTab === 'verify') {
      const reqs = await api('/admin/verify-requests');
      if (!reqs.length) { el.innerHTML = '<div class="empty">Нет заявок на верификацию</div>'; return; }
      el.innerHTML = `<div class="admin-list">${reqs.map(r => `
        <div class="admin-row" id="avreq-${esc(r.id)}">
          ${avatarEl(r.avatar, 'avatar-sm', initial(r.display_name))}
          <div class="admin-row-info">
            <span class="admin-row-name">${esc(r.display_name)} <span class="fg3">@${esc(r.username)}</span>
              ${r.is_verified ? `${verifiedBadge(r.is_verified, r.badge_type)} уже верифицирован` : ''}
            </span>
            <span class="admin-row-meta">Значок: <strong>${esc(r.badge_type)}</strong> · ${timeAgo(r.created_at)}</span>
            <span class="admin-row-meta vreq-reason">${esc(r.reason)}</span>
          </div>
          <div class="admin-actions">
            <button class="btn btn-sm btn-ic-row" data-post-action="admin-approve-verify" data-request-id="${esc(r.id)}">${iconCut('check', 'ui-icon', 13, 13)}ПРИНЯТЬ</button>
            <button class="btn btn-sm btn-danger btn-ic-row" data-post-action="admin-reject-verify" data-request-id="${esc(r.id)}">${iconCut('close', 'ui-icon', 13, 13)}DECLINE</button>
          </div>
        </div>
      `).join('')}</div>`;
    } else if (adminTab === 'diag') {
      const d = await api('/admin/diagnostics');
      const jq = await api('/admin/jobs?limit=15');
      const mem = d.memory || {};
      const db = d.db || {};
      const jb = d.background_jobs || {};
      const jobs = Array.isArray(jq.jobs) ? jq.jobs : [];
      const errs = Array.isArray(d.recent_errors) ? d.recent_errors : [];
      el.innerHTML = `
        <div class="admin-stats">
          <div class="stat-card"><div class="stat-val">${Math.floor((d.uptime_sec || 0) / 60)}м</div><div class="stat-lbl">uptime</div></div>
          <div class="stat-card"><div class="stat-val">${esc(d.node || 'n/a')}</div><div class="stat-lbl">node</div></div>
          <div class="stat-card"><div class="stat-val">${fmtBytes(mem.rss || 0)}</div><div class="stat-lbl">rss</div></div>
          <div class="stat-card"><div class="stat-val">${fmtBytes(mem.heap_used || 0)}</div><div class="stat-lbl">heap used</div></div>
          <div class="stat-card"><div class="stat-val">${db.users || 0}</div><div class="stat-lbl">users</div></div>
          <div class="stat-card"><div class="stat-val">${db.messages || 0}</div><div class="stat-lbl">messages</div></div>
          <div class="stat-card"><div class="stat-val">${db.files || 0}</div><div class="stat-lbl">disk files</div></div>
          <div class="stat-card"><div class="stat-val">${db.reports_open || 0}</div><div class="stat-lbl">open reports</div></div>
          <div class="stat-card"><div class="stat-val">${jb.pending ?? 0}</div><div class="stat-lbl">jobs pending</div></div>
          <div class="stat-card"><div class="stat-val">${jb.failed ?? 0}</div><div class="stat-lbl">jobs failed</div></div>
        </div>
        <div class="admin-diag-meta">build: ${esc(d.build || 'n/a')} · env: ${esc(d.env || 'n/a')} · req: ${esc(d.req_id || 'n/a')}
          · <button type="button" class="btn btn-sm btn-ghost btn-ic-row" data-post-action="admin-diag-refresh">${iconCut('download', 'ui-icon', 12, 12)}обновить</button>
          · <button type="button" class="btn btn-sm btn-ic-row" data-post-action="admin-enqueue-noop-job">${iconCut('add', 'ui-icon', 12, 12)}noop job</button>
        </div>
        <div class="admin-list admin-job-list">
          ${jobs.length ? jobs.map(j => `
            <div class="admin-row">
              <div class="admin-row-info">
                <span class="admin-row-name">${esc(j.type)} <span class="fg3">${esc(j.status)}</span> · att ${esc(String(j.attempts))}</span>
                <span class="admin-row-meta">${esc(j.created_at || '')} → ${esc(j.updated_at || '')}</span>
                <span class="admin-row-meta mono-sm">${esc(j.id || '').slice(0, 10)}… ${esc(j.error_short || '')}</span>
              </div>
            </div>
          `).join('') : '<div class="empty">Нет задач в очереди</div>'}
        </div>
        <div class="admin-list">
          ${errs.length ? errs.map(er => `
            <div class="admin-row">
              <div class="admin-row-info">
                <span class="admin-row-name">${esc(er.method || 'UNK')} ${esc(er.path || '-')} <span class="fg3">(${esc(String(er.status || 500))})</span></span>
                <span class="admin-row-meta">${esc(er.at || '')} · req ${esc(er.req_id || 'n/a')}</span>
                <span class="admin-row-meta">${esc(er.message || 'Unknown error')}</span>
              </div>
            </div>
          `).join('') : '<div class="empty">Ошибок в буфере нет</div>'}
        </div>
      `;
    }
  } catch (e) { el.innerHTML = `<div class="empty msg-err">${esc(e.message)}</div>`; }
}

async function adminDiagRefresh() {
  if (adminTab !== 'diag') return;
  await loadAdminTab();
}

async function adminEnqueueNoopJob() {
  try {
    const r = await api('/admin/jobs/test', { method: 'POST', body: { type: 'noop' } });
    toast(r.job_id ? `В очередь: ${r.job_id.slice(0, 8)}…` : 'В очередь');
    await loadAdminTab();
  } catch (e) { toast.error(e.message); }
}

async function adminResolveReport(rid) {
  await api(`/admin/reports/${rid}/resolve`, { method:'POST' });
  document.getElementById(`arep-${rid}`)?.remove();
  toast('Жалоба закрыта');
}

function adminUserRow(u) {
  const isBanned = !!u.banned_at;
  const isMe = me && sameId(u.id, me.id);
  return `
    <div class="admin-row ${isBanned?'banned':''}" id="auser-${esc(u.id)}">
      ${avatarEl(u.avatar, 'avatar-sm', initial(u.display_name))}
      <div class="admin-row-info">
        <span class="admin-row-name">${esc(u.display_name)} <span class="fg3">@${esc(u.username)}</span>
          ${u.is_admin ? '<span class="badge-admin">ADMIN</span>' : ''}
          ${isBanned ? '<span class="badge-ban">БАН</span>' : ''}
        </span>
        <span class="admin-row-meta">${esc(u.email)} · вступил ${timeAgo(u.created_at)}${isBanned&&u.ban_reason?' · причина: '+esc(u.ban_reason):''}</span>
      </div>
      ${isMe ? '' : `
        <div class="admin-actions">
          <button class="btn btn-sm btn-ic-row ${isBanned?'':'btn-danger'}" data-post-action="admin-ban" data-user-id="${esc(u.id)}" data-username="${esc(u.username)}" data-is-banned="${isBanned ? '1' : '0'}">${isBanned ? iconCut('unlock', 'ui-icon', 13, 13) + 'РАЗБАН' : iconCut('lock', 'ui-icon', 13, 13) + 'БАН'}</button>
          ${!u.is_admin ? `<button class="btn btn-sm btn-ic-row" data-post-action="admin-promote" data-user-id="${esc(u.id)}" data-username="${esc(u.username)}" data-is-admin="0">${iconCut('add', 'ui-icon', 12, 12)}ADMIN</button>` : ''}
          <button class="btn btn-sm btn-ic-row ${u.is_verified?'btn-ghost':''}" data-post-action="admin-verify" data-user-id="${esc(u.id)}" data-username="${esc(u.username)}" data-is-verified="${u.is_verified ? '1' : '0'}" data-badge-type="${esc(u.badge_type||'')}">${u.is_verified?`${verifiedBadge(true,u.badge_type)} ВЕРИФИЦИРОВАН`:`${iconCut('check', 'ui-icon', 13, 13)}ВЕРИФИЦИРОВАТЬ`}</button>
          ${!u.is_admin ? `<button class="btn btn-sm btn-danger" data-post-action="admin-delete-user" data-user-id="${esc(u.id)}" data-username="${esc(u.username)}" aria-label="Удалить">${iconCut('trash', 'ui-icon', 15, 15)}</button>` : ''}
        </div>
      `}
    </div>
  `;
}

function adminFilterUsers() {
  const q = (document.getElementById('adminUserSearch')?.value || '').toLowerCase();
  const el = document.getElementById('adminUserList');
  if (!el) return;
  const users = JSON.parse(el.parentElement.dataset.users || '[]');
  el.innerHTML = users
    .filter(u => !q || u.username.toLowerCase().includes(q) || u.display_name.toLowerCase().includes(q))
    .map(u => adminUserRow(u)).join('');
}

async function adminBan(uid, username, isBanned) {
  if (!isBanned) {
    const reason = prompt(`Причина бана @${username} (необязательно):`);
    if (reason === null) return;
    await api(`/admin/users/${uid}/ban`, { method:'POST', body:{ reason } });
  } else {
    if (!confirm(`Разбанить @${username}?`)) return;
    await api(`/admin/users/${uid}/ban`, { method:'POST', body:{} });
  }
  loadAdminTab();
}

async function adminPromote(uid, username, isAdmin) {
  const action = isAdmin ? `снять права администратора у @${username}` : `назначить @${username} администратором`;
  if (!confirm(`Вы уверены? ${action}`)) return;
  await api(`/admin/users/${uid}/promote`, { method:'POST' });
  loadAdminTab();
}

async function adminVerify(uid, username, isVerified, currentBadge) {
  if (isVerified) {
    if (!confirm(`Снять верификацию у @${username}?`)) return;
    await api(`/admin/users/${uid}/verify`, { method:'POST', body:{ badge_type:'' } });
  } else {
    const badge = prompt(`Тип значка для @${username} (напр. ARTIST, TEAM, RTE):`, currentBadge || 'ARTIST');
    if (badge === null) return;
    await api(`/admin/users/${uid}/verify`, { method:'POST', body:{ badge_type: badge.trim() } });
  }
  loadAdminTab();
}

async function adminApproveVerify(reqId) {
  await api(`/admin/verify-requests/${reqId}/approve`, { method:'POST' });
  document.getElementById(`avreq-${reqId}`)?.remove();
  toast.success('Верификация одобрена');
}

async function adminRejectVerify(reqId) {
  const reason = prompt('Причина отклонения (необязательно):');
  if (reason === null) return;
  await api(`/admin/verify-requests/${reqId}/reject`, { method:'POST', body:{ reason } });
  document.getElementById(`avreq-${reqId}`)?.remove();
  toast('Заявка отклонена');
}

async function adminDeleteUser(uid, username) {
  if (!confirm(`Удалить аккаунт @${username} навсегда? Это действие нельзя отменить.`)) return;
  await api(`/admin/users/${uid}`, { method:'DELETE' });
  loadAdminTab();
}

async function adminDelDrop(id) {
  if (!confirm('Удалить этот drop?')) return;
  await api(`/admin/drops/${id}`, { method:'DELETE' });
  document.getElementById(`adrop-${id}`)?.remove();
}

// ── AUTH ──
function renderAuth(app, mode) {
  const isLogin = mode === 'login';
  app.innerHTML = `
    <div class="auth-wrap">
      ${opiumCoreHero('auth')}
      <h1>${isLogin ? 'ВХОД' : 'РЕГИСТРАЦИЯ'}</h1>
      <div class="auth-form">
        ${!isLogin ? '<input class="input" id="aName" placeholder="Имя артиста" autocomplete="name">' : ''}
        <input class="input" id="aUser" placeholder="${isLogin ? 'Email или Username' : 'Username'}" autocapitalize="off" autocomplete="${isLogin ? 'username' : 'username'}">
        ${!isLogin ? '<input class="input" id="aEmail" type="email" placeholder="Email" autocomplete="email">' : ''}
        <input class="input" id="aPass" type="password" placeholder="Пароль" autocomplete="${isLogin ? 'current-password' : 'new-password'}">
        ${!isLogin ? '<div id="pwStrength" class="pw-strength"></div>' : ''}
        ${!isLogin ? '<input class="input" id="aPass2" type="password" placeholder="Повтори пароль" autocomplete="new-password">' : ''}
        ${!isLogin ? '<input class="input" id="aInvite" placeholder="Инвайт-код / Мастер-код W0PIUM" autocapitalize="characters" spellcheck="false" autocomplete="off">' : ''}
        <button class="btn btn-ic-row" data-post-action="do-auth" data-mode="${mode}">${isLogin ? `${iconCut('lock', 'ui-icon', 15, 15)}ВОЙТИ` : `${iconCut('add', 'ui-icon', 15, 15)}СОЗДАТЬ`}</button>
        <div id="aErr" class="msg-err"></div>
      </div>
      ${isLogin ? '<div class="auth-forgot"><span data-post-action="show-forgot-step">Забыл пароль?</span></div>' : ''}
      <div class="auth-switch">
        ${isLogin
          ? 'Нет аккаунта? <span data-post-action="go-register">РЕГИСТРАЦИЯ</span>'
          : 'Уже есть аккаунт? <span data-post-action="go-login">ВОЙТИ</span>'}
      </div>
    </div>
  `;
  setTimeout(() => {
    if (pendingVerifyUsername) { showVerifyStep(pendingVerifyUsername); return; }
    $$('.auth-form input').forEach(i => i.addEventListener('keydown', e => { if (e.key === 'Enter') doAuth(mode); }));
    const passEl = document.getElementById('aPass');
    if (passEl && !isLogin) passEl.addEventListener('input', e => checkPwStrength(e.target.value));
    (isLogin ? $('#aUser') : $('#aName'))?.focus();
  }, 50);
}

async function doAuth(mode) {
  const username = ($('#aUser')?.value || '').trim();
  const password = $('#aPass')?.value || '';
  const password2 = $('#aPass2')?.value || '';
  const display_name = $('#aName')?.value?.trim();
  const email = ($('#aEmail')?.value || '').trim();
  const invite_code = ($('#aInvite')?.value || '').trim();
  const errEl = $('#aErr');
  if (errEl) errEl.textContent = '';
  // basic client-side validation
  if (!username || !password || (!display_name && mode !== 'login')) {
    if (errEl) errEl.textContent = 'Заполни все поля';
    return;
  }
  if (mode === 'register') {
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      if (errEl) errEl.textContent = 'Неверный email';
      return;
    }
    if (username.length < 2 || username.length > 24) {
      if (errEl) errEl.textContent = 'Username 2-24 символов';
      return;
    }
    if (!/^[a-z0-9_]+$/.test(username)) {
      if (errEl) errEl.textContent = 'Только a-z, 0-9, _';
      return;
    }
    if (password.length < 8) {
      if (errEl) errEl.textContent = 'Пароль мин. 8 символов';
      return;
    }
    if (password !== password2) {
      if (errEl) errEl.textContent = 'Пароли не совпадают';
      return;
    }
  }
  try {
    if (mode === 'login') {
      const d = await api('/login', { method: 'POST', body: { username, password } }); me = d.user;
      me = await api('/me');
      csrfToken = me.csrf_token || '';
      initEvents();
      renderNav();
      go('feed');
      smokeTransition();
    } else {
      const d = await api('/register', { method: 'POST', body: { username, password, display_name, email, invite_code } });
      if (d.pending) { showVerifyStep(username); return; }
    }
  } catch (e) {
    if (errEl) errEl.textContent = e.message;
  }
}

function showVerifyStep(username) {
  pendingVerifyUsername = username;
  const h1 = document.querySelector('.auth-wrap h1');
  const form = document.querySelector('.auth-form');
  if (h1) h1.textContent = 'ПОДТВЕРДИ EMAIL';
  if (!form) return;
  form.innerHTML = `
    <p class="verify-note">Код отправлен на твой email.</p>
    <input class="input" id="vCode" placeholder="000000" maxlength="6" inputmode="numeric" autocomplete="one-time-code">
    <button class="btn btn-ic-row" data-post-action="do-verify" data-username="${esc(username)}">${iconCut('check', 'ui-icon', 15, 15)}ПОДТВЕРДИТЬ</button>
    <button class="btn-ghost btn-ic-row" data-post-action="resend-verify" data-username="${esc(username)}">${iconCut('send', 'ui-icon', 14, 14)}Отправить снова</button>
    <div id="vErr" class="msg-err"></div>
  `;
  setTimeout(() => {
    $('#vCode')?.focus();
    $('#vCode')?.addEventListener('keydown', e => { if (e.key === 'Enter') doVerify(username); });
  }, 50);
}

async function doVerify(username) {
  const token = ($('#vCode')?.value || '').trim();
  const errEl = $('#vErr');
  if (errEl) errEl.textContent = '';
  if (token.length !== 6) { if (errEl) errEl.textContent = 'Введи 6-значный код'; return; }
  try {
    await api('/verify-email', { method: 'POST', body: { username, token } });
    pendingVerifyUsername = null;
    me = await api('/me');
    csrfToken = me.csrf_token || '';
    initEvents();
    renderNav();
    go('feed');
    smokeTransition();
  } catch (e) {
    if (errEl) errEl.textContent = e.message;
  }
}

async function resendVerify(username) {
  const errEl = $('#vErr');
  if (errEl) errEl.textContent = '';
  try {
    await api('/resend-verification', { method: 'POST', body: { username } });
    if (errEl) { errEl.style.color = 'var(--green)'; errEl.textContent = 'Код отправлен заново'; }
    setTimeout(() => { if (errEl) { errEl.style.color = ''; errEl.textContent = ''; } }, 3000);
  } catch (e) {
    if (errEl) errEl.textContent = e.message;
  }
}

function showForgotStep() {
  const h1 = document.querySelector('.auth-wrap h1');
  const form = document.querySelector('.auth-form');
  if (h1) h1.textContent = 'СБРОС ПАРОЛЯ';
  if (!form) return;
  form.innerHTML = `
    <p class="verify-note">Введи email — отправим код для сброса пароля.</p>
    <input class="input" id="fEmail" type="email" placeholder="Email" autocomplete="email">
    <button class="btn btn-ic-row" data-post-action="do-forgot">${iconCut('send', 'ui-icon', 15, 15)}ОТПРАВИТЬ КОД</button>
    <button class="btn-ghost btn-ic-row" data-post-action="go-login">${iconCut('back', 'ui-icon', 14, 14)} НАЗАД</button>
    <div id="fErr" class="msg-err"></div>
  `;
  setTimeout(() => {
    $('#fEmail')?.focus();
    $('#fEmail')?.addEventListener('keydown', e => { if (e.key === 'Enter') doForgot(); });
  }, 50);
}

async function doForgot() {
  const email = ($('#fEmail')?.value || '').trim();
  const errEl = $('#fErr');
  if (errEl) errEl.textContent = '';
  if (!email) { if (errEl) errEl.textContent = 'Введи email'; return; }
  try {
    await api('/forgot-password', { method:'POST', body:{ email } });
    // Show reset code step
    showResetStep(email);
  } catch (e) { if (errEl) errEl.textContent = e.message; }
}

function showResetStep(email) {
  const h1 = document.querySelector('.auth-wrap h1');
  const form = document.querySelector('.auth-form');
  if (h1) h1.textContent = 'НОВЫЙ ПАРОЛЬ';
  if (!form) return;
  form.innerHTML = `
    <p class="verify-note">Код отправлен на твой email.</p>
    <input class="input" id="rCode" placeholder="000000" maxlength="6" inputmode="numeric" autocomplete="one-time-code">
    <input class="input" id="rPass" type="password" placeholder="Новый пароль" autocomplete="new-password">
    <button class="btn btn-ic-row" data-post-action="do-reset" data-email="${esc(email)}">${iconCut('check', 'ui-icon', 15, 15)}СМЕНИТЬ ПАРОЛЬ</button>
    <button class="btn-ghost btn-ic-row" data-post-action="do-resend-reset" data-email="${esc(email)}">${iconCut('send', 'ui-icon', 14, 14)}Выслать код ещё раз</button>
    <button class="btn-ghost btn-ic-row" data-post-action="show-forgot-step">${iconCut('back', 'ui-icon', 14, 14)} НАЗАД</button>
    <div id="rErr" class="msg-err"></div>
  `;
  setTimeout(() => {
    $('#rCode')?.focus();
    $('#rCode')?.addEventListener('keydown', e => { if (e.key === 'Enter') $('#rPass')?.focus(); });
    $('#rPass')?.addEventListener('keydown', e => { if (e.key === 'Enter') doReset(email); });
  }, 50);
}

async function doReset(email) {
  const token = ($('#rCode')?.value || '').trim();
  const password = $('#rPass')?.value || '';
  const errEl = $('#rErr');
  if (errEl) errEl.textContent = '';
  if (token.length !== 6) { if (errEl) errEl.textContent = 'Введи 6-значный код'; return; }
  if (password.length < 8) { if (errEl) errEl.textContent = 'Пароль минимум 8 символов'; return; }
  try {
    await api('/reset-password', { method:'POST', body:{ email, token, password } });
    toast.success('Пароль изменён. Войди с новым паролем.');
    go('login');
  } catch (e) { if (errEl) errEl.textContent = e.message; }
}

async function initPushState() {
  const toggle = document.getElementById('sPush');
  if (!toggle) return;
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    toggle.disabled = true;
    toggle.parentElement.title = 'Push-уведомления не поддерживаются в этом браузере';
    return;
  }
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    pushSubscription = sub;
    toggle.checked = !!sub;
  } catch {}
}

async function togglePushNotifications(enable) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
  if (enable) {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') {
      document.getElementById('sPush').checked = false;
      toast.error('Разрешение на уведомления отклонено');
      return;
    }
    try {
      const keyRes = await api('/push/vapid-public');
      const appKey = urlBase64ToUint8Array(keyRes.key);
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: appKey });
      pushSubscription = sub;
      const json = sub.toJSON();
      await api('/push/subscribe', { method:'POST', body:{ endpoint: json.endpoint, keys: json.keys } });
      toast.success('Push-уведомления включены');
    } catch (e) {
      document.getElementById('sPush').checked = false;
      toast.error('Не удалось подключить уведомления');
    }
  } else {
    try {
      if (pushSubscription) {
        const endpoint = pushSubscription.endpoint;
        await pushSubscription.unsubscribe();
        pushSubscription = null;
        await api('/push/subscribe', { method:'DELETE', body:{ endpoint } });
      }
      toast('Push-уведомления отключены');
    } catch {}
  }
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

async function exportData() {
  try {
    toast.loading('Готовим экспорт...');
    const r = await fetch('/api/export', { headers: { 'X-CSRF-Token': csrfToken } });
    if (!r.ok) { const d = await r.json(); throw new Error(d.error || 'Ошибка'); }
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `w0pium-export.json`; a.click();
    URL.revokeObjectURL(url);
    toast.success('Экспорт скачан');
  } catch (e) { toast.error(e.message); }
}

async function exportChat(cid) {
  try {
    toast.loading('Готовим TXT экспорт...');
    const r = await fetch(`/api/chats/${cid}/export`, { headers: { 'X-CSRF-Token': csrfToken } });
    if (!r.ok) { const d = await r.json(); throw new Error(d.error || 'Ошибка'); }
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `chat-${cid.slice(0,8)}.txt`; a.click();
    URL.revokeObjectURL(url);
    toast.success('TXT экспорт скачан');
  } catch (e) { toast.error(e.message); }
}

// ── MESSAGE FORMATTING ──

function formatMsg(text) {
  if (!text) return '';
  let s = esc(text);
  // Bold: **text**
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // Italic: _text_
  s = s.replace(/_([^_]+)_/g, '<em>$1</em>');
  // Code: `text`
  s = s.replace(/`([^`]+)`/g, '<code style="background:var(--bg2,#111);padding:1px 4px;border-radius:3px;font-size:0.9em">$1</code>');
  // Strikethrough: ~~text~~
  s = s.replace(/~~(.+?)~~/g, '<s>$1</s>');
  // Newlines
  s = s.replace(/\n/g, '<br>');
  return s;
}

// ── VOICE PLAYER ──

function vpFmt(s) {
  const m = Math.floor(s / 60), ss = Math.floor(s % 60);
  return `${m}:${ss.toString().padStart(2, '0')}`;
}

// Generate deterministic waveform bars from a seed string (message id)
function vpBars(seed) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = ((h << 5) - h + seed.charCodeAt(i)) | 0;
  return Array.from({ length: 28 }, (_, i) => {
    h = ((h << 5) - h + i * 137) | 0;
    const px = 3 + Math.abs(h) % 19; // 3–22 px inside 26px container
    return `<div class="vp-bar" style="height:${px}px"></div>`;
  }).join('');
}

// Legacy vp helpers kept for preview audio bar (not used by new voicePlayerHtml)
function vpInit(audio) {
  const player = audio.closest('.voice-player');
  const t = player?.querySelector('.vp-time');
  if (t && isFinite(audio.duration) && audio.duration > 0) t.textContent = vpFmt(audio.duration);
}

function vpUpdate(player, audio) {
  const pct = (audio.duration && isFinite(audio.duration)) ? audio.currentTime / audio.duration : 0;
  const bars = player.querySelectorAll('.vp-bar');
  const filled = Math.round(pct * bars.length);
  bars.forEach((b, i) => b.classList.toggle('active', i < filled));
  const t = player.querySelector('.vp-time');
  if (t) t.textContent = vpFmt(audio.currentTime);
}

function vpReset(player, audio) {
  player.querySelectorAll('.vp-bar').forEach(b => b.classList.remove('active'));
  const t = player.querySelector('.vp-time');
  if (t) t.textContent = (audio?.duration && isFinite(audio.duration)) ? vpFmt(audio.duration) : '0:00';
}

function vpSeek(el, e) {
  const player = el.closest('.voice-player');
  const audio = player.querySelector('audio');
  if (!audio.duration) return;
  const rect = el.getBoundingClientRect();
  audio.currentTime = ((e.clientX - rect.left) / rect.width) * audio.duration;
  vpUpdate(player, audio);
}

function vpPreviewToggle() {
  const audio = document.getElementById('voicePreviewAudio');
  const btn = document.getElementById('vpPreviewPlay');
  if (!audio) return;
  if (audio.paused) {
    audio.play();
    if (btn) btn.innerHTML = playPauseIconHtml(true, 16, 16);
  } else {
    audio.pause();
    if (btn) btn.innerHTML = playPauseIconHtml(false, 16, 16);
  }
}

function vpCycleSpeed(btn) {
  const player = btn.closest('.voice-player');
  const audio = player?.querySelector('audio');
  if (!audio || !btn) return;
  const speeds = [1, 1.5, 2];
  const cur = audio.playbackRate || 1;
  const next = speeds[(speeds.indexOf(cur) + 1) % speeds.length];
  audio.playbackRate = next;
  btn.textContent = next + '×';
}

function voicePlayerHtml(src, mid, fname, inChat) {
  const id = 'vp_' + String(mid).replace(/[^a-z0-9]/gi, '');
  const chatCls = inChat ? ' vp-chat' : '';
  return `<div class="voice-player${chatCls}" id="${id}">
    <button class="vp-play-btn" data-post-action="vp-toggle" data-vp-id="${id}" data-vp-src="${esc(src)}" aria-label="Play">${playPauseIconHtml(false, 14, 14)}</button>
    <canvas class="vp-wave" width="140" height="28"></canvas>
    <span class="vp-dur" id="${id}_dur">0:00</span>
    <button class="vp-speed-btn" data-post-action="vp-cycle-speed" title="Скорость">1×</button>
    <audio id="${id}_audio" src="${esc(src)}" preload="none" style="display:none" data-vp-audio-id="${id}"></audio>
  </div>`;
}

const _vpCtx = {}; // store per-player state

async function vpToggle(id, src) {
  const audio = document.getElementById(id + '_audio');
  const btn = document.querySelector(`#${id} .vp-play-btn`);
  if (!audio) return;
  if (!audio.dataset.vpBound) {
    audio.addEventListener('timeupdate', () => vpTimeUpdate(id));
    audio.addEventListener('ended', () => vpEnded(id));
    audio.dataset.vpBound = '1';
  }
  if (audio.paused) {
    // Pause all other players
    document.querySelectorAll('.voice-player audio').forEach(a => {
      if (a !== audio && !a.paused) {
        a.pause();
        const otherId = a.id.replace('_audio', '');
        const otherBtn = document.querySelector(`#${otherId} .vp-play-btn`);
        if (otherBtn) otherBtn.innerHTML = playPauseIconHtml(false, 14, 14);
        if (_vpCtx[otherId]?.anim) { cancelAnimationFrame(_vpCtx[otherId].anim); }
      }
    });
    audio.src = src;
    await audio.play().catch(() => {});
    if (btn) btn.innerHTML = playPauseIconHtml(true, 14, 14);
    vpStartWave(id, audio);
  } else {
    audio.pause();
    if (btn) btn.innerHTML = playPauseIconHtml(false, 14, 14);
    if (_vpCtx[id]?.anim) cancelAnimationFrame(_vpCtx[id].anim);
  }
}

function vpStartWave(id, audio) {
  const canvas = document.querySelector(`#${id} .vp-wave`);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  try {
    if (!_vpCtx[id]?.actx) {
      const actx = new AudioContext();
      const analyser = actx.createAnalyser();
      analyser.fftSize = 64;
      const src = actx.createMediaElementSource(audio);
      src.connect(analyser);
      analyser.connect(actx.destination);
      _vpCtx[id] = { actx, analyser };
    }
    const { analyser } = _vpCtx[id];
    const buf = new Uint8Array(analyser.frequencyBinCount);
    const draw = () => {
      _vpCtx[id].anim = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(buf);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const player = canvas.closest('.voice-player');
      let fill = '#7c3aed';
      if (player) {
        if (player.closest('.msg.me')) {
          try {
            fill = getComputedStyle(player).color || fill;
          } catch {
            fill = 'rgba(0,0,0,0.78)';
          }
        } else {
          const ac = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
          if (ac) fill = ac;
        }
      }
      ctx.fillStyle = fill;
      const bw = (canvas.width / buf.length) * 2.5;
      let x = 0;
      for (let i = 0; i < buf.length; i++) {
        const bh = (buf[i] / 255) * canvas.height;
        ctx.fillRect(x, canvas.height - bh, bw, bh);
        x += bw + 1;
      }
    };
    draw();
  } catch {}
}

function vpTimeUpdate(id) {
  const audio = document.getElementById(id + '_audio');
  const dur = document.getElementById(id + '_dur');
  if (!audio || !dur) return;
  const t = audio.currentTime;
  dur.textContent = Math.floor(t/60) + ':' + String(Math.floor(t%60)).padStart(2,'0');
}

function vpEnded(id) {
  const btn = document.querySelector(`#${id} .vp-play-btn`);
  if (btn) btn.innerHTML = playPauseIconHtml(false, 14, 14);
  if (_vpCtx[id]?.anim) { cancelAnimationFrame(_vpCtx[id].anim); }
  const canvas = document.querySelector(`#${id} .vp-wave`);
  if (canvas) canvas.getContext('2d').clearRect(0,0,canvas.width,canvas.height);
  const dur = document.getElementById(id + '_dur');
  if (dur) dur.textContent = '0:00';
}

// ── MESSAGE PINNING ──

function scrollToPinned(msgId) {
  jumpToMessage(msgId, currentChatId);
}

async function pinMessage(mid, cid) {
  try {
    await api(`/chats/${cid}/pin`, { method: 'POST', body: { msg_id: mid } });
    toast('Сообщение закреплено');
    renderChat(document.getElementById('app'), cid);
  } catch(e) { toast.error(e.message || 'Ошибка'); }
}

async function unpinMessage(cid) {
  try {
    await api(`/chats/${cid}/pin`, { method: 'DELETE' });
    toast('Откреплено');
    const bar = document.getElementById('pinnedBar');
    if (bar) bar.remove();
  } catch(e) { toast.error(e.message || 'Ошибка'); }
}

// ── MESSAGE FORWARDING ──

async function forwardMsg(mid, cid) {
  let chats = [];
  try { chats = await api('/chats'); } catch {}
  const others = chats.filter(c => c.id !== cid);
  if (!others.length) { toast('Нет других чатов'); return; }
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `<div class="modal">
    <div class="modal-head"><b>Переслать в...</b><button type="button" class="modal-icon-dismiss" data-post-action="close-modal-overlay" aria-label="Закрыть">${iconCut('close', 'ui-icon', 18, 18)}</button></div>
    <div class="modal-scroll-y">
      ${others.map(c => {
        const other = (c.members||[]).find(u => u.id !== (window.me?.id));
        const name = c.is_group ? (c.title || 'Группа') : (other?.display_name || 'Диалог');
        return `<div class="modal-list-item modal-list-item--row" data-post-action="do-forward-msg" data-mid="${mid}" data-src-cid="${cid}" data-target-cid="${c.id}">
          ${avatarEl(other?.avatar,'avatar-sm',initial(name))}
          <span>${esc(name)}</span>
        </div>`;
      }).join('')}
    </div>
  </div>`;
  document.body.appendChild(modal);
}

async function doForwardMsg(mid, srcCid, targetCid, modal) {
  modal?.remove();
  try {
    await api(`/chats/${srcCid}/messages/${mid}/forward`, { method: 'POST', body: { target_cid: targetCid } });
    toast('Переслано');
  } catch(e) { toast.error(e.message || 'Ошибка'); }
}

// ── CHAT MUTE ──

async function toggleChatMute(cid) {
  const isMuted = window._chatMutedUntil && new Date(window._chatMutedUntil) > new Date();
  if (isMuted) {
    try {
      await api(`/chats/${cid}/mute`, { method: 'PATCH', body: { hours: 0 } });
      window._chatMutedUntil = null;
      const btn = document.getElementById('chatMuteBtn');
      if (btn) btn.innerHTML = iconCut('notifications', 'ui-icon', 18, 18);
      toast('Уведомления включены');
    } catch(e) { toast.error(e.message || 'Ошибка'); }
  } else {
    const opts = [
      { label: '1 час', hours: 1 },
      { label: '8 часов', hours: 8 },
      { label: '24 часа', hours: 24 },
      { label: '1 неделя', hours: 168 },
    ];
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `<div class="modal modal--mute">
      <div class="modal-head"><b>Отключить уведомления</b></div>
      ${opts.map(o => `<div class="modal-list-item" data-post-action="do-chat-mute" data-conv-id="${cid}" data-mute-hours="${o.hours}">${esc(o.label)}</div>`).join('')}
      <div class="modal-list-item modal-list-item--muted modal-list-item--ic" data-post-action="close-modal-overlay">${iconCut('close', 'ui-icon', 14, 14)}Отмена</div>
    </div>`;
    document.body.appendChild(modal);
  }
}

async function doChatMute(cid, hours, modal) {
  modal?.remove();
  try {
    const r = await api(`/chats/${cid}/mute`, { method: 'PATCH', body: { hours } });
    window._chatMutedUntil = r.muted_until;
    const btn = document.getElementById('chatMuteBtn');
    if (btn) btn.innerHTML = iconCut('mute', 'ui-icon', 18, 18);
    toast('Уведомления отключены');
  } catch(e) { toast.error(e.message || 'Ошибка'); }
}

// ── CHAT MENTION AUTOCOMPLETE ──

async function toggleChatPin(cid) {
  const conv = window._currentChatConv;
  const pinned = !conv?.pinned_at;
  try {
    const r = await api(`/chats/${cid}/state`, { method: 'PATCH', body: { pinned } });
    if (window._currentChatConv) window._currentChatConv.pinned_at = r.pinned_at;
    toast(pinned ? 'Чат закреплен' : 'Чат откреплен');
    renderChat(document.getElementById('app'), cid);
  } catch(e) { toast.error(e.message || 'Ошибка'); }
}

async function toggleChatArchive(cid, archivedNow = false) {
  const archived = !archivedNow;
  try {
    await api(`/chats/${cid}/state`, { method: 'PATCH', body: { archived } });
    toast(archived ? 'Чат в архиве' : 'Чат возвращен');
    if (archived) go('chats');
    else renderChat(document.getElementById('app'), cid);
  } catch(e) { toast.error(e.message || 'Ошибка'); }
}

function toggleChatToolsMenu(btn) {
  const wrap = btn?.closest('.chat-tools-more');
  const menu = wrap?.querySelector('.chat-tools-menu');
  if (!menu) return;
  const willOpen = menu.classList.contains('hidden');
  document.querySelectorAll('.chat-tools-menu').forEach(el => el.classList.add('hidden'));
  menu.classList.toggle('hidden', !willOpen);
  if (willOpen) {
    const onDocClick = ev => {
      if (wrap.contains(ev.target)) return;
      menu.classList.add('hidden');
      document.removeEventListener('click', onDocClick, true);
    };
    setTimeout(() => document.addEventListener('click', onDocClick, true), 0);
  }
}

async function toggleSaveMsg(mid, cid, savedNow = false) {
  if (!mid || !cid) return;
  try {
    const saved = !savedNow;
    await api(`/chats/${cid}/messages/${mid}/save`, { method: saved ? 'POST' : 'DELETE' });
    const msg = document.querySelector(`.msg[data-id="${CSS.escape(mid)}"]`);
    if (msg) {
      msg.dataset.saved = saved ? '1' : '0';
      const btn = msg.querySelector('.msg-more-btn');
      if (btn) btn.dataset.saved = saved ? '1' : '0';
      msg.querySelector('.msg-saved-mark')?.remove();
      if (saved) {
        msg.querySelector('.msg-body')?.insertAdjacentHTML('afterbegin', `<div class="msg-saved-mark">${iconCut('bookmark-filled', 'ui-icon msg-inline-ic', 11, 11)}<span>Сохранено</span></div>`);
      }
    }
    toast(saved ? 'Сообщение сохранено' : 'Удалено из сохраненных');
  } catch(e) { toast.error(e.message || 'Ошибка'); }
}

async function openSavedMessages(cid = '') {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `<div class="modal saved-msg-modal">
    <div class="modal-head"><b>Сохраненные</b><button type="button" class="modal-icon-dismiss" data-post-action="close-modal-overlay" aria-label="Закрыть">${iconCut('close', 'ui-icon', 18, 18)}</button></div>
    <div id="savedMsgList" class="saved-msg-list"><div class="gallery-state-msg">Загрузка...</div></div>
  </div>`;
  document.body.appendChild(modal);
  const el = document.getElementById('savedMsgList');
  try {
    let rows = await api('/chats/saved');
    if (cid) rows = rows.filter(m => m.conv_id === cid);
    if (!rows.length) { el.innerHTML = '<div class="gallery-state-msg">Нет сохраненных сообщений</div>'; return; }
    el.innerHTML = rows.map(m => {
      const text = m.content || m.file_name || (m.file_type ? `[${m.file_type}]` : 'Сообщение');
      const chatName = m.is_group ? (m.title || 'Группа') : 'Диалог';
      return `<div class="saved-msg-row" data-post-action="jump-to-message" data-msg-id="${esc(m.id)}" data-conv-id="${esc(m.conv_id)}">
        <div class="saved-msg-top"><b>${esc(m.display_name || '')}</b><span>${esc(chatName)} · ${timeAgo(m.saved_at || m.created_at)}</span></div>
        <div class="saved-msg-text">${esc(text.slice(0, 180))}</div>
      </div>`;
    }).join('');
  } catch(e) {
    if (el) el.innerHTML = `<div class="gallery-state-msg">${esc(e.message || 'Ошибка')}</div>`;
  }
}

function bindChatMentionAutocomplete(textarea, members) {
  const dropdown = document.createElement('div');
  dropdown.className = 'mention-dropdown mention-dropdown--float';
  textarea.parentElement.style.position = 'relative';
  textarea.parentElement.appendChild(dropdown);

  textarea.addEventListener('input', () => {
    const val = textarea.value;
    const cursor = textarea.selectionStart;
    const before = val.slice(0, cursor);
    const atMatch = before.match(/@(\w*)$/);
    if (!atMatch) { dropdown.style.display = 'none'; return; }
    const q = atMatch[1].toLowerCase();
    const matches = members.filter(m =>
      m.username?.toLowerCase().startsWith(q) || m.display_name?.toLowerCase().startsWith(q)
    ).slice(0, 5);
    if (!matches.length) { dropdown.style.display = 'none'; return; }
    dropdown.style.display = 'block';
    dropdown.innerHTML = matches.map(m => `
      <div class="mention-item-row" data-post-action="insert-chat-mention" data-textarea-id="${textarea.id}" data-username="${esc(m.username)}">
        ${avatarEl(m.avatar,'avatar-xs',initial(m.display_name))}
        <span>${esc(m.display_name)}</span>
        <span class="mention-item-handle">@${esc(m.username)}</span>
      </div>`).join('');
  });
  textarea.addEventListener('blur', () => setTimeout(() => { dropdown.style.display = 'none'; }, 200));
}

function insertChatMention(textareaId, username) {
  const ta = document.getElementById(textareaId);
  if (!ta) return;
  const cursor = ta.selectionStart;
  const before = ta.value.slice(0, cursor);
  const after = ta.value.slice(cursor);
  const newBefore = before.replace(/@\w*$/, `@${username} `);
  ta.value = newBefore + after;
  ta.selectionStart = ta.selectionEnd = newBefore.length;
  ta.focus();
  const drop = ta.parentElement?.querySelector('.mention-dropdown');
  if (drop) drop.style.display = 'none';
}

// ── DROPS ──

function dropHtml(d) {
  const msLeft = new Date(d.created_at).getTime() + 24 * 3600 * 1000 - Date.now();
  const hoursLeft = Math.max(0, Math.ceil(msLeft / 3600000));
  const mine = me && sameId(d.user_id, me.id);
  let track = '';
  if (d.track_url) {
    const url = d.track_url.trim();
    if (/soundcloud\.com/.test(url)) {
      const encoded = encodeURIComponent(url);
      track = `<iframe class="sc-player" width="100%" height="166" scrolling="no" frameborder="no" allow="autoplay" src="https://w.soundcloud.com/player/?url=${encoded}&amp;color=%231c1c1c&amp;auto_play=false&amp;hide_related=true&amp;show_comments=false&amp;show_user=false&amp;show_reposts=false"></iframe>`;
    } else {
      track = `<div class="post-track">${iconCut('mic', 'ui-icon post-track-ic', 12, 12)} <a href="${safeUrl(url)}" target="_blank" rel="noopener">${truncUrl(url)}</a></div>`;
    }
  }
  const img = d.image ? `<div class="post-img" data-post-action="open-image" data-image="${esc(d.image)}"><img src="${esc(d.image)}" loading="lazy" alt=""></div>` : '';
  return `
    <div class="drop${d.viewed ? '' : ' drop-new'}" data-id="${d.id}">
      <div class="drop-meta">
        <span class="drop-timer">${hoursLeft}ч</span>
        <span class="drop-views">◎ ${d.view_count}</span>
        ${mine ? `<button class="btn-link" data-post-action="delete-drop" data-drop-id="${d.id}" aria-label="Удалить">${iconCut('trash', 'ui-icon', 14, 14)}</button>` : ''}
      </div>
      <div class="post-head">
        ${avatarEl(d.avatar, 'avatar', initial(d.display_name))}
        <span class="post-name" data-post-action="go-profile" data-username="${esc(d.username)}">${esc(d.display_name)}</span>
        <span class="post-handle">@${esc(d.username)}</span>
        <span class="post-time">${timeAgoEl(d.created_at)}</span>
      </div>
      ${d.content ? `<div class="post-body">${esc(d.content)}</div>` : ''}
      ${img}${track}
    </div>
  `;
}

function dropComposerHtml() {
  return `
    <div class="composer">
      <div style="position:relative">
        <textarea id="dText" placeholder="Сниппет, анонс, WIP... (исчезнет через 24ч)" rows="3"></textarea>
        <div class="mention-dropdown hidden" id="dMentionDrop"></div>
      </div>
      <div class="composer-toolbar">
        <div class="composer-tools">
          <div class="attach-wrap" id="dAttachWrap">
            <button class="composer-tool attach-btn" data-post-action="toggle-attach-menu" data-prefix="d" title="Прикрепить">${iconCut('attach', 'ui-icon', 17, 17)}</button>
            <div class="attach-menu hidden" id="dAttachMenu">
              <label class="attach-opt" for="dImg" data-post-action="close-attach-menu" data-prefix="d">UP фото</label>
              <button class="attach-opt" data-post-action="select-track" data-prefix="d">SC soundcloud</button>
            </div>
          </div>
          <input type="file" id="dImg" accept="image/*,.heic,.heif" style="display:none">
        </div>
        <div class="composer-submit">
          <input type="text" id="dTrack" placeholder="soundcloud.com/..." class="track-input hidden">
          <button class="btn btn-sm btn-ic-row" data-post-action="submit-drop">${iconCut('upload', 'ui-icon', 14, 14)}ДРОП</button>
        </div>
      </div>
      <div id="dImgName" style="font-size:0.6rem;color:var(--fg3);margin-top:0.3rem"></div>
    </div>
  `;
}

function bindDropImg() {
  const inp = $('#dImg');
  if (!inp) return;
  inp.addEventListener('change', () => {
    const labelEl = $('#dImgName');
    if (labelEl) labelEl.textContent = inp.files[0] ? inp.files[0].name : '';
  });
}

async function submitDrop() {
  const text = ($('#dText')?.value || '').trim();
  const track = ($('#dTrack')?.value || '').trim();
  const imgFile = $('#dImg')?.files?.[0];
  if (!text && !track && !imgFile) return;
  const fd = new FormData();
  if (text) fd.append('content', text);
  if (track) fd.append('track_url', track);
  if (imgFile) fd.append('image', await compressImage(await maybeConvertHeic(imgFile)));
  try {
    await api('/drops', { method: 'POST', body: fd });
    if ($('#dText')) $('#dText').value = '';
    if ($('#dTrack')) $('#dTrack').value = '';
    if ($('#dImgName')) $('#dImgName').textContent = '';
    go('drops');
  } catch (e) { toast.error(e.message || 'Ошибка при создании дропа'); }
}

async function delDrop(id) {
  try {
    await api(`/drops/${id}`, { method: 'DELETE' });
    const el = document.querySelector(`.drop[data-id="${id}"]`);
    if (el) el.remove();
  } catch {}
}

async function renderDrops(app) {
  if (!me) return go('login');
  try {
    const drops = await api('/drops');
    drops.filter(d => !d.viewed).forEach(d =>
      api(`/drops/${d.id}/view`, { method: 'POST' }).catch(() => {})
    );
    app.innerHTML = `
      ${opiumCommandStrip('drops')}
      ${pageTitleIc('media', 'DROPS')}
      ${dropComposerHtml()}
      <div id="dropList">${drops.length ? drops.map(dropHtml).join('') :
        '<div class="empty">Нет дропов. Брось что-нибудь.</div>'}</div>
    `;
    bindDropImg();
    bindMentionAutocomplete('dText', 'dMentionDrop');
  } catch (e) { app.innerHTML = `<div class="empty">${e.message}</div>`; }
}

// ── DISK ──

function fmtBytes(b) {
  if (b >= 1073741824) return (b / 1073741824).toFixed(1) + ' GB';
  if (b >= 1048576) return (b / 1048576).toFixed(1) + ' MB';
  if (b >= 1024) return Math.round(b / 1024) + ' KB';
  return b + ' B';
}

// ── DISK STATE ──
let diskView = localStorage.getItem('diskView') || 'grid';
let diskSort = localStorage.getItem('diskSort') || 'date';
let diskSortDir = localStorage.getItem('diskSortDir') || 'desc';
let diskActiveFilter = 'all';
let diskSearch = '';
let diskAllFiles = [];
let diskFolders = [];
let diskCurrentFolder = null;
let diskFolderPath = [];
let _diskFiltered = [];
let diskSelectedIds = new Set();
let diskSelectMode = false;
let diskPreviewIdx = -1;
let _diskDragId = null;
let _diskWfPeaks = null;
let _diskPlayerGen = 0;
let _diskPlayerRaf = null;

function diskFileType(mime, name) {
  const m = (mime || '').toLowerCase();
  const ext = ((name || '').split('.').pop() || '').toLowerCase();
  if (m.startsWith('image/') || ['jpg','jpeg','png','gif','webp','svg'].includes(ext)) return 'image';
  if (m.startsWith('audio/') || ['mp3','wav','flac','aac','ogg','m4a','opus'].includes(ext)) return 'audio';
  if (m.startsWith('video/') || ['mp4','mov','webm','mkv','avi'].includes(ext)) return 'video';
  if (['txt','md','json','js','html','css','xml','csv','ts','py','sh'].includes(ext) || m.startsWith('text/')) return 'text';
  return 'other';
}

function diskThumbHtml(f) {
  const type = diskFileType(f.mime, f.name);
  if (type === 'image') return `<img class="disk-thumb-img" src="${esc(f.path)}" loading="lazy" alt="">`;
  if (type === 'audio') return `<div class="disk-thumb-icon audio">${iconCut('mic', 'ui-icon', 22, 22)}</div>`;
  if (type === 'video') return `<div class="disk-thumb-icon video">${iconCut('play', 'ui-icon', 22, 22)}</div>`;
  if (type === 'text') return `<div class="disk-thumb-icon text">${iconCut('comment', 'ui-icon', 22, 22)}</div>`;
  const ext = (f.name || '').split('.').pop().toUpperCase().slice(0, 4);
  return `<div class="disk-thumb-icon file">${iconCut('file', 'ui-icon', 20, 20)}${ext ? `<span class="disk-thumb-ext">${esc(ext)}</span>` : ''}</div>`;
}

function diskFolderCardHtml(folder) {
  return `<div class="disk-card disk-folder" id="dfolder-${esc(folder.id)}"
    data-post-action="disk-load-folder" data-folder-id="${esc(folder.id)}"
    data-post-action-dragover="disk-folder-dragover"
    data-post-action-dragleave="disk-folder-dragleave"
    data-post-action-drop="disk-folder-drop"
    data-folder-drop-id="${esc(folder.id)}">
    <button class="disk-card-del" data-post-action="disk-delete-folder" data-folder-id="${esc(folder.id)}" title="Удалить">${iconCut('trash', 'ui-icon', 15, 15)}</button>
    <div class="disk-card-thumb"><div class="disk-thumb-icon folder">${iconCut('disk', 'ui-icon', 24, 24)}</div></div>
    <div class="disk-card-info">
      <div class="disk-card-name" title="${esc(folder.name)}">${esc(folder.name)}</div>
      <div class="disk-card-size">${folder.item_count} эл.</div>
    </div>
  </div>`;
}

function diskFolderRowHtml(folder) {
  return `<div class="disk-row disk-folder-row" id="dfolder-${esc(folder.id)}"
    data-post-action="disk-load-folder" data-folder-id="${esc(folder.id)}"
    data-post-action-dragover="disk-folder-dragover"
    data-post-action-dragleave="disk-folder-dragleave"
    data-post-action-drop="disk-folder-drop"
    data-folder-drop-id="${esc(folder.id)}">
    <span class="disk-row-icon">${iconCut('disk', 'ui-icon', 22, 22)}</span>
    <div class="disk-row-info"><div class="disk-row-name">${esc(folder.name)}</div></div>
    <div class="disk-row-size">${folder.item_count} эл.</div>
    <div class="disk-row-date">${timeAgo(folder.created_at)}</div>
    <button class="disk-row-del" data-post-action="disk-delete-folder" data-folder-id="${esc(folder.id)}" title="Удалить">${iconCut('trash', 'ui-icon', 15, 15)}</button>
  </div>`;
}

function diskCardHtml(f) {
  const canDelete = me && (f.username === me.username || me.is_admin);
  const type = diskFileType(f.mime, f.name);
  const sel = diskSelectMode && diskSelectedIds.has(f.id);
  return `<div class="disk-card disk-type-${type}${sel?' selected':''}" id="dfile-${esc(f.id)}"
    draggable="${!diskSelectMode}"
    data-post-action="disk-item-click" data-file-id="${esc(f.id)}"
    data-post-action-dragstart="disk-drag-start"
    data-post-action-dragend="disk-drag-end"
    data-drag-file-id="${esc(f.id)}">
    ${diskSelectMode
      ? `<div class="disk-card-check${sel?' checked':''}"></div>`
      : (canDelete ? `<button class="disk-card-del" data-post-action="disk-delete-file" data-file-id="${esc(f.id)}" title="Удалить">${iconCut('trash', 'ui-icon', 15, 15)}</button>` : '')}
    <div class="disk-card-thumb">${diskThumbHtml(f)}</div>
    <div class="disk-card-info">
      <div class="disk-card-name" title="${esc(f.name)}">${esc(f.name)}</div>
      <div class="disk-card-size">${fmtBytes(f.size)}</div>
    </div>
  </div>`;
}

function diskRowHtml(f) {
  const canDelete = me && (f.username === me.username || me.is_admin);
  const type = diskFileType(f.mime, f.name);
  const rowIcons = { image: 'gallery', audio: 'mic', video: 'play', text: 'comment', other: 'file' };
  const sel = diskSelectMode && diskSelectedIds.has(f.id);
  return `<div class="disk-row${sel?' selected':''}" id="dfile-${esc(f.id)}"
    draggable="${!diskSelectMode}"
    data-post-action="disk-item-click" data-file-id="${esc(f.id)}"
    data-post-action-dragstart="disk-drag-start"
    data-post-action-dragend="disk-drag-end"
    data-drag-file-id="${esc(f.id)}">
    ${diskSelectMode
      ? `<div class="disk-row-check${sel?' checked':''}"></div>`
      : `<span class="disk-row-icon">${iconCut(rowIcons[type] || 'file', 'ui-icon', 22, 22)}</span>`}
    <div class="disk-row-info">
      <div class="disk-row-name">${esc(f.name)}</div>
      ${f.description ? `<div class="disk-row-desc">${esc(f.description)}</div>` : ''}
    </div>
    <div class="disk-row-size">${fmtBytes(f.size)}</div>
    <div class="disk-row-date">${timeAgo(f.created_at)}</div>
    ${!diskSelectMode && canDelete ? `<button class="disk-row-del" data-post-action="disk-delete-file" data-file-id="${esc(f.id)}" title="Удалить">${iconCut('trash', 'ui-icon', 15, 15)}</button>` : ''}
  </div>`;
}

function diskGetFiltered() {
  let files = diskAllFiles.filter(f => {
    if (diskActiveFilter !== 'all' && diskFileType(f.mime, f.name) !== diskActiveFilter) return false;
    if (diskSearch && !f.name.toLowerCase().includes(diskSearch.toLowerCase())) return false;
    return true;
  });
  files.sort((a, b) => {
    if (diskSort === 'name') {
      const r = a.name.toLowerCase().localeCompare(b.name.toLowerCase());
      return diskSortDir === 'asc' ? r : -r;
    }
    if (diskSort === 'size') return diskSortDir === 'asc' ? a.size - b.size : b.size - a.size;
    return diskSortDir === 'asc' ? (a.created_at < b.created_at ? -1 : 1) : (a.created_at > b.created_at ? -1 : 1);
  });
  return files;
}

function renderDiskBreadcrumb() {
  const el = document.getElementById('diskBreadcrumb');
  if (!el) return;
  const parts = [`<span class="disk-bc-item${!diskCurrentFolder?' active':''}" data-post-action="disk-load-root">Диск</span>`];
  diskFolderPath.forEach((f, i) => {
    parts.push(`<span class="disk-bc-sep">/</span>`);
    parts.push(`<span class="disk-bc-item${i===diskFolderPath.length-1?' active':''}" data-post-action="disk-load-folder" data-folder-id="${esc(f.id)}">${esc(f.name)}</span>`);
  });
  el.innerHTML = parts.join('');
}

function renderDiskFiles() {
  const wrap = document.getElementById('diskGrid');
  if (!wrap) return;
  _diskFiltered = diskGetFiltered();
  const total = diskFolders.length + _diskFiltered.length;
  if (!total) {
    wrap.className = '';
    const msg = diskSearch
      ? `Ничего не найдено по "${esc(diskSearch)}"`
      : diskActiveFilter !== 'all' ? 'Нет файлов этого типа.' : 'Пусто. Загрузи файлы или создай папку.';
    wrap.innerHTML = `<div class="empty">${msg}</div>`;
    updateDiskBulkBar();
    return;
  }
  wrap.className = diskView === 'grid' ? 'disk-cards' : 'disk-rows';
  const folderHtml = diskFolders.map(diskView === 'grid' ? diskFolderCardHtml : diskFolderRowHtml).join('');
  const fileHtml = _diskFiltered.map(diskView === 'grid' ? diskCardHtml : diskRowHtml).join('');
  wrap.innerHTML = folderHtml + fileHtml;
  updateDiskBulkBar();
}

function setDiskView(v) {
  diskView = v;
  localStorage.setItem('diskView', v);
  document.getElementById('diskBtnGrid')?.classList.toggle('active', v === 'grid');
  document.getElementById('diskBtnList')?.classList.toggle('active', v === 'list');
  renderDiskFiles();
}

function setDiskFilter(f) {
  diskActiveFilter = f;
  document.querySelectorAll('.disk-filter-tab').forEach(el =>
    el.classList.toggle('active', el.dataset.filter === f)
  );
  renderDiskFiles();
}

function setDiskSort(field) {
  if (diskSort === field) diskSortDir = diskSortDir === 'desc' ? 'asc' : 'desc';
  else { diskSort = field; diskSortDir = field === 'name' ? 'asc' : 'desc'; }
  localStorage.setItem('diskSort', diskSort);
  localStorage.setItem('diskSortDir', diskSortDir);
  updateDiskSortUI();
  renderDiskFiles();
}

function updateDiskSortUI() {
  const arrHtml = diskSortDir === 'asc'
    ? iconCut('upload', 'ui-icon disk-sort-ic', 9, 9)
    : iconCut('download', 'ui-icon disk-sort-ic', 9, 9);
  document.querySelectorAll('.disk-sort-btn').forEach(btn => {
    const f = btn.dataset.sort;
    const labels = { date: 'Дата', name: 'Имя', size: 'Размер' };
    btn.classList.toggle('active', diskSort === f);
    const arr = diskSort === f ? ` <span class="disk-sort-arr">${arrHtml}</span>` : '';
    btn.innerHTML = `${labels[f]}${arr}`;
  });
}

function setDiskSearch(v) {
  diskSearch = v;
  renderDiskFiles();
}

// ── DISK FOLDER CREATE ──

async function diskCreateFolderPrompt() {
  const name = prompt('Название папки:');
  if (!name || !name.trim()) return;
  try {
    await api('/disk/folders', { method: 'POST', body: { name: name.trim(), parent_id: diskCurrentFolder || null } });
    const folders = await api(`/disk/folders${diskCurrentFolder ? '?parent_id=' + diskCurrentFolder : ''}`);
    diskFolders = folders;
    renderDiskFiles();
    toast.success('Папка создана');
  } catch (e) { toast.error(e.message); }
}

// ── DISK DRAG TO FOLDER ──

function diskDragStart(id, e) {
  _diskDragId = id;
  e.dataTransfer.effectAllowed = 'move';
  e.currentTarget.classList.add('dragging-file');
}

async function diskFileDrop(folderId, e) {
  e.preventDefault();
  e.stopPropagation();
  e.currentTarget.classList.remove('drag-target');
  const fileId = _diskDragId;
  _diskDragId = null;
  if (!fileId) return;
  try {
    await api(`/disk/${fileId}`, { method: 'PATCH', body: { folder_id: folderId } });
    diskAllFiles = diskAllFiles.filter(f => f.id !== fileId);
    _diskFiltered = diskGetFiltered();
    renderDiskFiles();
    loadDiskStats();
    toast.success('Перемещено');
  } catch (err) { toast.error(err.message); }
}

// ── DISK PUBLIC LINKS ──

async function toggleDiskPublicLink(id) {
  const f = diskAllFiles.find(x => x.id === id);
  if (!f) return;
  if (f.public_token) {
    if (!confirm('Закрыть публичный доступ к этому файлу?')) return;
    try {
      await api(`/disk/${id}/publish`, { method: 'DELETE' });
      f.public_token = null;
      _renderDiskPreview(_diskFiltered[diskPreviewIdx]);
      toast.success('Публичный доступ закрыт');
    } catch (e) { toast.error(e.message); }
  } else {
    try {
      const r = await api(`/disk/${id}/publish`, { method: 'POST' });
      f.public_token = r.token;
      _renderDiskPreview(_diskFiltered[diskPreviewIdx]);
      const url = `${location.origin}/pub/${r.token}`;
      await navigator.clipboard.writeText(url).catch(() => {});
      toast.success('Публичная ссылка скопирована');
    } catch (e) { toast.error(e.message); }
  }
}

// ── DISK FOLDERS ──

async function loadDiskFolder(folderId) {
  diskCurrentFolder = folderId;
  diskSelectedIds.clear();
  diskSelectMode = false;
  document.getElementById('diskSelectBtn')?.classList.remove('active');
  if (folderId) {
    try { diskFolderPath = await api(`/disk/breadcrumb/${folderId}`); }
    catch { diskFolderPath = []; }
  } else {
    diskFolderPath = [];
  }
  renderDiskBreadcrumb();
  await loadDiskFiles();
}

async function createDiskFolder() {
  const name = prompt('Имя новой папки:');
  if (!name?.trim()) return;
  try {
    const folder = await api('/disk/folders', { method: 'POST', body: { name: name.trim(), parent_id: diskCurrentFolder } });
    diskFolders.push(folder);
    diskFolders.sort((a, b) => a.name.localeCompare(b.name));
    renderDiskFiles();
    toast.success('Папка создана');
  } catch (e) { toast.error(e.message); }
}

async function deleteDiskFolder(id) {
  const folder = diskFolders.find(f => f.id === id);
  if (!folder) return;
  if (!confirm(`Удалить папку "${folder.name}" и всё её содержимое?`)) return;
  try {
    await api(`/disk/folders/${id}`, { method: 'DELETE' });
    diskFolders = diskFolders.filter(f => f.id !== id);
    renderDiskFiles();
    loadDiskStats();
    toast.success('Папка удалена');
  } catch (e) { toast.error(e.message); }
}

// ── DISK SELECT ──

function diskItemClick(id) {
  if (diskSelectMode) toggleDiskSelect(id);
  else openDiskPreview(id);
}

function toggleDiskSelectMode() {
  diskSelectMode = !diskSelectMode;
  diskSelectedIds.clear();
  document.getElementById('diskSelectBtn')?.classList.toggle('active', diskSelectMode);
  renderDiskFiles();
  updateDiskBulkBar();
}

function toggleDiskSelect(id) {
  if (diskSelectedIds.has(id)) diskSelectedIds.delete(id);
  else diskSelectedIds.add(id);
  const card = document.getElementById(`dfile-${id}`);
  if (card) {
    card.classList.toggle('selected', diskSelectedIds.has(id));
    card.querySelector('.disk-card-check, .disk-row-check')?.classList.toggle('checked', diskSelectedIds.has(id));
  }
  updateDiskBulkBar();
}

function updateDiskBulkBar() {
  const bar = document.getElementById('diskBulkBar');
  if (!bar) return;
  const n = diskSelectedIds.size;
  bar.classList.toggle('hidden', !diskSelectMode || n === 0);
  const span = bar.querySelector('.bulk-count');
  if (span) span.textContent = `Выбрано ${n} файл${n===1?'':n<5?'а':'ов'}`;
}

async function bulkDeleteDisk() {
  const ids = [...diskSelectedIds];
  if (!ids.length) return;
  if (!confirm(`Удалить ${ids.length} файл${ids.length===1?'':ids.length<5?'а':'ов'}?`)) return;
  let failed = 0;
  for (const id of ids) {
    try {
      await api(`/disk/${id}`, { method: 'DELETE' });
      diskAllFiles = diskAllFiles.filter(f => f.id !== id);
    } catch { failed++; }
  }
  diskSelectedIds.clear();
  _diskFiltered = diskGetFiltered();
  failed ? toast.error(`${failed} не удалось удалить`) : toast.success('Удалено');
  renderDiskFiles();
  loadDiskStats();
}

async function downloadDiskZip() {
  const ids = [...diskSelectedIds];
  if (!ids.length) return toast.error('Нет выбранных файлов');
  const t = toast.loading('Подготовка ZIP…');
  try {
    const resp = await fetch('/api/disk/zip', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
      credentials: 'include',
      body: JSON.stringify({ ids })
    });
    if (!resp.ok) throw new Error('Ошибка');
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'w0pium-files.zip'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    toast.dismiss(t);
  } catch (e) { toast.dismiss(t); toast.error(e.message); }
}

// ── DISK PREVIEW ──

function _diskKeyHandler(e) {
  const overlay = document.getElementById('diskOverlay');
  if (!overlay || overlay.classList.contains('hidden')) return;
  if (e.key === 'Escape') { closeDiskPreview(); return; }
  if (e.key === 'ArrowLeft') diskNavPreview(-1);
  if (e.key === 'ArrowRight') diskNavPreview(1);
}

function diskNavPreview(dir) {
  if (!_diskFiltered.length) return;
  diskPreviewIdx = (diskPreviewIdx + dir + _diskFiltered.length) % _diskFiltered.length;
  _renderDiskPreview(_diskFiltered[diskPreviewIdx]);
}

function openDiskPreview(id) {
  const idx = _diskFiltered.findIndex(f => f.id === id);
  diskPreviewIdx = idx >= 0 ? idx : 0;
  const overlay = document.getElementById('diskOverlay');
  if (!overlay) return;
  overlay.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  _renderDiskPreview(_diskFiltered[diskPreviewIdx]);
  document.addEventListener('keydown', _diskKeyHandler);
  // Mobile swipe
  let _sx = 0, _sy = 0;
  overlay._touchStart = e => { _sx = e.touches[0].clientX; _sy = e.touches[0].clientY; };
  overlay._touchEnd = e => {
    const dx = e.changedTouches[0].clientX - _sx;
    const dy = e.changedTouches[0].clientY - _sy;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) diskNavPreview(dx < 0 ? 1 : -1);
  };
  overlay.addEventListener('touchstart', overlay._touchStart, { passive: true });
  overlay.addEventListener('touchend', overlay._touchEnd, { passive: true });
}

function _renderDiskPreview(f) {
  if (!f) return;
  const content = document.getElementById('diskPreviewContent');
  const meta = document.getElementById('diskPreviewMeta');
  if (!content || !meta) return;
  document.getElementById('diskOverlay')?.querySelectorAll('audio,video').forEach(m => { m.pause(); m.src = ''; });

  const type = diskFileType(f.mime, f.name);
  let mediaHtml = '';
  let postRender = null;

  if (type === 'image') {
    mediaHtml = `<img class="disk-preview-img" id="diskPreviewImg" src="${esc(f.path)}" alt="${esc(f.name)}">`;
    postRender = () => {
      setupDiskImgZoom();
      const img = document.getElementById('diskPreviewImg');
      if (img) {
        const upd = () => {
          const inf = document.querySelector('#diskPreviewMeta .disk-preview-info');
          if (inf && img.naturalWidth) inf.textContent += ` · ${img.naturalWidth}×${img.naturalHeight}`;
        };
        img.complete ? upd() : (img.onload = upd);
      }
    };
  } else if (type === 'audio') {
    const wfId = 'diskWaveform_' + f.id.slice(0, 8);
    mediaHtml = `<div class="disk-preview-audio-wrap">
      <div class="disk-preview-audio-icon">${iconCut('mic', 'ui-icon', 24, 24)}</div>
      <canvas id="${wfId}" class="disk-waveform disk-waveform-seek" width="600" height="80"></canvas>
      <audio id="diskPlayerAudio" src="${esc(f.path)}" preload="auto"></audio>
      <div class="disk-player-controls">
        <button class="disk-player-btn" id="diskPlayerPlay" data-post-action="disk-play-pause" title="Воспроизвести">
          <span id="diskPlayerPlayIcon">${playPauseIconHtml(false, 14, 14)}</span>
        </button>
        <span class="disk-player-time" id="diskPlayerCur">0:00</span>
        <div class="disk-player-seek" id="diskPlayerSeekBar" data-post-action="disk-seek-bar">
          <div class="disk-player-seek-fill" id="diskPlayerFill"></div>
          <div class="disk-player-seek-thumb" id="diskPlayerThumb"></div>
        </div>
        <span class="disk-player-time" id="diskPlayerDur">–:––</span>
        <div class="disk-player-vol-wrap">
          <button class="disk-player-vol-btn" id="diskPlayerVol" data-post-action="disk-toggle-mute" title="Звук">
            <span id="diskPlayerVolIcon">${iconCut('notifications', 'ui-icon', 15, 15)}</span>
          </button>
          <input class="disk-player-vol-slider" id="diskPlayerVolSlider" type="range" min="0" max="1" step="0.02" value="1" data-post-action="disk-set-volume" title="Громкость">
        </div>
      </div>
    </div>`;
    postRender = () => initDiskPlayer(f.path, wfId, f.size);
  } else if (type === 'video') {
    mediaHtml = `<video class="disk-preview-video" controls autoplay src="${esc(f.path)}" preload="auto"></video>`;
  } else if (type === 'text') {
    mediaHtml = `<div class="disk-preview-text-loading">Загрузка…</div>`;
    postRender = async () => {
      try {
        const resp = await fetch(f.path, { credentials: 'include' });
        const text = await resp.text();
        if (content) content.innerHTML = `<pre class="disk-preview-text">${esc(text.slice(0, 50000))}</pre>`;
      } catch { if (content) content.innerHTML = `<div class="disk-preview-fallback"><div>Не удалось загрузить</div></div>`; }
    };
  } else if ((f.mime || '').includes('pdf')) {
    mediaHtml = `<iframe class="disk-preview-pdf" src="${esc(f.path)}"></iframe>`;
  } else {
    mediaHtml = `<div class="disk-preview-fallback"><div class="disk-preview-fallback-ic">${iconCut('file', 'ui-icon', 40, 40)}</div><div>Предпросмотр недоступен</div></div>`;
  }

  content.innerHTML = mediaHtml;

  const canEdit = me && (f.username === me.username || me.is_admin);
  const pos = _diskFiltered.length > 1 ? `<span class="preview-pos">${diskPreviewIdx + 1} / ${_diskFiltered.length}</span>` : '';
  meta.innerHTML = `
    <div class="disk-preview-name-row">
      <span class="disk-preview-name">${esc(f.name)}</span>
      ${pos}
      ${canEdit ? `<button class="disk-preview-edit-btn" data-post-action="disk-open-edit" data-file-id="${esc(f.id)}" title="Переименовать">${iconCut('edit', 'ui-icon', 16, 16)}</button>` : ''}
    </div>
    ${f.description ? `<div class="disk-preview-desc">${esc(f.description)}</div>` : ''}
    <div class="disk-preview-info">${fmtBytes(f.size)} · ${timeAgo(f.created_at)}</div>
    ${f.public_token ? `<div class="disk-public-row">
      <span class="disk-public-label">Публичная:</span>
      <input class="disk-public-input" readonly value="${esc(location.origin+'/pub/'+f.public_token)}" data-post-action="disk-copy-public-link">
    </div>` : ''}
    <div class="disk-preview-actions">
      <a class="btn btn-sm btn-ic-row" href="${esc(f.path)}" download="${esc(f.name)}">${iconCut('download', 'ui-icon', 14, 14)}Скачать</a>
      ${canEdit ? `<button class="btn btn-sm btn-ic-row" data-post-action="disk-toggle-public-link" data-file-id="${esc(f.id)}">${f.public_token ? `${iconCut('lock', 'ui-icon', 13, 13)}Закрыть` : `${iconCut('share', 'ui-icon', 13, 13)}Открыть доступ`}</button>` : ''}
      ${canEdit ? `<button class="btn btn-sm btn-danger" data-post-action="disk-delete-file-preview" data-file-id="${esc(f.id)}">${iconCut('trash', 'ui-icon', 15, 15)} Удалить</button>` : ''}
    </div>`;

  if (postRender) setTimeout(postRender, 20);
}

function setupDiskImgZoom() {
  const img = document.getElementById('diskPreviewImg');
  if (!img) return;
  let zoom = 1;
  img.style.cursor = 'zoom-in';
  img.style.transformOrigin = 'center center';
  img.style.transition = 'transform .1s';

  img.addEventListener('wheel', e => {
    e.preventDefault();
    zoom = Math.max(1, Math.min(6, zoom + (e.deltaY < 0 ? 0.3 : -0.3)));
    img.style.transform = zoom > 1 ? `scale(${zoom})` : '';
    img.style.cursor = zoom > 1 ? 'move' : 'zoom-in';
  }, { passive: false });

  img.addEventListener('dblclick', () => {
    zoom = zoom > 1 ? 1 : 2.5;
    img.style.transform = zoom > 1 ? `scale(${zoom})` : '';
    img.style.cursor = zoom > 1 ? 'move' : 'zoom-in';
  });

  let lastDist = 0;
  img.addEventListener('touchstart', e => {
    if (e.touches.length === 2)
      lastDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
  }, { passive: true });
  img.addEventListener('touchmove', e => {
    if (e.touches.length !== 2) return;
    e.preventDefault();
    const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
    zoom = Math.max(1, Math.min(6, zoom * (d / lastDist)));
    lastDist = d;
    img.style.transform = zoom > 1 ? `scale(${zoom})` : '';
  }, { passive: false });
}

function _diskFmtTime(s) {
  if (!isFinite(s) || s < 0) return '0:00';
  const m = Math.floor(s / 60), ss = Math.floor(s % 60);
  return `${m}:${ss.toString().padStart(2, '0')}`;
}

function _diskDrawWf(canvas, peaks, progress) {
  if (!canvas || !peaks) return;
  const ctx = canvas.getContext('2d');
  const style = getComputedStyle(document.documentElement);
  const accent = style.getPropertyValue('--accent').trim() || '#8b5cf6';
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  const splitX = Math.round(w * Math.max(0, Math.min(1, progress)));
  for (let i = 0; i < peaks.length; i++) {
    const x = Math.round(i * w / peaks.length);
    const barH = Math.max(2, peaks[i] * h * 0.9);
    ctx.fillStyle = x < splitX ? accent : 'rgba(255,255,255,0.18)';
    ctx.fillRect(x, (h - barH) / 2, Math.max(1, Math.round(w / peaks.length) - 1), barH);
  }
}

function _diskPlayerTick() {
  const audio = document.getElementById('diskPlayerAudio');
  const canvas = document.getElementById('diskWaveform_' + (audio && audio._wfId || ''));
  if (!audio) return;
  const progress = audio.duration ? audio.currentTime / audio.duration : 0;
  const fill = document.getElementById('diskPlayerFill');
  const thumb = document.getElementById('diskPlayerThumb');
  const cur = document.getElementById('diskPlayerCur');
  if (fill) fill.style.width = (progress * 100) + '%';
  if (thumb) thumb.style.left = (progress * 100) + '%';
  if (cur) cur.textContent = _diskFmtTime(audio.currentTime);
  if (_diskWfPeaks) _diskDrawWf(canvas, _diskWfPeaks, progress);
  if (!audio.paused) _diskPlayerRaf = requestAnimationFrame(_diskPlayerTick);
}

async function initDiskPlayer(audioPath, wfId, fileSize) {
  _diskWfPeaks = null;
  _diskPlayerGen++;
  const gen = _diskPlayerGen;
  if (_diskPlayerRaf) { cancelAnimationFrame(_diskPlayerRaf); _diskPlayerRaf = null; }

  const audio = document.getElementById('diskPlayerAudio');
  const canvas = document.getElementById(wfId);
  if (!audio || !canvas) return;
  audio._wfId = wfId.replace('diskWaveform_', '');

  // Wire canvas click → seek
  canvas.onclick = e => {
    const rect = canvas.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    if (audio.duration) { audio.currentTime = ratio * audio.duration; _diskPlayerTick(); }
  };

  // Wire audio events
  audio.addEventListener('loadedmetadata', () => {
    const dur = document.getElementById('diskPlayerDur');
    if (dur) dur.textContent = _diskFmtTime(audio.duration);
  });
  audio.addEventListener('play', () => {
    const icon = document.getElementById('diskPlayerPlayIcon');
    if (icon) icon.innerHTML = playPauseIconHtml(true, 14, 14);
    _diskPlayerRaf = requestAnimationFrame(_diskPlayerTick);
  });
  audio.addEventListener('pause', () => {
    const icon = document.getElementById('diskPlayerPlayIcon');
    if (icon) icon.innerHTML = playPauseIconHtml(false, 14, 14);
  });
  audio.addEventListener('ended', () => {
    const icon = document.getElementById('diskPlayerPlayIcon');
    if (icon) icon.innerHTML = playPauseIconHtml(false, 14, 14);
    _diskPlayerTick();
  });

  // Draw placeholder waveform (flat line) while loading
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fillRect(0, canvas.height / 2 - 1, canvas.width, 2);

  // Autoplay
  audio.play().catch(() => {});

  // Load waveform if file is small enough
  if (fileSize > 30 * 1024 * 1024) return;
  try {
    const resp = await fetch(audioPath, { credentials: 'include' });
    const buf = await resp.arrayBuffer();
    if (gen !== _diskPlayerGen) return;
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const decoded = await audioCtx.decodeAudioData(buf);
    audioCtx.close();
    if (gen !== _diskPlayerGen) return;
    const data = decoded.getChannelData(0);
    const BAR_COUNT = canvas.width;
    const step = Math.ceil(data.length / BAR_COUNT);
    const peaks = new Float32Array(BAR_COUNT);
    for (let i = 0; i < BAR_COUNT; i++) {
      let max = 0;
      for (let j = i * step; j < (i + 1) * step && j < data.length; j++) {
        if (Math.abs(data[j]) > max) max = Math.abs(data[j]);
      }
      peaks[i] = max;
    }
    if (gen !== _diskPlayerGen) return;
    _diskWfPeaks = peaks;
    const audioEl = document.getElementById('diskPlayerAudio');
    const progress = audioEl && audioEl.duration ? audioEl.currentTime / audioEl.duration : 0;
    _diskDrawWf(canvas, peaks, progress);
  } catch { /* waveform failed silently */ }
}

function diskPlayPause() {
  const audio = document.getElementById('diskPlayerAudio');
  if (!audio) return;
  if (audio.paused) audio.play().catch(() => {});
  else audio.pause();
}

function diskSeekBar(e) {
  const audio = document.getElementById('diskPlayerAudio');
  const bar = document.getElementById('diskPlayerSeekBar');
  if (!audio || !bar || !audio.duration) return;
  const rect = bar.getBoundingClientRect();
  const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  audio.currentTime = ratio * audio.duration;
  _diskPlayerTick();
}

function diskToggleMute() {
  const audio = document.getElementById('diskPlayerAudio');
  const icon = document.getElementById('diskPlayerVolIcon');
  const slider = document.getElementById('diskPlayerVolSlider');
  if (!audio) return;
  audio.muted = !audio.muted;
  if (icon) icon.innerHTML = audio.muted ? iconCut('mute', 'ui-icon', 15, 15) : iconCut('notifications', 'ui-icon', 15, 15);
  if (slider) slider.value = audio.muted ? 0 : audio.volume;
}

function diskSetVolume(val) {
  const audio = document.getElementById('diskPlayerAudio');
  const icon = document.getElementById('diskPlayerVolIcon');
  if (!audio) return;
  audio.volume = val;
  audio.muted = val == 0;
  if (icon) {
    if (val == 0) icon.innerHTML = iconCut('mute', 'ui-icon', 15, 15);
    else icon.innerHTML = iconCut('notifications', 'ui-icon', 15, 15);
  }
}

function closeDiskPreview(e) {
  if (e && e.target !== e.currentTarget) return;
  const overlay = document.getElementById('diskOverlay');
  if (!overlay) return;
  overlay.querySelectorAll('audio,video').forEach(m => { m.pause(); m.src = ''; });
  overlay.classList.add('hidden');
  document.body.style.overflow = '';
  document.removeEventListener('keydown', _diskKeyHandler);
  if (overlay._touchStart) overlay.removeEventListener('touchstart', overlay._touchStart);
  if (overlay._touchEnd) overlay.removeEventListener('touchend', overlay._touchEnd);
  _diskPlayerGen++;
  if (_diskPlayerRaf) { cancelAnimationFrame(_diskPlayerRaf); _diskPlayerRaf = null; }
  _diskWfPeaks = null;
}

// ── DISK EDIT ──

async function openDiskEdit(id) {
  const f = diskAllFiles.find(x => x.id === id);
  if (!f) return;
  const meta = document.getElementById('diskPreviewMeta');
  if (!meta) return;
  let folderOptions = '<option value="">— Корень —</option>';
  try {
    const folders = await api('/disk/folders/all');
    folderOptions += folders.map(fo =>
      `<option value="${esc(fo.id)}"${fo.id === f.folder_id ? ' selected' : ''}>${esc(fo.name)}</option>`
    ).join('');
  } catch {}
  meta.innerHTML = `
    <div class="disk-edit-form">
      <input id="diskEditName" class="input" value="${esc(f.name)}" placeholder="Имя файла" maxlength="255">
      <textarea id="diskEditDesc" class="input disk-edit-desc" placeholder="Описание (необязательно)" maxlength="200">${esc(f.description || '')}</textarea>
      <label class="disk-edit-label">Папка</label>
      <select id="diskEditFolder" class="input">${folderOptions}</select>
      <div class="disk-preview-actions">
        <button class="btn btn-sm" data-post-action="disk-save-edit" data-file-id="${esc(id)}">Сохранить</button>
        <button class="btn btn-sm" data-post-action="disk-cancel-edit">Отмена</button>
      </div>
    </div>`;
  document.getElementById('diskEditName')?.focus();
}

async function saveDiskEdit(id) {
  const name = document.getElementById('diskEditName')?.value.trim();
  const description = document.getElementById('diskEditDesc')?.value.trim() || '';
  const folder_id = document.getElementById('diskEditFolder')?.value || null;
  if (!name) { toast.error('Имя не может быть пустым'); return; }
  try {
    await api(`/disk/${id}`, { method: 'PATCH', body: { name, description, folder_id } });
    const f = diskAllFiles.find(x => x.id === id);
    if (f) { f.name = name; f.description = description; f.folder_id = folder_id; }
    _diskFiltered = diskGetFiltered();
    renderDiskFiles();
    const upd = _diskFiltered[diskPreviewIdx] || diskAllFiles.find(x => x.id === id);
    _renderDiskPreview(upd);
    toast.success('Сохранено');
  } catch (e) { toast.error(e.message); }
}

// ── DISK LOAD ──

async function loadDiskFiles() {
  const wrap = document.getElementById('diskGrid');
  if (!wrap) return;
  wrap.innerHTML = '<div class="empty">Загрузка…</div>';
  try {
    const folderParam = diskCurrentFolder ? `?folder_id=${diskCurrentFolder}` : '';
    const parentParam = diskCurrentFolder ? `?parent_id=${diskCurrentFolder}` : '';
    const [files, folders] = await Promise.all([
      api(`/disk${folderParam}`),
      api(`/disk/folders${parentParam}`)
    ]);
    diskAllFiles = files;
    diskFolders = folders;
    _diskFiltered = diskGetFiltered();
    renderDiskFiles();
    loadDiskStats();
  } catch (e) { wrap.innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
}

async function loadDiskStats() {
  try {
    const s = await api('/disk/stats');
    const el = document.getElementById('diskStats');
    if (!el) return;
    const n = s.count || 0;
    el.innerHTML = `${fmtBytes(s.used || 0)} · ${n} файл${n===1?'':n<5?'а':'ов'}`;
  } catch {}
}

function setupDiskDropzone() {
  const zone = document.getElementById('diskDropzone');
  if (!zone) return;
  ['dragenter','dragover'].forEach(ev => zone.addEventListener(ev, e => { e.preventDefault(); zone.classList.add('dragging'); }));
  ['dragleave','dragend'].forEach(ev => zone.addEventListener(ev, () => zone.classList.remove('dragging')));
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('dragging');
    if (e.dataTransfer?.files?.length) uploadDiskFiles(e.dataTransfer.files);
  });
}

async function uploadDiskFiles(fileList) {
  const files = Array.from(fileList);
  if (!files.length) return;
  const progress = document.getElementById('diskProgress');
  let done = 0;
  const upd = () => {
    if (!progress) return;
    const pct = Math.round(done / files.length * 100);
    progress.classList.remove('hidden');
    progress.innerHTML = `<div class="disk-prog-bar"><div class="disk-prog-fill" style="width:${pct}%"></div></div><span>${done} / ${files.length}</span>`;
  };
  upd();
  for (const file of files) {
    try {
      const fd = new FormData();
      fd.append('file', file);
      if (diskCurrentFolder) fd.append('folder_id', diskCurrentFolder);
      await api('/disk', { method: 'POST', body: fd });
      done++; upd();
    } catch (e) { toast.error(`${file.name}: ${e.message}`); }
  }
  progress?.classList.add('hidden');
  toast.success(done === files.length ? `Загружено ${done} файл${done===1?'':done<5?'а':'ов'}` : `Загружено ${done} из ${files.length}`);
  loadDiskFiles();
}

async function deleteDiskFile(id, fromPreview = false) {
  if (!confirm('Удалить файл?')) return;
  try {
    await api(`/disk/${id}`, { method: 'DELETE' });
    diskAllFiles = diskAllFiles.filter(f => f.id !== id);
    diskSelectedIds.delete(id);
    if (fromPreview) closeDiskPreview();
    _diskFiltered = diskGetFiltered();
    renderDiskFiles();
    loadDiskStats();
  } catch {}
}

async function renderDisk(app) {
  if (!me) return go('login');
  diskAllFiles = [];
  diskFolders = [];
  diskFolderPath = [];
  diskCurrentFolder = null;
  _diskFiltered = [];
  diskSelectMode = false;
  diskSelectedIds.clear();
  app.innerHTML = `
    ${opiumCommandStrip('disk')}
    ${opiumMetricCards([
      { label: 'mode', value: diskView, note: 'grid/list' },
      { label: 'select', value: 'bulk', note: 'zip or delete' },
      { label: 'share', value: 'links', note: 'publish files' },
    ])}
    <div class="disk-header">
      <h2 class="disk-title">Диск</h2>
      <div class="disk-header-right">
        <button class="btn btn-sm btn-ic-row" data-post-action="disk-create-folder">${iconCut('add', 'ui-icon', 14, 14)}Папка</button>
        <button class="btn btn-sm btn-ic-row" data-post-action="disk-open-upload">${iconCut('upload', 'ui-icon', 14, 14)}Загрузить</button>
        <button class="disk-view-btn" id="diskSelectBtn" data-post-action="disk-toggle-select-mode" title="Выбрать">${iconCut('check', 'ui-icon', 15, 15)}</button>
        <button class="disk-view-btn${diskView==='grid'?' active':''}" id="diskBtnGrid" data-post-action="disk-set-view" data-view="grid" title="Сетка">${iconCut('gallery', 'ui-icon', 15, 15)}</button>
        <button class="disk-view-btn${diskView==='list'?' active':''}" id="diskBtnList" data-post-action="disk-set-view" data-view="list" title="Список">${iconCut('more-horizontal', 'ui-icon', 15, 15)}</button>
      </div>
    </div>
    <div id="diskBreadcrumb" class="disk-breadcrumb"></div>
    <input type="file" id="diskFileInput" style="display:none" multiple
      accept="audio/*,video/*,image/*,.pdf,.txt,.md,.json,.zip,.rar,.7z"
      data-post-action="disk-file-input">
    <div class="disk-dropzone" id="diskDropzone">
      <span class="disk-drop-hint disk-drop-hint--ic">${iconCut('upload', 'ui-icon', 15, 15)}Перетащи файлы или нажми для загрузки</span>
      <div id="diskStats" class="disk-stat-text"></div>
    </div>
    <div class="disk-toolbar">
      <div class="disk-search-wrap">
        <input class="disk-search" id="diskSearchInput" placeholder="Поиск по имени..." data-post-action="disk-search-input" value="${esc(diskSearch)}">
      </div>
      <button class="btn btn-sm btn-ghost btn-ic-pad" data-post-action="disk-create-folder-prompt" title="Создать папку">${iconCut('add', 'ui-icon', 15, 15)} ПАПКА</button>
      <div class="disk-sort-tabs">
        <span class="disk-sort-btn${diskSort==='date'?' active':''}" data-sort="date" data-post-action="disk-set-sort" data-sort-key="date">Дата</span>
        <span class="disk-sort-btn${diskSort==='name'?' active':''}" data-sort="name" data-post-action="disk-set-sort" data-sort-key="name">Имя</span>
        <span class="disk-sort-btn${diskSort==='size'?' active':''}" data-sort="size" data-post-action="disk-set-sort" data-sort-key="size">Размер</span>
      </div>
    </div>
    <div class="disk-filters">
      <span class="disk-filter-tab${diskActiveFilter==='all'?' active':''}" data-filter="all" data-post-action="disk-set-filter" data-filter-key="all">Все</span>
      <span class="disk-filter-tab${diskActiveFilter==='image'?' active':''}" data-filter="image" data-post-action="disk-set-filter" data-filter-key="image">Фото</span>
      <span class="disk-filter-tab${diskActiveFilter==='audio'?' active':''}" data-filter="audio" data-post-action="disk-set-filter" data-filter-key="audio">Аудио</span>
      <span class="disk-filter-tab${diskActiveFilter==='video'?' active':''}" data-filter="video" data-post-action="disk-set-filter" data-filter-key="video">Видео</span>
      <span class="disk-filter-tab${diskActiveFilter==='other'?' active':''}" data-filter="other" data-post-action="disk-set-filter" data-filter-key="other">Файлы</span>
    </div>
    <div id="diskBulkBar" class="disk-bulk-bar hidden">
      <span class="bulk-count"></span>
      <button class="btn btn-sm disk-bulk-zip" data-post-action="disk-download-zip">${iconCut('download', 'ui-icon', 15, 15)} ZIP</button>
      <button class="btn btn-sm btn-danger disk-bulk-del" data-post-action="disk-bulk-delete">${iconCut('trash', 'ui-icon', 15, 15)} Удалить</button>
      <button class="btn btn-sm btn-ic-row" data-post-action="disk-toggle-select-mode">${iconCut('close', 'ui-icon', 14, 14)}Отмена</button>
    </div>
    <div id="diskProgress" class="disk-prog-wrap hidden"></div>
    <div id="diskGrid"></div>
    <div class="disk-overlay hidden" id="diskOverlay" data-post-action="disk-overlay-close">
      <button class="disk-nav-btn prev" data-post-action="disk-nav-preview" data-nav-dir="-1" aria-label="Назад">${iconCut('back', 'ui-icon', 18, 18)}</button>
      <div class="disk-preview-box" data-post-action="disk-preview-box">
        <button class="disk-preview-close" data-post-action="disk-close-preview" aria-label="Закрыть">${iconCut('close', 'ui-icon', 18, 18)}</button>
        <div id="diskPreviewContent"></div>
        <div id="diskPreviewMeta"></div>
      </div>
      <button class="disk-nav-btn next" data-post-action="disk-nav-preview" data-nav-dir="1" aria-label="Вперёд">${iconCut('forward', 'ui-icon', 18, 18)}</button>
    </div>`;
  renderDiskBreadcrumb();
  setupDiskDropzone();
  updateDiskSortUI();
  loadDiskFiles();
}

// ── REACTIONS ──

function reactionBarHtml(mid, reactions) {
  const pills = (reactions || []).map(r =>
    `<span class="reaction-pill${r.me ? ' me' : ''}" data-mid="${esc(String(mid))}" data-emoji="${esc(r.emoji)}" role="button" tabindex="0" title="${r.count}">${r.emoji}<span class="pill-count">${r.count}</span></span>`
  ).join('');
  return `${pills}<button class="reaction-add-btn" data-mid="${esc(String(mid))}" aria-label="Добавить реакцию">${iconCut('add', 'ui-icon', 14, 14)}</button>`;
}

function getOrCreatePicker() {
  if (_pickerEl) return _pickerEl;
  _pickerEl = document.createElement('div');
  _pickerEl.className = 'reaction-picker';
  ALLOWED_EMOJI.forEach(emoji => {
    const btn = document.createElement('button');
    btn.textContent = emoji;
    btn.addEventListener('click', () => {
      if (_pickerMid) sendReaction(currentChatId, _pickerMid, emoji);
      closePicker();
    });
    _pickerEl.appendChild(btn);
  });
  document.body.appendChild(_pickerEl);
  document.addEventListener('click', e => {
    if (_pickerEl && _pickerEl.classList.contains('open') &&
        !_pickerEl.contains(e.target) &&
        !e.target.closest('.reaction-add-btn')) {
      closePicker();
    }
  }, true);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closePicker(); });
  return _pickerEl;
}

function openPicker(mid, anchorEl) {
  const picker = getOrCreatePicker();
  if (_pickerMid === mid && picker.classList.contains('open')) { closePicker(); return; }
  _pickerMid = mid;
  picker.style.visibility = 'hidden';
  picker.style.top = '-999px';
  picker.style.left = '-999px';
  picker.classList.add('open');
  requestAnimationFrame(() => {
    const rect = anchorEl.getBoundingClientRect();
    const pw = picker.offsetWidth;
    const ph = picker.offsetHeight;
    let left = rect.left + rect.width / 2 - pw / 2;
    let top = rect.top - ph - 8;
    left = Math.max(8, Math.min(left, window.innerWidth - pw - 8));
    if (top < 8) top = rect.bottom + 8;
    picker.style.left = left + 'px';
    picker.style.top = top + 'px';
    picker.style.visibility = '';
  });
}

function closePicker() {
  if (_pickerEl) _pickerEl.classList.remove('open');
  _pickerMid = null;
}

async function sendReaction(cid, mid, emoji) {
  // Optimistic update before API call
  _optimisticReaction(mid, emoji);
  try {
    const d = await api(`/chats/${cid}/messages/${mid}/react`, { method: 'POST', body: { emoji } });
    // Sync with authoritative server state
    if (d.reactions) applyReactions(mid, d.reactions);
  } catch (e) {
    toast.error('Не удалось поставить реакцию');
    // Revert optimistic update by re-rendering without the change
    const bar = _findReactionBar(mid);
    if (bar) bar.innerHTML = reactionBarHtml(mid, []);
  }
}

// Find the reaction-bar element by mid without CSS selector escaping
function _findReactionBar(mid) {
  const bars = document.querySelectorAll('.reaction-bar');
  for (const b of bars) { if (b.dataset.mid === String(mid)) return b; }
  return null;
}

// Optimistically toggle a reaction in the DOM before API responds
function _optimisticReaction(mid, emoji) {
  const bar = _findReactionBar(mid);
  if (!bar) return;
  const existing = bar.querySelector(`.reaction-pill[data-emoji="${emoji}"]`);
  if (existing) {
    const countEl = existing.querySelector('.pill-count');
    const n = parseInt(countEl?.textContent || '1');
    if (existing.classList.contains('me')) {
      if (n <= 1) existing.remove(); else { countEl.textContent = n - 1; existing.classList.remove('me'); }
    } else {
      countEl.textContent = n + 1; existing.classList.add('me');
    }
  } else {
    const pill = document.createElement('span');
    pill.className = 'reaction-pill me';
    pill.dataset.mid = String(mid);
    pill.dataset.emoji = emoji;
    pill.setAttribute('role', 'button');
    pill.setAttribute('tabindex', '0');
    pill.innerHTML = `${emoji}<span class="pill-count">1</span>`;
    const addBtn = bar.querySelector('.reaction-add-btn');
    addBtn ? bar.insertBefore(pill, addBtn) : bar.appendChild(pill);
  }
}

function applyReactions(mid, reactions) {
  let bar = _findReactionBar(mid);
  if (!bar) {
    // Try to find parent msg and create bar
    const msgs = document.querySelectorAll('.msg');
    let msgEl = null;
    for (const m of msgs) { if (m.dataset.id === String(mid)) { msgEl = m; break; } }
    if (!msgEl) return;
    bar = document.createElement('div');
    bar.className = 'reaction-bar';
    bar.dataset.mid = String(mid);
    const body = msgEl.querySelector('.msg-body');
    if (body) body.appendChild(bar); else return;
  }
  // Re-compute 'me' based on current viewer, not reactor (SSE sends reactor's perspective)
  const fixed = me
    ? reactions.map(r => ({ ...r, me: !!(r.users && r.users.includes(me.id)) }))
    : reactions;
  bar.innerHTML = reactionBarHtml(mid, fixed);
}

// Delegate reaction interactions — pill click toggles, + opens picker
document.addEventListener('click', e => {
  const addBtn = e.target.closest('.reaction-add-btn');
  if (addBtn) { e.stopPropagation(); openPicker(addBtn.dataset.mid, addBtn); return; }
  const pill = e.target.closest('.reaction-pill');
  if (pill && pill.dataset.mid && pill.dataset.emoji) {
    sendReaction(currentChatId, pill.dataset.mid, pill.dataset.emoji);
  }
});


async function acceptFollowReq(id, btn) {
  try {
    await api(`/follow-requests/${id}/accept`, { method:'POST' });
    btn.closest('.follow-req-row')?.remove();
    toast.success('Подписка принята');
  } catch(e) { toast.error(e.message); }
}
async function declineFollowReq(id, btn) {
  try {
    await api(`/follow-requests/${id}`, { method:'DELETE' });
    btn.closest('.follow-req-row')?.remove();
  } catch(e) { toast.error(e.message); }
}

async function leaveGroupChat(cid) {
  if (!confirm('Покинуть группу?')) return;
  try {
    await api(`/chats/${cid}/leave`, { method:'POST' });
    go('chats');
    toast('Ты вышел из группы');
  } catch(e) { toast.error(e.message); }
}
async function addGroupMember(cid) {
  const username = prompt('Введи username участника:');
  if (!username) return;
  try {
    const u = await api(`/user/${username.replace(/^@/,'').trim()}`);
    await api(`/chats/${cid}/members`, { method:'POST', body:{ user_id: u.id } });
    toast.success(`@${u.username} добавлен в группу`);
    renderChat(document.getElementById('app'), cid);
  } catch(e) { toast.error(e.message); }
}
async function removeGroupMember(cid, uid, username) {
  if (!confirm(`Удалить @${username} из группы?`)) return;
  try {
    await api(`/chats/${cid}/members/${uid}`, { method:'DELETE' });
    toast(`@${username} удалён из группы`);
    renderChat(document.getElementById('app'), cid);
  } catch(e) { toast.error(e.message); }
}

async function doResendReset(email) {
  try {
    await api('/forgot-password', { method:'POST', body:{ email } });
    toast.success('Новый код отправлен на email');
  } catch(e) { toast.error(e.message); }
}

// ── MEDIA GALLERY ──

async function openMediaGallery(cid) {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `<div class="modal media-gallery-modal">
    <div class="modal-head">
      <b>Медиа и файлы</b>
      <div class="modal-head-actions">
        <button type="button" class="gallery-tab active" data-tab="images" data-post-action="switch-gallery-tab" data-gallery-tab="images" data-conv-id="${cid}">Фото</button>
        <button type="button" class="gallery-tab" data-tab="videos" data-post-action="switch-gallery-tab" data-gallery-tab="videos" data-conv-id="${cid}">Видео</button>
        <button type="button" class="gallery-tab" data-tab="audio" data-post-action="switch-gallery-tab" data-gallery-tab="audio" data-conv-id="${cid}">Аудио</button>
        <button type="button" class="gallery-tab" data-tab="files" data-post-action="switch-gallery-tab" data-gallery-tab="files" data-conv-id="${cid}">Файлы</button>
        <button type="button" class="gallery-tab" data-tab="links" data-post-action="switch-gallery-tab" data-gallery-tab="links" data-conv-id="${cid}">Ссылки</button>
        <button type="button" class="modal-icon-dismiss" data-post-action="close-modal-overlay" aria-label="Закрыть">${iconCut('close', 'ui-icon', 18, 18)}</button>
      </div>
    </div>
    <div id="galleryContent" class="gallery-body"></div>
  </div>`;
  document.body.appendChild(modal);
  await loadGalleryTab('images', cid);
}

async function loadGalleryTab(tab, cid) {
  const el = document.getElementById('galleryContent');
  if (!el) return;
  el.innerHTML = '<div class="gallery-state-msg">Загрузка...</div>';
  try {
    const items = await api(`/chats/${cid}/media`);
    const filtered = items.filter(m => {
      if (tab === 'images') return m.file_type && m.file_type.startsWith('image/');
      if (tab === 'videos') return m.file_type && m.file_type.startsWith('video/');
      if (tab === 'audio') return m.file_type && m.file_type.startsWith('audio/');
      if (tab === 'links') return !m.file && /https?:\/\/[^\s<>"']+/.test(m.content || '');
      if (tab === 'files') return m.file_type && !m.file_type.startsWith('image/') && !m.file_type.startsWith('audio/') && !m.file_type.startsWith('video/');
      return true;
    });
    if (!filtered.length) { el.innerHTML = '<div class="gallery-state-msg">Ничего нет</div>'; return; }
    if (tab === 'images') {
      el.innerHTML = `<div class="gallery-grid">
        ${filtered.map(m => `<img class="gallery-thumb" src="${esc(m.file)}" alt="" data-post-action="open-image" data-image="${esc(m.file)}" loading="lazy">`).join('')}
      </div>`;
    } else if (tab === 'videos') {
      el.innerHTML = `<div class="gallery-grid gallery-grid--videos">
        ${filtered.map(m => `<button type="button" class="gallery-video-thumb" data-post-action="open-video" data-video="${esc(m.file)}">
          <video src="${esc(m.file)}" preload="metadata" muted playsinline></video>
          <span>${iconCut('play', 'ui-icon', 18, 18)}</span>
        </button>`).join('')}
      </div>`;
    } else if (tab === 'audio') {
      el.innerHTML = filtered.map(m => `<div class="gallery-audio-row">${voicePlayerHtml(m.file, m.id, m.file_name)}<div class="gallery-audio-meta">${timeAgo(m.created_at)} · ${esc(m.display_name)}</div></div>`).join('');
    } else if (tab === 'links') {
      el.innerHTML = filtered.map(m => {
        const url = (m.content || '').match(/https?:\/\/[^\s<>"']+/)?.[0] || '';
        let host = url;
        try { host = new URL(url).hostname; } catch {}
        return `<div class="gallery-file-row gallery-link-row" data-post-action="jump-to-message" data-msg-id="${esc(m.id)}" data-conv-id="${esc(cid)}">
          <span class="gallery-file-icon" aria-hidden="true">${iconCut('forward', 'ui-icon', 18, 18)}</span>
          <div class="gallery-file-main">
            <a class="gallery-file-name" href="${esc(url)}" target="_blank" rel="noopener" data-post-action="">${esc(host)}</a>
            <div class="gallery-file-meta">${esc(url)} · ${timeAgo(m.created_at)} · ${esc(m.display_name)}</div>
          </div>
        </div>`;
      }).join('');
    } else {
      el.innerHTML = filtered.map(m => `<div class="gallery-file-row">
        <span class="gallery-file-icon" aria-hidden="true">${iconCut('file', 'ui-icon', 18, 18)}</span>
        <div class="gallery-file-main">
          <div class="gallery-file-name"><a href="${esc(m.file)}" download="${esc(m.file_name||'file')}">${esc(m.file_name||'файл')}</a></div>
          <div class="gallery-file-meta">${esc(m.file_type||'file')} · ${m.file_size ? fmtBytes(m.file_size) + ' · ' : ''}${timeAgo(m.created_at)} · ${esc(m.display_name)}</div>
        </div>
      </div>`).join('');
    }
  } catch { el.innerHTML = '<div class="gallery-state-msg">Ошибка загрузки</div>'; }
}

function switchGalleryTab(btn, tab, cid) {
  document.querySelectorAll('.gallery-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  loadGalleryTab(tab, cid);
}

// ── JUMP TO MESSAGE ──

async function jumpToMessage(mid, cid) {
  // If the message is currently visible in DOM, just scroll to it
  const existing = document.querySelector(`[data-id="${mid}"]`);
  if (existing) {
    existing.scrollIntoView({ behavior: 'smooth', block: 'center' });
    highlightMsg(existing);
    return;
  }
  // Otherwise load context from server
  if (cid !== currentChatId) {
    await renderChat(document.getElementById('app'), cid);
    // try again after render
    setTimeout(() => {
      const el2 = document.querySelector(`[data-id="${mid}"]`);
      if (el2) { el2.scrollIntoView({ behavior: 'smooth', block: 'center' }); highlightMsg(el2); }
    }, 300);
    return;
  }
  try {
    const r = await api(`/chats/${cid}/messages/${mid}/context`);
    const chatMsgsEl = document.getElementById('chatMsgs');
    if (!chatMsgsEl) return;
    chatMsgsEl.innerHTML = r.messages.map(msgHtml).join('');
    window._chatHasMore = true;
    window._chatOldestTs = r.messages.length ? r.messages[0].created_at : null;
    loadLinkPreviews(chatMsgsEl).catch(() => {});
    setTimeout(() => {
      const el = document.querySelector(`[data-id="${mid}"]`);
      if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); highlightMsg(el); }
    }, 100);
  } catch (e) { toast.error('Не удалось загрузить сообщение'); }
}

function highlightMsg(el) {
  el.classList.add('msg-highlight');
  setTimeout(() => el.classList.remove('msg-highlight'), 2000);
}

// ── FORMAT LAST SEEN ──

function formatLastSeen(isoTs) {
  if (!isoTs) return null;
  const d = new Date(isoTs.includes('Z') ? isoTs : isoTs + 'Z');
  const diff = Date.now() - d.getTime();
  if (diff < 3 * 60_000) return '<span class="online-dot"></span> онлайн';
  if (diff < 60 * 60_000) return 'был(а) ' + Math.floor(diff / 60_000) + ' мин назад';
  if (diff < 24 * 3600_000) return 'был(а) ' + Math.floor(diff / 3600_000) + ' ч назад';
  return 'был(а) ' + d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

// ── NOTIFICATION SOUND ──

let _notifAudioCtx = null;
function playNotifSound() {
  try {
    if (!_notifAudioCtx) _notifAudioCtx = new AudioContext();
    const ctx = _notifAudioCtx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(660, ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.3);
  } catch {}
}

// ── EDIT GROUP INFO ──

function closeUserInfoPanel() {
  const panel = document.getElementById('userInfoPanel');
  if (window._uipCloseHandler) {
    document.removeEventListener('click', window._uipCloseHandler);
    window._uipCloseHandler = null;
  }
  if (!panel) return;
  panel.classList.remove('user-info-panel--open');
  setTimeout(() => { panel.remove(); }, 220);
}

async function editGroupInfo(cid) {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `<div class="modal">
    <div class="modal-head"><b>Редактировать группу</b><button type="button" class="modal-icon-dismiss" data-post-action="close-modal-overlay" aria-label="Закрыть">${iconCut('close', 'ui-icon', 18, 18)}</button></div>
    <div class="modal-form-stack">
      <div>
        <label class="modal-field-label" for="editGroupTitle">Название</label>
        <input id="editGroupTitle" class="input modal-field-input" placeholder="Название группы">
      </div>
      <div>
        <label class="modal-field-label" for="editGroupAvatar">Аватар группы</label>
        <input type="file" id="editGroupAvatar" accept="image/*" class="modal-file-input">
      </div>
      <button type="button" class="btn" data-post-action="save-group-info" data-conv-id="${cid}">Сохранить</button>
    </div>
  </div>`;
  document.body.appendChild(modal);
}

async function saveGroupInfo(cid, modal) {
  const titleEl = document.getElementById('editGroupTitle');
  const avatarEl2 = document.getElementById('editGroupAvatar');
  const title = titleEl?.value.trim();
  let ok = false;
  if (title) {
    try {
      await api(`/chats/${cid}`, { method: 'PATCH', body: { title } });
      const titleEl2 = document.querySelector('.chat-title');
      if (titleEl2) titleEl2.textContent = title;
      ok = true;
    } catch (e) { toast.error(e.message || 'Ошибка'); return; }
  }
  if (avatarEl2?.files?.[0]) {
    const fd = new FormData();
    fd.append('avatar', avatarEl2.files[0]);
    try {
      const r = await fetch('/api/chats/' + cid + '/avatar', {
        method: 'POST',
        headers: { 'x-csrf-token': me?.csrf_token || '' },
        credentials: 'include',
        body: fd
      });
      if (r.ok) ok = true;
    } catch (e) { toast.error('Ошибка загрузки аватара'); }
  }
  modal?.remove();
  if (ok) toast('Группа обновлена');
}

// ── USER INFO PANEL ──

async function openUserInfoPanel(username) {
  if (!username) return;
  // Close if already open
  const existing = document.getElementById('userInfoPanel');
  if (existing) {
    if (window._uipCloseHandler) {
      document.removeEventListener('click', window._uipCloseHandler);
      window._uipCloseHandler = null;
    }
    existing.remove();
    return;
  }
  let user = null;
  try { user = await api(`/user/${username}`); } catch { return; }
  const panel = document.createElement('div');
  panel.id = 'userInfoPanel';
  panel.className = 'user-info-panel';
  panel.innerHTML = `
    <div class="user-info-head">
      <b>Профиль</b>
      <button type="button" class="modal-icon-dismiss" data-post-action="close-user-info-panel" aria-label="Закрыть">${iconCut('close', 'ui-icon', 18, 18)}</button>
    </div>
    <div class="user-info-center">
      ${avatarEl(user.avatar, 'avatar', initial(user.display_name))}
      <div class="user-info-name">${esc(user.display_name)}</div>
      <div class="user-info-handle">@${esc(user.username)}</div>
    </div>
    ${user.bio ? `<div class="user-info-bio">${esc(user.bio)}</div>` : ''}
    <div class="user-info-stats">
      <div class="user-info-stat"><div class="user-info-stat-val">${user.followers||0}</div>подписчики</div>
      <div class="user-info-stat"><div class="user-info-stat-val">${user.following||0}</div>подписки</div>
    </div>
    <div class="user-info-actions">
      <button type="button" class="btn" data-post-action="open-profile-from-panel" data-username="${esc(user.username)}">Открыть профиль</button>
      ${!user.is_following ? `<button type="button" class="btn btn-ghost" data-post-action="follow-user-from-panel" data-user-id="${user.id}">Подписаться</button>` : ''}
      <button type="button" class="btn btn-ghost btn-danger" data-post-action="block-user-from-panel" data-username="${esc(user.username)}">Заблокировать</button>
    </div>
  `;
  document.body.appendChild(panel);
  requestAnimationFrame(() => { requestAnimationFrame(() => { panel.classList.add('user-info-panel--open'); }); });
  if (window._uipCloseHandler) document.removeEventListener('click', window._uipCloseHandler);
  setTimeout(() => {
    const close = e => {
      if (!panel.contains(e.target) && !document.querySelector('.chat-head-main')?.contains(e.target)) {
        closeUserInfoPanel();
      }
    };
    window._uipCloseHandler = close;
    document.addEventListener('click', close);
  }, 100);
}

async function blockUserFromPanel(username) {
  if (!confirm(`Заблокировать @${username}?`)) return;
  try {
    await api(`/user/${username}/block`, { method: 'POST' });
    toast('Пользователь заблокирован');
    closeUserInfoPanel();
    go('chats');
  } catch (e) { toast.error(e.message || 'Ошибка'); }
}

// ── KEYBOARD SHORTCUTS ──

function bindChatKeyboardShortcuts(cid) {
  const handler = (e) => {
    // Ctrl+F or / → focus chat search
    if ((e.ctrlKey && e.key === 'f') || (e.key === '/' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA')) {
      const searchInput = document.getElementById('chatSearchInput');
      if (searchInput) {
        e.preventDefault();
        const panel = document.getElementById('chatSearchPanel');
        if (panel?.classList.contains('hidden')) toggleChatSearch(cid);
        searchInput.focus();
      }
    }
  };
  // Remove previous
  if (window._chatKeyHandler) document.removeEventListener('keydown', window._chatKeyHandler);
  window._chatKeyHandler = handler;
  document.addEventListener('keydown', handler);
}

// ── START ──
init();
