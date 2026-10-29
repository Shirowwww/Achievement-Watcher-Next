'use strict';

/*
  Any line of text cut with an ellipsis scrolls to its end while the pointer rests on it: a plain
  span, the value of a select, and text inside a shadow root (the title bar is a custom element).
  Text that fits never moves.
*/

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { launchBrowser, closeBrowser, skipReason } = require('../helpers/chromium');

const appDir = path.join(__dirname, '..', '..', 'app');
const marquee = fs.readFileSync(path.join(appDir, 'ui', 'textMarquee.js'), 'utf8');

const LONG = 'A very long line of text that cannot fit in its box';
const cut = 'display:inline-block;width:90px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font:14px sans-serif';
const harness = `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:20px">
  <div><span id="cut" style="${cut}">${LONG}</span></div>
  <div><span id="fits" style="${cut};width:400px">Short</span></div>
  <div><select id="select" style="width:120px;padding:0 24px 0 8px;font:14px sans-serif"><option>${LONG}</option></select></div>
  <div><shadow-host id="host"></shadow-host></div>
  <script>
    customElements.define('shadow-host', class extends HTMLElement {
      constructor() {
        super();
        this.attachShadow({ mode: 'open' }).innerHTML = '<span id="inner" style="${cut}">${LONG}</span><span id="beside" style="display:inline-block;width:60px">x</span>';
      }
    });
  </script>
</body></html>`;

// Past the rest at the start of a cycle, so a marquee that runs has visibly moved.
const SETTLE_MS = 1600;

const offsetOf = (page, read) => page.evaluate(read);

test('cut text scrolls on hover wherever it is, and text that fits stays still', async (t) => {
  const { browser, userDataDir, failures } = await launchBrowser();
  if (!browser) {
    t.skip(skipReason(failures));
    return;
  }

  try {
    const page = await browser.newPage();
    // Windows runners report reduced motion, which turns the marquee into a tooltip.
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);
    await page.setContent(harness, { waitUntil: 'load' });
    await page.addScriptTag({ content: marquee });

    const hoverAndRead = async (selector, read) => {
      await page.mouse.move(0, 0);
      const box = await page.evaluate((sel) => {
        const el = sel === '#inner' ? document.querySelector('#host').shadowRoot.querySelector('#inner') : document.querySelector(sel);
        const rect = el.getBoundingClientRect();
        return { x: rect.x + 10, y: rect.y + rect.height / 2 };
      }, selector);
      await page.mouse.move(box.x, box.y);
      await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
      return offsetOf(page, read);
    };

    assert.ok((await hoverAndRead('#cut', () => document.querySelector('#cut').scrollLeft)) > 0, 'a cut span scrolls');
    assert.equal(await hoverAndRead('#fits', () => document.querySelector('#fits').scrollLeft), 0, 'text that fits stays still');
    assert.match(await hoverAndRead('#select', () => document.querySelector('#select').style.textIndent), /^-\d+px$/, 'a cut select value shifts');
    assert.ok(
      (await hoverAndRead('#inner', () => document.querySelector('#host').shadowRoot.querySelector('#inner').scrollLeft)) > 0,
      'cut text inside a shadow root scrolls'
    );

    // Moving to a neighbour inside the same shadow root: the document hears nothing of it.
    const beside = await page.evaluate(() => {
      const rect = document.querySelector('#host').shadowRoot.querySelector('#beside').getBoundingClientRect();
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    });
    await page.mouse.move(beside.x, beside.y);
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(await offsetOf(page, () => document.querySelector('#host').shadowRoot.querySelector('#inner').scrollLeft), 0, 'leaving puts it back');
  } finally {
    await closeBrowser(browser, userDataDir);
  }
});
