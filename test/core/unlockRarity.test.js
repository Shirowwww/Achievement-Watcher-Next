'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { recordUnlockRarity, readUnlockRarity, FILE_NAME } = require('../../app/util/unlockRarity.js');

// #208: the game page shows the global rate an achievement had the day it was earned, beside today's.
function profile(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-unlock-rarity-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test('an unlock keeps its rate and time, read back by appid', (t) => {
  const root = profile(t);
  assert.equal(recordUnlockRarity({ appid: '400', source: 'Steam', name: 'ACH_1', percent: 2.1, at: 1_700_000_000, root }), true);
  assert.deepEqual(readUnlockRarity('400', { root }).get('ACH_1'), { percent: 2.1, at: 1_700_000_000 });
  assert.equal(readUnlockRarity('401', { root }).size, 0, 'another game has nothing');
});

test('the library and the Watchdog may name the source differently', (t) => {
  const root = profile(t);
  recordUnlockRarity({ appid: '2638890', source: 'GSE Saves', name: 'A', percent: 40, at: 1, root });
  recordUnlockRarity({ appid: '2638890', source: 'Uplay', name: 'B', percent: 3, at: 2, root });
  const rates = readUnlockRarity('2638890', { root });
  assert.deepEqual([...rates.keys()].sort(), ['A', 'B']);
});

test('a later unlock after a relock replaces the old rate, others stay', (t) => {
  const root = profile(t);
  recordUnlockRarity({ appid: '400', source: 'Steam', name: 'A', percent: 2, at: 10, root });
  recordUnlockRarity({ appid: '400', source: 'Steam', name: 'B', percent: 50, at: 11, root });
  recordUnlockRarity({ appid: '400', source: 'Steam', name: 'A', percent: 9.5, at: 20, root });
  const rates = readUnlockRarity('400', { root });
  assert.deepEqual(rates.get('A'), { percent: 9.5, at: 20 });
  assert.deepEqual(rates.get('B'), { percent: 50, at: 11 });
});

test('no rate, a rate out of range or a missing name records nothing', (t) => {
  const root = profile(t);
  for (const percent of [null, undefined, '', 'abc', -1, 101, Number.NaN]) {
    assert.equal(recordUnlockRarity({ appid: '400', source: 'Steam', name: 'A', percent, at: 1, root }), false, String(percent));
  }
  assert.equal(recordUnlockRarity({ appid: '', source: 'Steam', name: 'A', percent: 5, root }), false);
  assert.equal(recordUnlockRarity({ appid: '400', source: 'Steam', name: '', percent: 5, root }), false);
  assert.equal(fs.existsSync(path.join(root, 'cfg', FILE_NAME)), false);
});

test('an unlock without a time is stamped now', (t) => {
  const root = profile(t);
  const before = Math.floor(Date.now() / 1000);
  recordUnlockRarity({ appid: '400', source: 'Steam', name: 'A', percent: 0, root });
  const row = readUnlockRarity('400', { root }).get('A');
  assert.equal(row.percent, 0, 'a 0% rate is a real rate');
  assert.ok(row.at >= before);
});

test('a file too big to read is never overwritten by the next unlock', (t) => {
  const root = profile(t);
  fs.mkdirSync(path.join(root, 'cfg'), { recursive: true });
  const file = path.join(root, 'cfg', FILE_NAME);
  const big = JSON.stringify({ '400::Steam': { A: { percent: 1, at: 1 } }, pad: 'x'.repeat(4 * 1024 * 1024) });
  fs.writeFileSync(file, big);
  assert.equal(recordUnlockRarity({ appid: '401', source: 'Steam', name: 'B', percent: 5, at: 2, root }), false);
  assert.equal(fs.readFileSync(file, 'utf8'), big, 'the rates already kept stay');
});

test('a broken file reads as empty and is rewritten on the next unlock', (t) => {
  const root = profile(t);
  fs.mkdirSync(path.join(root, 'cfg'), { recursive: true });
  const file = path.join(root, 'cfg', FILE_NAME);
  fs.writeFileSync(file, '{ not json');
  assert.equal(readUnlockRarity('400', { root }).size, 0);
  fs.writeFileSync(file, JSON.stringify({ '400::Steam': 'oops', '401::Steam': { A: { percent: 'x' } } }));
  assert.equal(readUnlockRarity('401', { root }).size, 0, 'a bad rate is skipped');
  recordUnlockRarity({ appid: '400', source: 'Steam', name: 'A', percent: 7, at: 3, root });
  assert.deepEqual(readUnlockRarity('400', { root }).get('A'), { percent: 7, at: 3 });
});
