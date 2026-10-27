'use strict';

/*
  An imported SAN theme shown live in the designer: its own page (sanEngine.previewPage) in a
  preview frame, handed the designer's sample payload. The card is held still while it is edited,
  plays through on Play, and is redrawn in place, without reloading the page, when a setting changes.
*/

const THEME_BLOCK_ID = 'aw-san-theme';
// Where a card is held when its title cannot be found: every SAN card has come in by then.
const HOLD_AT_MS = 2400;
// A moment counts as showing the title once it shows this much of the most any moment shows (a layout
// may keep its title at 0.85 opacity, a theme the whole card at half).
const SHOWN_SHARE = 0.98;

function timedAnimations(doc) {
  return doc.getAnimations().filter((animation) => {
    const timing = animation.effect && animation.effect.getComputedTiming();
    return timing && timing.iterations !== Infinity;
  });
}

function seek(animations, atMs) {
  for (const animation of animations) {
    animation.currentTime = atMs;
    animation.pause();
  }
}

// How visible an element is through its own opacity and every parent's: 0 when it is not drawn.
function opacityOf(doc, element) {
  let shown = 1;
  for (let node = element; node && node.nodeType === 1; node = node.parentElement) {
    const style = doc.defaultView.getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden') return 0;
    shown *= Number(style.opacity);
  }
  return shown;
}

// How much of the title shows right now: its share inside the card, times its opacity.
function titleShown(doc, title) {
  const card = doc.getElementById('outerwrapper');
  if (!card) return 0;
  const box = title.getBoundingClientRect();
  const frame = card.getBoundingClientRect();
  const width = Math.min(box.right, frame.right) - Math.max(box.left, frame.left);
  const height = Math.min(box.bottom, frame.bottom) - Math.max(box.top, frame.top);
  if (box.width < 1 || box.height < 1 || width <= 0 || height <= 0) return 0;
  return ((width * height) / (box.width * box.height)) * opacityOf(doc, title);
}

/*
  The card's elements a click opens the settings of, by the ids SAN's layouts give them. The first
  one met from an element up names it: the icon's border and picture are the icon, the background's
  overlays the background, and what is left of the card the card.
*/
const PART_IDS = {
  unlockmsg: 'unlockmsg',
  title: 'title',
  desc: 'desc',
  xpwrapper: 'text',
  logo: 'logo',
  iconbg: 'icon',
  achiconwrapper: 'icon',
  bg: 'background',
  bgelems: 'background',
  shadow1: 'background',
  shadow2: 'background',
  achcont: 'background',
  outerwrapper: 'card',
};
// What the others lie on: the lines' empty box may cover the icon, yet the icon is what shows.
const AREAS = new Set(['background', 'card']);
// Below this, an element is faded out: two-part cards keep their other half on the page, unseen.
const SEEN_OPACITY = 0.05;

function partOf(element) {
  for (let node = element; node && node.nodeType === 1; node = node.parentElement) {
    if (Object.prototype.hasOwnProperty.call(PART_IDS, node.id)) return { id: PART_IDS[node.id], rect: node.getBoundingClientRect() };
  }
  return null;
}

/**
 * The element of the drawn card at a point of its page, as the person sees it: a line, the icon or
 * the logo before what they lie on, and nothing faded out. Null off the card.
 * @param {Document} doc
 * @param {number} x
 * @param {number} y
 * @returns {{ id: string, rect: DOMRect } | null}
 */
function partAt(doc, x, y) {
  let area = null;
  for (const hit of doc.elementsFromPoint(x, y)) {
    const part = opacityOf(doc, hit) < SEEN_OPACITY ? null : partOf(hit);
    if (part && !AREAS.has(part.id)) return part;
    area = area || part;
  }
  return hiddenPartAt(doc, x, y) || area;
}

