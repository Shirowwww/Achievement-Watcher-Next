'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const playtimeFile = require('../../app/util/playtimeFile.js');

// The game page shows when a game was first launched. Nothing recorded it before, so the first
// session written from now on stamps it, and nothing later may move or erase it.
function store(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-first-launch-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return playtimeFile.playtimeFile(dir);
}

test('the first session stamps when it started, later sessions leave it alone', (t) => {
  const file = store(t);
  assert.equal(playtimeFile.readFirst(file, '400'), 0, 'never launched');
  playtimeFile.addSession(file, '400', 60, 1_700_000_060_000);
  assert.equal(playtimeFile.readFirst(file, '400'), 1_700_000_000, 'the session began a minute before it was saved');
  playtimeFile.addSession(file, '400', 600, 1_800_000_000_000);
  assert.equal(playtimeFile.readFirst(file, '400'), 1_700_000_000);
  assert.deepEqual(playtimeFile.read(file, '400'), { total: 660, last: 1_800_000_000 }, 'the counters keep their two fields');
});

test('editing or resetting the total keeps the first launch', (t) => {
  const file = store(t);
  playtimeFile.addSession(file, '400', 60, 1_700_000_060_000);
  playtimeFile.write(file, '400', { total: 0, last: 0 });
  assert.equal(playtimeFile.readFirst(file, '400'), 1_700_000_000);
  playtimeFile.mergeMax(file, [{ appid: '400', total: 900, last: 1_750_000_000 }]);
  assert.equal(playtimeFile.readFirst(file, '400'), 1_700_000_000, 'a restored backup does not erase it either');
});

test('a profile backup carries the first launch, and a restore keeps the earlier one', (t) => {
  const file = store(t);
  playtimeFile.addSession(file, '400', 60, 1_700_000_060_000);
  playtimeFile.write(file, '220', { total: 5000, last: 1_600_000_000 });
  assert.deepEqual(playtimeFile.list(file), [
    { appid: '220', total: 5000, last: 1_600_000_000 },
    { appid: '400', total: 60, last: 1_700_000_060, first: 1_700_000_000 },
  ]);

  playtimeFile.mergeMax(file, [
    { appid: '400', total: 10, last: 5, first: 1_650_000_000 },
    { appid: '220', total: 10, last: 5, first: 1_500_000_000 },
    { appid: '500', total: 10, last: 5 },
  ]);
  assert.equal(playtimeFile.readFirst(file, '400'), 1_650_000_000, 'the other machine launched it earlier');
  assert.equal(playtimeFile.readFirst(file, '220'), 1_500_000_000);
  assert.equal(playtimeFile.readFirst(file, '500'), 0);

  const { validatePlaytime } = require('../../app/util/profileArchive.js');
  assert.deepEqual(validatePlaytime([{ appid: '400', total: 1, last: 2, first: 3, other: 4 }, { appid: '220', total: 1, last: 2 }]), [
    { appid: '400', total: 1, last: 2, first: 3 },
    { appid: '220', total: 1, last: 2 },
  ]);
  assert.throws(() => validatePlaytime([{ appid: '400', total: 1, last: 2, first: -1 }]));
});

test('a game played before this was recorded has no first launch, not a wrong one', (t) => {
  const file = store(t);
  playtimeFile.write(file, '220', { total: 5000, last: 1_600_000_000 });
  playtimeFile.addSession(file, '220', 30, 1_700_000_000_000);
  assert.equal(playtimeFile.readFirst(file, '220'), 0, 'its real first launch is unknown: today would be a lie');
});
