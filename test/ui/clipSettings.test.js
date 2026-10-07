'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');

const root = path.join(__dirname, '..', '..');
const appDir = path.join(root, 'app');
const htmlParser = require(path.join(appDir, 'node_modules', 'node-html-parser'));

const html = fs.readFileSync(path.join(appDir, 'view', 'app.html'), 'utf8');
const loader = fs.readFileSync(path.join(appDir, 'locale', 'loader.js'), 'utf8');
const settingsUi = fs.readFileSync(path.join(appDir, 'ui', 'settings.js'), 'utf8');
const localeDir = path.join(appDir, 'locale', 'lang');
const settings = require(path.join(appDir, 'settings.js'));
const ini = require(path.join(appDir, 'util', 'ini.js'));

const values = (list, id) => list.querySelectorAll(`#${id} option`).map((option) => option.getAttribute('value'));

test('the clip card offers the choices of a replay buffer', () => {
  const list = htmlParser.parse(html).querySelector('#options-notify-clip');
  assert.ok(list, 'the clip settings list must exist');
  assert.deepEqual(values(list, 'option_clip'), ['false', 'true']);
  const seconds = list.querySelector('#option_clipSeconds');
  assert.equal(seconds.getAttribute('type'), 'range');
  assert.equal(seconds.getAttribute('min'), '10');
  assert.equal(seconds.getAttribute('max'), '30');
  assert.deepEqual(values(list, 'option_clipCodec'), ['h264', 'hevc', 'av1']);
  assert.deepEqual(values(list, 'option_clipResolution'), ['native', '2160', '1440', '1080', '720']);
  assert.deepEqual(values(list, 'option_clipFps'), ['30', '60']);
  assert.deepEqual(values(list, 'option_clipQuality'), ['low', 'medium', 'high']);
  assert.deepEqual(values(list, 'option_clipAudio'), ['game', 'all']);
  assert.ok(list.querySelector('#clip-estimate'), 'the size estimate must be shown');
});

test('Simple mode keeps the switch and the length, and folds the encoding details away', () => {
  const list = htmlParser.parse(html).querySelector('#options-notify-clip');
  const advanced = (id) => list.querySelector(`#${id}`).closest('li').getAttribute('data-advanced') === '1';
  assert.equal(advanced('option_clip'), false);
  assert.equal(advanced('option_clipSeconds'), false);
  for (const id of ['option_clipCodec', 'option_clipResolution', 'option_clipFps', 'option_clipQuality', 'option_clipAudio']) {
    assert.equal(advanced(id), true, `${id} belongs to Advanced mode`);
  }
});

test('while clips are off the card shows only its switch', () => {
  const list = htmlParser.parse(html).querySelector('#options-notify-clip');
  assert.ok(list.classList.contains('clip-off'), 'the card starts folded, matching the default');
  assert.equal(list.querySelector('li').querySelector('#option_clip') !== null, true, 'the switch is the first row');
  const css = fs.readFileSync(path.join(appDir, 'resources', 'css', 'app.css'), 'utf8');
  assert.match(css, /#options-notify-clip\.clip-off > li:not\(:first-child\) \{\s*display: none;/);
  assert.match(settingsUi, /\$\('#options-notify-clip'\)\.toggleClass\('clip-off', !clip\.clip\)/);
  // The Screen choice names the resolution it stands for.
  assert.match(settingsUi, /option\[value='native'\]"\)\.text\(`\$\{native\} \(\$\{screen\.height\}p\)`\)/);
});

test('the clip card has its own save folder, laid out like the screenshot one', () => {
  const list = htmlParser.parse(html).querySelector('#options-notify-clip');
  const row = list.querySelector('#btn-clip-dir').closest('li');
  assert.equal(row.hasAttribute('data-advanced'), false, 'where clips go is shown in Simple mode too');
  assert.ok(row.querySelector('#clip-dir-display'));
  assert.ok(row.querySelector('#btn-clip-open'));
  assert.ok(row.querySelector('#clip-dir-help'));
  assert.match(loader, /\$\('#clip-dir-help'\)\.text\(String\(opt\.clipDirHelp \|\| ''\)\)/);
  assert.match(settingsUi, /\$\('#btn-clip-dir'\)\.click\(/);
  assert.match(settingsUi, /\$\('#btn-clip-open'\)\.click\(/);
  assert.match(settingsUi, /clipDir: \(app\.config\.souvenir && app\.config\.souvenir\.clipDir\) \|\| ''/, 'a save must keep the picked folder');

  // Both folder rows keep their two buttons on one line; wrapping left a gap beside the help.
  const css = fs.readFileSync(path.join(appDir, 'resources', 'css', 'app.css'), 'utf8');
  assert.match(css, /#settings #options-notify-souvenir li \.right\.action-right,\s*#settings #options-notify-clip li \.right\.action-right \{[^}]*flex-wrap: nowrap;/);
});

test('every clip label is translated and every control is saved', () => {
  for (const id of ['clip', 'clipSeconds', 'clipCodec', 'clipResolution', 'clipFps', 'clipQuality', 'clipAudio', 'clipEstimate']) {
    assert.match(loader, new RegExp(`row\\('#lbl-${id}', '${id}'`), `${id} needs its label bound`);
  }
  // stripTags would erase the <folder>\<game> placeholders of the folder help.
  assert.doesNotMatch(loader, /clear\(opt\.souvenirDirHelp\)/);
  assert.match(settingsUi, /Object\.assign\(app\.config\.souvenir, readClipSettings\(\)\)/);
  assert.match(settingsUi, /\$\('#option_clipSeconds'\)\.on\('change', autosaveNotifications\)/);

  const keys = Object.keys(JSON.parse(fs.readFileSync(path.join(localeDir, 'english.json'), 'utf8')).settings.notification.option).filter((key) => key.startsWith('clip'));
  assert.ok(keys.length >= 20);
  for (const file of fs.readdirSync(localeDir).filter((name) => name.endsWith('.json'))) {
    const option = JSON.parse(fs.readFileSync(path.join(localeDir, file), 'utf8')).settings?.notification?.option || {};
    for (const key of keys) assert.ok(String(option[key] || '').trim(), `${file}: missing ${key}`);
    assert.match(option.clipSecondsValue, /\{seconds\}/, `${file}: clipSecondsValue lost its placeholder`);
    assert.match(option.clipEstimateValue, /\{size\}/, `${file}: clipEstimateValue lost its placeholder`);
  }
});

test('clip settings default to off and are stored by value', async (t) => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-clip-settings-'));
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
  assert.equal(config.souvenir.clip, false);
  assert.equal(config.souvenir.clipSeconds, 20);

  assert.equal(config.souvenir.clipDir, '');
  const clipDir = path.join(userData, 'My Clips');
  Object.assign(config.souvenir, { clip: true, clipSeconds: '12', clipFps: '60', clipCodec: 'av1', clipResolution: 'native', clipDir });
  await settings.save(config);
  const saved = ini.parse(fs.readFileSync(path.join(userData, 'cfg', 'options.ini'), 'utf8')).souvenir;
  assert.equal(String(saved.clipSeconds), '12');

  const reloaded = settings.load().souvenir;
  assert.equal(reloaded.clip, true);
  assert.equal(reloaded.clipSeconds, 12);
  assert.equal(reloaded.clipFps, 60);
  assert.equal(reloaded.clipCodec, 'av1');
  assert.equal(reloaded.clipResolution, 'native');
  assert.equal(reloaded.clipDir, clipDir);
});
