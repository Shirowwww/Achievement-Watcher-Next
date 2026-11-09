'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');

const root = path.join(__dirname, '..', '..');
const appDir = path.join(root, 'app');
const htmlParser = require(path.join(appDir, 'node_modules', 'node-html-parser'));
const settings = require(path.join(appDir, 'settings.js'));
const libraryChrome = require(path.join(appDir, 'util', 'libraryChrome.js'));
const { tiltFor, coverUrlOf, MAX_TILT_DEG } = require(path.join(appDir, 'ui', 'libraryDepth.js'));
const html = fs.readFileSync(path.join(appDir, 'view', 'app.html'), 'utf8');
const localeLoader = fs.readFileSync(path.join(appDir, 'locale', 'loader.js'), 'utf8');

const rect = { left: 100, top: 50, width: 200, height: 100 };

test('a pointer at the centre of a tile leaves it flat', () => {
  assert.deepEqual(tiltFor(rect, 200, 100), { x: 0, y: 0 });
});

test('the edge under the pointer is pressed away, never past the limit', () => {
  assert.deepEqual(tiltFor(rect, 200, 50), { x: MAX_TILT_DEG, y: 0 }, 'top edge');
  assert.deepEqual(tiltFor(rect, 300, 100), { x: 0, y: MAX_TILT_DEG }, 'right edge');
  assert.deepEqual(tiltFor(rect, 100, 150), { x: -MAX_TILT_DEG, y: -MAX_TILT_DEG }, 'bottom left corner');
  // Outside the box (the pointer raced ahead of the frame): clamped, not exaggerated.
  assert.deepEqual(tiltFor(rect, 900, -400), { x: MAX_TILT_DEG, y: MAX_TILT_DEG });
});

test('a box with no size gives no tilt rather than NaN', () => {
  assert.deepEqual(tiltFor({ left: 0, top: 0, width: 0, height: 0 }, 5, 5), { x: 0, y: 0 });
  assert.deepEqual(tiltFor(null, 5, 5), { x: 0, y: 0 });
});

test('the cover is read from the url() the tile already paints', () => {
  assert.equal(coverUrlOf('url("file:///C:/cache/1245620.jpg")'), 'file:///C:/cache/1245620.jpg');
  assert.equal(coverUrlOf("url('https://cdn.example/a b.jpg')"), 'https://cdn.example/a b.jpg');
  assert.equal(coverUrlOf('url(../resources/img/x.png)'), '../resources/img/x.png');
  assert.equal(coverUrlOf(''), null);
  assert.equal(coverUrlOf('none'), null);
  assert.equal(coverUrlOf(undefined), null);
});

test('both effects are on by default and their choice persists', async (t) => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-library-depth-'));
  t.after(() => fs.rmSync(userData, { recursive: true, force: true }));
  settings.setUserDataPath(userData);

  const log = console.log;
  let config;
  try {
    console.log = () => {};
    config = settings.load();
  } finally {
    console.log = log;
  }
  assert.equal(config.achievement.libraryTilt, true);
  assert.equal(config.achievement.libraryAmbient, true);

  config.achievement.libraryTilt = false;
  config.achievement.libraryAmbient = false;
  await settings.save(config);
  const reloaded = settings.load();
  assert.equal(reloaded.achievement.libraryTilt, false);
  assert.equal(reloaded.achievement.libraryAmbient, false);
});

test('each effect has a strength, and true stays Normal for older settings files', async (t) => {
  const subtle = libraryChrome.resolve({ libraryTilt: 'subtle', libraryAmbient: 'subtle' });
  const normal = libraryChrome.resolve({ libraryTilt: true, libraryAmbient: true });
  const strong = libraryChrome.resolve({ libraryTilt: 'strong', libraryAmbient: 'strong' });
  assert.equal(normal.tiltDeg, MAX_TILT_DEG);
  assert.ok(subtle.tiltDeg < normal.tiltDeg && normal.tiltDeg < strong.tiltDeg);
  // A stronger background shows more of the cover: a thinner veil and a thinner panel.
  assert.ok(subtle.ambientMix.veil > normal.ambientMix.veil && normal.ambientMix.veil > strong.ambientMix.veil);
  assert.ok(subtle.ambientMix.panel > normal.ambientMix.panel && normal.ambientMix.panel > strong.ambientMix.panel);
  assert.deepEqual(libraryChrome.resolve({ libraryTilt: 'nonsense' }).tiltDeg, MAX_TILT_DEG);
  assert.deepEqual(strong.offEffects, []);

  for (const [select, stored] of [['false', false], ['subtle', 'subtle'], ['true', true], ['strong', 'strong'], ['?', true]]) {
    assert.equal(libraryChrome.effectFromSelect(select), stored, select);
  }
  for (const [stored, select] of [[false, 'false'], ['false', 'false'], ['subtle', 'subtle'], [true, 'true'], [undefined, 'true'], ['strong', 'strong']]) {
    assert.equal(libraryChrome.effectToSelect(stored), select, String(stored));
  }

  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-library-levels-'));
  t.after(() => fs.rmSync(userData, { recursive: true, force: true }));
  settings.setUserDataPath(userData);
  const log = console.log;
  let config;
  try {
    console.log = () => {};
    config = settings.load();
    config.achievement.libraryTilt = 'strong';
    config.achievement.libraryAmbient = 'subtle';
    await settings.save(config);
    config = settings.load();
  } finally {
    console.log = log;
  }
  assert.equal(config.achievement.libraryTilt, 'strong');
  assert.equal(config.achievement.libraryAmbient, 'subtle');
});

