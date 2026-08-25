'use strict';

/*
  The Presets tab, laid out by a real browser (skipped with no Chromium browser present).

  Two things about it could only ever be measured. The explanation over the starting points was cut
  to about a third of the card by `#settings .content li .left`, a 360px cap meant for a settings
  label sitting beside its control - the designer's rows have no control beside them, so all it did
  was fold a sentence into a column. And the action row was eight buttons of equal weight on one
  wrapping line, where the break fell wherever that language's labels happened to run out of room.

  These pin the shape that replaced it: the sentence gets the card, and the row is two groups with
  Import and Export as one pair of equal halves and the SAN converter quieter, underneath.
*/

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const { launchBrowser, closeBrowser, skipReason } = require('../helpers/chromium');

const root = path.join(__dirname, '..', '..');
const appDir = path.join(root, 'app');
const css = fs.readFileSync(path.join(appDir, 'resources', 'css', 'app.css'), 'utf8');
const html = fs.readFileSync(path.join(appDir, 'view', 'app.html'), 'utf8');

// The two rows of the designer card, taken out of app.html rather than rewritten here, so a change
// to the markup is measured rather than missed. The preview workspace is left out: it is a scaled
// iframe with a ResizeObserver behind it, and nothing here is about that.
function designerMarkup() {
  const start = html.indexOf('<li class="pd-row" id="pd-templates-row">');
  assert.ok(start > -1, 'the starting-points row is gone from app.html');
  const end = html.indexOf('</ul>', start);
  assert.ok(end > start, 'the designer list is gone from app.html');
  // Rename and Delete only exist once a preset is loaded; measuring the full row means showing them.
  return html.slice(start, end).replace(/style="display: none"/g, '');
}

// The labels the locale loader writes in. German, because it is the longest of the bundled set and
// the layout has to hold for it as much as for English.
const LABELS = {
  'templates.title': ['Ausgangspunkt', 'Start from'],
  'templates.intro': [
    'Wähle einen Ausgangspunkt und mach ihn zu deinem. Nichts wird gespeichert, bis du das Preset erstellst.',
    'Pick a starting point, then make it yours. Nothing is saved until you create the preset.',
  ],
  'templates.random': ['Überrasch mich', 'Surprise me'],
  'templates.duplicate': ['Duplizieren', 'Duplicate'],
  load: ['Ein Preset bearbeiten', 'Edit a preset'],
  name: ['Name', 'Name'],
  previewOnScreen: ['Vorschau', 'Preview'],
  reset: ['Zurücksetzen', 'Reset'],
  renameLabel: ['Umbenennen', 'Rename'],
  deleteLabel: ['Löschen', 'Delete'],
  importLabel: ['Importieren', 'Import'],
  exportLabel: ['Exportieren', 'Export'],
  importSan: ['SAN-Design importieren', 'Import SAN theme'],
};

const CHIPS = ['Slate', 'Midnight', 'Aurora', 'Paper', 'Neon', 'Terminal', 'Amber'];

function page(language) {
  const index = language === 'de' ? 0 : 1;
  let body = designerMarkup();
  for (const [key, values] of Object.entries(LABELS)) {
    body = body.replace(new RegExp(`(<[^>]*data-lang="${key.replace('.', '\\.')}"[^>]*>)</`, 'g'), `$1${values[index]}</`);
  }
  body = body.replace('<span id="pd-lbl-create"></span>', `<span id="pd-lbl-create">${index ? 'Create preset' : 'Preset erstellen'}</span>`);
  body = body.replace(
    '<div class="pd-templates" id="pd-templates"></div>',
    `<div class="pd-templates" id="pd-templates">${CHIPS.map(
      (name, i) => `<button type="button" class="pd-template${i ? '' : ' is-on'}"><span class="pd-template-swatch"></span>${name}</button>`
    ).join('')}</div>`
  );

  return `<!doctype html><html><head><meta charset="utf-8"><style>
  ${css}
  body { margin: 0; }
  /* The Settings modal, opened on the Presets tab: the panel and its navigation at the widths the
     real window gives them, so the card is measured at the width it actually gets. */
  #settings { display: block !important; position: static; }
  #settings .box { display: block !important; position: static; transform: none; margin: 0 auto; }
  #settings .box .content { display: block !important; height: auto !important; overflow: visible !important; }
  /* The preview workspace is a scaled iframe driven by a ResizeObserver; nothing here is about it. */
  .pd-workspace { display: none !important; }
  </style></head><body>
  <section id="settings"><div class="box"><div class="container">
    <ul id="settingNav"><li data-view="presets"><span>Presets</span></li></ul>
    <section class="content" data-view="presets"><div class="arrow-list">
      <div class="title"><span>Preset designer</span></div>
      <ul id="options-notify-designer">${body}</ul>
    </div></section>
  </div></div></section>
  </body></html>`;
}

