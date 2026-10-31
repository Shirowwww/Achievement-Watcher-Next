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
