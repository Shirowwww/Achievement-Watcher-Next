'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { toToast } = require('../../decky/src/feed.ts');

test('a feed notification becomes a Steam toast titled with the achievement and the game below', () => {
  const toast = toToast(
    JSON.stringify({ game: 'Portal', displayName: 'Lab Rat', icon: 'https://cdn.example/icon.jpg', notificationType: 'achievement', silent: false })
  );
  assert.deepEqual(toast, { title: 'Lab Rat', body: 'Portal', icon: 'https://cdn.example/icon.jpg', playSound: true });
});

test('progress is shown in the title, silent events stay silent, local icons are left out', () => {
  const toast = toToast(JSON.stringify({ game: 'Portal', displayName: 'Hours', icon: '/home/deck/icon.jpg', silent: true, progress: { current: 3, max: 10 } }));
  assert.deepEqual(toast, { title: 'Hours (3/10)', body: 'Portal', icon: null, playSound: false });
});

test('anything that is not a notification shows nothing', () => {
  assert.equal(toToast('not json'), null);
  assert.equal(toToast('null'), null);
  assert.equal(toToast(JSON.stringify({ game: 'Portal' })), null);
});
