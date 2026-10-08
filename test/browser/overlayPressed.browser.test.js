'use strict';

// The overlay marks the chosen filter, density, icon size and accent with a CSS class alone, which
// a screen reader cannot see. The real overlay.js runs here against the real overlay.html.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { launchBrowser, closeBrowser, skipReason } = require('../helpers/chromium');
const { appDir } = require('../helpers/staticApp');

test('overlay choices report which one is on through aria-pressed', async (t) => {
  const { browser, userDataDir, failures } = await launchBrowser(['--allow-file-access-from-files']);
  if (!browser) return t.skip(skipReason(failures));
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-overlay-'));
  try {
    const html = fs
      .readFileSync(path.join(appDir, 'view', 'overlay.html'), 'utf8')
      .replace(/<script[\s\S]*?<\/script>/g, '')
      .replace(/<meta\s+http-equiv="Content-Security-Policy"[\s\S]*?\/>/, '')
      .replace('<head>', `<head><base href="file:///${path.join(appDir, 'view').replace(/\\/g, '/')}/">`);
    const file = path.join(directory, 'overlay.html');
    fs.writeFileSync(file, html);

    const page = await browser.newPage();
    await page.setViewport({ width: 460, height: 800 });
    await page.goto('file:///' + file.replace(/\\/g, '/'));
    // The preload bridge is the only thing the overlay needs from Electron.
    await page.evaluate(() => {
      window.api = new Proxy({}, { get: () => () => Promise.resolve(null) });
      window.customApi = { closeOverlay() {} };
    });
    for (const script of ['util/intlFormat.js', 'util/overlayUi.js', 'util/controllerLabels.js', 'view/overlay.js']) {
      await page.addScriptTag({ path: path.join(appDir, script) });
    }

    const pressed = () =>
      page.evaluate(() => {
        const state = (selector) => [...document.querySelectorAll(selector)].map((choice) => choice.getAttribute('aria-pressed'));
        return {
          filters: state('.filter-pill'),
          density: state('#density-seg button'),
          icons: state('#iconsize-seg button'),
          swatches: state('.swatch[data-accent]'),
        };
      });

    const start = await pressed();
    for (const group of Object.values(start)) {
      assert.ok(group.every((value) => value === 'true' || value === 'false'), `every choice states itself: ${group}`);
      assert.equal(group.filter((value) => value === 'true').length, 1, `exactly one is on: ${group}`);
    }
    assert.equal(start.filters[0], 'true', 'All is the starting filter');

    await page.click('.filter-pill[data-filter="locked"]');
    await page.click('#overlay-settings-toggle');
    await page.click('#density-seg button[data-density="compact"]');
    const after = await pressed();
    assert.deepEqual(after.filters, ['false', 'false', 'true', 'false']);
    assert.equal(after.density[0], 'true');
    assert.equal(after.density.filter((value) => value === 'true').length, 1);
  } finally {
    await closeBrowser(browser, userDataDir);
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
