'use strict';

/*
  The central invariant of this feature: with no positive ownership list, nothing is ever marked
  stale. A network outage or a dead token cannot empty a library.
*/

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { classify } = require('../../app/parser/steamAccount.js');

test('with no ownership list, nothing is ever marked stale', () => {
  const result = classify({ owned: null, family: [], installed: ['440'], listed: ['440', '570', '730'] });
  assert.equal(result.get('440'), 'installed');
  assert.equal(result.get('570'), 'owned');
  assert.equal(result.get('730'), 'owned');
});

test('an empty ownership list is treated as no list at all', () => {
  const result = classify({ owned: [], family: [], installed: [], listed: ['570'] });
  assert.equal(result.get('570'), 'owned');
});

test('an installed game is never stale, even when the API does not list it', () => {
  const result = classify({ owned: ['440'], family: [], installed: ['9999'], listed: ['440', '9999'] });
  assert.equal(result.get('9999'), 'installed');
});

test('a Steam Family game is legitimate without being owned', () => {
  const result = classify({ owned: ['440'], family: ['570'], installed: [], listed: ['440', '570'] });
  assert.equal(result.get('570'), 'family');
});

test('a game in none of the three sources is stale', () => {
  const result = classify({ owned: ['440'], family: ['570'], installed: ['440'], listed: ['440', '570', '730'] });
  assert.equal(result.get('730'), 'stale');
});

test('appids are compared as strings, whatever type they arrive as', () => {
  const result = classify({ owned: [440], family: [], installed: [], listed: ['440'] });
  assert.equal(result.get('440'), 'owned');
});
