'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { launchBrowser, closeBrowser, skipReason } = require('../helpers/chromium');

/*
  A preset menu given to the gallery must open the gallery, never its own list, and picking a card
  must leave the menu holding that preset with a change event, which is what Settings saves.
*/

const appDir = path.join(__dirname, '..', '..', 'app');

function buildHarness() {
  return `<!doctype html><html><head><meta charset="utf-8"></head><body>
    <select id="preset"><option value="">Same as main</option><option value="Mine">Mine</option><option value="AW Next">AW Next</option></select>
    <script>
      const module = { exports: {} };
      ${fs.readFileSync(path.join(appDir, 'ui', 'presetGallery.js'), 'utf8')}
      window.gallery = module.exports.createPresetGallery({ label: (key) => key, snapshot: () => Promise.resolve(null) });
      window.changes = [];
      const select = document.getElementById('preset');
      select.addEventListener('change', () => window.changes.push(select.value));
      window.gallery.attach(select, {
        groups: (names) => [{ title: 'mine', names: names.filter((n) => n === 'Mine') }, { title: 'bundled', names: names.filter((n) => n !== 'Mine') }],
      });
    </script>
  </body></html>`;
}

test('a preset menu opens the gallery and takes the picked preset', { concurrency: 1, timeout: 120000 }, async (t) => {
  const { browser, userDataDir, failures } = await launchBrowser();
  if (!browser) {
    t.skip(skipReason(failures));
    return;
  }
  const harness = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'aw-gallery-')), 'harness.html');
  fs.writeFileSync(harness, buildHarness());

  try {
    const page = await browser.newPage();
    await page.goto('file://' + harness.replace(/\\/g, '/'));

    await page.click('#preset');
    const opened = await page.evaluate(() => ({
      open: window.gallery.isOpen(),
      groups: [...document.querySelectorAll('.pg-group-title')].map((h) => h.firstChild.textContent),
      tiles: [...document.querySelectorAll('.pg-tile')].map((tile) => tile.dataset.name),
      choices: [...document.querySelectorAll('.pg-choice')].map((c) => c.textContent),
      current: document.querySelector('.pg-choice.is-on') && document.querySelector('.pg-choice.is-on').textContent,
    }));
    assert.deepStrictEqual(opened, {
      open: true,
      groups: ['mine', 'bundled'],
      tiles: ['Mine', 'AW Next'],
      choices: ['Same as main'],
      current: 'Same as main',
    });

    await page.click('.pg-tile[data-name="AW Next"]');
    assert.strictEqual(await page.evaluate(() => window.gallery.isOpen()), false, 'picking closes the gallery');
    assert.strictEqual(await page.$eval('#preset', (s) => s.value), 'AW Next');
    assert.deepStrictEqual(await page.evaluate(() => window.changes), ['AW Next'], 'one change event, for the save');

    // The keyboard opens it too, and the empty choice goes back to "Same as main".
    await page.focus('#preset');
    await page.keyboard.press('Enter');
    assert.strictEqual(await page.evaluate(() => window.gallery.isOpen()), true, 'Enter opens the gallery');
    await page.click('.pg-choice');
    assert.strictEqual(await page.$eval('#preset', (s) => s.value), '');

    // A disabled menu (the game panel while it loads) opens nothing.
    await page.evaluate(() => {
      document.getElementById('preset').disabled = true;
    });
    await page.evaluate(() => document.getElementById('preset').dispatchEvent(new MouseEvent('mousedown', { button: 0 })));
    assert.strictEqual(await page.evaluate(() => window.gallery.isOpen()), false);
  } finally {
    await closeBrowser(browser, userDataDir);
  }
});
