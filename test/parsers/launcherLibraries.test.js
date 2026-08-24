'use strict';

/*
  The launcher-configuration route into library discovery. Everything here is a layout the launcher
  itself wrote, so the fixtures are the real files/registry shapes rather than a folder named after
  a guess: a per-game Epic .item manifest, the LauncherInstalled.dat roll-up, the GOG/Ubisoft
  registry index and the binary .GamingRoot pointer Windows writes for Xbox game drives.
*/

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const launcherLibraries = require('../../app/parser/launcherLibraries.js');

function tmpdir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function makeLibrary(root, names) {
  for (const name of names) fs.mkdirSync(path.join(root, name), { recursive: true });
  return root;
}

test('an Epic .item manifest contributes the folder that holds it, not the game folder', () => {
  const tmp = tmpdir('aw-epic-manifests-');
  const library = makeLibrary(path.join(tmp, 'Epic Games'), ['Fortnite', 'Rocket League']);
  const manifests = path.join(tmp, 'Manifests');
  fs.mkdirSync(manifests, { recursive: true });
  fs.writeFileSync(
    path.join(manifests, 'ABC.item'),
    JSON.stringify({ InstallLocation: path.join(library, 'Fortnite'), DisplayName: 'Fortnite' }),
    'utf8'
  );
  // A manifest that is not JSON must not take the readable ones down with it.
  fs.writeFileSync(path.join(manifests, 'BROKEN.item'), '{not json', 'utf8');

  const locations = launcherLibraries.epicInstallLocations(manifests);
  assert.deepEqual(locations, [path.join(library, 'Fortnite')]);
  assert.equal(launcherLibraries.libraryRootFromInstallDir(locations[0]), library);
});

test('the LauncherInstalled.dat roll-up is read when a per-game manifest is gone', () => {
  const tmp = tmpdir('aw-epic-rollup-');
  const library = makeLibrary(path.join(tmp, 'Epic Games'), ['Alan Wake 2', 'Control']);
  const dat = path.join(tmp, 'LauncherInstalled.dat');
  fs.writeFileSync(
    dat,
    JSON.stringify({ InstallationList: [{ InstallLocation: path.join(library, 'Control'), AppName: 'Control' }, { InstallLocation: '' }] }),
    'utf8'
  );

  assert.deepEqual(launcherLibraries.epicLauncherInstalledLocations(dat), [path.join(library, 'Control')]);
  assert.deepEqual(launcherLibraries.epicLauncherInstalledLocations(path.join(tmp, 'missing.dat')), []);
});

test('a parent that holds a single game is not a library root', () => {
  const tmp = tmpdir('aw-single-game-');
  const only = makeLibrary(path.join(tmp, 'Solo'), ['The Only Game']);
  // The point of a library root is the SIBLINGS it exposes to the scan; one game has none.
  assert.equal(launcherLibraries.libraryRootFromInstallDir(path.join(only, 'The Only Game')), '');
});

test('drive roots, profile containers and Steam libraries are never contributed', () => {
  const tmp = tmpdir('aw-guarded-roots-');
  const steam = makeLibrary(path.join(tmp, 'SteamLibrary'), ['GameA', 'GameB']);
  assert.equal(launcherLibraries.libraryRootFromInstallDir(path.join(steam, 'GameA')), '', 'Steam libraries belong to the Steam source');

  // A game installed straight onto a drive would otherwise turn the whole drive into a scan root.
  assert.equal(launcherLibraries.libraryRootFromInstallDir('D:\\SomeGame'), '');

  const profile = makeLibrary(path.join(tmp, 'Profile'), ['GameA', 'GameB']);
  assert.equal(
    launcherLibraries.libraryRootFromInstallDir(path.join(profile, 'GameA'), { reserved: [profile.toLowerCase()] }),
    '',
    'a reserved container must be rejected even when it looks like a library'
  );

  assert.equal(
    launcherLibraries.libraryRootFromInstallDir(path.join(tmp, 'Program Files', 'WindowsApps', 'Something')),
    '',
    'WindowsApps is not readable by a scan'
  );
});

