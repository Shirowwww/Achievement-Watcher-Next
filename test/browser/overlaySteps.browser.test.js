'use strict';

// The in-game overlay shows the steps written under an achievement and ticks them, without
// editing them. The real overlay.js runs here against the real overlay.html.

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
      { name: 'KNIGHT', displayName: "Knight's Honor", description: 'Acquire all rare weapons.', hidden: 1, Achieved: false },
      { name: 'DONE', displayName: 'Done', description: '', Achieved: true, UnlockTime: 1700000000 },
      { name: 'NONE', displayName: 'No steps', description: '', Achieved: false },
    ],
  },
  steps: {
    KNIGHT: [
      { id: 'a1', text: 'Chaos Blade', done: true },
      { id: 'b2', text: '<b>Dragon Tooth</b>', done: false },
      { id: 'c3', text: 'Moonlight Greatsword', done: false },
    ],
    DONE: [{ id: 'd4', text: 'Last one', done: false }],
  },
};

test('the overlay opens an achievement steps, ticks one through the host and fills the bar', async (t) => {
  const { browser, userDataDir, failures } = await launchBrowser(['--allow-file-access-from-files']);
  if (!browser) return t.skip(skipReason(failures));
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-overlay-steps-'));
  try {
    const html = withoutScripts(fs.readFileSync(path.join(appDir, 'view', 'overlay.html'), 'utf8')).replace('<head>', `<head><base href="file:///${path.join(appDir, 'view').replace(/\\/g, '/')}/">`);
    const file = path.join(directory, 'overlay.html');
    fs.writeFileSync(file, html);

    const page = await browser.newPage();
    await page.setViewport({ width: 460, height: 800 });
    await page.goto('file:///' + file.replace(/\\/g, '/'));
    await page.evaluate(() => {
      window.__toggles = [];
      const known = {
        onOverlay(callback) {
          window.__showGame = callback;
        },
        onSteps(callback) {
          window.__pushSteps = callback;
        },
        toggleStep(appid, name, id, done) {
          window.__toggles.push({ appid, name, id, done });
          const steps = window.__game.steps[name].map((step) => (step.id === id ? { ...step, done } : step));
          return Promise.resolve({ changed: true, steps });
        },
      };
      window.api = new Proxy(known, { get: (target, key) => target[key] || (() => Promise.resolve(null)) });
      window.customApi = { closeOverlay() {} };
    });
    for (const script of ['util/intlFormat.js', 'util/rarityTiers.js', 'util/overlayUi.js', 'util/controllerLabels.js', 'view/overlay.js']) {
      await page.addScriptTag({ path: path.join(appDir, script) });
    }
    await page.evaluate((game) => {
      window.__game = game;
      window.__showGame(game);
    }, GAME);

    const read = () =>
      page.evaluate(() => {
        const rows = [...document.querySelectorAll('#overlayRows .overlay-row')];
        const knight = rows.find((row) => row.querySelector('.overlay-name').textContent === "Knight's Honor");
        const done = rows.find((row) => row.querySelector('.overlay-name').textContent === 'Done');
        const none = rows.find((row) => row.querySelector('.overlay-name').textContent === 'No steps');
        return {
          count: knight.querySelector('.overlay-steps-count').textContent,
          listHidden: knight.querySelector('.overlay-steps-list').hidden,
          expanded: knight.querySelector('.overlay-steps-toggle').getAttribute('aria-expanded'),
          ticks: [...knight.querySelectorAll('.overlay-step')].map((el) => el.getAttribute('aria-checked')),
          texts: [...knight.querySelectorAll('.overlay-step')].map((el) => el.textContent),
          bar: knight.querySelector('.overlay-progress .progress-meta span:last-child')?.textContent || null,
          masked: knight.querySelector('.overlay-desc').classList.contains('masked-desc'),
          doneCount: done.querySelector('.overlay-steps-count')?.textContent || null,
          doneDisabled: [...done.querySelectorAll('.overlay-step')].every((el) => el.disabled && el.getAttribute('aria-checked') === 'true'),
          noneBlock: none.querySelector('.overlay-steps'),
          injected: document.querySelectorAll('#overlayRows .overlay-step b').length,
        };
      });

    const start = await read();
    assert.equal(start.count, '1/3');
    assert.equal(start.listHidden, true, 'closed until asked');
    assert.equal(start.bar, '1 / 3', 'no counter of its own, so the bar shows the ticked steps');
    assert.deepEqual(start.texts, ['Chaos Blade', '<b>Dragon Tooth</b>', 'Moonlight Greatsword'], 'step texts stay text');
    assert.equal(start.injected, 0);
    assert.equal(start.doneCount, '1/1', 'an unlocked achievement has every step done');
    assert.equal(start.doneDisabled, true, 'and they cannot be unticked');
    assert.equal(start.noneBlock, null, 'no steps, nothing to show: adding them is the main window');

    await page.click('.overlay-steps-toggle');
    const opened = await read();
    assert.equal(opened.listHidden, false);
    assert.equal(opened.expanded, 'true');
    assert.equal(opened.masked, true, 'a click on the steps does not reveal the hidden description');

    await page.click('.overlay-step[data-step="b2"]');
    await page.waitForFunction(() => document.querySelector('.overlay-step[data-step="b2"]').getAttribute('aria-checked') === 'true');
    const ticked = await read();
    assert.deepEqual(await page.evaluate(() => window.__toggles), [{ appid: '570940', name: 'KNIGHT', id: 'b2', done: true }]);
    assert.equal(ticked.count, '2/3');
    assert.equal(ticked.bar, '2 / 3');
    assert.deepEqual(ticked.ticks, ['true', 'true', 'false']);

    await page.evaluate(() => window.__pushSteps({ appid: '570940', steps: { KNIGHT: [{ id: 'a1', text: 'Chaos Blade', done: true }] } }));
    assert.equal((await read()).count, '1/1', 'a change from the main window redraws the list');
    await page.evaluate(() => window.__pushSteps({ appid: '1', steps: {} }));
    assert.equal((await read()).count, '1/1', "another game's change is not this one");
  } finally {
    await closeBrowser(browser, userDataDir);
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
