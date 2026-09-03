'use strict';

/*
  The OBS browser source, rendered by a real browser (issue #59).

  The unit test proves the routes; this proves the page. A browser source is a page OBS keeps
  loaded for hours next to a game, so two things have to hold at once: an unlock has to paint the
  user's actual preset - artwork included, off a local file the page could not otherwise read - and
  between unlocks the page has to be completely inert, since anything that keeps animating keeps
  CEF repainting and costs a fifth of a core for as long as the stream runs.
*/

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { launchBrowser, closeBrowser, skipReason } = require('../helpers/chromium.js');
const { serveOnOpenPort } = require('../helpers/openPort.js');

const watchdogDir = path.join(__dirname, '..', '..', 'watchdog');
const obsSource = require(path.join(watchdogDir, 'notification', 'obsSource.js'));
const presetLocator = require(path.join(watchdogDir, 'util', 'presetLocator.js'));
const ws = require(path.join(watchdogDir, 'node_modules', 'ws'));

const BUNDLED_PRESETS = path.join(__dirname, '..', '..', 'app', 'presets', 'Default Presets');

// A real 1x1 PNG, so the browser reports a decoded size rather than a broken image.
const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

function makeWorkspace() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-obs-browser-'));
  const artwork = path.join(dir, 'trophy.png');
  fs.writeFileSync(artwork, ONE_PIXEL_PNG);
  const optionsFile = path.join(dir, 'options.ini');
  fs.writeFileSync(optionsFile, '[achievement]\nlang = english\n[overlay]\nnotificationPreset = AW Next\n');
  return { dir, artwork, optionsFile };
}

