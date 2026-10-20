'use strict';

/*
  The first-start guide counts what each folder holds with the library's own readers. It used to ask
  only the emulator-config reader, which answers nothing for an appid-named save root, so a GSE
  Saves folder full of games was reported as holding none.
*/

const assert = require('node:assert/strict');
const Module = require('node:module');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { makeTempDir } = require('../helpers/tempDir');

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'electron') return { ipcRenderer: { sendSync: () => false, invoke: async () => null } };
  if (request === '@electron/remote' || request.startsWith('@electron/remote/')) return {};
  return originalLoad.call(this, request, parent, isMain);
};
const achievements = require('../../app/parser/achievements.js');
achievements.initDebug({ isDev: false, userDataPath: makeTempDir('aw-preview-logs-') });
test.after(() => {
  Module._load = originalLoad;
});

const EVERY_SOURCE = { steamEmu: true, rpcs3: true, shadps4: true, kytyps5: true, xenia: true, xlln: true, markerpatch: true, madnesspatch: true, pcports: true, socialClub: true, ps4recomp: true };

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

test('an appid-named save root counts every game it holds, as the library will list them', async () => {
  const root = path.join(makeTempDir('aw-preview-'), 'GSE Saves');
  write(path.join(root, '400', 'achievements.json'), '{}');
  write(path.join(root, '1086940', 'achievements.json'), '{}');
  fs.mkdirSync(path.join(root, 'settings'), { recursive: true });

  const games = await achievements.previewWatchedFolder(root, EVERY_SOURCE);
  assert.deepEqual(games.map((g) => [g.appid, g.source]).sort(), [
    ['1086940', 'Goldberg'],
    ['400', 'Goldberg'],
  ]);
});

test('a folder with nothing to read holds nothing, and a source switched off reads nothing', async () => {
  const empty = makeTempDir('aw-preview-empty-');
  write(path.join(empty, 'readme.txt'), 'hello');
  assert.deepEqual(await achievements.previewWatchedFolder(empty, EVERY_SOURCE), []);

  const root = path.join(makeTempDir('aw-preview-off-'), 'GSE Saves');
  write(path.join(root, '400', 'achievements.json'), '{}');
  assert.deepEqual(await achievements.previewWatchedFolder(root, { ...EVERY_SOURCE, steamEmu: false }), []);
});
