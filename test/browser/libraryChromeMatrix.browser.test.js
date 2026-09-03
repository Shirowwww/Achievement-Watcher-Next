'use strict';

/*
  The combination pass for issue #56. libraryChrome.browser.test.js checks one setting at a time;
  this one sweeps every library view against every tile size, every density and every combination of
  the Show/Hide toggles, and asserts the invariants a tile layout must keep whatever the mix:
  nothing collapses to nothing, no card overflows the column it sits in, two cards on a row never
  overlap, and a hidden element is hidden while its neighbours are not.

  A setting alone is easy to get right. What breaks a layout is a pair - the largest tile in the
  tightest grid, or every piece of chrome off in the view whose whole point is the text column - and
  those cases only exist in the product of the options.
*/

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { launchBrowser, closeBrowser, skipReason } = require('../helpers/chromium');

const appDir = path.join(__dirname, '..', '..', 'app');
const libraryLayout = require(path.join(appDir, 'util', 'libraryLayout.js'));
const libraryChrome = require(path.join(appDir, 'util', 'libraryChrome.js'));
const css = fs.readFileSync(path.join(appDir, 'resources', 'css', 'app.css'), 'utf8').replace(/<\/style/gi, '<\\/style');

// Six cards, so every view has at least two on a row at every scale.
const card = (name, percent) => `
  <li><div class="game-box" data-installed="1">
    <div class="header"><button type="button" class="play-button"></button></div>
    <button type="button" class="achievement-button"></button>
    <button type="button" class="config-button"></button>
    <div class="info">
      <div class="info-head">
        <div class="title">${name}</div>
        <div class="game-meta">
          <span class="health-badge ready"></span>
          <img class="source-icon" alt="Steam">
        </div>
      </div>
      <div class="progressBar" data-percent="${percent}"><span class="meter" style="width:${percent}%"></span><span class="progress-value">${percent} %</span></div>
      <div class="library-details">
        <span class="library-achievement-summary"><i></i><span>1 / 2</span></span>
        <span class="library-recent-unlock"><i></i><span class="library-recent-name">Something</span></span>
        <span class="library-last-played"><i></i><span>never</span></span>
        <span class="library-playtime"><i></i><span>2 h</span></span>
      </div>
    </div>
  </div></li>`;

/*
  content-visibility: auto lets a card report its remembered size for a few frames after a relayout,
  which would make a 400-combination sweep either slow or flaky. The property is a paint optimization
  and has no bearing on the grid geometry under test, so the harness opts out of it and every
  measurement is exact on the first read.
*/
const harness = `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style>
<style>
  body { margin: 0; }
  #game-list .game-box { content-visibility: visible; }
</style></head><body>
  <div id="game-list"><ul>
    ${card('Sovereign Tower', 55)}${card('Assassin&#39;s Creed Black Flag Resynced', 14)}${card('Undertale', 0)}
    ${card('The Jackbox Party Pack 7', 0)}${card('Garry&#39;s Mod', 28)}${card('Big Walk', 17)}
  </ul></div>
</body></html>`;

// Every subset worth sweeping: nothing hidden, everything hidden, and each toggle alone.
function toggleSets() {
  const keys = libraryChrome.TOGGLES.map((toggle) => toggle.key);
  return [
    { label: 'all shown', off: [] },
    { label: 'all hidden', off: keys },
    ...keys.map((key) => ({ label: `only ${key} hidden`, off: [key] })),
  ];
}

const SCALES = [libraryChrome.TILE_SCALE.min, 1, libraryChrome.TILE_SCALE.max];
const DENSITIES = [libraryChrome.DENSITY.min, 1, libraryChrome.DENSITY.max];

