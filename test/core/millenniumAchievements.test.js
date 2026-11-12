'use strict';

/*
  The Millennium plugin (millennium/) turns the Steam bridge's answer into the shapes Steam keeps for
  an owned game, so Steam draws a non-Steam shortcut's achievements itself. Steam's own rules for
  secret achievements are the trap: a locked one is in no list, only in the total.
*/

const test = require('node:test');
const assert = require('node:assert/strict');
const { toSteamAchievements, toSteamQueries, toProgressEntry, readFeedMessage, toUnsigned, isShortcutAppId } = require('../../millennium/frontend/achievements.ts');
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

test('since Steam 2026-11-11 the page reads three query results, built here from the bridge answer', () => {
  const queries = toSteamQueries(
    game([
      achievement('DONE', { unlocked: true, unlockedAt: 300, rarity: 12.5 }),
      achievement('COUNT', { progress: { current: 6, max: 50 } }),
      achievement('SECRET', { hidden: true, iconLocked: '' }),
    ]),
    3858889198,
    '76561190000000000',
    BADGE
  );

  // One base set (id 0, which Steam names itself), each achievement keyed by a number from 1.
  assert.equal(queries.schema.appid, 3858889198);
  assert.equal(queries.schema.groups.length, 1);
  const [group] = queries.schema.groups;
  assert.deepEqual({ id: group.id, archived: group.archived, ispublic: group.ispublic, dlcappid: group.dlcappid }, { id: 0, archived: false, ispublic: true, dlcappid: 0 });
  assert.deepEqual(group.achievements.map((a) => [a.internal_key, a.api_name]), [[1, 'DONE'], [2, 'COUNT'], [3, 'SECRET']]);
  assert.deepEqual(group.achievements[1], {
    internal_key: 2,
    api_name: 'COUNT',
    name: 'COUNT name',
    description: 'COUNT text',
    hidden: false,
    archived: false,
    icon_achieved: 'https://cdn/COUNT.jpg',
    icon_unachieved: 'https://cdn/COUNT_gray.jpg',
    groupid: 0,
    min_progress: 0,
    max_progress: 50,
  });
  assert.equal(group.achievements[2].icon_unachieved, 'https://cdn/SECRET.jpg', 'no grey picture: the colour one');

  // Only known rarities: Steam counts a missing one as unknown, a 0 as the rarest.
  assert.deepEqual(queries.percentages, { percentages: { 1: 12.5 } });

  assert.equal(queries.user.steamid, '76561190000000000');
  assert.deepEqual(queries.user.achievements[1], { internal_key: 1, unlocked: true, unlock_time: 300, progress: undefined });
  assert.deepEqual(queries.user.achievements[2], { internal_key: 2, unlocked: false, unlock_time: 0, progress: 6 });
  // Without is_achievable Steam hides every locked achievement of the set.
  assert.deepEqual(queries.user.groups[0], { groupid: 0, is_achievable: true, completed_achievements: 1, is_completed: false, time_completed: undefined });
});

test('a finished game marks its set completed at the last unlock, and no achievements is nothing to show', () => {
  const queries = toSteamQueries(game([achievement('A', { unlocked: true, unlockedAt: 10 }), achievement('B', { unlocked: true, unlockedAt: 20 })]), 3858889198, '1', BADGE);
  assert.deepEqual(queries.user.groups[0], { groupid: 0, is_achievable: true, completed_achievements: 2, is_completed: true, time_completed: 20 });
  assert.equal(toSteamQueries(game([]), 3858889198, '1', BADGE), null);
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
