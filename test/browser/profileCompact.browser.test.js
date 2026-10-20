'use strict';

/*
  Issue #123: used as a launcher with a one-row collection, the profile band took about a third of a
  600px window. The compact profile folds it into one row; this lays out the real header markup from
  app.html with the shipped app.css and measures it.
*/

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test, before, after } = require('node:test');
const { launchBrowser, closeBrowser, skipReason } = require('../helpers/chromium');

const appDir = path.join(__dirname, '..', '..', 'app');
const css = fs.readFileSync(path.join(appDir, 'resources', 'css', 'app.css'), 'utf8').replace(/<\/style/gi, '<\\/style');
const html = fs.readFileSync(path.join(appDir, 'view', 'app.html'), 'utf8');
const header = html.slice(html.indexOf('<div id="home-header">'), html.indexOf('<div id="game-list">'));

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>
  <main id="main"><section id="home">${header}</section></main>
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

async function measure(width, compact) {
  const page = await shared.browser.newPage();
  await page.setViewport({ width, height: 600 });
  await page.setContent(PAGE, { waitUntil: 'load' });
  const result = await page.evaluate((isCompact) => {
    document.querySelector('#home').classList.toggle('profile-compact', isCompact);
    document.querySelector('#user-info .name').textContent = 'Shirow';
    // The French labels, among the longer ones, as the locale loader fills them.
    const pills = [['449', 'Succès'], ['67', 'Jeux'], ['21', 'Moyenne des succès']];
    document.querySelectorAll('#user-info .stats li').forEach((li, index) => {
      li.querySelector('.data').textContent = pills[index][0];
      li.querySelector('.data + span').textContent = pills[index][1];
    });
    const rect = (selector) => document.querySelector(selector).getBoundingClientRect();
    const middle = (selector) => Math.round(rect(selector).top + rect(selector).height / 2);
    const name = document.querySelector('#user-info .name');
    return {
      header: rect('#home-header').height,
      tops: ['#search-bar', '#user-info', '#sort-box'].map((selector) => rect(selector).top),
      nameClipped: name.scrollWidth > name.clientWidth + 1,
      statsButton: rect('#profile-stats-open').width,
      toggle: rect('#profile-compact-toggle').width,
      rowMiddles: ['#user-info .stats li', '#profile-compact-toggle', '#profile-stats-open'].map(middle),
      buttonBeforeToggle: rect('#profile-stats-open').right <= rect('#profile-compact-toggle').left,
    };
  }, compact);
  await page.close();
  return result;
}

test('the compact profile is one slim row on a wide window', async (t) => {
  if (!shared || !shared.browser) return t.skip(skipReason(shared ? shared.failures : []));
  const full = await measure(1440, false);
  const compact = await measure(1440, true);
  assert.ok(full.header > 120, `the full band is the tall one (${full.header})`);
  assert.ok(compact.header <= 60, `the compact band is one slim row (${compact.header})`);
  assert.ok(Math.max(...compact.tops) - Math.min(...compact.tops) < 24, `controls and profile share the row (${compact.tops.join(', ')})`);
  assert.equal(compact.nameClipped, false, 'the user name is not cut');
  assert.equal(compact.statsButton, 28, 'the stats button keeps its size');
  assert.equal(compact.toggle, 28, 'so does the fold control');
});

test('a narrow window keeps the two rows but halves the band', async (t) => {
  if (!shared || !shared.browser) return t.skip(skipReason(shared ? shared.failures : []));
  const full = await measure(904, false);
  const compact = await measure(904, true);
  assert.ok(compact.header <= full.header * 0.6, `compact ${compact.header} against full ${full.header}`);
  assert.equal(compact.nameClipped, false, 'the user name is not cut');
});

test('the fold control stays on the stats row, right of the stats button, while the band has room', async (t) => {
  if (!shared || !shared.browser) return t.skip(skipReason(shared ? shared.failures : []));
  for (const width of [800, 1440]) {
    const full = await measure(width, false);
    const spread = Math.max(...full.rowMiddles) - Math.min(...full.rowMiddles);
    assert.ok(spread <= 2, `${width}px: pills, fold control and stats button share a row (${full.rowMiddles.join(', ')})`);
    assert.equal(full.buttonBeforeToggle, true, `${width}px: the stats button comes first`);
  }
});
