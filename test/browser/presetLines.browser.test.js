'use strict';

// A card line with words of its own, and the box a line or an added text draws behind itself, as
// the popup shows them: the engine fills the words, the stylesheet draws the box.

const assert = require('node:assert/strict');
const path = require('node:path');
const { test } = require('node:test');
const { launchBrowser, closeBrowser, skipReason } = require('../helpers/chromium');

const appDir = path.join(__dirname, '..', '..', 'app');
const generator = require(path.join(appDir, 'util', 'customPreset.js'));

const PAYLOAD = { displayName: 'Hello world', description: 'Beat the game', scale: 1, notificationType: 'achievement', rarityPercent: 4.2, gameName: 'Halo' };

const OPTIONS = {
  showRarity: true,
  showGameName: true,
  canvas: {
    style: {
      title: { text: 'New: {title} ({rarity})' },
      detail: { text: '{tier} - {detail}' },
      rarity: { fillMode: 'none', stroke: 2, strokeColor: 'accent', radius: 0, pad: 4 },
    },
    words: { gold: 'Gold' },
    items: [
      { kind: 'text', text: '{game}', x: 200, y: 4, w: 120, h: 20, fillMode: 'solid', fill: '#112233', radius: 6, pad: 3 },
      { kind: 'text', text: '{rarity}', x: 200, y: 40, w: 60, h: 20, stroke: 2 },
    ],
  },
};

test('a line says its own words and a box is drawn behind a line or a text', { concurrency: 1, timeout: 120000 }, async (t) => {
  const { browser, userDataDir, failures } = await launchBrowser();
  if (!browser) {
    t.skip(skipReason(failures));
    return;
  }
  try {
    const page = await browser.newPage();
    const box = generator.presetBoxSize(OPTIONS);
    await page.setViewport({ width: box.width, height: box.height });
    await page.setContent(generator.buildPresetPreviewHtml(OPTIONS), { waitUntil: 'load' });
    const seen = await page.evaluate((payload) => {
      window.awPreviewApply(payload);
      const detail = document.querySelector('.detail');
      const rarity = getComputedStyle(document.querySelector('.rarity'));
      const item = getComputedStyle(document.querySelector('.aw-canvas > [data-kind="text"]'));
      return {
        title: document.querySelector('.title').textContent,
        detail: detail.textContent,
        tier: getComputedStyle(detail.querySelector('[data-tok="tier"]'), '::after').content,
        rarityRing: rarity.boxShadow,
        rarityBorder: `${rarity.borderTopWidth} ${rarity.borderTopStyle}`,
        rarityRadius: rarity.borderTopLeftRadius,
        itemBack: item.backgroundColor,
        itemPad: item.paddingLeft,
      };
    }, PAYLOAD);
    assert.equal(seen.title, 'New: Hello world (4.2%)');
    assert.equal(seen.detail, ' - Beat the game', 'the {tier} span holds no text of its own');
    assert.equal(seen.tier, '"Gold"', 'a gold unlock reads its tier word');
    assert.equal(seen.rarityRing, 'none', "the line's own outline replaces the preset's ring");
    assert.equal(seen.rarityBorder, '2px solid');
    assert.equal(seen.rarityRadius, '0px', 'square corners are kept on a line');
    assert.equal(seen.itemBack, 'rgb(17, 34, 51)');
    assert.equal(seen.itemPad, '3px');

    // A common unlock carries no rarity: the badge that only says it is not drawn.
    const common = await page.evaluate((payload) => {
      window.awPreviewApply({ ...payload, rarityPercent: null });
      const badge = [...document.querySelectorAll('.aw-canvas > [data-kind="text"]')][1];
      return { empty: badge.hasAttribute('data-empty'), visibility: getComputedStyle(badge).visibility };
    }, PAYLOAD);
    assert.deepEqual(common, { empty: true, visibility: 'hidden' });

    // The designer swaps the stylesheet alone: the title goes back to the popup's own words.
    const plain = await page.evaluate((css) => {
      document.getElementById('aw-preview-css').textContent = css;
      window.awWords();
      return document.querySelector('.title').textContent;
    }, generator.buildCustomPresetCss({ showRarity: true, showGameName: true }));
    assert.equal(plain, 'Hello world');
  } finally {
    await closeBrowser(browser, userDataDir);
  }
});
