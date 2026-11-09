'use strict';

/*
  The library's hover depth (app/ui/libraryDepth.js): the tile under the mouse leans, pressed where
  the pointer is, and the hovered game's cover fills the window behind the library. Both live in the
  stylesheet as much as in the script, so they run in Chromium against the shipped app.css with a
  real mouse.
*/

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test, before, after } = require('node:test');
const { launchBrowser, closeBrowser, skipReason } = require('../helpers/chromium');

const appDir = path.join(__dirname, '..', '..', 'app');
const css = fs.readFileSync(path.join(appDir, 'resources', 'css', 'app.css'), 'utf8').replace(/<\/style/gi, '<\\/style');
const script = fs.readFileSync(path.join(appDir, 'ui', 'libraryDepth.js'), 'utf8').replace(/<\/script/gi, '<\\/script');

const cover = (color) =>
  `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="46" height="21"><rect width="46" height="21" fill="${color}"/></svg>`)}`;
const tile = (name, image) => `<li><div class="game-box">
  <div class="header${image ? ' glow' : ' artwork-missing'}"${image ? ` style="background-image: url('${image}')"` : ''}><button type="button" class="play-button"></button></div>
  <div class="info"><div class="info-head"><div class="title">${name}</div></div><div class="progressBar"><span class="meter"></span></div></div>
</div></li>`;

const harness = `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>
  <main id="main"><section id="home">
    <div id="library-ambient" aria-hidden="true"><canvas></canvas><canvas></canvas></div>
    <div id="game-list" class="view-default"><ul>
      ${tile('Red game', cover('#c0392b'))}${tile('Blue game', cover('#2e64c8'))}${tile('No cover', null)}
    </ul></div>
  </section></main>
  <script>${script}</script>
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

async function open(t, { reducedMotion = false } = {}) {
  if (!shared || !shared.browser) {
    t.skip(skipReason(shared ? shared.failures : []));
    return null;
  }
  const page = await shared.browser.newPage();
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: reducedMotion ? 'reduce' : 'no-preference' }]);
  await page.setViewport({ width: 1200, height: 700 });
  await page.setContent(harness, { waitUntil: 'load' });
  // Geometry is read at rest: the transition's timing is not what these tests are about.
  await page.addStyleTag({ content: '#game-list .game-box { transition-duration: 0s !important; }' });
  return page;
}

async function boxOf(page, index) {
  return page.evaluate((i) => {
    const rect = document.querySelectorAll('#game-list .game-box')[i].getBoundingClientRect();
    return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
  }, index);
}

const settle = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

// How far each corner of the tile sits from the viewer after its transform: w > 1 is farther away.
function depthOf(page, index) {
  return page.evaluate((i) => {
    const node = document.querySelectorAll('#game-list .game-box')[i];
    const matrix = new DOMMatrixReadOnly(getComputedStyle(node).transform);
    const { offsetWidth: w, offsetHeight: h } = node;
    const at = (x, y) => matrix.transformPoint(new DOMPoint(x, y, 0, 1)).w;
    return {
      tilting: node.classList.contains('is-tilting'),
      topRight: at(w / 2, -h / 2),
      bottomLeft: at(-w / 2, h / 2),
    };
  }, index);
}

test('the tile leans away under the pointer and comes back flat when it leaves', async (t) => {
  const page = await open(t);
  if (!page) return;
  try {
    const box = await boxOf(page, 0);
    await page.mouse.move(box.left + box.width / 2, box.top + box.height / 2);
    await page.mouse.move(box.left + box.width * 0.95, box.top + box.height * 0.05, { steps: 4 });
    await settle(page);
    const leaning = await depthOf(page, 0);
    assert.equal(leaning.tilting, true);
    assert.ok(leaning.topRight > 1, `the corner under the pointer must recede (w=${leaning.topRight})`);
    assert.ok(leaning.bottomLeft < 1, `the opposite corner must come forward (w=${leaning.bottomLeft})`);

    // A press straightens it, so the tile's own press feedback shows.
    await page.mouse.down();
    await settle(page);
    assert.equal((await depthOf(page, 0)).tilting, false, 'a pressed tile does not lean');
    await page.mouse.up();

    await page.mouse.move(5, 690);
    await settle(page);
    const rest = await depthOf(page, 0);
    assert.equal(rest.tilting, false);
    assert.equal(rest.topRight, 1);
  } finally {
    await page.close();
  }
});

