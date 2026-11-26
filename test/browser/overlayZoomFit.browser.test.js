'use strict';

// The overlay's zoom setting scales its content, never the panel past the window: at 110% the
// panel used to be 110% of the window wide, so its right edge and settings were cut off.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { launchBrowser, closeBrowser, skipReason } = require('../helpers/chromium');
const { appDir, withoutScripts } = require('../helpers/staticApp');

const VIEWPORT = { width: 460, height: 700 };

test('the overlay panel fills the window at every zoom, no wider and no taller', async (t) => {
  const { browser, userDataDir, failures } = await launchBrowser(['--allow-file-access-from-files']);
  if (!browser) return t.skip(skipReason(failures));
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-overlay-zoom-'));
  try {
    const html = withoutScripts(fs.readFileSync(path.join(appDir, 'view', 'overlay.html'), 'utf8')).replace(
      '<head>',
      `<head><base href="file:///${path.join(appDir, 'view').replace(/\\/g, '/')}/">`
    );
    const file = path.join(directory, 'overlay.html');
    fs.writeFileSync(file, html);

    const page = await browser.newPage();
    await page.setViewport(VIEWPORT);
    await page.goto('file:///' + file.replace(/\\/g, '/'));

    const zooms = await page.$$eval('#zoom-select option', (options) => options.map((o) => o.value));
    assert.ok(zooms.includes('1.1') && zooms.includes('1.25'), `zoom choices: ${zooms}`);
    for (const zoom of zooms) {
      const box = await page.evaluate((value) => {
        document.documentElement.style.setProperty('--zoom', value);
        const rect = document.querySelector('.overlay-panel').getBoundingClientRect();
        return { right: rect.right, bottom: rect.bottom, width: rect.width };
      }, zoom);
      assert.ok(Math.abs(box.width - VIEWPORT.width) <= 1, `zoom ${zoom}: panel ${box.width}px wide in a ${VIEWPORT.width}px window`);
      assert.ok(box.right <= VIEWPORT.width + 1, `zoom ${zoom}: right edge at ${box.right}`);
      assert.ok(box.bottom <= VIEWPORT.height + 1, `zoom ${zoom}: bottom edge at ${box.bottom}`);
    }
  } finally {
    await closeBrowser(browser, userDataDir);
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
