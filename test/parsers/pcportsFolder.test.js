'use strict';

/*
  A Link's Awakening DX HD install keeps its unlock list outside the game folder, so no emulator
  config names it. Adding the install in Settings > Folders must still be accepted, from the game
  folder itself or from a folder inside it.
*/

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-pcports-folder-'));

const originalLoad = Module._load;
Module._load = function patchedLoad(request) {
  if (request === 'electron') return { ipcRenderer: { sendSync: () => false, invoke: async () => null } };
  if (request === '@electron/remote' || request.startsWith('@electron/remote/')) return { app: { getPath: () => tmp } };
  return originalLoad.apply(this, arguments);
};
const userDir = require('../../app/parser/userDir.js');
Module._load = originalLoad;
const { makeInstall } = require('../helpers/pcports.js');

test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

test('the game folder, or a folder inside it, is accepted', async () => {
  const root = makeInstall(path.join(tmp, 'Link Awakening'));
  const direct = await userDir.diagnose(root);
  assert.equal(direct.accepted, true);
  assert.equal(direct.code, 'pcports');

  const inner = await userDir.diagnose(path.join(root, 'Data'));
  assert.equal(inner.accepted, true, 'Data is inside the game');
  assert.equal(path.resolve(inner.canonicalPath), path.resolve(root), 'and the game folder is the one kept');
});

test('a game folder with the exe but no achievement data is refused', async () => {
  const root = makeInstall(path.join(tmp, 'Plain Port'), { images: 0 });
  assert.equal((await userDir.diagnose(root)).accepted, false);
});
