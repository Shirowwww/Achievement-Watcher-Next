'use strict';

/*
  The viewer for an achievement's screenshots and clips, shared by the main window and the in-game
  overlay (which is sandboxed: this file requires nothing). The host passes the files, the strings
  and how to format a date; a gamepad drives it through command().
*/
(function () {
  let current = null;

  const el = (tag, className, attrs = {}) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    return node;
  };

  // Stroked 24-unit paths, drawn as SVG so they sit at the exact centre of their button.
  const ICONS = {
    close: 'M6 6l12 12M18 6L6 18',
    prev: 'M14.5 6l-6 6 6 6',
    next: 'M9.5 6l6 6-6 6',
    folder: 'M3.5 7.5A1.5 1.5 0 0 1 5 6h4l2 2h8a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5z',
  };

  function icon(name) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('class', 'capture-viewer-icon');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', ICONS[name]);
    svg.append(path);
    return svg;
  }

  function iconButton(className, label, name) {
    const button = el('button', `capture-viewer-button ${className}`, { type: 'button', 'aria-label': label, title: label });
    button.append(icon(name));
    return button;
  }

  function fill(template, values) {
    return String(template || '').replace(/\{(\w+)\}/g, (match, key) => (key in values ? String(values[key]) : match));
  }

  function release(view) {
    const video = view.stage.querySelector('video');
    if (video) {
      video.pause();
      video.removeAttribute('src');
      video.load();
    }
    const image = view.stage.querySelector('img');
    if (image) image.removeAttribute('src');
    view.stage.replaceChildren();
  }

  function show(view, index) {
    const { items, strings } = view.options;
    view.index = (index + items.length) % items.length;
    const item = items[view.index];
    release(view);
    view.status.textContent = '';
    view.stage.classList.remove('is-broken');
    const failed = () => {
      // A file left behind by browsing on may still fail; it no longer speaks for the stage.
      if (!view.stage.contains(media)) return;
      view.stage.classList.add('is-broken');
      view.status.textContent = strings.unavailable || '';
    };
    let media;
    if (item.kind === 'clip') {
      // A clip has no size until its first frame is known: a 16:9 box as large as the window allows
      // holds its place till then, so the card does not open at the browser's 300x150 default. A
      // store trailer (HLS) starts on its smallest rendition and grows: it keeps that box for good.
      media = el('video', 'capture-viewer-media is-sizing', { controls: '', preload: 'metadata', playsinline: '' });
      if (!/\.m3u8(?:[?#]|$)/i.test(String(item.url))) media.addEventListener('loadedmetadata', () => media.classList.remove('is-sizing'), { once: true });
      media.addEventListener('error', failed, { once: true });
    } else {
      media = el('img', 'capture-viewer-media', { alt: item.name || '', decoding: 'async' });
      media.addEventListener('error', failed, { once: true });
    }
    media.src = item.url;
    view.stage.append(media);
    view.caption.textContent = item.name || '';
    const when = typeof view.options.formatDate === 'function' && item.at ? view.options.formatDate(item.at) : '';
    view.subtitle.textContent = [view.options.subtitle, when].filter(Boolean).join(' · ');
    const several = items.length > 1;
    view.prev.hidden = !several;
    view.next.hidden = !several;
    view.count.hidden = !several;
    view.count.textContent = several ? fill(strings.count || '{current} / {total}', { current: view.index + 1, total: items.length }) : '';
  }

  function focusables(view) {
    return Array.from(view.root.querySelectorAll('button, video')).filter((node) => !node.hidden && node.getClientRects().length > 0);
  }

  function onKey(event) {
    const view = current;
    if (!view) return;
    const typing = event.target && event.target.matches && event.target.matches('input, textarea, select');
    if (event.key === 'Escape') close();
    else if (event.key === 'ArrowLeft' && !typing) show(view, view.index - 1);
    else if (event.key === 'ArrowRight' && !typing) show(view, view.index + 1);
    else if (event.key === 'Tab') {
      const items = focusables(view);
      const at = items.indexOf(document.activeElement);
      const next = items[(at + (event.shiftKey ? -1 : 1) + items.length) % items.length];
      if (next) next.focus();
    } else return;
    event.preventDefault();
    event.stopPropagation();
  }

  function open(options) {
    if (!options || !Array.isArray(options.items) || options.items.length === 0) return false;
    close();
    const strings = options.strings || {};
    const root = el('div', 'capture-viewer', { role: 'dialog', 'aria-modal': 'true', 'aria-label': options.title || '' });
    if (options.inset) root.style.setProperty('--capture-viewer-inset', `${Number(options.inset) || 0}px`);
    const card = el('div', 'capture-viewer-card');
    const head = el('div', 'capture-viewer-head');
    const titles = el('div', 'capture-viewer-titles');
    const title = el('div', 'capture-viewer-title');
    title.textContent = options.title || '';
    const subtitle = el('div', 'capture-viewer-subtitle');
    titles.append(title, subtitle);
    const actions = el('div', 'capture-viewer-actions');
    const count = el('div', 'capture-viewer-count', { 'aria-live': 'polite' });
    const reveal = typeof options.onReveal === 'function' && strings.reveal ? iconButton('is-folder', strings.reveal, 'folder') : null;
    const closeButton = iconButton('is-close', strings.close || 'Close', 'close');
    actions.append(...[count, reveal, closeButton].filter(Boolean));
    head.append(titles, actions);

    const stage = el('div', 'capture-viewer-stage');
    const prev = iconButton('is-prev', strings.previous || 'Previous', 'prev');
    const next = iconButton('is-next', strings.next || 'Next', 'next');
    const frame = el('div', 'capture-viewer-frame');
    frame.append(stage, prev, next);

    const foot = el('div', 'capture-viewer-foot');
    const caption = el('div', 'capture-viewer-caption');
    const status = el('div', 'capture-viewer-status', { role: 'status' });
    foot.append(caption, status);

    card.append(head, frame, foot);
    root.append(card);
    document.body.append(root);

    const view = { root, stage, prev, next, caption, subtitle, status, count, options, index: 0, opener: document.activeElement };
    current = view;
    closeButton.addEventListener('click', close);
    prev.addEventListener('click', () => show(view, view.index - 1));
    next.addEventListener('click', () => show(view, view.index + 1));
    if (reveal) reveal.addEventListener('click', () => options.onReveal(options.items[view.index]));
    root.addEventListener('pointerdown', (event) => {
      if (event.target === root) close();
    });
    document.addEventListener('keydown', onKey, true);
    show(view, Number(options.index) || 0);
    closeButton.focus({ preventScroll: true });
    return true;
  }

  function close() {
    const view = current;
    if (!view) return;
    current = null;
    document.removeEventListener('keydown', onKey, true);
    release(view);
    view.root.classList.add('is-closing');
    setTimeout(() => view.root.remove(), 140);
    if (view.options.onClose) view.options.onClose();
    if (view.opener && view.opener.isConnected && typeof view.opener.focus === 'function') view.opener.focus({ preventScroll: true });
  }

  // For a gamepad: 'prev', 'next', 'toggle' (play or pause a clip) and 'close'.
  function command(name) {
    const view = current;
    if (!view) return false;
    if (name === 'close') close();
    else if (name === 'prev') show(view, view.index - 1);
    else if (name === 'next') show(view, view.index + 1);
    else if (name === 'toggle') {
      const video = view.stage.querySelector('video');
      if (video) {
        if (video.paused) video.play().catch(() => {});
        else video.pause();
      }
    } else return false;
    return true;
  }

  window.CaptureViewer = { open, close, command, isOpen: () => current !== null };
})();
