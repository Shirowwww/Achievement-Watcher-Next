'use strict';

// A layer is inserted after a bundled preset's own stylesheet, with no knowledge of how that preset
// was drawn. That only counts as supported if it visibly works on every preset that is offered, so
// each of them is loaded as it ships (its own index.html and style.css) and the overrides are read
// back from the browser.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { test, before, after } = require('node:test');
const { launchBrowser, closeBrowser, skipReason } = require('../helpers/chromium');

const appDir = path.join(__dirname, '..', '..', 'app');
const layerTool = require(path.join(appDir, 'util', 'presetLayer.js'));

const PRESETS_DIR = path.join(appDir, 'presets', 'Default Presets');
const layerable = fs.readdirSync(PRESETS_DIR).filter((name) => layerTool.isLayerableHtml(fs.readFileSync(path.join(PRESETS_DIR, name, 'index.html'), 'utf8')));

const SAMPLE_IMAGE =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

// The font and logo live in the layer's own folder, away from the bundled page, and are addressed by
// file URL exactly as the popup does it: the page must be allowed to load them from there.
const LAYER_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'aw layer assets-'));
fs.copyFileSync(path.join(PRESETS_DIR, 'PlayStation', 'SST.ttf'), path.join(LAYER_DIR, 'Face.ttf'));
fs.writeFileSync(path.join(LAYER_DIR, 'mark.png'), Buffer.from(SAMPLE_IMAGE.split(',')[1], 'base64'));

let shared = null;
before(async () => {
  shared = await launchBrowser();
});
after(async () => {
  if (shared && shared.browser) await closeBrowser(shared.browser, shared.userDataDir);
  fs.rmSync(LAYER_DIR, { recursive: true, force: true });
});

const LAYER = {
  base: 'x',
  sections: layerTool.LAYER_SECTION_NAMES,
  options: {
    bgMode: 'solid',
    bg: '#123456',
    text: '#fedcba',
    accent: '#00ff88',
    borderWidth: 3,
    borderColor: '#ff0099',
    glow: 80,
    fontFamily: 'mono',
    fontFile: 'Face.ttf',
    logoImage: 'mark.png',
    logoPosition: 'bottom-right',
    logoSize: 28,
    logoOffset: 5,
  },
};

const assetUrl = (name) => layerTool.layerAssetFileUrl(LAYER_DIR, name);

// Loads the bundled page itself, optionally with the layer applied the way the app does it.
async function render(page, presetName, layer) {
  const html = path.join(PRESETS_DIR, presetName, 'index.html');
  await page.evaluateOnNewDocument(() => {
    window.api = {
      onNotification(callback) {
        window.__send = callback;
      },
      notificationRenderReady() {},
      closeNotificationWindow() {},
    };
  });
  await page.setViewport({ width: 520, height: 220 });
  await page.goto(pathToFileURL(html).href, { waitUntil: 'load' });
  if (layer) {
    const css = layerTool.buildLayerCss(layer, { assetUrl });
    if (css) await page.addStyleTag({ content: css });
    if (layerTool.layerHasLogo(layer)) await page.evaluate(layerTool.LAYER_LOGO_SCRIPT);
  }
  await page.evaluate((image) => {
    window.__send({ displayName: 'Title', description: 'Description', gameName: 'Game', iconPath: image, notificationType: 'achievement', rarityPercent: null, scale: 1 });
  }, SAMPLE_IMAGE);
  await page.evaluate(async () => {
    const entry = document.getAnimations().find((animation) => animation.animationName && animation.animationName.endsWith('in'));
    if (entry) await entry.finished.catch(() => {});
    else await new Promise((resolve) => setTimeout(resolve, 900));
    await document.fonts.ready;
  });
  return page.evaluate((className) => {
    const card = document.querySelector('.ach');
    const cardStyle = getComputedStyle(card);
    const title = getComputedStyle(document.querySelector('.title'));
    const logo = document.querySelector('.' + className);
    const logoStyle = logo ? getComputedStyle(logo) : null;
    const rect = card.getBoundingClientRect();
    const logoRect = logo ? logo.getBoundingClientRect() : null;
    return {
      background: cardStyle.backgroundColor + ' | ' + cardStyle.backgroundImage,
      backgroundColor: cardStyle.backgroundColor,
      backgroundImage: cardStyle.backgroundImage,
      borderTop: cardStyle.borderTopWidth,
      borderColor: cardStyle.borderTopColor,
      boxShadow: cardStyle.boxShadow,
      color: cardStyle.color,
      fontFamily: cardStyle.fontFamily,
      titleFont: title.fontFamily,
      titleColor: title.color,
      accent: cardStyle.getPropertyValue('--accent').trim(),
      fontLoaded: document.fonts.check('16px "AW Layer Font"'),
      logoImage: logoStyle ? logoStyle.backgroundImage : '',
      logoInside: logoRect ? logoRect.right <= rect.right + 0.5 && logoRect.bottom <= rect.bottom + 0.5 && logoRect.left >= rect.left - 0.5 && logoRect.top >= rect.top - 0.5 : false,
      logoHeight: logoRect ? Math.round(logoRect.height) : 0,
      cardWidth: Math.round(rect.width),
    };
  }, layerTool.LAYER_LOGO_CLASS);
}

