'use strict';

/*
  A PS3Recomp port reaches the library through the scan's own watched-folder pass, is listed once
  even when two watched folders hold it, can be switched off, and is filed as a PS3 title for
  rarity (Exophase's PS3 list, Sony's official rates by NP id) and the notification preset.
*/
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const test = require('node:test');
const { makeTempDir } = require('../helpers/tempDir');
const fixture = require('../helpers/ps3Recomp.js');

// The rarity cache folder is captured at require time: keep it in a sandbox.
const realUserData = process.env.AW_USER_DATA;
process.env.AW_USER_DATA = makeTempDir('aw-ps3recomp-userdata-');

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'electron') return { ipcRenderer: { sendSync: () => false, invoke: async () => null } };
  if (request === '@electron/remote' || request.startsWith('@electron/remote/')) return {};
  return originalLoad.call(this, request, parent, isMain);
};
const achievements = require('../../app/parser/achievements.js');
achievements.initDebug({ isDev: false, userDataPath: makeTempDir('aw-ps3recomp-logs-') });
test.after(() => {
  Module._load = originalLoad;
  if (realUserData === undefined) delete process.env.AW_USER_DATA;
  else process.env.AW_USER_DATA = realUserData;
});

test('a watched folder holding a PS3Recomp port previews it under its own source', async () => {
  const library = makeTempDir('aw-ps3recomp-preview-');
  fixture.makePort(path.join(library, 'Odyssey'));
  const games = await achievements.previewWatchedFolder(library, { ps3recomp: true });
  assert.deepEqual(games.map((g) => [g.appid, g.source, g.data.type]), [[`ps3recomp-${fixture.NPCOMMID}`, 'PS3 Recomp', 'ps3recomp']]);
  assert.deepEqual(await achievements.previewWatchedFolder(library, { ps3recomp: false }), [], 'the source switched off reads nothing');
});

test('PS3 Recomp rarity asks Sony for the NP id under the PS3 trophy service first', async () => {
  const rarity = require('../../app/util/rarity.js');
  const asked = [];
  const officialTrophyRates = async (request) => {
    asked.push(request);
    return { ok: true, entries: [{ name: '1', percent: 42.5 }, { name: '77', percent: 1 }] };
  };
  const list = [{ name: '0' }, { name: '1' }];
  const entries = await rarity.getRarityEntries('ps3recomp-NPWR00104_00', 'PS3 Recomp', { gameName: fixture.TITLE, achievements: list, npCommId: fixture.NPCOMMID, officialTrophyRates, forceRefresh: true });
  assert.deepEqual(asked, [{ npCommId: fixture.NPCOMMID, service: 'trophy' }]);
  assert.deepEqual(entries, [{ name: '1', percent: 42.5 }]);
});

test('PS3 Recomp follows the PS3 notification preset', () => {
  const { sourcePlatform } = require('../../app/util/notificationPreset.js');
  assert.equal(sourcePlatform('PS3 Recomp'), 'rpcs3');
});
