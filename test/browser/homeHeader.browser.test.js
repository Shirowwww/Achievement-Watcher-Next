'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { launchBrowser, closeBrowser, skipReason } = require('../helpers/chromium.js');

const appDir = path.join(__dirname, '..', '..', 'app');

// <user-avatar> only gets its box from the shadow DOM the component builds at runtime, and this
// page is loaded without the app scripts, so the header is measured with a stand-in of that size.
const AVATAR_STUB = `user-avatar {
  display: block;
  box-sizing: border-box;
  width: 96px;
  height: 96px;
  margin: 10px 16px 10px 10px;
  border: 2px solid #fff;
  flex: none;
}`;

/*
  The profile block used to sit in the flow while the search and sort controls were absolute
  overlays pinned to the same band. Any window under ~900px (or a long user name at any width)
  slid them under the avatar. They share one grid row now, so this walks the widths the app is
  actually resized to and asserts the three groups never intersect.
*/
test('the home header never lets the library controls run into the profile', { concurrency: 1, timeout: 120000 }, async (t) => {
  const { browser, userDataDir, failures } = await launchBrowser();
  if (!browser) {
    t.skip(skipReason(failures));
    return;
  }
  try {
    const page = await browser.newPage();
    await page.goto(pathToFileURL(path.join(appDir, 'view', 'app.html')).href, { waitUntil: 'domcontentloaded' });
    await page.addStyleTag({ content: AVATAR_STUB });

    for (const name of ['Shirow', 'UnPseudoBeaucoupTropLongPourLaBarre']) {
      for (const width of [1600, 1400, 1280, 1200, 1100, 1024, 1000, 950, 900, 800, 700]) {
        await page.setViewport({ width, height: 900 });
        const layout = await page.evaluate((userName) => {
          for (const selector of ['#user-info', '#search-bar', '#sort-box']) document.querySelector(selector).style.opacity = '1';
          document.querySelector('#user-info .name').textContent = userName;
          const rect = (selector) => {
            const box = document.querySelector(selector).getBoundingClientRect();
            return { left: box.left, right: box.right, top: box.top, bottom: box.bottom };
          };
          return { search: rect('#search-bar'), sort: rect('#sort-box'), profile: rect('#user-info'), documentWidth: document.documentElement.scrollWidth };
        }, name);

        const overlaps = (first, second) =>
          first.left < second.right - 0.5 && second.left < first.right - 0.5 && first.top < second.bottom - 0.5 && second.top < first.bottom - 0.5;
        const context = `${width}px / "${name}"`;
        assert.ok(!overlaps(layout.search, layout.profile), `the search controls overlap the profile at ${context}`);
        assert.ok(!overlaps(layout.sort, layout.profile), `the sort controls overlap the profile at ${context}`);
        assert.ok(!overlaps(layout.search, layout.sort), `the search and sort controls overlap at ${context}`);
        assert.equal(layout.documentWidth, width, `the home header widened the page at ${context}`);
      }
    }

    // Roomy windows keep the one-row header: controls flank the profile instead of stacking.
    await page.setViewport({ width: 1400, height: 900 });
    const wide = await page.evaluate(() => {
      const top = (selector) => Math.round(document.querySelector(selector).getBoundingClientRect().top);
      return { search: top('#search-bar'), sort: top('#sort-box'), profile: top('#user-info') };
    });
    assert.ok(wide.search > wide.profile && wide.sort > wide.profile, 'the controls should stay on the profile row on a wide window');

    // Narrow windows drop the controls to their own row rather than squeezing them into the profile.
    await page.setViewport({ width: 900, height: 900 });
    const narrow = await page.evaluate(() => ({
      searchTop: document.querySelector('#search-bar').getBoundingClientRect().top,
      profileBottom: document.querySelector('#user-info').getBoundingClientRect().bottom,
    }));
    assert.ok(narrow.searchTop >= narrow.profileBottom - 0.5, 'the controls should sit below the profile on a narrow window');
  } finally {
    await closeBrowser(browser, userDataDir);
  }
});
