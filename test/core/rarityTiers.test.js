'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const tiers = require('../../app/util/rarityTiers.js');
const overlayUi = require('../../app/util/overlayUi.js');
const { calculateTrophyStats } = require('../../app/util/trophyStats.js');

// The tiering every build before the setting existed, kept verbatim as the reference.
function legacyTier(percent) {
  if (percent === null || percent === undefined || percent === '') return null;
  const raw = Number(percent);
  if (!Number.isFinite(raw)) return null;
  const p = Math.round(raw * 10) / 10;
  if (p < 0 || p > 15) return null;
  if (p <= 5) return 'gold';
  if (p <= 10) return 'silver';
  return 'bronze';
}

test('rare mode is the historic tiering, for every input, with or without a mode', () => {
  const samples = [null, undefined, '', 'x', NaN, -1, 0, 0.04, 4.96, 5, 5.04, 5.05, 5.1, 9.95, 10, 10.04, 10.05, 14.95, 15, 15.04, 15.05, 15.1, 50, 100, '7.5', '12'];
  for (const sample of samples) {
    assert.equal(tiers.tierFor(sample), legacyTier(sample), `default for ${String(sample)}`);
    assert.equal(tiers.tierFor(sample, 'rare'), legacyTier(sample), `rare for ${String(sample)}`);
    assert.equal(tiers.tierFor(sample, 'nonsense'), legacyTier(sample), `unknown mode for ${String(sample)}`);
    assert.equal(overlayUi.rarityTier(sample), legacyTier(sample), `overlayUi for ${String(sample)}`);
  }
});

test('trophy mode grades every achievement: gold under 20%, silver under 50%, bronze otherwise', () => {
  assert.equal(tiers.tierFor(0, 'trophy'), 'gold');
  assert.equal(tiers.tierFor(19.9, 'trophy'), 'gold');
  assert.equal(tiers.tierFor(20, 'trophy'), 'silver');
  assert.equal(tiers.tierFor(49.9, 'trophy'), 'silver');
  assert.equal(tiers.tierFor(50, 'trophy'), 'bronze');
  assert.equal(tiers.tierFor(100, 'trophy'), 'bronze');
  for (const unknown of [null, undefined, '', 'x', NaN]) assert.equal(tiers.tierFor(unknown, 'trophy'), 'bronze');
});

test('trophy thresholds are adjustable and a bad pair falls back to the defaults together', () => {
  assert.equal(tiers.tierFor(14, 'trophy', { goldBelow: 10, silverBelow: 40 }), 'silver');
  assert.equal(tiers.tierFor(14, 'trophy', { goldBelow: 15, silverBelow: 40 }), 'gold');
  assert.deepEqual(tiers.normalizeThresholds({ goldBelow: '15', silverBelow: '60' }), { goldBelow: 15, silverBelow: 60 });
  const defaults = { goldBelow: 20, silverBelow: 50 };
  assert.deepEqual(tiers.normalizeThresholds(), defaults);
  assert.deepEqual(tiers.normalizeThresholds({ goldBelow: 30, silverBelow: 30 }), defaults);
  assert.deepEqual(tiers.normalizeThresholds({ goldBelow: 60, silverBelow: 30 }), defaults);
  assert.deepEqual(tiers.normalizeThresholds({ goldBelow: 0, silverBelow: 50 }), defaults);
  assert.deepEqual(tiers.normalizeThresholds({ goldBelow: 20, silverBelow: 99 }), defaults);
  assert.deepEqual(tiers.normalizeThresholds({ goldBelow: 'abc', silverBelow: 50 }), defaults);
});

test('the mode setting only ever resolves to one of the two modes', () => {
  assert.equal(tiers.normalizeMode('trophy'), 'trophy');
  assert.equal(tiers.normalizeMode('TROPHY'), 'trophy');
  for (const other of ['rare', '', undefined, null, 'gold', 5]) assert.equal(tiers.normalizeMode(other), 'rare');
});

test('a notification gets the tier its preset paints, platinum apart, progress and playtime none', () => {
  const rare = { mode: 'rare' };
  assert.equal(tiers.notificationTier({ ...rare, percent: 3, type: 'achievement' }), 'gold');
  assert.equal(tiers.notificationTier({ ...rare, percent: null, type: 'achievement' }), '');
  assert.equal(tiers.notificationTier({ ...rare, percent: 40 }), '');
  const trophy = { mode: 'trophy' };
  assert.equal(tiers.notificationTier({ ...trophy, percent: 40 }), 'silver');
  assert.equal(tiers.notificationTier({ ...trophy, percent: null }), 'bronze');
  for (const mode of ['rare', 'trophy']) {
    assert.equal(tiers.notificationTier({ mode, percent: 1, type: 'platinum' }), 'platinum');
    assert.equal(tiers.notificationTier({ mode, percent: 1, type: 'progress' }), '');
    assert.equal(tiers.notificationTier({ mode, percent: 1, type: 'playtime' }), '');
  }
});

test('the profile showcase counts the same unlocks differently per mode', () => {
  const ach = (name) => ({ name, Achieved: 1, UnlockTime: 1 });
  const game = { appid: 1, achievement: { unlocked: 4, total: 4, list: [ach('a'), ach('b'), ach('c'), ach('d')] } };
  const rarityOf = () => new Map([['a', 3], ['b', 30], ['c', 80]]);
  const rare = calculateTrophyStats([game], { rarityOf });
  assert.deepEqual([rare.gold, rare.silver, rare.bronze, rare.common, rare.unranked], [1, 0, 0, 3, 1]);
  const trophy = calculateTrophyStats([game], { rarityOf, mode: 'trophy' });
  assert.deepEqual([trophy.gold, trophy.silver, trophy.bronze, trophy.common, trophy.unranked], [1, 1, 2, 0, 1]);
  const custom = calculateTrophyStats([game], { rarityOf, mode: 'trophy', thresholds: { goldBelow: 40, silverBelow: 90 } });
  assert.deepEqual([custom.gold, custom.silver, custom.bronze], [2, 1, 1]);
});

test('no other module keeps its own rarity cut-offs', () => {
  const root = path.join(__dirname, '..', '..', 'app');
  const files = ['util/overlayUi.js', 'util/trophyStats.js', 'ui/game.js', 'view/overlay.js', 'app.js', 'electron/init.js'];
  for (const file of files) {
    const text = fs.readFileSync(path.join(root, file), 'utf8');
    assert.doesNotMatch(text, /percent\s*<=\s*5\b|p\s*<=\s*5\)|percent\s*>\s*15\b/, `${file} spells a rare cut-off`);
  }
});
