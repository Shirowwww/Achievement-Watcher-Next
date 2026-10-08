'use strict';

// Settings and the game configuration as a keyboard user meets them: the panel is a named dialog,
// its tabs can be focused, and focus that lands behind it is sent back inside.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { launchBrowser, closeBrowser, skipReason } = require('../helpers/chromium');
const { openStaticApp, showPanel, appDir } = require('../helpers/staticApp');

const EXEMPT = '.aw-prompt-overlay, #onboarding, #theme-preview, .simple-modal, title-bar';

test('the panels are named dialogs and every Settings tab can take focus', async (t) => {
  const { browser, userDataDir, failures } = await launchBrowser(['--allow-file-access-from-files']);
  if (!browser) return t.skip(skipReason(failures));
  try {
    const page = await openStaticApp(browser);
    const result = await page.evaluate(() => {
      const named = (box) => {
        const dialog = document.querySelector(box);
        const label = document.getElementById(dialog.getAttribute('aria-labelledby'));
        return { role: dialog.getAttribute('role'), modal: dialog.getAttribute('aria-modal'), labelled: label !== null };
      };
      return {
        settings: named('#settings .box'),
        gameConfig: named('#game-config .box'),
        tabs: [...document.querySelectorAll('#settingNav li[data-view]')].map((item) => [item.getAttribute('role'), item.tabIndex]),
        groups: [...document.querySelectorAll('#settingNav li.nav-group')].map((item) => item.tabIndex),
      };
    });
    const dialog = { role: 'dialog', modal: 'true', labelled: true };
    assert.deepEqual(result.settings, dialog);
    assert.deepEqual(result.gameConfig, dialog);
    assert.equal(result.tabs.length, 11);
    assert.deepEqual([...new Set(result.tabs.map((tab) => tab.join()))], ['button,0'], 'each tab is a focusable button');
    assert.deepEqual([...new Set(result.groups)], [-1], 'the group captions are not tab stops');
  } finally {
    await closeBrowser(browser, userDataDir);
  }
});

test('focus that lands behind an open panel is sent back inside it', async (t) => {
  const { browser, userDataDir, failures } = await launchBrowser(['--allow-file-access-from-files']);
  if (!browser) return t.skip(skipReason(failures));
  try {
    const page = await openStaticApp(browser);
    // panelFocus.js is a CommonJS module; the page has no `module`, so give it one to write to.
    await page.evaluate(() => {
      window.module = { exports: {} };
    });
    await page.addScriptTag({ path: path.join(appDir, 'util', 'panelFocus.js') });
    await page.evaluate(() => {
      window.focusTrapTarget = module.exports.focusTrapTarget;
    });
    await page.addStyleTag({ content: '#home { display: block !important; }' });
    await showPanel(page, '#settings');
    await page.evaluate(() => {
      document.querySelector('#home').style.display = 'block';
      document.querySelector('#settingNav li[data-view="general"]').classList.add('active');
    });

    const outcome = await page.evaluate((exempt) => {
      const panel = document.querySelector('#settings .box');
      const ask = (landed, preferred) => {
        const target = window.focusTrapTarget({ panel, landed, exempt, preferred });
        return target ? target.id || target.dataset.view || target.className || target.tagName : null;
      };
      const behind = document.querySelector('#add-game-manually');
      const inside = document.querySelector('#option_lang');
      const stray = document.createElement('button');
      stray.className = 'aw-prompt-button';
      const prompt = document.createElement('div');
      prompt.className = 'aw-prompt-overlay';
      prompt.append(stray);
      document.body.append(prompt);
      return {
        behind: ask(behind, '#settingNav li.active'),
        behindNoPreference: ask(behind),
        inside: ask(inside, '#settingNav li.active'),
        prompt: ask(stray, '#settingNav li.active'),
        titleBar: ask(document.createElement('title-bar'), '#settingNav li.active'),
        hiddenPreference: ask(behind, '#settingNav li[data-view="advanced"].nope'),
        noPanel: window.focusTrapTarget({ panel: null, landed: behind, exempt }),
      };
    }, EXEMPT);

    assert.equal(outcome.behind, 'general', 'lands on the open tab');
    assert.ok(outcome.behindNoPreference, 'with no preference it takes the first control in the panel');
    assert.equal(outcome.inside, null, 'focus already inside stays put');
    assert.equal(outcome.prompt, null, 'a prompt above the panel keeps focus');
    assert.equal(outcome.titleBar, null, 'so does the title bar');
    assert.ok(outcome.hiddenPreference, 'a preference that does not exist falls back to the first control');
    assert.equal(outcome.noPanel, null, 'with no panel open nothing is redirected');
  } finally {
    await closeBrowser(browser, userDataDir);
  }
});
