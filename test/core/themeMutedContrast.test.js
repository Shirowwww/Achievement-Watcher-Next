'use strict';

// Muted text carries every row's description and the sort captions. Tokyo Night shipped its
// "comment" grey (#565f89) for it, which read at 2.3 to 2.9:1 on the app's surfaces.

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const { BUILTIN_COLORS } = require(path.join(__dirname, '..', '..', 'app', 'util', 'themeLayers.js'));
const { contrast } = require('../helpers/contrast');

const SURFACES = ['bg', 'header', 'panel', 'card', 'settings'];

// Muted text carries whole sentences, so it gets the body-text threshold.
test('muted text keeps at least 4.5:1 on every surface of every built-in theme', () => {
  const weak = [];
  for (const [theme, colors] of Object.entries(BUILTIN_COLORS)) {
    for (const surface of SURFACES) {
      const ratio = contrast(colors.muted, colors[surface]);
      if (ratio < 4.5) weak.push(`${theme} muted on ${surface}: ${ratio.toFixed(2)}`);
    }
  }
  assert.deepEqual(weak, []);
});

test('Tokyo Night muted text reads as body text would', () => {
  const colors = BUILTIN_COLORS.tokyonight;
  for (const surface of SURFACES) assert.ok(contrast(colors.muted, colors[surface]) >= 4.5, surface);
});
