'use strict';

/*
  A game update or a DLC adds achievements to Steam's list, and AW only re-checks a cached list every
  3 days, never on the first scan of a session. A save holding an achievement the cached list has never
  heard of is the one clear sign the list is out of date, so that alone re-checks it, once a day.
*/

const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { makeTempDir } = require('../helpers/tempDir');

const steam = require('../../app/parser/steam.js');

const BASE = { name: 'ACH_1', displayName: 'One', description: 'First.', hidden: 0 };
const DLC = { name: 'DLC_1', displayName: 'Expansion', description: 'From the DLC.', hidden: 0 };

function cachedSchema(record = {}) {
  const temp = makeTempDir('aw-schema-unknown-');
  fs.mkdirSync(path.join(temp, 'logs'), { recursive: true });
  steam.initDebug({ isDev: false, userDataPath: temp });
  const file = path.join(temp, 'steam_cache', 'schema', 'english', '620.db');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(
    file,
    JSON.stringify({ name: 'Portal 2', appid: '620', img: {}, achievement: { total: 1, list: [{ ...BASE }] }, ...record })
  );
  return { temp, file, read: () => JSON.parse(fs.readFileSync(file, 'utf8')) };
}

function fetcher(answer) {
  const calls = [];
  const fetchSchema = async (cfg) => {
    calls.push(cfg.appID);
    return typeof answer === 'function' ? answer() : answer;
  };
  return { calls, fetchSchema };
}

test('an achievement the save has but the cached list lacks is fetched now and added to both', async () => {
  const cache = cachedSchema();
  const live = [{ ...BASE, Achieved: true }];
  const { calls, fetchSchema } = fetcher([{ ...BASE }, { ...DLC }]);

  const added = await steam.recheckForUnknownAchievements({ appID: '620', lang: 'english' }, live, { fetchSchema });

  assert.equal(added, 1);
  assert.deepEqual(calls, ['620']);
  assert.deepEqual(
    live.map((entry) => entry.name),
    ['ACH_1', 'DLC_1'],
    'the game being built gets the new achievement'
  );
  assert.equal(live[0].Achieved, true, 'what the save already applied stays');
  const record = cache.read();
  assert.deepEqual(
    record.achievement.list.map((entry) => entry.name),
    ['ACH_1', 'DLC_1'],
    'and so does the cache, for the next scan and the Watchdog'
  );
  assert.equal(record.achievement.total, 2);
  assert.equal(record.achievement.list[0].Achieved, undefined, 'no unlock state is ever written into the cached schema');
  assert.ok(record.unknownCheckedAt > 0, 'the check is stamped');
});

test('a list checked less than a day ago is not fetched again', async () => {
  cachedSchema({ unknownCheckedAt: Date.now() - 60 * 60 * 1000 });
  const live = [{ ...BASE }];
  const { calls, fetchSchema } = fetcher([{ ...BASE }, { ...DLC }]);

  assert.equal(await steam.recheckForUnknownAchievements({ appID: '620', lang: 'english' }, live, { fetchSchema }), 0);
  assert.deepEqual(calls, [], 'a save whose entries were renamed for good would otherwise refetch on every scan');
  assert.equal(live.length, 1);
});

test('a list checked more than a day ago is fetched again', async () => {
  cachedSchema({ unknownCheckedAt: Date.now() - 25 * 60 * 60 * 1000 });
  const { calls, fetchSchema } = fetcher([{ ...BASE }, { ...DLC }]);
  assert.equal(await steam.recheckForUnknownAchievements({ appID: '620', lang: 'english' }, [{ ...BASE }], { fetchSchema }), 1);
  assert.deepEqual(calls, ['620']);
});

test('no answer from Steam changes nothing and leaves the next scan free to try', async () => {
  for (const answer of [[], { achievements: [], networkError: true }, () => Promise.reject(new Error('ENOTFOUND'))]) {
    const cache = cachedSchema();
    const live = [{ ...BASE }];
    const { fetchSchema } = fetcher(answer);
    assert.equal(await steam.recheckForUnknownAchievements({ appID: '620', lang: 'english' }, live, { fetchSchema }), 0);
    assert.equal(live.length, 1);
    assert.equal(cache.read().unknownCheckedAt, undefined, 'an empty or failed answer says nothing about the list');
  }
});

