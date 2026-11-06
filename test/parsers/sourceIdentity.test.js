'use strict';

// What each source label means everywhere it is read: badge, icon, rarity, preset, launch.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const appDir = path.join(__dirname, '..', '..', 'app');
const rarity = require(path.join(appDir, 'util', 'rarity.js'));
const identity = require(path.join(appDir, 'util', 'sourceIdentity.js'));

const game = (extra) => ({ appid: '0', achievement: { list: [{ name: 'a' }] }, ...extra });

test('the overlay and the library read a recompiled console game rarity the same way', () => {
  // The overlay once had its own five-label set without the recompilations, so their rates
  // showed on the game page and never on the in-game popup.
  for (const [source, appid] of [
    ['PS3 Recomp', 'ps3recomp-NPWR12345_00'],
    ['Xbox 360 Recomp', '4D5307E6'],
    ['PS4 Recomp', 'ps4recomp-CUSA00001'],
  ]) {
    assert.deepEqual(rarity.resolveGameRarityContext(game({ appid, source })), { kind: 'emulator', source }, source);
  }
});

test('the main process passes no rarity source set of its own', () => {
  const init = fs.readFileSync(path.join(appDir, 'electron', 'init.js'), 'utf8');
  const app = fs.readFileSync(path.join(appDir, 'app.js'), 'utf8');
  for (const [name, text] of [
    ['init.js', init],
    ['app.js', app],
  ]) {
    assert.doesNotMatch(text, /emulatorSources:/, `${name} must leave the emulator set to sourceIdentity.js`);
  }
});

test('every label of one platform gets the same badge, icon and purchase mark', () => {
  assert.equal(identity.libraryBadgeOf('GOG Galaxy'), 'gog');
  assert.equal(identity.libraryBadgeOf('gog'), 'gog');
  assert.equal(identity.sourceIconFile('GOG Galaxy'), 'gog.svg');
  assert.equal(identity.sourceIconFile('gog'), 'gog.svg');
  assert.equal(identity.libraryBadgeOf('epic-official'), 'epic');
  assert.equal(identity.sourceIconFile('epic-official'), 'epic.svg');
  assert.equal(identity.purchasedPlatformOf('GOG Galaxy'), 'gog');
  // A Nemirtingas emulator label reads like the store but owns nothing.
  assert.equal(identity.purchasedPlatformOf('gog'), '');
  assert.equal(identity.purchasedPlatformOf('epic'), '');
  assert.equal(identity.purchasedPlatformOf('Steam (Shirow)'), 'steam');
  assert.equal(identity.purchasedPlatformOf('uPlay'), 'ubisoft');
  // The Xbox emulators say nothing about owning anything.
  for (const label of ['Xenia Emulator', 'XLiveLessNess', 'Xbox 360 Recomp']) assert.equal(identity.purchasedPlatformOf(label), '', label);
  assert.equal(identity.purchasedPlatformOf('Xbox PC'), 'xbox');
});

test('a Steam emulator label is classified but wears no platform badge', () => {
  for (const label of ['Codex', 'RUNE', 'OnlineFix', 'SmartSteamEmu', 'GBE Fork', 'MarkerPatch']) {
    assert.ok(identity.isClassifiedSource(label), label);
    assert.equal(identity.libraryBadgeOf(label), '', label);
  }
  assert.equal(identity.isClassifiedSource('Some New Crack'), false);
  assert.equal(identity.sourceIconFile('Some New Crack'), '');
});

test('the emulator platform drives presets, sounds and Exophase alike', () => {
  for (const [label, platform] of [
    ['RPCS3 Emulator', 'rpcs3'],
    ['PS3 Recomp', 'rpcs3'],
    ['ShadPS4 Emulator', 'shadps4'],
    ['PS4 Recomp', 'shadps4'],
    ['KytyPS5 Emulator', 'kytyps5'],
    ['Xenia Emulator', 'xenia'],
    ['Xbox 360 Recomp', 'xenia'],
    // The Watchdog's own short labels.
    ['RPCS3', 'rpcs3'],
    ['Xenia', 'xenia'],
  ]) {
    assert.equal(identity.emulatorPlatformOf(label), platform, label);
  }
  assert.equal(identity.emulatorPlatformOf('XLiveLessNess'), null);
  assert.equal(identity.emulatorPlatformOf('GBE Fork'), null);
  assert.equal(identity.trophyServiceOf('KytyPS5 Emulator'), 'trophy2');
  assert.equal(identity.trophyServiceOf('RPCS3 Emulator'), 'trophy');
  assert.equal(identity.trophyServiceOf('Xenia Emulator'), '');
});

test('the profile panel splits a console family by console', () => {
  assert.equal(identity.consoleGroupOf('RPCS3 Emulator'), 'playstation-3');
  assert.equal(identity.consoleGroupOf('PS4 Recomp'), 'playstation-4');
  assert.equal(identity.consoleGroupOf('KytyPS5 Emulator'), 'playstation-5');
  assert.equal(identity.consoleGroupOf('Xbox 360 Recomp'), 'xbox-360');
  assert.equal(identity.consoleGroupOf('PlayStation Network'), '');
  assert.equal(identity.consoleGroupOf('Xbox PC'), '');
});

test('account-only sources cannot be launched and keep their rates to themselves', () => {
  for (const label of ['RetroAchievements', 'PlayStation Network']) {
    assert.equal(identity.isLaunchable(label), false, label);
    assert.equal(identity.rarityPolicyOf(label), 'cache-only', label);
  }
  assert.equal(identity.isLaunchable('Codex'), true);
  assert.equal(identity.rarityPolicyOf('epic'), 'library-seeded');
  assert.equal(identity.rarityPolicyOf('Codex'), '');
});

test('each record type is read through one entry of the dispatch map', () => {
  const { SOURCE_READERS } = require(path.join(appDir, 'parser', 'achievements.js'))._internal;
  for (const [type, reader] of Object.entries(SOURCE_READERS)) {
    assert.equal(typeof reader.unlocks, 'function', `${type} reads its unlocks`);
    if (reader.schema) assert.equal(typeof reader.schema, 'function', `${type} schema`);
  }
  const fullArt = Object.keys(SOURCE_READERS).filter((type) => SOURCE_READERS[type].fullArtFallback);
  assert.deepEqual(fullArt.sort(), ['kytyps5', 'manual', 'ps3recomp', 'ps4recomp', 'psnLibrary', 'rpcs3', 'shadps4', 'x360recomp', 'xenia', 'xlln']);
});

test('the Xbox console logo goes to the Xbox emulators, not to the Xbox PC library', () => {
  for (const label of ['Xenia Emulator', 'XLiveLessNess', 'Xbox 360 Recomp']) assert.equal(identity.consoleBrandOf(label), 'xbox', label);
  assert.equal(identity.consoleBrandOf('Xbox PC'), '');
});
