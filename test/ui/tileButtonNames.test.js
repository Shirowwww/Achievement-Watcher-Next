'use strict';

// Every tile carries the same three icon buttons, so a list of them read "Achievements" fifty times
// with no way to tell the games apart. Each name now starts with the game it belongs to.

const assert = require('node:assert/strict');
const test = require('node:test');
const { rendererSource } = require('../helpers/rendererSource');

test('a tile button is named after its game as well as its action', () => {
  const source = rendererSource();
  for (const [button, label] of [
    ['play-button', 'play'],
    ['achievement-button', 'achievements'],
    ['config-button', 'health'],
  ]) {
    const pattern = new RegExp(`class="${button}"[^>]*aria-label="\\$\\{escapeHtml\\(\`\\$\\{game\\.name\\} - \\$\\{tileLabels\\.${label}\\}\`\\)\\}"`);
    assert.match(source, pattern, `${button} must carry the game name`);
  }
});
