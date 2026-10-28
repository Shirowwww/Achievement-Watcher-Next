'use strict';

/*
  The preset gallery: every preset as a picture of its card, to choose one by its look rather than
  by its name in a menu. The pictures are the offscreen snapshots the main process already renders
  for the designer, a few at a time and only for the tiles in view, and are kept for the session
  (forget() drops a stale one), so a picture seen once shows at once the next time.
*/

const SNAPSHOTS_AT_ONCE = 3;
// Tiles this far below the fold are asked for before they scroll in.
const AHEAD_PX = 240;

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
  // The pictures already arrived, drawn straight away rather than queued behind the others.
  const ready = new Map();
  let open = null;

  // A failed picture is not kept: the next opening asks again rather than showing a gap for good.
  function picture(name) {
    if (!pictures.has(name)) {
      const pending = Promise.resolve()
        .then(() => snapshot(name))
        .catch(() => null)
        .then((shot) => {
          if (pictures.get(name) !== pending) return shot;
          if (!shot || !shot.image) pictures.delete(name);
          else ready.set(name, shot);
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

  // A few at a time, the tiles in view first, as they scroll in; a closed gallery stops asking.
  function fill(tiles, session) {
    const queue = [];
    let running = 0;
    const pump = () => {
      while (running < SNAPSHOTS_AT_ONCE && queue.length && open === session) {
        const tile = queue.shift();
        running += 1;
        picture(tile.dataset.name)
          .then((shot) => open === session && showPicture(tile, shot))
          .finally(() => {
            running -= 1;
            pump();
          });
      }
    };
    session.watcher = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          session.watcher.unobserve(entry.target);
          queue.push(entry.target);
        }
        pump();
      },
      { root: session.body, rootMargin: `${AHEAD_PX}px 0px` }
    );
    for (const tile of tiles) {
      if (ready.has(tile.dataset.name)) showPicture(tile, ready.get(tile.dataset.name));
      else session.watcher.observe(tile);
    }
  }

  function tileFor(name, current, pick, disabled) {
    const tile = el('button', name === current ? 'pg-tile is-on' : 'pg-tile');
    tile.type = 'button';
    tile.dataset.name = name;
    tile.disabled = Boolean(disabled);
    if (name === current) tile.setAttribute('aria-current', 'true');
    const frame = el('span', 'pg-picture is-loading');
    const caption = el('span', 'pg-name');
    caption.append(el('span', '', name));
    if (name === current) caption.append(icon('fa-check'));
    tile.append(frame, caption);
    if (!disabled) tile.addEventListener('click', () => pick(name));
    return tile;
  }

  function close() {
    if (!open) return;
    const { backdrop, opener, watcher } = open;
    open = null;
    if (watcher) watcher.disconnect();
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
    const stops = [...open.backdrop.querySelectorAll('button:not(:disabled)')];
    const at = stops.indexOf(document.activeElement);
    const next = event.shiftKey ? (at <= 0 ? stops.length - 1 : at - 1) : (at + 1) % stops.length;
    event.preventDefault();
    stops[next].focus();
  }

  /**
   * @param {object} request
   * @param {Array<{title: string, names: string[], note?: string, disabled?: boolean}>} request.groups  sections, in
   *   order; empty ones are skipped. A disabled one is shown, its note saying why, but cannot be picked.
   * @param {string} request.current  the preset in use, marked and focused
   * @param {(name: string) => void} request.onPick
   * @param {HTMLElement} [request.opener]  gets the focus back on close
   */
  function heading(shut, count) {
    const head = el('div', 'pg-head');
    const mark = el('span', 'pg-mark');
    mark.append(icon('fa-swatchbook'));
    const words = el('div', 'pg-heading');
    const title = el('b', 'pg-title', label('title'));
    title.append(el('span', 'pg-count', String(count)));
    words.append(title, el('span', 'pg-hint', label('hint')));
    head.append(mark, words, shut);
    return head;
  }

  /**
   * @param {object} request
   * @param {Array<{title: string, names: string[], note?: string, disabled?: boolean}>} request.groups  sections, in
   *   order; empty ones are skipped. A disabled one is shown, its note saying why, but cannot be picked.
   * @param {Array<{name: string, label: string}>} [request.choices]  plain choices without a picture, above them
   * @param {string} request.current  the preset in use, marked and focused
   * @param {(name: string) => void} request.onPick
   * @param {HTMLElement} [request.opener]  gets the focus back on close
   */
  function show({ groups, choices = [], current, onPick, opener }) {
    close();
    const backdrop = el('div', 'pg-backdrop');
    const dialog = el('div', 'pg-dialog');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-label', label('title'));
    const shut = el('button', 'pg-close');
    shut.type = 'button';
    shut.setAttribute('aria-label', label('close'));
    shut.title = label('close');
    shut.append(icon('fa-times'));
    shut.addEventListener('click', close);
    const body = el('div', 'pg-body');
    const pick = (name) => {
      close();
      onPick(name);
    };
    const tiles = [];
    if (choices.length) {
      const row = el('div', 'pg-choices');
      for (const choice of choices) {
        const button = el('button', choice.name === current ? 'pg-choice is-on' : 'pg-choice', choice.label);
        button.type = 'button';
        button.dataset.name = choice.name;
        button.addEventListener('click', () => pick(choice.name));
        row.append(button);
      }
      body.append(row);
    }
    for (const group of groups) {
      if (!group.names.length) continue;
      const section = el('section', group.disabled ? 'pg-group is-disabled' : 'pg-group');
      if (group.title) {
        const title = el('h3', 'pg-group-title', group.title);
        title.append(el('span', 'pg-group-count', String(group.names.length)));
        section.append(title);
      }
      if (group.note) section.append(el('p', 'pg-note', group.note));
      const grid = el('div', 'pg-grid');
      for (const name of group.names) {
        const tile = tileFor(name, current, pick, group.disabled);
        tile.style.setProperty('--i', String(tiles.length));
        tiles.push(tile);
        grid.append(tile);
      }
      section.append(grid);
      body.append(section);
    }
    if (!tiles.some((tile) => !tile.disabled) && !choices.length) body.prepend(el('p', 'pg-empty', label('empty')));
    dialog.append(heading(shut, tiles.length), body);
    backdrop.append(dialog);
    backdrop.addEventListener('mousedown', (event) => {
      if (event.target === backdrop) close();
    });
    document.body.append(backdrop);
    document.addEventListener('keydown', onKey, true);
    const session = { backdrop, opener, body, watcher: null };
    open = session;
    const pickable = [...body.querySelectorAll('.pg-choice'), ...tiles.filter((tile) => !tile.disabled)];
    const focused = pickable.find((tile) => tile.dataset.name === current) || pickable[0] || shut;
    focused.focus();
    focused.scrollIntoView({ block: 'nearest' });
    fill(tiles, session);
  }

  /*
    Turns a preset <select> into the gallery's opener: it still shows the chosen name and keeps its
    value, change event and saving, but a click or the keys that would drop its list open the
    gallery instead. Its options are read when it opens, so a list refilled later needs nothing.
    groups(names) sorts the preset names into sections; an option with an empty value ("Same as
    main", "None") becomes a plain choice above the pictures. showOwn(select) replaces the whole
    opening, for a menu whose gallery shows more than its own options.
  */
  function attach(select, { groups = (names) => [{ title: '', names }], showOwn = null } = {}) {
    if (!select || select.dataset.gallery) return;
    select.dataset.gallery = '1';
    select.classList.add('pg-opener');
    // Tells ui/selectMenu.js to leave it alone: its themed list would open first.
    select.setAttribute('data-native-select', '');
    const openFor = () => {
      if (select.disabled) return;
      if (showOwn) {
        showOwn(select);
        return;
      }
      const options = [...select.options];
      show({
        groups: groups(options.filter((option) => option.value).map((option) => option.value)),
        choices: options.filter((option) => !option.value).map((option) => ({ name: '', label: option.textContent })),
        current: select.value,
        onPick: (name) => {
          if (name === select.value) return;
          select.value = name;
          select.dispatchEvent(new Event('change', { bubbles: true }));
        },
        opener: select,
      });
    };
    select.addEventListener('mousedown', (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      select.focus();
      openFor();
    });
    select.addEventListener('keydown', (event) => {
      if (!['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(event.key)) return;
      event.preventDefault();
      openFor();
    });
  }

  return {
    show,
    attach,
    close,
    forget: (name) => {
      pictures.delete(name);
      ready.delete(name);
    },
    isOpen: () => Boolean(open),
  };
}

module.exports = { createPresetGallery };
