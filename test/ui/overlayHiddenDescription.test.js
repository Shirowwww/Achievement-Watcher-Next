'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ui = require('../../app/util/overlayUi.js');
const { loadOverlayLocale } = require('../../app/util/overlayLocale.js');

const appDir = path.join(__dirname, '..', '..', 'app');
const localeDir = path.join(appDir, 'locale', 'lang');

test('a hidden, locked achievement is masked unless show-hidden is on', () => {
  assert.equal(ui.isDescriptionMasked({ hidden: 1, Achieved: false }, false), true);
  assert.equal(ui.isDescriptionMasked({ hidden: '1' }, undefined), true);
  assert.equal(ui.isDescriptionMasked({ hidden: 1 }, true), false);
  assert.equal(ui.isDescriptionMasked({ hidden: 1, Achieved: true }, false), false);
  assert.equal(ui.isDescriptionMasked({ hidden: 0 }, false), false);
  assert.equal(ui.isDescriptionMasked({}, false), false);
  assert.equal(ui.isDescriptionMasked(null, false), false);
});

test('every locale gives the overlay the main window hidden-description label', () => {
  for (const file of fs.readdirSync(localeDir).filter((name) => name.endsWith('.json'))) {
    const lang = file.replace(/\.json$/, '');
    const raw = JSON.parse(fs.readFileSync(path.join(localeDir, file), 'utf8'));
    const { strings } = loadOverlayLocale({ localeDir, lang });
    assert.ok(strings.hiddenDescription, `${lang}: hiddenDescription missing`);
    assert.equal(strings.hiddenDescription, raw.hiddenDescriptionPlaceholder, lang);
  }
});

test('an overlay string of the same name still wins over the shared label', () => {
  const tmp = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'aw-overlay-'));
  try {
    fs.writeFileSync(
      path.join(tmp, 'english.json'),
      JSON.stringify({ hiddenDescriptionPlaceholder: 'shared', overlay: { hiddenDescription: 'own' } })
    );
    assert.equal(loadOverlayLocale({ localeDir: tmp, lang: 'english' }).strings.hiddenDescription, 'own');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('the overlay masks the description, keeps it out of search and reveals it per row', () => {
  const source = fs.readFileSync(path.join(appDir, 'view', 'overlay.js'), 'utf8');
  assert.match(source, /isDescriptionHidden\(a\) \? '' :/, 'search must not read a masked description');
  assert.match(source, /masked \? overlayStrings\.hiddenDescription/, 'a masked row shows the label, not the text');
  assert.match(source, /row\.addEventListener\('click', \(\) => revealDescription/, 'the row, which the gamepad clicks, reveals');
  assert.match(source, /revealedDescriptions = new Set\(\)/, 'reveals reset when the overlay reopens');
});

test('the host sends the show-hidden option with the game', () => {
  const source = fs.readFileSync(path.join(appDir, 'electron', 'init.js'), 'utf8');
  assert.match(source, /configJS\.achievement\.showHidden/);
  assert.match(source, /'show-overlay', info\.game \? \{ \.\.\.info\.game, showHidden \}/);
});
