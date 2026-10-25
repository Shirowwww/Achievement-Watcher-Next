'use strict';

// Values that reach a file path or a stylesheet must not carry a way out of either.

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const schema = require(path.join(__dirname, '..', '..', 'app', 'util', 'presetSchema.js'));

test('a background picture name cannot leave the pictures folder', () => {
  for (const name of ['..\\..\\Desktop\\x.png', '../x.png', 'sub\\x.png', 'C:x.png', 'tab\tname.png', 'xpng']) {
    assert.equal(schema.normalizeOptions({ bgImage: name }).bgImage, '', name);
  }
  assert.equal(schema.normalizeOptions({ bgImage: 'my picture.webp' }).bgImage, 'my picture.webp');
});

test('a colour cannot close the rule or the style element it lands in', () => {
  const fallback = schema.normalizeOptions({}).accent;
  for (const colour of ['rgb(0;}</style><b>)', 'rgb(0 ; } .x { color: red)', 'rgba(url(x))']) {
    assert.equal(schema.normalizeOptions({ accent: colour }).accent, fallback, colour);
  }
  for (const colour of ['rgb(255, 0, 0)', 'rgba(0 0 0 / 50%)', 'rgba(10, 20, 30, 0.5)', '#abc', 'red']) {
    assert.equal(schema.normalizeOptions({ accent: colour }).accent, colour, colour);
  }
});
