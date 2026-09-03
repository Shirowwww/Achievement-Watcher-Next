'use strict';

/*
  Issue #56: bigger artwork, less space between tiles, and an independent Show/Hide for the name, the
  progress bar, the platform badge, the health dot and the trophy button.

  The two multipliers reach the layout only through CSS custom properties, so the stylesheet is the
  implementation: a view that kept a hardcoded pixel would silently ignore both settings, which is
  precisely how the portrait views behaved before this change. Nothing but a real engine can tell
  the difference, so these run in Chromium against the shipped app.css.
*/

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test, before, after } = require('node:test');
const { launchBrowser, closeBrowser, skipReason } = require('../helpers/chromium');

const appDir = path.join(__dirname, '..', '..', 'app');
const libraryLayout = require(path.join(appDir, 'util', 'libraryLayout.js'));
const libraryChrome = require(path.join(appDir, 'util', 'libraryChrome.js'));
const css = fs.readFileSync(path.join(appDir, 'resources', 'css', 'app.css'), 'utf8').replace(/<\/style/gi, '<\\/style');

// The pieces of a tile the settings switch off, matching the markup app.js builds.
const harness = `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>
  <div id="game-list"><ul><li><div class="game-box">
    <div class="header"><button type="button" class="play-button"></button></div>
    <button type="button" class="achievement-button"></button>
    <button type="button" class="config-button"></button>
    <div class="info">
      <div class="info-head">
        <div class="title">Example game</div>
        <div class="game-meta">
          <span class="health-badge ready"></span>
          <img class="source-icon" alt="Steam">
        </div>
      </div>
      <div class="progressBar" data-percent="50"><span class="meter"></span></div>
      <div class="library-details"><span class="library-achievement-summary"></span></div>
    </div>
  </div></li>
  <li><div class="game-box">
    <div class="header"></div>
    <div class="info"><div class="info-head"><div class="title">Second game</div></div><div class="progressBar"></div></div>
  </div></li></ul></div>
</body></html>`;

/*
  One browser for the whole file, not one per test: launching Chromium costs more than everything
  these tests measure put together. Each test still gets a fresh page, so nothing carries over.
*/
let shared = null;

