'use strict';

/*
  The theme preview frame, in a real engine (skipped with no Chromium browser present). Two claims
  can only be checked by something that actually parses and paints: that the sample really is painted
  with the theme, and that the document cannot run anything even when a package tries - both
  load-bearing, since the frame is how a user decides whether to install a file from a stranger.
*/

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { test } = require('node:test');

const { launchBrowser, closeBrowser, skipReason } = require('../helpers/chromium');

const appDir = path.join(__dirname, '..', '..', 'app');
const { buildThemeMock } = require(path.join(appDir, 'util', 'themeMock.js'));
const { defaultCustomTheme } = require(path.join(appDir, 'util', 'themeLayers.js'));
const { VIEWPORT } = require(path.join(__dirname, '..', '..', 'tools', 'gallery', 'render-theme-preview.js'));

// The script-src of app.html, verbatim: a srcdoc frame inherits it, so the preview runs under it.
const CSP = (() => {
  const html = fs.readFileSync(path.join(appDir, 'view', 'app.html'), 'utf8');
  const match = /content="(default-src[^"]+)"/.exec(html);
  assert.ok(match, 'app.html no longer declares a content security policy');
  return match[1];
})();

function theme(overrides = {}) {
  const model = defaultCustomTheme();
  for (const [id, values] of Object.entries(overrides)) Object.assign(model[id], values);
  return model;
}

/*
  A page holding the frame, served over http so the policy applies the way it does in the app. The
  frame is the size the gallery renders at, so "does the sample fit" is asked about the size that
  actually ships rather than about one this test made up.
*/
function host(mock) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8" />
<meta http-equiv="Content-Security-Policy" content="${CSP.replace(/"/g, '&quot;')}" />
</head><body><iframe id="frame" style="width:${VIEWPORT.width}px;height:${VIEWPORT.height}px;border:0"></iframe>
</body></html>`.replace('</body>', `<script id="fill" type="application/json">${JSON.stringify(mock)}</script></body>`);
}

async function serve(document) {
  const server = http.createServer((request, response) => {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(document);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { server, url: `http://127.0.0.1:${server.address().port}/` };
}

async function withFrame(t, mock, run) {
  const { browser, userDataDir, failures } = await launchBrowser();
  if (!browser) {
    t.skip(skipReason(failures));
    return;
  }
  const { server, url } = await serve(host(mock));
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (err) => errors.push(String(err.message || err)));

    await page.goto(url, { waitUntil: 'load' });
    // Filling the frame the way settings.js does. The JSON island keeps the mock out of the host
    // markup, so nothing here can be confused with a parser difference.
    await page.evaluate(() => {
      const frame = document.getElementById('frame');
      frame.srcdoc = JSON.parse(document.getElementById('fill').textContent);
    });
    await page.waitForFunction(() => {
      const frame = document.getElementById('frame');
      return frame.contentDocument && frame.contentDocument.querySelector('.mock');
    }, { timeout: 15000 });

    await run(page, errors);
  } finally {
    server.close();
    await closeBrowser(browser, userDataDir);
  }
}

