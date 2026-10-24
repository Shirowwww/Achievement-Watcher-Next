'use strict';

/*
  The app relocks one achievement and tells the Watchdog. Its baseline must then hold that one
  achievement as locked and every other one as before, so earning it again announces it once and
  nothing else: forget() would empty the baseline and re-announce older unlocks through seeding.
*/

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const track = require('../track.js');
const { buildPreviousAchievementIndex } = require('../util/achievementIndex.js');

function tempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-track-relock-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

// The steam-emulator watcher's rule: an achievement notifies when the baseline had it locked.
function newUnlocks(baseline, scan) {
  const { byName } = buildPreviousAchievementIndex(baseline);
  return scan.filter((entry) => entry.Achieved && !(byName.get(entry.name) || {}).Achieved).map((entry) => entry.name);
}

test('a relocked achievement notifies once when earned again, and no other does', async (t) => {
  const dir = tempDir(t);
  track.setCacheDir(dir);
  await track.save('480', [
    { name: 'ACH_X', Achieved: true, UnlockTime: 1700000000, CurProgress: 10, MaxProgress: 10 },
    { name: 'ACH_Y', Achieved: true, UnlockTime: 1700000100 },
    { name: 'ACH_Z', Achieved: false, UnlockTime: 0 },
  ]);

  assert.equal(await track.relock('480', ['ach_x']), 1, 'matched like the schema is, whatever the case');

  const baseline = await track.load('480');
  assert.deepEqual(baseline[0], { name: 'ACH_X', Achieved: false, UnlockTime: 0, CurProgress: 0, MaxProgress: 10 });
  assert.deepEqual(baseline[1], { name: 'ACH_Y', Achieved: true, UnlockTime: 1700000100 });
  const onDisk = JSON.parse(fs.readFileSync(path.join(dir, '480.db'), 'utf8'));
  assert.equal(onDisk[0].Achieved, false, 'a restarted Watchdog reads the same baseline');

  const rescan = [
    { name: 'ACH_X', Achieved: true, UnlockTime: 1800000000 },
    { name: 'ACH_Y', Achieved: true, UnlockTime: 1700000100 },
    { name: 'ACH_Z', Achieved: false, UnlockTime: 0 },
  ];
  assert.deepEqual(newUnlocks(baseline, rescan), ['ACH_X']);
});

test('relocking a name the baseline does not hold writes nothing', async (t) => {
  const dir = tempDir(t);
  track.setCacheDir(dir);
  assert.equal(await track.relock('481', ['ACH_X']), 0);
  assert.equal(fs.existsSync(path.join(dir, '481.db')), false, 'no empty baseline is created, which would read as a first sight');
});

test('the relock message from the app reaches track.relock', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'watchdog.js'), 'utf8');
  assert.match(source, /if \(msg\.relockAchievement && msg\.relockAchievement\.appid && Array\.isArray\(msg\.relockAchievement\.names\)\) \{/);
  assert.match(source, /\.relock\(appid, msg\.relockAchievement\.names\)/);
});
