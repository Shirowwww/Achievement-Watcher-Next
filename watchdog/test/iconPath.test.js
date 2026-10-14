'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { iconPathOf } = require('../util/iconPath.js');

test('a file url the parsers wrote resolves to its local path', () => {
  assert.equal(iconPathOf({ icon: 'file:///C:/Games/Some Game/icon.png' }), path.normalize('C:/Games/Some Game/icon.png'));
});

test('a literal percent sign in a folder name is a path, not a broken escape', () => {
  assert.equal(iconPathOf({ icon: 'file:///C:/Games/100% Orange/icon.png' }), path.normalize('C:/Games/100% Orange/icon.png'));
});

test('anything that is not a file url gives no path', () => {
  assert.equal(iconPathOf({ icon: 'https://cdn.example/icon.png' }), '');
  assert.equal(iconPathOf({}), '');
  assert.equal(iconPathOf(null), '');
});
