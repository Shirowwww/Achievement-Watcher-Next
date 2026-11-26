'use strict';

// An imported SAN theme as the notification window loads it: the generated index.html from disk,
// the bridge the preload exposes, a payload as the app sends it. Every base card is drawn in each
// state, then played to its end, which is when the page must close itself.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { launchBrowser, closeBrowser, skipReason } = require('../helpers/chromium');

const PAGES_AT_ONCE = 12;

const appDir = path.join(__dirname, '..', '..', 'app');
const { mapLimit } = require(path.join(appDir, 'util', 'onboardingDetect.js'));
const engine = require(path.join(appDir, 'util', 'sanEngine', 'engine.js'));
const sanEngine = require(path.join(appDir, 'util', 'sanEngine', 'index.js'));
const { probeSource } = require(path.join(appDir, 'electron', 'notificationPaint.js'));

const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

// The bridge notificationPreload.js exposes, recording what the page asks of the host.
function bridge() {
  window.__aw = { ready: 0, closed: 0, show: null };
  window.api = {
    onNotification: (callback) => {
      window.__aw.show = callback;
    },
    notificationRenderReady: () => {
      window.__aw.ready += 1;
    },
    closeNotificationWindow: () => {
      window.__aw.closed += 1;
    },
  };
}

function themeFor(card) {
  const look = (extra) => ({
    preset: card,
    displaytime: 2,
    primarycolor: '#202040',
    secondarycolor: '#404080',
    tertiarycolor: '#ffffff',
    fontcolor: '#ffffff',
    elems: ['unlockmsg', 'title', 'desc'],
    iconanim: true,
    showhiddenicon: true,
    hiddeniconpos: 2,
    ...extra,
  });
  return {
    label: card,
    thresholds: { rarity: 10, semirarity: 25 },
    showpercent: 'rareonly',
    notify1line: false,
    types: { main: look({}), semi: look({ primarycolor: '#204020' }), rare: look({ glow: true, glowcolor: '#ffcc00' }), plat: look({ primarycolor: '#402020' }) },
  };
}

const payload = (extra) => ({
  displayName: 'First Blood',
  description: 'Win your first match',
  gameName: 'Sample Game',
  iconPath: PNG,
  unlockRate: 50,
  rarityTier: '',
  rarityMode: 'rare',
  notificationType: 'achievement',
  position: 'bottom-right',
  fallback: { achievementUnlocked: 'Achievement Unlocked', congratulations: 'Congratulations!' },
  ...extra,
});

test('every base card draws each state from a real preset page and closes itself', { timeout: 240000 }, async (t) => {
  const { browser, userDataDir, failures } = await launchBrowser(['--allow-file-access-from-files']);
  if (!browser) return t.skip(skipReason(failures));
  const cards = engine.LAYOUT_IDS.filter((id) => fs.existsSync(path.join(appDir, 'util', 'sanEngine', 'layouts', `${id}.html`)));
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-san-page-'));
  t.after(async () => {
    await closeBrowser(browser, userDataDir);
    fs.rmSync(root, { recursive: true, force: true });
  });

  const states = [
    ['main', payload({})],
    ['semi', payload({ unlockRate: 12, rarityTier: 'bronze' })],
    ['rare', payload({ unlockRate: 3, rarityTier: 'gold', hidden: true })],
    ['plat', payload({ notificationType: 'platinum', isPlatinum: true, rarityTier: 'platinum' })],
  ];
  const jobs = [];
  for (const card of cards) {
    const dir = path.join(root, card);
    fs.mkdirSync(dir);
    sanEngine.writePresetFiles(dir, themeFor(card), { name: card });
    for (const [state, data] of states) jobs.push({ card, dir, state, data });
  }

  // Each card waits for its own 2 s to play out, so the pages are drawn side by side. A tab behind
  // another is hidden and never plays out; a context of its own keeps its page visible.
  await mapLimit(jobs, PAGES_AT_ONCE, async ({ card, dir, state, data }) => {
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    try {
      const errors = [];
      page.on('pageerror', (error) => errors.push(String(error.message || error)));
      await page.evaluateOnNewDocument(bridge);
      await page.goto(pathToFileURL(path.join(dir, 'index.html')).href, { waitUntil: 'load' });
      await page.evaluate((d) => window.__aw.show(d), data);
      await page.waitForFunction(() => window.__aw.ready > 0, { timeout: 10000 });

      const drawn = await page.evaluate(() => ({
        attrs: [...document.body.attributes].map((attr) => attr.name),
        title: (document.getElementById('title') || {}).textContent || '',
        unlockmsg: (document.getElementById('unlockmsg') || {}).textContent || '',
        lock: Boolean(document.getElementById('hiddenicon')),
        layoutCss: [...document.styleSheets].some((sheet) => /layout-\w+\.css$/.test(sheet.href || '') && sheet.cssRules.length > 0),
      }));
      const where = `${card}/${state}`;
      assert.deepEqual(errors, [], `${where}: the page threw`);
      assert.ok(drawn.attrs.includes(state), `${where}: drawn as ${drawn.attrs.join(' ')}`);
      assert.ok(drawn.layoutCss, `${where}: the card stylesheet did not load`);
      assert.ok(`${drawn.unlockmsg} ${drawn.title}`.includes(state === 'plat' ? 'Congratulations!' : 'Achievement Unlocked') || drawn.title.includes('First Blood'), `${where}: no text drawn`);
      if (state === 'rare') assert.ok(drawn.lock, `${where}: a hidden achievement has no padlock`);

      // A 2 s card plays out, fades and asks to be closed, well before the host's catch-all.
      await page.waitForFunction(() => window.__aw.closed > 0, { timeout: 9000 });
    } finally {
      await context.close().catch(() => {});
    }
  });
  assert.ok(cards.includes('default'), 'the default card is missing');
});

