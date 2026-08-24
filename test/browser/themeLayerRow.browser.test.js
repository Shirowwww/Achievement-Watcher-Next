'use strict';

/*
  The theme customizer rows, laid out by a real browser (skipped with no Chromium browser present).

  Each row is a preview, a label and a strip of controls on one flex line. The controls cannot be
  narrowed, so whether the row fits depends entirely on how long the layer name is - and it is
  translated, so it differs per language. When it did not fit, the flex line broke and the controls
  dropped underneath, which left some rows looking nothing like the others. Nothing about that is
  visible to a test that reads the stylesheet, so this one measures the rows instead.
*/

const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const { launchBrowser, closeBrowser, skipReason } = require('../helpers/chromium');

const root = path.join(__dirname, '..', '..');
const css = fs.readFileSync(path.join(root, 'app', 'resources', 'css', 'app.css'), 'utf8');

/*
  The real row, as ui/settings.js builds it: an icon and the name, then the controls, then the hint
  on a line of its own underneath. The hint used to live inside the label; it was moved out because
  the label column is only about a hundred pixels wide, and a sentence wrapped in there became a
  five-line ribbon. Keep this fixture in step with renderCustomThemeLayers().
*/
function row(name, hint) {
  return `
    <div class="theme-layer-row" data-layer="test">
      <div class="theme-layer-preview"></div>
      <div class="theme-layer-label">
        <i class="fas fa-desktop"></i>
        <div class="theme-layer-label-text">
          <div class="theme-layer-name">${name}</div>
        </div>
      </div>
      <div class="theme-layer-controls">
        <input type="color" class="theme-layer-color" />
        <label class="theme-layer-alpha-group">
          <input type="range" class="theme-layer-alpha" min="0" max="100" value="100" />
          <span class="theme-layer-alpha-value">100%</span>
        </label>
        <label class="theme-layer-effect-toggle theme-layer-gradient-toggle">
          <input type="checkbox" /><span>Dégradé</span>
        </label>
        <button type="button" class="theme-layer-image">Image…</button>
        <label class="theme-layer-effect-toggle">
          <input type="checkbox" /><span>Effet</span>
        </label>
      </div>
      <div class="theme-layer-hint">${hint}</div>
    </div>`;
}

// The five layers as the French interface names them: the three long ones are the rows that broke.
const ROWS = [
  ['Fond de la fenêtre', "Derrière toute l'interface"],
  ['Barre du haut', 'La fine barre tout en haut'],
  ['Panneau de bibliothèque', 'Le grand panneau avec la liste des jeux'],
  ['Cartes et lignes', 'Tuiles de jeux, lignes de succès, dialogues'],
  ['Fenêtre de réglages', 'La fenêtre que tu lis actuellement'],
];

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><style>
  ${css}
  /* The panel the customizer sits in, at the width Settings gives it. */
  body { margin: 0; }
  /*
    620px, not the widest the panel gets: this is where the old rule broke two of the five rows and
    left the other three alone, which is the shape of the report. A test at a comfortable width
    passed either way and said nothing.
  */
  #theme-customizer { width: 620px; }
</style></head><body>
  <div id="theme-customizer"><div id="theme-customizer-layers">
    ${ROWS.map(([name, hint]) => row(name, hint)).join('')}
  </div></div>
