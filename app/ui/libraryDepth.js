'use strict';

/*
  Depth in the library grid. The tile under the mouse leans a few degrees, pressed where the pointer
  is, and the window behind the library takes on the cover of the game under the mouse or the
  controller. Both read only what is already on screen (the tile's box, its cover), so a hover never
  loads anything. Each one is turned off by a class on #game-list (util/libraryChrome.js).
*/
(function (root) {
  const MAX_TILT_DEG = 5;
  const TILT_OFF = 'no-tile-tilt';
  const AMBIENT_OFF = 'no-library-ambient';
  // Rows are wide and flat: leaning one reads as a glitch, not depth.
  const FLAT_VIEWS = ['view-list', 'view-details'];
  // A pointer crossing the grid does not flash every cover it passes over...
  const AMBIENT_INTENT_MS = 120;
  // ...and the gap between two tiles is not "left the library".
  const AMBIENT_LINGER_MS = 240;
  // Drawn this small and stretched by the compositor: a soft field of the cover's colours, with no
  // blur filter to re-run behind a scrolling grid.
  const AMBIENT_WIDTH = 64;
  const AMBIENT_BLUR_PX = 2;

  const round = (value) => Math.round(value * 100) / 100 || 0;
  const clampUnit = (value) => Math.max(-1, Math.min(1, value));

  // Degrees for rotateX/rotateY that press the edge under (x, y) away from the viewer.
  function tiltFor(rect, x, y, max = MAX_TILT_DEG) {
    if (!rect || !(rect.width > 0) || !(rect.height > 0)) return { x: 0, y: 0 };
    const across = clampUnit(((x - rect.left) / rect.width) * 2 - 1);
    const down = clampUnit(((y - rect.top) / rect.height) * 2 - 1);
    return { x: round(-down * max), y: round(across * max) };
  }

  function coverUrlOf(backgroundImage) {
    const match = /url\(\s*(['"]?)(.*?)\1\s*\)/.exec(String(backgroundImage || ''));
    return match && match[2] ? match[2] : null;
  }

  function tileCover(tile) {
    const header = tile && tile.querySelector('.header');
    if (!header || header.classList.contains('artwork-missing') || header.classList.contains('artwork-error')) return null;
    return coverUrlOf(header.style.backgroundImage);
  }

  function attach({ list, home, ambient }) {
    if (!list || !home || !ambient) return null;
    const reducedMotion = root.matchMedia('(prefers-reduced-motion: reduce)');
    const layers = [...ambient.querySelectorAll('canvas')];
    let tile = null;
    let bounds = null;
    let pointer = null;
    let frame = 0;

    const tiltAllowed = () =>
      !reducedMotion.matches && !list.classList.contains(TILT_OFF) && !FLAT_VIEWS.some((name) => list.classList.contains(name));

    function release() {
      if (frame) root.cancelAnimationFrame(frame);
      frame = 0;
      pointer = null;
      if (tile) {
        tile.classList.remove('is-tilting');
        tile.style.removeProperty('--tilt-x');
        tile.style.removeProperty('--tilt-y');
      }
      tile = null;
      bounds = null;
    }

    function paint() {
      frame = 0;
      if (!tile || !pointer || !tile.isConnected || !tiltAllowed()) return release();
      // Settings > Appearance sets the strength on the list (data-tilt-deg).
      const angle = tiltFor(bounds, pointer.x, pointer.y, Number(list.dataset.tiltDeg) || MAX_TILT_DEG);
      tile.style.setProperty('--tilt-x', `${angle.x}deg`);
      tile.style.setProperty('--tilt-y', `${angle.y}deg`);
      tile.classList.add('is-tilting');
    }

    // Two canvases take turns, so a new cover fades in over the last one instead of after a gap.
    let shown = -1;
    let ticket = 0;
    // The cover asked for, and the one actually on screen: they differ while a draw is pending.
    let wanted = null;
    let drawn = null;
    let intentTimer = 0;
    let lingerTimer = 0;

    function hideAmbient() {
      ticket++;
      wanted = null;
      drawn = null;
      clearTimeout(intentTimer);
      clearTimeout(lingerTimer);
      home.classList.remove('has-ambient');
    }

    async function drawCover(url, own) {
      const image = new Image();
      image.decoding = 'async';
      image.src = url;
      await image.decode();
      if (own !== ticket || !image.naturalWidth || !image.naturalHeight) return;
      const next = shown === 0 ? 1 : 0;
      const canvas = layers[next];
      canvas.width = AMBIENT_WIDTH;
      canvas.height = Math.max(1, Math.round((AMBIENT_WIDTH * image.naturalHeight) / image.naturalWidth));
      const context = canvas.getContext('2d');
      context.filter = `blur(${AMBIENT_BLUR_PX}px)`;
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      layers.forEach((layer, index) => layer.classList.toggle('is-shown', index === next));
      shown = next;
      drawn = url;
      home.classList.add('has-ambient');
    }

    function showAmbientFor(target) {
      clearTimeout(lingerTimer);
      if (list.classList.contains(AMBIENT_OFF) || layers.length < 2) return hideAmbient();
      const url = tileCover(target);
      if (!url) return hideAmbient();
      if (url === wanted) return;
      wanted = url;
      clearTimeout(intentTimer);
      const own = ++ticket;
      intentTimer = setTimeout(() => {
        drawCover(url, own).catch(() => {
          if (own === ticket) hideAmbient();
        });
      }, AMBIENT_INTENT_MS);
    }

    function leaveAmbient() {
      // A draw that had not started yet is dropped, so coming back to that tile asks for it again.
      ticket++;
      wanted = drawn;
      clearTimeout(intentTimer);
      clearTimeout(lingerTimer);
      lingerTimer = setTimeout(hideAmbient, AMBIENT_LINGER_MS);
    }

    const tileAt = (node) => {
      const found = node && node.closest ? node.closest('.game-box') : null;
      return found && !found.classList.contains('skeleton') && list.contains(found) ? found : null;
    };

    let hovered = null;
    list.addEventListener(
      'pointermove',
      (event) => {
        if (event.pointerType !== 'mouse') return;
        const next = tileAt(event.target);
        if (next !== hovered) {
          hovered = next;
          release();
          if (next) showAmbientFor(next);
          else leaveAmbient();
        }
        // A held button keeps the tile still, so a click lands where it was aimed.
        if (!next || event.buttons || !tiltAllowed()) return;
        if (!tile) {
          tile = next;
          bounds = next.getBoundingClientRect();
        }
        pointer = { x: event.clientX, y: event.clientY };
        if (!frame) frame = root.requestAnimationFrame(paint);
      },
      { passive: true }
    );
    list.addEventListener('pointerleave', () => {
      hovered = null;
      release();
      leaveAmbient();
    });
    // The tiles move under a still pointer; the next move takes the new tile's box.
    list.addEventListener('scroll', release, { passive: true });
    // A press straightens the tile so its own press feedback shows; the next move leans it again.
    list.addEventListener('pointerdown', release);
    // Keyboard and controller focus land on a tile too: the background follows them.
    list.addEventListener('focusin', (event) => {
      const focused = tileAt(event.target);
      if (focused) showAmbientFor(focused);
    });
    list.addEventListener('focusout', (event) => {
      if (!list.contains(event.relatedTarget)) leaveAmbient();
    });
    // Opening a game swaps the whole view; its own page background takes over at once.
    list.addEventListener('click', (event) => {
      if (tileAt(event.target) && !event.target.closest('.play-button')) {
        release();
        hideAmbient();
      }
    });
    root.addEventListener('blur', release);
    reducedMotion.addEventListener('change', release);
    // A setting or a view switch applied while hovering takes effect at once.
    new MutationObserver(() => {
      if (!tiltAllowed()) release();
      if (list.classList.contains(AMBIENT_OFF)) hideAmbient();
    }).observe(list, { attributes: true, attributeFilter: ['class'] });

    return { release, hideAmbient };
  }

  const api = { tiltFor, coverUrlOf, attach, MAX_TILT_DEG };
  root.awLibraryDepth = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;

  if (typeof document !== 'undefined' && root.matchMedia) {
    const start = () =>
      attach({
        list: document.getElementById('game-list'),
        home: document.getElementById('home'),
        ambient: document.getElementById('library-ambient'),
      });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
    else start();
  }
})(typeof window !== 'undefined' ? window : globalThis);