// Strongest alpha per side of a box: on its own edge, and in a band `depth` pixels wide just outside
// it. Read back from a screenshot taken without the page background.
async function alphaAround(browser, page, box, depth) {
  const shot = await page.screenshot({ omitBackground: true, encoding: 'base64' });
  const reader = await browser.newPage();
  try {
    return await reader.evaluate(
      (data, b, d) =>
        new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            const strongest = (x, y, w, h) => {
              const pixels = ctx.getImageData(Math.max(0, Math.floor(x)), Math.max(0, Math.floor(y)), Math.max(1, Math.floor(w)), Math.max(1, Math.floor(h))).data;
              let max = 0;
              for (let i = 3; i < pixels.length; i += 4) max = Math.max(max, pixels[i]);
              return max;
            };
            const right = b.x + b.width;
            const bottom = b.y + b.height;
            resolve({
              outside: {
                left: strongest(b.x - d - 1, b.y, d, b.height),
                right: strongest(right + 1, b.y, d, b.height),
                top: strongest(b.x, b.y - d - 1, b.width, d),
                bottom: strongest(b.x, bottom + 1, b.width, d),
              },
              inside: {
                left: strongest(b.x + 2, b.y, 1, b.height),
                right: strongest(right - 3, b.y, 1, b.height),
                top: strongest(b.x, b.y + 2, b.width, 1),
                bottom: strongest(b.x, bottom - 3, b.width, 1),
              },
            });
          };
          img.onerror = reject;
          img.src = 'data:image/png;base64,' + data;
        }),
      shot,
      box,
      depth
    );
  } finally {
    await reader.close();
  }
}

