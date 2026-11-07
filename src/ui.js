const KEY_TO_INDEX = { '1': 0, '2': 1, '3': 2, '4': 3, '5': 4, '6': 5 };

function fmtTime(s) {
  if (!isFinite(s)) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}

export function initUI({ engine, app, screenDefs, onSwitch, getCurrentDef }) {
  const $ = (id) => document.getElementById(id);
  const playBtn = $('play-btn');
  const playIcon = () => (engine.isPlaying ? '⏸' : '▶');
  const overlay = $('picker-overlay');
  let seeking = false;

  // --- Screen cards ---
  const grid = $('card-grid');
  const keyRange = screenDefs.length > 1 ? `1–${screenDefs.length}` : '1';
  document.querySelector('#picker-overlay .picker-sub').textContent =
    `Pick a visual screen — switch anytime with keys ${keyRange} or the ⊞ button`;
  const hintKbd = document.querySelectorAll('#hint-bar kbd')[1];
  if (hintKbd) hintKbd.textContent = keyRange;
  screenDefs.forEach((def, i) => {
    let card = grid.querySelector('.screen-card[data-screen-id="' + def.id + '"]');
    if (!card) {
      card = document.createElement('div');
      card.className = 'screen-card';
      card.setAttribute('data-screen-id', def.id);
      card.innerHTML = `
      <div class="preview">
        <video class="preview-video" muted loop playsinline preload="metadata"
               poster="assets/previews/${def.id}.jpg" data-src="assets/previews/${def.id}.webm"></video>
        <span class="icon">${def.icon}</span>
      </div>
      <div class="name"></div>
      <div class="tagline"></div>
      <div class="note"></div>
      <span class="key-hint"></span>`;
      grid.appendChild(card);
    }
    card.style.setProperty('--card-glow', def.glow);
    card.style.setProperty('--card-accent', def.accent);
    card.querySelector('.name').textContent = def.name;
    card.querySelector('.tagline').textContent = def.tagline;
    const $note = card.querySelector('.note');
    if ($note) { $note.textContent = def.note || ''; $note.style.display = def.note ? '' : 'none'; }
    card.querySelector('.key-hint').textContent = i + 1;
  });

  // Screen switching is bound ONLY to the cards (event delegation) — clicks or
  // taps anywhere else on the picker (title, subtitle, background) do nothing.
  grid.addEventListener('click', (e) => {
    const card = e.target.closest('.screen-card');
    if (!card || !grid.contains(card)) return;
    activateCard(card);
  });

  async function activateCard(card) {
    const idx = [...grid.children].indexOf(card);
    const def = screenDefs[idx];
    if (!def) return;
    hideOverlay();
    await onSwitch(def.id);
    if (!engine.isPlaying && engine.sourceMode !== 'none') {
      try { await engine.play(); } catch (e) { /* gesture required */ }
    }
    syncPlayBtn();
  }

  // --- Card preview videos ---
  // Real src is assigned lazily on first open of the picker; videos play while
  // the picker is visible and pause when it is hidden (saves CPU/battery).
  const previewVideos = [...grid.querySelectorAll('.preview-video')];
  previewVideos.forEach((v) => {
    v.addEventListener('error', () => v.closest('.preview')?.classList.add('no-video'));
  });
  function startPreviews() {
    previewVideos.forEach((v) => {
      if (!v.getAttribute('src') && v.dataset.src) v.src = v.dataset.src;
      v.play().catch(() => { /* not ready yet */ });
    });
  }
  function pausePreviews() {
    previewVideos.forEach((v) => v.pause());
  }

  function showOverlay() { overlay.classList.remove('hidden'); startPreviews(); }
  function hideOverlay() { overlay.classList.add('hidden'); pausePreviews(); }
  $('screens-btn').addEventListener('click', showOverlay);
  // No background-click handler on purpose: tapping the picker backdrop must
  // not dismiss it or switch screens — only a card (or ⊞ / S) acts.

  // The picker is open on first page load — start the preview clips right away
  // (muted + playsinline, so browser autoplay policies allow it).
  if (!overlay.classList.contains('hidden')) startPreviews();

  // --- Settings (lil-gui) drawer toggle (mobile) ---
  const guiBtn = $('gui-btn');
  const guiHost = $('gui-host');
  if (guiBtn && guiHost) {
    guiBtn.addEventListener('click', () => guiHost.classList.toggle('open'));
  }

  // --- Play / pause ---
  function syncPlayBtn() {
    playBtn.innerHTML = `<span class="play-icon">${playIcon()}</span><span class="btn-label">${engine.isPlaying ? 'Pause' : 'Play'}</span>`;
  }
  playBtn.addEventListener('click', async () => {
    if (engine.sourceMode === 'none') { app.showToast('Load a track or enable the mic first'); return; }
    if (engine.isPlaying) engine.pause();
    else await engine.play();
    syncPlayBtn();
  });
  engine.addEventListener('trackloaded', (e) => {
    $('track-name').textContent = e.detail.name;
    app.showToast(`Loaded: ${e.detail.name}`);
  });
  engine.addEventListener('nosource', () => app.showToast('Load a track or enable the mic first'));
  engine.addEventListener('micerror', (e) => app.showToast(`Mic error: ${e.detail.message}`));
  engine.addEventListener('ended', () => syncPlayBtn());

  // --- Seek bar ---
  const seekbar = $('seekbar');
  seekbar.addEventListener('input', () => { seeking = true; });
  seekbar.addEventListener('change', () => {
    const t = (seekbar.value / 1000) * engine.duration;
    engine.seek(t);
    seeking = false;
  });

  setInterval(() => {
    if (seeking || !isFinite(engine.duration) || engine.duration <= 0) return;
    seekbar.value = String(Math.round((engine.currentTime / engine.duration) * 1000));
    $('time-cur').textContent = fmtTime(engine.currentTime);
    $('time-total').textContent = fmtTime(engine.duration);
  }, 250);

  // --- File loading ---
  const fileInput = $('audio-file');
  $('load-btn').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const f = fileInput.files[0];
    if (!f) return;
    await engine.loadFile(f);
    $('source-select').value = 'file';
    await engine.play();
    syncPlayBtn();
    hideOverlay();
  });

  // --- Source select ---
  $('source-select').addEventListener('change', async (e) => {
    const mode = e.target.value;
    if (mode === 'mic') {
      const ok = await engine.enableMic();
      if (!ok) { e.target.value = engine.sourceMode === 'file' ? 'file' : 'none'; return; }
      app.showToast('Microphone live — play something!');
    } else if (mode === 'file') {
      if (!engine.audioEl || !engine.audioEl.src) { fileInput.click(); return; }
      await engine.useFileSource();
    } else {
      engine.pause();
    }
    syncPlayBtn();
  });

  // --- Fullscreen ---
  $('fs-btn').addEventListener('click', toggleFullscreen);

  // --- Drag & drop ---
  const drop = $('drop-overlay');
  let dragDepth = 0;
  window.addEventListener('dragenter', (e) => {
    e.preventDefault();
    dragDepth++;
    drop.classList.add('active');
  });
  window.addEventListener('dragleave', (e) => {
    e.preventDefault();
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) drop.classList.remove('active');
  });
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', async (e) => {
    e.preventDefault();
    dragDepth = 0;
    drop.classList.remove('active');
    const file = [...(e.dataTransfer?.files || [])].find((f) => f.type.startsWith('audio/') || /\.(mp3|wav|ogg|m4a|flac)$/i.test(f.name));
    if (!file) { app.showToast('That does not look like an audio file'); return; }
    await engine.loadFile(file);
    $('source-select').value = 'file';
    await engine.play();
    syncPlayBtn();
    hideOverlay();
  });

  // --- Keyboard shortcuts ---
  window.addEventListener('keydown', (e) => {
    if (e.target.closest('input, select, textarea, [contenteditable=true]')) return;
    if (KEY_TO_INDEX[e.key] !== undefined) {
      const def = screenDefs[KEY_TO_INDEX[e.key]];
      if (def) { onSwitch(def.id); hideOverlay(); }
    } else if (e.code === 'Space') {
      e.preventDefault();
      if (engine.sourceMode === 'none') { app.showToast('Load a track or enable the mic first'); return; }
      if (engine.isPlaying) engine.pause(); else engine.play();
      syncPlayBtn();
    } else if (e.key.toLowerCase() === 's') {
      overlay.classList.contains('hidden') ? showOverlay() : hideOverlay();
    } else if (e.key === 'Escape' && !overlay.classList.contains('hidden')) {
      hideOverlay();
    } else if (e.key.toLowerCase() === 'f') {
      toggleFullscreen();
    }
  });

  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen();
  }

  // --- Mobile touch gestures (touch/coarse pointers only) ---
  // Horizontal swipe: switch to next/previous screen · Swipe up: open picker ·
  // Pull down from the top edge: refresh the page.
  if (window.matchMedia('(pointer: coarse)').matches) setupGestures();

  function setupGestures() {
    // Elements whose own touch handling must never trigger a gesture.
    const GESTURE_GUARD = 'header, #gui-host, #picker-overlay, #drop-overlay, #toasts, .lil-gui, .mandelbrot-map, button, select, input, a, kbd';
    let swipeStart = null;
    let pullStart = null;
    let pullArmed = false;

    // Pull-to-refresh indicator
    const ptr = document.createElement('div');
    ptr.id = 'ptr-indicator';
    ptr.textContent = '↻ Release to refresh';
    document.body.appendChild(ptr);

    window.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 1) { swipeStart = null; pullStart = null; return; }
      const t = e.touches[0];
      // Pull-down refresh: only when the touch starts near the top edge.
      if (window.scrollY <= 0 && t.clientY < 90) {
        pullStart = { y: t.clientY };
        pullArmed = false;
      } else {
        pullStart = null;
      }
      if (t.target.closest(GESTURE_GUARD)) { swipeStart = null; return; }
      swipeStart = { x: t.clientX, y: t.clientY, t: Date.now() };
    }, { passive: true });

    window.addEventListener('touchmove', (e) => {
      if (!pullStart) return;
      const dy = e.touches[0].clientY - pullStart.y;
      if (dy <= 0) { ptr.style.opacity = '0'; pullArmed = false; return; }
      const p = Math.max(0, Math.min(1, dy / 110));
      pullArmed = p >= 1;
      ptr.classList.toggle('armed', pullArmed);
      ptr.textContent = pullArmed ? '↻ Release to refresh' : '↻ Pull down to refresh';
      ptr.style.opacity = String(0.35 + p * 0.65);
      ptr.style.transform = `translateX(-50%) translateY(${Math.min(52, dy * 0.4)}px)`;
    }, { passive: true });

    window.addEventListener('touchend', (e) => {
      if (pullStart) {
        ptr.style.opacity = '0';
        ptr.style.transform = 'translateX(-50%)';
        const armed = pullArmed;
        pullStart = null;
        pullArmed = false;
        if (armed) { location.reload(); return; }
      }
      if (!swipeStart) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - swipeStart.x;
      const dy = t.clientY - swipeStart.y;
      const dt = Date.now() - swipeStart.t;
      swipeStart = null;
      if (dt > 900) return; // too slow — probably a drag, not a swipe
      const adx = Math.abs(dx);
      const ady = Math.abs(dy);
      if (adx > 64 && adx > ady * 1.6) {
        // Horizontal swipe → next / previous screen (wraps around)
        const curId = getCurrentDef ? getCurrentDef()?.id : null;
        const curIdx = screenDefs.findIndex((d) => d.id === curId);
        if (curIdx === -1) return;
        const def = screenDefs[(curIdx + (dx < 0 ? 1 : -1) + screenDefs.length) % screenDefs.length];
        onSwitch(def.id);
        app.showToast(def.name);
      } else if (dy < -80 && ady > adx * 1.6) {
        // Swipe up → open the screen picker
        showOverlay();
      }
    }, { passive: true });
  }

  // Auto-fade hint bar
  setTimeout(() => $('hint-bar').classList.add('fade'), 9000);
}
