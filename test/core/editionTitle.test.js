'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const { editionCandidate } = require(path.join(__dirname, '..', '..', 'app', 'util', 'editionTitle.js'));

test('a game exe named under its hub proposes its own title, without the mode suffix', () => {
  assert.equal(editionCandidate('Call of Duty®', 'Call of Duty®: Modern Warfare® 4 SP'), 'Call of Duty®: Modern Warfare® 4');
  assert.equal(editionCandidate('Call of Duty®', 'Call of Duty®: Black Ops 7 (Multiplayer)'), 'Call of Duty®: Black Ops 7');
});

test('the hub launcher itself and helper exes propose nothing', () => {
  assert.equal(editionCandidate('Call of Duty®', 'Call of Duty®'), '');
  assert.equal(editionCandidate('Call of Duty®', 'Call of Duty®  SP'), '');
});

test('an exe naming another game, or nothing, proposes nothing', () => {
  assert.equal(editionCandidate('Undertale', 'Leading Brand UNDERTALE-type Software'), '');
  assert.equal(editionCandidate('Little Nightmares III', ''), '');
  assert.equal(editionCandidate('', 'Call of Duty®: Modern Warfare® 4 SP'), '');
  // "Portal" is a prefix of "Portal 2" only by characters, never by words after the hub's name.
  assert.equal(editionCandidate('Portal', 'Portals of Phereon'), '');
});
