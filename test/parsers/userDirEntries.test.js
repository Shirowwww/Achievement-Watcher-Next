'use strict';

// The one reading of cfg/userdir.db the library and the Watchdog share.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { parseUserDirEntries, readUserDirEntries, userDirFile } = require('../../app/parser/userDirEntries.js');

test('every saved row is a watched folder unless it is disabled, whatever its notify field says', () => {
  const dir = path.resolve('saves');
  const rows = parseUserDirEntries([dir, { path: dir }, { path: dir, notify: false }, { path: dir, enabled: false, origin: 'auto' }]);
  assert.deepEqual(
    rows.map((row) => [row.notify, row.enabled, row.origin]),
    [
      [true, true, 'manual'],
      [true, true, 'manual'],
      [true, true, 'manual'],
      [true, false, 'auto'],
    ]
  );
});

test('rows without a usable path and a file that is not a list read as no folder', () => {
  assert.deepEqual(parseUserDirEntries([null, 3, {}, { path: '' }, { path: 42 }]), []);
  assert.deepEqual(parseUserDirEntries({ path: 'x' }), []);
});

test('a path written with the other slash style comes back in the native form', () => {
  const [row] = parseUserDirEntries([{ path: 'C:/Games/Saves' }]);
  assert.equal(row.path, path.resolve('C:/Games/Saves'));
});

test('a missing or unparsable file reads as no folder and is left untouched', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-userdir-entries-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const file = userDirFile(root);
  assert.deepEqual(readUserDirEntries(file), []);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, '{broken');
  assert.deepEqual(readUserDirEntries(file), []);
  assert.equal(fs.readFileSync(file, 'utf8'), '{broken');
});
