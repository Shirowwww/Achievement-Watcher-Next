'use strict';

/*
  The preset gallery: every preset as a picture of its card, to choose one by its look rather than
  by its name in a menu. The pictures are the offscreen snapshots the main process already renders
  for the designer, a few at a time and only for the tiles in view. The main process keeps them on
  disk per preset version, and Settings draws the missing ones ahead (warm), so the gallery opens
  with its pictures; forget() drops a stale one from this session. Every card can be shown in one
  of the designer's states (a plain unlock, a rare one, 100%, progress), and filtered by name.
*/

const SNAPSHOTS_AT_ONCE = 3;
// Tiles this far below the fold are asked for before they scroll in.
const AHEAD_PX = 240;
const DEFAULT_STATE = 'normal';

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

// Case and accents do not matter when looking a preset up by name.
const folded = (text) =>
  String(text || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

/**
 * @param {object} options
 * @param {(key: string) => string} options.label  a word of the gallery's, by its key
 * @param {(name: string, state: string) => Promise<{image: string}|null>} options.snapshot  a picture of that preset
 * @param {() => Array<{key: string, label: string}>} [options.states]  the states a card can be shown in
 */
function createPresetGallery({ label, snapshot, states = () => [] }) {
  const pictures = new Map();
  // The pictures already arrived, drawn straight away rather than queued behind the others.
  const ready = new Map();
  let open = null;
  // The state chosen last, kept for the next opening.
  let shownState = DEFAULT_STATE;
  const keyOf = (name, state) => `${state}\n${name}`;

  // A failed picture is not kept: the next opening asks again rather than showing a gap for good.
  function picture(name, state = DEFAULT_STATE) {
    const key = keyOf(name, state);
    if (!pictures.has(key)) {
      const pending = Promise.resolve()
        .then(() => snapshot(name, state))
        .catch(() => null)
        .then((shot) => {
          if (pictures.get(key) !== pending) return shot;
          if (!shot || !shot.image) pictures.delete(key);
          else ready.set(key, shot);
          return shot;
        });
      pictures.set(key, pending);
    }
    return pictures.get(key);
  }

  function showPicture(tile, shot) {
    const frame = tile.querySelector('.pg-picture');
    frame.classList.remove('is-loading');
    if (!shot || !shot.image) {
      frame.classList.add('is-missing');
      frame.replaceChildren(icon('fa-image'));
      return;
    }
    frame.classList.remove('is-missing');
    const img = el('img');
    img.alt = '';
    img.src = shot.image;
    frame.replaceChildren(img);
  }

  // A few at a time, the tiles in view first, as they scroll in; a closed gallery or another state stops asking.
  function fill(tiles, session) {
    if (session.watcher) session.watcher.disconnect();
    const state = session.state;
    const current = () => open === session && session.state === state;
    const queue = [];
    let running = 0;
    const pump = () => {
      while (running < SNAPSHOTS_AT_ONCE && queue.length && current()) {
        const tile = queue.shift();
        running += 1;
        picture(tile.dataset.name, state)
          .then((shot) => current() && showPicture(tile, shot))
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
      const kept = ready.get(keyOf(tile.dataset.name, state));
      if (kept) {
        showPicture(tile, kept);
        continue;
      }
      const frame = tile.querySelector('.pg-picture');
      frame.classList.remove('is-missing');
      frame.classList.add('is-loading');
      frame.replaceChildren();
      session.watcher.observe(tile);
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
    const stops = [...open.backdrop.querySelectorAll('button:not(:disabled), input')].filter((node) => node.offsetParent !== null);
    const at = stops.indexOf(document.activeElement);
    const next = event.shiftKey ? (at <= 0 ? stops.length - 1 : at - 1) : (at + 1) % stops.length;
    event.preventDefault();
    stops[next].focus();
  }

  // Hides the cards whose name does not match, then any section left empty.
  function applyFilter(session, query) {
    const wanted = folded(query).trim();
    let shown = 0;
    for (const tile of session.tiles) {
      const match = !wanted || folded(tile.dataset.name).includes(wanted);
      tile.hidden = !match;
      if (match) shown += 1;
    }
    for (const section of session.body.querySelectorAll('.pg-group')) {
      section.hidden = ![...section.querySelectorAll('.pg-tile')].some((tile) => !tile.hidden);
    }
    session.noMatch.hidden = shown > 0 || !wanted;
  }

  // The bar above the cards: the title, the search, the state the cards are shown in, and Close.
  function heading(session, shut) {
    const head = el('div', 'pg-head');
    head.append(el('b', 'pg-title', label('title')));
    const search = el('label', 'pg-search');
    search.append(icon('fa-search'));
    const input = el('input');
    input.type = 'search';
    input.placeholder = label('search');
    input.setAttribute('aria-label', label('search'));
    input.spellcheck = false;
    input.addEventListener('input', () => applyFilter(session, input.value));
    search.append(input);
    head.append(search);
    const choices = states();
    if (choices.length > 1) {
      const seg = el('div', 'pg-states');
      seg.setAttribute('role', 'group');
      seg.setAttribute('aria-label', label('states'));
      for (const choice of choices) {
        const button = el('button', choice.key === session.state ? 'is-on' : '', choice.label);
        button.type = 'button';
        button.setAttribute('aria-pressed', String(choice.key === session.state));
        button.addEventListener('click', () => {
          if (session.state === choice.key) return;
          session.state = choice.key;
          shownState = choice.key;
          for (const other of seg.children) {
            const on = other === button;
            other.classList.toggle('is-on', on);
            other.setAttribute('aria-pressed', String(on));
          }
          fill(session.tiles, session);
        });
        seg.append(button);
      }
      head.append(seg);
    }
    head.append(shut);
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
    const noMatch = el('p', 'pg-empty', label('noMatch'));
    noMatch.hidden = true;
    body.append(noMatch);
    const known = states().some((choice) => choice.key === shownState);
    const session = { backdrop, opener, body, tiles, noMatch, watcher: null, state: known ? shownState : DEFAULT_STATE };
    dialog.append(heading(session, shut), body);
    backdrop.append(dialog);
    backdrop.addEventListener('mousedown', (event) => {
      if (event.target === backdrop) close();
    });
    document.body.append(backdrop);
    document.addEventListener('keydown', onKey, true);
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

  // Draws the pictures of `names` ahead of time, one after another, so as not to compete with an
  // open gallery; a picture kept on disk comes back at once.
  let warming = null;
  function warm(names) {
    if (warming) return warming;
    warming = (async () => {
      for (const name of names) {
        if (!ready.has(keyOf(name, DEFAULT_STATE))) await picture(name, DEFAULT_STATE);
      }
    })().finally(() => {
      warming = null;
    });
    return warming;
  }

  return {
    show,
    attach,
    close,
    warm,
    // A preset saved again is drawn again, in every state.
    forget: (name) => {
      // Deleting the entry being visited is safe in a Map's own iteration.
      for (const key of pictures.keys()) if (key.endsWith(`\n${name}`)) pictures.delete(key);
      for (const key of ready.keys()) if (key.endsWith(`\n${name}`)) ready.delete(key);
    },
    isOpen: () => Boolean(open),
  };
}

module.exports = { createPresetGallery };