test('a glowing card glows past its own edges on every side, inside the window SAN would open', { timeout: 240000 }, async (t) => {
  const { browser, userDataDir, failures } = await launchBrowser(['--allow-file-access-from-files']);
  if (!browser) return t.skip(skipReason(failures));
  const cards = engine.LAYOUT_IDS.filter((id) => fs.existsSync(path.join(appDir, 'util', 'sanEngine', 'layouts', `${id}.html`)));
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-san-glow-'));
  t.after(async () => {
    await closeBrowser(browser, userDataDir);
    fs.rmSync(root, { recursive: true, force: true });
  });

  let edges = 0;
  await mapLimit(cards, PAGES_AT_ONCE, async (card) => {
    const theme = themeFor(card);
    theme.types.main = { ...theme.types.main, glow: true, glowcolor: '#ffffff', glowsize: 100, scale: 150, displaytime: 30, iconanim: false };
    const dir = path.join(root, card);
    fs.mkdirSync(dir);
    sanEngine.writePresetFiles(dir, theme, { name: card });
    const meta = /<meta width="(\d+)" height="(\d+)"/.exec(fs.readFileSync(path.join(dir, 'index.html'), 'utf8'));
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    try {
      // The popup window is the preset's <meta> box: draw the page at that size.
      await page.setViewport({ width: Number(meta[1]), height: Number(meta[2]) });
      await page.evaluateOnNewDocument(bridge);
      await page.goto(pathToFileURL(path.join(dir, 'index.html')).href, { waitUntil: 'load' });
      await page.evaluate((d) => window.__aw.show(d), payload({}));
      await page.waitForFunction(() => window.__aw.ready > 0, { timeout: 10000 });
      assert.equal(await page.evaluate(probeSource(6000)), 'settled', `${card}: the card never settled`);
      const box = await page.evaluate(() => {
        const r = document.body.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
      });
      // A side the card paints up to must glow past it. Cards inset their body or leave it bare
      // (windows glows around its text only, as in SAN), so only sides painted near the edge count.
      const PAINTED = 8;
      const { inside, outside } = await alphaAround(browser, page, box, 4);
      for (const side of ['left', 'right', 'top', 'bottom']) {
        if (inside[side] < PAINTED) continue;
        edges += 1;
        assert.ok(outside[side] > 0, `${card}: no glow past the card's ${side} edge (${JSON.stringify(outside)})`);
      }
    } finally {
      await context.close().catch(() => {});
    }
  });
  assert.ok(edges >= cards.length,`only ${edges} painted card edges were checked`);
});

test('the trophy follows the tier shown, a pinned tier, and a state drawn by a theme of its own', { timeout: 60000 }, async (t) => {
  const { browser, userDataDir, failures } = await launchBrowser(['--allow-file-access-from-files']);
  if (!browser) return t.skip(skipReason(failures));
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-san-tier-'));
  t.after(async () => {
    await closeBrowser(browser, userDataDir);
    fs.rmSync(root, { recursive: true, force: true });
  });
  const trophies = { decoration: ['assets/b.png', 'assets/s.png', 'assets/g.png'] };
  const ps5 = { ...themeFor('ps5').types.main, decorationpos: 1, customicons: { ps5: trophies } };
  const draw = async (name, theme, data) => {
    const dir = path.join(root, name);
    fs.mkdirSync(dir);
    sanEngine.writePresetFiles(dir, theme, { name });
    const page = await browser.newPage();
    try {
      await page.evaluateOnNewDocument(bridge);
      await page.goto(pathToFileURL(path.join(dir, 'index.html')).href, { waitUntil: 'load' });
      await page.evaluate((d) => window.__aw.show(d), data);
      await page.waitForFunction(() => window.__aw.ready > 0, { timeout: 10000 });
      return await page.evaluate(() => ({
        decoration: document.documentElement.style.getPropertyValue('--decoration'),
        attrs: [...document.body.attributes].map((attr) => attr.name),
        card: [...document.styleSheets].map((sheet) => /layout-(\w+)\.css$/.exec(sheet.href || '')).filter(Boolean).map((m) => m[1]),
      }));
    } finally {
      await page.close().catch(() => {});
    }
  };
  const theme = { ...themeFor('ps5'), types: { main: ps5 } };
  const silver = payload({ unlockRate: 7, rarityTier: 'silver' });

  // Rare mode paints silver with SAN's rare state; its trophy must still be the silver one.
  const shown = await draw('auto', theme, silver);
  assert.ok(shown.attrs.includes('rare'), shown.attrs.join(' '));
  assert.match(shown.decoration, /s\.png/);
  assert.match((await draw('bronze', theme, payload({ unlockRate: 12, rarityTier: 'bronze' }))).decoration, /b\.png/);
  assert.match((await draw('pinned', { ...theme, tierPictures: 'gold' }, silver)).decoration, /g\.png/);

  // Silver given a look of its own: drawn on that look's card, the others keep the theme's.
  const own = { ...theme, states: { silver: { ...themeFor('xboxone').types.main } } };
  assert.deepEqual((await draw('own', own, silver)).card, ['xboxone']);
  assert.deepEqual((await draw('other', own, payload({ unlockRate: 2, rarityTier: 'gold' }))).card, ['ps5']);
});

