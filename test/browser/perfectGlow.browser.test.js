'use strict';

/*
  A game at 100% wears a platinum halo on its library tile, in every view, with a platinum bar and the
  trophy by its figure, and a light sweeps across it once as the pointer arrives (not under reduced
  motion). Run in Chromium against the shipped app.css.
*/

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test, before, after } = require('node:test');
const { launchBrowser, closeBrowser, skipReason } = require('../helpers/chromium');

const appDir = path.join(__dirname, '..', '..', 'app');
const css = fs.readFileSync(path.join(appDir, 'resources', 'css', 'app.css'), 'utf8').replace(/<\/style/gi, '<\\/style');

const tile = (name, perfect) => `<li><div class="game-box" data-progress="${perfect ? 100 : 40}"${perfect ? ' data-perfect' : ''}>
  <div class="header artwork-missing"></div>
  <div class="info"><div class="info-head"><div class="title">${name}</div></div><div class="progressBar"><span class="meter"></span><span class="progress-value"><span>${perfect ? 100 : 40} %</span></span></div></div>
</div></li>`;

const harness = (view) => `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>
  <main id="main"><section id="home">
    <div id="game-list" class="${view}"><ul>${tile('Perfect', true)}${tile('Started', false)}</ul></div>
  </section></main>
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

async function open(t, view, { reducedMotion = false } = {}) {
  if (!shared || !shared.browser) {
    t.skip(skipReason(shared ? shared.failures : []));
    return null;
  }
  const page = await shared.browser.newPage();
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: reducedMotion ? 'reduce' : 'no-preference' }]);
  await page.setViewport({ width: 1000, height: 600 });
  await page.setContent(harness(view), { waitUntil: 'load' });
  return page;
}

const styleOf = (page, index, pseudo = null) =>
  page.evaluate(
    (i, p) => {
      const style = getComputedStyle(document.querySelectorAll('#game-list .game-box')[i], p);
      return { boxShadow: style.boxShadow, borderColor: style.borderTopColor, animation: style.animationName, platinum: getComputedStyle(document.documentElement).getPropertyValue('--trophy-platinum').trim() };
    },
    index,
    pseudo
  );

const barOf = (page, index) =>
  page.evaluate((i) => {
    const bar = document.querySelectorAll('#game-list .game-box .progressBar')[i];
    return {
      meter: getComputedStyle(bar.querySelector('.meter')).backgroundImage,
      trophy: getComputedStyle(bar.querySelector('.progress-value'), '::before').content,
    };
  }, index);

for (const view of ['view-default', 'view-portrait', 'view-list', 'view-details']) {
  test(`${view}: only the perfect tile wears the halo`, async (t) => {
    const page = await open(t, view);
    if (!page) return;
    try {
      const [perfect, started] = [await styleOf(page, 0), await styleOf(page, 1)];
      assert.notEqual(perfect.boxShadow, started.boxShadow);
      assert.match(perfect.boxShadow, /0px 0px 22px/, 'a glow around the tile');
      assert.doesNotMatch(started.boxShadow, /0px 0px 22px/);
      assert.notEqual(perfect.borderColor, started.borderColor, 'the edge takes the platinum colour');
      const [perfectBar, startedBar] = [await barOf(page, 0), await barOf(page, 1)];
      assert.notEqual(perfectBar.meter, startedBar.meter, 'the bar turns platinum');
      assert.equal(perfectBar.trophy, '""', 'the trophy stands by the figure');
      assert.equal(startedBar.trophy, 'none');
    } finally {
      await page.close();
    }
  });
}

test('the light sweeps across a perfect tile on hover, and not under reduced motion', async (t) => {
  for (const reducedMotion of [false, true]) {
    const page = await open(t, 'view-default', { reducedMotion });
    if (!page) return;
    try {
      assert.equal((await styleOf(page, 0, '::after')).animation, 'none', 'still at rest');
      await page.hover('#game-list .game-box[data-perfect]');
      const swept = (await styleOf(page, 0, '::after')).animation;
      assert.equal(swept, reducedMotion ? 'none' : 'perfect-tile-sheen');
      await page.hover('#game-list .game-box:not([data-perfect])');
      assert.equal((await styleOf(page, 1, '::after')).animation, 'none', 'a tile not at 100% has no sweep');
    } finally {
      await page.close();
    }
  }
});
