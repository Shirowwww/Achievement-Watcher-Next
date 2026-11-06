'use strict';

const assert = require('node:assert/strict');
const { officialAppId, rawAppId, normalizeType } = require('../../app/util/platformId.js');

(() => {
  // officialAppId: namespaces the collision-prone native-id sources.
  // Ubisoft small ints overlap Steam appids → must be namespaced
  assert.equal(officialAppId('ubisoftOfficial', '1843'), 'uplay-1843');
  assert.equal(officialAppId('ubisoftOfficial', '6100'), 'uplay-6100');
  // GOG productIds namespaced too (future-proof)
  assert.equal(officialAppId('gogOfficial', '1423049311'), 'gog-1423049311');
  // Steam / emulator sources keep their bare appid (back-compat with existing caches)
  assert.equal(officialAppId('steam', '440'), '440');
  assert.equal(officialAppId('steamOfficial', '440'), '440');
  assert.equal(officialAppId('file', '480'), '480');
  // idempotent - an already-namespaced id isn't double-prefixed
  assert.equal(officialAppId('ubisoftOfficial', 'uplay-1843'), 'uplay-1843');

  // The collision that motivated this: Ubisoft 1843 and Steam 1843 now get different keys.
  assert.notEqual(officialAppId('ubisoftOfficial', '1843'), officialAppId('steam', '1843'));

  // rawAppId: recover the native id from a namespaced key.
  assert.equal(rawAppId('uplay-1843'), '1843');
  assert.equal(rawAppId('gog-1423049311'), '1423049311');
  assert.equal(rawAppId('440'), '440'); // bare id passes through

  // normalizeType maps parser data.type to a platform tag.
  assert.equal(normalizeType('ubisoftOfficial'), 'ubisoft-official');
  assert.equal(normalizeType('gogOfficial'), 'gog-official');

  console.log('PASS: platformId validation + collision-safe cache ids');
})();
