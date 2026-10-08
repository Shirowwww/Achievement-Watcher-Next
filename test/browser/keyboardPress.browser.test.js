'use strict';

// The library toolbar, the game page and the empty-state button are divs, so none of them took a
// keypress. Measured on the real markup: each is focusable and answers Enter and Space once, key
// repeat and a control locked by its own animation do not fire it again.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { launchBrowser, closeBrowser, skipReason } = require('../helpers/chromium');
const { openStaticApp, appDir } = require('../helpers/staticApp');

const CONTROLS = [
  '#sort-box .installed-filter',
  '#sort-box .sort.alpha',
  '#sort-box .sort.percentage',
  '#sort-box .sort.time',
  '#sort-box .sort.played',
  '#empty-open-folders',
  '#btn-previous',
  '#btn-scrollup',
  '#btn-reset-achievements',
  '#unlock .header .sort-ach .sort.percentage',
  '#unlock .header .sort-ach .sort.time',
  '#lock .header .sort-ach .sort.percentage',
  '#unlock .header .toggle',
  '#lock .header .toggle',
];

test('div-based controls take Enter and Space like buttons', async (t) => {
  const { browser, userDataDir, failures } = await launchBrowser(['--allow-file-access-from-files']);
  if (!browser) return t.skip(skipReason(failures));
  try {
    const page = await openStaticApp(browser);
    await page.addScriptTag({ path: path.join(appDir, 'ui', 'keyboardPress.js') });
    await page.addStyleTag({
      content: '#home, #achievement, #game-list .isEmpty, #btn-scrollup, #achievement .achievement-list { display: block !important; }',
    });

    // Until the library has loaded, the toolbar is invisible and must not be a Tab stop either.
    const whileLoading = await page.evaluate(() => {
      const sort = document.querySelector('#sort-box .sort.alpha');
      sort.focus();
      return { focused: document.activeElement === sort, inert: ['#sort-box', '#search-bar', '#user-info'].map((s) => document.querySelector(s).inert) };
    });
    assert.deepEqual(whileLoading, { focused: false, inert: [true, true, true] });
    // What app.js does once the library is shown.
    await page.evaluate(() => {
      for (const sort of document.querySelectorAll('#achievement .sort-ach .sort')) sort.classList.add('show');
      for (const element of document.querySelectorAll('#sort-box, #search-bar, #user-info')) {
        element.inert = false;
        element.style.pointerEvents = 'auto';
        element.style.opacity = '1';
      }
    });

    const markup = await page.evaluate(() => ({
      unfocusable: [...document.querySelectorAll('[role="button"]')].filter((el) => el.tabIndex < 0).map((el) => el.id || el.className),
      unnamed: [...document.querySelectorAll('#unlock .toggle, #lock .toggle')].map((el) => document.getElementById(el.getAttribute('aria-labelledby')) !== null),
    }));
    assert.deepEqual(markup.unfocusable, [], 'a role="button" that Tab cannot reach');
    assert.deepEqual(markup.unnamed, [true, true], 'each collapse toggle points at its list title');

    for (const selector of CONTROLS) {
      const handle = await page.$(selector);
      assert.ok(handle, `${selector} is missing from the markup`);
      await handle.evaluate((el) => {
        window.presses = 0;
        el.addEventListener('click', () => (window.presses += 1));
        el.focus();
      });
      assert.equal(await handle.evaluate((el) => document.activeElement === el), true, `${selector} cannot take focus`);
      await page.keyboard.press('Enter');
      await page.keyboard.press('Space');
      await page.keyboard.press('a');
      assert.equal(await page.evaluate(() => window.presses), 2, `${selector}: Enter and Space press once each, other keys do nothing`);
    }

    // Held down: only the first keydown counts.
    await page.evaluate(() => {
      window.presses = 0;
      document.querySelector('#btn-previous').focus();
    });
    await page.keyboard.down('Enter');
    await page.keyboard.down('Enter');
    await page.keyboard.up('Enter');
    assert.equal(await page.evaluate(() => window.presses), 1, 'key repeat must not press again');

    // The handlers lock a control while it animates by setting pointer-events: none.
    const locked = await page.evaluate(() => {
      const button = document.querySelector('#btn-previous');
      window.presses = 0;
      button.style.pointerEvents = 'none';
      button.focus();
      return true;
    });
    assert.ok(locked);
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => window.presses), 0, 'a locked control stays locked for the keyboard too');

    // A key a handler already consumed is not pressed a second time.
    await page.evaluate(() => {
      const button = document.querySelector('#lock .header .toggle');
      window.presses = 0;
      button.addEventListener('click', () => (window.presses += 1));
      button.addEventListener('keydown', (event) => event.preventDefault());
      button.focus();
    });
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => window.presses), 0, 'a key a handler already consumed is left alone');
  } finally {
    await closeBrowser(browser, userDataDir);
  }
});
