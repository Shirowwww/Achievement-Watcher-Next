'use strict';

/*
  The collection filter hides tiles with a class, and that class has to compose with the search
  filter and the view modes under the shipped stylesheet. Only a real engine can say whether
  display:none wins over the view-list layout, so this runs in Chromium against app.css.
*/

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test, before, after } = require('node:test');
const { launchBrowser, closeBrowser, skipReason } = require('../helpers/chromium');

const appDir = path.join(__dirname, '..', '..', 'app');
const css = fs.readFileSync(path.join(appDir, 'resources', 'css', 'app.css'), 'utf8').replace(/<\/style/gi, '<\\/style');
const filterSource = fs.readFileSync(path.join(appDir, 'util', 'collectionFilter.js'), 'utf8');

const tiles = ['10', 'gog-10', '11', 'uplay-11']
  .map((id) => `<li><div class="game-box" data-appid="${id}"><div class="info"><div class="title">Game ${id}</div></div></div></li>`)
  .join('');
const harness = `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>
<div id="game-list" class="view-list"><ul>${tiles}</ul></div>
<script>const module = { exports: {} }; ${filterSource.replace(/<\/script/gi, '<\\/script')}; window.collectionFilter = module.exports;</script>
</body></html>`;

let shared = null;

before(async () => {
  shared = await launchBrowser();
});

after(async () => {
  if (shared && shared.browser) await closeBrowser(shared.browser, shared.userDataDir);
  shared = null;
});

async function open(t) {
  if (!shared || !shared.browser) {
    t.skip(skipReason(shared ? shared.failures : []));
    return null;
  }
  const page = await shared.browser.newPage();
  await page.setViewport({ width: 1200, height: 800 });
  await page.setContent(harness, { waitUntil: 'load' });
  return page;
}

const visibleIds = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('#game-list li')].filter((li) => getComputedStyle(li).display !== 'none').map((li) => li.querySelector('.game-box').dataset.appid)
  );

test('a collection hides every other tile, in list view too, and "all" brings them back', async (t) => {
  const page = await open(t);
  if (!page) return;
  await page.evaluate(() => window.collectionFilter.applyToList(document.querySelector('#game-list ul'), new Set(['10', 'uplay-11'])));
  assert.deepEqual(await visibleIds(page), ['10', 'uplay-11']);
  await page.evaluate(() => window.collectionFilter.applyToList(document.querySelector('#game-list ul'), null));
  assert.equal((await visibleIds(page)).length, 4);
  await page.close();
});

test('the collection filter composes with the search filter', async (t) => {
  const page = await open(t);
  if (!page) return;
  await page.evaluate(() => {
    window.collectionFilter.applyToList(document.querySelector('#game-list ul'), new Set(['10', 'gog-10', '11']));
    document.querySelector('[data-appid="gog-10"]').closest('li').classList.add('search-hidden');
  });
  assert.deepEqual(await visibleIds(page), ['10', '11']);
  await page.evaluate(() => window.collectionFilter.applyToList(document.querySelector('#game-list ul'), null));
  assert.deepEqual(await visibleIds(page), ['10', '11', 'uplay-11']);
  await page.close();
});
