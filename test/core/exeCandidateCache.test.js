'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const exeCandidateCache = require('../../app/util/exeCandidateCache.js');

function scratch() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-exememo-'));
  const userData = path.join(root, 'userData');
  const gameDir = path.join(root, 'game');
  fs.mkdirSync(userData, { recursive: true });
  fs.mkdirSync(gameDir, { recursive: true });
  fs.writeFileSync(path.join(gameDir, 'game.exe'), 'binary');
  return { root, userData, gameDir };
}

const CANDIDATES = [{ name: 'game.exe', full: 'C:/game/game.exe', size: 10, depth: 0, dir: 'C:/game' }];

test('a memo is served while the folder is unchanged and dropped once it is touched', () => {
  const { root, userData, gameDir } = scratch();
  try {
    exeCandidateCache.setUserDataPath(userData);
    assert.equal(exeCandidateCache.read(gameDir), null, 'nothing is memoized yet');
    exeCandidateCache.write(gameDir, CANDIDATES);
    assert.deepEqual(exeCandidateCache.read(gameDir), CANDIDATES);

    fs.writeFileSync(path.join(gameDir, 'patch.exe'), 'new');
    assert.equal(exeCandidateCache.read(gameDir), null, 'a new file changes the folder signature');
  } finally {
    exeCandidateCache.setUserDataPath(null);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('the memo hands out copies so scoring cannot write back into it', () => {
  const { root, userData, gameDir } = scratch();
  try {
    exeCandidateCache.setUserDataPath(userData);
    exeCandidateCache.write(gameDir, CANDIDATES);
    const first = exeCandidateCache.read(gameDir);
    first[0].score = 42;
    assert.equal(exeCandidateCache.read(gameDir)[0].score, undefined);
  } finally {
    exeCandidateCache.setUserDataPath(null);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('a flushed memo survives a restart and forget() empties it', () => {
  const { root, userData, gameDir } = scratch();
  try {
    exeCandidateCache.setUserDataPath(userData);
    exeCandidateCache.write(gameDir, CANDIDATES);
    exeCandidateCache.flush();
    assert.ok(fs.existsSync(path.join(userData, 'cache', 'discovery', 'exeCandidates.json')));

    // A fresh path assignment drops the in-memory store, the way a new process would.
    exeCandidateCache.setUserDataPath(null);
    exeCandidateCache.setUserDataPath(userData);
    assert.deepEqual(exeCandidateCache.read(gameDir), CANDIDATES);

    exeCandidateCache.forget();
    exeCandidateCache.flush();
    assert.equal(exeCandidateCache.read(gameDir), null);
  } finally {
    exeCandidateCache.setUserDataPath(null);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('a missing folder is never memoized', () => {
  const { root, userData } = scratch();
  try {
    exeCandidateCache.setUserDataPath(userData);
    const gone = path.join(root, 'not-installed');
    exeCandidateCache.write(gone, CANDIDATES);
    assert.equal(exeCandidateCache.read(gone), null);
    assert.equal(exeCandidateCache.signature(gone), null);
  } finally {
    exeCandidateCache.setUserDataPath(null);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('the store stays bounded, keeping the folders seen most recently', () => {
  const { root, userData } = scratch();
  try {
    exeCandidateCache.setUserDataPath(userData);
    const dirs = [];
    for (let i = 0; i < exeCandidateCache.MAX_ENTRIES + 5; i += 1) {
      const dir = path.join(root, `game-${i}`);
      fs.mkdirSync(dir);
      dirs.push(dir);
      exeCandidateCache.write(dir, CANDIDATES);
    }
    assert.equal(exeCandidateCache.read(dirs[0]), null, 'the oldest folders are evicted');
    assert.deepEqual(exeCandidateCache.read(dirs[dirs.length - 1]), CANDIDATES);
  } finally {
    exeCandidateCache.setUserDataPath(null);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('the memo expires when the filter rules that produced it change', () => {
  /*
    The stored list is ALREADY filtered, so it is a function of the install tree and of the rules
    exeDetect applied. Without the rules in the key, shipping a fix to those rules changed nothing
    for any folder a user had already scanned - the stale answer was served until the folder itself
    was touched, which for an installed game is never.
  */
  const { root, userData, gameDir } = scratch();
  try {
    exeCandidateCache.setUserDataPath(userData);
    exeCandidateCache.setRulesSalt('rules-v1');
    exeCandidateCache.write(gameDir, CANDIDATES);
    assert.deepEqual(exeCandidateCache.read(gameDir), CANDIDATES, 'served while the rules are the same');

    exeCandidateCache.setRulesSalt('rules-v2');
    assert.equal(exeCandidateCache.read(gameDir), null, 'a rules change invalidates the stored list');

    exeCandidateCache.setRulesSalt('rules-v1');
    assert.deepEqual(exeCandidateCache.read(gameDir), CANDIDATES, 'and the old entry is still keyed by the old rules');
  } finally {
    exeCandidateCache.setRulesSalt('');
    fs.rmSync(root, { recursive: true, force: true });
  }
});
