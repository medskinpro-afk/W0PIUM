// ── CHAT PAGE MODULE ──
// All chat/DM/voice-related functions live here.
// Loaded after app.js — has full access to globals: api, toast, go, me, state, etc.
// Functions are intentionally global (no module wrapper).

// NOTE: The primary chat functions (renderChat, msgHtml, sendMsg, startRecording, etc.)
// are defined in app.js due to deep interdependencies with shared state.
// This file contains supplementary chat utilities that can be cleanly separated.

/**
 * Format seconds to m:ss for chat voice previews.
 * Alias kept here for reference — actual implementation in app.js (vpFmt).
 */

// Chat-specific keyboard shortcut: Ctrl+/ to focus message input
document.addEventListener('keydown', function(e) {
  if ((e.ctrlKey || e.metaKey) && e.key === '/') {
    const msgText = document.getElementById('msgText');
    if (msgText) {
      e.preventDefault();
      msgText.focus();
    }
  }
});
