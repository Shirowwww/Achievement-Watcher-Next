'use strict';

/*
  The preset gallery: every preset as a picture of its card, to choose one by its look rather than
  by its name in a menu. The pictures are the offscreen snapshots the main process already renders
  for the designer, a few at a time, and are kept for the session (forget() drops a stale one).
*/

const SNAPSHOTS_AT_ONCE = 3;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function icon(name) {
  const node = el('i', `fas ${name}`);
  node.setAttribute('aria-hidden', 'true');
  return node;
}

/**
 * @param {object} options
 * @param {(key: string) => string} options.label  a word of the gallery's, by its key
 * @param {(name: string) => Promise<{image: string}|null>} options.snapshot  a picture of that preset
 */
function createPresetGallery({ label, snapshot }) {
  const pictures = new Map();
  let open = null;

  // A failed picture is not kept: the next opening asks again rather than showing a gap for good.
  function picture(name) {
    if (!pictures.has(name)) {
      const pending = Promise.resolve()
        .then(() => snapshot(name))
        .catch(() => null)
        .then((shot) => {
          if ((!shot || !shot.image) && pictures.get(name) === pending) pictures.delete(name);
          return shot;
        });
      pictures.set(name, pending);
    }
    return pictures.get(name);
  }

  function showPicture(tile, shot) {
    const frame = tile.querySelector('.pg-picture');
    frame.classList.remove('is-loading');
    if (!shot || !shot.image) {
      frame.classList.add('is-missing');
      frame.replaceChildren(icon('fa-image'));
      return;
    }
    const img = el('img');
    img.alt = '';
    img.src = shot.image;
    frame.replaceChildren(img);
  }

  // In the order the tiles are listed; a closed gallery stops asking for more.
  async function fill(tiles, session) {
    const queue = [...tiles];
    const worker = async () => {
      while (queue.length && open === session) {
        const tile = queue.shift();
        const shot = await picture(tile.dataset.name);
        if (open === session) showPicture(tile, shot);
      }
    };
    await Promise.all(Array.from({ length: SNAPSHOTS_AT_ONCE }, worker));
  }

  function tileFor(name, current, pick) {
    const tile = el('button', name === current ? 'pg-tile is-on' : 'pg-tile');
    tile.type = 'button';
    tile.dataset.name = name;
    if (name === current) tile.setAttribute('aria-current', 'true');
    const frame = el('span', 'pg-picture is-loading');
    const caption = el('span', 'pg-name');
    caption.append(el('span', '', name));
    if (name === current) caption.append(icon('fa-check'));
    tile.append(frame, caption);
    tile.addEventListener('click', () => pick(name));
    return tile;
  }

  function close() {
    if (!open) return;
    const { backdrop, opener } = open;
    open = null;
    backdrop.remove();
    document.removeEventListener('keydown', onKey, true);
    if (opener && opener.isConnected) opener.focus();
  }

  // Escape closes it; Tab stays inside it, as the Settings window behind cannot be used meanwhile.
  function onKey(event) {
    if (!open) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close();
      return;
    }
    if (event.key !== 'Tab') return;
    const stops = [...open.backdrop.querySelectorAll('button')];
    const at = stops.indexOf(document.activeElement);
    const next = event.shiftKey ? (at <= 0 ? stops.length - 1 : at - 1) : (at + 1) % stops.length;
    event.preventDefault();
    stops[next].focus();
  }

  /**
   * @param {object} request
   * @param {Array<{title: string, names: string[]}>} request.groups  sections, in order; empty ones are skipped
   * @param {string} request.current  the preset in use, marked and focused
   * @param {(name: string) => void} request.onPick
   * @param {HTMLElement} [request.opener]  gets the focus back on close
   */
  function show({ groups, current, onPick, opener }) {
    close();
    const backdrop = el('div', 'pg-backdrop');
    const dialog = el('div', 'pg-dialog');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-label', label('title'));
    const head = el('div', 'pg-head');
    const shut = el('button', 'pg-close');
    shut.type = 'button';
    shut.setAttribute('aria-label', label('close'));
    shut.title = label('close');
    shut.append(icon('fa-times'));
    shut.addEventListener('click', close);
    head.append(el('b', '', label('title')), shut);
    const body = el('div', 'pg-body');
    const pick = (name) => {
      close();
      onPick(name);
    };
    const tiles = [];
    for (const group of groups) {
      if (!group.names.length) continue;
      const section = el('section', 'pg-group');
      section.append(el('h3', 'pg-group-title', group.title));
      const grid = el('div', 'pg-grid');
      for (const name of group.names) {
        const tile = tileFor(name, current, pick);
        tiles.push(tile);
        grid.append(tile);
      }
      section.append(grid);
      body.append(section);
    }
    if (!tiles.length) body.append(el('p', 'pg-empty', label('empty')));
    dialog.append(head, body);
    backdrop.append(dialog);
    backdrop.addEventListener('mousedown', (event) => {
      if (event.target === backdrop) close();
    });
    document.body.append(backdrop);
    document.addEventListener('keydown', onKey, true);
    const session = { backdrop, opener };
    open = session;
    const focused = tiles.find((tile) => tile.dataset.name === current) || tiles[0] || shut;
    focused.focus();
    focused.scrollIntoView({ block: 'nearest' });
    fill(tiles, session);
  }

  return {
    show,
    close,
    forget: (name) => pictures.delete(name),
    isOpen: () => Boolean(open),
  };
}

module.exports = { createPresetGallery };
