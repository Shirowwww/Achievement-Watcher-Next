'use strict';

/*
  The theme import modal at the smallest window the app allows (skipped with no Chromium browser).

  app/package.json sets the window minimum at 900x600, and the modal was sized only by its content:
  a 960x600 sample scaled to the modal's width was taller than the window it sat in, so the palette,
  the note and the two buttons that decide the import were below the bottom edge. Nothing about that
  is visible to a test that reads the stylesheet, so this one lays the modal out and measures it.
*/

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const { launchBrowser, closeBrowser, skipReason } = require('../helpers/chromium');

const root = path.join(__dirname, '..', '..');
const appDir = path.join(root, 'app');
const css = fs.readFileSync(path.join(appDir, 'resources', 'css', 'app.css'), 'utf8');
const { DESIGN } = require(path.join(appDir, 'util', 'themeMock.js'));

// The window minimum the app enforces. Read rather than repeated, so raising it fails this instead
// of quietly making the test easier.
const MINIMUM = (() => {
  const manifest = JSON.parse(fs.readFileSync(path.join(appDir, 'package.json'), 'utf8'));
  const window = manifest.config.window;
  return { width: window.minWidth, height: window.minHeight };
})();

// The modal, exactly as app.html declares it, with the meta list an average theme fills in.
const META = [
  ['Name', 'Harbour Lights'],
  ['By', 'someone'],
  ['Description', 'A cool blue theme built around the colours of the harbour at dusk.'],
  ['Version', '1.2.0'],
  ['Tags', 'blue, calm, dark'],
  ['Palette', '<span class="theme-preview-swatches"><i></i><i></i><i></i><i></i><i></i></span>'],
  ['Images', '3 (240 KB)'],
  ['Requires', 'Any version'],
];

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><style>
  ${css}
  body { margin: 0; }
  /* The modal is hidden until an import is being decided on; this is that state. */
  #theme-preview { display: block; }
</style></head><body>
<section id="theme-preview" aria-hidden="false">
  <div class="overlay"></div>
  <div class="box">
    <div class="header"><i class="fas fa-palette"></i> <span>Imported theme</span><span></span></div>
    <div class="container">
      <div class="theme-preview-frame"><iframe id="theme-preview-frame" tabindex="-1" scrolling="no" title="theme preview"></iframe></div>
      <dl id="theme-preview-meta" class="theme-preview-meta">${META.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>
      <p id="theme-preview-note" class="theme-preview-note">Nothing is installed until you confirm.</p>
    </div>
    <div class="theme-preview-actions">
      <button type="button" id="theme-preview-cancel" class="btn secondary"><i class="fas fa-times"></i> <span>Cancel</span></button>
      <button type="button" id="theme-preview-apply" class="btn"><i class="fas fa-check"></i> <span>Import and apply</span></button>
    </div>
  </div>
</section>
</body></html>`;

// What ui/settings.js fitThemePreview() writes onto the wrapper. Repeated here rather than imported
// because the renderer cannot be loaded outside Electron; the shape is pinned by themeLibrary.test.js.
async function layout(page, size) {
  await page.setViewport(size);
  await page.setContent(PAGE, { waitUntil: 'domcontentloaded' });
  return page.evaluate((design) => {
    const wrap = document.querySelector('#theme-preview .theme-preview-frame');
    wrap.style.setProperty('--theme-preview-w', String(design.width));
    wrap.style.setProperty('--theme-preview-h', String(design.height));
    wrap.style.setProperty('--theme-preview-ratio', String(design.width / design.height));
    wrap.style.setProperty('--theme-preview-scale', String(wrap.clientWidth / design.width));

    const box = document.querySelector('#theme-preview .box').getBoundingClientRect();
    const actions = document.querySelector('#theme-preview .theme-preview-actions').getBoundingClientRect();
    const header = document.querySelector('#theme-preview .box .header').getBoundingClientRect();
    const container = document.querySelector('#theme-preview .box .container');
    const frame = wrap.getBoundingClientRect();
    return {
      box: { top: box.top, bottom: box.bottom, left: box.left, right: box.right, width: box.width },
      actions: { top: actions.top, bottom: actions.bottom },
      header: { top: header.top },
      frame: { width: frame.width, height: frame.height },
      scrolls: container.scrollHeight > container.clientHeight + 1,
      viewport: { width: innerWidth, height: innerHeight },
      // The modal reserves the custom title bar's 30px, so "inside the window" starts there.
      top: parseFloat(getComputedStyle(document.getElementById('theme-preview')).top) || 0,
      bodyOverflows: document.documentElement.scrollWidth > innerWidth + 1,
    };
  }, design());
}

function design() {
  return { width: DESIGN.width, height: DESIGN.height };
}

test('the whole modal fits inside the smallest window the app allows', async (t) => {
  const { browser, userDataDir, failures } = await launchBrowser();
  if (!browser) return t.skip(skipReason(failures));
  t.after(() => closeBrowser(browser, userDataDir));

  const page = await browser.newPage();
  const measured = await layout(page, MINIMUM);

  assert.ok(measured.header.top >= measured.top - 1, `the header starts above the modal area (${measured.header.top})`);
  assert.ok(
    measured.actions.bottom <= measured.viewport.height,
    `Cancel and Import are below the bottom edge (${measured.actions.bottom} > ${measured.viewport.height})`
  );
  assert.ok(measured.box.left >= 0 && measured.box.right <= measured.viewport.width, 'the modal runs off the side');
  assert.equal(measured.bodyOverflows, false, 'the page scrolls sideways');

  await page.close();
});

/*
  The sample keeps its proportions at every size. The framing is what a gallery card promises, so a
  picture that is shorter but also narrower is right and one that is squashed is not.
*/
test('the sample is scaled, never squashed', async (t) => {
  const { browser, userDataDir, failures } = await launchBrowser();
  if (!browser) return t.skip(skipReason(failures));
  t.after(() => closeBrowser(browser, userDataDir));

  const page = await browser.newPage();
  const ratio = DESIGN.width / DESIGN.height;
  for (const size of [MINIMUM, { width: 1300, height: 800 }, { width: 1920, height: 1080 }]) {
    const measured = await layout(page, size);
    const actual = measured.frame.width / measured.frame.height;
    assert.ok(
      Math.abs(actual - ratio) < 0.02,
      `at ${size.width}x${size.height} the sample is ${actual.toFixed(3)} rather than ${ratio.toFixed(3)}`
    );
    assert.ok(measured.frame.width > 260, `at ${size.width}x${size.height} the sample is too small to judge a theme by`);
  }

  await page.close();
});

// Header and actions are pinned and only the middle scrolls, so a window too short for everything
// still shows the decision rather than hiding it below the fold.
test('a window too short for the detail scrolls the detail, not the buttons', async (t) => {
  const { browser, userDataDir, failures } = await launchBrowser();
  if (!browser) return t.skip(skipReason(failures));
  t.after(() => closeBrowser(browser, userDataDir));

  const page = await browser.newPage();
  // Below anything the app itself allows: this is about the modal's own behaviour when the detail
  // genuinely does not fit, not about a window size a user can reach.
  const measured = await layout(page, { width: MINIMUM.width, height: 300 });

  assert.ok(measured.scrolls, 'nothing scrolled, so this window was not short enough to prove anything');
  assert.ok(
    measured.actions.bottom <= measured.viewport.height,
    `the buttons still have to be reachable (${measured.actions.bottom} > ${measured.viewport.height})`
  );
  assert.ok(measured.actions.top >= measured.header.top, 'the buttons must stay under the header');

  await page.close();
});