test('the frame paints the sample with the theme it was given', { concurrency: 1, timeout: 120000 }, async (t) => {
  const mock = buildThemeMock(
    theme({
      accent: { color: '#ff00aa' },
      card: { color: '#22303d' },
      text: { color: '#e7edf6' },
      muted: { color: '#94a5ba' },
      border: { color: '#3e5065' },
    })
  );

  await withFrame(t, mock, async (page) => {
    const painted = await page.evaluate(() => {
      const inner = document.getElementById('frame').contentDocument;
      const seen = (selector, property) => getComputedStyle(inner.querySelector(selector))[property];
      return {
        accent: seen('.btn-accent', 'backgroundColor'),
        live: seen('.mock-header .live', 'backgroundColor'),
        activeTool: seen('.mock-tools .tool.is-on', 'borderTopColor'),
        meter: seen('.bar > span', 'backgroundColor'),
        text: seen('.mock-header .name', 'color'),
        muted: seen('.mock-header .detail', 'color'),
        border: seen('.mock-profile .pill', 'borderTopColor'),
        cardPainted: seen('#game-list .game-box .info', 'backgroundImage'),
        settingsPainted: seen('#settings .box', 'backgroundImage'),
        tiles: inner.querySelectorAll('#game-list .game-box').length,
        rows: inner.querySelectorAll('#achievement .achievement-list li').length,
        rare: seen('#achievement .achievement-list li.is-rare .state', 'color'),
      };
    });

    // The accent reaches every place a theme expects it, not only the obvious button.
    for (const [where, value] of [
      ['the accent button', painted.accent],
      ['the status dot', painted.live],
      ['the active tool', painted.activeTool],
      ['a progress meter', painted.meter],
      ['the rare label', painted.rare],
    ]) {
      assert.equal(value, 'rgb(255, 0, 170)', `the accent colour is missing from ${where}`);
    }

    assert.equal(painted.text, 'rgb(231, 237, 246)', 'the text colour is not applied');
    assert.equal(painted.muted, 'rgb(148, 165, 186)', 'the muted colour is not applied');
    assert.equal(painted.border, 'rgb(62, 80, 101)', 'the border colour is not applied');
    assert.notEqual(painted.cardPainted, 'none', 'the card layer paints nothing at all');
    assert.notEqual(painted.settingsPainted, 'none', 'the settings layer paints nothing at all');
    assert.equal(painted.tiles, 8, 'the sample library is gone');
    assert.equal(painted.rows, 3, 'the sample achievement list is gone');
  });
});

test('the whole sample fits inside the frame, so nothing is judged on a clipped picture', { concurrency: 1, timeout: 120000 }, async (t) => {
  await withFrame(t, buildThemeMock(theme()), async (page) => {
    const fits = await page.evaluate(() => {
      const inner = document.getElementById('frame').contentDocument;
      const bottom = (selector) => inner.querySelector(selector).getBoundingClientRect().bottom;
      return {
        height: inner.documentElement.clientHeight,
        scrollHeight: inner.documentElement.scrollHeight,
        lastTile: bottom('#game-list .game-box:last-child'),
        lastRow: bottom('#achievement .achievement-list li:last-child'),
        settings: bottom('#settings .box'),
        panel: bottom('#game-list'),
      };
    });

    assert.ok(fits.scrollHeight <= fits.height + 1, `the sample is ${fits.scrollHeight - fits.height}px taller than the frame`);
    assert.ok(fits.lastTile <= fits.panel + 1, 'the last library tile is clipped by the panel');
    assert.ok(fits.lastRow <= fits.height, 'the last achievement row is off the bottom');
    assert.ok(fits.settings <= fits.height, 'the settings panel is off the bottom');
  });
});

test('nothing a package supplies can run in the frame', { concurrency: 1, timeout: 120000 }, async (t) => {
  /*
    Every field a package controls, filled with something that would run if it were ever treated as
    markup, a URL or a stylesheet rather than as a value. The model is re-clamped before it is drawn,
    so none of it should survive - and if it did, the page policy still pins by hash what may run.
  */
  const mock = buildThemeMock({
    bg: {
      color: '</style><script>window.__ran = true;</script>',
      image: 'x" onerror="window.__ran = true',
      fit: 'cover',
      effect: { enabled: true, type: 'veil', color: 'url(https://evil.invalid/x)', opacity: 50, blur: 8, blurImage: '' },
      gradient: { enabled: true, from: 'javascript:alert(1)', to: '#000000', angle: 180 },
    },
    accent: { color: 'expression(window.__ran = true)' },
  });

  await withFrame(t, mock, async (page, errors) => {
    const outcome = await page.evaluate(() => {
      const inner = document.getElementById('frame').contentDocument;
      return {
        ran: Boolean(inner.defaultView.__ran),
        scripts: inner.querySelectorAll('script').length,
        html: inner.documentElement.outerHTML,
      };
    });

    assert.equal(outcome.ran, false, 'something in the theme ran');
    assert.equal(outcome.scripts, 0, 'the preview document carries a script');
    assert.ok(!outcome.html.includes('evil.invalid'), 'a remote address survived into the document');
    assert.ok(!outcome.html.includes('javascript:'), 'a javascript: URL survived into the document');
    assert.deepEqual(errors, [], 'the frame raised an error');
  });
});
