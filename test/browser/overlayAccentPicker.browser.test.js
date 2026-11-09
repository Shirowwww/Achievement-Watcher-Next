'use strict';

// The overlay's custom accent: a chip with the colour and its code opens a picker inside the
// overlay (shade pad, hue slider, code field, recent colours). Real overlay.js and overlay.html.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { launchBrowser, closeBrowser, skipReason } = require('../helpers/chromium');
const { appDir, withoutScripts } = require('../helpers/staticApp');

test('the custom accent is picked inside the overlay and the last colours are kept', async (t) => {
  const { browser, userDataDir, failures } = await launchBrowser(['--allow-file-access-from-files']);
  if (!browser) return t.skip(skipReason(failures));
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-overlay-accent-'));
  try {
    const html = withoutScripts(fs.readFileSync(path.join(appDir, 'view', 'overlay.html'), 'utf8')).replace(
      '<head>',
      `<head><base href="file:///${path.join(appDir, 'view').replace(/\\/g, '/')}/">`
    );
    const file = path.join(directory, 'overlay.html');
    fs.writeFileSync(file, html);

    const page = await browser.newPage();
    await page.setViewport({ width: 460, height: 800 });
    await page.goto('file:///' + file.replace(/\\/g, '/'));
    await page.evaluate(() => {
      localStorage.clear();
      window.api = new Proxy({}, { get: () => () => Promise.resolve(null) });
      window.customApi = { closeOverlay() {} };
    });
    for (const script of ['util/intlFormat.js', 'util/rarityTiers.js', 'util/overlayUi.js', 'util/controllerLabels.js', 'view/overlay.js']) {
      await page.addScriptTag({ path: path.join(appDir, script) });
    }

    const state = () =>
      page.evaluate(() => ({
        accent: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(),
        open: document.getElementById('accent-picker').classList.contains('is-open'),
        expanded: document.getElementById('swatch-custom').getAttribute('aria-expanded'),
        label: document.getElementById('accent-custom-label').textContent,
        chipActive: document.getElementById('swatch-custom').classList.contains('active'),
        recent: [...document.querySelectorAll('#accent-recent button')].map((b) => b.dataset.accent),
        saved: JSON.parse(localStorage.getItem('aw-overlay-settings-v1') || '{}'),
      }));

    await page.click('#overlay-settings-toggle');
    let now = await state();
    assert.equal(now.open, false, 'the picker waits for the chip');
    assert.equal(now.label, 'Custom');

    await page.click('#swatch-custom');
    now = await state();
    assert.equal(now.open, true);
    assert.equal(now.expanded, 'true');

    // A typed code applies at once and is remembered.
    await page.evaluate(() => {
      const code = document.getElementById('accent-code');
      code.focus();
      code.value = '#9B6BFF';
      code.dispatchEvent(new Event('input', { bubbles: true }));
    });
    now = await state();
    assert.equal(now.accent, '#9b6bff');
    assert.equal(now.label, '#9B6BFF');
    assert.equal(now.chipActive, true);
    assert.deepEqual(now.recent, ['#9b6bff']);
    assert.equal(now.saved.accent, '#9b6bff');

    // A half-typed code is flagged and changes nothing.
    const invalid = await page.evaluate(() => {
      const code = document.getElementById('accent-code');
      code.value = '#9B6';
      code.dispatchEvent(new Event('input', { bubbles: true }));
      return code.getAttribute('aria-invalid');
    });
    assert.equal(invalid, 'false', '#9B6 is a valid short code, kept for Enter');
    assert.equal((await state()).accent, '#9b6bff');

    // A drag on the shade pad shows each colour and keeps the one it ends on.
    const box = await page.$eval('#accent-shade', (el) => {
      const r = el.getBoundingClientRect();
      return { x: r.left, y: r.top, w: r.width, h: r.height };
    });
    await page.mouse.move(box.x + box.w * 0.9, box.y + box.h * 0.1);
    await page.mouse.down();
    await page.mouse.move(box.x + box.w * 0.5, box.y + box.h * 0.5);
    const during = await state();
    await page.mouse.up();
    now = await state();
    assert.notEqual(during.accent, '#9b6bff', 'the colour follows the drag');
    assert.equal(now.recent.length, 2, 'only the end of the drag is remembered');
    assert.equal(now.recent[0], now.accent);

    // The hue slider moves the colour around the wheel.
    await page.evaluate(() => {
      const hue = document.getElementById('accent-hue');
      hue.value = '10';
      hue.dispatchEvent(new Event('input', { bubbles: true }));
      hue.dispatchEvent(new Event('change', { bubbles: true }));
    });
    const hued = await state();
    assert.notEqual(hued.accent, now.accent);

    // A recent colour comes back in one click; a preset closes the picker.
    await page.click('#accent-recent button:last-child');
    assert.equal((await state()).accent, '#9b6bff');
    await page.click('.swatch[data-accent="#2ecc71"]');
    now = await state();
    assert.equal(now.accent, '#2ecc71');
    assert.equal(now.open, false);
    assert.equal(now.label, 'Custom');
    assert.equal(now.chipActive, false);
    assert.ok(now.recent.includes('#9b6bff'), 'recent colours outlive a preset');
  } finally {
    await closeBrowser(browser, userDataDir);
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
