'use strict';

// #157: a reused library loads again only the games its last scan left undescribed, instead of
// rebuilding the whole library on every opening.

const assert = require('node:assert/strict');
const Module = require('node:module');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { makeTempDir } = require('../helpers/tempDir');

// gameIndex reads the data folder once, when it loads: a throwaway one, never the real profile.
process.env.AW_USER_DATA = makeTempDir('aw-reload-userdata-');

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'electron') {
    return { ipcRenderer: { sendSync: () => false, invoke: async () => null } };
  }
  if (request === '@electron/remote' || request.startsWith('@electron/remote/')) return {};
  return originalLoad.call(this, request, parent, isMain);
};

const achievements = require('../../app/parser/achievements.js');

achievements.initDebug({ isDev: false, userDataPath: process.env.AW_USER_DATA });

test('a reload of undescribed games loads only those, and one that fails again stays retryable', async (t) => {
  const saveDir = makeTempDir('aw-reload-save-');
  fs.writeFileSync(path.join(saveDir, 'achievements.ini'), '[SOME_ACH]\nAchieved=1\n');
  const described = { appid: '700', source: 'Goldberg', data: { type: 'file', path: saveDir } };
  const stillMissing = { appid: '701', source: 'Goldberg', data: { type: 'file', path: saveDir } };
  const asked = [];
  const realLoad = achievements.getSavedAchievementsForAppid;
  achievements.getSavedAchievementsForAppid = async (option, record) => {
    asked.push(record.appid);
    return record.appid === '700' ? { appid: '700', name: 'Described', img: {}, achievement: { total: 1, unlocked: 1, list: [] } } : undefined;
  };
  t.after(() => {
    achievements.getSavedAchievementsForAppid = realLoad;
  });
  const streamed = [];

  const games = await achievements.reloadGames({ achievement: { lang: 'english' } }, [described, stillMissing], (game) => streamed.push(game.appid));

  assert.deepEqual(asked, ['700', '701']);
  assert.deepEqual(streamed, ['700', '701']);
  assert.equal(games[0].name, 'Described');
  assert.equal(games[1].provisional, true, 'a second failure is still an entry, not a missing card');
  assert.deepEqual(games[1].retry, stillMissing, 'and it can be retried again next time');
});

test('a reload of nothing loads nothing', async () => {
  assert.deepEqual(await achievements.reloadGames({ achievement: {} }, []), []);
  assert.deepEqual(await achievements.reloadGames({ achievement: {} }, null), []);
});
