'use strict';

// Pinned achievements lead the in-game overlay list, can be pinned there, and follow a pin set in
// the main window. The opacity slider changes the panel as it moves. Real overlay.js and overlay.html.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { launchBrowser, closeBrowser, skipReason } = require('../helpers/chromium');
const { appDir, withoutScripts } = require('../helpers/staticApp');

const GAME = {
  appid: '570940',
  name: 'Dark Souls',
  achievement: {
    list: [
      { name: 'ALPHA', displayName: 'Alpha', description: '', Achieved: false },
      { name: 'BRAVO', displayName: 'Bravo', description: '', Achieved: false },
      { name: 'DONE', displayName: 'Done', description: '', Achieved: true, UnlockTime: 1700000000 },
    ],
  },
  pins: ['BRAVO'],
};

test('pinned achievements lead the overlay list and can be pinned from it', async (t) => {
  const { browser, userDataDir, failures } = await launchBrowser(['--allow-file-access-from-files']);
  if (!browser) return t.skip(skipReason(failures));
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-overlay-pins-'));
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
      window.__pinCalls = [];
      const known = {
        onOverlay(callback) {
          window.__showGame = callback;
        },
        onPins(callback) {
          window.__pushPins = callback;
        },
        setPinned(appid, name, pinned) {
          window.__pinCalls.push({ appid, name, pinned });
          const pins = pinned ? [...window.__pins, name] : window.__pins.filter((entry) => entry !== name);
          window.__pins = pins;
          return Promise.resolve({ changed: true, pins });
        },
      };
      window.api = new Proxy(known, { get: (target, key) => target[key] || (() => Promise.resolve(null)) });
      window.customApi = { closeOverlay() {} };
    });
    for (const script of ['util/intlFormat.js', 'util/rarityTiers.js', 'util/overlayUi.js', 'util/controllerLabels.js', 'view/overlay.js']) {
      await page.addScriptTag({ path: path.join(appDir, script) });
    }
    await page.evaluate((game) => {
      window.__pins = [...game.pins];
      window.__showGame(game);
    }, GAME);

    const order = () =>
      page.evaluate(() =>
        [...document.querySelectorAll('#overlayRows .overlay-row')].map((row) => ({
          name: row.querySelector('.overlay-name').textContent,
          pinned: row.classList.contains('is-pinned'),
          button: row.querySelector('.overlay-pin') ? row.querySelector('.overlay-pin').getAttribute('aria-pressed') : null,
        }))
      );

    const start = await order();
    assert.deepEqual(start[0], { name: 'Bravo', pinned: true, button: 'true' }, 'the pinned achievement comes first');
    assert.equal(start.find((row) => row.name === 'Done').button, null, 'an unlocked achievement has nothing to pin');

    const alphaPin = await page.evaluateHandle(() =>
      [...document.querySelectorAll('#overlayRows .overlay-row')].find((row) => row.querySelector('.overlay-name').textContent === 'Alpha').querySelector('.overlay-pin')
    );
    await alphaPin.click();
    await page.waitForFunction(() => document.querySelectorAll('#overlayRows .overlay-row.is-pinned').length === 2);
    assert.deepEqual(await page.evaluate(() => window.__pinCalls), [{ appid: '570940', name: 'ALPHA', pinned: true }]);
    assert.deepEqual((await order()).slice(0, 2).map((row) => row.name).sort(), ['Alpha', 'Bravo']);

    await page.evaluate(() => window.__pushPins({ appid: '570940', pins: [] }));
    assert.equal((await order()).some((row) => row.pinned), false, 'an unpin from the main window redraws the list');
    await page.evaluate(() => window.__pushPins({ appid: '1', pins: ['ALPHA'] }));
    assert.equal((await order()).some((row) => row.pinned), false, "another game's pins are not this one's");

    const panel = await page.evaluate(() => {
      const range = document.getElementById('opacity-range');
      range.value = '35';
      range.dispatchEvent(new Event('input', { bubbles: true }));
      return {
        alpha: getComputedStyle(document.documentElement).getPropertyValue('--panel-alpha').trim(),
        label: document.getElementById('opacity-value').textContent,
        saved: JSON.parse(localStorage.getItem('aw-overlay-settings-v1') || '{}').opacity,
      };
    });
    assert.deepEqual(panel, { alpha: '0.35', label: '35%', saved: 0.35 }, 'the slider changes and keeps the panel opacity');
  } finally {
    await closeBrowser(browser, userDataDir);
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
