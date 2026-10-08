'use strict';

// The stylesheet resets `*:focus { outline: none }`, so a control with no ring of its own used to
// give a keyboard user nothing to follow. Measured on the real markup and CSS, one control per
// panel that had none (preset designer, game configuration, onboarding, range sliders).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { launchBrowser, closeBrowser, skipReason } = require('../helpers/chromium');
const { openStaticApp, showPanel } = require('../helpers/staticApp');

const CASES = [
  ['#settings', '#settings .content[data-view="appearance"]', '#option_libraryTileScale', 'a range slider in Settings'],
  ['#settings', '#settings .content[data-view="presets"]', '#settings .pd-group-head', 'a preset designer group header'],
  ['#game-config', '#game-config', '#game-config .game-config-tabs button:nth-child(2)', 'a game configuration tab'],
  ['#onboarding', '#onboarding', '#onboarding-close', 'the onboarding close button'],
];

test('keyboard focus is visible on controls that have no ring of their own', async (t) => {
  const { browser, userDataDir, failures } = await launchBrowser(['--allow-file-access-from-files']);
  if (!browser) return t.skip(skipReason(failures));
  try {
    const page = await openStaticApp(browser);
    for (const [panel, content, selector, what] of CASES) {
      await showPanel(page, panel);
      await page.evaluate((target) => {
        for (const view of document.querySelectorAll('#settings .content')) view.classList.remove('active');
        const wanted = document.querySelector(target);
        if (wanted && wanted.matches('.content')) wanted.classList.add('active');
        for (const step of document.querySelectorAll('.onboarding-step')) step.classList.add('active');
      }, content);
      await page.keyboard.press('Shift');
      const ring = await page.evaluate((target) => {
        const element = document.querySelector(target);
        element.focus({ focusVisible: true });
        const style = getComputedStyle(element);
        // The ring must also survive an ancestor that clips its overflow.
        const offset = parseFloat(style.outlineOffset);
        const reach = offset < 0 ? 0 : offset + parseFloat(style.outlineWidth);
        const box = element.getBoundingClientRect();
        let clipped = '';
        for (let up = element.parentElement; up && !clipped; up = up.parentElement) {
          if (getComputedStyle(up).overflowX === 'visible' || up.matches('.box, .content')) continue;
          const area = up.getBoundingClientRect();
          if (box.left - reach < area.left - 0.5 || box.right + reach > area.right + 0.5) clipped = up.className || up.tagName;
        }
        return { matches: element.matches(':focus-visible'), style: style.outlineStyle, width: parseFloat(style.outlineWidth), clipped };
      }, selector);
      assert.ok(ring.matches, `${what}: the probe must put it in :focus-visible`);
      assert.notEqual(ring.style, 'none', `${what} has no focus ring`);
      assert.ok(ring.width >= 2, `${what}: ring too thin (${ring.width}px)`);
      assert.equal(ring.clipped, '', `${what}: ring is cut off by .${ring.clipped}`);
    }
  } finally {
    await closeBrowser(browser, userDataDir);
  }
});

test('a mouse click does not leave a ring on a button', async (t) => {
  const { browser, userDataDir, failures } = await launchBrowser(['--allow-file-access-from-files']);
  if (!browser) return t.skip(skipReason(failures));
  try {
    const page = await openStaticApp(browser);
    await showPanel(page, '#game-config');
    const tab = await page.$('#game-config .game-config-tabs button:nth-child(2)');
    await tab.click();
    const outline = await tab.evaluate((element) => getComputedStyle(element).outlineStyle);
    assert.equal(outline, 'none');
  } finally {
    await closeBrowser(browser, userDataDir);
  }
});
