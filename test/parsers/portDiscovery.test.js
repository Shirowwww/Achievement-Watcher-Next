'use strict';

/*
  Smart Find and the recompiled ports: a port is found in a game library from the files its own
  reader recognises (ReCasted's runtime, a native PS4 port's trophy.key, a PS3Recomp launch.txt,
  an Xbox 360 or PC port's executable), before it has saved anything, and in the folders Quiver
  Launcher installed. A game that merely shares a file name is not taken.
*/
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { makeTempDir } = require('../helpers/tempDir');

const tmp = makeTempDir('aw-port-discovery-');
const library = path.join(tmp, 'Games');
const quiverApps = path.join(tmp, 'QuiverApps');

function write(file, content = '') {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

const originalLoad = Module._load;
Module._load = function patchedLoad(request) {
  if (request === 'electron') return { ipcRenderer: { sendSync: () => false, invoke: async () => null } };
  if (request === '@electron/remote' || request.startsWith('@electron/remote/')) return { app: { getPath: () => tmp } };
  if (request.endsWith('saveRoots.js')) {
    const real = originalLoad.apply(this, arguments);
    return { ...real, defaultSteamEmuSaveRoots: () => [], discoverEmulatorRoots: async () => [], discoverLibraryRoots: async () => [library] };
  }
  if (request.endsWith('quiver.js')) {
    const real = originalLoad.apply(this, arguments);
    return { ...real, installedFolders: () => [{ name: 'ReCasted', repository: '', folderName: 'ReCasted', dir: path.join(quiverApps, 'ReCasted') }] };
  }
  return originalLoad.apply(this, arguments);
};
const userDir = require('../../app/parser/userDir.js');

test.after(() => {
  Module._load = originalLoad;
});

function recasted(root) {
  write(path.join(root, 'rcps4-probe.exe'), 'MZ');
  write(path.join(root, 'gamecore.so'), 'ELF');
  write(path.join(root, 'recasted_config.json'), '{"game_path":"game/CUSA01073"}');
  return root;
}

test('Smart Find finds every kind of recompiled port in a library, before any save, and in Quiver installs', async () => {
  const ratchet = recasted(path.join(library, 'ReCasted'));
  const odin = path.join(library, 'Odin Sphere');
  write(path.join(odin, 'odin_sphere_leifthrasir.exe'), 'MZ');
  write(path.join(odin, 'trophy.key'), '00');
  write(path.join(odin, 'game', 'image', 'CUSA04787', 'boot.bin'), 'boot');
  const ps3 = path.join(library, 'Some PS3 Port');
  write(path.join(ps3, 'installer', 'launch.txt'), 'game=game.elf\n');
  const tmnt = path.join(library, 'TMNT Re-Shelled');
  write(path.join(tmnt, 'tmnt_turtles_in_time_reshelled.exe'), 'MZ');
  const smas = path.join(library, 'SMAS');
  write(path.join(smas, 'SuperMarioAllStars.exe'), 'MZ');
  const plain = path.join(library, 'Plain Game');
  write(path.join(plain, 'Plain.exe'), 'MZ');
  write(path.join(plain, 'settings.json'), '{}');
  write(path.join(plain, 'trophy.key'), '00');
  const viaQuiver = recasted(path.join(quiverApps, 'ReCasted'));

  const found = await userDir.findEntries();
  const paths = new Set(found.map((entry) => path.resolve(entry.path).toLowerCase()));
  const has = (dir) => paths.has(path.resolve(dir).toLowerCase());

  assert.equal(has(ratchet), true, 'ReCasted by its runtime');
  assert.equal(has(odin), true, 'a native PS4 port by its trophy.key and boot image');
  assert.equal(has(ps3), true, 'a PS3Recomp port by its launch.txt');
  assert.equal(has(tmnt), true, 'an Xbox 360 port by its executable, nothing saved yet');
  assert.equal(has(smas), true, 'a PC port that saves beside itself, by its executable');
  assert.equal(has(viaQuiver), true, 'a port Quiver installed outside every library');
  assert.equal(has(plain), false, 'a game that only shares file names');
});

test('every scan looks at the top of each game library folder for a port, never inside a watched folder', () => {
  const portFinder = require('../../app/parser/portFinder.js');
  const games = path.join(tmp, 'Library');
  recasted(path.join(games, 'Ratchet'));
  write(path.join(games, 'PS3 Port', 'installer', 'launch.txt'), 'game=x\n');
  write(path.join(games, 'Regular', 'Regular.exe'), 'MZ');
  recasted(path.join(games, 'Watched'));
  const readdir = (dir) => {
    try {
      return fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return null;
    }
  };
  const found = portFinder.libraryPorts([games, path.join(tmp, 'missing')], readdir, (dir) => dir === path.join(games, 'Watched'));
  assert.deepEqual(found.map((dir) => path.basename(dir)).sort(), ['PS3 Port', 'Ratchet']);
});
