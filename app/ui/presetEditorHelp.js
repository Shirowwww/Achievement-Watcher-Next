'use strict';

/*
  The layout editor's help: the sheet of its shortcuts (its ? button, or the ? key), and a short tour
  of its areas the first time it opens. Every word comes from the locale, through the same hidden
  labels as the editor's own.
*/

const TOUR_SEEN_KEY = 'aw-pd-tour-seen';
const TOUR_START_DELAY_MS = 350;
const TOUR_GAP_PX = 12;
const TOUR_EDGE_PX = 12;
const TOUR_TITLE_ID = 'pd-cv-tour-title';
// Each shortcut is one or more key combinations; a lower-case name is a key whose name is translated.
const NAMED_KEYS = ['ctrl', 'shift', 'alt', 'delete', 'escape'];
const SHORTCUTS = [
  [[['←'], ['↑'], ['→'], ['↓']], 'help.nudge'],
  [[['shift']], 'help.shift'],
  [[['alt']], 'help.alt'],
  [[['shift'], ['ctrl']], 'help.group'],
  [[['ctrl', 'A']], 'help.selectAll'],
  [[['ctrl', 'D']], 'help.duplicate'],
  [[['ctrl', 'C'], ['ctrl', 'V']], 'help.copy'],
  [[['ctrl', 'Z'], ['ctrl', 'Y']], 'help.undo'],
  [[['delete']], 'help.delete'],
  [[['escape']], 'help.escape'],
  [[['ctrl']], 'help.zoom'],
  [[], 'help.dblclick'],
  [[['?']], 'help.sheet'],
];
const TOUR = [
  { target: '.pd-cv-add', key: 'tour.add' },
  { target: '#pd-stage', key: 'tour.edit' },
  { target: '#pd-cv-card', key: 'tour.props' },
  { target: '#pd-cv-layers', key: 'tour.layers' },
  { target: '#pd-cv-help', key: 'tour.help' },
];

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function button(className, text, onClick) {
  const node = el('button', className, text);
  node.type = 'button';
  node.addEventListener('click', onClick);
  return node;
}

// Tab goes round the box's own buttons: the editor behind it is not usable while it is open.
function keepTabInside(box) {
  box.addEventListener('keydown', (event) => {
    if (event.key !== 'Tab') return;
    const stops = [...box.querySelectorAll('button')];
    if (!stops.length) return;
    const at = stops.indexOf(document.activeElement);
    const next = event.shiftKey ? (at <= 0 ? stops.length - 1 : at - 1) : (at + 1) % stops.length;
    event.preventDefault();
    stops[next].focus();
  });
}

// localStorage can be missing or refuse writes (a locked profile): the tour then simply shows again.
function tourSeen() {
  try {
    return window.localStorage.getItem(TOUR_SEEN_KEY) === '1';
  } catch {
    return false;
  }
}
function markTourSeen() {
  try {
    window.localStorage.setItem(TOUR_SEEN_KEY, '1');
  } catch {
    // Nothing to keep it in; it shows again next time.
  }
}

/**
 * @param {object} options
 * @param {HTMLElement} options.root  the designer (#options-notify-designer)
 * @param {(key: string) => string} options.label  a word of the editor's, by its data-cv key
 */