test('a state is drawn at the scale its theme gives it, text included', { timeout: 60000 }, async (t) => {
  const { browser, userDataDir, failures } = await launchBrowser(['--allow-file-access-from-files']);
  if (!browser) return t.skip(skipReason(failures));
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-san-scale-'));
  t.after(async () => {
    await closeBrowser(browser, userDataDir);
    fs.rmSync(root, { recursive: true, force: true });
  });

  const measure = async (scale) => {
    const theme = themeFor('default');
    theme.types.main.scale = scale;
    // Long enough that the card cannot start leaving while it is being measured.
    theme.types.main.displaytime = 30;
    const dir = path.join(root, String(scale));
    fs.mkdirSync(dir);
    sanEngine.writePresetFiles(dir, theme, { name: 'scaled' });
    const page = await browser.newPage();
    await page.setViewport({ width: 800, height: 300 });
    await page.evaluateOnNewDocument(bridge);
    await page.goto(pathToFileURL(path.join(dir, 'index.html')).href, { waitUntil: 'load' });
    await page.evaluate((d) => window.__aw.show(d), payload({}));
    await page.waitForFunction(() => window.__aw.ready > 0, { timeout: 10000 });
    // The text slides in after the card and a late web font can reflow it: measure once it has settled.
    assert.equal(await page.evaluate(probeSource(6000)), 'settled', `scale ${scale}: the card never settled`);
    const size = await page.evaluate(() => ({
      card: document.body.getBoundingClientRect().width,
      text: document.getElementById('title').getBoundingClientRect().height,
    }));
    await page.close();
    return size;
  };
  const normal = await measure(100);
  const double = await measure(200);
  assert.ok(Math.abs(normal.card - 300) < 1, `the default card is 300px wide at 100%, got ${normal.card}`);
  assert.ok(Math.abs(double.card - 600) < 1, `the default card is 600px wide at 200%, got ${double.card}`);
  // SAN's root font is 0.8px + 3vw of its window, so the text grows a little less than the card:
  // 0.8 + 0.03 * 700 over 0.8 + 0.03 * 350 for the 300px default card.
  const sanRatio = (0.8 + 0.03 * 700) / (0.8 + 0.03 * 350);
  assert.ok(Math.abs(double.text / normal.text - sanRatio) < 0.02, `the text grows as in SAN: ${normal.text} -> ${double.text}`);
});

test('a scaled card sizes its text from the window SAN opens for it, as SAN does', { timeout: 60000 }, async (t) => {
  const { browser, userDataDir, failures } = await launchBrowser(['--allow-file-access-from-files']);
  if (!browser) return t.skip(skipReason(failures));
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-san-rem-'));
  t.after(async () => {
    await closeBrowser(browser, userDataDir);
    fs.rmSync(root, { recursive: true, force: true });
  });

  for (const [card, scale] of [['xbox360', 150], ['default', 100], ['ps5', 230]]) {
    const theme = themeFor(card);
    theme.types.main.scale = scale;
    theme.types.main.displaytime = 30;
    const dir = path.join(root, `${card}-${scale}`);
    fs.mkdirSync(dir);
    sanEngine.writePresetFiles(dir, theme, { name: card });
    const page = await browser.newPage();
    try {
      await page.evaluateOnNewDocument(bridge);
      await page.goto(pathToFileURL(path.join(dir, 'index.html')).href, { waitUntil: 'load' });
      await page.evaluate((d) => window.__aw.show(d), payload({}));
      await page.waitForFunction(() => window.__aw.ready > 0, { timeout: 10000 });
      const rem = await page.evaluate(() => {
        const probe = document.createElement('div');
        probe.style.cssText = 'position:absolute;width:10rem;height:1px';
        document.body.appendChild(probe);
        return probe.getBoundingClientRect().width / 10;
      });
      // SAN's root font, in the window it opens: the card plus 25px a side, all at the scale.
      const { width, height } = engine.LAYOUTS[card];
      const vw = ((width + 50) * scale) / 100 / 100;
      const vh = ((height + 50) * scale) / 100 / 100;
      const expected = Math.min(200, Math.max(0.8, 0.8 + 3 * Math.max(vw, vh)));
      assert.ok(Math.abs(rem - expected) < 0.02, `${card} at ${scale}%: 1rem is ${rem}px, SAN draws ${expected}px`);
    } finally {
      await page.close().catch(() => {});
    }
  }
});

