'use strict';

/*
  A MarkerPatch or MadnessPatch install, or a recompiled game, should be found without anyone
  adding its folder: in a detected game library by the automatic detection, and on a Steam copy
  through Steam's own install record, which the scan and the Watchdog read too.
*/

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-patched-discovery-'));
const library = path.join(tmp, 'Games');
const steamClient = path.join(tmp, 'Steam');
const steamLibrary = path.join(tmp, 'SteamLibrary');

function write(file, content = '') {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function markerPatchInstall(root) {
  write(path.join(root, 'deadspace2.exe'), 'MZ');
  write(path.join(root, 'MarkerPatch.ini'), '[General]\n');
  write(path.join(root, 'achievements', 'txt', 'en.txt'), 'Platinum|All of them\n');
  write(path.join(root, 'achievements', 'img', '0.png'), 'png');
  return root;
}

function madnessPatchInstall(root) {
  const bin = path.join(root, 'Binaries', 'Win32');
  write(path.join(bin, 'AliceMadnessReturns.exe'), 'MZ');
  write(path.join(bin, 'MadnessPatch.ini'), '[General]\n');
  write(path.join(bin, 'dinput8.dll'), 'MZ');
  write(path.join(bin, 'Achievements', 'txt', 'en.txt'), 'Platinum|All of them\n');
  write(path.join(bin, 'Achievements', 'img', '0.png'), 'png');
  return root;
}

// A Steam client whose second library holds Alice: Madness Returns.
write(path.join(steamClient, 'steam.exe'), 'MZ');
write(
  path.join(steamClient, 'steamapps', 'libraryfolders.vdf'),
  `"libraryfolders"\n{\n\t"0"\n\t{\n\t\t"path"\t\t"${steamClient.replace(/\\/g, '\\\\')}"\n\t}\n\t"1"\n\t{\n\t\t"path"\t\t"${steamLibrary.replace(/\\/g, '\\\\')}"\n\t}\n}\n`
);
write(path.join(steamLibrary, 'steamapps', 'appmanifest_19680.acf'), '"AppState"\n{\n\t"appid"\t\t"19680"\n\t"installdir"\t\t"Alice Madness Returns"\n}\n');
const steamAlice = madnessPatchInstall(path.join(steamLibrary, 'steamapps', 'common', 'Alice Madness Returns'));

const steamLibraryModule = require('../../app/parser/steamLibrary.js');

const originalLoad = Module._load;
Module._load = function patchedLoad(request) {
  if (request === 'electron') return { ipcRenderer: { sendSync: () => false, invoke: async () => null } };
  if (request === '@electron/remote' || request.startsWith('@electron/remote/')) return { app: { getPath: () => tmp } };
  if (request.endsWith('saveRoots.js')) {
    const real = originalLoad.apply(this, arguments);
    return { ...real, defaultSteamEmuSaveRoots: () => [], discoverEmulatorRoots: async () => [], discoverLibraryRoots: async () => [library] };
  }
  if (request.endsWith('steamLibrary.js')) {
    return { ...steamLibraryModule, installDirOf: (appid) => steamLibraryModule.installDirOf(appid, { clientDir: steamClient }) };
  }
  return originalLoad.apply(this, arguments);
};
const userDir = require('../../app/parser/userDir.js');
const markerpatch = require('../../app/parser/markerpatch.js');
const madnesspatch = require('../../app/parser/madnesspatch.js');

test.after(() => {
  Module._load = originalLoad;
});

test('Steam names the folder an app is installed in, across its libraries', () => {
  assert.equal(path.resolve(steamLibraryModule.installDirOf('19680', { clientDir: steamClient })), path.resolve(steamAlice));
  assert.equal(steamLibraryModule.installDirOf('47780', { clientDir: steamClient }), '', 'not installed here');
  assert.equal(steamLibraryModule.installDirOf('19680', { clientDir: '' }), '', 'no Steam client, no answer');
});

test('each patch reader asks Steam about its own game only', () => {
  const asked = [];
  const installDirOf = (appid) => {
    asked.push(appid);
    return appid === '19680' ? steamAlice : '';
  };
  assert.deepEqual(markerpatch.knownInstallRoots({ installDirOf }), []);
  assert.deepEqual(madnesspatch.knownInstallRoots({ installDirOf }), [steamAlice]);
  assert.deepEqual(asked, ['47780', '19680']);
  assert.deepEqual(markerpatch.knownInstallRoots({ installDirOf: () => { throw new Error('no registry'); } }), [], 'a failing lookup is no install');
});

test('automatic detection finds patched and recompiled games in a library and on Steam', async () => {
  const deadSpace = markerPatchInstall(path.join(library, 'Dead Space 2'));
  const hollow = path.join(library, 'GoW2 Hollow');
  write(path.join(hollow, 'GoW2Hollow_Launcher.exe'), 'MZ');
  write(path.join(hollow, 'SaveData', 'Achievements.json'), JSON.stringify({ achievements: [{ id: 1, name: 'First', unlocked: false }] }));
  // Named right, but not an unlock list: the reader refuses it.
  write(path.join(library, 'Impostor', 'SaveData', 'Achievements.json'), '{"progress": 3}');
  write(path.join(library, 'Impostor', 'Impostor.exe'), 'MZ');

  const found = await userDir.findEntries();
  const paths = new Set(found.map((entry) => path.resolve(entry.path).toLowerCase()));
  const has = (dir) => paths.has(path.resolve(dir).toLowerCase());

  assert.equal(has(deadSpace), true, 'a MarkerPatch install in a library');
  assert.equal(has(hollow), true, 'a recompiled game in a library, kept as its own folder');
  assert.equal(has(path.join(library, 'Impostor')), false, 'a file merely named like an unlock list');
  assert.equal(has(steamAlice), true, 'a MadnessPatch install on a Steam copy');
});
