'use strict';

// Anything filled with the accent (Save, the selected segment, Create preset) must keep a readable
// label in every built-in theme. Light text on the pale accents was under 2:1 (Synthwave 1.1:1).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { launchBrowser, closeBrowser, skipReason } = require('../helpers/chromium');
const { openStaticApp, showPanel, appDir } = require('../helpers/staticApp');

const { BUILTIN_COLORS } = require(path.join(appDir, 'util', 'themeLayers.js'));
const MIN_CONTRAST = 4.5;

const SAMPLES = [
  ['#settings', '#btn-settings-save'],
  ['#game-config', '#btn-game-config-save'],
  ['#settings', '#settings .pd-seg button'],
];

test('the label on an accent-filled control reads in every built-in theme', async (t) => {
  const { browser, userDataDir, failures } = await launchBrowser(['--allow-file-access-from-files']);
  if (!browser) return t.skip(skipReason(failures));
  try {
    const page = await openStaticApp(browser);
    const weak = [];
    for (const theme of Object.keys(BUILTIN_COLORS)) {
      for (const [panel, selector] of SAMPLES) {
        await showPanel(page, panel);
        const ratio = await page.evaluate(
          (themeName, target) => {
            if (themeName === 'default') document.documentElement.removeAttribute('data-theme');
            else document.documentElement.setAttribute('data-theme', themeName);
            const element = document.querySelector(target);
            if (target.endsWith('button')) element.classList.add('is-on');
            const toRgb = (css) => {
              const canvas = document.createElement('canvas');
              canvas.width = canvas.height = 1;
              const context = canvas.getContext('2d');
              context.fillStyle = css;
              context.fillRect(0, 0, 1, 1);
              return Array.from(context.getImageData(0, 0, 1, 1).data.slice(0, 3));
            };
            const luminance = (rgb) => {
              const [r, g, b] = rgb.map((v) => {
                const c = v / 255;
                return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
              });
              return 0.2126 * r + 0.7152 * g + 0.0722 * b;
            };
            const text = luminance(toRgb(getComputedStyle(element).color));
            const fill = luminance(toRgb(getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()));
            return (Math.max(text, fill) + 0.05) / (Math.min(text, fill) + 0.05);
          },
          theme,
          selector
        );
        if (ratio < MIN_CONTRAST) weak.push(`${theme} ${selector}: ${ratio.toFixed(2)}`);
      }
    }
    assert.deepEqual(weak, [], `labels under ${MIN_CONTRAST}:1 on the accent`);
  } finally {
    await closeBrowser(browser, userDataDir);
  }
});
