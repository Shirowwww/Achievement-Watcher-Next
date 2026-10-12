'use strict';

/*
  #109: a rare unlock and a 100% completion can each have their own sound. The overlay (app) and
  the Windows toast (Watchdog) pick it through two copies of one rule, so both are run here.
*/

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');

const appSounds = require('../../app/util/notificationSounds.js');
const watchdogSounds = require('../../watchdog/util/notificationSound.js');
const settings = require('../../app/settings.js');
const ini = require('../../app/util/ini.js');

const root = path.join(__dirname, '..', '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const overlay = { notificationSound: 'Base.wav', notificationSoundRare: 'Rare.wav', notificationSoundPlatinum: 'Fanfare.wav' };

for (const [label, sounds] of [
  ['app', appSounds],
  ['watchdog', watchdogSounds],
]) {
  test(`${label}: rare and 100% popups take their own sound`, () => {
    assert.equal(sounds.tierSound(overlay, { notificationType: 'platinum' }), 'Fanfare.wav');
    assert.equal(sounds.tierSound(overlay, { rarityPercent: 4.2 }), 'Rare.wav');
    assert.equal(sounds.tierSound(overlay, { rarityPercent: '0' }), 'Rare.wav');
  });

  test(`${label}: ordinary, progress and playtime popups keep the unlock sound`, () => {
    assert.equal(sounds.tierSound(overlay, {}), '');
    assert.equal(sounds.tierSound(overlay, { rarityPercent: null }), '');
    assert.equal(sounds.tierSound(overlay, { rarityPercent: '' }), '');
    assert.equal(sounds.tierSound(overlay, { notificationType: 'progress', rarityPercent: 3 }), '');
    assert.equal(sounds.tierSound(overlay, { notificationType: 'playtime' }), '');
    assert.equal(sounds.tierSound({}, { notificationType: 'platinum' }), '');
    assert.equal(sounds.tierSound(undefined, { rarityPercent: 2 }), '');
  });

  test(`${label}: "None" is passed through for the caller to stay silent`, () => {
    assert.equal(sounds.NO_SOUND, '__none__');
    assert.equal(sounds.tierSound({ notificationSoundRare: '__none__' }, { rarityPercent: 1 }), '__none__');
  });
}

function quietLoad() {
  const log = console.log;
  try {
    console.log = () => {};
    return settings.load();
  } finally {
    console.log = log;
  }
}

test('the rare and 100% sounds default to the unlock sound and survive a save', async (t) => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-tier-sound-'));
  t.after(() => fs.rmSync(userData, { recursive: true, force: true }));
  settings.setUserDataPath(userData);

  const config = quietLoad();
  assert.equal(config.overlay.notificationSoundRare, '');
  assert.equal(config.overlay.notificationSoundPlatinum, '');

  config.overlay.notificationSoundRare = 'Rare.wav';
  config.overlay.notificationSoundPlatinum = '__none__';
  await settings.save(config);
  const saved = ini.parse(fs.readFileSync(path.join(userData, 'cfg', 'options.ini'), 'utf8'));
  assert.equal(saved.overlay.notificationSoundRare, 'Rare.wav');

  const reloaded = quietLoad();
  assert.equal(reloaded.overlay.notificationSoundRare, 'Rare.wav');
  assert.equal(reloaded.overlay.notificationSoundPlatinum, '__none__');
});

test('the two rows sit in the overlay list, advanced only, and both delivery paths use the rule', () => {
  const html = read('app', 'view', 'app.html');
  const overlayList = html.match(/<ul id="options-notify-overlay">([\s\S]*?)<\/ul>/)[1];
  for (const id of ['option_overlaySoundRare', 'option_overlaySoundPlatinum']) {
    const row = overlayList.match(new RegExp(`<li[^>]*>(?:(?!<li)[\\s\\S])*?id="${id}"`));
    assert.ok(row, `${id} lives in the overlay list`);
    assert.match(row[0], /data-advanced="1"/, `${id} is an Advanced row`);
  }
  assert.match(read('app', 'electron', 'init.js'), /notificationSounds\.tierSound\(ov, \{ notificationType, rarityPercent: args\.rarityPercent \}\)/);
  assert.match(read('watchdog', 'notification', 'toaster.js'), /notificationSound\.tierSound\(overlay,/);
});
