'use strict';

/*
  When an overlay popup can be photographed. A preset's render-ready call only says its payload is
  in place, and most presets send it as their entry animation starts, so the page is then measured
  until its visible text and pictures stop moving.
*/

// How long a preset may take to send its own call; past that the page is examined anyway.
const SIGNAL_WAIT_MS = 4000;
// How long the page may keep moving once examined: one that never settles is shot as it is.
const SETTLE_LIMIT_MS = 3000;

/*
  Runs inside the popup page (serialised by watchPaint), so it must not close over anything. What
  is on screen is measured rather than read from keyframes: an implicit keyframe reports the base
  style, not the value it really starts from, and a slow background drift never moves the text.
*/
function settleProbe(limitMs) {
  const STABLE_CHECKS = 3;
  const STEP_MS = 40;
  // A delayed animation starting this soon is an entry still to come, not an exit planned for later.
  const IMMINENT_MS = 400;

  const opacityOf = (element) => {
    let value = 1;
    for (let node = element; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden') return 0;
      value *= Number(style.opacity);
    }
    return value;
  };

  // The part of the element its clipping ancestors and the window leave visible.
  const visibleBox = (element) => {
    let { left, top, right, bottom } = element.getBoundingClientRect();
    for (let node = element.parentElement; node && node !== document.documentElement; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.overflowX === 'visible' && style.overflowY === 'visible' && style.clipPath === 'none') continue;
      const clip = node.getBoundingClientRect();
      left = Math.max(left, clip.left);
      top = Math.max(top, clip.top);
      right = Math.min(right, clip.right);
      bottom = Math.min(bottom, clip.bottom);
    }
    return [Math.max(left, 0), Math.max(top, 0), Math.min(right, innerWidth), Math.min(bottom, innerHeight)];
  };

  // Text scrolled by a marquee, or anything under an endless glow, moves on purpose and forever.
  const animatesForever = (element) => {
    for (let node = element; node; node = node.parentElement) {
      if (node.getAnimations().some((animation) => animation.playState === 'running' && animation.effect && animation.effect.getComputedTiming().iterations === Infinity)) return true;
    }
    return false;
  };

  const textElements = () => {
    const found = new Set();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const element = node.parentElement;
      if (node.nodeValue.trim() && element && !element.closest('script,style,template')) found.add(element);
    }
    return [...found];
  };

  const fingerprint = (element) => {
    const opacity = opacityOf(element);
    if (opacity < 0.05) return '';
    const [left, top, right, bottom] = visibleBox(element);
    if (right - left < 1 || bottom - top < 1) return '';
    const shade = opacity.toFixed(2);
    return animatesForever(element) ? shade : [left, top, right, bottom].map((value) => Math.round(value * 2)).join(',') + ':' + shade;
  };

  // Null while no text is visible: an empty card is never what the souvenir is for.
  const snapshot = () => {
    const text = textElements().map(fingerprint).filter(Boolean);
    if (text.length === 0) return null;
    return text.concat([...document.images].map(fingerprint).filter(Boolean)).join('|');
  };

  const imminent = () =>
    document.getAnimations().some((animation) => {
      if (animation.playState !== 'running' || !animation.effect) return false;
      const local = Number(animation.currentTime) - (Number(animation.effect.getTiming().delay) || 0);
      return local < 0 && -local < IMMINENT_MS;
    });

  // A web font still on its way swaps in later and moves every line of text it reaches.
  const fontsLoading = () => document.fonts && document.fonts.status === 'loading';

  return new Promise((resolve) => {
    const started = performance.now();
    let previous = null;
    let stable = 0;
    const check = () => {
      const current = snapshot();
      stable = current !== null && current === previous && !imminent() && !fontsLoading() ? stable + 1 : 0;
      previous = current;
      if (stable >= STABLE_CHECKS) return resolve('settled');
      if (performance.now() - started >= limitMs) return resolve('limit');
      setTimeout(check, STEP_MS);
    };
    check();
  });
}

function probeSource(limitMs = SETTLE_LIMIT_MS) {
  return `(${settleProbe.toString()})(${Number(limitMs) || SETTLE_LIMIT_MS})`;
}

// Calls report(reason) exactly once: when the popup has settled, or when it can no longer.
function watchPaint({ win, ipcMain, report, signalWaitMs = SIGNAL_WAIT_MS, settleLimitMs = SETTLE_LIMIT_MS }) {
  const contents = win.webContents;
  let finished = false;
  let examining = false;
  let signalTimer = null;
  const finish = (reason) => {
    if (finished) return;
    finished = true;
    clearTimeout(signalTimer);
    ipcMain.removeListener('notification-render-ready', onSignal);
    report(reason);
  };
  const examine = (cause) => {
    if (examining || finished) return;
    examining = true;
    clearTimeout(signalTimer);
    if (win.isDestroyed()) return finish('closed');
    contents.executeJavaScript(probeSource(settleLimitMs), true).then(
      (state) => finish(`${cause}:${state}`),
      () => finish(`${cause}:probe-failed`)
    );
  };
  function onSignal(event) {
    if (event && event.sender === contents) examine('preset');
  }
  ipcMain.on('notification-render-ready', onSignal);
  win.once('closed', () => finish('closed'));
  contents.once('did-finish-load', () => {
    signalTimer = setTimeout(() => examine('no-signal'), signalWaitMs);
  });
  contents.once('did-fail-load', () => finish('load-failed'));
}

module.exports = { watchPaint, probeSource };
