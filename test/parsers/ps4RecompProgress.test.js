'use strict';

/*
  The unlock records PS4 ports keep besides their logs, on synthetic files: progress_user<N>.txt
  snapshots, 16-byte trophy flag files, trophies.json, and the dated session logs a launcher keeps.
  Several profiles are merged, never a reason to read nothing.
*/
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const progress = require(path.join(__dirname, '..', '..', 'app', 'parser', 'ps4RecompProgress.js'));
const fixture = require(path.join(__dirname, '..', 'helpers', 'ps4Recomp.js'));

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-ps4progress-'));
test.after(() => fs.rmSync(temp, { recursive: true, force: true }));

const NPWR = 'NPWR03852_00';
const snapshot = (rows, npcommid = NPWR) => ['DCP-TROPHIES 1', `npcommid ${npcommid}`, ...rows, ''].join('\n');

function flags(ids) {
  const out = Buffer.alloc(16);
  for (const id of ids) out.writeUInt32LE((out.readUInt32LE(Math.floor(id / 32) * 4) | (1 << id % 32)) >>> 0, Math.floor(id / 32) * 4);
  return out;
}

const pairs = (map) => [...map].sort((a, b) => Number(a[0]) - Number(b[0]));

test('a progress snapshot gives its rows only under its own header and NP id', () => {
  assert.deepEqual(progress.parseSnapshot(snapshot(['unlocked 3 1792512020', 'unlocked x 1', 'unlocked 7 1792512100']), NPWR).unlocks, [
    { id: '3', time: 1792512020 },
    { id: '7', time: 1792512100 },
  ]);
  assert.equal(progress.parseSnapshot(snapshot(['unlocked 3 1'], 'NPWR00001_00'), NPWR).valid, false, 'another game is refused');
  assert.equal(progress.parseSnapshot('unlocked 3 1\n', NPWR).valid, false, 'no header, no snapshot');
  assert.equal(progress.parseSnapshot(snapshot(['unlocked 3 1792512020']), '').valid, true, 'an unknown NP id accepts the header');
});

test('a flag file gives one unlock per set bit, little-endian words, and nothing for another size', () => {
  assert.deepEqual(progress.parseFlags(flags([0, 5, 33, 127])).map((u) => u.id), ['0', '5', '33', '127']);
  assert.ok(progress.parseFlags(flags([5])).every((u) => u.time === 0), 'no date is kept: unknown');
  assert.equal(progress.parseFlags(Buffer.alloc(15)), null);
});

test('trophies.json gives its ids and dates, and refuses what is not one', () => {
  const text = JSON.stringify({ version: 1, unlocked: [{ id: 3, date: '2026-10-20T16:00:20Z', unix: 1792512020 }, { id: 'x' }, { id: 4 }] });
  assert.deepEqual(progress.parseTrophiesJson(text), [{ id: '3', time: 1792512020 }, { id: '4', time: 0 }]);
  assert.equal(progress.parseTrophiesJson('{ cut'), null);
  assert.equal(progress.parseTrophiesJson('[]'), null);
});

test('several profiles are merged: earned by any, at the earliest known time', () => {
  const user = path.join(temp, 'multi', 'user');
  fixture.write(path.join(user, 'trophy', NPWR, 'progress_user1.txt'), snapshot(['unlocked 3 1792512100', 'unlocked 4 1792512200']));
  fixture.write(path.join(user, 'trophy', NPWR, 'progress_user2.txt'), snapshot(['unlocked 3 1792512000', 'unlocked 9 1792512300']));
  const read = progress.readProgress({ progressDirs: [user], npcommid: NPWR });
  assert.equal(read.unstable, false);
  assert.deepEqual(pairs(read.unlocked), [['3', 1792512000], ['4', 1792512200], ['9', 1792512300]]);
});

