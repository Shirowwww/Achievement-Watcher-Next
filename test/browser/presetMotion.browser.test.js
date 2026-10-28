'use strict';

// A line typed out letter by letter and numbers that count up, as the popup plays them. Every
// animation is held at one moment, as the designer's timeline does, and the page read there.

const assert = require('node:assert/strict');
const path = require('node:path');
const { test } = require('node:test');
const { launchBrowser, closeBrowser, skipReason } = require('../helpers/chromium');

const appDir = path.join(__dirname, '..', '..', 'app');
const generator = require(path.join(appDir, 'util', 'customPreset.js'));

const PAYLOAD = {
  displayName: 'Hello world',
  description: 'Description',
  scale: 1,
  notificationType: 'achievement',
  rarityPercent: 12.8,
  progress: { current: 3, max: 10 },
};

const OPTIONS = {
  showRarity: true,
  canvas: {
    motion: {
      title: { enter: 'type', dur: 1000 },
      rarity: { enter: 'count', dur: 1000 },
      progress: { enter: 'count', dur: 1000 },
    },
    items: [
      { kind: 'text', text: 'Score 40/50', x: 200, y: 4, w: 200, h: 20, enter: 'count', dur: 1000 },
      { kind: 'text', text: 'Bonjour', x: 200, y: 60, w: 200, h: 20, enter: 'type', dur: 700 },
    ],
  },
};

// Plays the payload, then holds every animation it started at `ms` and lets the engine catch up.
async function playAt(page, ms) {
  return page.evaluate(
    (payload, at) => {
      window.awPreviewApply(payload);
      document.getAnimations().forEach((animation) => {
        animation.pause();
        animation.currentTime = at;
      });
      window.awMotionSync();
      const shown = (node) => [...node.querySelectorAll('.aw-ch')].filter((letter) => getComputedStyle(letter).opacity !== '0').length;
      const title = document.querySelector('.title');
      const items = [...document.querySelectorAll('.aw-canvas > [data-kind="text"]')];
      const typed = items.find((item) => item.textContent === 'Bonjour');
      return {
        title: title.textContent,
        titleLetters: title.querySelectorAll('.aw-ch').length,
        titleShown: shown(title),
        typedLetters: typed.querySelectorAll('.aw-ch').length,
        rarity: document.querySelector('.rarity').textContent,
        score: items.find((item) => item.textContent.startsWith('Score')).textContent,
        label: document.querySelector('.progress_label').textContent,
        meter: document.querySelector('.progress_meter').getBoundingClientRect().width,
        line: document.querySelector('.progress_line').getBoundingClientRect().width,
      };
    },
    PAYLOAD,
    ms
  );
}

test('a typed line shows its letters in turn and a counted one runs up to its value', { concurrency: 1, timeout: 120000 }, async (t) => {
  const { browser, userDataDir, failures } = await launchBrowser();
  if (!browser) {
    t.skip(skipReason(failures));
    return;
  }
  try {
    const page = await browser.newPage();
    // A Windows runner has its animations turned off, which the page reads as reduced motion.
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);
    const box = generator.presetBoxSize(OPTIONS);
    await page.setViewport({ width: box.width, height: box.height });
    await page.setContent(generator.buildPresetPreviewHtml(OPTIONS), { waitUntil: 'load' });

    const start = await playAt(page, 0);
    assert.equal(start.titleShown, 0, 'no letter shows before the typing starts');
    assert.equal(start.rarity, ' 0.0%', 'a count starts from zero, as wide as it ends');

    // 450 of 1000ms: 4 of the 11 letters are due (one every 1000/11ms), the eased count past 80%.
    const middle = await playAt(page, 450);
    assert.equal(middle.titleLetters, 11, 'one span per letter, cut once however often the card plays');
    assert.equal(middle.typedLetters, 7, 'an added text is typed out too');
    assert.equal(middle.titleShown, 4);
    assert.equal(middle.title, 'Hello world', 'the line reads the same once cut');
    const p = 1 - Math.pow(1 - 0.45, 3);
    assert.equal(middle.rarity, (12.8 * p).toFixed(1) + '%');
    assert.equal(middle.score, `Score ${Math.round(40 * p)}/50`, 'a total after a slash stays as it is');
    assert.equal(middle.label, `3/10 - ${Math.round(30 * p)}%`);
    assert.ok(middle.meter > 0, 'the bar is filling');

    const end = await playAt(page, 5000);
    assert.equal(end.titleShown, 11);
    assert.equal(end.rarity, '12.8%');
    assert.equal(end.score, 'Score 40/50');
    assert.equal(end.label, '3/10 - 30%');
    assert.ok(end.meter > middle.meter, `the bar ends full to its value, ${middle.meter} then ${end.meter}`);

    // Asked for less motion, the card shows everything at once and never cuts its lines.
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    const still = await playAt(page, 0);
    assert.equal(still.titleLetters, 0);
    assert.equal(still.rarity, '12.8%');
    assert.equal(still.label, '3/10 - 30%');
  } finally {
    await closeBrowser(browser, userDataDir);
  }
});
