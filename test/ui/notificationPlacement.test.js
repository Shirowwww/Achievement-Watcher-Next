'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const placement = require('../../app/util/notificationPlacement.js');

const global = { position: 'bottom-right', scale: 1.25, progressPosition: '', progressScale: '' };

test('unlocks keep the per-game override over the global position and scale', () => {
  assert.deepEqual(placement.resolvePlacement({ kind: 'achievement', game: {}, global }), {
    position: 'bottom-right',
    scale: 1.25,
    customPosition: null,
    anchor: 'notif',
  });
  const game = { position: 'custom', customPosition: { x: 10, y: 20 }, scale: 0.75 };
  assert.deepEqual(placement.resolvePlacement({ kind: 'achievement', game, global }), {
    position: 'custom',
    scale: 0.75,
    customPosition: { x: 10, y: 20 },
    anchor: 'notif',
  });
});

test('progress follows unlocks, game override included, while its own settings are left empty', () => {
  const game = { position: 'top-left', scale: 2 };
  assert.deepEqual(
    placement.resolvePlacement({ kind: 'progress', game, global }),
    placement.resolvePlacement({ kind: 'achievement', game, global })
  );
  assert.deepEqual(
    placement.resolvePlacement({ kind: 'progress', game: {}, global: { position: 'center-top', scale: 1 } }),
    { position: 'center-top', scale: 1, customPosition: null, anchor: 'notif' }
  );
});

test('an explicit progress position and scale win over every game override for progress only', () => {
  const separated = { ...global, progressPosition: 'bottom-left', progressScale: 0.5 };
  const game = { position: 'custom', customPosition: { x: 10, y: 20 }, scale: 2 };
  assert.deepEqual(placement.resolvePlacement({ kind: 'progress', game, global: separated }), {
    position: 'bottom-left',
    scale: 0.5,
    customPosition: null,
    anchor: 'progressNotif',
  });
  assert.equal(placement.resolvePlacement({ kind: 'achievement', game, global: separated }).position, 'custom');
  assert.equal(placement.resolvePlacement({ kind: 'platinum', game: {}, global: separated }).position, 'bottom-right');
});

test('position and scale of progress are separated independently', () => {
  const onlyScale = { ...global, progressScale: 0.75 };
  const game = { position: 'top-right' };
  assert.deepEqual(placement.resolvePlacement({ kind: 'progress', game, global: onlyScale }), {
    position: 'top-right',
    scale: 0.75,
    customPosition: null,
    anchor: 'notif',
  });
  const onlyPosition = { ...global, progressPosition: 'custom' };
  assert.deepEqual(placement.resolvePlacement({ kind: 'progress', game: { scale: 2 }, global: onlyPosition }), {
    position: 'custom',
    scale: 2,
    customPosition: null,
    anchor: 'progressNotif',
  });
});

test('saved values are normalized, with blank meaning same as unlocks', () => {
  assert.equal(placement.normalizeProgressPosition('bottom-left'), 'bottom-left');
  assert.equal(placement.normalizeProgressPosition('custom'), 'custom');
  for (const value of ['', undefined, null, 'left-bot', 42]) assert.equal(placement.normalizeProgressPosition(value), '');
  // INI hands numbers back as strings.
  assert.equal(placement.normalizeProgressScale('0.75'), 0.75);
  assert.equal(placement.normalizeProgressScale(1.5), 1.5);
  for (const value of ['', undefined, null, '0', -1, 'abc', 3]) assert.equal(placement.normalizeProgressScale(value), '');
});

test('the custom anchor of progress falls back to the unlock anchor until it is placed once', () => {
  assert.deepEqual(placement.savedAnchor({ notif: { x: 1, y: 2 } }, 'progressNotif'), { x: 1, y: 2 });
  assert.deepEqual(placement.savedAnchor({ notif: { x: 1, y: 2 }, progressNotif: { x: 3, y: 4 } }, 'progressNotif'), { x: 3, y: 4 });
  assert.deepEqual(placement.savedAnchor({ notif: { x: 1, y: 2 }, progressNotif: { x: 3, y: 4 } }, 'notif'), { x: 1, y: 2 });
  assert.equal(placement.savedAnchor({}, 'progressNotif'), null);
  assert.equal(placement.savedAnchor(null, 'notif'), null);
});