async function measure(browser, language, viewport) {
  const tab = await browser.newPage();
  await tab.setViewport(viewport);
  await tab.setContent(page(language), { waitUntil: 'domcontentloaded' });
  const out = await tab.evaluate(() => {
    const box = (selector) => {
      const node = document.querySelector(selector);
      if (!node) return null;
      const rect = node.getBoundingClientRect();
      return { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right, width: rect.width, height: rect.height };
    };
    const intro = document.querySelector('.pd-start-intro');
    const introStyle = getComputedStyle(intro);
    return {
      card: box('#options-notify-designer'),
      row: box('#pd-templates-row'),
      intro: box('.pd-start-intro'),
      introLines: Math.round(intro.getBoundingClientRect().height / parseFloat(introStyle.lineHeight)),
      introColor: introStyle.color,
      title: box('.pd-start-title'),
      titleColor: getComputedStyle(document.querySelector('.pd-start-title')).color,
      chips: box('#pd-templates'),
      primary: box('.pd-actions-primary'),
      files: box('.pd-actions-files'),
      filesBorder: (() => {
        const style = getComputedStyle(document.querySelector('.pd-actions-files'));
        return { top: style.borderTopWidth, left: style.borderLeftWidth };
      })(),
      pair: box('.pd-file-pair'),
      import: box('#btn-import-preset'),
      export: box('#btn-export-preset'),
      san: box('#btn-import-san'),
      create: box('#btn-create-preset'),
      overflows: document.documentElement.scrollWidth > innerWidth + 1,
    };
  });
  await tab.close();
  return out;
}

const WIDE = { width: 1300, height: 900 };
// The app's own minimum window width, where the Settings panel is at its narrowest.
const NARROW = { width: 900, height: 900 };

test('the explanation over the starting points gets the width of the card', async (t) => {
  const { browser, userDataDir, failures } = await launchBrowser();
  if (!browser) return t.skip(skipReason(failures));
  t.after(() => closeBrowser(browser, userDataDir));

  for (const [language, viewport] of [['en', WIDE], ['de', WIDE], ['de', NARROW]]) {
    const m = await measure(browser, language, viewport);
    // The old cap left it at 360px of a card around twice that. Two thirds is the claim: it is a
    // paragraph across the card, not a column beside something.
    assert.ok(
      m.intro.width > m.card.width * 0.66,
      `${language} at ${viewport.width}: the sentence has ${Math.round(m.intro.width)}px of a ${Math.round(m.card.width)}px card`
    );
    assert.ok(m.introLines <= 3, `${language} at ${viewport.width}: the sentence folded onto ${m.introLines} lines`);
    // And it reads as supporting copy under a heading, rather than as a second label.
    assert.notEqual(m.introColor, m.titleColor, 'the heading and the sentence are the same colour');
    assert.ok(m.title.bottom <= m.intro.top + 1, 'the heading must sit above the sentence');
    assert.ok(m.intro.bottom <= m.chips.top + 1, 'and the sentence above the swatches');
  }
});

/*
  Import and Export are the same thing done in opposite directions, so they are one pair of equal
  halves: same width, same height, side by side, one gap between them.
*/
test('Import and Export are one pair of equal halves', async (t) => {
  const { browser, userDataDir, failures } = await launchBrowser();
  if (!browser) return t.skip(skipReason(failures));
  t.after(() => closeBrowser(browser, userDataDir));

  for (const [language, viewport] of [['en', WIDE], ['de', WIDE], ['de', NARROW]]) {
    const m = await measure(browser, language, viewport);
    const where = `${language} at ${viewport.width}`;

    assert.ok(Math.abs(m.import.width - m.export.width) <= 1, `${where}: the two are ${m.import.width} and ${m.export.width} wide`);
    assert.ok(Math.abs(m.import.top - m.export.top) <= 1, `${where}: they are not on the same line`);
    assert.ok(Math.abs(m.import.height - m.export.height) <= 1, `${where}: they are not the same height`);
    assert.ok(m.export.left > m.import.right, `${where}: Export must follow Import`);
    // Equal spacing: the gap between them matches the gap to the edges of the pair they fill.
    const gap = m.export.left - m.import.right;
    assert.ok(gap > 0 && gap <= 16, `${where}: the gap between them is ${Math.round(gap)}px`);
    assert.ok(Math.abs(m.import.left - m.pair.left) <= 1 && Math.abs(m.export.right - m.pair.right) <= 1, `${where}: the pair is not filled evenly`);
  }
});