test('an answer with nothing new is stamped, so it is not asked again today', async () => {
  const cache = cachedSchema();
  const { fetchSchema } = fetcher([{ ...BASE }]);
  assert.equal(await steam.recheckForUnknownAchievements({ appID: '620', lang: 'english' }, [{ ...BASE }], { fetchSchema }), 0);
  assert.ok(cache.read().unknownCheckedAt > 0);
});

test('the user turning automatic updates off, the first scan of a session and an uncached game fetch nothing', async () => {
  cachedSchema();
  const { calls, fetchSchema } = fetcher([{ ...BASE }, { ...DLC }]);
  assert.equal(await steam.recheckForUnknownAchievements({ appID: '620', lang: 'english', disableAutoRefresh: true }, [{ ...BASE }], { fetchSchema }), 0);
  assert.equal(await steam.recheckForUnknownAchievements({ appID: '620', lang: 'english', fastStart: true }, [{ ...BASE }], { fetchSchema }), 0);
  assert.equal(await steam.recheckForUnknownAchievements({ appID: '999', lang: 'english' }, [{ ...BASE }], { fetchSchema }), 0);
  assert.deepEqual(calls, []);
});

test('a save unlock of an achievement the cached list lacked is shown once the list is re-checked', async (t) => {
  const userData = makeTempDir('aw-schema-unknown-scan-');
  fs.mkdirSync(path.join(userData, 'cfg'), { recursive: true });
  fs.mkdirSync(path.join(userData, 'logs'), { recursive: true });
  const schemaFile = path.join(userData, 'steam_cache', 'schema', 'english', '620.db');
  fs.mkdirSync(path.dirname(schemaFile), { recursive: true });
  fs.writeFileSync(schemaFile, JSON.stringify({ name: 'Portal 2', appid: '620', img: {}, achievement: { total: 1, list: [{ ...BASE }] } }));
  const saveDir = makeTempDir('aw-schema-unknown-save-');
  fs.writeFileSync(
    path.join(saveDir, 'achievements.json'),
    JSON.stringify({ ACH_1: { earned: true, earned_time: 1790000000 }, DLC_1: { earned: true, earned_time: 1790000100 } })
  );

  const originalLoad = Module._load;
  Module._load = function patchedLoad(request) {
    if (request === 'electron') return { ipcRenderer: { sendSync: () => false, invoke: async () => null, on() {}, send() {} } };
    if (request === '@electron/remote' || request.startsWith('@electron/remote/')) return { app: { getPath: () => userData } };
    return originalLoad.apply(this, arguments);
  };
  const achievements = require('../../app/parser/achievements.js');
  Module._load = originalLoad;
  achievements.initDebug({ isDev: false, userDataPath: userData });
  steam.initDebug({ isDev: false, userDataPath: userData });

  const realRecheck = steam.recheckForUnknownAchievements;
  const asked = [];
  steam.recheckForUnknownAchievements = async (cfg, list) => {
    asked.push(cfg.appID);
    list.push({ ...DLC });
    return 1;
  };
  t.after(() => {
    steam.recheckForUnknownAchievements = realRecheck;
  });

  const record = { appid: '620', source: 'Goldberg', data: { type: 'file', path: saveDir } };
  const option = { achievement: { lang: 'english', showHidden: true }, achievement_source: {}, steam: {}, fastStart: true };
  const game = await achievements.getSavedAchievementsForAppid(option, record, [record]);

  assert.deepEqual(asked, ['620'], 'the save named an achievement the list lacked, so the list is re-checked');
  const dlc = game.achievement.list.find((entry) => entry.name === 'DLC_1');
  assert.ok(dlc, 'the new achievement is on the page');
  assert.equal(Boolean(dlc.Achieved), true, 'with the unlock the save already holds');
  assert.equal(game.achievement.unlocked, 2);
});
