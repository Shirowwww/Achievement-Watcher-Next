'use strict';

// The probe the main process runs inside a notification popup before a screenshot souvenir is
// taken. Every bundled preset is rendered as it ships and given a real payload: the probe must
// answer once the title is visible and still, and never while the card is still sliding in.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { test, before, after } = require('node:test');
const { launchBrowser, closeBrowser, skipReason } = require('../helpers/chromium');

const appDir = path.join(__dirname, '..', '..', 'app');
const { probeSource } = require(path.join(appDir, 'electron', 'notificationPaint.js'));
const PRESETS = ['Default Presets', 'Users Presets'].flatMap((group) =>
  fs.readdirSync(path.join(appDir, 'presets', group)).map((name) => ({ group, name, dir: path.join(appDir, 'presets', group, name) }))
);

const SAMPLE_IMAGE =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const TITLE = 'Probe title 7Q';
const PAYLOAD = {
  displayName: TITLE,
  description: 'Probe description',
  gameName: 'Probe game',
  iconPath: SAMPLE_IMAGE,
  scale: 1,
  notificationType: 'achievement',
  rarityPercent: 12,
};

let shared = null;
before(async () => {
  shared = await launchBrowser();
});
after(async () => {
  if (shared && shared.browser) await closeBrowser(shared.browser, shared.userDataDir);
});

function presetSize(dir) {
  const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
  const match = html.match(/<meta\s+width="(\d+)"\s+height="(\d+)"/i);
  return match ? { width: Number(match[1]), height: Number(match[2]) } : { width: 480, height: 160 };
}

// The bridge the notification preload exposes, reduced to what presets call.
function installBridge() {
  window.api = {
    onNotification(callback) {
      window.__deliver = callback;
    },
    notificationRenderReady() {
      window.__readyAt = performance.now();
    },
    closeNotificationWindow() {},
  };
}

async function titleBox(page) {
  return page.evaluate((title) => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.nodeValue.includes(title)) continue;
      const element = node.parentElement;
      const box = element.getBoundingClientRect();
      let opacity = 1;
      for (let at = element; at; at = at.parentElement) opacity *= Number(getComputedStyle(at).opacity);
      return { x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.width), opacity };
    }
    return null;
  }, TITLE);
}

async function deliver(page, preset) {
  await page.setViewport(presetSize(preset.dir));
  await page.evaluateOnNewDocument(installBridge);
  await page.goto(pathToFileURL(path.join(preset.dir, 'index.html')).href, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.__deliver === 'function', { timeout: 5000 });
  await page.evaluate((payload) => window.__deliver(payload), PAYLOAD);
}

// Presets settle on their own clocks, so several are checked side by side. A tab behind another is
// hidden and its animations stop; a context of its own keeps its page visible.
test('every bundled preset settles with its title visible and still', { concurrency: 6, timeout: 300000 }, async (t) => {
  if (!shared.browser) {
    t.skip(skipReason(shared.failures));
    return;
  }
  const checks = PRESETS.map((preset) =>
    t.test(`${preset.group}/${preset.name}`, async () => {
      const context = await shared.browser.createBrowserContext();
      const page = await context.newPage();
      try {
        await deliver(page, preset);
        // As the main process does: the preset's own render-ready call first, then the probe.
        await page.waitForFunction(() => window.__readyAt !== undefined, { timeout: 4000 }).catch(() => {});
        const state = await page.evaluate(probeSource(6000));
        assert.equal(state, 'settled', 'the popup never settled');
        const atAnswer = await titleBox(page);
        assert.ok(atAnswer, 'the title is not in the page');
        assert.ok(atAnswer.opacity > 0.9, `the title is still fading in (opacity ${atAnswer.opacity})`);
        await new Promise((resolve) => setTimeout(resolve, 250));
        const later = await titleBox(page);
        assert.deepEqual({ x: later.x, y: later.y }, { x: atAnswer.x, y: atAnswer.y }, 'the title was still moving');
      } finally {
        await context.close();
      }
    }),
  );
  await Promise.all(checks);
});

test('a card still sliding in is not reported as settled', { timeout: 60000 }, async (t) => {
  if (!shared.browser) {
    t.skip(skipReason(shared.failures));
    return;
  }
  const page = await shared.browser.newPage();
  try {
    await page.setContent(
      `<style>
        @keyframes slide { from { transform: translateX(-300px); opacity: 0; } to { transform: none; opacity: 1; } }
        @keyframes glow { from { filter: none; } to { filter: brightness(2); } }
        .card { animation: slide 1200ms ease-out both, glow 400ms infinite alternate; }
        .exit { animation: slide 300ms 4000ms reverse both; }
      </style>
      <div class="card"><span class="exit">${TITLE}</span></div>`
    );
    const started = Date.now();
    const state = await page.evaluate(probeSource(5000));
    assert.equal(state, 'settled');
    assert.ok(Date.now() - started >= 1100, 'answered before the entry ended');
    assert.ok(Date.now() - started < 3000, 'an endless glow or a later exit must not hold the answer back');
  } finally {
    await page.close();
  }
});

test('a web font still on its way holds the answer until it has swapped in', { timeout: 60000 }, async (t) => {
  if (!shared.browser) {
    t.skip(skipReason(shared.failures));
    return;
  }
  const FONT_DELAY_MS = 1200;
  const FONT_URL = 'https://fonts.test/slow.woff2';
  const FACE = '700 18px Slow';
  const font =fs.readFileSync(path.join(appDir, 'presets', 'Users Presets', 'Batman', 'fonts', 'Rajdhani-latin-700.woff2'));
  const page = await shared.browser.newPage();
  try {
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      if (request.url() === FONT_URL) {
        setTimeout(() => request.respond({ status: 200, contentType: 'font/woff2', headers: { 'Access-Control-Allow-Origin': '*' }, body: font }), FONT_DELAY_MS);
      } else request.continue();
    });
    await page.setContent(
      `<style>
        @font-face { font-family: Slow; font-weight: 700; font-display: swap; src: url(${FONT_URL}) format('woff2'); }
        body { text-align: center; width: 400px; }
        span { font: ${FACE}, 'Segoe UI', sans-serif; }
      </style>
      <span>${TITLE}</span>`,
      { waitUntil: 'domcontentloaded' }
    );
    const started = Date.now();
    const state = await page.evaluate(probeSource(5000));
    assert.equal(state, 'settled');
    assert.ok(Date.now() - started >= FONT_DELAY_MS - 100, 'answered with the fallback face still showing');
    assert.equal(await page.evaluate((face) => document.fonts.check(face), FACE), true);
  } finally {
    await page.close();
  }
});

test('a page that never shows text gives up at its limit', { timeout: 30000 }, async (t) => {
  if (!shared.browser) {
    t.skip(skipReason(shared.failures));
    return;
  }
  const page = await shared.browser.newPage();
  try {
    await page.setContent('<div style="width:200px;height:50px;background:#333"></div><span hidden>secret</span>');
    assert.equal(await page.evaluate(probeSource(300)), 'limit');
  } finally {
    await page.close();
  }
});
