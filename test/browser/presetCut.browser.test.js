'use strict';

// A see-through shape, as the popup paints it: what lies under it is gone, the card and the icon
// included, and what lies over it stays. Read from the pixels, since a mask can be written and
// still cut nothing.

const assert = require('node:assert/strict');
const path = require('node:path');
const { test } = require('node:test');
const { launchBrowser, closeBrowser, skipReason } = require('../helpers/chromium');

const appDir = path.join(__dirname, '..', '..', 'app');
const generator = require(path.join(appDir, 'util', 'customPreset.js'));

const SAMPLE_IMAGE =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const PAYLOAD = { displayName: 'Title', description: 'Description', iconPath: SAMPLE_IMAGE, scale: 1, notificationType: 'achievement' };

// The default card is 420 wide and 88 high, its icon at 18..82 by 12..76 in the canvas.
const OPTIONS = {
  canvas: {
    items: [
      { kind: 'shape', shape: 'ellipse', x: 300, y: 20, w: 40, h: 40, cut: true },
      { kind: 'shape', shape: 'rect', x: 20, y: 30, w: 20, h: 20, cut: true, radius: 0 },
      { kind: 'shape', shape: 'rect', x: 310, y: 30, w: 10, h: 10, fill: '#ffffff' },
      { kind: 'shape', shape: 'rect', x: 280, y: 16, w: 80, h: 48, fill: '#00ff00', back: true },
    ],
  },
};

// The RGBA of each point, read back from a screenshot without its page background.
async function pixels(browser, page, points) {
  const shot = await page.screenshot({ omitBackground: true, encoding: 'base64' });
  const reader = await browser.newPage();
  try {
    return await reader.evaluate(
      (data, at) =>
        new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            resolve(at.map(([x, y]) => Array.from(ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data)));
          };
          img.onerror = reject;
          img.src = 'data:image/png;base64,' + data;
        }),
      shot,
      points
    );
  } finally {
    await reader.close();
  }
}

test('a see-through shape cuts the card, the icon and the items under it, not the ones over it', { concurrency: 1, timeout: 120000 }, async (t) => {
  const { browser, userDataDir, failures } = await launchBrowser();
  if (!browser) {
    t.skip(skipReason(failures));
    return;
  }
  try {
    const page = await browser.newPage();
    const box = generator.presetBoxSize(OPTIONS);
    await page.setViewport({ width: box.width, height: box.height });
    await page.setContent(generator.buildPresetPreviewHtml(OPTIONS), { waitUntil: 'load' });
    await page.evaluate((payload) => window.awPreviewApply(payload), PAYLOAD);
    // Cut as the card comes in, then the card moves: the holes must travel with it.
    const origin = await page.evaluate(async () => {
      const entry = document.getAnimations().find((animation) => animation.animationName === 'aw_in');
      if (entry) {
        entry.finish();
        await entry.finished.catch(() => {});
      }
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const rect = document.querySelector('.aw-canvas').getBoundingClientRect();
      return [rect.left, rect.top, rect.height];
    });
    const at = ([x, y]) => [origin[0] + x, origin[1] + y];
    const [ellipse, icon, over, back, card, shadow] = await pixels(browser, page, [
      at([330, 45]),
      at([30, 40]),
      at([315, 35]),
      at([286, 22]),
      at([250, 80]),
      at([210, origin[2] + 6]),
    ]);
    assert.equal(ellipse[3], 0, `the hole shows what is behind the popup, saw ${ellipse}`);
    assert.equal(icon[3], 0, `the icon under a hole is cut too, saw ${icon}`);
    assert.deepEqual(over, [255, 255, 255, 255], 'an item over the hole stays whole');
    assert.deepEqual(back, [0, 255, 0, 255], 'an item under the hole is cut only where the hole is');
    assert.equal(card[3], 255, 'the card is whole away from the holes');
    assert.ok(shadow[3] > 0, `the card's shadow still falls past its edge, saw ${shadow}`);
  } finally {
    await closeBrowser(browser, userDataDir);
  }
});
