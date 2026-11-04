'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { findByReadingContentOfKnownConfigfilesIn } = require('../playtime/steam_appid_find.js');
const { nestedMarkerFitsExe } = require('../playtime/monitor.js');

function withTmp(fn) {
  return async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-marker-'));
    try {
      await fn(dir);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  };
}

function put(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

test(
  'a marker next to the exe is found and not flagged as nested',
  withTmp(async (dir) => {
    put(path.join(dir, 'steam_appid.txt'), '12345\n');
    assert.deepEqual(await findByReadingContentOfKnownConfigfilesIn(dir), { appid: '12345', nested: false });
  })
);

test(
  'a marker below the exe folder is found and flagged as nested (Unreal launcher at the game root)',
  withTmp(async (dir) => {
    put(path.join(dir, 'Binaries', 'Win64', 'steam_appid.txt'), '2202400');
    assert.deepEqual(await findByReadingContentOfKnownConfigfilesIn(dir), { appid: '2202400', nested: true });
  })
);

test(
  'an installer beside two games gets no appid',
  withTmp(async (downloads) => {
    put(path.join(downloads, 'Game One', 'steam_appid.txt'), '111');
    put(path.join(downloads, 'Game Two', 'Bin', 'steam_emu.ini'), '[Settings]\nAppId=222\n');
    await assert.rejects(findByReadingContentOfKnownConfigfilesIn(downloads), /AMBIGUOUS/);
  })
);

test(
  'an installer beside one game gets a nested marker, which the caller then refuses by name',
  withTmp(async (downloads) => {
    put(path.join(downloads, 'Dynasty Warriors Origins', 'steam_appid.txt'), '2202400');
    const marker = await findByReadingContentOfKnownConfigfilesIn(downloads);
    assert.equal(marker.nested, true);
    assert.equal(nestedMarkerFitsExe('Dynasty Warriors: Origins', path.join(downloads, 'MillenniumInstaller-Windows.exe')), false);
  })
);

test(
  'a code-named exe deep in a game gets the marker found in its Engine tree (searched from the game root)',
  withTmp(async (root) => {
    const exeDir = path.join(root, 'Game', 'Binaries', 'Win64');
    put(path.join(root, 'Game', 'Engine', 'Binaries', 'ThirdParty', 'Steamworks', 'Steamv157', 'Win64', 'steam_appid.txt'), '1285190');
    assert.deepEqual(await findByReadingContentOfKnownConfigfilesIn(path.join(root, 'Game'), exeDir), { appid: '1285190', nested: false });
  })
);

test(
  'a real game with a second, unrelated marker answers with the one on the exe path',
  withTmp(async (root) => {
    const exeDir = path.join(root, 'Game', 'Bin');
    put(path.join(exeDir, 'steam_appid.txt'), '555');
    put(path.join(root, 'Game', 'Tools', 'Helper', 'steam_appid.txt'), '480');
    assert.deepEqual(await findByReadingContentOfKnownConfigfilesIn(path.join(root, 'Game'), exeDir), { appid: '555', nested: false });
    // Searched from the exe folder itself, the marker beside the exe also wins.
    assert.deepEqual(await findByReadingContentOfKnownConfigfilesIn(exeDir), { appid: '555', nested: false });
  })
);

test('a nested marker is kept for a launcher in the game folder, dropped for an installer beside it', () => {
  const name = 'Dynasty Warriors: Origins';
  // Launcher at the root of the game (release-style folder, scene layout).
  assert.equal(nestedMarkerFitsExe(name, path.join('D:\\', 'Games', 'Dynasty.Warriors.Origins-RUNE', 'Launcher.exe')), true);
  // Launcher named after the game inside a generic folder.
  assert.equal(nestedMarkerFitsExe(name, path.join('D:\\', 'Games', 'DynastyWarriorsOrigins.exe')), true);
  // Installer run from a shared folder next to the unpacked game.
  assert.equal(nestedMarkerFitsExe(name, path.join('D:\\', 'Downloads', 'MillenniumInstaller-Windows.exe')), false);
  assert.equal(nestedMarkerFitsExe(name, path.join('D:\\', 'Downloads', 'setup.exe')), false);
});
