'use strict';

// Simple mode folds rows away and the search skips them; the panel still has to know they exist so
// it can offer Advanced instead of answering "nothing found". Also proves the folded sections are
// searched, and that folding an emptied section never touches a value.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { launchBrowser, closeBrowser, skipReason } = require('../helpers/chromium');
const { openStaticApp, showPanel, appDir } = require('../helpers/staticApp');

async function openPanel(browser) {
  const page = await openStaticApp(browser);
  await page.evaluate(`const module = { exports: {} }; ${fs.readFileSync(path.join(appDir, 'util', 'settingsSearch.js'), 'utf8')}; window.searchRules = module.exports;`);
  await showPanel(page, '#settings');
  return page;
}

test('search counts the rows Simple mode folds away, and never counts them as results', async (t) => {
  const { browser, userDataDir, failures } = await launchBrowser(['--allow-file-access-from-files']);
  if (!browser) return t.skip(skipReason(failures));
  try {
    const page = await openPanel(browser);
    const result = await page.evaluate(() => {
      // What Simple mode does to an unused niche source and to a whole technical tab.
      $('#option_greenLuma').closest('li').addClass('mode-hidden');
      $("#settings section.content[data-view='emulator']").addClass('mode-hidden');
      return {
        folded: window.searchRules.countModeHiddenMatches($, 'greenluma'),
        foldedTab: window.searchRules.countModeHiddenMatches($, 'steamlessAutoUnpack'),
        none: window.searchRules.countModeHiddenMatches($, ''),
        visible: window.searchRules.filterSections($, 'greenluma').total,
        visibleTab: window.searchRules.filterSections($, 'steamlessAutoUnpack').total,
        stillFolded: $('#option_greenLuma').closest('li').hasClass('mode-hidden'),
        value: $('#option_greenLuma').val(),
      };
    });
    assert.equal(result.folded, 1, 'the folded GreenLuma row is announced');
    assert.equal(result.foldedTab, 1, 'a row inside a folded tab is announced too');
    assert.equal(result.none, 0, 'an empty query announces nothing');
    assert.equal(result.visible, 0, 'a folded row is not a visible result');
    assert.equal(result.visibleTab, 0);
    assert.equal(result.stillFolded, true, 'searching never unfolds a row');
  } finally {
    await closeBrowser(browser, userDataDir);
  }
});

test('a search reaches rows inside sections that start folded', async (t) => {
  const { browser, userDataDir, failures } = await launchBrowser(['--allow-file-access-from-files']);
  if (!browser) return t.skip(skipReason(failures));
  try {
    const page = await openPanel(browser);
    const sectionRules = require(path.join(appDir, 'util', 'settingsSections.js'));
    const result = await page.evaluate((folded) => {
      // The collapse is a class on the section card, found by the same key the panel uses.
      const cardOf = (el) => (el.matches('.arrow-list, .emulator-group, .settings-card') ? el : el.closest('.arrow-list, .emulator-group, .settings-card'));
      folded
        .map((key) => document.getElementById(key))
        .filter(Boolean)
        .forEach((el) => cardOf(el).classList.add('settings-section', 'is-collapsed'));
      document.querySelector("#settings section.content[data-view='notification']").classList.add('active');
      const souvenirCard = cardOf(document.querySelector('#options-notify-souvenir'));
      const row = document.querySelector('#option_souvenirScreenshot').closest('li');
      const shown = () => row.getClientRects().length > 0;
      const before = shown();
      document.querySelector('#settings').classList.add('searching');
      window.searchRules.filterSections($, 'souvenirScreenshot');
      return { foldedBefore: !before, shownWhileSearching: shown(), souvenirFolded: souvenirCard.classList.contains('is-collapsed') };
    }, sectionRules.DEFAULT_COLLAPSED);
    assert.equal(result.souvenirFolded, true, 'the souvenir section starts folded');
    assert.equal(result.foldedBefore, true, 'a row in a folded section is hidden');
    assert.equal(result.shownWhileSearching, true, 'the search sees through the fold without opening the section');
  } finally {
    await closeBrowser(browser, userDataDir);
  }
});
