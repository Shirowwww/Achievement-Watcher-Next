'use strict';

// Steam's achievement sets (October 2026) let a developer archive an achievement nobody can earn
// any more: it stays on the profile of whoever earned it and stops counting for everyone else. TF2
// archived four Replay achievements, which left its 100% out of reach for everyone else.

const assert = require('node:assert/strict');
const Module = require('node:module');
const { test } = require('node:test');

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'electron') return { ipcRenderer: { sendSync: () => false, invoke: async () => null } };
  if (request === '@electron/remote' || request.startsWith('@electron/remote/')) return {};
  return originalLoad.call(this, request, parent, isMain);
};
const { withoutUnearnedArchived } = require('../../app/parser/achievements.js')._internal;
Module._load = originalLoad;

test('an archived achievement nobody here earned leaves the list and the total', () => {
  const achievement = {
    total: 4,
    list: [
      { name: 'A', Achieved: 1 },
      { name: 'B', Achieved: 0 },
      { name: 'REPLAY_1', archived: true, Achieved: 0 },
      { name: 'REPLAY_2', archived: true, Achieved: 1 },
    ],
  };
  const kept = withoutUnearnedArchived(achievement);
  assert.deepEqual(
    kept.list.map((entry) => entry.name),
    ['A', 'B', 'REPLAY_2'],
    'an earned archived achievement stays, as it does on the Steam profile'
  );
  assert.equal(kept.total, 3);
  assert.equal(achievement.list.length, 4, 'the schema it came from is not modified');
});

test('a list without archived achievements is handed back as it is', () => {
  const achievement = { total: 1, list: [{ name: 'A', Achieved: 0 }] };
  assert.strictEqual(withoutUnearnedArchived(achievement), achievement);
});