</body></html>`;

test('every layer row keeps its controls beside the label, however long the name is', async (t) => {
  const { browser, userDataDir, failures } = await launchBrowser();
  if (!browser) return t.skip(skipReason(failures));
  t.after(() => closeBrowser(browser, userDataDir));

  const page = await browser.newPage();
  await page.setViewport({ width: 1100, height: 900 });
  await page.setContent(PAGE, { waitUntil: 'domcontentloaded' });

  const measured = await page.evaluate(() =>
    Array.prototype.map.call(document.querySelectorAll('.theme-layer-row'), (element) => {
      const label = element.querySelector('.theme-layer-label').getBoundingClientRect();
      const controls = element.querySelector('.theme-layer-controls').getBoundingClientRect();
      return {
        name: element.querySelector('.theme-layer-name').textContent,
        rowWidth: element.getBoundingClientRect().width,
        controlsRight: Math.round(controls.right),
        wrapped: controls.top >= label.bottom,
        overflows: controls.right > element.getBoundingClientRect().right + 1,
      };
    })
  );

  assert.equal(measured.length, 5, 'all five rows must render');
  for (const line of measured) {
    assert.equal(line.wrapped, false, `"${line.name}" dropped its controls onto a second line`);
    assert.equal(line.overflows, false, `"${line.name}" pushed its controls out of the row`);
  }

  // And they line up: the controls are pinned to the same right edge on every row, which is what
  // makes the five read as one list rather than five differently-shaped ones.
  const edges = new Set(measured.map((line) => line.controlsRight));
  assert.equal(edges.size, 1, `the controls must end on one edge, got ${[...edges].join(', ')}`);

  await page.close();
});

test('a name with no room left still wraps rather than widening the row', async (t) => {
  const { browser, userDataDir, failures } = await launchBrowser();
  if (!browser) return t.skip(skipReason(failures));
  t.after(() => closeBrowser(browser, userDataDir));

  const page = await browser.newPage();
  await page.setViewport({ width: 1100, height: 900 });
  // A name no language would really produce, to prove the row bends instead of breaking.
  await page.setContent(
    PAGE.replace('Fond de la fenêtre', 'Fond de la fenêtre principale de l application avec un nom deraisonnablement long'),
    { waitUntil: 'domcontentloaded' }
  );

  const first = await page.evaluate(() => {
    const element = document.querySelector('.theme-layer-row');
    const label = element.querySelector('.theme-layer-label').getBoundingClientRect();
    const controls = element.querySelector('.theme-layer-controls').getBoundingClientRect();
    const name = element.querySelector('.theme-layer-name');
    return {
      wrapped: controls.top >= label.bottom,
      lines: Math.round(name.getBoundingClientRect().height / parseFloat(getComputedStyle(name).lineHeight)),
      rowWidth: element.getBoundingClientRect().width,
    };
  });

  assert.equal(first.wrapped, false, 'the controls stay beside a name that does not fit');
  assert.ok(first.lines >= 2, 'the name is what takes the extra line');
  assert.ok(first.rowWidth <= 620, 'and the row itself never grows past its panel');

  await page.close();
});

/*
  What a layer paints, said in full.

  The hint was cropped to one line with an ellipsis, in a column the controls leave about a hundred
  pixels of - so "Tuiles de jeux, lignes de succès, dialogues" was read as "Tuiles de jeux, lig...".
  These are the two halves of the fix: the sentence is complete, and it is complete because it has
  the width of the row rather than the width of the label.
*/
test('every layer hint is shown in full, on the width of the row', async (t) => {
  const { browser, userDataDir, failures } = await launchBrowser();
  if (!browser) return t.skip(skipReason(failures));
  t.after(() => closeBrowser(browser, userDataDir));

  const page = await browser.newPage();
  await page.setViewport({ width: 1100, height: 900 });
  await page.setContent(PAGE, { waitUntil: 'domcontentloaded' });

  const measured = await page.evaluate(() =>
    Array.prototype.map.call(document.querySelectorAll('.theme-layer-row'), (element) => {
      const hint = element.querySelector('.theme-layer-hint');
      const label = element.querySelector('.theme-layer-label');
      const style = getComputedStyle(hint);
      return {
        text: hint.textContent,
        clipped: hint.scrollWidth > hint.clientWidth + 1,
        ellipsis: style.textOverflow === 'ellipsis' && style.overflow !== 'visible',
        nowrap: style.whiteSpace === 'nowrap',
        width: Math.round(hint.getBoundingClientRect().width),
        labelWidth: Math.round(label.getBoundingClientRect().width),
        below: hint.getBoundingClientRect().top >= label.getBoundingClientRect().bottom,
        lines: Math.round(hint.getBoundingClientRect().height / parseFloat(style.lineHeight)),
      };
    })
  );

  assert.equal(measured.length, 5, 'all five rows must render');
  for (const line of measured) {
    assert.equal(line.nowrap, false, `"${line.text}" is still held on one line`);
    assert.equal(line.ellipsis, false, `"${line.text}" is still truncated with an ellipsis`);
    assert.equal(line.clipped, false, `"${line.text}" does not fit the box that draws it`);
    assert.equal(line.below, true, `"${line.text}" must sit under the name, not beside it`);
    assert.ok(line.width > line.labelWidth, `"${line.text}" is still confined to the label column`);
    // Two lines is a wrap; five is the ribbon this replaced.
    assert.ok(line.lines <= 2, `"${line.text}" wrapped onto ${line.lines} lines`);
  }

  await page.close();
});