test('hovering repaints no tile: the deeper shadow and the accent edge are layers that fade in', async (t) => {
  const page = await open(t);
  if (!page) return;
  try {
    const read = () =>
      page.evaluate(() => {
        const tile = document.querySelector('#game-list .game-box');
        const style = getComputedStyle(tile);
        return {
          transitions: style.transitionProperty,
          shadow: style.boxShadow,
          border: style.borderTopColor,
          lift: Number(getComputedStyle(tile.parentElement, '::before').opacity),
          edge: Number(getComputedStyle(tile, '::before').opacity),
        };
      });
    const rest = await read();
    assert.doesNotMatch(rest.transitions, /box-shadow|border-color|all/);
    assert.equal(rest.lift, 0);
    assert.equal(rest.edge, 0);

    const box = await boxOf(page, 0);
    await page.mouse.move(box.left + box.width / 2, box.top + box.height / 2);
    await new Promise((r) => setTimeout(r, 400));
    const hovered = await read();
    assert.equal(hovered.lift, 1, 'the shadow layer shows');
    assert.equal(hovered.edge, 1, 'the edge layer shows');
    assert.equal(hovered.shadow, rest.shadow, 'the tile keeps its own shadow');
    assert.equal(hovered.border, rest.border, 'and its own border');
  } finally {
    await page.close();
  }
});

test('a portrait tile keeps its hover growth while it leans', async (t) => {
  const page = await open(t);
  if (!page) return;
  try {
    await page.evaluate(() => (document.querySelector('#game-list').className = 'view-portrait'));
    const box = await boxOf(page, 0);
    await page.mouse.move(box.left + box.width / 2, box.top + box.height / 2);
    await page.mouse.move(box.left + box.width * 0.6, box.top + box.height * 0.4, { steps: 3 });
    await settle(page);
    const grown = await page.evaluate(() => {
      const node = document.querySelector('#game-list .game-box');
      return { tilting: node.classList.contains('is-tilting'), ratio: node.getBoundingClientRect().width / node.offsetWidth };
    });
    assert.equal(grown.tilting, true);
    assert.ok(grown.ratio > 1.03, `the portrait tile must stay grown (x${grown.ratio})`);
  } finally {
    await page.close();
  }
});

test('rows, the setting and reduced motion keep the tile flat', async (t) => {
  for (const [label, options, listClass] of [
    ['List view', {}, 'view-list'],
    ['Details view', {}, 'view-details'],
    ['setting off', {}, 'view-default no-tile-tilt'],
    ['reduced motion', { reducedMotion: true }, 'view-default'],
  ]) {
    const page = await open(t, options);
    if (!page) return;
    try {
      await page.evaluate((name) => (document.querySelector('#game-list').className = name), listClass);
      const box = await boxOf(page, 0);
      await page.mouse.move(box.left + box.width / 2, box.top + box.height / 2);
      await page.mouse.move(box.left + box.width * 0.95, box.top + box.height * 0.05, { steps: 4 });
      await settle(page);
      const state = await depthOf(page, 0);
      assert.equal(state.tilting, false, `${label}: no lean`);
      assert.equal(state.topRight, 1, `${label}: no depth`);
    } finally {
      await page.close();
    }
  }
});

function ambientOf(page) {
  return page.evaluate(() => ({
    on: document.querySelector('#home').classList.contains('has-ambient'),
    shown: [...document.querySelectorAll('#library-ambient canvas')].map((c) => c.classList.contains('is-shown')),
    // The colour of the shown layer's centre, as drawn from the cover.
    color: (() => {
      const canvas = document.querySelector('#library-ambient canvas.is-shown');
      if (!canvas) return null;
      const [r, g, b] = canvas.getContext('2d').getImageData(canvas.width >> 1, canvas.height >> 1, 1, 1).data;
      return { r, g, b };
    })(),
  }));
}

const waitFor = (page, predicate, ms = 2000) => page.waitForFunction(predicate, { timeout: ms, polling: 20 });

