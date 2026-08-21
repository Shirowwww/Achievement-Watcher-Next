'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { squareCrop, isSquareRatio, squareIconFile, makeSquareLogo, SQUARE_SIDE } = require('../../app/util/squareLogo.js');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-square-logo-'));

// A PNG header is all the module reads before deciding what to do with a file.
function pngHeader(width, height) {
  const b = Buffer.alloc(33);
  b.writeUInt32BE(0x89504e47, 0);
  b.writeUInt32BE(0x0d0a1a0a, 4);
  b.writeUInt32BE(13, 8);
  b.write('IHDR', 12, 'latin1');
  b.writeUInt32BE(width, 16);
  b.writeUInt32BE(height, 20);
  return b;
}

function writePng(name, width, height) {
  const file = path.join(tmp, name);
  fs.writeFileSync(file, pngHeader(width, height));
  return file;
}

test('a library grid is cropped square, biased towards its key art', () => {
  const crop = squareCrop(600, 900);
  assert.deepEqual(crop, { x: 0, y: 105, width: 600, height: 600 });
  // The bottom strip of a Steam grid is its title treatment: the window must stop above it.
  assert.ok(crop.y + crop.height < 900);
});

test('a header is cropped from its middle', () => {
  assert.deepEqual(squareCrop(920, 430), { x: 245, y: 0, width: 430, height: 430 });
});

test('degenerate sizes have no square to cut', () => {
  assert.equal(squareCrop(0, 900), null);
  assert.equal(squareCrop(600, 0), null);
  assert.equal(squareCrop('nope', 'nope'), null);
});

test('near-square art counts as square', () => {
  assert.equal(isSquareRatio(512, 512), true);
  assert.equal(isSquareRatio(512, 480), true);
  assert.equal(isSquareRatio(600, 900), false);
  assert.equal(isSquareRatio(0, 0), false);
});

test('a square source is used as-is rather than re-encoded', () => {
  const source = writePng('logo-512.png', 512, 512);
  assert.equal(makeSquareLogo(source, '480', { userDataRoot: tmp }), source);
});

test('art too small to crop is left to the preset', () => {
  const clienticon = writePng('clienticon.png', 32, 32);
  assert.equal(makeSquareLogo(clienticon, '480', { userDataRoot: tmp }), null);
});

test('a missing or remote source is never touched', () => {
  assert.equal(makeSquareLogo('https://cdn.example/library_600x900.jpg', '480', { userDataRoot: tmp }), null);
  assert.equal(makeSquareLogo(path.join(tmp, 'nothing-here.png'), '480', { userDataRoot: tmp }), null);
  assert.equal(makeSquareLogo('', '480', { userDataRoot: tmp }), null);
});

test('an existing square is reused instead of being cut again', () => {
  const source = writePng('grid-600x900.png', 600, 900);
  const target = squareIconFile(tmp, '480', source);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, pngHeader(SQUARE_SIDE, SQUARE_SIDE));
  assert.equal(makeSquareLogo(source, '480', { userDataRoot: tmp }), target);
});

test('the cached square is keyed by the art it was cut from', () => {
  const first = squareIconFile(tmp, '480', path.join(tmp, 'library_600x900.jpg'));
  const second = squareIconFile(tmp, '480', path.join(tmp, 'header.jpg'));
  assert.notEqual(first, second);
  assert.equal(path.basename(first), 'library_600x900-logo.png');
  assert.equal(path.dirname(first), path.join(tmp, 'steam_cache', 'icon', '480'));
});

test('cutting a square needs an image decoder, and reports honestly without one', () => {
  const source = writePng('grid-no-decoder.png', 600, 900);
  // No Electron in the test runner, so nativeImage is unavailable: the caller must get null rather
  // than a path to a file that was never written.
  assert.equal(makeSquareLogo(source, '481', { userDataRoot: tmp }), null);
  assert.equal(fs.existsSync(squareIconFile(tmp, '481', source)), false);
});

test('the community icon list gives up its best usable square', () => {
  const { pickSquareIcon } = require('../../app/util/squareLogo.js');
  const best = pickSquareIcon([
    { url: 'https://cdn2.steamgriddb.com/icon/small.png', width: 64, height: 64 },
    { url: 'https://cdn2.steamgriddb.com/icon/wide.png', width: 512, height: 256 },
    { url: 'https://cdn2.steamgriddb.com/icon/good.png', width: 256, height: 256 },
    { url: 'https://cdn2.steamgriddb.com/icon/best.png', width: 512, height: 512 },
    { url: 'https://cdn2.steamgriddb.com/icon/huge.png', width: 1024, height: 1024 },
  ]);
  assert.deepEqual(best, { url: 'https://cdn2.steamgriddb.com/icon/best.png', width: 512, height: 512 });
});

test('an oversized icon is still better than none', () => {
  const { pickSquareIcon } = require('../../app/util/squareLogo.js');
  const best = pickSquareIcon([
    { url: 'https://cdn2.steamgriddb.com/icon/huge.png', width: 1024, height: 1024 },
    { url: 'https://cdn2.steamgriddb.com/icon/huger.png', width: 2048, height: 2048 },
  ]);
  assert.equal(best.url, 'https://cdn2.steamgriddb.com/icon/huge.png');
});

test('formats no preset can paint are skipped', () => {
  const { pickSquareIcon } = require('../../app/util/squareLogo.js');
  assert.equal(
    pickSquareIcon([
      { url: 'https://cdn2.steamgriddb.com/icon/animated.webp', width: 512, height: 512 },
      { url: 'https://cdn2.steamgriddb.com/icon/windows.ico', width: 256, height: 256 },
    ]),
    null
  );
  assert.equal(pickSquareIcon(null), null);
  assert.equal(pickSquareIcon([]), null);
});
