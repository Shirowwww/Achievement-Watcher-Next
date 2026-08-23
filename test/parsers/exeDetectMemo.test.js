'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const exeDetect = require('../../app/parser/exeDetect.js');
const exeCandidateCache = require('../../app/util/exeCandidateCache.js');

function writeBytes(file, size) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.alloc(size, 1));
}

function install(name) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `aw-${name}-`));
  const gameDir = path.join(root, 'game');
  const userData = path.join(root, 'userData');
  fs.mkdirSync(userData, { recursive: true });
  writeBytes(path.join(gameDir, 'RealGame.exe'), 1000);
  writeBytes(path.join(gameDir, 'Tools', 'Helper.exe'), 10);
  return { root, gameDir, userData };
}

// Counting readdirSync is the point of the memo: the walk is what costs, not the scoring.
function countingReaddir(fn) {
  const real = fs.readdirSync;
  const dirs = [];
  fs.readdirSync = function (...args) {
    dirs.push(String(args[0]));
    return real.apply(fs, args);
  };
  try {
    return { result: fn(), calls: dirs.length, dirs };
  } finally {
    fs.readdirSync = real;
  }
}

test('a second detection of the same folder reuses the walk and returns the same executable', () => {
  const { root, gameDir, userData } = install('exe-memo');
  try {
    exeCandidateCache.setUserDataPath(userData);
    const first = countingReaddir(() => exeDetect.detect(gameDir, 'Real Game', {}));
    const second = countingReaddir(() => exeDetect.detect(gameDir, 'Real Game', {}));
    assert.deepEqual(second.result, first.result);
    assert.ok(first.calls > 1, 'the first detection walks the install tree');
    /*
      The memo's signature reads the game folder's own listing, because timestamps alone can miss a
      file written in the same filesystem tick as the capture - that flakiness made this test fail
      about one run in four. Only that one non-recursive read is paid; the tree below it (14789
      directories on one real library) is never touched again.
    */
    assert.deepEqual(second.dirs, [gameDir], 'exactly the signature read, and nothing below it');
  } finally {
    exeCandidateCache.setUserDataPath(null);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('scoring options still apply to a memoized candidate list', () => {
  const { root, gameDir, userData } = install('exe-memo-taken');
  try {
    exeCandidateCache.setUserDataPath(userData);
    const first = exeDetect.detect(gameDir, 'Real Game', {});
    assert.equal(path.basename(first.full), 'RealGame.exe');
    const second = exeDetect.detect(gameDir, 'Real Game', { taken: [first.full] });
    assert.equal(path.basename(second.full), 'Helper.exe', 'a taken executable is skipped, memo or not');
  } finally {
    exeCandidateCache.setUserDataPath(null);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('a memo that names a deleted executable is rebuilt instead of being handed back', () => {
  const { root, gameDir, userData } = install('exe-memo-stale');
  try {
    exeCandidateCache.setUserDataPath(userData);
    const first = exeDetect.detect(gameDir, 'Real Game', {});
    assert.equal(path.basename(first.full), 'RealGame.exe');

    // Remove the winner and restore the folder timestamps, so only the stale-entry guard can catch it.
    const before = fs.statSync(gameDir);
    fs.rmSync(first.full);
    fs.utimesSync(gameDir, before.atime, before.mtime);

    const second = exeDetect.detect(gameDir, 'Real Game', {});
    assert.ok(second, 'the remaining executable is still detected');
    assert.equal(path.basename(second.full), 'Helper.exe');
  } finally {
    exeCandidateCache.setUserDataPath(null);
    fs.rmSync(root, { recursive: true, force: true });
  }
});