// One page evaluation per combination; every read flushes layout, so no frame waiting is needed.
function measure(page, { mode, scale, density, off }) {
  return page.evaluate(
    ([layout, tileScale, gapScale, hidden, allClasses, toggles]) => {
      const list = document.querySelector('#game-list');
      list.className = `view-${layout}`;
      list.style.setProperty('--library-scale', String(tileScale));
      list.style.setProperty('--library-gap-scale', String(gapScale));
      for (const name of allClasses) list.classList.remove(name);
      for (const name of hidden) list.classList.add(name);

      const boxes = [...document.querySelectorAll('#game-list .game-box')].map((node) => {
        const rect = node.getBoundingClientRect();
        return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height };
      });
      const header = document.querySelector('.header').getBoundingClientRect();
      const shown = (selector) => {
        const node = document.querySelector(selector);
        return node ? getComputedStyle(node).display !== 'none' && node.getBoundingClientRect().height > 0 : false;
      };
      const column = parseFloat(getComputedStyle(document.querySelector('#game-list ul')).gridTemplateColumns.split(' ')[0]);
      return {
        boxes,
        header: { width: header.width, height: header.height },
        listWidth: document.querySelector('#game-list').getBoundingClientRect().width,
        column: Number.isFinite(column) ? column : null,
        visible: Object.fromEntries(toggles.map(([key, selector]) => [key, shown(selector)])),
      };
    },
    [
      mode,
      scale,
      density,
      off.map((key) => libraryChrome.TOGGLES.find((toggle) => toggle.key === key).hiddenClass),
      libraryChrome.TOGGLES.map((toggle) => toggle.hiddenClass),
      [
        ['libraryShowTitle', '.title'],
        ['libraryShowProgress', '.progressBar'],
        ['libraryShowSource', '.source-icon'],
        ['libraryShowHealth', '.health-badge'],
        ['libraryShowAchievementButton', '.achievement-button'],
        ['libraryShowConfigButton', '.config-button'],
        ['showPlayButton', '.play-button'],
      ],
    ]
  );
}

test('every view survives every combination of tile size, density and hidden chrome', async (t) => {
  const { browser, userDataDir, failures } = await launchBrowser();
  if (!browser) {
    t.skip(skipReason(failures));
    return;
  }

  // The list and details views keep the title whatever the setting: a nameless row is not a row.
  const KEEPS_TITLE = new Set(['list', 'details']);
  let combinations = 0;

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1400, height: 900 });
    await page.setContent(harness, { waitUntil: 'load' });

    for (const mode of libraryLayout.MODES) {
      for (const scale of SCALES) {
        for (const density of DENSITIES) {
          for (const set of toggleSets()) {
            const where = `${mode} @ ${scale}x, gap ${density}x, ${set.label}`;
            const state = await measure(page, { mode, scale, density, off: set.off });
            combinations += 1;

            // Nothing may collapse: a card with no artwork or no width is not a tile.
            assert.ok(state.header.width > 0 && state.header.height > 0, `${where}: the artwork collapsed`);
            for (const box of state.boxes) {
              assert.ok(box.width > 0 && box.height > 0, `${where}: a card collapsed`);
              assert.ok(box.height >= state.header.height - 1, `${where}: a card is shorter than its own artwork`);
              assert.ok(box.width <= state.listWidth + 1, `${where}: a ${box.width.toFixed(1)}px card in a ${state.listWidth.toFixed(1)}px list`);
            }

            // A card wider than its column would spill into its neighbour at any density.
            if (state.column !== null) {
              assert.ok(
                state.boxes[0].width <= state.column + 1,
                `${where}: a ${state.boxes[0].width.toFixed(1)}px card in a ${state.column.toFixed(1)}px column`
              );
            }

            // Two cards sharing a row must never overlap, however tight the grid.
            for (let i = 1; i < state.boxes.length; i += 1) {
              const previous = state.boxes[i - 1];
              const current = state.boxes[i];
              if (Math.abs(current.top - previous.top) > 1) continue;
              assert.ok(current.left >= previous.right - 1, `${where}: two cards on a row overlap by ${(previous.right - current.left).toFixed(1)}px`);
            }

            // And the setting itself must hold, in this view, at this size.
            for (const toggle of libraryChrome.TOGGLES) {
              const wantHidden = set.off.includes(toggle.key) && !(toggle.key === 'libraryShowTitle' && KEEPS_TITLE.has(mode));
              assert.equal(state.visible[toggle.key], !wantHidden, `${where}: ${toggle.key} visibility is wrong`);
            }
          }
        }
      }
    }

    assert.equal(combinations, libraryLayout.MODES.length * SCALES.length * DENSITIES.length * toggleSets().length);
  } finally {
    await closeBrowser(browser, userDataDir);
  }
});
