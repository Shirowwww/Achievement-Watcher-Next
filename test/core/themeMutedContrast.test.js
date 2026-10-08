'use strict';

// Muted text carries every row's description and the sort captions. Tokyo Night shipped its
// "comment" grey (#565f89) for it, which read at 2.3 to 2.9:1 on the app's surfaces.

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const { BUILTIN_COLORS } = require(path.join(__dirname, '..', '..', 'app', 'util', 'themeLayers.js'));

const SURFACES = ['bg', 'header', 'panel', 'card', 'settings'];

function luminance(hex) {
  const [red, green, blue] = [1, 3, 5].map((at) => {
    const channel = parseInt(hex.slice(at, at + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrast(first, second) {
  const [high, low] = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (high + 0.05) / (low + 0.05);
}

test('muted text keeps at least 3:1 on every surface of every built-in theme', () => {
  const weak = [];
  for (const [theme, colors] of Object.entries(BUILTIN_COLORS)) {
    for (const surface of SURFACES) {
      const ratio = contrast(colors.muted, colors[surface]);
      if (ratio < 3) weak.push(`${theme} muted on ${surface}: ${ratio.toFixed(2)}`);
    }
  }
  assert.deepEqual(weak, []);
});

test('Tokyo Night muted text reads as body text would', () => {
  const colors = BUILTIN_COLORS.tokyonight;
  for (const surface of SURFACES) assert.ok(contrast(colors.muted, colors[surface]) >= 4.5, surface);
});
