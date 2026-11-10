'use strict';

/*
  A recompiled port set straight in a game library (Settings > Game libraries) is read at every
  scan, without its folder being added under Settings > Folders. A watched folder keeps its port.
*/
const assert = require('node:assert/strict');
const Module = require('node:module');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { makeTempDir } = require('../helpers/tempDir');
const fixture = require('../helpers/ps4Recomp.js');

const library = makeTempDir('aw-library-ports-');
const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'electron') return { ipcRenderer: { sendSync: () => false, invoke: async () => null } };
  if (request === '@electron/remote' || request.startsWith('@electron/remote/')) return {};
  if (request.endsWith('libraryDirs.js')) {
    const real = originalLoad.call(this, request, parent, isMain);
    return { ...real, get: async () => [library] };
  }
  return originalLoad.call(this, request, parent, isMain);
};
const achievements = require('../../app/parser/achievements.js');
const ps4Recomp = require('../../app/parser/ps4Recomp.js');
achievements.initDebug({ isDev: false, userDataPath: makeTempDir('aw-library-ports-logs-') });
ps4Recomp.setDataRoot(makeTempDir('aw-library-ports-data-'));
test.after(() => {
  Module._load = originalLoad;
  ps4Recomp.setDataRoot('');
});

function recasted(root) {
  fixture.write(path.join(root, 'rcps4-probe.exe'), 'MZ');
  fixture.write(path.join(root, 'gamecore.so'), 'ELF');
  fixture.write(path.join(root, 'trophy.key'), fixture.TEST_KEY);
  fixture.makeGameDump(path.join(root, 'game', 'CUSA01073'), { titleId: 'CUSA01073', title: 'Ratchet & Clank', sets: [{ slot: 0, npcommid: 'NPWR08590_00', title: 'Ratchet & Clank' }] });
  return root;
}

test('a port in a game library is read at every scan, and left to the watched folder that holds it', async () => {
  const ratchet = recasted(path.join(library, 'ReCasted'));
  fs.mkdirSync(path.join(library, 'Regular Game'), { recursive: true });
  fs.writeFileSync(path.join(library, 'Regular Game', 'Regular.exe'), 'MZ');
  const source = { ps4recomp: true, pcports: true };

  const games = await achievements._internal.libraryPortGames(source, [], null);
  assert.deepEqual(games.map((game) => [game.appid, game.data.installRoot]), [['ps4recomp-NPWR08590_00', ratchet]]);
  assert.deepEqual(await achievements._internal.libraryPortGames(source, [ratchet], null), [], 'a watched folder is read once, as a folder');
  assert.deepEqual(await achievements._internal.libraryPortGames({ ps4recomp: false, pcports: true, x360recomp: false, ps3recomp: false }, [], null), [], 'its switch off, nothing');
});
