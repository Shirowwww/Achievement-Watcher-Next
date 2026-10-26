'use strict';

// How the layout editor folds an edit made on one state back into the stored layout: into what all
// the states share, or into what that one state changes on it.

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const appRoot = path.join(__dirname, '..', '..', 'app');
const schema = require(path.join(appRoot, 'util', 'presetSchema.js'));
const tiers = require(path.join(appRoot, 'ui', 'presetCanvasTiers.js'));

const clone = (value) => JSON.parse(JSON.stringify(value));

// The editor's view of a state, the same view edited by `change`, and the layout folded from both.
function edit(layout, state, alone, change, seedOf) {
  const before = schema.canvasIn(layout, state);
  const after = clone(before);
  const sources = new Map(after.items.map((item, index) => [item, index]));
  change(after);
  return tiers.foldEdit(layout, before, after, { state, alone, sourceOf: (item) => sources.get(item), seedOf });
}

const star = { kind: 'shape', shape: 'star', x: 0, y: 0, w: 40, h: 40 };

test('an edit for every state changes the shared look and keeps no tier entry', () => {
  const layout = schema.normalizeCanvas({ items: [star] });
  const out = edit(layout, 'gold', false, (view) => (view.items[0].w = 60));
  assert.equal(out.items[0].w, 60);
  assert.equal(out.items[0].tiers, undefined);
});

test('an edit for one state alone changes that state only', () => {
  const layout = schema.normalizeCanvas({ items: [star] });
  const out = edit(layout, 'gold', true, (view) => {
    view.items[0].w = 60;
    view.items[0].lock = true;
  });
  assert.equal(out.items[0].w, 40, 'the shared look is untouched');
  assert.deepEqual(out.items[0].tiers, { gold: { w: 60 } });
  assert.equal(out.items[0].lock, true, 'a lock holds in every state');
  assert.equal(schema.canvasItemIn(out.items[0], 'gold').w, 60);
  assert.equal(schema.canvasItemIn(out.items[0], 'silver').w, 40);
});

test('a shared edit seen from a state drops what that state changed, and leaves the other states theirs', () => {
  const layout = schema.normalizeCanvas({ items: [{ ...star, tiers: { gold: { w: 80, x: 5 }, silver: { w: 70 } } }] });
  const out = edit(layout, 'gold', false, (view) => (view.items[0].w = 50));
  assert.equal(out.items[0].w, 50);
  assert.deepEqual(out.items[0].tiers, { gold: { x: 5 }, silver: { w: 70 } });
});

test('setting a state back to the shared value leaves nothing behind', () => {
  const layout = schema.normalizeCanvas({ items: [{ ...star, tiers: { gold: { w: 80 } } }] });
  const out = edit(layout, 'gold', true, (view) => (view.items[0].w = 40));
  assert.equal(out.items[0].tiers, undefined);
});

test('an item added while one state is edited alone is drawn in that state only', () => {
  const layout = schema.normalizeCanvas({ items: [star] });
  const out = edit(layout, 'gold', true, (view) => view.items.push(schema.normalizeCanvasItem({ kind: 'icon' })));
  assert.equal(out.items.length, 2);
  for (const state of schema.CANVAS_STATES) assert.equal(Boolean(schema.canvasItemIn(out.items[1], state).off), state !== 'gold', state);
  assert.ok(tiers.drawnOnlyIn(out, 1, 'gold'));
  assert.ok(!tiers.drawnOnlyIn(out, 0, 'gold'));
});

test('a copy keeps what each state changes on the original, unless it is made for one state alone', () => {
  const layout = schema.normalizeCanvas({ items: [{ ...star, tiers: { gold: { w: 60 } } }] });
  const seed = clone(layout.items[0]);
  const copy = schema.canvasItemIn(seed, 'gold');
  const paste = (alone) => edit(layout, 'gold', alone, (view) => view.items.push(copy), (item) => (item === copy ? seed : undefined)).items[1];
  const shared = paste(false);
  assert.equal(schema.canvasItemIn(shared, 'gold').w, 60);
  assert.equal(schema.canvasItemIn(shared, 'normal').w, 40);
  assert.equal(schema.canvasItemIn(shared, 'normal').off, undefined);
  const alone = paste(true);
  assert.equal(schema.canvasItemIn(alone, 'gold').w, 60);
  assert.equal(schema.canvasItemIn(alone, 'normal').off, true);
});

test('an item removed from the view is removed, and the order follows the view', () => {
  const layout = schema.normalizeCanvas({ items: [star, { kind: 'icon' }], order: [1, 'icon', 'meta', 'title', 'detail', 'progress', 0] });
  const out = edit(layout, 'normal', false, (view) => {
    view.items.splice(0, 1);
    view.order = ['icon', 'meta', 'title', 0, 'detail', 'progress'];
  });
  assert.deepEqual(out.items.map((item) => item.kind), ['icon']);
  assert.deepEqual(out.order, ['icon', 'meta', 'title', 0, 'detail', 'progress']);
});

test('a card part is moved, restyled and hidden for one state alone, or for every state', () => {
  const layout = schema.normalizeCanvas({ move: { title: { x: 4 } } });
  const alone = edit(layout, 'gold', true, (view) => {
    view.move.title = { ...view.move.title, y: 6 };
    view.style = { title: { size: 24 } };
    view.hidden = ['meta'];
  });
  assert.deepEqual(alone.move.title, { x: 4, y: 0, r: 0, s: 1 });
  assert.deepEqual(alone.tiers, { gold: { move: { title: { y: 6 } }, style: { title: { size: 24 } }, hidden: { meta: true } } });
  assert.ok(tiers.partOwns(alone, 'title', 'gold') && tiers.partOwns(alone, 'meta', 'gold'));
  assert.ok(!tiers.partOwns(alone, 'title', 'silver'));

  const shared = edit(alone, 'gold', false, (view) => (view.move.title = { ...view.move.title, y: 9 }));
  assert.deepEqual(shared.move.title, { x: 4, y: 9, r: 0, s: 1 });
  assert.equal(shared.tiers.gold.move, undefined, 'the state no longer moves the line its own way');
  assert.deepEqual(shared.tiers.gold.style, { title: { size: 24 } });
});

test('going back to the shared look forgets what the state changed', () => {
  const layout = schema.normalizeCanvas({
    items: [{ ...star, tiers: { gold: { w: 80 }, silver: { w: 70 } } }],
    tiers: { gold: { move: { title: { y: 6 } }, hidden: { meta: true } } },
  });
  assert.ok(tiers.itemOwns(layout, 0, 'gold'));
  assert.deepEqual(tiers.resetItem(layout, 0, 'gold').items[0].tiers, { silver: { w: 70 } });
  const parts = tiers.resetPart(layout, 'title', 'gold');
  assert.deepEqual(parts.tiers, { gold: { hidden: { meta: true } } });
  assert.equal(tiers.resetPart(parts, 'meta', 'gold').tiers, undefined);
});