// The page talks to the websocket on its own origin, so the feed has to share the http server the
// same way the Watchdog shares it.
async function startServer({ optionsFile }) {
  const handle = obsSource.createHandler({ presetRoots: [BUNDLED_PRESETS], optionsFile });
  const server = http.createServer((req, res) => {
    if (handle(req, res)) return;
    res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
  });
  const sockets = new ws.Server({ noServer: true });
  const clients = new Set();
  server.on('upgrade', (req, socket, head) => {
    sockets.handleUpgrade(req, socket, head, (client) => {
      clients.add(client);
      client.on('close', () => clients.delete(client));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    clientCount: () => clients.size,
    broadcast(message) {
      obsSource.rememberArtwork(message);
      const json = JSON.stringify(message);
      for (const client of clients) client.send(json);
    },
    // The page holds a websocket open, and server.close() waits for every live connection: without
    // dropping them first this hangs the suite rather than ending the test.
    close: () =>
      new Promise((resolve) => {
        for (const client of clients) client.terminate();
        clients.clear();
        server.closeAllConnections();
        server.close(resolve);
      }),
  };
}

async function until(condition, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) return false;
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  return true;
}

async function waitFor(page, expression, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (await page.evaluate(expression)) return true;
    if (Date.now() > deadline) return false;
    await new Promise((resolve) => setTimeout(resolve, 60));
  }
}

test('an unlock paints the preset in a browser source, and nothing paints between unlocks', async (t) => {
  const workspace = makeWorkspace();
  presetLocator.invalidate();
  obsSource._resetSettingsCache();
  obsSource._resetArtwork();

  const server = await serveOnOpenPort(startServer, { optionsFile: workspace.optionsFile });
  const { browser, userDataDir, failures } = await launchBrowser();
  if (!browser) {
    await server.close();
    t.skip(skipReason(failures));
    return;
  }
  // One hook, in this order: the page reconnects on its own, so the browser has to be gone before
  // the server is taken down.
  t.after(async () => {
    await closeBrowser(browser, userDataDir);
    await server.close();
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 474, height: 136 });
  // A short card keeps the test quick; the app passes the same override as a real duration setting.
  await page.goto(`${server.url}/obs/?duration=1200`, { waitUntil: 'domcontentloaded' });

  // Idle: the body is not merely transparent, it is not laid out at all - no animation of any
  // preset can tick, so CEF has nothing to repaint.
  assert.equal(
    await page.evaluate(() => getComputedStyle(document.body).display),
    'none',
    'a browser source with no unlock on screen must not be painting anything'
  );
  assert.ok(await waitFor(page, () => window.api && typeof window.api.onNotification === 'function'), 'the bridge must install window.api');
  assert.ok(await until(() => server.clientCount() > 0), 'the page connects itself to the notification feed');

  server.broadcast({
    appID: 480,
    game: 'Spacewar',
    achievement: 'ACH_WIN_ONE_GAME',
    displayName: 'Winner',
    description: 'Win one game.',
    rarityPercent: 2.5,
    notificationType: 'achievement',
    icon: workspace.artwork,
    time: Date.now(),
  });

  assert.ok(await waitFor(page, () => document.querySelector('.ach') && document.querySelector('.ach').classList.contains('active')), 'the card must appear');
  // The card is on screen the moment the payload lands; its picture is still being fetched and
  // decoded, so `naturalWidth` has to be waited for rather than read on the same tick.
  assert.ok(
    await waitFor(page, () => {
      const img = document.querySelector('.icon img');
      return img && img.complete && img.naturalWidth > 0;
    }),
    'the achievement picture must load'
  );

  const card = await page.evaluate(() => ({
    display: getComputedStyle(document.body).display,
    title: document.querySelector('.title').textContent,
    detail: document.querySelector('.detail').textContent,
    game: document.querySelector('.game').textContent,
    rarity: document.querySelector('.rarity').textContent,
    // The rare tiers are a state the preset paints itself; 2.5% is the rarest one.
    rare: document.querySelector('.ach').classList.contains('state-rare'),
    tier: document.querySelector('.ach').classList.contains('tier-gold'),
    iconSrc: document.querySelector('.icon img').src,
    iconWidth: document.querySelector('.icon img').naturalWidth,
  }));

  assert.notEqual(card.display, 'none');
  assert.equal(card.title, 'Winner');
  assert.equal(card.detail, 'Win one game.');
  assert.equal(card.game, 'Spacewar');
  assert.equal(card.rarity, '2.5%');
  assert.ok(card.rare && card.tier, 'a 2.5% unlock is a rare one, and the preset says so');
  // Artwork on this machine reaches the page as an http URL it is allowed to ask for; a file://
  // path would simply not load, which is how this used to fail silently.
  assert.match(card.iconSrc, /\/obs\/_art\?p=/);
  assert.equal(card.iconWidth, 1, 'the picture really decoded - not a broken image with alt text');

  // ...and once the card has run its course the page goes quiet again by itself.
  assert.ok(
    await waitFor(page, () => getComputedStyle(document.body).display === 'none', 8000),
    'the page must go back to painting nothing when the card is over'
  );
});

/*
  The claim above, measured on the preset that would otherwise prove it wrong: Arcade's title cursor
  blinks on an `animation: ... infinite` that is NOT gated on the card being on screen, so left
  visible it would repaint the source once a second, forever, next to a running game.
*/
test('a preset that animates unconditionally still leaves the source completely still', async (t) => {
  const workspace = makeWorkspace();
  presetLocator.invalidate();
  obsSource._resetSettingsCache();

  const server = await serveOnOpenPort(startServer, { optionsFile: workspace.optionsFile });
  const { browser, userDataDir, failures } = await launchBrowser();
  if (!browser) {
    await server.close();
    t.skip(skipReason(failures));
    return;
  }
  t.after(async () => {
    await closeBrowser(browser, userDataDir);
    await server.close();
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 474, height: 136 });
  await page.goto(`${server.url}/obs/preset/Arcade/`, { waitUntil: 'domcontentloaded' });
  assert.ok(await waitFor(page, () => window.api && typeof window.api.onNotification === 'function'));

  const idle = await page.evaluate(() => document.getAnimations().length);
  assert.equal(idle, 0, 'an idle browser source must have no animation running at all');

  // The same page, once its card is on screen, does animate - so the zero above is the hiding
  // working, not the preset having been broken on the way through.
  await page.evaluate(() => document.documentElement.classList.remove('aw-obs-idle'));
  assert.ok(
    await waitFor(page, () => document.getAnimations().length > 0),
    'and the animation is still there for when a card is actually up'
  );
});

/*
  Fit-to-source. OBS creates a browser source at 800x600 and the user resizes it by dragging; the
  card has to end up filling whatever box that is, at any size, or the default source leaves it
  small and centered in a large transparent box - which reads exactly like "nothing happened".
*/
test('the card fills the source at any size the user gives it', async (t) => {
  const workspace = makeWorkspace();
  presetLocator.invalidate();
  obsSource._resetSettingsCache();

  const server = await serveOnOpenPort(startServer, { optionsFile: workspace.optionsFile });
  const { browser, userDataDir, failures } = await launchBrowser();
  if (!browser) {
    await server.close();
    t.skip(skipReason(failures));
    return;
  }
  t.after(async () => {
    await closeBrowser(browser, userDataDir);
    await server.close();
  });

  const config = await fetch(`${server.url}/obs/_config`).then((res) => res.json());
  const design = { width: config.designWidth, height: config.designHeight };
  assert.ok(design.width > 0 && design.height > 0);
  assert.equal(config.width, design.width * 2, 'the size offered is a sharp default, not the raw box');

  const page = await browser.newPage();
  await page.setViewport({ width: 800, height: 600 });
  await page.goto(`${server.url}/obs/`, { waitUntil: 'domcontentloaded' });
  assert.ok(await waitFor(page, () => window.api && typeof window.api.onNotification === 'function'));

  // Every size a user plausibly gives the source: the OBS default, the offered 2x, a wide banner,
  // and one smaller than the preset was drawn for.
  for (const box of [
    { width: 800, height: 600 },
    { width: design.width * 2, height: design.height * 2 },
    { width: 1920, height: 300 },
    { width: 300, height: 90 },
  ]) {
    await page.setViewport(box);
    // The zoom is applied on resize, and a viewport change needs a frame to land.
    await waitFor(page, () => true);
    await new Promise((resolve) => setTimeout(resolve, 250));
    const zoom = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).zoom) || 1);
    const expected = Math.min(Math.min(box.width / design.width, box.height / design.height), 8);
    assert.ok(
      Math.abs(zoom - expected) < 0.02,
      `a ${box.width}x${box.height} source should render the card at ${expected.toFixed(3)}, not ${zoom}`
    );
  }

  // Opting out still works: an explicit number pins the zoom whatever the source measures.
  const pinned = await browser.newPage();
  await pinned.setViewport({ width: 1200, height: 400 });
  await pinned.goto(`${server.url}/obs/?scale=1.25`, { waitUntil: 'domcontentloaded' });
  await new Promise((resolve) => setTimeout(resolve, 250));
  assert.equal(await pinned.evaluate(() => parseFloat(getComputedStyle(document.documentElement).zoom) || 1), 1.25);
});