test('the GOG and Ubisoft registry indexes are read through their documented value names', () => {
  const tmp = tmpdir('aw-registry-installs-');
  const gogLibrary = makeLibrary(path.join(tmp, 'GOG Games'), ['Cyberpunk 2077', 'The Witcher 3']);
  const ubiLibrary = makeLibrary(path.join(tmp, 'Ubisoft', 'games'), ['Far Cry 6', 'Anno 1800']);

  const registry = {
    listRegistryAllSubkeys(hive, key) {
      if (hive !== 'HKLM') return [];
      if (key === 'Software/WOW6432Node/GOG.com/Games') return ['1423049311'];
      if (key === 'Software/WOW6432Node/Ubisoft/Launcher/Installs') return ['5595'];
      return [];
    },
    readRegistryString(hive, key, valueName) {
      if (key.endsWith('1423049311') && valueName === 'path') return path.join(gogLibrary, 'Cyberpunk 2077');
      if (key.endsWith('5595') && valueName === 'InstallDir') return path.join(ubiLibrary, 'Far Cry 6');
      return null;
    },
  };

  assert.deepEqual(launcherLibraries.gogInstallLocations(registry), [path.join(gogLibrary, 'Cyberpunk 2077')]);
  assert.deepEqual(launcherLibraries.ubisoftInstallLocations(registry), [path.join(ubiLibrary, 'Far Cry 6')]);
});

test('a .GamingRoot pointer is decoded, and anything that is not one is refused', () => {
  const pointer = Buffer.concat([Buffer.from('RGBX', 'latin1'), Buffer.from('XboxGames\u0000', 'utf16le')]);
  assert.equal(launcherLibraries.parseGamingRoot(pointer, 'D:'), 'D:\\XboxGames');

  // A leading separator in the stored relative path must not escape to the drive root.
  const rooted = Buffer.concat([Buffer.from('RGBX', 'latin1'), Buffer.from('\\Games\u0000', 'utf16le')]);
  assert.equal(launcherLibraries.parseGamingRoot(rooted, 'E:'), 'E:\\Games');

  assert.equal(launcherLibraries.parseGamingRoot(Buffer.from('NOPE\u0000', 'latin1'), 'D:'), '');
  assert.equal(launcherLibraries.parseGamingRoot(Buffer.alloc(0), 'D:'), '');
  assert.equal(launcherLibraries.parseGamingRoot(Buffer.concat([Buffer.from('RGBX', 'latin1'), Buffer.from('\u0000', 'utf16le')]), 'D:'), '');
});

test('an unreadable drive contributes nothing instead of throwing', () => {
  assert.deepEqual(launcherLibraries.xboxGamingRoots(['\\\\server\\share', '', 'not a drive']), []);
});

test('discovery deduplicates roots and tags each with the launcher that named it', () => {
  const tmp = tmpdir('aw-launcher-discovery-');
  const library = makeLibrary(path.join(tmp, 'Epic Games'), ['GameA', 'GameB']);
  const manifests = path.join(tmp, 'Manifests');
  fs.mkdirSync(manifests, { recursive: true });
  // Two games in the same folder must produce one root, not two.
  fs.writeFileSync(path.join(manifests, 'A.item'), JSON.stringify({ InstallLocation: path.join(library, 'GameA') }), 'utf8');
  fs.writeFileSync(path.join(manifests, 'B.item'), JSON.stringify({ InstallLocation: path.join(library, 'GameB') }), 'utf8');

  const emptyRegistry = { listRegistryAllSubkeys: () => [], readRegistryString: () => null };
  const found = launcherLibraries.discoverLauncherLibraryRoots({
    epicManifestsDir: manifests,
    epicLauncherInstalledDat: path.join(tmp, 'missing.dat'),
    registry: emptyRegistry,
    drives: [],
  });

  assert.deepEqual(found, [{ path: library, detector: 'Epic Games library' }]);
});