test('flag files of the game title are read, another title only when it is the only one there', () => {
  const user = path.join(temp, 'bins', 'user');
  fixture.write(path.join(user, 'trophies', 'CUSA00004-user1.bin'), flags([1, 2]));
  fixture.write(path.join(user, 'trophies', 'CUSA00004-user2.bin'), flags([7]));
  const info = { progressDirs: [user], titleId: 'CUSA00223' };
  assert.deepEqual(pairs(progress.readProgress(info).unlocked), [['1', 0], ['2', 0], ['7', 0]], 'a port that names its file after one region');
  fixture.write(path.join(user, 'trophies', 'CUSA00223-user1.bin'), flags([4]));
  assert.deepEqual(pairs(progress.readProgress(info).unlocked), [['4', 0]], "the game's own title wins");
  fixture.write(path.join(user, 'trophies', 'CUSA00223-user1.bin'), Buffer.alloc(3));
  assert.equal(progress.readProgress(info).unstable, true, 'a flag file caught mid-write is read again, not taken as empty');
});

test('trophies.dat and trophies.json in the user folder are read too', () => {
  const user = path.join(temp, 'flat', 'user');
  fixture.write(path.join(user, 'trophies.dat'), flags([6]));
  fixture.write(path.join(user, 'trophies.json'), JSON.stringify({ version: 1, unlocked: [{ id: 6, unix: 1792512020 }, { id: 8, unix: 1792512030 }] }));
  assert.deepEqual(pairs(progress.readProgress({ progressDirs: [user] }).unlocked), [['6', 1792512020], ['8', 1792512030]]);
  fixture.write(path.join(user, 'trophies.json'), '{"version": 1, "unl');
  assert.equal(progress.readProgress({ progressDirs: [user] }).unstable, true, 'a half-written JSON is read again later');
});

test('a snapshot of another game is set aside, the rest still reads', () => {
  const user = path.join(temp, 'other', 'user');
  fixture.write(path.join(user, 'trophy', NPWR, 'progress_user1.txt'), snapshot(['unlocked 3 1792512020'], 'NPWR00001_00'));
  fixture.write(path.join(user, 'trophies.dat'), flags([2]));
  const read = progress.readProgress({ progressDirs: [user], npcommid: NPWR });
  assert.deepEqual(pairs(read.unlocked), [['2', 0]]);
  assert.equal(read.rejected.length, 1);
});

test('session logs: the newest dated logs and game.log folders, never a server log or another file', () => {
  const logs = path.join(temp, 'sessions', 'logs');
  const old = fixture.write(path.join(logs, 'run-20261001-101010.log'), 'Runtime: trophy 1 unlocked\n');
  fixture.write(path.join(logs, 'dragons_crown_pro_2026-10-02_001.log'), '');
  const folder = fixture.write(path.join(logs, '2026-10-20_10-10-10', 'game.log'), 'Trophies: trophy 2 unlocked\n');
  fixture.write(path.join(logs, 'server-2026-10-20.log'), 'Runtime: trophy 9 unlocked\n');
  fixture.write(path.join(logs, 'notes.txt'), 'Runtime: trophy 9 unlocked\n');
  const past = new Date(Date.now() - 3600 * 1000);
  fs.utimesSync(old, past, past);
  const found = progress.sessionLogs({ sessionDirs: [logs, path.join(temp, 'sessions', 'absent')] });
  assert.equal(found[0], folder, 'newest first');
  assert.ok(found.includes(old));
  assert.ok(!found.some((file) => /server-|notes/.test(file)));
  assert.equal(progress.sessionLogs({ sessionDirs: [logs] }, 1).length, 1, 'bounded');
});

test('the files a watcher reacts to are named by the formats it reads', () => {
  for (const name of ['progress_user1.txt', 'CUSA00004-user1.bin', 'trophies.dat', 'trophies.json', 'run-20261020-101010.log', 'game.log', 'trophy07.txt']) {
    assert.equal(progress.isProgressName(name), true, name);
  }
  for (const name of ['shader.cache', 'savedata.bin', 'settings.json']) assert.equal(progress.isProgressName(name), false, name);
});
