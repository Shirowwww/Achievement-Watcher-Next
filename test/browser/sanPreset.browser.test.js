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
const { removeBrowserProfile } = require('../helpers/browserProfileCleanup');

const appDir = path.join(__dirname, '..', '..', 'app');
const puppeteer = require(path.join(appDir, 'node_modules', 'puppeteer-core'));
const engine = require(path.join(appDir, 'util', 'sanEngine', 'engine.js'));
const sanEngine = require(path.join(appDir, 'util', 'sanEngine', 'index.js'));

function findBrowser() {
  return [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    path.join(process.env['ProgramFiles(x86)'] || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(process.env.ProgramFiles || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(process.env.ProgramFiles || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
  ]
    .filter(Boolean)
    .find((file) => fs.existsSync(file));
}

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
  const executablePath = findBrowser();
  if (!executablePath) return t.skip('no Chromium-based browser installed');
  const cards = engine.LAYOUT_IDS.filter((id) => fs.existsSync(path.join(appDir, 'util', 'sanEngine', 'layouts', `${id}.html`)));
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-san-page-'));
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-san-browser-'));
  const browser = await puppeteer.launch({ executablePath, headless: true, userDataDir, args: ['--no-sandbox', '--disable-gpu', '--allow-file-access-from-files'] });
  t.after(async () => {
    await browser.close().catch(() => {});
    await removeBrowserProfile(userDataDir);
    fs.rmSync(root, { recursive: true, force: true });
  });

  for (const card of cards) {
    const dir = path.join(root, card);
    fs.mkdirSync(dir);
    sanEngine.writePresetFiles(dir, themeFor(card), { name: card });
    const states = [
      ['main', payload({})],
      ['semi', payload({ unlockRate: 12, rarityTier: 'bronze' })],
      ['rare', payload({ unlockRate: 3, rarityTier: 'gold', hidden: true })],
      ['plat', payload({ notificationType: 'platinum', isPlatinum: true, rarityTier: 'platinum' })],
    ];
    for (const [state, data] of states) {
      const page = await browser.newPage();
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
      await page.close();
    }
  }
  assert.ok(cards.includes('default'), 'the default card is missing');
});
