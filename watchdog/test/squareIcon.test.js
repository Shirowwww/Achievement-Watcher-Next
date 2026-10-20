'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const zlib = require('node:zlib');

const { makeSquareIcon, localImagePath, squareOutputPath } = require('../util/squareIcon.js');

function fixture() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'aw-square-icon-'));
}

function cleanup(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

function pngChunk(type, data) {
  const typed = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(zlib.crc32(typed) >>> 0);
  return Buffer.concat([length, typed, crc]);
}

// A plain red RGB picture, written without any image library.
function writeRedPng(file, width, height) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  const row = Buffer.from([0, ...Array.from({ length: width }, () => [255, 0, 0]).flat()]);
  const pixels = zlib.deflateSync(Buffer.concat(Array.from({ length: height }, () => row)));
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  fs.writeFileSync(file, Buffer.concat([signature, pngChunk('IHDR', header), pngChunk('IDAT', pixels), pngChunk('IEND', Buffer.alloc(0))]));
}

test('remote URLs are left untouched (no image processing)', async () => {
  const root = fixture();
  try {
    assert.equal(await makeSquareIcon('https://example.com/art.jpg', '480', { userDataRoot: root }), null);
  } finally {
    cleanup(root);
  }
});

test('a landscape image is center-cropped into a square PNG', { skip: process.platform !== 'win32' }, async () => {
  const root = fixture();
  const src = path.join(root, 'source.png');
  try {
    writeRedPng(src, 4, 2);

    const out = await makeSquareIcon(src, '480', { userDataRoot: root });
    assert.ok(out, 'a square icon should be produced');
    assert.ok(out.startsWith(root), 'the square icon must be written under the configured user-data root');
    assert.equal(out, squareOutputPath('480', src, root));

    const buf = fs.readFileSync(out);
    assert.equal(buf.readUInt32BE(16), 2, 'cropped width must equal the shorter side');
    assert.equal(buf.readUInt32BE(20), 2, 'cropped height must equal the shorter side');
    assert.equal(localImagePath(out), out);
    assert.equal(fs.existsSync(`${out}.part`), false, 'the square is written aside, then renamed');
  } finally {
    cleanup(root);
  }
});

test('a portrait image is cropped to its width, and the square is made once', { skip: process.platform !== 'win32' }, async () => {
  const root = fixture();
  const src = path.join(root, 'portrait.png');
  try {
    writeRedPng(src, 3, 7);
    const out = await makeSquareIcon(src, '480', { userDataRoot: root });
    const buf = fs.readFileSync(out);
    assert.equal(buf.readUInt32BE(16), 3);
    assert.equal(buf.readUInt32BE(20), 3);
    // A second crop would fail on this file: the square already made is returned instead.
    fs.writeFileSync(src, 'not a picture any more');
    assert.equal(await makeSquareIcon(src, '480', { userDataRoot: root }), out);
  } finally {
    cleanup(root);
  }
});

test('a file that is not a picture is reported, not turned into an icon', { skip: process.platform !== 'win32' }, async () => {
  const root = fixture();
  const src = path.join(root, 'broken.png');
  try {
    fs.writeFileSync(src, 'not a picture');
    await assert.rejects(makeSquareIcon(src, '480', { userDataRoot: root }), /GDI\+ status/);
    assert.equal(fs.existsSync(squareOutputPath('480', src, root)), false);
  } finally {
    cleanup(root);
  }
});
