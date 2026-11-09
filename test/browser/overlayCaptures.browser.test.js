'use strict';

// The overlay's screenshot and clip buttons come from the main window's capture index. An
// achievement named like an Object method ("constructor") must not break the list. Real overlay.js.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { launchBrowser, closeBrowser, skipReason } = require('../helpers/chromium');
const { appDir, withoutScripts } = require('../helpers/staticApp');

const GAME = {
  appid: '400',
  name: 'Portal',
  achievement: {
    list: [
      { name: 'constructor', displayName: 'Builder', description: '', Achieved: true, UnlockTime: 1700000000 },
      { name: 'DONE', displayName: 'Done', description: '', Achieved: true, UnlockTime: 1700000100 },
      { name: 'LATER', displayName: 'Later', description: '', Achieved: false },
    ],
  },
};

test('capture buttons show for the achievements that have one, whatever the names', async (t) => {
  const { browser, userDataDir, failures } = await launchBrowser(['--allow-file-access-from-files']);
  if (!browser) return t.skip(skipReason(failures));
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-overlay-captures-'));
  try {
    const html = withoutScripts(fs.readFileSync(path.join(appDir, 'view', 'overlay.html'), 'utf8')).replace(
      '<head>',
      `<head><base href="file:///${path.join(appDir, 'view').replace(/\\/g, '/')}/">`
    );
    const file = path.join(directory, 'overlay.html');
    fs.writeFileSync(file, html);

    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await page.setViewport({ width: 460, height: 800 });
    await page.goto('file:///' + file.replace(/\\/g, '/'));
    await page.evaluate(() => {
      const known = {
        onOverlay(callback) {
          window.__showGame = callback;
        },
        achievementCaptures: () => Promise.resolve({ DONE: [{ kind: 'screenshot', url: 'file:///C:/captures/done.png', at: 1700000200 }] }),
      };
      window.api = new Proxy(known, { get: (target, key) => target[key] || (() => Promise.resolve(null)) });
      window.customApi = { closeOverlay() {} };
    });
    for (const script of ['util/intlFormat.js', 'util/rarityTiers.js', 'util/overlayUi.js', 'util/controllerLabels.js', 'view/overlay.js']) {
      await page.addScriptTag({ path: path.join(appDir, script) });
    }
    await page.evaluate((game) => window.__showGame(game), GAME);
    await new Promise((resolve) => setTimeout(resolve, 300));

    const seen = await page.evaluate(() => ({
      rows: [...document.querySelectorAll('#overlayRows .overlay-row')].map((row) => row.dataset.name),
      buttons: [...document.querySelectorAll('#overlayRows .overlay-capture-btn')].map((button) => button.closest('.overlay-row').dataset.name),
    }));
    assert.deepEqual(errors, []);
    assert.deepEqual([...seen.rows].sort(), ['DONE', 'LATER', 'constructor']);
    assert.deepEqual(seen.buttons, ['DONE']);
  } finally {
    await closeBrowser(browser, userDataDir);
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
