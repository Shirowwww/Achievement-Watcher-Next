'use strict';

/*
  An achievement row's name is read as text. jQuery's data() turns "0" into the number 0 and
  "0123" into 123: the right-click on a PlayStation platinum (trophy 0) did nothing at all, and an
  override for "0123" was saved under "123", where nothing ever read it.
*/

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'ui', 'game.js'), 'utf8');

test('the game page never reads an achievement name through data()', () => {
  const reads = source.split('\n').filter((line) => /\.data\(\s*['"]name['"]\s*\)/.test(line));
  assert.deepEqual(reads.map((line) => line.trim()), []);
});
