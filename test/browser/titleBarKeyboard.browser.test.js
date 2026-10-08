'use strict';

// The real <title-bar> element in a real engine, with only ipcRenderer stubbed: Enter and Space press
// each button, other keys do nothing, and nothing the keyboard can do reaches past an open Settings.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { launchBrowser, closeBrowser, skipReason } = require('../helpers/chromium');
const { appDir } = require('../helpers/staticApp');

test('title-bar buttons answer Enter and Space, and stay inert while Settings is open', async (t) => {
  const { browser, userDataDir, failures } = await launchBrowser(['--allow-file-access-from-files']);
  if (!browser) return t.skip(skipReason(failures));
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-titlebar-'));
  try {
    const base = 'file:///' + path.join(appDir, 'components', 'titleBar').replace(/\\/g, '/') + '/';
    const page = path.join(directory, 'titlebar.html');
    fs.writeFileSync(
      page,
      `<!doctype html><meta charset="utf-8"><base href="${base}">
       <body><title-bar></title-bar>
       <script>
         window.calls = [];
         window.require = () => ({ ipcRenderer: { invoke: (name) => { window.calls.push(name); return Promise.resolve(true); } } });
       </script>
       <script type="module">
         import TitleBar from './titleBar.js';
         customElements.define('title-bar', TitleBar);
         window.ready = true;
       </script></body>`
    );
    const tab = await browser.newPage();
    await tab.goto('file:///' + page.replace(/\\/g, '/'));
    await tab.waitForFunction('window.ready === true');

    const result = await tab.evaluate(() => {
      const bar = document.querySelector('title-bar');
      const root = bar.shadowRoot;
      const events = [];
      bar.addEventListener('open-settings', () => events.push('settings'));
      bar.addEventListener('refresh-library', () => events.push('refresh'));
      const press = (selector, key) =>
        root.querySelector(selector).dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
      const tabIndex = (selector) => root.querySelector(selector).tabIndex;

      const roles = ['#btn-close', '#btn-maximize', '#btn-minimize', '#btn-settings', '#btn-refresh'].map((s) => root.querySelector(s).getAttribute('role'));
      press('#btn-settings', 'Enter');
      press('#btn-settings', ' ');
      press('#btn-settings', 'a');
      press('#btn-refresh', 'Enter');
      press('#btn-close', 'Enter');
      press('#btn-minimize', ' ');
      const open = { events: events.splice(0), calls: window.calls.splice(0) };

      bar.inSettings = true;
      const covered = { settings: tabIndex('#btn-settings'), refresh: tabIndex('#btn-refresh'), close: tabIndex('#btn-close') };
      press('#btn-settings', 'Enter');
      press('#btn-refresh', 'Enter');
      const blocked = events.splice(0);
      bar.inSettings = false;
      return { roles, open, covered, blocked, reopened: tabIndex('#btn-settings') };
    });

    assert.deepEqual(result.roles, Array(5).fill('button'));
    assert.deepEqual(result.open.events, ['settings', 'settings', 'refresh'], 'Enter and Space press; other keys do not');
    assert.ok(result.open.calls.includes('win-close') && result.open.calls.includes('win-minimize'));
    assert.deepEqual(result.covered, { settings: -1, refresh: -1, close: 0 }, 'only what Settings covers leaves the tab order');
    assert.deepEqual(result.blocked, [], 'a key cannot open Settings again or rescan from behind it');
    assert.equal(result.reopened, 0, 'and they return when Settings closes');
  } finally {
    await closeBrowser(browser, userDataDir);
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
