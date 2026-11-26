'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const track = require('../track.js');
const { announcedLocally, recordAccountUnlock } = require('../util/accountUnlockDedupe.js');

function isolatedTrack(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-dedupe-'));
  track.setCacheDir(dir);
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
}

const entry = (name, Achieved, UnlockTime = 0) => ({ name, Achieved, CurProgress: 0, MaxProgress: 0, UnlockTime });

test('an unlock the local save already announced is not announced again by the account poll (#231)', async (t) => {
  isolatedTrack(t);
  await track.save('2483190', [entry('ACHIEVEMENT_1', true, 1795000000), entry('ACHIEVEMENT_3', false)]);
  assert.equal(await announcedLocally(track, '2483190', 'ACHIEVEMENT_1'), true);
  assert.equal(await announcedLocally(track, '2483190', 'achievement_1'), true, 'names compare like the local path does');
  assert.equal(await announcedLocally(track, '2483190', 'ACHIEVEMENT_3'), false);
  assert.equal(await announcedLocally(track, '2483190', 'ACHIEVEMENT_9'), false);
  assert.equal(await announcedLocally(track, '1551360', 'ACHIEVEMENT_1'), false);
});

test('an unlock the account announced first is marked in the local baseline, so the save does not repeat it', async (t) => {
  isolatedTrack(t);
  await track.save('2483190', [entry('ACHIEVEMENT_1', true, 1795000000), entry('ACHIEVEMENT_3', false)]);
  assert.equal(await recordAccountUnlock(track, '2483190', 'ACHIEVEMENT_3', 1795000100), true);
  assert.equal(await recordAccountUnlock(track, '2483190', 'ACHIEVEMENT_7', 1795000200), true);
  const baseline = await track.load('2483190');
  assert.deepEqual(baseline.find((e) => e.name === 'ACHIEVEMENT_3'), entry('ACHIEVEMENT_3', true, 1795000100));
  assert.deepEqual(baseline.find((e) => e.name === 'ACHIEVEMENT_7'), entry('ACHIEVEMENT_7', true, 1795000200));
  assert.deepEqual(baseline.find((e) => e.name === 'ACHIEVEMENT_1'), entry('ACHIEVEMENT_1', true, 1795000000), 'an older unlock keeps its time');
});

test('no baseline is created for a game the local save has never been read for', async (t) => {
  // A baseline holding one entry would make the first local read announce every older unlock at once.
  isolatedTrack(t);
  assert.equal(await recordAccountUnlock(track, '2483190', 'ACHIEVEMENT_3', 1795000100), false);
  assert.deepEqual(await track.load('2483190'), []);
});
