'use strict';

/*
  The layout editor edits one state at a time: the layout as the preview's state draws it. Each edit
  is folded back into the stored layout, either into what every state shares or into what that one
  state changes on it. A state keeps what it changed itself until it goes back to the shared look.
*/

const { CANVAS_PARTS, CANVAS_SHARED_KEYS, CANVAS_STATES, CANVAS_STYLED_PARTS, canvasItemIn, normalizeCanvas, sameValue } = require('../util/presetSchema.js');

const FRESH_MOVE = { x: 0, y: 0, r: 0, s: 1 };
const PART_FIELDS = ['move', 'style', 'hidden'];

const clone = (value) => JSON.parse(JSON.stringify(value));
const changedKeys = (before, after) => [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((key) => !sameValue(before[key], after[key]));

// `undefined` takes the key away, so a value back at its default keeps one spelling.
function put(target, key, value) {
  if (value === undefined) delete target[key];
  else target[key] = value;
}

// What `state` itself changes, made on first use.
function ownOf(holder, state) {
  if (!holder.tiers) holder.tiers = {};
  if (!holder.tiers[state]) holder.tiers[state] = {};
  return holder.tiers[state];
}

// The part's entry under one field of what the state changes on the card, made on first use.
function ownPart(layout, state, field, part) {
  const own = ownOf(layout, state);
  if (!own[field]) own[field] = {};
  if (!own[field][part]) own[field][part] = {};
  return own[field][part];
}

const ownPartOf = (layout, state, field, part) => {
  const own = layout.tiers && layout.tiers[state];
  return own && own[field] && own[field][part];
};

function foldItem(stored, before, after, state, alone) {
  const out = clone(stored);
  for (const key of CANVAS_SHARED_KEYS) put(out, key, after[key]);
  for (const key of changedKeys(before, after)) {
    if (CANVAS_SHARED_KEYS.includes(key)) continue;
    if (alone) {
      ownOf(out, state)[key] = after[key] === undefined ? null : after[key];
    } else {
      put(out, key, after[key]);
      if (out.tiers && out.tiers[state]) delete out.tiers[state][key];
    }
  }
  return out;
}

// Added while one state is edited alone, an item is drawn in that state only.
function newItem(after, state, alone) {
  const out = clone(after);
  if (alone && !out.off) {
    out.off = true;
    out.tiers = { [state]: { off: null } };
  }
  return out;
}

function foldMoves(out, before, after, state, alone) {
  for (const part of CANVAS_PARTS) {
    const now = after.move[part] || FRESH_MOVE;
    for (const key of changedKeys(before.move[part] || FRESH_MOVE, now)) {
      if (alone) {
        ownPart(out, state, 'move', part)[key] = now[key];
        continue;
      }
      out.move[part] = { ...(out.move[part] || FRESH_MOVE), [key]: now[key] };
      const own = ownPartOf(out, state, 'move', part);
      if (own) delete own[key];
    }
  }
}

function foldStyles(out, before, after, state, alone) {
  for (const part of CANVAS_STYLED_PARTS) {
    const now = (after.style && after.style[part]) || {};
    for (const key of changedKeys((before.style && before.style[part]) || {}, now)) {
      if (alone) {
        ownPart(out, state, 'style', part)[key] = now[key] === undefined ? null : now[key];
        continue;
      }
      if (!out.style) out.style = {};
      if (!out.style[part]) out.style[part] = {};
      put(out.style[part], key, now[key]);
      const own = ownPartOf(out, state, 'style', part);
      if (own) delete own[key];
    }
  }
}

function foldHidden(out, before, after, state, alone) {
  const hides = (canvas, part) => Boolean(canvas.hidden && canvas.hidden.includes(part));
  for (const part of CANVAS_PARTS) {
    const now = hides(after, part);
    if (now === hides(before, part)) continue;
    if (alone) {
      const own = ownOf(out, state);
      if (!own.hidden) own.hidden = {};
      own.hidden[part] = now;
      continue;
    }
    out.hidden = [...(out.hidden || []).filter((name) => name !== part), ...(now ? [part] : [])];
    const own = out.tiers && out.tiers[state] && out.tiers[state].hidden;
    if (own) delete own[part];
  }
}

/*
  The stored layout once `state` shows `after` where it showed `before`. `sourceOf` gives the stored
  index each edited item came from, undefined for one added since; a stored item it never gives is
  gone. `seedOf` gives the stored item an added copy was made from, with what each state changes on
  it; a copy made for one state alone is a new item there. The stacking order and how the parts
  come in are shared, so they are taken as they are.
*/
function foldEdit(layout, before, after, { state, alone, sourceOf, seedOf = () => undefined }) {
  const out = clone(layout);
  foldMoves(out, before, after, state, alone);
  foldStyles(out, before, after, state, alone);
  foldHidden(out, before, after, state, alone);
  out.items = after.items.map((item) => {
    const from = sourceOf(item);
    if (layout.items[from]) return foldItem(layout.items[from], before.items[from], item, state, alone);
    const seed = !alone && seedOf(item);
    return seed ? foldItem(seed, canvasItemIn(seed, state), item, state, alone) : newItem(item, state, alone);
  });
  put(out, 'order', after.order && clone(after.order));
  put(out, 'motion', after.motion && clone(after.motion));
  return normalizeCanvas(out);
}

const itemOwns = (layout, index, state) => Boolean(layout.items[index] && layout.items[index].tiers && layout.items[index].tiers[state]);
const partOwns = (layout, part, state) => PART_FIELDS.some((field) => ownPartOf(layout, state, field, part) !== undefined);

// Back to the shared look: the state forgets what it changed on the item, or on the part.
function resetItem(layout, index, state) {
  const out = clone(layout);
  if (itemOwns(out, index, state)) delete out.items[index].tiers[state];
  return normalizeCanvas(out);
}

function resetPart(layout, part, state) {
  const out = clone(layout);
  const own = out.tiers && out.tiers[state];
  for (const field of PART_FIELDS) if (own && own[field]) delete own[field][part];
  return normalizeCanvas(out);
}

// True when no other state draws the item: hiding it here would leave it drawn nowhere.
const drawnOnlyIn = (layout, index, state) => CANVAS_STATES.every((other) => other === state || canvasItemIn(layout.items[index], other).off);

module.exports = { clone, foldEdit, itemOwns, partOwns, resetItem, resetPart, drawnOnlyIn };