// A part the designer hid (engine placeParts) is not drawn, so no point hits it: found by its box
// instead, so a click where it was opens its settings to show it again.
function hiddenPartAt(doc, x, y) {
  for (const [id, part] of Object.entries(PART_IDS)) {
    if (AREAS.has(part)) continue;
    // A two-part card draws each element twice, under one id.
    for (const node of doc.querySelectorAll(`#${id}`)) {
      if (node.style.visibility !== 'hidden') continue;
      const box = node.getBoundingClientRect();
      if (x >= box.left && x <= box.right && y >= box.top && y <= box.bottom) return { id: part, rect: box };
    }
  }
  return null;
}

// The moment a card shows its achievement: the first pause between its animations with the title on
// the card. Two-part cards (SAN's "default") only show it in their second half, seconds in.
function holdTime(doc) {
  const animations = timedAnimations(doc);
  const title = doc.getElementById('title');
  if (!title || animations.length === 0) return HOLD_AT_MS;
  const spans = animations.map((animation) => {
    const timing = animation.effect.getComputedTiming();
    return { start: timing.delay, end: timing.delay + timing.activeDuration };
  });
  // Never past the card's end: SAN's `animend` finishing, even for a probe, fades the page out.
  const life = Math.max(...spans.map((span) => span.end));
  const moments = [...new Set(spans.map((span) => Math.ceil(span.end) + 1))].filter((atMs) => atMs < life).sort((a, b) => a - b);
  if (moments.length === 0) return HOLD_AT_MS;
  const shown = moments.map((atMs) => {
    seek(animations, atMs);
    return titleShown(doc, title);
  });
  const most = Math.max(...shown);
  if (!(most > 0)) return HOLD_AT_MS;
  const full = moments.filter((atMs, i) => shown[i] >= most * SHOWN_SHARE);
  const still = full.find((atMs) => spans.every((span) => atMs < span.start || atMs >= span.end));
  return still === undefined ? full[0] : still;
}

// Stops the card where it shows its achievement. Looping glows keep running, as they do on screen.
function freeze(doc, atMs = holdTime(doc)) {
  seek(timedAnimations(doc), atMs);
}

// The page's own animation (SAN's `animend` on <body>) outlives each card and may still be held from
// the last one: it starts over with the card played, or the card's end would never come.
function replay(doc) {
  for (const animation of timedAnimations(doc)) {
    const target = animation.effect.target;
    if (target !== doc.body && target !== doc.documentElement && animation.playState !== 'paused') continue;
    animation.currentTime = 0;
    animation.play();
  }
}

/**
 * Draws one card in a frame whose page has loaded. `onDrawn(doc)` runs as soon as the card is in the
 * page, before it is painted; the promise settles once its pictures have loaded (false: no page).
 * @param {HTMLIFrameElement} frame
 * @param {{ theme: object, payload: object, hold?: boolean, onEnded?: () => void, onDrawn?: (doc: Document) => void }} what
 * @returns {Promise<boolean>}
 */
function draw(frame, { theme, payload, hold = true, onEnded = null, onDrawn = () => {} }) {
  let win = null;
  let doc = null;
  try {
    win = frame.contentWindow;
    doc = frame.contentDocument;
  } catch {
    return Promise.resolve(false);
  }
  if (!win || !doc || typeof win.awPreviewShow !== 'function') return Promise.resolve(false);
  const block = doc.getElementById(THEME_BLOCK_ID);
  if (block && theme) block.textContent = JSON.stringify(theme);
  win.awPreviewEnded = hold ? null : onEnded;
  // Only the latest draw on a page dresses the card: an older one may settle after it.
  const turn = (win.awPreviewTurn || 0) + 1;
  win.awPreviewTurn = turn;
  // host.js calls this as soon as the card is in the page, before it is painted, so a held card
  // never flashes its entrance; once more when its pictures are in.
  let started = false;
  const drawn = () => {
    if (win.awPreviewTurn !== turn) return;
    if (hold) freeze(doc);
    else if (!started) replay(doc);
    started = true;
    onDrawn(doc);
  };
  win.awPreviewDrawn = drawn;
  const settled = win.awPreviewShow(payload);
  return settled.then(
    () => {
      drawn();
      return true;
    },
    () => false
  );
}

module.exports = { draw, freeze, holdTime, partAt, HOLD_AT_MS };
