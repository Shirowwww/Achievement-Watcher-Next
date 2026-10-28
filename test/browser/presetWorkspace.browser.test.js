'use strict';

/*
  The preset designer's workspace, laid out by a real browser (skipped with no Chromium browser).

  What only layout can show: the controls stay in the full-screen editor, the actions under the
  preview are centred, and nothing over the preview swallows the wheel.
*/

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const { sharedBrowser } = require('../helpers/chromium');

const inContext = sharedBrowser();

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
async function open(context, viewport) {
  const tab = await context.newPage();
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

/*
  Every control lives in the full-screen editor now, which moves the panel into its side column.
  Under the preview only the actions are left, centred: what you do to the design, then the
  Import/Export pair on a line of its own.
*/
test('under the preview only the actions are left, centred', (t) =>
  inContext(t, async (context) => {
    for (const size of SIZES) {
      const session = await open(context, size);
      const measured = await session.tab.evaluate(() => {
        const centreOf = (node) => {
          const box = node.getBoundingClientRect();
          return box.left + box.width / 2;
        };
        const spread = (selector) => {
          const nodes = [...document.querySelectorAll(selector)].filter((node) => node.getClientRects().length);
          const boxes = nodes.map((node) => node.getBoundingClientRect());
          return (Math.min(...boxes.map((box) => box.left)) + Math.max(...boxes.map((box) => box.right))) / 2;
        };
        const actions = document.querySelector('#pd-actions');
        return {
          controlsShown: document.querySelector('.pd-workspace > .pd-controls').getClientRects().length > 0,
          actionsCentre: centreOf(actions),
          primaryCentre: spread('.pd-actions-primary > .inline-action-btn'),
          filesCentre: centreOf(document.querySelector('.pd-file-pair')),
          filesBelow: document.querySelector('.pd-actions-files').getBoundingClientRect().top > document.querySelector('#btn-create-preset').getBoundingClientRect().bottom,
        };
      });
      const where = `${size.width}x${size.height}`;

      assert.equal(measured.controlsShown, false, `${where}: the controls are back under the preview`);
      assert.ok(Math.abs(measured.primaryCentre - measured.actionsCentre) < 2, `${where}: Create, Preview and Reset are not centred`);
      assert.ok(Math.abs(measured.filesCentre - measured.actionsCentre) < 2, `${where}: Import and Export are not centred`);
      assert.equal(measured.filesBelow, true, `${where}: Import and Export left their own line`);

      await session.close();
    }
  }));

/*
  Where the popup lands and how big it is only change the picture in the Screen view - layoutPreview
  applies the user scale there and nowhere else. Outside it they are hidden rather than sitting
  there inert, the same way the resolution picker beside them already was.
*/
test('placement is offered only where it changes the picture', (t) =>
  inContext(t, async (context) => {
    const session = await open(context, SIZES[0]);
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
    const designerJs = fs.readFileSync(path.join(appDir, 'ui', 'presetDesigner.js'), 'utf8');
    assert.match(designerJs, /\$\('#pd-placement'\)\.prop\('hidden', previewView !== 'screen'\)/);
  }));

/*
  The panel scrolls wherever the pointer is.

  `.right` is a layout class as much as a kind of row, and the designer's action rows carry it - so a
  wheel handler that called preventDefault for anything wearing it made the tab refuse to scroll
  whenever the pointer was over the bottom of the card, which is where those rows are. The preview
  iframes were the other half: an iframe under the pointer swallows a wheel even with scrolling="no",
  and the preview is pinned across the top of the panel now, so it is the easiest thing to be over.
*/
test('the wheel scrolls the panel wherever the pointer is', (t) =>
  inContext(t, async (context) => {
    const session = await open(context, { width: 1300, height: 800 });

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
      // The panel builds this frame on first use, so build it the same way here: what is under test is
      // the stylesheet that takes it out of hit testing, not who created it.
      const wrap = document.querySelector('#pd-frame-wrap');
      let frame = wrap.querySelector('iframe');
      if (!frame) {
        frame = document.createElement('iframe');
        frame.id = 'pd-frame';
        wrap.appendChild(frame);
      }
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
  }));
