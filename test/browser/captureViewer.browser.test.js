'use strict';

// The capture viewer in a real page: its frame takes the size of the picture it shows, never
// wider than the picture itself nor than the window, instead of a fixed wide card with black bars.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { launchBrowser, closeBrowser, skipReason } = require('../helpers/chromium');

const appDir = path.join(__dirname, '..', '..', 'app');
const read = (file) => fs.readFileSync(path.join(appDir, file), 'utf8');

function buildHarness() {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${read('resources/css/captureViewer.css')}</style></head><body>
    <script>${read('ui/captureViewer.js').replace(/<\/script/gi, '<\\/script')}</script>
    <script>
      // A plain picture of the given size, as a data url.
      window.picture = (width, height) => {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').fillRect(0, 0, width, height);
        return canvas.toDataURL('image/png');
      };
      window.shown = async (width, height) => {
        window.CaptureViewer.close();
        await new Promise((resolve) => setTimeout(resolve, 200));
        window.CaptureViewer.open({ title: 'Night Town', items: [{ kind: 'screenshot', url: window.picture(width, height) }], strings: {} });
        const image = document.querySelector('.capture-viewer-media');
        await image.decode();
        await new Promise((resolve) => setTimeout(resolve, 260));
        const box = (selector) => {
          const { width, height } = document.querySelector(selector).getBoundingClientRect();
          return { width, height };
        };
        return { stage: box('.capture-viewer-stage'), card: box('.capture-viewer-card'), media: box('.capture-viewer-media') };
      };
    </script>
  </body></html>`;
}

test('the viewer frames a picture at its own size, and fits a larger one to the window', { concurrency: 1, timeout: 180000 }, async (t) => {
  const { browser, userDataDir, failures } = await launchBrowser();
  if (!browser) {
    t.skip(skipReason(failures));
    return;
  }
  const harnessDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-viewer-harness-'));
  const harness = path.join(harnessDir, 'viewer.html');
  fs.writeFileSync(harness, buildHarness());
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1600, height: 1000 });
    await page.goto(pathToFileURL(harness).href);

    const small = await page.evaluate(() => window.shown(800, 450));
    assert.equal(Math.round(small.media.width), 800, 'a picture smaller than the window shows at its own size');
    assert.ok(Math.abs(small.stage.width - small.media.width) <= 1, `the frame hugs the picture (${small.stage.width} for ${small.media.width})`);
    assert.ok(Math.abs(small.stage.height - small.media.height) <= 1, 'no black band above or below');

    const large = await page.evaluate(() => window.shown(4000, 2000));
    assert.ok(large.card.width <= 1600 && large.card.height <= 1000, 'a large picture never makes the viewer leave the window');
    assert.ok(Math.abs(large.media.width / large.media.height - 2) < 0.02, 'and keeps its proportions');
    assert.ok(Math.abs(large.stage.width - large.media.width) <= 1 && Math.abs(large.stage.height - large.media.height) <= 1, 'the frame still hugs it');

    const tall = await page.evaluate(() => window.shown(600, 1800));
    assert.ok(tall.card.height <= 1000, 'a tall picture fits the height');
    assert.ok(Math.abs(tall.stage.width - tall.media.width) <= 1, 'with no black bands at its sides');
  } finally {
    await closeBrowser(browser, userDataDir);
    fs.rmSync(harnessDir, { recursive: true, force: true });
  }
});
