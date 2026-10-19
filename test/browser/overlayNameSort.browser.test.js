'use strict';

// The in-game overlay sorts by name from its first column header, like it already did by rarity,
// date and status. The real overlay.js runs here against the real overlay.html.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { launchBrowser, closeBrowser, skipReason } = require('../helpers/chromium');
const { appDir, withoutScripts } = require('../helpers/staticApp');

const GAME = {
  appid: '480',
  name: 'Spacewar',
  achievement: {
    list: [
      { name: 'B', displayName: 'beta', description: '', Achieved: true, UnlockTime: 1700000000 },
      { name: 'C', displayName: 'Gamma', description: '', Achieved: false },
      { name: 'A', displayName: 'Alpha', description: '', Achieved: false },
    ],
  },
};

test('the name column header sorts the overlay rows by name, then reverses, then lets go', async (t) => {
  const { browser, userDataDir, failures } = await launchBrowser(['--allow-file-access-from-files']);
  if (!browser) return t.skip(skipReason(failures));
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-overlay-sort-'));
  try {
    const html = withoutScripts(fs.readFileSync(path.join(appDir, 'view', 'overlay.html'), 'utf8')).replace('<head>', `<head><base href="file:///${path.join(appDir, 'view').replace(/\\/g, '/')}/">`);
    const file = path.join(directory, 'overlay.html');
    fs.writeFileSync(file, html);

    const page = await browser.newPage();
    await page.setViewport({ width: 460, height: 800 });
    await page.goto('file:///' + file.replace(/\\/g, '/'));
    await page.evaluate(() => {
      const known = {
        onOverlay(callback) {
          window.__showGame = callback;
        },
      };
      window.api = new Proxy(known, { get: (target, key) => target[key] || (() => Promise.resolve(null)) });
      window.customApi = { closeOverlay() {} };
    });
    for (const script of ['util/intlFormat.js', 'util/rarityTiers.js', 'util/overlayUi.js', 'util/controllerLabels.js', 'view/overlay.js']) {
      await page.addScriptTag({ path: path.join(appDir, script) });
    }
    await page.evaluate((game) => window.__showGame(game), GAME);

    const read = () =>
      page.evaluate(() => ({
        names: [...document.querySelectorAll('#overlayRows .overlay-name')].map((cell) => cell.textContent),
        sort: document.querySelector('#overlay-th-achievement').getAttribute('aria-sort'),
      }));

    assert.deepEqual((await read()).names, ['beta', 'Gamma', 'Alpha'], 'rows start in schema order');
    await page.click('#overlay-th-achievement');
    assert.deepEqual(await read(), { names: ['Alpha', 'beta', 'Gamma'], sort: 'ascending' }, 'case does not split the alphabet');
    await page.click('#overlay-th-achievement');
    assert.deepEqual(await read(), { names: ['Gamma', 'beta', 'Alpha'], sort: 'descending' });
    await page.click('#overlay-th-achievement');
    assert.deepEqual(await read(), { names: ['beta', 'Gamma', 'Alpha'], sort: 'none' });

    await page.click('#overlay-th-achievement');
    await page.click('#overlay-th-status');
    const switched = await read();
    assert.equal(switched.sort, 'none', 'another column takes the sort over');
  } finally {
    await closeBrowser(browser, userDataDir);
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
