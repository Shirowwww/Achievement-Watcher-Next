'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { sharedBrowser } = require('../helpers/chromium');

const inContext = sharedBrowser();

const appDir = path.join(__dirname, '..', '..', 'app');
function buildHarness() {
  const sortScript = fs.readFileSync(path.join(appDir, 'ui', 'sort.js'), 'utf8').replace(/<\/script/gi, '<\\/script');
  const jquery = fs.readFileSync(path.join(appDir, 'ui', 'lib', 'jquery-3.7.1.min.js'), 'utf8').replace(/<\/script/gi, '<\\/script');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    #games.installed-only li:has(.game-box[data-installed='0']) { display: none; }
  </style></head><body>
    <div id="sort-box"><button class="sort alpha"></button><button class="sort percentage"></button><button class="sort time"></button><button class="sort played"></button><button class="installed-filter"></button></div>
    <div id="game-list"><ul id="games"></ul><div class="isEmpty"></div></div>
    <div id="unlock" class="achievement-list"><div class="header"><span class="sort-ach"><div class="percentage sort" role="button"></div><div class="time sort" role="button"></div></span></div><ul><li><div class="achievement" data-index="0"><div class="stats"><span class="time" data-time="1"></span></div></div></li></ul></div>
    <script>${jquery}</script>
    <script>
      window.profileStatsRefreshes = [];
      window.refreshProfileStats = (options) => window.profileStatsRefreshes.push(options);
      ${sortScript}
      window.sortFixture = [
        { id: 'a', appid: 10, installed: 1, title: 'Beta', lastplayed: 10, time: 5, percent: 20 },
        { id: 'b', appid: 2, installed: 0, title: 'Alpha', lastplayed: 10, time: 20, percent: 80 },
        { id: 'c', appid: 3, installed: 1, title: 'Gamma', lastplayed: 30, time: 20, percent: 80 },
        { id: 'd', appid: 4, installed: 0, title: 'Delta', lastplayed: 5, time: 40, percent: 10 },
      ];
      window.runSortFixture = (options) => {
        $('#games').html(window.sortFixture.map((game) =>
          '<li data-id="' + game.id + '"><div class="game-box" data-appid="' + game.appid + '" data-installed="' + game.installed + '" data-lastplayed="' + game.lastplayed + '" data-time="' + game.time + '"></div><div class="info"><span class="title">' + game.title + '</span></div><span class="progressBar" data-percent="' + game.percent + '"></span></li>'
        ).join(''));
        window.sort($('#games'), options);
        return $('#games > li').map(function () { return this.dataset.id; }).get();
      };
    </script>
  </body></html>`;
}

test('game sort snapshots DOM values while preserving every ordering rule', { concurrency: 1, timeout: 180000 }, async (t) => {
  await inContext(t, async (context) => {
    const harnessDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-sort-harness-'));
    const harness = path.join(harnessDir, 'sort.html');
    fs.writeFileSync(harness, buildHarness());

    try {
      const page = await context.newPage();
      await page.goto(pathToFileURL(harness).href);
      const result = await page.evaluate(() => ({
        playedDescending: window.runSortFixture({ played: true, direction: 'desc' }),
        playedAscending: window.runSortFixture({ played: true, direction: 'asc' }),
        timeDescending: window.runSortFixture({ time: true, direction: 'desc' }),
        percentDescending: window.runSortFixture({ percent: true, direction: 'desc' }),
        percentAscending: window.runSortFixture({ percent: true, direction: 'asc' }),
        alphaAscending: window.runSortFixture({ alpha: true, direction: 'asc' }),
        alphaDescending: window.runSortFixture({ alpha: true, direction: 'desc' }),
        noCriterion: window.runSortFixture({ direction: 'desc' }),
      }));

      assert.deepEqual(result.playedDescending, ['c', 'b', 'a', 'd']);
      assert.deepEqual(result.playedAscending, ['d', 'b', 'a', 'c']);
      assert.deepEqual(result.timeDescending, ['d', 'b', 'c', 'a']);
      assert.deepEqual(result.percentDescending, ['b', 'c', 'a', 'd']);
      assert.deepEqual(result.percentAscending, ['d', 'a', 'b', 'c']);
      assert.deepEqual(result.alphaAscending, ['b', 'a', 'd', 'c']);
      assert.deepEqual(result.alphaDescending, ['c', 'd', 'a', 'b']);
      assert.deepEqual(result.noCriterion, ['b', 'c', 'd', 'a'], 'AppID ties remain ascending regardless of direction');
    } finally {
      fs.rmSync(harnessDir, { recursive: true, force: true });
    }
  });
});

test('installed-only toggle refreshes profile statistics and visible games together', { concurrency: 1, timeout: 180000 }, async (t) => {
  await inContext(t, async (context) => {
    const harnessDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-installed-filter-harness-'));
    const harness = path.join(harnessDir, 'installed-filter.html');
    fs.writeFileSync(harness, buildHarness());

    try {
      const page = await context.newPage();
      await page.goto(pathToFileURL(harness).href);
      const result = await page.evaluate(async () => {
        window.runSortFixture({ alpha: true, direction: 'asc' });
        window.profileStatsRefreshes = [];
        document.querySelector('.installed-filter').click();
        await new Promise((resolve) => setTimeout(resolve, 500));
        return {
          enabled: localStorage.showInstalledOnly,
          active: document.querySelector('.installed-filter').classList.contains('active'),
          visible: $('#games > li:visible').map(function () { return this.dataset.id; }).get(),
          refreshes: window.profileStatsRefreshes,
        };
      });

      assert.equal(result.enabled, 'true');
      assert.equal(result.active, true);
      assert.deepEqual(result.visible, ['a', 'c']);
      assert.deepEqual(result.refreshes, [{ animate: true }]);
    } finally {
      fs.rmSync(harnessDir, { recursive: true, force: true });
    }
  });
});

// The achievement sort buttons are icon-only: an idle one used to have no name at all, so a screen
// reader announced "button" and nothing said what clicking it would do.
test('every achievement sort button is named, active or not', { concurrency: 1, timeout: 180000 }, async (t) => {
  await inContext(t, async (context) => {
    const harnessDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-achievement-sort-harness-'));
    const harness = path.join(harnessDir, 'achievement-sort.html');
    fs.writeFileSync(harness, buildHarness());

    try {
      const page = await context.newPage();
      await page.goto(pathToFileURL(harness).href);
      const result = await page.evaluate(async () => {
        const names = () => $('#unlock .sort').map(function () { return this.getAttribute('aria-label') || ''; }).get();
        localStorage.clear();
        window.restoreAchievementSorts();
        const idle = names();
        document.querySelector('#unlock .sort.percentage').click();
        await new Promise((resolve) => setTimeout(resolve, 100));
        return { idle, afterClick: names() };
      });

      assert.deepEqual(result.idle, ['Rareté : plus rare → plus commun', 'Succès : récent → ancien']);
      assert.ok(result.afterClick.every(Boolean), `every button keeps a name: ${JSON.stringify(result.afterClick)}`);
      assert.equal(result.afterClick[1], 'Succès : récent → ancien');
    } finally {
      fs.rmSync(harnessDir, { recursive: true, force: true });
    }
  });
});
