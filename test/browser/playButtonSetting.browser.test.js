'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { launchBrowser, closeBrowser, skipReason } = require('../helpers/chromium');

const appDir = path.join(__dirname, '..', '..', 'app');
const libraryLayout = require(path.join(appDir, 'util', 'libraryLayout.js'));
const css = fs.readFileSync(path.join(appDir, 'resources', 'css', 'app.css'), 'utf8').replace(/<\/style/gi, '<\\/style');

const harness = `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>
  <div id="game-list"><ul><li><div class="game-box">
    <div class="header"><button type="button" class="play-button"><i class="fas fa-play"></i></button></div>
    <button type="button" class="achievement-button"></button>
    <button type="button" class="config-button"></button>
    <div class="info"><div class="info-head"><div class="title">Example game</div></div><div class="progressBar"></div></div>
  </div></li></ul></div>
</body></html>`;

test('hiding the Play button leaves every library card layout unchanged', async (t) => {
  const { browser, userDataDir, failures } = await launchBrowser();
  if (!browser) {
    t.skip(skipReason(failures));
    return;
  }

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 800 });
    await page.setContent(harness, { waitUntil: 'load' });

    /*
      The card is `content-visibility: auto` with `contain-intrinsic-size: auto`, so after a layout
      class change it keeps reporting its remembered size until a rendering update has re-laid the
      skipped subtree out. A fixed wait cannot know when that happened: two frames was one frame
      short of the four this card actually takes, so the two states were read at different points of
      the same settling and differed by the width of the button being measured. Waiting until the
      boxes stop moving reads both states fully settled, whatever the engine's frame budget.
    */
    const measure = async (layout, hidePlay) =>
      page.evaluate(
        ([mode, hide]) =>
          new Promise((resolve, reject) => {
            const list = document.querySelector('#game-list');
            list.className = `view-${mode}`;
            list.classList.toggle('hide-play-button', hide);

            const rect = (node) => {
              const value = node.getBoundingClientRect();
              return { x: value.x, y: value.y, width: value.width, height: value.height };
            };
            const read = () => ({
              display: getComputedStyle(document.querySelector('.play-button')).display,
              card: rect(document.querySelector('.game-box')),
              header: rect(document.querySelector('.header')),
              info: rect(document.querySelector('.info')),
            });

            // Three identical frames in a row: enough that a value still being resolved cannot pass,
            // cheap enough that a settled card costs a handful of frames.
            const SETTLED_FRAMES = 3;
            const MAX_FRAMES = 240;
            let previous = null;
            let identical = 0;
            let frames = 0;
            const tick = () => {
              const current = read();
              const signature = JSON.stringify([current.card, current.header, current.info]);
              identical = previous === signature ? identical + 1 : 0;
              previous = signature;
              if (identical >= SETTLED_FRAMES) return resolve(current);
              if (++frames > MAX_FRAMES) return reject(new Error(`${mode}: layout never settled`));
              requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
          }),
        [layout, hidePlay]
      );

    for (const mode of libraryLayout.MODES) {
      const shown = await measure(mode, false);
      const hidden = await measure(mode, true);

      // A skipped subtree would make every box below match at 0x0, which proves nothing.
      assert.ok(shown.header.width > 0 && shown.header.height > 0, `${mode}: the card must be rendered before it is measured`);
      assert.notEqual(shown.display, 'none', `${mode}: enabled must show the Play button`);
      assert.equal(hidden.display, 'none', `${mode}: disabled must hide the Play button`);
      assert.deepEqual(hidden.card, shown.card, `${mode}: the card box must not move`);
      assert.deepEqual(hidden.header, shown.header, `${mode}: the artwork box must not move`);
      assert.deepEqual(hidden.info, shown.info, `${mode}: the remaining content must not move`);
    }
  } finally {
    await closeBrowser(browser, userDataDir);
  }
});
