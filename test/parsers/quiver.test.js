'use strict';

// Quiver Launcher's library: which game folders it installed, from apps.json and settings.json.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { makeTempDir } = require('../helpers/tempDir.js');
const quiver = require('../../app/parser/quiver.js');

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value));
}

const hostAt = (localAppData) => ({ id: 'test', env: { LOCALAPPDATA: localAppData }, localPath: (p) => p });

test('installed games are found in the default Apps folder, or where Quiver was told to put them', () => {
  const local = makeTempDir('aw-quiver-');
  const root = path.join(local, 'QuiverLauncher');
  const elsewhere = makeTempDir('aw-quiver-moved-');
  writeJson(path.join(root, 'apps.json'), {
    apps: [
      { name: 'The Legend of Zelda: Twilight Princess', repository: 'TwilitRealm/dusklight', folderName: 'TheLegendOfZeldaTwilightPrincess-Dusklight' },
      { name: 'Super Mario 64', repository: 'HarbourMasters/Ghostship', folderName: 'SuperMario64-Ghostship', installPath: elsewhere },
      { name: 'Not installed', repository: 'someone/else', folderName: 'NotInstalled' },
    ],
  });
  fs.mkdirSync(path.join(root, 'Apps', 'TheLegendOfZeldaTwilightPrincess-Dusklight'), { recursive: true });

  const installs = quiver.installedFolders([hostAt(local)]);
  assert.deepEqual(
    installs.map((install) => [install.repository, install.dir]),
    [
      ['TwilitRealm/dusklight', path.join(root, 'Apps', 'TheLegendOfZeldaTwilightPrincess-Dusklight')],
      ['HarbourMasters/Ghostship', elsewhere],
    ]
  );
});

test('a moved install folder (AppsPath) and the older sectioned library are both read', () => {
  const local = makeTempDir('aw-quiver-');
  const root = path.join(local, 'QuiverLauncher');
  const apps = makeTempDir('aw-quiver-apps-');
  writeJson(path.join(root, 'settings.json'), { AppsPath: apps });
  writeJson(path.join(root, 'apps.json'), { standard: [{ name: 'DKR', folderName: 'DiddyKongRacing-DKRR' }] });
  const library = quiver.readLibrary(root);
  assert.equal(library.installs[0].dir, path.join(apps, 'DiddyKongRacing-DKRR'));
});

test('a folder name that is a path is never followed, and a broken library is no library', () => {
  const local = makeTempDir('aw-quiver-');
  const root = path.join(local, 'QuiverLauncher');
  writeJson(path.join(root, 'apps.json'), { apps: [{ folderName: '..' }, { folderName: '../../Windows' }, { folderName: 'a\\b' }, { installPath: 'relative\\path' }] });
  assert.deepEqual(quiver.readLibrary(root).installs, []);

  fs.writeFileSync(path.join(root, 'apps.json'), '{ not json');
  assert.equal(quiver.readLibrary(root), null);
  assert.deepEqual(quiver.libraries([hostAt(local), hostAt(makeTempDir('aw-quiver-none-'))]), []);
});

// apps/launcher/src/store.tsx (Install), src-tauri/src/apps_folder.rs and lib.rs of tgeorgiadis/quiver-launcher 4.0.
test('Quiver 4: installs.json under its app data folder, in its apps folder, a console folder, or a 3.x folder kept', () => {
  const appData = makeTempDir('aw-quiver4-');
  const root = path.join(appData, 'com.quiverlauncher.app');
  const adopted = makeTempDir('aw-quiver4-adopted-');
  writeJson(path.join(root, 'library.json'), [{ id: 'github:TwilitRealm/dusklight', slug: 'dusklight', overrides: { name: 'Dusklight' }, addedAt: 1 }]);
  writeJson(path.join(root, 'installs.json'), {
    'github:TwilitRealm/dusklight': { version: '1.0', folder: 'Dusklight', executables: ['Dusklight.exe'] },
    smb1r: { version: '1.0', folder: 'SMB1R', group: 'Ports/NES', executables: [] },
    ghostship: { version: '0.0.0', folder: 'Ghostship', dir: adopted, inApps: true, executables: [] },
    escape: { version: '1.0', folder: '..', executables: [] },
    climb: { version: '1.0', folder: 'x', group: '../..', executables: [] },
  });
  fs.mkdirSync(path.join(root, 'apps', 'Dusklight'), { recursive: true });
  fs.mkdirSync(path.join(root, 'apps', 'Ports', 'NES', 'SMB1R'), { recursive: true });

  const installs = quiver.installedFolders([{ id: 'test', env: { APPDATA: appData }, localPath: (p) => p }]);
  assert.deepEqual(
    installs.map((install) => [install.repository, install.name, install.dir]),
    [
      ['TwilitRealm/dusklight', 'Dusklight', path.join(root, 'apps', 'Dusklight')],
      ['', '', path.join(root, 'apps', 'Ports', 'NES', 'SMB1R')],
      ['', '', adopted],
    ]
  );
});

test('Quiver 4: an apps folder moved through apps-folder.json is read there', () => {
  const appData = makeTempDir('aw-quiver4-');
  const root = path.join(appData, 'com.quiverlauncher.app');
  const moved = makeTempDir('aw-quiver4-moved-');
  writeJson(path.join(root, 'apps-folder.json'), { path: moved });
  writeJson(path.join(root, 'installs.json'), { dkrr: { version: '1.0', folder: 'DKR-R', executables: [] } });
  assert.deepEqual(quiver.readInstalls(root).installs.map((install) => install.dir), [path.join(moved, 'DKR-R')]);
  fs.writeFileSync(path.join(root, 'installs.json'), '[1]');
  assert.equal(quiver.readInstalls(root), null);
});
