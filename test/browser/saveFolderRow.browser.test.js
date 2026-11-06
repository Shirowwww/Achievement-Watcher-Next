'use strict';

/*
  The screenshot save-folder row, laid out by a real browser (skipped with no Chromium browser).

  Its two buttons take 320 to 380px, so in the pane of a 940px window the label column kept about
  180px and the description under the label ran down ten lines beside empty space (French bench
  capture, 2026-11-06). In a narrow list the description runs under the whole row; in a wide one the
  row keeps the two-column form of every other row.
*/

const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const { sharedBrowser } = require('../helpers/chromium');

const inContext = sharedBrowser();

const root = path.join(__dirname, '..', '..');
const appDir = path.join(root, 'app');
const htmlParser = require(path.join(appDir, 'node_modules', 'node-html-parser'));
const css = fs.readFileSync(path.join(appDir, 'resources', 'css', 'app.css'), 'utf8').replace(/<\/style/gi, '<\\/style');

// The real list from app.html, with the French strings the locale loader would put in it.
function souvenirList() {
  const list = htmlParser.parse(fs.readFileSync(path.join(appDir, 'view', 'app.html'), 'utf8')).querySelector('#options-notify-souvenir');
  const text = {
    'lbl-souvenirDir': 'Dossier d’enregistrement',
    'souvenir-dir-display': '/home/aw/verify/Pictures/Achievement Watcher Next',
    'souvenir-open-label': 'Ouvrir le dossier',
    'souvenir-dir-help':
      "Un sous-dossier par jeu, fichiers nommés « date - succès ». Par défaut : ~/Pictures/Achievement Watcher Next. Sous Wayland, le bureau demande une fois par session de partager l'écran.",
  };
  for (const [id, value] of Object.entries(text)) list.querySelector(`#${id}`).set_content(value);
  return list.toString();
}

function pageAt(width) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style><style>
    body { margin: 0; }
    #settings { display: block !important; position: static !important; }
  </style></head><body>
    <section id="settings"><div class="arrow-list" style="width: ${width}px">${souvenirList()}</div></section>
  </body></html>`;
}

async function measureFolderRow(page, width) {
  await page.setContent(pageAt(width), { waitUntil: 'domcontentloaded' });
  return page.evaluate(() => {
    const row = document.querySelector('#btn-souvenir-dir').closest('li');
    const box = (selector) => row.querySelector(selector).getBoundingClientRect();
    const help = row.querySelector('.help');
    const [label, right, helpBox] = [box('.left'), box('.right'), help.getBoundingClientRect()];
    return {
      rowWidth: row.getBoundingClientRect().width,
      helpWidth: helpBox.width,
      helpLines: Math.round(helpBox.height / parseFloat(getComputedStyle(help).lineHeight)),
      helpBelowButtons: helpBox.top >= right.bottom - 1,
      helpBesideButtons: helpBox.right <= right.left + 1,
      buttonsBesideLabel: right.top <= label.bottom + 1,
      overflows: row.scrollWidth > row.clientWidth + 1,
    };
  });
}

test('in a narrow pane the save-folder description runs under the whole row', async (t) => {
  await inContext(t, async (context) => {
    const page = await context.newPage();
    await page.setViewport({ width: 1100, height: 900 });
    for (const width of [560, 620]) {
      const row = await measureFolderRow(page, width);
      assert.equal(row.overflows, false, `${width}px: the row overflows`);
      assert.equal(row.buttonsBesideLabel, true, `${width}px: the buttons left their label`);
      assert.equal(row.helpBelowButtons, true, `${width}px: the description is beside the buttons, not under them`);
      assert.ok(row.helpWidth > row.rowWidth * 0.8, `${width}px: the description is ${Math.round(row.helpWidth)}px of a ${row.rowWidth}px row`);
      assert.ok(row.helpLines <= 4, `${width}px: the description runs down ${row.helpLines} lines`);
    }
  });
});

test('in a wide pane the save-folder row keeps the two columns of every other row', async (t) => {
  await inContext(t, async (context) => {
    const page = await context.newPage();
    await page.setViewport({ width: 1100, height: 900 });
    const row = await measureFolderRow(page, 900);
    assert.equal(row.overflows, false, 'the row overflows');
    assert.equal(row.buttonsBesideLabel, true, 'the buttons left their label');
    assert.equal(row.helpBesideButtons, true, 'the description reaches under the buttons');
  });
});
