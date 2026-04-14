/**
 * Toast notifications — Sonner-style, zero dependencies.
 * Usage:
 *   toast('Сохранено')
 *   toast.error('Ошибка')
 *   toast.success('Готово')
 *   toast.promise(fetch('/api/...'), { loading: 'Загрузка...', success: 'Готово', error: 'Ошибка' })
 */

(function () {
  let container = null;
  let idSeq = 0;

  function ensureContainer() {
    if (container) return container;
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
    return container;
  }

  function show(message, opts = {}) {
    const c = ensureContainer();
    const id = ++idSeq;
    const duration = opts.duration ?? 3500;
    const type = opts.type || 'default'; // 'default' | 'success' | 'error' | 'loading'

    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.dataset.id = id;

    const icon =
      type === 'success' ? '<span class="toast-icon">✓</span>' :
      type === 'error'   ? '<span class="toast-icon">✕</span>' :
      type === 'loading' ? '<span class="toast-icon toast-spin">⟳</span>' :
      '';

    el.innerHTML = `${icon}<span class="toast-msg">${message}</span>`;

    // Insert at bottom (newest last), or top depending on preference
    c.appendChild(el);

    // Animate in
    requestAnimationFrame(() => el.classList.add('toast-visible'));

    function dismiss() {
      el.classList.remove('toast-visible');
      el.classList.add('toast-out');
      el.addEventListener('transitionend', () => el.remove(), { once: true });
    }

    let timer = null;
    if (duration > 0 && type !== 'loading') {
      timer = setTimeout(dismiss, duration);
    }

    return {
      id,
      dismiss,
      update(msg, newOpts = {}) {
        clearTimeout(timer);
        const iconEl = el.querySelector('.toast-icon');
        const msgEl = el.querySelector('.toast-msg');
        if (msgEl) msgEl.textContent = msg;
        const newType = newOpts.type || 'default';
        el.className = `toast toast-${newType} toast-visible`;
        if (iconEl) {
          iconEl.textContent =
            newType === 'success' ? '✓' :
            newType === 'error'   ? '✕' :
            newType === 'loading' ? '⟳' : '';
          iconEl.className = `toast-icon${newType === 'loading' ? ' toast-spin' : ''}`;
        }
        if (newOpts.duration !== 0) {
          timer = setTimeout(dismiss, newOpts.duration ?? 3500);
        }
      },
    };
  }

  function toast(message, opts) {
    return show(message, opts);
  }

  toast.success = (message, opts) => show(message, { ...opts, type: 'success' });
  toast.error   = (message, opts) => show(message, { ...opts, type: 'error', duration: 5000 });
  toast.loading = (message, opts) => show(message, { ...opts, type: 'loading', duration: 0 });

  /**
   * @param {Promise} promise
   * @param {{ loading: string, success: string|function, error: string|function }} messages
   */
  toast.promise = (promise, messages) => {
    const t = toast.loading(messages.loading || 'Загрузка...');
    promise
      .then(result => {
        const msg = typeof messages.success === 'function' ? messages.success(result) : messages.success;
        t.update(msg || 'Готово', { type: 'success' });
      })
      .catch(err => {
        const msg = typeof messages.error === 'function' ? messages.error(err) : messages.error;
        t.update(msg || 'Ошибка', { type: 'error', duration: 5000 });
      });
    return t;
  };

  // Expose globally
  window.toast = toast;
})();
