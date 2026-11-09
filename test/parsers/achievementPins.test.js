'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const pins = require('../../app/parser/achievementPins.js');

function profile(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-pins-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  pins.setUserDataPath(dir);
  return path.join(dir, 'cfg', 'achievement-pins.json');
}

test('a pinned achievement is kept in pin order and survives a restart', (t) => {
  const file = profile(t);
  assert.deepEqual(pins.setPinned('480', 'ACH_WIN', true), { changed: true, pins: ['ACH_WIN'] });
  assert.deepEqual(pins.setPinned('480', 'ACH_TRAVEL', true).pins, ['ACH_WIN', 'ACH_TRAVEL']);
  assert.equal(pins.setPinned('480', 'ACH_WIN', true).changed, false, 'pinning twice changes nothing');
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), { 480: ['ACH_WIN', 'ACH_TRAVEL'] });
  assert.deepEqual(pins.pinsForGame(480), ['ACH_WIN', 'ACH_TRAVEL'], 'a numeric appid reads the same game');
});

test('unpinning the last achievement removes the game from the file', (t) => {
  const file = profile(t);
  pins.setPinned('480', 'ACH_WIN', true);
  assert.deepEqual(pins.setPinned('480', 'ACH_WIN', false), { changed: true, pins: [] });
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), {});
});

test('a pin goes only once its achievement is seen unlocked', (t) => {
  profile(t);
  pins.setPinned('480', 'ACH_WIN', true);
  pins.setPinned('480', 'ACH_TRAVEL', true);
  assert.equal(pins.dropUnlocked('480', []).changed, false, 'an empty unlock list removes nothing');
  assert.deepEqual(pins.dropUnlocked('480', ['ACH_TRAVEL', 'ACH_OTHER']), { changed: true, pins: ['ACH_WIN'] });
});

test('a broken pin file is set aside, not overwritten, and reads as no pins', (t) => {
  const file = profile(t);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, '{ not json');
  assert.deepEqual(pins.pinsForGame('480'), []);
  assert.equal(fs.existsSync(file), false);
  assert.equal(fs.readdirSync(path.dirname(file)).some((name) => name.startsWith('achievement-pins.json.corrupt-')), true);
});

test('names that cannot be achievements are refused', (t) => {
  profile(t);
  assert.equal(pins.setPinned('480', '', true).changed, false);
  assert.equal(pins.setPinned('480', 42, true).changed, false);
  assert.equal(pins.setPinned('', 'ACH_WIN', true).changed, false);
  assert.equal(pins.setPinned('480', 'x'.repeat(600), true).changed, false);
});

test('a game keeps at most the newest pins', (t) => {
  profile(t);
  for (let i = 0; i < pins.MAX_PER_GAME + 5; i++) pins.setPinned('480', `ACH_${i}`, true);
  const kept = pins.pinsForGame('480');
  assert.equal(kept.length, pins.MAX_PER_GAME);
  assert.equal(kept[kept.length - 1], `ACH_${pins.MAX_PER_GAME + 4}`);
});
