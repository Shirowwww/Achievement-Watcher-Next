'use strict';

/*
  The app's own colour picker. Chromium's native one is a Windows-looking popup that ignores the
  theme, so every <input type="color"> on the page opens this panel instead: the input stays the
  value holder and still fires `input` while the colour moves and `change` once it is settled, so
  the code reading those inputs needs no change. Plain DOM on purpose: the overlay page has no jQuery.
*/
(function (window, document) {
  const RECENT_KEY = 'aw-color-recent';
  const RECENT_MAX = 8;
  const POPOVER_GAP = 8;
  const KEY_STEP = 2;
  // Half the thumb: its centre travels inside the area by this much, so the ring never spills out.
  const THUMB_INSET = 8;
  const travel = (size) => Math.max(1, size - THUMB_INSET * 2);

  // app.js declares `t` with const: a shared global, but not a property of window. The overlay page has none.
  const localeText = (key, en, fr) => (typeof t === 'function' ? t(key, en, fr) : en);

  function normalizeHex(value) {
    const text = String(value || '').trim().replace(/^#?/, '#').toLowerCase();
    if (/^#[0-9a-f]{6}$/.test(text)) return text;
    if (/^#[0-9a-f]{3}$/.test(text)) return `#${text.slice(1).split('').map((c) => c + c).join('')}`;
    return null;
  }

  function hexToHsv(hex) {
    const n = parseInt(hex.slice(1), 16);
    const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => c / 255);
    const max = Math.max(r, g, b);
    const delta = max - Math.min(r, g, b);
    let h = 0;
    if (delta) {
      if (max === r) h = ((g - b) / delta) % 6;
      else if (max === g) h = (b - r) / delta + 2;
      else h = (r - g) / delta + 4;
    }
    return { h: (h * 60 + 360) % 360, s: max ? (delta / max) * 100 : 0, v: max * 100 };
  }

  function hsvToHex({ h, s, v }) {
    const f = (n) => {
      const k = (n + h / 60) % 6;
      const c = (v / 100) * (1 - (s / 100) * Math.max(0, Math.min(k, 4 - k, 1)));
      return Math.round(c * 255).toString(16).padStart(2, '0');
    };
    return `#${f(5)}${f(3)}${f(1)}`;
  }

  // Per-viewer convenience only: a cleared or blocked storage just means no recent row.
  function readRecent() {
    try {
      const list = JSON.parse(window.localStorage.getItem(RECENT_KEY) || '[]');
      return Array.isArray(list) ? list.map(normalizeHex).filter(Boolean).slice(0, RECENT_MAX) : [];
    } catch {
      return [];
    }
  }

  function rememberRecent(hex) {
    try {
      const next = [hex, ...readRecent().filter((c) => c !== hex)].slice(0, RECENT_MAX);
      window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    } catch {
      /* storage unavailable: nothing to remember */
    }
  }

  function element(tag, className, attrs = {}) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
    return node;
  }

  function buildPanel() {
    const panel = element('div', 'aw-color-popover', { role: 'dialog', 'aria-label': localeText('color-picker', 'Colour', 'Couleur') });
    const area = element('div', 'aw-color-area', { role: 'slider', tabindex: '0', 'aria-label': localeText('color-picker-shade', 'Shade', 'Nuance') });
    const thumb = element('span', 'aw-color-thumb');
    area.append(thumb);
    const hue = element('input', 'aw-color-hue', { type: 'range', min: '0', max: '359', step: '1', 'aria-label': localeText('color-picker-hue', 'Hue', 'Teinte') });
    const row = element('div', 'aw-color-row');
    const preview = element('span', 'aw-color-preview');
    const hex = element('input', 'aw-color-hex', { type: 'text', maxlength: '7', spellcheck: 'false', 'aria-label': localeText('color-picker-code', 'Colour code', 'Code couleur') });
    row.append(preview, hex);
    if (typeof window.EyeDropper === 'function') {
      const dropper = element('button', 'aw-color-dropper', { type: 'button', title: localeText('color-picker-eyedropper', 'Pick a colour on screen', "Prendre une couleur à l'écran") });
      // Inline, because the overlay page does not load the icon font.
      dropper.innerHTML =
        '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path fill="currentColor" d="M19.4 2.6a2.8 2.8 0 0 0-4 0l-2.3 2.3-1-1-1.4 1.4 1.1 1.1-7.2 7.2a2 2 0 0 0-.5.9l-.9 3.6-1.2 1.2 1.4 1.4 1.2-1.2 3.6-.9a2 2 0 0 0 .9-.5l7.2-7.2 1.1 1.1 1.4-1.4-1-1 2.3-2.3a2.8 2.8 0 0 0 0-4zM7.6 17.9l-2.4.6.6-2.4 7.1-7.1 1.8 1.8z"/></svg>';
      row.append(dropper);
    }
    const recent = element('div', 'aw-color-recent');
    panel.append(area, hue, row, recent);
    return { panel, area, thumb, hue, preview, hex, recent, dropper: panel.querySelector('.aw-color-dropper') };
  }

  // Below the anchor, above it when the window has no room; the panel grows from the anchor.
  function place(panel, anchor) {
    const rect = anchor.getBoundingClientRect();
    const width = panel.offsetWidth;
    const height = panel.offsetHeight;
    const below = rect.bottom + POPOVER_GAP + height <= window.innerHeight;
    const top = below ? rect.bottom + POPOVER_GAP : Math.max(POPOVER_GAP, rect.top - POPOVER_GAP - height);
    const left = Math.min(Math.max(POPOVER_GAP, rect.left + rect.width / 2 - width / 2), window.innerWidth - width - POPOVER_GAP);
    panel.style.top = `${Math.round(top)}px`;
    panel.style.left = `${Math.round(left)}px`;
    panel.style.transformOrigin = `${Math.round(rect.left + rect.width / 2 - left)}px ${below ? 0 : height}px`;
  }

  let openState = null;

  function close({ commit = true } = {}) {
    const state = openState;
    if (!state) return;
    openState = null;
    document.removeEventListener('mousedown', state.onOutside, true);
    window.removeEventListener('blur', state.onBlur);
    if (!commit && state.value !== state.initial) state.emit(state.initial, 'input');
    const settled = commit ? state.value : state.initial;
    if (settled !== state.initial) {
      rememberRecent(settled);
      state.emit(settled, 'change');
    }
    state.panel.classList.add('is-closing');
    setTimeout(() => state.panel.remove(), 110);
    if (state.anchor.isConnected) state.anchor.focus({ preventScroll: true });
  }

  function paint(state, { fromHex = false } = {}) {
    const { ui, hsv } = state;
    ui.area.style.backgroundColor = `hsl(${hsv.h}, 100%, 50%)`;
    const x = THUMB_INSET + (hsv.s / 100) * travel(ui.area.clientWidth);
    const y = THUMB_INSET + (1 - hsv.v / 100) * travel(ui.area.clientHeight);
    ui.thumb.style.transform = `translate(${x}px, ${y}px)`;
    ui.thumb.style.backgroundColor = state.value;
    ui.hue.value = String(Math.round(hsv.h));
    ui.preview.style.backgroundColor = state.value;
    ui.area.setAttribute('aria-valuetext', state.value);
    if (!fromHex) ui.hex.value = state.value;
  }

  function setHsv(state, hsv, options) {
    state.hsv = hsv;
    state.value = hsvToHex(hsv);
    paint(state, options);
    state.emit(state.value, 'input');
  }

  function setHex(state, value, options) {
    const hex = normalizeHex(value);
    if (!hex) return false;
    // A grey has no hue of its own: keep the slider where it was rather than snapping it to red.
    const next = hexToHsv(hex);
    state.hsv = next.s ? next : { ...next, h: state.hsv.h };
    state.value = hex;
    paint(state, options);
    state.emit(hex, 'input');
    return true;
  }

  function bindArea(state) {
    const { area } = state.ui;
    const pick = (event) => {
      const rect = area.getBoundingClientRect();
      const s = Math.min(100, Math.max(0, ((event.clientX - rect.left - THUMB_INSET) / travel(rect.width)) * 100));
      const v = Math.min(100, Math.max(0, (1 - (event.clientY - rect.top - THUMB_INSET) / travel(rect.height)) * 100));
      setHsv(state, { ...state.hsv, s, v });
    };
    area.addEventListener('pointerdown', (event) => {
      area.setPointerCapture(event.pointerId);
      area.classList.add('is-dragging');
      pick(event);
      const move = (e) => pick(e);
      const up = () => {
        area.classList.remove('is-dragging');
        area.removeEventListener('pointermove', move);
        area.removeEventListener('pointerup', up);
      };
      area.addEventListener('pointermove', move);
      area.addEventListener('pointerup', up);
    });
    area.addEventListener('keydown', (event) => {
      const step = event.shiftKey ? KEY_STEP * 5 : KEY_STEP;
      const moves = { ArrowLeft: ['s', -step], ArrowRight: ['s', step], ArrowUp: ['v', step], ArrowDown: ['v', -step] };
      const move = moves[event.key];
      if (!move) return;
      event.preventDefault();
      const [axis, delta] = move;
      setHsv(state, { ...state.hsv, [axis]: Math.min(100, Math.max(0, state.hsv[axis] + delta)) });
    });
  }

  function bindControls(state) {
    const { ui } = state;
    ui.hue.addEventListener('input', () => setHsv(state, { ...state.hsv, h: Number(ui.hue.value) }));
    ui.hex.addEventListener('input', () => {
      const valid = setHex(state, ui.hex.value, { fromHex: true });
      ui.hex.classList.toggle('is-invalid', !valid && ui.hex.value.trim().length > 0);
    });
    ui.hex.addEventListener('blur', () => {
      ui.hex.value = state.value;
      ui.hex.classList.remove('is-invalid');
    });
    ui.recent.addEventListener('click', (event) => {
      const swatch = event.target.closest('.aw-color-swatch');
      if (swatch) setHex(state, swatch.dataset.color);
    });
    if (ui.dropper) {
      ui.dropper.addEventListener('click', async () => {
        try {
          const result = await new window.EyeDropper().open();
          if (openState === state) setHex(state, result.sRGBHex);
        } catch {
          /* cancelled with Escape: keep the current colour */
        }
      });
    }
    state.panel.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        close({ commit: false });
      } else if (event.key === 'Enter') {
        event.preventDefault();
        event.stopPropagation();
        close();
      }
    });
  }

  function renderRecent(state) {
    const colors = readRecent();
    state.ui.recent.hidden = colors.length === 0;
    for (const color of colors) {
      const swatch = element('button', 'aw-color-swatch', { type: 'button', 'data-color': color, title: color, 'aria-label': color });
      swatch.style.backgroundColor = color;
      state.ui.recent.append(swatch);
    }
  }

  /*
    anchor: the element the panel grows from. value: the starting #rrggbb. onInput/onChange: called
    with the hex while it moves and once it is settled (Escape restores the start and reports it).
  */
  function open(anchor, { value, onInput = () => {}, onChange = () => {} } = {}) {
    if (openState) close();
    const initial = normalizeHex(value) || '#ffffff';
    const ui = buildPanel();
    const state = {
      anchor,
      ui,
      panel: ui.panel,
      initial,
      value: initial,
      hsv: hexToHsv(initial),
      emit: (hex, kind) => (kind === 'change' ? onChange(hex) : onInput(hex)),
    };
    state.onOutside = (event) => {
      if (!state.panel.contains(event.target) && event.target !== anchor) close();
    };
    state.onBlur = () => close();
    document.body.append(state.panel);
    renderRecent(state);
    place(state.panel, anchor);
    paint(state);
    bindArea(state);
    bindControls(state);
    openState = state;
    document.addEventListener('mousedown', state.onOutside, true);
    window.addEventListener('blur', state.onBlur);
    ui.area.focus({ preventScroll: true });
    return state.panel;
  }

  // The input keeps its value and its events: what it fired with the native picker, it fires here.
  function openForInput(input) {
    const fire = (type) => input.dispatchEvent(new Event(type, { bubbles: true }));
    open(input, {
      value: input.value,
      onInput: (hex) => {
        input.value = hex;
        fire('input');
      },
      onChange: (hex) => {
        input.value = hex;
        fire('change');
      },
    });
  }

  document.addEventListener(
    'click',
    (event) => {
      const input = event.target && event.target.closest ? event.target.closest('input[type="color"]') : null;
      if (!input || input.disabled) return;
      event.preventDefault();
      if (openState && openState.anchor === input) close();
      else openForInput(input);
    },
    true
  );

  window.awColorPicker = { open, close, normalizeHex, hexToHsv, hsvToHex };
})(window, document);
