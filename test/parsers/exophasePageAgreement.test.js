'use strict';

/*
  An Exophase page is only used for a game when its awards are that game's: a slug guessed from a
  name can land on another game filed under the same words (a remaster, a sequel, a namesake), and
  its rates or descriptions were then attached to whichever titles happened to coincide.
*/

const test = require('node:test');
const assert = require('node:assert/strict');
const exophase = require('../../app/parser/exophase.js');

const award = (title, description, rarityPct, extra = {}) => ({ titles: { english: title }, descriptions: { english: description }, rarityPct, ...extra });
const ach = (name, displayName, description, extra = {}) => ({ name, displayName, description, ...extra });

const schema = [
  ach('0', 'First Steps', 'Finish the tutorial.'),
  ach('1', 'Sharpshooter', 'Land 100 headshots.'),
  ach('2', 'Collector', 'Find every relic.'),
  ach('3', 'The End', 'Finish the story.'),
];
const samePage = [
  award('First Steps', 'Finish the tutorial.', 90),
  award('Sharpshooter', 'Land 100 headshots.', 20),
  award('Collector', 'Find every relic.', 5),
  award('The End', 'Finish the story.', 40),
];
// A namesake: one generic title in common, everything else another game.
const otherGame = [
  award('The End', 'Beat the final boss on any difficulty.', 70),
  award('Speed Demon', 'Win a race in under a minute.', 10),
  award('Mechanic', 'Upgrade every car part.', 3),
  award('Champion', 'Win the championship.', 15),
];

test('a page listing the same awards agrees with the local list', () => {
  assert.equal(exophase.exophasePageAgrees(schema, samePage), true);
});

test('a page sharing a single generic title with the local list is another game', () => {
  assert.equal(exophase.exophasePageAgrees(schema, otherGame), false);
});

test('a few awards missing on either side still agree', () => {
  assert.equal(exophase.exophasePageAgrees(schema, samePage.slice(0, 3)), true, 'the page lists fewer awards');
  assert.equal(exophase.exophasePageAgrees([...schema, ach('4', 'DLC Hero', 'Beat the expansion.')], samePage), true, 'the list has a DLC award more');
});

test('a list in another language agrees through the console order and grades', () => {
  const french = schema.map((a, at) => ({ ...a, displayName: `Titre ${at}`, description: `Description ${at}`, type: at === 3 ? 'G' : 'B' }));
  const graded = samePage.map((item, at) => ({ ...item, grade: at === 3 ? 'G' : 'B' }));
  assert.equal(exophase.exophasePageAgrees(french, graded), true);
});

test('a list with nothing to compare by (placeholder titles only) is not judged', () => {
  const hidden = schema.map((a, at) => ({ ...a, displayName: `Hidden trophy ${at}`, description: '' }));
  assert.equal(exophase.exophasePageAgrees(hidden, otherGame), true);
  assert.equal(exophase.exophasePageAgrees([], otherGame), true);
});

test('an empty page never agrees with a list it could be compared with', () => {
  assert.equal(exophase.exophasePageAgrees(schema, []), false);
});

test('one award in common is too thin to accept a page for a short list', () => {
  const two = schema.slice(0, 2);
  assert.equal(exophase.exophasePageAgrees(two, [award('First Steps', 'Finish the tutorial.', 90), award('Other', 'Something else entirely here.', 4)]), false);
  assert.equal(exophase.exophasePageAgrees(two, samePage.slice(0, 2)), true);
});
