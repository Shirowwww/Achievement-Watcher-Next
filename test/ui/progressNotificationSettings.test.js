'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');

const settings = require('../../app/settings.js');
const ini = require('../../app/util/ini.js');

const root = path.join(__dirname, '..', '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

function quietLoad() {
  const log = console.log;
  try {
    console.log = () => {};
    return settings.load();
  } finally {
    console.log = log;
  }
}

function tempProfile(t) {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-progress-settings-'));
  t.after(() => fs.rmSync(userData, { recursive: true, force: true }));
  settings.setUserDataPath(userData);
  return userData;
}

test('progress popups default to the unlock placement and every step', (t) => {
  tempProfile(t);
  const config = quietLoad();
  assert.equal(config.overlay.notificationProgressPosition, '', 'blank means same as unlocks');
  assert.equal(config.overlay.notificationProgressScale, '', 'blank means same as unlocks');
  assert.equal(config.notification.progressStep, 0, 'every step, as before');
});

test('the progress placement and step survive the DOM-shaped save and a reload', async (t) => {
  const userData = tempProfile(t);
  const config = quietLoad();
  // The Settings form hands every select value back as a string.
  config.overlay.notificationProgressPosition = 'bottom-left';
  config.overlay.notificationProgressScale = 0.75;
  config.notification.progressStep = '10';
  await settings.save(config);

  const saved = ini.parse(fs.readFileSync(path.join(userData, 'cfg', 'options.ini'), 'utf8'));
  assert.equal(saved.overlay.notificationProgressPosition, 'bottom-left');
  assert.equal(saved.notification.progressStep, '10', 'the Watchdog reads it from the notification section');

  const reloaded = quietLoad();
  assert.equal(reloaded.overlay.notificationProgressPosition, 'bottom-left');
  assert.equal(reloaded.overlay.notificationProgressScale, 0.75);
  assert.equal(reloaded.notification.progressStep, 10);
});

test('the keys stripped from the old per-type windows never feed the new setting', async (t) => {
  const userData = tempProfile(t);
  fs.mkdirSync(path.join(userData, 'cfg'), { recursive: true });
  fs.writeFileSync(
    path.join(userData, 'cfg', 'options.ini'),
    ['[overlay]', 'progressPosition=left-bot', 'playtimePosition=right-top', 'notificationProgressScale=7', '[notification]', 'progressStep=33', ''].join('\n'),
    'utf8'
  );
  const config = quietLoad();
  assert.equal(config.overlay.progressPosition, undefined);
  assert.equal(config.overlay.playtimePosition, undefined);
  assert.equal(config.overlay.notificationProgressPosition, '');
  assert.equal(config.overlay.notificationProgressScale, '', 'an unknown scale falls back to same as unlocks');
  assert.equal(config.notification.progressStep, 0, 'an unknown step falls back to every step');
});

test('the progress rows are bound by id in the overlay list and saved by the auto-save', () => {
  const html = read('app', 'view', 'app.html');
  const overlayList = html.match(/<ul id="options-notify-overlay">([\s\S]*?)<\/ul>/)[1];
  for (const id of ['option_overlayProgressPosition', 'option_overlayProgressScale']) {
    const select = overlayList.match(new RegExp(`<select[^>]*id="${id}"[^>]*>([\\s\\S]*?)</select>`));
    assert.ok(select, `${id} lives in the overlay list`);
    assert.match(select[1], /^\s*<option value="" selected>/, `${id} starts on "same as unlocks"`);
  }
  assert.match(overlayList, /id="btn-overlay-progress-reposition"/);

  const loader = read('app', 'locale', 'loader.js');
  assert.match(loader, /\$\('#lbl-overlayProgressPosition'\)\.text\(clear\(template\.settings\.notification\.option\.overlayProgressPosition\)\)/);
  assert.match(loader, /\$\('#lbl-overlayProgressScale'\)\.text\(clear\(template\.settings\.notification\.option\.overlayProgressScale\)\)/);

  const ui = read('app', 'ui', 'settings.js');
  assert.match(ui, /app\.config\.overlay\.notificationProgressPosition = notificationPlacement\.normalizeProgressPosition\(\$\('#option_overlayProgressPosition'\)\.val\(\)\)/);
  assert.match(ui, /app\.config\.overlay\.notificationProgressScale = notificationPlacement\.normalizeProgressScale\(\$\('#option_overlayProgressScale'\)\.val\(\)\)/);
  assert.match(ui, /\$\('#option_overlayProgressPosition'\)\.val\(cfgOverlay\.notificationProgressPosition \|\| ''\)/);
});

test('the milestone row is appended to the common rows, after every positional binding', () => {
  const html = read('app', 'view', 'app.html');
  const list = html.match(/<ul id="options-notify-common">([\s\S]*?)<\/ul>/)[1];
  const rows = [...list.matchAll(/<li\b[\s\S]*?<\/li>/g)];
  assert.equal(rows.length, 9);
  assert.match(rows[8][0], /id="option_progressStep"/);
  assert.match(rows[8][0], /<option value="0" selected><\/option>/);

  const loader = read('app', 'locale', 'loader.js');
  assert.match(loader, /li:nth-child\(9\) \.left span'\)\.text\(clear\(template\.settings\.notification\.option\.progressStep\.name/);
  assert.match(loader, /li:nth-child\(9\) \.help'\)\.text\(clear\(template\.settings\.notification\.option\.progressStep\.description/);
});

test('live progress popups and previews resolve placement through the same helper', () => {
  const init = read('app', 'electron', 'init.js');
  assert.match(init, /notificationPlacement\.resolvePlacement\(\{[\s\S]*?kind: notificationType/);
  assert.match(init, /progressPosition: ov\.notificationProgressPosition/);
  assert.match(init, /writeOverlayBounds\(\{ \[data\.repositionAnchor === 'progressNotif' \? 'progressNotif' : 'notif'\]: customPosition \}\)/);
  assert.match(init, /notificationPlacement\.savedAnchor\(readOverlayBounds\(\), data\.customAnchor\)/);

  const ui = read('app', 'ui', 'settings.js');
  assert.match(ui, /notificationPlacement\.resolvePlacement\(\{[\s\S]*?kind: notificationType/);
});
