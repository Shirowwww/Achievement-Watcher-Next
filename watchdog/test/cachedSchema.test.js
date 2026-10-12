'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const USER_DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-cached-schema-'));
process.env.AW_USER_DATA = USER_DATA;
require('../util/userData.js').resetCache();

const steam = require('../steam.js');

test.after(() => fs.rmSync(USER_DATA, { recursive: true, force: true }));

// #114: an Epic exclusive played through Nemirtingas has no Steam release to map to.
test('an Epic id with a schema the library cached is loadable without a Steam release', () => {
  const dir = path.join(USER_DATA, 'steam_cache', 'schema', 'english');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'c4763f236d08423eb47b4c3008779c84.db'), '{}');

  assert.equal(steam.hasCachedSchema('c4763f236d08423eb47b4c3008779c84', 'english'), true);
  assert.equal(steam.hasCachedSchema('c4763f236d08423eb47b4c3008779c84', 'french'), false);
  assert.equal(steam.hasCachedSchema('0000', 'english'), false);
});

test('ids that could leave the schema folder are refused', () => {
  assert.equal(steam.hasCachedSchema('..\\..\\cfg\\options', 'english'), false);
  assert.equal(steam.hasCachedSchema('', 'english'), false);
  assert.equal(steam.hasCachedSchema('abc', 'not-a-language'), false);
});
