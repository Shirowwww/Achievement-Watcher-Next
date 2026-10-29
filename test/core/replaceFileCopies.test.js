'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const root = path.join(__dirname, '..', '..');

test('the app and the Watchdog replace files with the same code', () => {
  assert.equal(
    fs.readFileSync(path.join(root, 'watchdog', 'util', 'replaceFile.js'), 'utf8'),
    fs.readFileSync(path.join(root, 'app', 'util', 'replaceFile.js'), 'utf8')
  );
});
