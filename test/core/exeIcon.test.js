'use strict';

/*
  Reading a game's icon out of its own executable.

  Electron's app.getFileIcon() was the first answer and the wrong one: the Windows shell returns the
  generic "application" glyph for a file that has no icon, so it can never say "this one has none" -
  and the picker ended up offering every game the same blue window picture. Parsing the PE gives a
  real answer either way, which is the whole point.

  Windows executables are the fixtures here: they are guaranteed present, and notepad/cmd carry
  icons in the two shapes that exist (a 256x256 PNG entry and a small DIB one).
*/

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');

const exeIcon = require(path.join(__dirname, '..', '..', 'app', 'util', 'exeIcon.js'));

const SYSTEM32 = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32');
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

test('a real executable yields a decodable image, not a placeholder', { skip: process.platform !== 'win32' && 'Windows only' }, () => {
  const icon = exeIcon.extractIcon(path.join(SYSTEM32, 'notepad.exe'));
  assert.ok(icon, 'notepad.exe carries an icon');
  assert.ok(['png', 'ico'].includes(icon.format));
  assert.ok(icon.data.length > 0);
  assert.ok(icon.width >= 16 && icon.height >= 16);
  if (icon.format === 'png') assert.ok(icon.data.subarray(0, 4).equals(PNG_MAGIC), 'a png entry is returned as a png');
  else assert.equal(icon.data.readUInt16LE(2), 1, 'a dib entry is wrapped in an icon-type .ico');
});

test('the largest entry of the group is the one returned', { skip: process.platform !== 'win32' && 'Windows only' }, () => {
  const icon = exeIcon.extractIcon(path.join(SYSTEM32, 'notepad.exe'));
  // Modern system binaries ship a 256x256 entry; picking the smallest would give a blurry tile.
  assert.ok(icon.width >= 32, `expected a large entry, got ${icon.width}x${icon.height}`);
});

test('a file that is not a PE, or has no icon, answers null rather than a placeholder', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-exeicon-'));
  const text = path.join(dir, 'notreally.exe');
  fs.writeFileSync(text, 'MZ but nothing else at all');
  assert.equal(exeIcon.extractIcon(text), null);

  const empty = path.join(dir, 'empty.exe');
  fs.writeFileSync(empty, '');
  assert.equal(exeIcon.extractIcon(empty), null);

  assert.equal(exeIcon.extractIcon(path.join(dir, 'missing.exe')), null);
  assert.equal(exeIcon.extractIcon(''), null);
  assert.equal(exeIcon.extractIcon(null), null);
});

test('a directory is not mistaken for an executable', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-exeicon-dir-'));
  assert.equal(exeIcon.extractIcon(dir), null);
});

test('a group entry stores 0 for the 256 pixel side', () => {
  const group = Buffer.alloc(6 + 14);
  group.writeUInt16LE(1, 2);
  group.writeUInt16LE(1, 4);
  group.writeUInt8(0, 6); // width 0 means 256
  group.writeUInt8(0, 7);
  group.writeUInt16LE(1, 10);
  group.writeUInt16LE(32, 12);
  group.writeUInt32LE(4242, 14);
  group.writeUInt16LE(7, 18);
  const [entry] = exeIcon.parseIconGroup(group);
  assert.deepEqual(
    { width: entry.width, height: entry.height, bitCount: entry.bitCount, bytes: entry.bytes, iconId: entry.iconId },
    { width: 256, height: 256, bitCount: 32, bytes: 4242, iconId: 7 }
  );
});

test('the .ico wrapper describes exactly one image and points at its bytes', () => {
  const payload = Buffer.alloc(64, 7);
  const ico = exeIcon.buildIcoFile({ width: 48, height: 48, colorCount: 0, planes: 1, bitCount: 32 }, payload);
  assert.equal(ico.readUInt16LE(0), 0, 'reserved');
  assert.equal(ico.readUInt16LE(2), 1, 'type icon');
  assert.equal(ico.readUInt16LE(4), 1, 'one image');
  assert.equal(ico.readUInt8(6), 48);
  assert.equal(ico.readUInt32LE(14), payload.length);
  const offset = ico.readUInt32LE(18);
  assert.equal(offset, 22);
  assert.ok(ico.subarray(offset).equals(payload));
});

test('a 256 pixel side is written back as 0, the only value a byte can carry', () => {
  const ico = exeIcon.buildIcoFile({ width: 256, height: 256, colorCount: 0, planes: 1, bitCount: 32 }, Buffer.alloc(4));
  assert.equal(ico.readUInt8(6), 0);
  assert.equal(ico.readUInt8(7), 0);
});
