'use strict';

// A DLC or an update adds achievements the cached list does not have yet. The Watchdog used to drop
// such an unlock as ACH_NOT_FOUND_IN_SCHEMA and record it in the baseline, so it was never notified.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const USER_DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-unknown-unlock-'));
process.env.AW_USER_DATA = USER_DATA;
require('../util/userData.js').resetCache();

const steam = require('../steam.js');

const SCHEMA_DIR = path.join(USER_DATA, 'steam_cache', 'schema', 'english');
const BASE = { name: 'BASE_1', displayName: 'Base', description: 'Base game', icon: 'b.jpg', icongray: 'bg.jpg', hidden: 0 };
const DLC = { name: 'DLC_1', displayName: 'DLC', description: 'From the DLC', icon: 'd.jpg', icongray: 'dg.jpg', hidden: 0, archived: false };

function writeCache(appid, extra = {}) {
  fs.mkdirSync(SCHEMA_DIR, { recursive: true });
  const record = { name: 'Game', appid, achievement: { total: 1, list: [{ ...BASE }] }, ...extra };
  fs.writeFileSync(path.join(SCHEMA_DIR, `${appid}.db`), JSON.stringify(record));
}
const readCache = (appid) => JSON.parse(fs.readFileSync(path.join(SCHEMA_DIR, `${appid}.db`), 'utf8'));

test.after(() => fs.rmSync(USER_DATA, { recursive: true, force: true }));

test('a DLC unlock the cached list lacks is added to the list and to the cache', async () => {
  writeCache('620');
  const live = [{ ...BASE }];
  const calls = [];
  const fetchSchema = async (appid, lang) => {
    calls.push([appid, lang]);
    return [{ ...BASE, archived: false }, { ...DLC }];
  };

  assert.equal(await steam.recheckForUnknownUnlocks('620', 'english', live, { fetchSchema }), 1);
  assert.deepEqual(calls, [['620', 'english']]);
  assert.deepEqual(
    live.map((a) => a.name),
    ['BASE_1', 'DLC_1']
  );
  const cached = readCache('620');
  assert.deepEqual(
    cached.achievement.list.map((a) => a.name),
    ['BASE_1', 'DLC_1']
  );
  assert.equal(cached.achievement.total, 2);
  assert.ok(cached.unknownCheckedAt > 0);

  // Asked once a day at most, like the library's re-check of the same file; a list kept in memory
  // still takes what that file now holds.
  const later = [{ ...BASE }];
  assert.equal(await steam.recheckForUnknownUnlocks('620', 'english', later, { fetchSchema }), 1);
  assert.equal(calls.length, 1);
  assert.deepEqual(
    later.map((a) => a.name),
    ['BASE_1', 'DLC_1']
  );
});

test('no answer from Steam leaves the cache untouched and unstamped', async () => {
  writeCache('630');
  const live = [{ ...BASE }];
  assert.equal(await steam.recheckForUnknownUnlocks('630', 'english', live, { fetchSchema: async () => null }), 0);
  assert.equal(live.length, 1);
  assert.equal(readCache('630').unknownCheckedAt, undefined);
});

test('an id that is not a Steam appid, an unknown language or an uncached game asks nothing', async () => {
  let called = 0;
  const fetchSchema = async () => {
    called += 1;
    return [{ ...DLC }];
  };
  writeCache('c4763f236d08423eb47b4c3008779c84');
  assert.equal(await steam.recheckForUnknownUnlocks('c4763f236d08423eb47b4c3008779c84', 'english', [{ ...BASE }], { fetchSchema }), 0);
  assert.equal(await steam.recheckForUnknownUnlocks('..\\..\\cfg', 'english', [{ ...BASE }], { fetchSchema }), 0);
  assert.equal(await steam.recheckForUnknownUnlocks('620', 'not-a-language', [{ ...BASE }], { fetchSchema }), 0);
  assert.equal(await steam.recheckForUnknownUnlocks('999', 'english', [{ ...BASE }], { fetchSchema }), 0);
  assert.equal(called, 0);
});

// watchdog.js does not load outside its process; the order of these steps is what fixes the bug.
test('the Watchdog re-checks the list before the index the unlock loop reads, unless the user turned updates off', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'watchdog.js'), 'utf8');
  const recheckAt = src.indexOf('await steam.recheckForUnknownUnlocks(');
  const rebuildAt = src.indexOf('schemaIndex = buildSchemaIndex(game.achievement.list', recheckAt);
  const loopAt = src.indexOf('for (const i of platinumLastOrder(achievements, schemaIndex');
  assert.ok(recheckAt !== -1 && rebuildAt > recheckAt && loopAt > rebuildAt);
  const gate = src.slice(src.lastIndexOf('\n', src.lastIndexOf('newUnknownUnlocks(', recheckAt)), recheckAt);
  assert.match(gate, /disableAutoRefresh/);
});
