'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dirFingerprint = require('../../app/util/dirFingerprint.js');
const dirCache = require('../../app/util/dirCache.js');

function tree() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-fingerprint-'));
  fs.mkdirSync(path.join(root, 'GameA'));
  fs.mkdirSync(path.join(root, 'GameB'));
  return root;
}

test('an untouched set of folders still matches its fingerprint', () => {
  const root = tree();
  try {
    const fingerprint = dirFingerprint.capture([root, path.join(root, 'GameA'), path.join(root, 'GameB')]);
    assert.equal(fingerprint.length, 3);
    assert.equal(dirFingerprint.matches(fingerprint), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

// Windows file timestamps advance in ~1ms ticks, so a change made inside the same tick as the
// capture lands on the identical mtime. Real scans and polls are minutes apart; the test only has
// to leave the tick it captured in.
function nextClockTick() {
  const start = Date.now();
  while (Date.now() - start < 5) {
    /* busy wait: the point is wall-clock time, not scheduling */
  }
}

test('a new install, a removed one and a deleted root all break the match', () => {
  for (const change of ['add', 'remove', 'delete-root']) {
    const root = tree();
    try {
      const fingerprint = dirFingerprint.capture([root, path.join(root, 'GameA')]);
      nextClockTick();
      if (change === 'add') fs.mkdirSync(path.join(root, 'GameC'));
      if (change === 'remove') fs.rmdirSync(path.join(root, 'GameB'));
      if (change === 'delete-root') fs.rmSync(root, { recursive: true, force: true });
      assert.equal(dirFingerprint.matches(fingerprint), false, `${change} must invalidate the fingerprint`);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});

test('no baseline never counts as unchanged', () => {
  assert.equal(dirFingerprint.matches(null), false);
  assert.equal(dirFingerprint.matches([]), false);
});

test('a scope reports the directories it actually read', () => {
  const root = tree();
  try {
    dirCache.beginScope();
    dirCache.readdir(root);
    dirCache.readdir(path.join(root, 'GameA'));
    dirCache.readdir(path.join(root, 'GameA')); // second read is served from the memo
    dirCache.readdir(path.join(root, 'does-not-exist'));
    dirCache.endScope();

    const visited = dirCache.lastVisitedDirs();
    assert.deepEqual(visited, [root, path.join(root, 'GameA')], 'each readable directory is listed once');
    assert.equal(dirFingerprint.matches(dirFingerprint.capture(visited)), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('a save folder gaining an appid marker file breaks the match too', () => {
  const root = tree();
  try {
    const fingerprint = dirFingerprint.capture([root, path.join(root, 'GameA')]);
    nextClockTick();
    fs.writeFileSync(path.join(root, 'GameA', 'steam_appid.txt'), '480');
    assert.equal(dirFingerprint.matches(fingerprint), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('the executable walk stays out of the fingerprint surface', () => {
  const root = tree();
  try {
    dirCache.beginScope();
    dirCache.readdir(root);
    dirCache.readdir(path.join(root, 'GameA'), { track: false });
    dirCache.endScope();
    assert.deepEqual(dirCache.lastVisitedDirs(), [root], 'an untracked read is memoized but not fingerprinted');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
