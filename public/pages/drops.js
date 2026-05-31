// ── DROPS PAGE MODULE ──
// All drops-related functions live here.
// Loaded after app.js — has full access to globals: api, toast, go, me, state, etc.
// Functions are intentionally global (no module wrapper).

// NOTE: The primary drops functions (renderDrops, dropHtml, dropComposerHtml,
// submitDrop, delDrop, bindDropImg) are defined in app.js due to interdependencies
// with shared utilities (compressImage, maybeConvertHeic, bindMentionAutocomplete, etc.).
// This file contains supplementary drops utilities.

/**
 * Mark all visible drops as viewed immediately when user scrolls to them.
 * Enhances the default view tracking with IntersectionObserver.
 * Uses a singleton observer that gets disconnected on each re-render.
 */
function initDropViewTracking() {
  if (!window.IntersectionObserver) return;
  if (window._dropViewObserver) window._dropViewObserver.disconnect();

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const el = entry.target;
      const dropId = el.dataset.id;
      if (!dropId || el.dataset.viewTracked) return;
      el.dataset.viewTracked = '1';
      observer.unobserve(el);
      api(`/drops/${dropId}/view`, { method: 'POST' }).catch(() => {});
    });
  }, { threshold: 0.5 });

  window._dropViewObserver = observer;
  document.querySelectorAll('.drop[data-id]').forEach(el => observer.observe(el));
}

// Wrap renderDrops to auto-initialize view tracking after render
if (typeof renderDrops === 'function') {
  const _origRenderDrops = renderDrops;
  window.renderDrops = async function(...args) {
    await _origRenderDrops.apply(this, args);
    initDropViewTracking();
  };
}
