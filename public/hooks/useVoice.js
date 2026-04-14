/**
 * useVoice — plain JS module wrapping MediaRecorder.
 * Handles the full lifecycle: permission, recording, waveform animation,
 * cancel/lock gestures (Telegram-style), preview, and send.
 *
 * Usage:
 *   const voice = useVoice({ onSend: async (blob, duration) => { ... } });
 *   voice.mount(containerEl);   // injects UI
 *   voice.unmount();            // cleanup
 */

(function () {
  /**
   * @param {object} opts
   * @param {function(Blob, number): Promise<void>} opts.onSend  — called with (blob, durationSeconds)
   * @param {function=}                             opts.onCancel — optional cancel callback
   */
  function useVoice(opts = {}) {
    let mediaRecorder = null;
    let chunks = [];
    let stream = null;
    let startTime = 0;
    let timerInterval = null;
    let animFrame = null;
    let analyser = null;
    let audioCtx = null;
    let bars = [];
    let locked = false;
    let pendingAction = null; // 'cancel' | 'lock' set while awaiting mic grant
    let active = false;       // pointer held
    let startX = 0, startY = 0;

    // DOM refs
    let btnEl = null;
    let wrapEl = null;
    let timerEl = null;
    let barsEl = null;
    let hintEl = null;
    let lockEl = null;
    let previewEl = null;
    let previewAudioEl = null;
    let previewBlob = null;
    let previewDuration = 0;

    // ── helpers ──────────────────────────────────────────────────

    function fmt(secs) {
      const m = Math.floor(secs / 60);
      const s = secs % 60;
      return `${m}:${String(s).padStart(2, '0')}`;
    }

    function setupAnalyser(s) {
      try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 32;
        const src = audioCtx.createMediaStreamSource(s);
        src.connect(analyser);
      } catch (_e) { analyser = null; }
    }

    function animateBars() {
      if (!analyser || !barsEl) return;
      const data = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(data);
      const bEls = barsEl.querySelectorAll('.vr-bar');
      bEls.forEach((b, i) => {
        const val = data[i] || 0;
        const h = Math.max(3, Math.round((val / 255) * 28));
        b.style.height = h + 'px';
      });
      animFrame = requestAnimationFrame(animateBars);
    }

    function buildWaveform() {
      if (!barsEl) return;
      barsEl.innerHTML = '';
      bars = [];
      for (let i = 0; i < 12; i++) {
        const b = document.createElement('span');
        b.className = 'vr-bar';
        barsEl.appendChild(b);
        bars.push(b);
      }
    }

    function stopAnalyser() {
      if (animFrame) cancelAnimationFrame(animFrame);
      animFrame = null;
      if (audioCtx) { try { audioCtx.close(); } catch {} audioCtx = null; }
      analyser = null;
    }

    // ── recording lifecycle ───────────────────────────────────────

    async function startRecording() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch {
        if (typeof window.toast !== 'undefined') {
          window.toast.error('Нет доступа к микрофону');
        }
        return false;
      }

      // Handle gestures that arrived before mic was granted
      if (pendingAction === 'cancel') { pendingAction = null; stopStream(); return false; }
      if (pendingAction === 'lock')   { pendingAction = null; /* will set locked below */ }

      chunks = [];
      const mime = getSupportedMime();
      mediaRecorder = new MediaRecorder(stream, mime ? { mimeType: mime } : {});
      mediaRecorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
      mediaRecorder.onstop = onRecorderStop;
      mediaRecorder.start(100);
      startTime = Date.now();

      setupAnalyser(stream);
      buildWaveform();
      animateBars();

      startTimer();
      showRecordingUI(true);
      return true;
    }

    function startTimer() {
      timerInterval = setInterval(() => {
        if (!timerEl) return;
        timerEl.textContent = fmt(Math.floor((Date.now() - startTime) / 1000));
      }, 500);
    }

    function stopStream() {
      if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
    }

    function getSupportedMime() {
      const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];
      return types.find(t => MediaRecorder.isTypeSupported(t)) || '';
    }

    function onRecorderStop() {
      stopAnalyser();
      clearInterval(timerInterval);
      const dur = Math.round((Date.now() - startTime) / 1000);
      stopStream();

      if (recordingCancelled()) {
        showRecordingUI(false);
        return;
      }

      const blob = new Blob(chunks, { type: chunks[0]?.type || 'audio/webm' });
      if (locked) {
        // Show preview instead of sending immediately
        previewBlob = blob;
        previewDuration = dur;
        showPreview(blob, dur);
      } else {
        opts.onSend && opts.onSend(blob, dur);
        showRecordingUI(false);
      }
    }

    let _cancelled = false;
    function recordingCancelled() { return _cancelled; }

    function cancel() {
      _cancelled = true;
      locked = false;
      hidePreview();
      showRecordingUI(false);
      if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
      } else {
        stopAnalyser();
        clearInterval(timerInterval);
        stopStream();
        showRecordingUI(false);
      }
      if (opts.onCancel) opts.onCancel();
    }

    function stopAndSend() {
      if (mediaRecorder && mediaRecorder.state === 'recording') {
        _cancelled = false;
        locked = false;
        mediaRecorder.stop();
      }
    }

    // ── UI helpers ────────────────────────────────────────────────

    function showRecordingUI(visible) {
      if (!wrapEl) return;
      wrapEl.classList.toggle('vr-active', visible);
      if (!visible) {
        locked = false;
        if (lockEl) lockEl.classList.remove('vr-lock-active');
        if (timerEl) timerEl.textContent = '0:00';
        if (barsEl) { barsEl.querySelectorAll('.vr-bar').forEach(b => { b.style.height = '3px'; }); }
      }
    }

    function showHints(show) {
      if (hintEl) hintEl.classList.toggle('vr-hints-visible', show);
    }

    function setLocked(val) {
      locked = val;
      if (lockEl) lockEl.classList.toggle('vr-lock-active', val);
    }

    function showPreview(blob, dur) {
      if (!previewEl) return;
      showRecordingUI(false);
      if (previewAudioEl) {
        previewAudioEl.src = URL.createObjectURL(blob);
        const durEl = previewEl.querySelector('.vr-preview-dur');
        if (durEl) durEl.textContent = fmt(dur);
      }
      previewEl.classList.add('vr-preview-active');
    }

    function hidePreview() {
      if (previewEl) previewEl.classList.remove('vr-preview-active');
      if (previewAudioEl && previewAudioEl.src) {
        URL.revokeObjectURL(previewAudioEl.src);
        previewAudioEl.src = '';
      }
      previewBlob = null;
      previewDuration = 0;
    }

    // ── gesture handlers ──────────────────────────────────────────

    function onPointerDown(e) {
      if (locked) return;
      active = true;
      _cancelled = false;
      pendingAction = null;
      startX = e.clientX;
      startY = e.clientY;
      btnEl.setPointerCapture(e.pointerId);
      startRecording();
    }

    function onPointerMove(e) {
      if (!active || locked || pendingAction) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      if (dx < -50) {
        // Slide left → cancel
        active = false;
        showHints(false);
        if (mediaRecorder && mediaRecorder.state === 'recording') {
          _cancelled = true;
          mediaRecorder.stop();
        } else {
          pendingAction = 'cancel';
        }
      } else if (dy < -50) {
        // Slide up → lock
        active = false;
        showHints(false);
        if (mediaRecorder && mediaRecorder.state === 'recording') {
          setLocked(true);
        } else {
          pendingAction = 'lock';
        }
      }
    }

    function onPointerUp() {
      if (!active) return;
      active = false;
      showHints(false);
      if (!locked) {
        if (mediaRecorder && mediaRecorder.state === 'recording') {
          stopAndSend();
        }
      }
    }

    // ── mount / unmount ───────────────────────────────────────────

    function mount(el) {
      // Build inner elements (btn injected by caller; we build the overlay widgets)
      btnEl = el.querySelector('.vr-btn');
      wrapEl = el.querySelector('.vr-wrap');
      timerEl = el.querySelector('.vr-timer');
      barsEl = el.querySelector('.vr-bars');
      hintEl = el.querySelector('.vr-hints');
      lockEl = el.querySelector('.vr-lock');
      previewEl = el.querySelector('.vr-preview');
      previewAudioEl = el.querySelector('.vr-preview audio');

      if (!btnEl) return;

      btnEl.addEventListener('pointerdown', onPointerDown);
      btnEl.addEventListener('pointermove', onPointerMove);
      btnEl.addEventListener('pointerup',   onPointerUp);
      btnEl.addEventListener('pointercancel', onPointerUp);

      // Lock mode: send button in locked UI
      const sendBtn = el.querySelector('.vr-lock-send');
      if (sendBtn) sendBtn.addEventListener('click', stopAndSend);

      const cancelBtn = el.querySelector('.vr-lock-cancel');
      if (cancelBtn) cancelBtn.addEventListener('click', cancel);

      // Preview buttons
      const previewSend = el.querySelector('.vr-preview-send');
      if (previewSend) previewSend.addEventListener('click', () => {
        if (previewBlob) opts.onSend && opts.onSend(previewBlob, previewDuration);
        hidePreview();
      });

      const previewCancel = el.querySelector('.vr-preview-cancel');
      if (previewCancel) previewCancel.addEventListener('click', () => {
        hidePreview();
      });
    }

    function unmount() {
      cancel();
      btnEl = null;
    }

    return { mount, unmount, cancel, stopAndSend };
  }

  window.useVoice = useVoice;
})();
