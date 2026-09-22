'use strict';

/*
  The MadnessPatch watcher finds its game through the same shared parser the library uses, from the
  folders the user added. What is checked here is the wiring the parser cannot cover: which folders
  are considered, that the CheckPoint folder is still watched for correctly before it exists, and the
  bit decode used to compare a profile against its own baseline.
*/
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const madnesspatchWatch = require(path.join(__dirname, '..', 'console', 'madnesspatchWatch.js'));
const { makeInstall } = require(path.join(__dirname, '..', '..', 'test', 'helpers', 'madnesspatch.js'));

const { discoverGame, watchedFolders, iconPathOf, resolveWatchTarget, bitsOf } = madnesspatchWatch._internal;

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-madnesspatchwatch-'));

try {
  const library = path.join(temp, 'Games');
  fs.mkdirSync(library, { recursive: true });
  const installDir = makeInstall(library, 'Alice Madness Returns');
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

  // resolveWatchTarget: the CheckPoint folder already exists.
  const existing = path.join(temp, 'Documents', 'My Games', 'Alice Madness Returns', 'AliceGame', 'CheckPoint');
  fs.mkdirSync(existing, { recursive: true });
  assert.deepStrictEqual(resolveWatchTarget(existing), { ready: true, dir: existing });

  // Nothing under a fresh Documents exists yet: the wait starts at Documents itself.
  const freshDocuments = path.join(temp, 'FreshDocuments');
  fs.mkdirSync(freshDocuments, { recursive: true });
  const missingChain = path.join(freshDocuments, 'My Games', 'Alice Madness Returns', 'AliceGame', 'CheckPoint');
  const target = resolveWatchTarget(missingChain);
  assert.strictEqual(target.ready, false);
  assert.strictEqual(target.watchDir, freshDocuments);
  assert.strictEqual(target.nextExpected, 'My Games');

  assert.strictEqual(iconPathOf({ icon: 'file:///C:/cache/madnesspatch/0.png' }), path.normalize('C:/cache/madnesspatch/0.png'));
  assert.strictEqual(iconPathOf({ icon: 'https://example.invalid/0.png' }), '', 'only local files are passed to the toast');
  assert.strictEqual(iconPathOf({}), '');

  assert.deepStrictEqual(bitsOf(0b101n), ['MADNESSPATCH_0', 'MADNESSPATCH_2']);
  assert.deepStrictEqual(bitsOf(0n), [], 'a flag with nothing set unlocks nothing');
  assert.deepStrictEqual(bitsOf(null), [], 'an unreadable profile is treated as no unlocks, not an error');

  console.log('PASS: the MadnessPatch watcher covers the folders the library scans, CheckPoint or not yet, per profile');
} finally {
  try {
    fs.rmSync(temp, { recursive: true, force: true });
  } catch {
    /* the OS will reclaim it */
  }
}
