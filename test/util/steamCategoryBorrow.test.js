'use strict';

/*
  GOG, Ubisoft and Epic say nothing about which achievements belong to a DLC; Steam does (its
  achievement sets, or SteamHunters groups). The labels are borrowed from the same game on Steam,
  but only when the two lists really are the same game's.
*/
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { borrowCategories } = require(path.join(__dirname, '..', '..', 'app', 'util', 'steamCategoryBorrow.js'));

const steamList = [
  { name: 'ACH_STORY_1', displayName: 'Into the Fire', category: '' },
  { name: 'ACH_STORY_2', displayName: 'The Long Road' },
  { name: 'ACH_STORY_3', displayName: 'Homecoming' },
  { name: 'ACH_DLC_1', displayName: 'Blood & Wine', category: 'Blood and Wine' },
  { name: 'ACH_DLC_2', displayName: 'Hearts of Stone', category: 'Hearts of Stone' },
];

test('labels are borrowed by api name, ignoring case', () => {
  const store = steamList.map((entry) => ({ name: entry.name.toLowerCase(), displayName: entry.displayName }));
  const result = borrowCategories(store, steamList);
  assert.strictEqual(result.find((entry) => entry.name === 'ach_dlc_1').category, 'Blood and Wine');
  assert.strictEqual(result.find((entry) => entry.name === 'ach_story_1').category, undefined, 'a base-game achievement gets no label');
});

test('labels are borrowed by title when the store uses its own ids', () => {
  const store = [
    { name: '101', displayName: 'Into the fire' },
    { name: '102', displayName: 'The Long Road!' },
    { name: '103', displayName: 'Homecoming' },
    { name: '104', displayName: 'Blood and Wine' },
    { name: '105', displayName: 'Hearts of Stone' },
  ];
  const result = borrowCategories(store, steamList);
  assert.strictEqual(result.find((entry) => entry.name === '105').category, 'Hearts of Stone');
  assert.strictEqual(result.find((entry) => entry.name === '104').category, 'Blood and Wine', 'punctuation and & are not part of the match');
});

test('nothing is borrowed from a list that is not the same game', () => {
  const store = [
    { name: 'A', displayName: 'Hearts of Stone' },
    { name: 'B', displayName: 'Something else' },
    { name: 'C', displayName: 'Other thing' },
    { name: 'D', displayName: 'Unrelated' },
    { name: 'E', displayName: 'Nope' },
  ];
  assert.strictEqual(borrowCategories(store, steamList), null);
});

test('a label the store already has is kept, and the input is not mutated', () => {
  const store = steamList.map((entry) => ({ name: entry.name, displayName: entry.displayName, category: entry.name === 'ACH_DLC_2' ? 'Own label' : undefined }));
  const before = JSON.stringify(store);
  const result = borrowCategories(store, steamList);
  assert.strictEqual(result.find((entry) => entry.name === 'ACH_DLC_2').category, 'Own label');
  assert.strictEqual(result.find((entry) => entry.name === 'ACH_DLC_1').category, 'Blood and Wine');
  assert.strictEqual(JSON.stringify(store), before);
});

test('a Steam list without any label, or an empty one, borrows nothing', () => {
  const unlabeled = steamList.map(({ name, displayName }) => ({ name, displayName }));
  assert.strictEqual(borrowCategories(steamList, unlabeled), null);
  assert.strictEqual(borrowCategories([], steamList), null);
  assert.strictEqual(borrowCategories(steamList, []), null);
  assert.strictEqual(borrowCategories(null, null), null);
});

test('a title two Steam achievements share is never used to match', () => {
  const twins = [
    { name: 'X1', displayName: 'Survivor' },
    { name: 'X2', displayName: 'Survivor', category: 'DLC' },
    { name: 'X3', displayName: 'Three' },
    { name: 'X4', displayName: 'Four' },
    { name: 'X5', displayName: 'Five' },
    { name: 'X6', displayName: 'Six' },
  ];
  // Four of five found (enough to be the same game), but the one labelled entry is the twin.
  const store = [
    { name: '1', displayName: 'Survivor' },
    { name: '2', displayName: 'Three' },
    { name: '3', displayName: 'Four' },
    { name: '4', displayName: 'Five' },
    { name: '5', displayName: 'Six' },
  ];
  assert.strictEqual(borrowCategories(store, twins), null, 'only the ambiguous title carries a label, so there is nothing safe to borrow');
});