test('turning an effect off is one class on the library, which the renderer can clear again', () => {
  const off = libraryChrome.resolve({ libraryTilt: false, libraryAmbient: false });
  assert.deepEqual(off.offEffects, ['no-tile-tilt', 'no-library-ambient']);
  assert.deepEqual(libraryChrome.resolve({ libraryTilt: false }).offEffects, ['no-tile-tilt']);
  for (const value of [true, 'true', undefined]) assert.deepEqual(libraryChrome.resolve({ libraryTilt: value }).offEffects, []);
  for (const name of off.offEffects) assert.ok(off.allEffects.includes(name));
  // They hide nothing, so they stay out of the show/hide toggles.
  assert.ok(!off.hiddenClasses.some((name) => off.allEffects.includes(name)));

  const appSource = fs.readFileSync(path.join(appDir, 'app.js'), 'utf8');
  const settingsUi = fs.readFileSync(path.join(appDir, 'ui', 'settings.js'), 'utf8');
  assert.match(appSource, /\.\.\.chrome\.allEffects/);
  assert.match(appSource, /\.\.\.chrome\.offEffects/);
  assert.match(settingsUi, /settingsLibraryChrome\.EFFECTS\.map/);

  // ui/libraryDepth.js is a plain page script and checks the same class names on its own.
  const depthSource = fs.readFileSync(path.join(appDir, 'ui', 'libraryDepth.js'), 'utf8');
  for (const effect of libraryChrome.EFFECTS) assert.ok(depthSource.includes(`'${effect.offClass}'`), `${effect.offClass} unknown to libraryDepth.js`);
});

test('the two rows sit in the Library tiles card and are bound by id', () => {
  const document = htmlParser.parse(html);
  const card = document.querySelector('#library-tiles');
  for (const id of ['option_libraryTilt', 'option_libraryAmbient']) {
    const control = card && card.querySelector(`#${id}`);
    assert.ok(control, `${id} must sit in the Library tiles card`);
    assert.deepEqual(
      control.querySelectorAll('option').map((option) => option.getAttribute('value')),
      ['false', 'subtle', 'true', 'strong']
    );
  }
  for (const id of ['library-tilt-label', 'library-tilt-help', 'library-ambient-label', 'library-ambient-help']) {
    assert.match(localeLoader, new RegExp(`#${id}`));
  }
  assert.ok(document.querySelector('#home > #library-ambient'), 'the ambient layer lives in the home view');
  assert.match(html, /<script src="\.\.\/ui\/libraryDepth\.js"/);
});

test('the effects stay cheap: angles restyle one tile, the panel fill is never tweened', () => {
  const css = fs.readFileSync(path.join(appDir, 'resources', 'css', 'app.css'), 'utf8');
  for (const name of ['--tilt-x', '--tilt-y']) {
    assert.match(css, new RegExp(`@property ${name} \\{[^}]*inherits: false`), `${name} must not inherit`);
  }
  // A tweened fill repaints the whole grid on every frame of it.
  const panelTransitions = (css.match(/#game-list \{[^}]*\}/g) || [])
    .map((rule) => (/transition:([^;]*);/.exec(rule) || [])[1])
    .filter((value) => value && value.includes('background-color'));
  assert.ok(panelTransitions.length >= 2, 'both the panel and its has-ambient state name the fill');
  for (const value of panelTransitions) assert.match(value, /background-color 0s/);
});

test('every locale names and explains both effects', () => {
  const localeDir = path.join(appDir, 'locale', 'lang');
  for (const file of fs.readdirSync(localeDir).filter((name) => name.endsWith('.json'))) {
    const library = JSON.parse(fs.readFileSync(path.join(localeDir, file), 'utf8')).settings?.general?.library;
    for (const key of ['tilt', 'ambient']) {
      assert.ok(String(library?.[key]?.name || '').trim(), `${file}: missing ${key} name`);
      assert.ok(String(library?.[key]?.description || '').trim(), `${file}: missing ${key} description`);
    }
  }
});
