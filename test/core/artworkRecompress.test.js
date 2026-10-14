'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const sharp = require('../../app/node_modules/sharp');
const { recompressArtwork } = require('../../app/util/artworkRecompress.js');
const { imageSize } = require('../../app/util/imageSize.js');

const LATER = Date.now() + 60 * 60 * 1000;

// Electron's nativeImage is main-process only; this stands in for it with what sharp decoded
// beforehand, so the test exercises the selection and the write, not the codec.
async function fakeNativeImage(files, { smear = false } = {}) {
  const decoded = new Map();
  const jpegPixels = new Map();
  for (const file of files) {
    const { data } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const jpeg = await sharp(file).flatten().jpeg({ quality: 92 }).toBuffer();
    const back = (await sharp(jpeg).ensureAlpha().raw().toBuffer({ resolveWithObject: true })).data;
    decoded.set(path.resolve(file), { data, jpeg });
    // `smear` stands for a picture whose fine detail JPEG cannot keep.
    jpegPixels.set(jpeg, smear ? back.map((value, i) => (i % 4 === 3 ? value : 255 - value)) : back);
  }
  return {
    createFromPath(file) {
      const entry = decoded.get(path.resolve(file));
      return {
        isEmpty: () => !entry,
        toBitmap: () => entry.data,
        toJPEG: () => entry.jpeg,
      };
    },
    createFromBuffer: (buffer) => ({ toBitmap: () => jpegPixels.get(buffer) }),
  };
}

// A gradient with fine grain: about 0.9 MB as PNG, 3% of that as JPEG at 43 dB, like a store photograph.
async function photoPng(file, { alpha = false } = {}) {
  const width = 920;
  const height = 430;
  const channels = alpha ? 4 : 3;
  const pixels = Buffer.alloc(width * height * channels);
  let seed = 1;
  for (let i = 0; i < pixels.length; i++) {
    seed = (seed * 1103515245 + 12345) >>> 0;
    const x = Math.floor(i / channels) % width;
    pixels[i] = Math.min(255, Math.round((x / width) * 200) + ((seed >>> 16) % 6));
  }
  if (alpha) for (let i = 3; i < pixels.length; i += 4) pixels[i] = i % 7 === 0 ? 0 : 255;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  await sharp(pixels, { raw: { width, height, channels } }).png().toFile(file);
  return file;
}

function scratch(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-artwork-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test('an opaque banner becomes a JPEG under the same name and still reads as an image', async (t) => {
  const root = scratch(t);
  const banner = await photoPng(path.join(root, 'epic-ns', '7c0ece58a2f8c55f651986caa3722deb.png'));
  const before = fs.statSync(banner).size;

  const result = await recompressArtwork(root, await fakeNativeImage([banner]), LATER);

  assert.equal(result.files, 1);
  const after = fs.readFileSync(banner);
  assert.equal(after[0], 0xff, 'JPEG bytes');
  assert.equal(after[1], 0xd8);
  assert.equal(result.savedBytes, before - after.length);
  assert.deepEqual(imageSize(banner), { width: 920, height: 430 }, 'readers that sniff the content still understand it');
});

test('a picture with transparency, a recent download and an already converted file are left alone', async (t) => {
  const root = scratch(t);
  const logo = await photoPng(path.join(root, 'game', 'logo.png'), { alpha: true });
  const fresh = await photoPng(path.join(root, 'game', 'fresh.png'));
  const fake = await fakeNativeImage([logo, fresh]);

  const logoBefore = fs.readFileSync(logo);
  // The download finished a minute ago: it might not have.
  const soon = fs.statSync(fresh).mtimeMs + 60 * 1000;
  assert.equal((await recompressArtwork(root, fake, soon)).files, 0);
  assert.ok(fs.readFileSync(logo).equals(logoBefore));
  assert.equal(fs.readFileSync(fresh).readUInt32BE(0), 0x89504e47);

  // Once converted, the next start does not touch it again.
  assert.equal((await recompressArtwork(root, fake, LATER)).files, 1);
  assert.equal((await recompressArtwork(root, fake, LATER)).files, 0);
});

test('a banner JPEG would visibly degrade stays a PNG', async (t) => {
  const root = scratch(t);
  const banner = await photoPng(path.join(root, 'game', 'text-heavy.png'));
  const before = fs.readFileSync(banner);

  assert.equal((await recompressArtwork(root, await fakeNativeImage([banner], { smear: true }), LATER)).files, 0);
  assert.ok(fs.readFileSync(banner).equals(before));
});

test('a small file or a missing cache folder costs nothing', async (t) => {
  const root = scratch(t);
  fs.mkdirSync(path.join(root, 'game'));
  fs.writeFileSync(path.join(root, 'game', 'tiny.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  const never = { createFromPath: () => assert.fail('nothing here should be decoded') };

  assert.deepEqual(await recompressArtwork(root, never, LATER), { files: 0, savedBytes: 0 });
  assert.deepEqual(await recompressArtwork(path.join(root, 'absent'), never, LATER), { files: 0, savedBytes: 0 });
});
