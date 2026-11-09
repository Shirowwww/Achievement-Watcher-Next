'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');

const ui = require('../../app/util/overlayUi.js');

test('a typed colour code is read with or without its hash, in either case', () => {
  assert.equal(ui.normalizeHex('#9B6BFF'), '#9b6bff');
  assert.equal(ui.normalizeHex('9b6bff'), '#9b6bff');
  assert.equal(ui.normalizeHex(' #abc '), '#aabbcc');
  for (const bad of ['', '#12', '#1234567', 'zzzzzz', null, undefined, 'url(x)']) assert.equal(ui.normalizeHex(bad), null, String(bad));
});

test('hue, saturation and brightness round-trip to the same colour code', () => {
  for (const hex of ['#9b6bff', '#4aa3ff', '#ff0000', '#000000', '#ffffff', '#2ecc71']) {
    assert.equal(ui.hsvToHex(ui.hexToHsv(hex)), hex, hex);
  }
  assert.deepEqual(ui.hexToHsv('#ff0000'), { h: 0, s: 1, v: 1 });
  assert.equal(ui.hsvToHex({ h: 120, s: 1, v: 1 }), '#00ff00');
  // Out of range values are clamped rather than producing an invalid code.
  assert.equal(ui.hsvToHex({ h: 720, s: 4, v: -1 }), '#000000');
  assert.equal(ui.hsvToHex({ h: Number.NaN, s: 1, v: 1 }), '#ff0000');
});

test('recent colours keep the last three distinct choices, newest first', () => {
  assert.deepEqual(ui.rememberAccent([], '#9B6BFF'), ['#9b6bff']);
  assert.deepEqual(ui.rememberAccent(['#111111', '#222222', '#333333'], '#444444'), ['#444444', '#111111', '#222222']);
  assert.deepEqual(ui.rememberAccent(['#111111', '#222222'], '#222222'), ['#222222', '#111111']);
  assert.deepEqual(ui.rememberAccent(['junk', '#111111'], 'nope'), ['#111111']);
  assert.deepEqual(ui.rememberAccent(undefined, '#111111'), ['#111111']);
});
