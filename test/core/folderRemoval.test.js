'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { findRemovalBlocker } = require(path.join(__dirname, '..', '..', 'app', 'util', 'folderRemoval.js'));

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'aw-removal-'));
}

test('a folder nothing holds open reports no blocker', () => {
  const dir = tempDir();
  try {
    fs.writeFileSync(path.join(dir, 'game.exe'), 'x');
    fs.mkdirSync(path.join(dir, 'data'));
    fs.writeFileSync(path.join(dir, 'data', 'pak0.bin'), 'x');
    assert.deepStrictEqual(findRemovalBlocker(dir), { busy: null, denied: null });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// A read-only attribute is not a permission problem: the Recycle Bin takes such a file, and a
// permanent delete clears the attribute itself, so reporting it would send people chasing UAC.
test('a read-only file is not reported as a permission blocker', () => {
  const dir = tempDir();
  const file = path.join(dir, 'readme.txt');
  try {
    fs.writeFileSync(file, 'x');
    fs.chmodSync(file, 0o444);
    assert.deepStrictEqual(findRemovalBlocker(dir), { busy: null, denied: null });
  } finally {
    fs.chmodSync(file, 0o666);
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('an unreadable or missing folder answers instead of throwing', () => {
  assert.deepStrictEqual(findRemovalBlocker(path.join(os.tmpdir(), 'aw-removal-does-not-exist')), { busy: null, denied: null });
  assert.deepStrictEqual(findRemovalBlocker(''), { busy: null, denied: null });
  assert.deepStrictEqual(findRemovalBlocker(null), { busy: null, denied: null });
});

test('the walk stops at the probe limit instead of opening every file of a game folder', () => {
  const dir = tempDir();
  try {
    for (let i = 0; i < 12; i++) fs.writeFileSync(path.join(dir, `asset${i}.bin`), 'x');
    assert.deepStrictEqual(findRemovalBlocker(dir, { limit: 3 }), { busy: null, denied: null });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