before(async () => {
  const { browser, userDataDir, failures } = await launchBrowser();
  shared = { browser, userDataDir, failures };
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
  await page.setViewport({ width: 1400, height: 900 });
  await page.setContent(harness, { waitUntil: 'load' });
  return { page };
}

// Applies a layout plus the settings, then reads the boxes once the card has stopped moving.
// content-visibility: auto means a freshly re-laid card reports its remembered size for a few
// frames, so a fixed wait would compare two different moments of the same settling.
function readAfterSettling(page, { mode, scale, gap, hidden }) {
  return page.evaluate(
    ([layout, tileScale, gapScale, hiddenClasses, allClasses]) =>
      new Promise((resolve, reject) => {
        const list = document.querySelector('#game-list');
        list.className = `view-${layout}`;
        list.style.setProperty('--library-scale', String(tileScale));
        list.style.setProperty('--library-gap-scale', String(gapScale));
        for (const name of allClasses) list.classList.remove(name);
        for (const name of hiddenClasses) list.classList.add(name);

        const rect = (selector) => {
          const node = document.querySelector(selector);
          if (!node) return null;
          const value = node.getBoundingClientRect();
          return { width: value.width, height: value.height, x: value.x, y: value.y };
        };
        const shown = (selector) => {
          const node = document.querySelector(selector);
          return node ? getComputedStyle(node).display !== 'none' : false;
        };
        const spacing = () => {
          const ul = getComputedStyle(document.querySelector('#game-list ul'));
          const li = getComputedStyle(document.querySelector('#game-list ul > li'));
          return {
            rowGap: parseFloat(ul.rowGap) || 0,
            columnGap: parseFloat(ul.columnGap) || 0,
            padTop: parseFloat(li.paddingTop) || 0,
            padLeft: parseFloat(li.paddingLeft) || 0,
          };
        };
        // The space a reader actually sees: edge of one card to edge of the next on the same row.
        const betweenCards = () => {
          const boxes = [...document.querySelectorAll('#game-list .game-box')].map((n) => n.getBoundingClientRect());
          if (boxes.length < 2) return null;
          const [first, second] = boxes;
          return Math.abs(second.top - first.top) < 1 ? second.left - first.right : null;
        };
        const read = () => ({
          header: rect('.header'),
          card: rect('.game-box'),
          betweenCards: betweenCards(),
          spacing: spacing(),
          items: [rect('#game-list ul > li'), rect('#game-list ul > li:nth-child(2)')],
          title: shown('.title'),
          progress: shown('.progressBar'),
          source: shown('.source-icon'),
          health: shown('.health-badge'),
          trophy: shown('.achievement-button'),
        });

        let previous = null;
        let identical = 0;
        let frames = 0;
        const tick = () => {
          const current = read();
          const signature = JSON.stringify([current.card, current.header, current.items]);
          identical = previous === signature ? identical + 1 : 0;
          previous = signature;
          if (identical >= 3) return resolve(current);
          if (++frames > 240) return reject(new Error(`${layout}: layout never settled`));
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
    [mode, scale, gap, hidden || [], libraryChrome.TOGGLES.map((toggle) => toggle.hiddenClass)]
  );
}

test('the tile-size setting reaches the artwork in every library view', async (t) => {
  const session = await open(t);
  if (!session) return;
  const { page } = session;

  try {
    for (const mode of libraryLayout.MODES) {
      const normal = await readAfterSettling(page, { mode, scale: 1, gap: 1 });
      const bigger = await readAfterSettling(page, { mode, scale: libraryChrome.TILE_SCALE.max, gap: 1 });
      const smaller = await readAfterSettling(page, { mode, scale: libraryChrome.TILE_SCALE.min, gap: 1 });

      assert.ok(normal.header.height > 0, `${mode}: the card must be rendered before it is measured`);
      assert.ok(bigger.header.height > normal.header.height, `${mode}: a larger scale must enlarge the artwork`);
      assert.ok(smaller.header.height < normal.header.height, `${mode}: a smaller scale must shrink the artwork`);
    }
  } finally {
    await page.close();
  }
});

test('the density setting closes the gap between tiles, all the way to none', async (t) => {
  const session = await open(t);
  if (!session) return;
  const { page } = session;

  try {
    /*
      Measured as the grid gap and the item padding rather than as the distance between two cards:
      the columns are `auto-fit ... 1fr`, so removing the gap also changes how many columns fit and
      how wide each stretched cell is - a distance between cards would move for both reasons at once.
      These two values ARE the space the report asks to close, horizontally and vertically.
    */
    for (const mode of ['default', 'portrait', 'compact', 'portrait-compact', 'list', 'details']) {
      const normal = await readAfterSettling(page, { mode, scale: 1, gap: 1 });
      const tight = await readAfterSettling(page, { mode, scale: 1, gap: 0 });
      const loose = await readAfterSettling(page, { mode, scale: 1, gap: libraryChrome.DENSITY.max });

      assert.ok(normal.items[0].width > 0, `${mode}: the tiles must be laid out before they are measured`);
      assert.ok(normal.spacing.rowGap > 0, `${mode}: there is a vertical gap to close`);
      assert.equal(tight.spacing.rowGap, 0, `${mode}: a density of 0 must leave no vertical gap`);
      assert.equal(tight.spacing.columnGap, 0, `${mode}: a density of 0 must leave no horizontal gap`);
      assert.equal(tight.spacing.padTop, 0, `${mode}: a density of 0 must leave no padding around a tile`);
      assert.equal(tight.spacing.padLeft, 0, `${mode}: a density of 0 must leave no padding around a tile`);
      assert.ok(loose.spacing.rowGap > normal.spacing.rowGap, `${mode}: a higher density must space the tiles out`);
    }
  } finally {
    await page.close();
  }
});

test('each Show/Hide setting hides its own element and leaves the others alone', async (t) => {
  const session = await open(t);
  if (!session) return;
  const { page } = session;

  const FIELD = {
    libraryShowTitle: 'title',
    libraryShowProgress: 'progress',
    libraryShowSource: 'source',
    libraryShowHealth: 'health',
    libraryShowAchievementButton: 'trophy',
  };

  try {
    const all = await readAfterSettling(page, { mode: 'default', scale: 1, gap: 1 });
    for (const field of Object.values(FIELD)) {
      assert.equal(all[field], true, `${field} must be visible when nothing is turned off`);
    }

    for (const toggle of libraryChrome.TOGGLES) {
      const state = await readAfterSettling(page, { mode: 'default', scale: 1, gap: 1, hidden: [toggle.hiddenClass] });
      for (const [key, field] of Object.entries(FIELD)) {
        assert.equal(state[field], key !== toggle.key, `${toggle.key}: ${field} visibility is wrong`);
      }
    }
  } finally {
    await page.close();
  }
});

test('a list row keeps its name, because a nameless row is not a row', async (t) => {
  const session = await open(t);
  if (!session) return;
  const { page } = session;

  try {
    const hidden = [libraryChrome.TOGGLES.find((toggle) => toggle.key === 'libraryShowTitle').hiddenClass];
    for (const mode of ['list', 'details']) {
      const state = await readAfterSettling(page, { mode, scale: 1, gap: 1, hidden });
      assert.equal(state.title, true, `${mode}: the title is the row`);
    }
    for (const mode of ['default', 'portrait', 'compact', 'portrait-compact']) {
      const state = await readAfterSettling(page, { mode, scale: 1, gap: 1, hidden });
      assert.equal(state.title, false, `${mode}: the grid views must honour the setting`);
    }
  } finally {
    await page.close();
  }
});

test('turning everything off leaves artwork, not an empty band under it', async (t) => {
  const session = await open(t);
  if (!session) return;
  const { page } = session;

  try {
    const everything = libraryChrome.TOGGLES.map((toggle) => toggle.hiddenClass);
    for (const mode of ['default', 'portrait', 'compact', 'portrait-compact']) {
      const full = await readAfterSettling(page, { mode, scale: 1, gap: 1 });
      const bare = await readAfterSettling(page, { mode, scale: 1, gap: 1, hidden: everything });

      assert.equal(bare.header.height, full.header.height, `${mode}: the artwork must keep its size`);
      assert.ok(bare.card.height < full.card.height, `${mode}: the card must lose the height the chrome used`);
      assert.ok(
        bare.card.height - bare.header.height <= 2,
        `${mode}: ${(bare.card.height - bare.header.height).toFixed(1)}px of empty band left under the artwork`
      );
    }
  } finally {
    await page.close();
  }
});

test('at zero density two tiles on a row actually touch', async (t) => {
  const session = await open(t);
  if (!session) return;
  const { page } = session;

  /*
    The regression this pins: the grid used to size its columns as `minmax(min, 1fr)`, so the width
    left over on a row was handed to the columns and reappeared as a gap between the cards. Density
    0% closed the grid gap and the item padding and still left ~130px of air between two tiles,
    which is the one thing issue #56 asked for. Measured card-to-card, not as a computed gap, since
    that is what the report is about.
  */
  try {
    for (const mode of ['default', 'portrait', 'compact', 'portrait-compact']) {
      const normal = await readAfterSettling(page, { mode, scale: 1, gap: 1 });
      const tight = await readAfterSettling(page, { mode, scale: 1, gap: 0 });

      assert.notEqual(normal.betweenCards, null, `${mode}: the two tiles must share a row to be compared`);
      assert.notEqual(tight.betweenCards, null, `${mode}: the two tiles must share a row to be compared`);
      assert.ok(
        tight.betweenCards <= 1,
        `${mode}: ${tight.betweenCards.toFixed(1)}px still between two tiles at density 0`
      );
      assert.ok(normal.betweenCards > tight.betweenCards, `${mode}: the default must leave more room than zero`);
    }
  } finally {
    await page.close();
  }
});

test('a column is one tile wide, so no view can drift from the card it holds', async (t) => {
  const session = await open(t);
  if (!session) return;
  const { page } = session;

  try {
    for (const mode of ['default', 'portrait', 'compact', 'portrait-compact']) {
      for (const scale of [libraryChrome.TILE_SCALE.min, 1, libraryChrome.TILE_SCALE.max]) {
        const state = await readAfterSettling(page, { mode, scale, gap: 0 });
        const column = await page.evaluate(() =>
          parseFloat(getComputedStyle(document.querySelector('#game-list ul')).gridTemplateColumns.split(' ')[0])
        );
        assert.ok(
          Math.abs(column - state.card.width) <= 1,
          `${mode} at ${scale}x: a ${column.toFixed(1)}px column around a ${state.card.width.toFixed(1)}px tile`
        );
      }
    }
  } finally {
    await page.close();
  }
});

test('a list row drops the progress column with the bar, instead of leaving a hole', async (t) => {
  const session = await open(t);
  if (!session) return;
  const { page } = session;

  /*
    A list row is a three-column grid: name, progress, activity. display:none takes the bar out of
    the flow but not its column, so the activity column slid one place left and the row was left with
    a gap where the bar had been - visible, and exactly the wasted space issue #56 is about.
  */
  // Both halves matter: the template AND where the activity block is placed. The block is pinned to
  // column 3, so a two-column template alone just grows an implicit third column and the hole stays.
  const layout = () =>
    page.evaluate(() => ({
      columns: getComputedStyle(document.querySelector('#game-list .game-box .info')).gridTemplateColumns.split(' ').length,
      activityColumn: getComputedStyle(document.querySelector('#game-list .library-details')).gridColumnStart,
    }));

  try {
    const hidden = [libraryChrome.TOGGLES.find((toggle) => toggle.key === 'libraryShowProgress').hiddenClass];
    await readAfterSettling(page, { mode: 'list', scale: 1, gap: 1 });
    assert.deepEqual(await layout(), { columns: 3, activityColumn: '3' }, 'a full row has name, progress and activity');

    await readAfterSettling(page, { mode: 'list', scale: 1, gap: 1, hidden });
    assert.deepEqual(await layout(), { columns: 2, activityColumn: '2' }, 'without the bar the row must really be two columns');
  } finally {
    await page.close();
  }
});
