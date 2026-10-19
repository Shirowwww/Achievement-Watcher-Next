'use strict';

// Issue #91: a game Steam runs (legit, or added through SteamTools/LuaTools) moves the open library
// as soon as Steam rewrites its stats bin, instead of at the next rescan.

const assert = require('node:assert/strict');
const test = require('node:test');
const { watchSteamAppcache, SETTLE_MS } = require('../../app/util/steamAppcacheWatch.js');

function harness({ rows, baseline = () => null, isWanted = () => true }) {
  let listener = null;
  const unlocks = [];
  const progress = [];
  const reads = [];
  const watcher = watchSteamAppcache({
    statsDir: 'C:/Steam/appcache/stats',
    readStats: (args) => {
      reads.push(args);
      return rows();
    },
    baseline,
    isWanted,
    onUnlock: (unlock) => unlocks.push(unlock),
    onProgress: (counter) => progress.push(counter),
    watch: (dir, opts, cb) => {
      listener = cb;
      return { close() {}, on() {} };
    },
  });
  const change = (name) => listener('change', name);
  const settle = () => new Promise((resolve) => setTimeout(resolve, SETTLE_MS + 50));
  return { watcher, unlocks, progress, reads, change, settle };
}

const row = (apiname, achieved, unlocktime = 0) => ({ apiname, achieved, unlocktime });
const counter = (apiname, progress, max) => ({ apiname, achieved: 0, unlocktime: 0, progress, max_progress: max });

test('only achievements earned since the last scan are reported', async () => {
  let current = [row('A', 1, 10), row('B', 0)];
  const h = harness({ rows: () => current, baseline: () => [row('A', 1, 10), row('B', 0)] });
  h.change('UserGameStats_274782616_1392860.bin');
  await h.settle();
  assert.deepEqual(h.unlocks, [], 'nothing new against the scan cache');

  current = [row('A', 1, 10), row('B', 1, 20)];
  h.change('UserGameStats_274782616_1392860.bin');
  await h.settle();
  assert.deepEqual(h.unlocks, [{ appid: '1392860', name: 'B', time: 20 }]);
  assert.deepEqual(h.reads[0], { statsDir: 'C:/Steam/appcache/stats', appid: '1392860', accountId: '274782616' });
});

test('a burst of writes is read once, after it settles', async () => {
  const h = harness({ rows: () => [row('A', 1, 5)] });
  for (let i = 0; i < 5; i++) h.change('UserGameStats_1_2.bin');
  await h.settle();
  assert.equal(h.reads.length, 1);
  assert.deepEqual(h.unlocks, [{ appid: '2', name: 'A', time: 5 }]);
});

test('schema bins, other files and a closed library are ignored', async () => {
  let open = false;
  const h = harness({ rows: () => [row('A', 1)], isWanted: () => open });
  h.change('UserGameStatsSchema_2.bin');
  h.change('something.tmp');
  h.change('UserGameStats_1_2.bin');
  await h.settle();
  assert.equal(h.reads.length, 0);
  open = true;
  h.change('UserGameStats_1_2.bin');
  await h.settle();
  assert.equal(h.reads.length, 1);
});

test('an unreadable bin reports nothing and does not poison the next read', async () => {
  let current = null;
  const h = harness({ rows: () => current, baseline: () => [] });
  h.change('UserGameStats_1_2.bin');
  await h.settle();
  current = [row('A', 1, 3)];
  h.change('UserGameStats_1_2.bin');
  await h.settle();
  assert.deepEqual(h.unlocks, [{ appid: '2', name: 'A', time: 3 }]);
});

// Little Nightmares III through OnlineFix's Friend's Pass: a toybox is a counter in Steam's own
// bin, so a one-time unlock moved the library live while the toybox count waited for a rescan.
test('a counter that moves without an unlock reaches the library too', async () => {
  let current = [counter('ACH_TOYBOX', 3, 10), row('ACH_CHAPTER', 0)];
  const h = harness({ rows: () => current, baseline: () => [counter('ACH_TOYBOX', 3, 10), row('ACH_CHAPTER', 0)] });
  h.change('UserGameStats_274782616_1392860.bin');
  await h.settle();
  assert.deepEqual(h.progress, [], 'nothing moved against the scan cache');

  current = [counter('ACH_TOYBOX', 4, 10), row('ACH_CHAPTER', 0)];
  h.change('UserGameStats_274782616_1392860.bin');
  await h.settle();
  assert.deepEqual(h.progress, [{ appid: '1392860', name: 'ACH_TOYBOX', current: 4, max: 10 }]);
  assert.deepEqual(h.unlocks, []);

  h.change('UserGameStats_274782616_1392860.bin');
  await h.settle();
  assert.equal(h.progress.length, 1, 'the same value is not reported twice');
});

test('a counter reaching its goal reports the unlock, not a progress step', async () => {
  let current = [counter('ACH_TOYBOX', 9, 10)];
  const h = harness({ rows: () => current, baseline: () => [counter('ACH_TOYBOX', 9, 10)] });
  current = [{ ...counter('ACH_TOYBOX', 10, 10), achieved: 1, unlocktime: 30 }];
  h.change('UserGameStats_1_1392860.bin');
  await h.settle();
  assert.deepEqual(h.unlocks, [{ appid: '1392860', name: 'ACH_TOYBOX', time: 30 }]);
  assert.deepEqual(h.progress, []);
});
