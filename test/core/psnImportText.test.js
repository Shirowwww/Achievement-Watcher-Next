'use strict';

/*
  An import into a PSN library whose source is off in Settings > Sources ended on "1 added" while
  nothing ever showed up: the line now says where to turn it on. With the source on, it is unchanged.
*/

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const { psnImportText } = require(path.join(__dirname, '..', '..', 'app', 'util', 'psnMessages.js'));

const RESULT = { total: 1, created: 1, updated: 0, unchanged: 0, failed: 0, rateLimited: false };

test('an import with the PlayStation source off says how to see the games', () => {
  const on = psnImportText(RESULT);
  const off = psnImportText(RESULT, { sourceOff: true });
  assert.equal(off.kind, 'success');
  assert.ok(off.text.startsWith(on.text), off.text);
  assert.ok(off.text.length > on.text.length + 10, off.text);
});

test('nothing to show adds no hint, the source being off or not', () => {
  const none = { ...RESULT, created: 0, failed: 1 };
  assert.equal(psnImportText(none, { sourceOff: true }).text, psnImportText(none).text);
  assert.equal(psnImportText({ total: 0 }, { sourceOff: true }).text, psnImportText({ total: 0 }).text);
});
