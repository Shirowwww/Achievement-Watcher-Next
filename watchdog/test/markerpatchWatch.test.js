'use strict';

/*
  The MarkerPatch watcher finds its game through the same shared parser the library uses, from the
  folders the user added. What is checked here is the wiring the parser cannot cover: which folders
  are considered, and that settings.txt is still watched for correctly when the EA Games folder (or
  even %LOCALAPPDATA% itself) does not exist yet - the first unlock is exactly the moment that tree
  appears.
*/
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const markerpatchWatch = require(path.join(__dirname, '..', 'console', 'markerpatchWatch.js'));
const { makeInstall } = require(path.join(__dirname, '..', '..', 'test', 'helpers', 'markerpatch.js'));

const { discoverGame, watchedFolders, iconPathOf, resolveWatchTarget } = markerpatchWatch._internal;

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-markerpatchwatch-'));

try {
  const library = path.join(temp, 'Games');
  fs.mkdirSync(library, { recursive: true });
  const installDir = makeInstall(library, 'Dead Space 2');
  const disabledLibrary = path.join(temp, 'Disabled');
  fs.mkdirSync(disabledLibrary, { recursive: true });
  makeInstall(disabledLibrary, 'Other Game');

  const configFile = path.join(temp, 'userdir.db');
  fs.writeFileSync(
    configFile,
    JSON.stringify([
      { path: library, enabled: true, notify: true },
      { path: disabledLibrary, enabled: false, notify: true },
    ])
  );

  assert.deepStrictEqual(watchedFolders(configFile), [library], 'a folder switched off is not watched');
  assert.deepStrictEqual(watchedFolders(path.join(temp, 'absent.db')), [], 'a missing folder list is empty, never an error');

  const found = discoverGame(configFile);
  assert.ok(found && found.detected, 'only the enabled library is searched');
  assert.strictEqual(found.root, path.resolve(installDir));

  assert.strictEqual(discoverGame(path.join(temp, 'absent.db')), null, 'no configured folders means no game');

  // resolveWatchTarget: the folder already exists.
  const existing = path.join(temp, 'EA Games', 'Dead Space 2');
  fs.mkdirSync(existing, { recursive: true });
  assert.deepStrictEqual(resolveWatchTarget(existing), { ready: true, dir: existing });

  // Neither "EA Games" nor "Dead Space 2" exist yet: the nearest existing ancestor is watched for
  // "EA Games" to appear first.
  const freshLocalAppData = path.join(temp, 'FreshLocalAppData');
  fs.mkdirSync(freshLocalAppData, { recursive: true });
  const missingBoth = path.join(freshLocalAppData, 'EA Games', 'Dead Space 2');
  const target = resolveWatchTarget(missingBoth);
  assert.strictEqual(target.ready, false);
  assert.strictEqual(target.watchDir, freshLocalAppData, 'the wait starts at the nearest folder that really exists');
  assert.strictEqual(target.nextExpected, 'EA Games');

  // "EA Games" exists but "Dead Space 2" does not yet: the wait moves one level down.
  const eaGames = path.join(freshLocalAppData, 'EA Games');
  fs.mkdirSync(eaGames, { recursive: true });
  const midway = resolveWatchTarget(path.join(eaGames, 'Dead Space 2'));
  assert.strictEqual(midway.ready, false);
  assert.strictEqual(midway.watchDir, eaGames);
  assert.strictEqual(midway.nextExpected, 'Dead Space 2');

  assert.strictEqual(iconPathOf({ icon: 'file:///C:/cache/markerpatch/0.png' }), path.normalize('C:/cache/markerpatch/0.png'));
  assert.strictEqual(iconPathOf({ icon: 'https://example.invalid/0.png' }), '', 'only local files are passed to the toast');
  assert.strictEqual(iconPathOf({}), '');

  console.log('PASS: the MarkerPatch watcher covers the folders the library scans, settings.txt or not yet');
} finally {
  try {
    fs.rmSync(temp, { recursive: true, force: true });
  } catch {
    /* the OS will reclaim it */
  }
}
