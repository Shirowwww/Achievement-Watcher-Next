'use strict';

/*
  The preset designer's workspace, laid out by a real browser (skipped with no Chromium browser).

  Two claims here can only be measured. The popup has to stay on screen while sixty properties scroll
  under it - the whole panel is "change this, look at that", and a slider whose effect has scrolled
  away is a slider you cannot use. And the controls have to get the width the card actually has: the
  workspace was two columns of roughly 330px inside a 690px card, which broke the preview toolbar
  onto three lines, put every control in a 150px cell, and left the whole area below the preview
  empty because the controls are five times taller than it.
*/

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const { launchBrowser, closeBrowser, skipReason } = require('../helpers/chromium');

const root = path.join(__dirname, '..', '..');
const appDir = path.join(root, 'app');
const html = fs.readFileSync(path.join(appDir, 'view', 'app.html'), 'utf8');

// The Presets tab, taken out of app.html rather than rewritten, so a change to the markup is
// measured rather than missed.
function designerMarkup() {
  const start = html.indexOf('<section class="content" data-view="presets">');
  assert.ok(start > -1, 'the Presets tab is gone from app.html');
  const end = html.indexOf('\n            </section>', start);
  assert.ok(end > start, 'the Presets tab has no end');
  return html.slice(start, end).replace(/style="display: none"/g, '');
}

function page() {
  return `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="../resources/css/normalize.css">
<link rel="stylesheet" href="../resources/css/fontawesome.css">
<link rel="stylesheet" href="../resources/css/app.css">
<style>
  body { margin: 0; }
  /* The Settings modal on the Presets tab, at the widths the real window gives it. */
  #settings { display: block !important; position: static; }
  #settings .box { display: block !important; position: static; transform: none; margin: 0 auto; }
  #settings .box .content { display: block !important; }
</style></head><body>
  <section id="settings"><div class="box"><div class="container">
    <ul id="settingNav"><li data-view="presets"><span>Presets</span></li></ul>
    ${designerMarkup()}
  </div></div></section>
</body></html>`;
}

// The page has to be a real file: the stylesheets and their fonts are relative to app/view.
async function open(browser, viewport) {
  const tab = await browser.newPage();
  await tab.setViewport(viewport);
  const file = path.join(appDir, 'view', `__workspace-${viewport.width}x${viewport.height}.html`);
  fs.writeFileSync(file, page(), 'utf8');
  await tab.goto(require('node:url').pathToFileURL(file).href, { waitUntil: 'load' });
  // Every group open, so the controls are genuinely taller than the pane - which is the only state
  // in which staying visible means anything.
  await tab.evaluate(() => document.querySelectorAll('.pd-group').forEach((group) => group.classList.add('is-open')));
  await new Promise((resolve) => setTimeout(resolve, 250));
  return {
    tab,
    async close() {
      await tab.close();
      fs.unlinkSync(file);
    },
  };
}

const SIZES = [
  { width: 1300, height: 800 },
  // The app's own minimum window.
  { width: 900, height: 600 },
  { width: 1920, height: 1080 },
];

test('the popup stays on screen while the controls scroll under it', async (t) => {
  const { browser, userDataDir, failures } = await launchBrowser();
  if (!browser) return t.skip(skipReason(failures));
  t.after(() => closeBrowser(browser, userDataDir));

  for (const size of SIZES) {
    const session = await open(browser, size);
    const measured = await session.tab.evaluate(() => {
      const pane = document.querySelector('#settings .box .content');
      const preview = document.querySelector('.pd-preview');
      const paneBox = pane.getBoundingClientRect();
      const scrollable = pane.scrollHeight - pane.clientHeight;
      pane.scrollTop = scrollable; // all the way down: the worst case for staying visible
      const after = preview.getBoundingClientRect();
      return {
        scrollable,
        position: getComputedStyle(preview).position,
        visible: after.bottom > paneBox.top + 1 && after.top < paneBox.bottom - 1,
        showing: Math.round(Math.min(after.bottom, paneBox.bottom) - Math.max(after.top, paneBox.top)),
        height: Math.round(after.height),
        paneHeight: Math.round(paneBox.height),
        // An opaque background, or the controls passing under it would be read through the stage.
        background: getComputedStyle(preview).backgroundColor,
      };
    });
    const where = `${size.width}x${size.height}`;

    assert.ok(measured.scrollable > 200, `${where}: nothing scrolled, so this proves nothing`);
    assert.equal(measured.position, 'sticky', `${where}: the preview is not pinned`);
    assert.equal(measured.visible, true, `${where}: the preview scrolled out of the pane`);
    assert.ok(measured.showing >= measured.height - 2, `${where}: only ${measured.showing}px of a ${measured.height}px preview is in view`);
    assert.ok(!/rgba\(0, 0, 0, 0\)/.test(measured.background), `${where}: the pinned preview is transparent (${measured.background})`);
    /*
      Pinned means its height is taken from the controls for good, so it must leave something to
      scroll. Two thirds rather than a half: the toolbar and the backdrop row under the stage are a
      fixed cost of about 90px, and on the smallest window the whole pane is only 394px - so a popup
      big enough to judge legitimately takes most of it there, and the share only improves as the
      window grows. What this guards against is a preview that leaves no controls at all.
    */
    assert.ok(measured.height < measured.paneHeight * 0.7, `${where}: the preview takes ${measured.height}px of a ${measured.paneHeight}px pane`);
    assert.ok(measured.paneHeight - measured.height > 110, `${where}: only ${measured.paneHeight - measured.height}px is left for the controls`);

    await session.close();
  }
});

