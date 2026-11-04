'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { contentSignature } = require('../../app/util/presetSignature.js');

function presetFolder(t, files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-signature-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  for (const [name, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), text);
  }
  return dir;
}

test('rewritten dates and another place leave the signature as it was', (t) => {
  const files = { 'index.html': '<p>card</p>', 'style.css': 'p{}', 'fonts/a.ttf': 'font' };
  const first = presetFolder(t, files);
  const before = contentSignature([first]);
  const later = new Date(Date.now() + 3600000);
  for (const name of Object.keys(files)) fs.utimesSync(path.join(first, name), later, later);
  assert.equal(contentSignature([first]), before);
  // The same preset installed elsewhere, as after an update.
  assert.equal(contentSignature([presetFolder(t, files)]), before);
});

test('a changed, added or renamed file changes the signature, in a subfolder too', (t) => {
  const dir = presetFolder(t, { 'index.html': '<p>card</p>', 'fonts/a.ttf': 'font' });
  const signatures = [contentSignature([dir])];
  fs.writeFileSync(path.join(dir, 'fonts', 'a.ttf'), 'other font');
  signatures.push(contentSignature([dir]));
  fs.writeFileSync(path.join(dir, 'extra.css'), '');
  signatures.push(contentSignature([dir]));
  fs.renameSync(path.join(dir, 'extra.css'), path.join(dir, 'moved.css'));
  signatures.push(contentSignature([dir]));
  assert.equal(new Set(signatures).size, signatures.length);
});

test('a missing folder and a layer folder each count', (t) => {
  const dir = presetFolder(t, { 'index.html': 'x' });
  const layer = presetFolder(t, { 'layer.json': '{}' });
  assert.notEqual(contentSignature([dir, layer]), contentSignature([dir]));
  assert.equal(contentSignature([dir, null]), contentSignature([dir]));
  assert.notEqual(contentSignature([path.join(dir, 'gone')]), contentSignature([]));
});