test('every preset the app offers to customise visibly takes every override', { concurrency: 1, timeout: 300000 }, async (t) => {
  if (!shared.browser) {
    t.skip(skipReason(shared.failures));
    return;
  }
  assert.ok(layerable.length >= 5, `only ${layerable.length} bundled presets run the shared engine`);

  for (const name of layerable) {
    await t.test(name, async () => {
      const page = await shared.browser.newPage();
      try {
        const plain = await render(page, name, null);
        const page2 = await shared.browser.newPage();
        try {
          const layered = await render(page2, name, LAYER);

          assert.equal(layered.backgroundColor, 'rgb(18, 52, 86)', 'background colour');
          assert.equal(layered.backgroundImage, 'none', 'the preset’s own background image/gradient is still painted');
          assert.equal(layered.borderTop, '3px', 'border width');
          assert.equal(layered.borderColor, 'rgb(255, 0, 153)', 'border colour');
          assert.equal(layered.color, 'rgb(254, 220, 186)', 'text colour');
          assert.equal(layered.accent, '#00ff88', 'accent');
          assert.match(layered.fontFamily, /^"AW Layer Font"/, 'font family');
          assert.match(layered.titleFont, /^"AW Layer Font"/, 'the title keeps its own font');
          assert.equal(layered.fontLoaded, true, 'font file');
          assert.match(layered.boxShadow, /color\(srgb 0 1 0\.53/, 'glow in the accent colour');
          assert.match(layered.logoImage, /^url\("file:\/\/\/.*mark\.png"\)$/, 'logo picture');
          assert.equal(layered.logoHeight, 28, 'logo size');
          assert.equal(layered.logoInside, true, 'the logo is drawn outside the card');
          assert.equal(layered.cardWidth, plain.cardWidth, 'the layer changed the size of the card');
          assert.notEqual(plain.background, layered.background, 'the baseline already looked like the override');
        } finally {
          await page2.close();
        }
      } finally {
        await page.close();
      }
    });
  }
});

test('a layer with every section off leaves the bundled preset exactly as it ships', { timeout: 120000 }, async (t) => {
  if (!shared.browser) {
    t.skip(skipReason(shared.failures));
    return;
  }
  const name = layerable[0];
  // One page at a time: a page in the background does not run its animations.
  const once = async (layer) => {
    const page = await shared.browser.newPage();
    try {
      const result = await render(page, name, layer);
      delete result.logoImage;
      return result;
    } finally {
      await page.close();
    }
  };
  const plain = await once(null);
  const empty = await once({ base: name, sections: [], options: LAYER.options });
  assert.deepEqual(empty, plain);
});
