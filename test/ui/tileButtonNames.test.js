'use strict';

// Every tile carries the same three icon buttons, so a list of them read "Achievements" fifty times
// with no way to tell the games apart. Each name now starts with the game it belongs to, under the
// title the tile shows (a rename or a translated title).

const assert = require('node:assert/strict');
const test = require('node:test');
const { rendererSource } = require('../helpers/rendererSource');

test('a tile button is named after its game as well as its action', () => {
  const source = rendererSource();
  // The top-left button says what it opens, the list or the game page (#189): tileEntry.label.
  for (const [button, label] of [
    ['play-button', 'tileLabels\\.play'],
    ['achievement-button', 'tileEntry\\.label'],
    ['config-button', 'tileLabels\\.health'],
  ]) {
    const pattern = new RegExp(`class="${button}"[^>]*aria-label="\\$\\{escapeHtml\\(\`\\$\\{tileTitle\\} - \\$\\{${label}\\}\`\\)\\}"`);
    assert.match(source, pattern, `${button} must carry the game name`);
  }
});
