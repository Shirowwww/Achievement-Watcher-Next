'use strict';

// The state colours are read as text: a danger button's label, a status chip, a diagnostic line.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { contrast } = require('../helpers/contrast');

const css = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'resources', 'css', 'app.css'), 'utf8');

function themeTokens(selector) {
  const start = css.indexOf(`${selector} {`);
  assert.ok(start >= 0, `${selector} is in app.css`);
  const body = css.slice(start, css.indexOf('\n}', start));
  return Object.fromEntries([...body.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\b/g)].map((match) => [match[1], match[2]]));
}

const base = themeTokens(':root');
const themes = [...css.matchAll(/:root\[data-theme='(\w+)'\] \{/g)].map((match) => match[1]);

test('success, warning and danger keep 4.5:1 on cards and panels in every built-in theme', () => {
  assert.ok(themes.length >= 12, 'the built-in themes are found');
  const weak = [];
  for (const theme of ['default', ...themes]) {
    const colors = theme === 'default' ? base : { ...base, ...themeTokens(`:root[data-theme='${theme}']`) };
    for (const state of ['success', 'warning', 'danger']) {
      for (const surface of ['surface', 'bg-panel']) {
        const ratio = contrast(colors[state], colors[surface]);
        if (ratio < 4.5) weak.push(`${theme} ${state} on ${surface}: ${ratio.toFixed(2)}`);
      }
    }
  }
  assert.deepEqual(weak, []);
});