function createEditorHelp({ root, label }) {
  const preview = root.querySelector('.pd-preview');
  const helpButton = root.querySelector('#pd-cv-help');
  let sheet = null;
  let tour = null;

  function keyCap(name) {
    return el('kbd', '', NAMED_KEYS.includes(name) ? label(`help.key.${name}`) : name);
  }

  function shortcutRow([combos, key]) {
    const row = el('div', 'pd-cv-help-row');
    const keys = el('span', 'pd-cv-help-keys');
    // One wrapper per combination, so a narrow column breaks between Ctrl+C and Ctrl+V, never inside one.
    for (const combo of combos) {
      const group = el('span', 'pd-cv-help-combo');
      combo.forEach((name, at) => {
        if (at) group.appendChild(document.createTextNode('+'));
        group.appendChild(keyCap(name));
      });
      keys.appendChild(group);
    }
    row.append(keys, el('span', 'pd-cv-help-what', label(key)));
    return row;
  }

  function closeSheet() {
    if (!sheet) return;
    const hadFocus = sheet.contains(document.activeElement);
    sheet.remove();
    sheet = null;
    helpButton.setAttribute('aria-expanded', 'false');
    if (hadFocus) helpButton.focus();
  }

  function openSheet() {
    closeTour();
    sheet = el('div', 'pd-cv-help');
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-modal', 'true');
    sheet.setAttribute('aria-label', label('help.title'));
    const head = el('div', 'pd-cv-help-head');
    const close = button('pd-icon-btn', '', closeSheet);
    close.setAttribute('aria-label', label('help.close'));
    const cross = el('i', 'fas fa-times');
    cross.setAttribute('aria-hidden', 'true');
    close.appendChild(cross);
    head.append(el('b', '', label('help.title')), close);
    const rows = el('div', 'pd-cv-help-rows');
    rows.append(...SHORTCUTS.map(shortcutRow));
    const replay = button('pd-cv-btn', label('tour.replay'), () => {
      closeSheet();
      startTour();
    });
    sheet.append(head, rows, replay);
    keepTabInside(sheet);
    preview.appendChild(sheet);
    helpButton.setAttribute('aria-expanded', 'true');
    close.focus();
  }

  function toggleSheet() {
    if (sheet) closeSheet();
    else openSheet();
  }

  /* ---------- tour ---------- */

  function placeTour() {
    if (!tour) return;
    const step = TOUR[tour.at];
    const target = root.querySelector(step.target);
    const rect = target && target.getClientRects().length ? target.getBoundingClientRect() : null;
    tour.ring.hidden = !rect;
    if (rect) Object.assign(tour.ring.style, { left: `${rect.left - 4}px`, top: `${rect.top - 4}px`, width: `${rect.width + 8}px`, height: `${rect.height + 8}px` });
    const card = tour.card;
    const { width, height } = card.getBoundingClientRect();
    const below = rect ? rect.bottom + TOUR_GAP_PX : (window.innerHeight - height) / 2;
    const top = rect && below + height > window.innerHeight - TOUR_EDGE_PX ? Math.max(TOUR_EDGE_PX, rect.top - TOUR_GAP_PX - height) : below;
    const left = rect ? rect.left + rect.width / 2 - width / 2 : (window.innerWidth - width) / 2;
    card.style.left = `${Math.min(Math.max(TOUR_EDGE_PX, left), window.innerWidth - width - TOUR_EDGE_PX)}px`;
    card.style.top = `${Math.min(Math.max(TOUR_EDGE_PX, top), window.innerHeight - height - TOUR_EDGE_PX)}px`;
  }

  function showStep(at) {
    tour.at = at;
    const step = TOUR[at];
    const last = at === TOUR.length - 1;
    const body = el('div', 'pd-cv-tour-body');
    const title = el('b', '', label(`${step.key}.title`));
    title.id = TOUR_TITLE_ID;
    body.append(title, el('p', '', label(`${step.key}.body`)));
    const foot = el('div', 'pd-cv-tour-foot');
    const next = button('inline-action-btn primary', label(last ? 'tour.done' : 'tour.next'), () => (last ? closeTour() : showStep(at + 1)));
    foot.append(button('pd-cv-btn', label('tour.skip'), closeTour), el('span', 'pd-cv-tour-count', `${at + 1} / ${TOUR.length}`), next);
    tour.card.replaceChildren(body, foot);
    // Restarts the entry animation, so each step reads as a new one.
    tour.card.classList.remove('is-in');
    void tour.card.offsetWidth;
    tour.card.classList.add('is-in');
    placeTour();
    next.focus();
  }

  function startTour() {
    closeSheet();
    closeTour();
    markTourSeen();
    const ring = el('div', 'pd-cv-tour-ring');
    const card = el('div', 'pd-cv-tour');
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    card.setAttribute('aria-labelledby', TOUR_TITLE_ID);
    card.setAttribute('aria-live', 'polite');
    keepTabInside(card);
    document.body.append(ring, card);
    tour = { ring, card, at: 0, back: document.activeElement };
    window.addEventListener('resize', placeTour);
    showStep(0);
  }

  function closeTour() {
    if (!tour) return;
    const { back } = tour;
    tour.ring.remove();
    tour.card.remove();
    tour = null;
    window.removeEventListener('resize', placeTour);
    // Back where the user was, when that is still on screen; the sheet that replaces the tour takes it next.
    if (back && back.isConnected && back !== document.body) back.focus();
  }

  // Once per profile, after the full-screen layout has settled.
  function maybeTour() {
    if (tourSeen()) return;
    setTimeout(() => {
      if (preview.classList.contains('is-cv-full') && !tour) startTour();
    }, TOUR_START_DELAY_MS);
  }

  helpButton.addEventListener('click', toggleSheet);

  return {
    toggle: toggleSheet,
    close() {
      closeSheet();
      closeTour();
    },
    isOpen: () => Boolean(sheet || tour),
    maybeTour,
  };
}

module.exports = { createEditorHelp };
