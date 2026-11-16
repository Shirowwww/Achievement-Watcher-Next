'use strict';

/*
  The shared platinum rule on the games players reported (fixtures/platinumReports.json: the real
  Steam schemas with each achievement's global rate, fetched 2026-11-16). The notifier and the
  achievement page both ask platinumNameOf, so one answer here is the answer in both places.
*/

const assert = require('node:assert/strict');
const { test } = require('node:test');
const games = require('../fixtures/platinumReports.json');
const { platinumLikeName, platinumNameOf, looksLikePlatinum } = require('../../app/util/platinumLike.js');

const listOf = (appid) => games[appid].achievements;
const bare = (list) => list.map(({ rarityPercent: _rate, ...rest }) => rest);
const displayNameOf = (appid, name) => (listOf(appid).find((achievement) => achievement.name === name) || {}).displayName;

test("each reported game's own platinum is found, with and without rates", () => {
  const expected = {
    3986690: 'Obtain All Achievements',
    387340: 'Platinum Action Unleashed!',
    1731070: 'With The Three',
    502800: 'How I Spent My Summer Vacation',
    1984270: 'Agent of Perfection',
  };
  for (const [appid, displayName] of Object.entries(expected)) {
    assert.equal(displayNameOf(appid, platinumLikeName(listOf(appid))), displayName, games[appid].game);
    assert.equal(displayNameOf(appid, platinumLikeName(bare(listOf(appid)))), displayName, `${games[appid].game} without rates`);
  }
});

test('a game with no achievement of its own for the platinum gets none', () => {
  // Resident Evil 4 and Sakuna show the PlayStation platinum row instead.
  for (const appid of ['2050650', '1356670']) assert.equal(platinumLikeName(listOf(appid)), null, games[appid].game);
});

test('"all achievements for any gun" and in-game trophies are not the platinum', () => {
  for (const appid of ['262410', '393860']) assert.equal(platinumLikeName(listOf(appid)), null, games[appid].game);
  assert.equal(looksLikePlatinum('Earn all achievements for any gun'), false);
  assert.equal(looksLikePlatinum('Win all the trophies on grass'), false);
});

test('a platinum name counts only over a text that says everything', () => {
  assert.equal(looksLikePlatinum('You did everything you could do in this game!', 'Platinum Action Unleashed!'), true);
  assert.equal(looksLikePlatinum('Earn a platinum medal in any race', 'Platinum Pace'), false);
  assert.equal(looksLikePlatinum('Complete World Cup on the Legend difficulty level', 'World Cup (Platinum)'), false);
  assert.equal(looksLikePlatinum('Do everything you can for Kinzie', 'The Full Kinzie'), false);
  assert.equal(looksLikePlatinum('Complete Every Non-DLC Achievement in the game'), true);
});

test('the achievement tied to the PlayStation platinum wins over the text rule', () => {
  const game = { appid: '1984270', achievement: { list: listOf('1984270') } };
  assert.equal(platinumNameOf(game, { twinName: 'ACH_ID_26' }), 'ACH_ID_26');
  // A twin the list does not have is ignored.
  assert.equal(platinumNameOf(game, { twinName: 'NOPE' }), 'ACH_ID_46');
});

test('a list in another language is read through the English one', () => {
  const english = listOf('3986690');
  const french = english.map(({ name }) => ({ name, description: 'Texte en français' }));
  const game = { appid: '3986690', achievement: { list: french } };
  assert.equal(platinumNameOf(game, { lang: 'french', englishList: () => english }), 'LIB_ACH_000');
  assert.equal(platinumNameOf(game, { lang: 'french', englishList: () => null }), null);
  // The notifier's rates fill in a list cached without them.
  const rates = new Map(english.map((achievement) => [achievement.name, achievement.rarityPercent]));
  assert.equal(platinumNameOf({ appid: 'x', achievement: { list: bare(english) } }, { rates }), 'LIB_ACH_000');
});

test('an empty, missing or malformed game finds nothing', () => {
  for (const game of [undefined, null, {}, { achievement: {} }, { achievement: { list: 'x' } }]) assert.equal(platinumNameOf(game), null);
});
