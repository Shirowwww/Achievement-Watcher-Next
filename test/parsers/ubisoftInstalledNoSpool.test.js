'use strict';

// A Ubisoft Connect game that is installed but has no unlock yet has no spool file. It must still
// reach the library at 0/N, the way Ubisoft Connect itself lists it (issue #152, The Division 2).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-ubi-nospool-'));
process.env.APPDATA = tmp;
fs.mkdirSync(path.join(tmp, 'Achievement Watcher Next', 'logs'), { recursive: true });

const ubi = require('../../app/parser/ubisoftOfficial.js');
const ubiWatch = require('../../watchdog/console/ubisoftWatch.js');

function fixture() {
  const root = fs.mkdtempSync(path.join(tmp, 'case-'));
  const spoolRoot = path.join(root, 'spool');
  const achievementsRoot = path.join(root, 'achievements');
  fs.mkdirSync(path.join(spoolRoot, 'user-1'), { recursive: true });
  fs.mkdirSync(achievementsRoot, { recursive: true });
  const gameDir = path.join(root, 'The Division 2');
  fs.mkdirSync(gameDir);
  return { root, spoolRoot, achievementsRoot, gameDir };
}

test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

test('an installed product with an archive but no spool is listed with no unlocks', () => {
  const { spoolRoot, achievementsRoot, gameDir } = fixture();
  fs.writeFileSync(path.join(achievementsRoot, '4932_abcdef'), 'zip');

  const entries = ubi.scan({ spoolRoot, achievementsRoot, installs: [{ id: '4932', dir: gameDir }] });

  assert.equal(entries.length, 1);
  const [entry] = entries;
  assert.equal(entry.appid, 'uplay-4932');
  assert.equal(entry.data.uplayId, '4932');
  assert.equal(entry.data.spoolFilePath, null);
  assert.equal(entry.data.gameDir, gameDir);
  assert.equal(entry.data.trustedInstalled, true);
  assert.deepEqual(ubi.getAchievements(entry), {});
});

test('an installed product without an achievement archive is not listed', () => {
  const { spoolRoot, achievementsRoot, gameDir } = fixture();

  const entries = ubi.scan({ spoolRoot, achievementsRoot, installs: [{ id: '4932', dir: gameDir }] });

  assert.deepEqual(entries, []);
});

test('a stale registry install whose folder is gone is not listed', () => {
  const { root, spoolRoot, achievementsRoot } = fixture();
  fs.writeFileSync(path.join(achievementsRoot, '4932_abcdef'), 'zip');

  const entries = ubi.scan({ spoolRoot, achievementsRoot, installs: [{ id: '4932', dir: path.join(root, 'gone') }] });

  assert.deepEqual(entries, []);
});

test('a product with a spool keeps its spool entry, not a second installed-only one', () => {
  const { spoolRoot, achievementsRoot, gameDir } = fixture();
  fs.writeFileSync(path.join(achievementsRoot, '4932_abcdef'), 'zip');
  const spoolFile = path.join(spoolRoot, 'user-1', '4932.spool');
  fs.writeFileSync(spoolFile, Buffer.alloc(0));

  const entries = ubi.scan({ spoolRoot, achievementsRoot, installs: [{ id: '4932', dir: gameDir }] });

  assert.equal(entries.length, 1);
  assert.equal(entries[0].data.spoolFilePath, spoolFile);
});

test('the Watchdog watches an account folder that holds no spool yet', () => {
  const { spoolRoot } = fixture();

  assert.deepEqual(ubiWatch._internal.spoolUserDirs(spoolRoot), [path.join(spoolRoot, 'user-1')]);
  assert.deepEqual(ubiWatch._internal.discover(spoolRoot), []);
});

test('a spool that appears after startup becomes a target and toasts what follows', () => {
  const dir = path.join(tmp, 'spool-user');
  const dirTargets = [];
  const startedAt = 1000;

  const target = ubiWatch._internal.matchSpoolTarget(dirTargets, '4932.spool', dir, startedAt);

  assert.equal(target.appid, '4932');
  assert.equal(target.spoolFilePath, path.join(dir, '4932.spool'));
  assert.equal(dirTargets.length, 1);
  assert.equal(ubiWatch._internal.matchSpoolTarget(dirTargets, '4932.SPOOL', dir, startedAt), target);
  assert.equal(ubiWatch._internal.matchSpoolTarget(dirTargets, 'notes.txt', dir, startedAt), null);
  // Records earned before the spool was seen are the baseline; the new one is left to toast.
  const records = [
    { id: '1', time: 900 },
    { id: '2', time: 1100 },
  ];
  assert.deepEqual(ubiWatch._internal.baselineFor(target, null, records), ['1']);
});

test('a spool present at startup without a baseline still only seeds it', () => {
  const target = { appid: '971', spoolFilePath: 'x/971.spool' };
  const records = [{ id: '1', time: 900 }];

  assert.equal(ubiWatch._internal.baselineFor(target, null, records), null);
  assert.deepEqual(ubiWatch._internal.baselineFor(target, { unlocked: ['1'] }, records), ['1']);
});
