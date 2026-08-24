'use strict';

/*
  Smart Find reads libraryDirs.findEntries(), and that is the only place the two detection routes
  meet: folders recognised by name, and folders a launcher already recorded. The merge has to keep
  both, deduplicate across them, and never let one route's failure take the other down.
*/

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const libraryDirs = require('../../app/parser/libraryDirs.js');
const saveRoots = require('../../app/parser/saveRoots.js');
const launcherLibraries = require('../../app/parser/launcherLibraries.js');

function withStubs(stubs, fn) {
  const originals = stubs.map(([target, key]) => [target, key, target[key]]);
  for (const [target, key, value] of stubs) target[key] = value;
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      for (const [target, key, value] of originals) target[key] = value;
    });
}

test('both detection routes reach Smart Find, each tagged with what found it', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-libdirs-merge-'));
  const named = path.join(tmp, 'Jeux');
  const launcher = path.join(tmp, 'Epic Games');
  fs.mkdirSync(named, { recursive: true });
  fs.mkdirSync(launcher, { recursive: true });

  await withStubs(
    [
      [saveRoots, 'discoverLibraryRoots', async () => [named]],
      [launcherLibraries, 'discoverLauncherLibraryRoots', () => [{ path: launcher, detector: 'Epic Games library' }]],
    ],
    async () => {
      const entries = await libraryDirs.findEntries();
      assert.deepEqual(entries, [
        { path: named, origin: 'auto', enabled: true, detector: 'Known games folder' },
        { path: launcher, origin: 'auto', enabled: true, detector: 'Epic Games library' },
      ]);
      assert.deepEqual(await libraryDirs.find(), [named, launcher]);
    }
  );
});

test('a folder both routes find is offered once, keeping the name-based label', async () => {
  const shared = path.join(os.tmpdir(), 'aw-libdirs-shared', 'Games');

  await withStubs(
    [
      [saveRoots, 'discoverLibraryRoots', async () => [shared]],
      // A trailing separator and a different case are the same folder to Windows.
      [launcherLibraries, 'discoverLauncherLibraryRoots', () => [{ path: `${shared.toUpperCase()}\\`, detector: 'Epic Games library' }]],
    ],
    async () => {
      const entries = await libraryDirs.findEntries();
      assert.equal(entries.length, 1);
      assert.equal(entries[0].detector, 'Known games folder');
    }
  );
});

test('a launcher whose configuration cannot be read does not lose the name-based results', async () => {
  const named = path.join(os.tmpdir(), 'aw-libdirs-resilient', 'Repacks');

  await withStubs(
    [
      [saveRoots, 'discoverLibraryRoots', async () => [named]],
      [
        launcherLibraries,
        'discoverLauncherLibraryRoots',
        () => {
          throw new Error('registry unavailable');
        },
      ],
    ],
    async () => {
      const entries = await libraryDirs.findEntries();
      assert.deepEqual(entries.map((entry) => entry.path), [named]);
    }
  );
});

