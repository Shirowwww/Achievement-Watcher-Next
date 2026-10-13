'use strict';

/*
  Issue #123: a game Steam confirmed has no achievements (Final Fantasy XIV) showed a big "No
  achievements" bar under its portrait. Settings can now leave that bar out (hide-tile-empty-progress),
  keeping its space so the grid stays even, while a list that is merely empty (schema not found yet)
  keeps its label either way.
*/

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test, before, after } = require('node:test');
const { launchBrowser, closeBrowser, skipReason } = require('../helpers/chromium');

const appDir = path.join(__dirname, '..', '..', 'app');
const css = fs.readFileSync(path.join(appDir, 'resources', 'css', 'app.css'), 'utf8').replace(/<\/style/gi, '<\\/style');

const tile = (id, barClass, label) => `<li><div class="game-box" id="${id}">
    <div class="header"></div>
    <div class="info">
      <div class="info-head"><div class="title">${id}</div></div>
      <div class="progressBar${barClass}" data-percent="0"><span class="meter" style="width:0%"></span><span class="progress-value">${label}</span></div>
    </div>
  </div></li>`;

// content-visibility: auto skips a card's children for its first frames, which reads as a 0px
// artwork; it is a paint optimization with no bearing on the geometry measured here (as in
// libraryChromeMatrix.browser.test.js).
const harness = `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style>
<style>#game-list .game-box { content-visibility: visible; }</style></head><body>
  <div id="game-list"><ul>
    ${tile('normal', '', '40 %')}
    ${tile('none', ' unavailable is-none', 'No achievements')}
    ${tile('unknown', ' unavailable', 'No achievements')}
  </ul></div>
</body></html>`;

let shared = null;
before(async () => {
  const { browser, userDataDir, failures } = await launchBrowser();
  shared = { browser, userDataDir, failures };
});
after(async () => {
  if (shared && shared.browser) await closeBrowser(shared.browser, shared.userDataDir);
  shared = null;
});

async function layout(view) {
  const page = await shared.browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });
  await page.setContent(harness, { waitUntil: 'load' });
  const read = await page.evaluate((mode) => {
    const list = document.querySelector('#game-list');
    const style = (id) => getComputedStyle(document.querySelector(`#${id} .progressBar`));
    const shownBar = (id) => style(id).display !== 'none' && style(id).visibility !== 'hidden';
    const height = (selector) => document.querySelector(selector).getBoundingClientRect().height;
    list.className = `view-${mode}`;
    const byDefault = shownBar('none');
    list.className = `view-${mode} hide-tile-empty-progress`;
    return {
      byDefault,
      none: shownBar('none'),
      unknown: shownBar('unknown'),
      cards: ['normal', 'none', 'unknown'].map((id) => height(`#${id}`)),
      artwork: ['normal', 'none'].map((id) => height(`#${id} .header`)),
    };
  }, view);
  await page.close();
  return read;
}

for (const view of ['portrait', 'portrait-compact', 'default', 'compact']) {
  test(`${view}: a game with no achievements gives its bar's space to its artwork`, async (t) => {
    if (!shared || !shared.browser) return t.skip(skipReason(shared ? shared.failures : []));
    const read = await layout(view);
    assert.equal(read.byDefault, true, 'the label stays until Settings leaves it out');
    assert.equal(read.none, false, 'no bar and no label once it is left out');
    assert.equal(read.unknown, true, 'an unconfirmed empty list still says so');
    assert.ok(Math.abs(read.cards[0] - read.cards[1]) < 1, `the card keeps its neighbours' height (${read.cards.join(', ')})`);
    assert.ok(read.artwork[1] > read.artwork[0] + 3, `the artwork takes the freed space (${read.artwork.join(', ')})`);
  });
}

for (const view of ['list', 'details']) {
  test(`${view}: the empty slot stays so the columns line up`, async (t) => {
    if (!shared || !shared.browser) return t.skip(skipReason(shared ? shared.failures : []));
    const read = await layout(view);
    assert.equal(read.none, false, 'no bar and no label once it is left out');
    assert.ok(Math.abs(read.cards[0] - read.cards[1]) < 1, `rows keep one height (${read.cards.join(', ')})`);
    assert.ok(Math.abs(read.artwork[0] - read.artwork[1]) < 1, `the thumbnail is not stretched in a row (${read.artwork.join(', ')})`);
  });
}
