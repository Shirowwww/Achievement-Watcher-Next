'use strict';

/*
  Issue #91: a game Steam itself runs (legit, or added through SteamTools / LuaTools) never raised
  an AW Next notification, only Steam's own pop-up. With the setting on, Steam's stats folder is
  watched like an emulator save root; with it off (the default) nothing about Steam is watched.
*/
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');

const steamClientStats = require(path.join(__dirname, '..', 'util', 'steamClientStats.js'));

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-steamclient-'));
const steam = path.join(temp, 'Steam');
const stats = path.join(steam, 'appcache', 'stats');
fs.mkdirSync(stats, { recursive: true });

const on = { notification: { steamClient: true } };

test('off by default, and nothing to watch without Steam', () => {
  assert.equal(steamClientStats.steamClientRoot({ notification: {} }, { clientDir: steam }), null);
  assert.equal(steamClientStats.steamClientRoot({ notification: { steamClient: false } }, { clientDir: steam }), null);
  assert.equal(steamClientStats.steamClientRoot(on, { clientDir: '' }), null);
  assert.equal(steamClientStats.steamClientRoot(on, { clientDir: path.join(temp, 'NoSteam') }), null);
});

test("on, Steam's stats folder is watched for user stats files only", () => {
  const root = steamClientStats.steamClientRoot(on, { clientDir: steam });
  assert.equal(root.dir, stats);
  assert.equal(root.options.steamClient, true);
  assert.equal(root.options.recursive, false);
  assert.ok(root.options.filter.test(path.join(stats, 'UserGameStats_274782616_1392860.bin')));
  assert.equal(root.options.filter.test(path.join(stats, 'UserGameStatsSchema_1392860.bin')), false, 'the schema never changes on an unlock');
  assert.deepEqual(steamClientStats.statsFileIds('UserGameStats_274782616_1392860.bin'), { accountId: '274782616', appid: '1392860' });
});

test("the bin becomes the rows an emulator save gives, with Steam's own unlock time", () => {
  const file = path.join(stats, 'UserGameStats_274782616_1392860.bin');
  let asked = null;
  const rows = steamClientStats.readSteamClientUnlocks(file, {
    readStats: (query) => {
      asked = query;
      return [
        { apiname: 'FIRST_STEPS', achieved: 1, unlocktime: 1791150000 },
        { apiname: 'COLLECT_ALL', achieved: 0, unlocktime: 0, progress: 3, max_progress: 10 },
      ];
    },
  });
  assert.deepEqual(asked, { statsDir: stats, appid: '1392860', accountId: '274782616' });
  assert.deepEqual(rows, [
    { name: 'FIRST_STEPS', Achieved: true, CurProgress: 0, MaxProgress: 0, UnlockTime: 1791150000 },
    { name: 'COLLECT_ALL', Achieved: false, CurProgress: 3, MaxProgress: 10, UnlockTime: 0 },
  ]);
  assert.throws(() => steamClientStats.readSteamClientUnlocks(file, { readStats: () => null }), /no achievement list/);
});

test('the Watchdog sends the root and the bin through its usual path', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'watchdog.js'), 'utf8');
  assert.match(source, /steamClientStats\.steamClientRoot\(self\.options\)/);
  assert.match(source, /options\.steamClient \? async \(\) => steamClientStats\.readSteamClientUnlocks\(name\)/);
  // Years of real unlocks sit in these files: a first observation must not replay the latest three.
  assert.match(source, /\(!options\.steamClient \|\| justUnlocked\)/);
});

test.after(() => fs.rmSync(temp, { recursive: true, force: true }));
