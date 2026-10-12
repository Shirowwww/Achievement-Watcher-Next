'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const css = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'resources', 'css', 'app.css'), 'utf8');

/*
  Below 1050px the stats column moves under the description and takes the row's full width, but its
  two lines kept the 210px of the side column: "59,6 % de tous les joueurs" (longer still with a
  trophy grade in front) wrapped onto two lines next to an empty row.
*/
test('the stacked achievement row lets its stats lines use the full width', () => {
  const stacked = css.match(/ {2}\.achievement \.stats \{\s*grid-column: 2;([\s\S]*?)\n {2}\}\n([\s\S]*?)\n\}\n/);
  assert.ok(stacked, 'the stacked layout exists');
  assert.match(stacked[2], /\.achievement \.stats \.time,\s*\.achievement \.stats \.community \{\s*width: auto;/);
  assert.match(stacked[1], /display: flex;[\s\S]*flex-wrap: wrap;/, 'the date and the rate share one line when they fit');
});
