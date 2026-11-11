'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { discoverSmartFolders } = require('../../app/util/smartFindDiscovery.js');

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test('Smart Find answers every found save folder with its check, in the order found, and the libraries', async () => {
  const kept = { path: '/games/saves', detector: 'Known achievement-data location', notify: true };
  const refused = { path: '/games/unknown', detector: 'Unknown' };
  const library = { path: '/games/library', detector: 'Known games folder' };

  const result = await discoverSmartFolders({
    userDir: {
      findEntries: async () => [kept, refused],
      // The first check answers last: the order must be the one the folders were found in.
      check: async (dir) => {
        await delay(dir === kept.path ? 20 : 0);
        return dir === kept.path;
      },
    },
    libraryDirs: { findEntries: async () => [library] },
  });

  assert.deepEqual(result, {
    saveEntries: [
      { entry: kept, accepted: true },
      { entry: refused, accepted: false },
    ],
    libraryEntries: [library],
  });
});

test('the save folders and the libraries are searched together, and the checks a few at once', async () => {
  let searching = 0;
  let searchedTogether = false;
  let checking = 0;
  let mostChecksAtOnce = 0;
  const search = (found) => async () => {
    searching += 1;
    await delay(10);
    searchedTogether = searchedTogether || searching === 2;
    searching -= 1;
    return found;
  };

  const result = await discoverSmartFolders({
    userDir: {
      findEntries: search(Array.from({ length: 20 }, (unused, i) => ({ path: `/saves/${i}` }))),
      check: async () => {
        checking += 1;
        mostChecksAtOnce = Math.max(mostChecksAtOnce, checking);
        await delay(2);
        checking -= 1;
        return true;
      },
    },
    libraryDirs: { findEntries: search([]) },
  });

  assert.equal(searchedTogether, true);
  assert.equal(result.saveEntries.length, 20);
  assert.ok(mostChecksAtOnce > 1 && mostChecksAtOnce <= 6, `${mostChecksAtOnce} checks at once`);
});

test('a folder whose check fails is refused with the reason, and the others are still answered', async () => {
  const result = await discoverSmartFolders({
    userDir: {
      findEntries: async () => [{ path: '/unreadable' }, { path: '/fine' }],
      check: async (dir) => {
        if (dir === '/unreadable') throw new Error('EACCES: permission denied');
        return true;
      },
    },
    libraryDirs: { findEntries: async () => [] },
  });

  assert.deepEqual(result.saveEntries, [
    { entry: { path: '/unreadable' }, accepted: false, error: 'EACCES: permission denied' },
    { entry: { path: '/fine' }, accepted: true },
  ]);
});

test('a search that fails fails Smart Find: a partial list would read as nothing else to find', async () => {
  await assert.rejects(
    discoverSmartFolders({
      userDir: { findEntries: async () => [], check: async () => true },
      libraryDirs: {
        findEntries: async () => {
          throw new Error('drive listing failed');
        },
      },
    }),
    /drive listing failed/
  );
});