test('items added in the designer are drawn in the card at their own size, shown by tier, and left out when bare', { timeout: 60000 }, async (t) => {
  const { browser, userDataDir, failures } = await launchBrowser(['--allow-file-access-from-files']);
  if (!browser) return t.skip(skipReason(failures));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-san-items-'));
  t.after(async () => {
    await closeBrowser(browser, userDataDir);
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const theme = themeFor('default');
  theme.types.main.scale = 200;
  theme.types.main.displaytime = 30;
  theme.awCanvas = {
    items: [
      { kind: 'text', text: 'GG {title}', x: 10, y: 4, w: 100, size: 12 },
      { kind: 'shape', shape: 'rect', x: 0, y: 0, w: 50, h: 20, tiers: { gold: { off: true } } },
    ],
  };
  sanEngine.writePresetFiles(dir, theme, { name: 'items' });

  const draw = async (data) => {
    const page = await browser.newPage();
    await page.setViewport({ width: 800, height: 300 });
    await page.evaluateOnNewDocument(bridge);
    await page.goto(pathToFileURL(path.join(dir, 'index.html')).href, { waitUntil: 'load' });
    await page.evaluate((d) => window.__aw.show(d), data);
    await page.waitForFunction(() => window.__aw.ready > 0, { timeout: 10000 });
    const out = await page.evaluate(() => {
      const layer = document.querySelector('#outerwrapper > .aw-canvas');
      const text = layer && layer.querySelector('[data-i="0"]');
      const shape = layer && layer.querySelector('[data-kind="shape"]');
      return {
        layer: Boolean(layer),
        words: text ? text.textContent : '',
        width: text ? Math.round(text.getBoundingClientRect().width) : 0,
        shape: shape ? getComputedStyle(shape).display : 'none',
      };
    });
    await page.close();
    return out;
  };
  const plain = await draw(payload({ displayName: 'Boss' }));
  assert.equal(plain.layer, true);
  assert.equal(plain.words, 'GG Boss', 'a token takes the popup words');
  assert.equal(plain.width, 100, 'the state scale (200%) does not enlarge an item');
  assert.notEqual(plain.shape, 'none');
  assert.equal((await draw(payload({ unlockRate: 2, rarityTier: 'gold' }))).shape, 'none', 'switched off for gold');
  assert.equal((await draw(payload({ bare: true }))).layer, false, 'the designer picture leaves them out');
});

test('a completion shows the theme 100% picture, a real PlayStation platinum its own trophy', { timeout: 60000 }, async (t) => {
  const { browser, userDataDir, failures } = await launchBrowser(['--allow-file-access-from-files']);
  if (!browser) return t.skip(skipReason(failures));
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-san-plat-'));
  t.after(async () => {
    await closeBrowser(browser, userDataDir);
    fs.rmSync(root, { recursive: true, force: true });
  });

  const RIBBON = PNG.replace('ADUlEQVR4', 'ADUlEQVR5');
  const theme = themeFor('ps5');
  theme.types.plat.customicons = { plat: RIBBON };
  sanEngine.writePresetFiles(root, theme, { name: 'plat' });

  const draw = async (extra) => {
    const page = await browser.newPage();
    await page.evaluateOnNewDocument(bridge);
    await page.goto(pathToFileURL(path.join(root, 'index.html')).href, { waitUntil: 'load' });
    await page.evaluate((d) => window.__aw.show(d), payload({ notificationType: 'platinum', isPlatinum: true, rarityTier: 'platinum', ...extra }));
    await page.waitForFunction(() => window.__aw.ready > 0, { timeout: 10000 });
    const drawn = await page.evaluate(() => ({
      icon: document.getElementById('achicon').getAttribute('src'),
      title: document.getElementById('title').textContent,
      desc: document.getElementById('desc').textContent,
    }));
    await page.close();
    return drawn;
  };
  const fallback = { achievementUnlocked: 'Achievement Unlocked', congratulations: 'Congratulations!', gameComplete: '100% Complete', gameCompleteDesc: 'All unlocked' };

  const plain = await draw({ fallback });
  assert.equal(plain.icon, RIBBON, 'a plain 100% shows the theme picture');
  assert.equal(plain.title, '100% Complete');
  assert.equal(plain.desc, 'All unlocked');

  const real = await draw({ fallback, realPlatinum: true, displayName: 'King of the Hill', description: 'Every trophy' });
  assert.equal(real.icon, PNG, 'a real platinum shows its own trophy icon');
  assert.equal(real.title, 'King of the Hill');
  assert.equal(real.desc, 'Every trophy');
});
