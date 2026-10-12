'use strict';

// An on/off setting is a switch, not a list to step through. The real markup and stylesheet, with
// the arrow handler settings.js installs, so the switch is checked against what it drives.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { launchBrowser, closeBrowser, skipReason } = require('../helpers/chromium');
const { openStaticApp, showPanel, appDir } = require('../helpers/staticApp');

const BINARY = '#option_autoApplyNewGames';
const MULTI = '#option_libraryLayout';
// A true/false row worded as a choice between two things, like Oldest / Newest.
const CHOICE = '#option_stampIdentity';

async function openSettingsWithSwitches(browser) {
  const page = await openStaticApp(browser);
  await showPanel(page, '#settings');
  await page.evaluate((binary, choice) => {
    // The locale words almost every true/false row Enabled / Disabled.
    for (const select of document.querySelectorAll('#settings .arrow-list select')) {
      const on = select.querySelector('option[value="true"]');
      const off = select.querySelector('option[value="false"]');
      if (on && off) [on.textContent, off.textContent] = ['Enabled', 'Disabled'];
    }
    document.querySelector(choice).querySelector('option[value="true"]').textContent = 'Newest';
    document.querySelector(choice).querySelector('option[value="false"]').textContent = 'Oldest';
    const select = document.querySelector(binary);
    select.closest('section.content').style.display = 'block';
    select.closest('li').querySelector('.left span').textContent = 'Apply to new games';
    select.value = 'false';
    window.changes = 0;
    select.addEventListener('change', () => window.changes++);
    // The same stepping settings.js binds to every arrow.
    $('#settings .arrow-list .next').click(function () {
      const sel = $(this).parent('.right').find('select')[0];
      sel.options[(sel.selectedIndex + 1) % sel.options.length].selected = true;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }, BINARY, CHOICE);
  await page.addScriptTag({ path: path.join(appDir, 'ui', 'settingsSwitch.js') });
  return page;
}

test('a true/false setting shows a named switch in place of the stepper', async (t) => {
  const { browser, userDataDir, failures } = await launchBrowser(['--allow-file-access-from-files']);
  if (!browser) return t.skip(skipReason(failures));
  try {
    const page = await openSettingsWithSwitches(browser);
    const result = await page.evaluate((binary, multi, choice) => {
      const right = document.querySelector(binary).closest('.right');
      const button = right.querySelector('.setting-switch');
      const shown = (el) => getComputedStyle(el).display !== 'none';
      return {
        role: button && button.getAttribute('role'),
        checked: button && button.getAttribute('aria-checked'),
        name: button && button.getAttribute('aria-label'),
        state: button && button.textContent.trim(),
        stepperHidden: !shown(right.querySelector('.next')) && !shown(right.querySelector('.previous')) && !shown(right.querySelector('select')),
        multiUntouched: !document.querySelector(multi).closest('.right').querySelector('.setting-switch'),
        choiceUntouched: !document.querySelector(choice).closest('.right').querySelector('.setting-switch'),
      };
    }, BINARY, MULTI, CHOICE);
    assert.deepEqual(result, {
      role: 'switch',
      checked: 'false',
      name: 'Apply to new games',
      state: 'Disabled',
      stepperHidden: true,
      multiUntouched: true,
      choiceUntouched: true,
    });
  } finally {
    await closeBrowser(browser, userDataDir);
  }
});

test('the switch flips the setting through the same arrow, once per press', async (t) => {
  const { browser, userDataDir, failures } = await launchBrowser(['--allow-file-access-from-files']);
  if (!browser) return t.skip(skipReason(failures));
  try {
    const page = await openSettingsWithSwitches(browser);
    const result = await page.evaluate(async (binary) => {
      const select = document.querySelector(binary);
      const button = select.closest('.right').querySelector('.setting-switch');
      button.click();
      const afterClick = { value: select.value, checked: button.getAttribute('aria-checked'), changes: window.changes };
      // A value loaded from options.ini arrives without a change event.
      select.value = 'false';
      document.querySelector('#settings').click();
      await new Promise((resolve) => setTimeout(resolve, 20));
      return { afterClick, afterLoad: button.getAttribute('aria-checked') };
    }, BINARY);
    assert.deepEqual(result.afterClick, { value: 'true', checked: 'true', changes: 1 });
    assert.equal(result.afterLoad, 'false', 'a value set from code repaints the switch');
  } finally {
    await closeBrowser(browser, userDataDir);
  }
});