// The alpha of the library panel's fill, whatever colour syntax the engine reports it in.
const panelAlpha = (page) =>
  page.evaluate(() => {
    const value = getComputedStyle(document.querySelector('#game-list')).backgroundColor;
    const slash = /\/\s*([\d.]+)\s*\)$/.exec(value);
    const rgba = /^rgba\([^)]*,\s*([\d.]+)\)$/.exec(value);
    return Number(slash ? slash[1] : rgba ? rgba[1] : 1);
  });

test('the hovered cover fills the background, crossfades to the next one and leaves with the pointer', async (t) => {
  const page = await open(t);
  if (!page) return;
  try {
    const red = await boxOf(page, 0);
    await page.mouse.move(red.left + red.width / 2, red.top + red.height / 2);
    await waitFor(page, () => document.querySelector('#home').classList.contains('has-ambient'));
    const first = await ambientOf(page);
    assert.ok(first.color.r > 150 && first.color.b < 90, `the red cover must be drawn (${JSON.stringify(first.color)})`);

    const blue = await boxOf(page, 1);
    await page.mouse.move(blue.left + blue.width / 2, blue.top + blue.height / 2, { steps: 3 });
    await waitFor(page, () => {
      const canvas = document.querySelector('#library-ambient canvas.is-shown');
      return canvas && canvas.getContext('2d').getImageData(canvas.width >> 1, canvas.height >> 1, 1, 1).data[2] > 150;
    });
    const second = await ambientOf(page);
    assert.deepEqual(
      second.shown.filter(Boolean).length,
      1,
      'one layer at a time: the other one fades out under it'
    );
    assert.notDeepEqual(second.shown, first.shown, 'the new cover goes on the other layer');

    // The panel lets the cover through while it shows, and is its usual self again after.
    await new Promise((r) => setTimeout(r, 450));
    const thinned = await panelAlpha(page);

    await page.mouse.move(5, 690);
    await waitFor(page, () => !document.querySelector('#home').classList.contains('has-ambient'));
    await new Promise((r) => setTimeout(r, 450));
    const usual = await panelAlpha(page);
    assert.ok(thinned < usual - 0.1, `the panel must thin while the cover shows (${thinned} against ${usual})`);
  } finally {
    await page.close();
  }
});

test('coming back to a tile through the gap beside it still brings its cover', async (t) => {
  const page = await open(t);
  if (!page) return;
  try {
    const red = await boxOf(page, 0);
    const gap = await page.evaluate(() => {
      const rect = document.querySelector('#game-list').getBoundingClientRect();
      return { x: rect.left + 3, y: rect.top + 3 };
    });
    // On the tile for less than the intent delay, out into the panel, back before the linger ends.
    await page.mouse.move(red.left + red.width / 2, red.top + red.height / 2);
    await page.mouse.move(gap.x, gap.y);
    await page.mouse.move(red.left + red.width / 2, red.top + red.height / 2);
    await waitFor(page, () => document.querySelector('#home').classList.contains('has-ambient'));
  } finally {
    await page.close();
  }
});

test('a pointer passing over a tile, a tile with no cover and the setting off leave the background alone', async (t) => {
  const page = await open(t);
  if (!page) return;
  try {
    // Crossing a tile faster than the intent delay draws nothing.
    const red = await boxOf(page, 0);
    await page.mouse.move(red.left + red.width / 2, red.top + red.height / 2);
    await page.mouse.move(5, 690);
    await new Promise((r) => setTimeout(r, 450));
    assert.equal((await ambientOf(page)).on, false, 'a passing pointer');

    const bare = await boxOf(page, 2);
    await page.mouse.move(bare.left + bare.width / 2, bare.top + bare.height / 2);
    await new Promise((r) => setTimeout(r, 300));
    assert.equal((await ambientOf(page)).on, false, 'no cover, nothing to show');

    await page.evaluate(() => document.querySelector('#game-list').classList.add('no-library-ambient'));
    await page.mouse.move(red.left + red.width / 2, red.top + red.height / 2, { steps: 3 });
    await new Promise((r) => setTimeout(r, 300));
    assert.equal((await ambientOf(page)).on, false, 'setting off');
  } finally {
    await page.close();
  }
});
