'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { makeTempDir } = require('../helpers/tempDir');

const settings = require('../../app/settings.js');
const libraryRefresh = require('../../app/util/libraryRefresh.js');

function loadWith(achievementLines) {
  const userData = makeTempDir('aw-rarity-setting-');
  fs.mkdirSync(path.join(userData, 'cfg'), { recursive: true });
  fs.writeFileSync(path.join(userData, 'cfg', 'options.ini'), `[achievement]\nlang=english\n${achievementLines}\n`, 'utf8');
  settings.setUserDataPath(userData);
  return settings.load().achievement;
}

test('an untouched install keeps the rare tiers and the default trophy bounds', () => {
  const achievement = loadWith('');
  assert.equal(achievement.rarityMode, 'rare');
  assert.equal(achievement.trophyGoldBelow, 20);
  assert.equal(achievement.trophySilverBelow, 50);
});

test('trophy mode and valid bounds survive a reload as numbers', () => {
  const achievement = loadWith('rarityMode=trophy\ntrophyGoldBelow=15\ntrophySilverBelow=60');
  assert.equal(achievement.rarityMode, 'trophy');
  assert.equal(achievement.trophyGoldBelow, 15);
  assert.equal(achievement.trophySilverBelow, 60);
});

test('a hand-edited mode or an impossible pair of bounds is reset', () => {
  assert.equal(loadWith('rarityMode=platinum').rarityMode, 'rare');
  const crossed = loadWith('rarityMode=trophy\ntrophyGoldBelow=70\ntrophySilverBelow=30');
  assert.deepEqual([crossed.trophyGoldBelow, crossed.trophySilverBelow], [20, 50]);
  const junk = loadWith('trophyGoldBelow=abc\ntrophySilverBelow=');
  assert.deepEqual([junk.trophyGoldBelow, junk.trophySilverBelow], [20, 50]);
});

test('changing the rarity display never rescans the library', () => {
  const base = { achievement: { lang: 'english', rarityMode: 'rare' }, achievement_source: {}, steam: {}, general: {} };
  const next = { ...base, achievement: { ...base.achievement, rarityMode: 'trophy', trophyGoldBelow: 30 } };
  assert.equal(libraryRefresh.needsRescan(libraryRefresh.signature({ config: base }), libraryRefresh.signature({ config: next })), false);
});

test('the rare bounds load as numbers and a crossed triple resets to 5 / 10 / 15', () => {
  const defaults = loadWith('');
  assert.deepEqual([defaults.rareGoldMax, defaults.rareSilverMax, defaults.rareMax], [5, 10, 15]);
  const custom = loadWith('rareGoldMax=3\nrareSilverMax=12\nrareMax=25');
  assert.deepEqual([custom.rareGoldMax, custom.rareSilverMax, custom.rareMax], [3, 12, 25]);
  const crossed = loadWith('rareGoldMax=10\nrareSilverMax=5\nrareMax=25');
  assert.deepEqual([crossed.rareGoldMax, crossed.rareSilverMax, crossed.rareMax], [5, 10, 15]);
});

test('the popup opacity is a percent from 30 to 100, anything else is fully opaque', () => {
  const userData = makeTempDir('aw-opacity-setting-');
  fs.mkdirSync(path.join(userData, 'cfg'), { recursive: true });
  const opacityOf = (line) => {
    fs.writeFileSync(path.join(userData, 'cfg', 'options.ini'), `[overlay]\n${line}\n`, 'utf8');
    settings.setUserDataPath(userData);
    return settings.load().overlay.notificationOpacity;
  };
  assert.equal(opacityOf(''), 100);
  assert.equal(opacityOf('notificationOpacity=60'), 60);
  for (const bad of ['10', '150', 'abc', '55.5']) assert.equal(opacityOf(`notificationOpacity=${bad}`), 100, bad);
});
