'use strict';

/*
  The Millennium plugin (millennium/) turns the Steam bridge's answer into the shapes Steam keeps for
  an owned game, so Steam draws a non-Steam shortcut's achievements itself. Steam's own rules for
  secret achievements are the trap: a locked one is in no list, only in the total.
*/

const test = require('node:test');
const assert = require('node:assert/strict');
const { toSteamAchievements, toProgressEntry, readFeedMessage, toUnsigned, isShortcutAppId } = require('../../millennium/frontend/achievements.ts');
const { keepsSeparateLists } = require('../../millennium/frontend/cartridges.ts');

const BADGE = 'data:image/svg+xml,badge';

function achievement(id, fields = {}) {
  return { id, name: `${id} name`, description: `${id} text`, icon: `https://cdn/${id}.jpg`, iconLocked: `https://cdn/${id}_gray.jpg`, hidden: false, unlocked: false, unlockedAt: 0, ...fields };
}

function game(list) {
  return { id: 'x360-4D5309C9', name: 'Forza Horizon', total: list.length, unlocked: list.filter((a) => a.unlocked).length, achievements: list };
}

test('unlocked achievements come first, newest first, in the colour icon', () => {
  const steam = toSteamAchievements(
    game([achievement('OLD', { unlocked: true, unlockedAt: 100 }), achievement('NEW', { unlocked: true, unlockedAt: 200 }), achievement('LOCKED', { rarity: 40 })]),
    BADGE
  );

  assert.equal(steam.nTotal, 3);
  assert.equal(steam.nAchieved, 2);
  assert.deepEqual(steam.vecAchieved.map((a) => a.strID), ['NEW', 'OLD']);
  assert.deepEqual(steam.vecHighlight.map((a) => a.strID), ['NEW', 'OLD']);
  assert.deepEqual(steam.vecAchieved[0], { strID: 'NEW', strName: 'NEW name', strDescription: 'NEW text', strImage: 'https://cdn/NEW.jpg', bAchieved: true, rtUnlocked: 200, bHidden: false });
  assert.deepEqual(steam.vecUnachieved[0], { strID: 'LOCKED', strName: 'LOCKED name', strDescription: 'LOCKED text', strImage: 'https://cdn/LOCKED_gray.jpg', bAchieved: false, rtUnlocked: 0, bHidden: false, flAchieved: 40 });
});

test('a locked secret achievement is only counted, an unlocked one is listed twice as Steam does', () => {
  const steam = toSteamAchievements(game([achievement('SECRET', { hidden: true }), achievement('FOUND', { hidden: true, unlocked: true, unlockedAt: 5 })]), BADGE);

  assert.equal(steam.nTotal, 2);
  assert.deepEqual(steam.vecUnachieved, []);
  assert.deepEqual(steam.vecHidden.map((a) => a.strID), ['SECRET']);
  assert.deepEqual(steam.vecAchievedHidden.map((a) => a.strID), ['FOUND']);
  assert.deepEqual(steam.vecAchieved.map((a) => a.strID), ['FOUND']);
});

test('locked achievements are ordered by how many players have them, then partly done ones show their progress', () => {
  const steam = toSteamAchievements(
    game([achievement('RARE', { rarity: 2 }), achievement('COMMON', { rarity: 80 }), achievement('UNKNOWN'), achievement('COUNT', { rarity: 10, progress: { current: 6, max: 50 } })]),
    BADGE
  );

  assert.deepEqual(steam.vecUnachieved.map((a) => a.strID), ['COMMON', 'COUNT', 'RARE', 'UNKNOWN']);
  const count = steam.vecUnachieved[1];
  assert.equal(count.flMinProgress, 0);
  assert.equal(count.flCurrentProgress, 6);
  assert.equal(count.flMaxProgress, 50);
});

test('an achievement without a picture gets the stand-in, and a game with none is nothing to show', () => {
  const steam = toSteamAchievements(game([achievement('BARE', { icon: '', iconLocked: '' })]), BADGE);
  assert.equal(steam.vecUnachieved[0].strImage, BADGE);
  assert.equal(toSteamAchievements(game([]), BADGE), null);
  assert.equal(toSteamAchievements(null, BADGE), null);
});

test('the play bar entry carries the counts Steam computes for an owned game', () => {
  const steam = toSteamAchievements(game([achievement('A', { unlocked: true, unlockedAt: 1 }), achievement('B')]), BADGE);
  assert.deepEqual(toProgressEntry(steam, 3858889198, 1790000000), { appid: 3858889198, unlocked: 1, total: 2, percentage: 50, all_unlocked: false, cache_time: 1790000000, vetted: true });
});

test('shortcut appids come signed or unsigned and are compared unsigned', () => {
  assert.equal(toUnsigned(-436078098), 3858889198);
  assert.equal(toUnsigned('3858889198'), 3858889198);
  assert.equal(toUnsigned('abc'), undefined);
  assert.equal(isShortcutAppId(-436078098), true);
  assert.equal(isShortcutAppId(1478500), false);
});

test('Steam Cartridges is handed the lists only from a version that keeps one per game', () => {
  // 0.6.6-beta filed every extension's list under schema "0": Big Walk showed Bloodborne's 0/40.
  assert.equal(keepsSeparateLists('0.6.6-beta'), false);
  assert.equal(keepsSeparateLists('0.6.5'), false);
  assert.equal(keepsSeparateLists('0.6.7-beta'), true);
  assert.equal(keepsSeparateLists('1.0.0'), true);
  assert.equal(keepsSeparateLists(''), false, 'an unknown version is not trusted');
});

test('the feed carries bridge answers and unlocks; rehearsals and anything else are ignored', () => {
  assert.deepEqual(readFeedMessage(JSON.stringify({ cmd: 'bridge-game', id: 4, found: false })), { kind: 'reply', id: 4, reply: { cmd: 'bridge-game', id: 4, found: false } });
  assert.deepEqual(readFeedMessage(JSON.stringify({ appID: 1478500, achievement: 'A', notificationType: 'achievement' })), { kind: 'unlock', gameId: '1478500' });
  assert.deepEqual(readFeedMessage(JSON.stringify({ appID: 'x', achievement: 'A', notificationType: 'progress', progress: { current: 1, max: 2 } })), { kind: 'unlock', gameId: 'x' });
  assert.equal(readFeedMessage(JSON.stringify({ appID: 'x', achievement: 'A', test: true })), null);
  assert.equal(readFeedMessage(JSON.stringify({ appID: 'x', notificationType: 'playtime' })), null);
  assert.equal(readFeedMessage('not json'), null);
});
