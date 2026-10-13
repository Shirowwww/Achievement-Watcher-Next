'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { fileStamp, sameStamp } = require('../util/fileStamp.js');

function tempFile(content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-stamp-'));
  const file = path.join(dir, 'options.ini');
  fs.writeFileSync(file, content);
  return { dir, file };
}

test('reading the settings or touching only their access time keeps the stamp', (t) => {
  const { dir, file } = tempFile('[achievement]\nlang=english\n');
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  // A whole second, so setting the access time below can hand the same modification time back.
  const written = new Date(Math.floor(Date.now() / 1000) * 1000);
  fs.utimesSync(file, written, written);
  const loaded = fileStamp(file);

  fs.readFileSync(file);
  fs.utimesSync(file, new Date(written.getTime() + 60 * 60 * 1000), written);

  assert.equal(sameStamp(loaded, fileStamp(file)), true);
});

test('a write is a new stamp, even one that keeps the same size', (t) => {
  const { dir, file } = tempFile('[achievement]\nlang=english\n');
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const loaded = fileStamp(file);

  const later = new Date(fs.statSync(file).mtimeMs + 2000);
  fs.writeFileSync(file, '[achievement]\nlang=italian\n');
  fs.utimesSync(file, later, later);
  assert.equal(sameStamp(loaded, fileStamp(file)), false);

  fs.writeFileSync(file, '[achievement]\nlang=english\n[extra]\n');
  assert.equal(sameStamp(loaded, fileStamp(file)), false);
});

test('a missing file never matches, so a reload is not skipped on a guess', (t) => {
  const { dir, file } = tempFile('x');
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const loaded = fileStamp(file);
  fs.rmSync(file);

  assert.equal(fileStamp(file), null);
  assert.equal(sameStamp(loaded, null), false);
  assert.equal(sameStamp(null, null), false);
});
