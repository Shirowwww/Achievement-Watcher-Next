'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { discoverSmartFolders } = require('../../app/util/smartFindDiscovery.js');

test('Smart Find preserves discovery order, metadata and validation results', async () => {
  const accepted = { path: '/games/saves', detector: 'Known achievement-data location', notify: true };
  const rejected = { path: '/games/unknown', detector: 'Unknown' };
  const library = { path: '/games/library', detector: 'Known games folder' };
  const calls = [];
  const result = await discoverSmartFolders({
    userDir: {
      findEntries: async () => (calls.push('find-saves'), [accepted, rejected]),
      check: async (dir) => (calls.push(`check:${dir}`), dir === accepted.path),
    },
    libraryDirs: { findEntries: async () => (calls.push('find-libraries'), [library]) },
  });
  assert.deepEqual(result, {
    saveEntries: [{ entry: accepted, accepted: true }, { entry: rejected, accepted: false }],
    libraryEntries: [library],
  });
  assert.deepEqual(calls, ['find-saves', `check:${accepted.path}`, `check:${rejected.path}`, 'find-libraries']);
});

test('Smart Find propagates errors rather than returning partial success', async () => {
  let searchedLibraries = false;
  await assert.rejects(
    discoverSmartFolders({
      userDir: {
        findEntries: async () => [{ path: '/unreadable' }],
        check: async () => { throw new Error('failed validation'); },
      },
      libraryDirs: { findEntries: async () => { searchedLibraries = true; return []; } },
    }),
    /failed validation/
  );
  assert.equal(searchedLibraries, false);
});
