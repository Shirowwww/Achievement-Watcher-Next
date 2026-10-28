'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { createPictureCache } = require('../../app/util/pictureCache.js');

function scratch(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-pictures-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test('a picture stored under its key comes back, and a changed key misses', (t) => {
  const cache = createPictureCache({ dir: scratch(t) });
  const key = cache.keyOf('Onyx', 'sig-1', { displayName: 'Unlocked' });
  assert.equal(cache.get(key), null);
  cache.set(key, { image: 'data:image/png;base64,AAAA', width: 400, height: 120 });
  assert.deepEqual(cache.get(key), { image: 'data:image/png;base64,AAAA', width: 400, height: 120 });
  // A preset whose files changed, or a sample worded otherwise, is drawn again.
  assert.equal(cache.get(cache.keyOf('Onyx', 'sig-2', { displayName: 'Unlocked' })), null);
  assert.equal(cache.get(cache.keyOf('Onyx', 'sig-1', { displayName: 'Débloqué' })), null);
});

test('a damaged or foreign file is a miss, never a picture', (t) => {
  const dir = scratch(t);
  const cache = createPictureCache({ dir });
  const key = cache.keyOf('Onyx', 'sig', {});
  fs.writeFileSync(path.join(dir, `${key}.json`), '{not json');
  assert.equal(cache.get(key), null);
  fs.writeFileSync(path.join(dir, `${key}.json`), JSON.stringify({ image: 'https://example.com/x.png' }));
  assert.equal(cache.get(key), null);
  assert.equal(cache.get('../outside'), null);
});

test('the folder keeps only the most recent pictures', (t) => {
  const dir = scratch(t);
  const cache = createPictureCache({ dir, max: 3 });
  const keys = ['a', 'b', 'c', 'd', 'e'].map((name) => cache.keyOf(name, 'sig', {}));
  keys.forEach((key, index) => {
    cache.set(key, { image: 'data:image/png;base64,AAAA' });
    const when = new Date(Date.now() - (keys.length - index) * 60000);
    fs.utimesSync(path.join(dir, `${key}.json`), when, when);
  });
  cache.set(cache.keyOf('f', 'sig', {}), { image: 'data:image/png;base64,AAAA' });
  assert.equal(fs.readdirSync(dir).length, 3);
  assert.equal(cache.get(keys[0]), null);
  assert.ok(cache.get(keys[4]));
});