/*
  The SAN converter reads somebody else's format. It stays available, but under the pair and
  quieter: no filled surface of its own, and smaller text than the buttons above it.
*/
test('the SAN import is a secondary action under the pair', async (t) => {
  const { browser, userDataDir, failures } = await launchBrowser();
  if (!browser) return t.skip(skipReason(failures));
  t.after(() => closeBrowser(browser, userDataDir));

  const tab = await browser.newPage();
  await tab.setViewport(WIDE);
  await tab.setContent(page('de'), { waitUntil: 'domcontentloaded' });
  const weights = await tab.evaluate(() => {
    const read = (selector) => {
      const node = document.querySelector(selector);
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return {
        top: rect.top,
        bottom: rect.bottom,
        left: rect.left,
        right: rect.right,
        fontSize: parseFloat(style.fontSize),
        background: style.backgroundColor,
        border: style.borderTopColor,
      };
    };
    return { san: read('#btn-import-san'), imp: read('#btn-import-preset'), create: read('#btn-create-preset') };
  });
  await tab.close();

  const invisible = (color) => /rgba\(0, 0, 0, 0\)|^transparent$|\/ 0\)/.test(color);

  assert.ok(weights.san.top >= weights.imp.bottom, 'the SAN import must sit under the pair, not beside it');
  assert.ok(weights.san.fontSize < weights.imp.fontSize, 'it must be quieter than the buttons above it');
  // Three weights, in order: the SAN import is not drawn as a control at rest, Import is outlined,
  // and the action the whole tab leads to is the only filled one.
  assert.ok(invisible(weights.san.border), `the SAN import must not be outlined at rest (${weights.san.border})`);
  assert.ok(!invisible(weights.imp.border), `while Import still is (${weights.imp.border})`);
  assert.ok(!invisible(weights.create.background), `and the primary action is filled (${weights.create.background})`);
  assert.ok(invisible(weights.imp.background), 'Import is outlined rather than filled, so only one button is');
});

/*
  Two groups, one under the other, at every width.

  This deliberately pins ONE arrangement rather than accepting "side by side or stacked". The first
  version of this rule put the file group in a column beside the design actions below a viewport
  query that could never fire at the card width of the time, so the group wrapped by itself while
  the hairline meant to separate two columns still pointed left, at nothing - and a test that
  allowed both arrangements had nothing to say about it. The card is wider now on a large screen,
  which is exactly why the single arrangement has to be asserted rather than inferred.
*/
test('the file actions are their own row under the design actions', async (t) => {
  const { browser, userDataDir, failures } = await launchBrowser();
  if (!browser) return t.skip(skipReason(failures));
  t.after(() => closeBrowser(browser, userDataDir));

  for (const [language, viewport] of [['en', WIDE], ['de', WIDE], ['de', NARROW]]) {
    const m = await measure(browser, language, viewport);
    const where = `${language} at ${viewport.width}`;

    assert.ok(m.files.top >= m.primary.bottom - 1, `${where}: the file actions are not under the design actions`);
    assert.ok(m.files.left <= m.primary.left + 1, `${where}: the file actions are indented like a column that is not there`);
    assert.equal(m.overflows, false, `${where}: the card scrolls sideways`);
    assert.ok(m.create.top <= m.import.top + 1, `${where}: the file actions came before the primary one`);
    // The separator belongs to the edge the two groups actually meet on.
    assert.equal(m.filesBorder.left, '0px', `${where}: the group still carries the left rule of a column layout`);
    assert.notEqual(m.filesBorder.top, '0px', `${where}: nothing separates the two groups`);
  }
});

/*
  The widest the card gets. It grows with the window now, so "there is not room for two columns"
  is no longer what keeps the row in one shape - only this does.
*/
test('the action row keeps its shape on the widest window there is', async (t) => {
  const { browser, userDataDir, failures } = await launchBrowser();
  if (!browser) return t.skip(skipReason(failures));
  t.after(() => closeBrowser(browser, userDataDir));

  const widest = await measure(browser, 'en', { width: 2560, height: 1000 });
  // Measured rather than assumed: the point is that the shape holds however wide the card gets.
  assert.ok(widest.card.width > 700, `the card should grow on a big screen, got ${Math.round(widest.card.width)}px`);
  assert.ok(widest.files.top >= widest.primary.bottom - 1, 'even at 2560px the file actions stay their own row');
  assert.ok(widest.files.left <= widest.primary.left + 1, 'and start at the same edge, not indented like a column');
});