/*
  One column, at every size. The card is about 690px however wide the window is, so a second column
  can only ever halve what the controls get - and it did.
*/
test('the controls get the width the card has', async (t) => {
  const { browser, userDataDir, failures } = await launchBrowser();
  if (!browser) return t.skip(skipReason(failures));
  t.after(() => closeBrowser(browser, userDataDir));

  for (const size of SIZES) {
    const session = await open(browser, size);
    const measured = await session.tab.evaluate(() => {
      // The card, not the workspace: the workspace is display: contents and has no box to measure.
      const card = document.querySelector('.pd-controls').closest('li');
      const controls = document.querySelector('.pd-controls');
      const preview = document.querySelector('.pd-preview');
      const toolbar = document.querySelector('.pd-toolbar');
      const buttons = [...toolbar.children].map((node) => node.getBoundingClientRect().top);
      return {
        cardWidth: Math.round(card.clientWidth),
        controlsWidth: Math.round(controls.getBoundingClientRect().width),
        // Stacked, not side by side.
        stacked: controls.getBoundingClientRect().top >= preview.getBoundingClientRect().top,
        // How many lines the preview toolbar takes.
        toolbarLines: new Set(buttons.map((top) => Math.round(top))).size,
        workspaceDisplay: getComputedStyle(document.querySelector('.pd-workspace')).display,
      };
    });
    const where = `${size.width}x${size.height}`;

    assert.equal(measured.stacked, true, `${where}: the controls sit beside the preview again`);
    assert.ok(
      measured.controlsWidth >= measured.cardWidth - 44,
      `${where}: the controls get ${measured.controlsWidth}px of a ${measured.cardWidth}px card`
    );
    assert.equal(measured.workspaceDisplay, 'contents', `${where}: the workspace grew a box again, which would cut the sticky preview short`);
    assert.ok(measured.toolbarLines <= 2, `${where}: the preview toolbar broke onto ${measured.toolbarLines} lines`);

    await session.close();
  }
});

/*
  Where the popup lands and how big it is only change the picture in the Screen view - layoutPreview
  applies the user scale there and nowhere else. Outside it they are hidden rather than sitting
  there inert, the same way the resolution picker beside them already was.
*/
test('placement is offered only where it changes the picture', async (t) => {
  const { browser, userDataDir, failures } = await launchBrowser();
  if (!browser) return t.skip(skipReason(failures));
  t.after(() => closeBrowser(browser, userDataDir));

  const session = await open(browser, SIZES[0]);
  const placement = await session.tab.evaluate(() => {
    const node = document.querySelector('#pd-placement');
    return { exists: Boolean(node), hidden: node ? node.hasAttribute('hidden') : null, holdsAnchors: Boolean(node && node.querySelector('#pd-anchors')), holdsScale: Boolean(node && node.querySelector('#pd-scale')) };
  });
  assert.equal(placement.exists, true, 'the placement group is gone');
  assert.equal(placement.holdsAnchors, true, 'the position grid must be inside it');
  assert.equal(placement.holdsScale, true, 'and the scale picker with it');
  assert.equal(placement.hidden, true, 'the card view opens first, so placement starts folded away');
  await session.close();

  // And the renderer is what un-hides it, on the one view it applies to.
  const settings = fs.readFileSync(path.join(appDir, 'ui', 'settings.js'), 'utf8');
  assert.match(settings, /\$\('#pd-placement'\)\.prop\('hidden', previewView !== 'screen'\)/);
});

/*
  The panel scrolls wherever the pointer is.

  `.right` is a layout class as much as a kind of row, and the designer's action rows carry it - so a
  wheel handler that called preventDefault for anything wearing it made the tab refuse to scroll
  whenever the pointer was over the bottom of the card, which is where those rows are. The preview
  iframes were the other half: an iframe under the pointer swallows a wheel even with scrolling="no",
  and the preview is pinned across the top of the panel now, so it is the easiest thing to be over.
*/
test('the wheel scrolls the panel wherever the pointer is', async (t) => {
  const { browser, userDataDir, failures } = await launchBrowser();
  if (!browser) return t.skip(skipReason(failures));
  t.after(() => closeBrowser(browser, userDataDir));

  const session = await open(browser, { width: 1300, height: 800 });

  // The rows that are not steppers must not be treated as ones. Read off the handler rather than
  // simulated, because the handler lives in a renderer that cannot be loaded outside Electron.
  const settings = fs.readFileSync(path.join(appDir, 'ui', 'settings.js'), 'utf8');
  const handler = settings.slice(settings.indexOf("$('#settings .arrow-list .right').on('wheel'"));
  const body = handler.slice(0, handler.indexOf('\n    });'));
  assert.match(body, /if \(!stepper\.length\) return;/, 'a row with no arrows must let the wheel through');
  assert.ok(
    body.indexOf('if (!stepper.length) return;') < body.indexOf('preventDefault'),
    'the early return has to come before preventDefault, or the scroll is already cancelled'
  );

  // And the previews are out of hit testing, so a wheel over them reaches the panel.
  const measured = await session.tab.evaluate(() => {
    const frame = document.querySelector('#pd-frame');
    const actions = document.querySelector('#pd-actions');
    return {
      framePointer: getComputedStyle(frame).pointerEvents,
      // The action row really does carry the class that used to swallow the wheel: if it stopped
      // doing so this test would be guarding nothing.
      actionsCarryRight: actions.classList.contains('right'),
      hasArrows: Boolean(actions.querySelector('.previous, .next')),
    };
  });
  assert.equal(measured.framePointer, 'none', 'the preview must not take the pointer');
  assert.equal(measured.actionsCarryRight, true, 'the action row no longer carries .right - this test is stale');
  assert.equal(measured.hasArrows, false, 'the action row has no arrows, so the wheel must pass through it');

  await session.close();
});
