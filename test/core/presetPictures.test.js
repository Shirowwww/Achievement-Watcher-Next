'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { createPictureCache, SHIPPED_DIR } = require('../../app/util/pictureCache.js');
const { createPresetInsets, bundledName } = require('../../app/electron/presetInsets.js');
const { contentSignature } = require('../../app/util/presetSignature.js');
const { check } = require('../../tools/presets/build-pictures.js');

const ARCADE = path.join(__dirname, '..', '..', 'app', 'presets', 'Default Presets', 'Arcade');

function scratch(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-shipped-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

// presetInsets with its offscreen render replaced: counts renders and finishes when told to.
function insetsWithFakeRender(t) {
  const cache = createPictureCache({ dir: scratch(t) });
  const insets = createPresetInsets({ cacheFile: path.join(scratch(t), 'insets.json'), imagePath: 'x', pictures: cache, log: () => {} });
  const renders = [];
  insets.render = (folder) =>
    new Promise((resolve) => renders.push({ folder, done: () => resolve({ image: 'data:image/png;base64,T1dO', width: 1, height: 1 }) }));
  return { insets, renders };
}

const tick = () => new Promise((resolve) => setImmediate(resolve));

test('every bundled preset ships a picture of its current files', () => {
  assert.deepEqual(check(), [], 'run: node tools/presets/build-pictures.js');
});

test('a shipped picture is found by its folder while its files are unchanged', () => {
  const cache = createPictureCache({ dir: os.tmpdir() });
  const name = bundledName(ARCADE);
  assert.equal(name, 'presets/Default Presets/Arcade');
  const shot = cache.shipped(name, contentSignature([ARCADE]));
  assert.ok(shot.image.startsWith('data:image/png;base64,iVBOR'));
  assert.ok(shot.width > 0 && shot.card);
  assert.equal(cache.shipped(name, 'older-files'), null);
  assert.equal(cache.shipped('presets/Default Presets/Nope', contentSignature([ARCADE])), null);
  assert.equal(bundledName(path.join(os.tmpdir(), 'Arcade')), null);
});

test('a shipped manifest cannot point outside its folder', (t) => {
  const dir = scratch(t);
  fs.writeFileSync(path.join(dir, 'outside.png'), 'x');
  const shippedDir = path.join(dir, 'shipped');
  fs.mkdirSync(shippedDir);
  fs.writeFileSync(path.join(shippedDir, 'manifest.json'), JSON.stringify({ pictures: { a: { signature: 's', file: '../outside.png' } } }));
  assert.equal(createPictureCache({ dir, shippedDir }).shipped('a', 's'), null);
  assert.equal(createPictureCache({ dir, shippedDir: path.join(dir, 'none') }).shipped('a', 's'), null);
  assert.ok(fs.existsSync(path.join(SHIPPED_DIR, 'manifest.json')));
});

test('a bundled preset gets its stand-in at once, and its own picture is drawn behind', async (t) => {
  const { insets, renders } = insetsWithFakeRender(t);
  const payload = { displayName: 'Succès débloqué' };
  const shot = await insets.snapshot(ARCADE, null, payload, { cached: true, standIn: true });
  assert.equal(shot.standIn, true);
  assert.ok(shot.image.startsWith('data:image/png;base64,iVBOR'));
  await tick();
  assert.equal(renders.length, 1);
  renders[0].done();
  await tick();
  // Drawn and kept: the next ask returns it at once, with no render.
  const own = await insets.snapshot(ARCADE, null, payload, { cached: true, standIn: true });
  assert.equal(own.image, 'data:image/png;base64,T1dO');
  assert.equal(own.standIn, undefined);
  assert.equal(renders.length, 1);
});

test('without a stand-in the ask waits for the render, three at a time', async (t) => {
  const { insets, renders } = insetsWithFakeRender(t);
  const asks = ['a', 'b', 'c', 'd', 'e'].map((text) => insets.snapshot(ARCADE, null, { displayName: text }, { cached: true }));
  await tick();
  assert.equal(renders.length, 3);
  renders[0].done();
  await tick();
  assert.equal(renders.length, 4);
  renders.slice(1).forEach((render) => render.done());
  await tick();
  renders.forEach((render) => render.done());
  const shots = await Promise.all(asks);
  assert.ok(shots.every((shot) => shot.image === 'data:image/png;base64,T1dO'));
});
