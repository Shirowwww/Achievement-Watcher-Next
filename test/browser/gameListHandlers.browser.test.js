'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { launchBrowser, closeBrowser, skipReason } = require('../helpers/chromium');

const appDir = path.join(__dirname, '..', '..', 'app');

function buildHarness() {
  const gameScript = fs.readFileSync(path.join(appDir, 'ui', 'game.js'), 'utf8').replace(/<\/script/gi, '<\\/script');
  const jquery = fs.readFileSync(path.join(appDir, 'ui', 'lib', 'jquery-3.7.1.min.js'), 'utf8').replace(/<\/script/gi, '<\\/script');
  return `<!doctype html><html><head><meta charset="utf-8"></head><body>
    <input id="achievement-search-input" value="stale filter">
    <section id="achievement"><div class="achievement-list"><ul><li class="search-hidden">stale row</li></ul></div></section>
    <section id="game-list"><div class="game-box" data-appid="480"></div></section>
    <script>${jquery}</script>
    <script>${gameScript}</script>
  </body></html>`;
}

test('library rescan removes only its own handlers and preserves game-view interaction', { concurrency: 1, timeout: 180000 }, async (t) => {
  const appSource = fs.readFileSync(path.join(appDir, 'app.js'), 'utf8');
  assert.match(appSource, /\$\('#game-list'\)\.off\('\.awLibrary'\)/, 'rescans must remove only the app-owned event namespace');
  assert.match(
    appSource,
    /onStart: function \(options = \{\}\)[\s\S]*?reloadCoverOverrides\(\);[\s\S]*?debug\.log\(`\$\{remote\.app\.name\} loading/,
    'a refresh must reload cover overrides promoted by the cache-clear path'
  );
  const appOwnedEvents = [...appSource.matchAll(/\.on\('(mouseenter|mouseleave|click)\.awLibrary'/g)].map((match) => match[1]);
  assert.deepEqual(appOwnedEvents, ['mouseenter', 'mouseleave', 'click', 'click', 'click'], 'every scan-owned game-list handler must join the namespace');

  const { browser, userDataDir, failures } = await launchBrowser();
  if (!browser) {
    t.skip(skipReason(failures));
    return;
  }

  const harnessDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-library-handlers-harness-'));
  const harness = path.join(harnessDir, 'handlers.html');
  fs.writeFileSync(harness, buildHarness());

  try {
    const page = await browser.newPage();
    await page.goto(pathToFileURL(harness).href);
    const result = await page.evaluate(() => {
      let appOwnedClicks = 0;
      $('#game-list').on('click.awLibrary', '.game-box', () => {
        appOwnedClicks += 1;
      });

      // This is the exact cleanup shape used by app.onStart() before a rescan.
      $('#game-list').off('.awLibrary');
      const box = $('#game-list .game-box').get(0);
      $(box).trigger('click');

      return {
        appOwnedClicks,
        rememberedBox: window.__awMouseNavGameBox === box,
        searchValue: $('#achievement-search-input').val(),
        remainingHiddenRows: $('#achievement .achievement-list ul > li.search-hidden').length,
      };
    });

    assert.deepEqual(result, {
      appOwnedClicks: 0,
      rememberedBox: true,
      searchValue: '',
      remainingHiddenRows: 0,
    });
  } finally {
    await closeBrowser(browser, userDataDir);
    fs.rmSync(harnessDir, { recursive: true, force: true });
  }
});
