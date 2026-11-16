'use strict';

// Reset of several games at once (#192): each game keeps its own plan, backup and rollback.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const appDir = path.join(__dirname, '..', '..', 'app');
const resetMany = require(path.join(appDir, 'parser', 'achievementResetMany.js'));
const achievementReset = require(path.join(appDir, 'parser', 'achievementReset.js'));
const manualUnlock = require(path.join(appDir, 'parser', 'manualUnlock.js'));

function plan(supported, blocked = []) {
  return { supported, blocked, files: [] };
}

test('official platform games are skipped and said so, games with nothing recorded are skipped apart', () => {
  const games = [{ appid: 1 }, { appid: 2 }, { appid: 3 }];
  const plans = { 1: plan(true), 2: plan(false, [{ reason: 'official-platform', source: 'Steam' }]), 3: plan(false) };
  const { ready, skipped } = resetMany.planMany(games, { planOne: (game) => plans[game.appid] });
  assert.deepEqual(
    ready.map((entry) => entry.game.appid),
    [1]
  );
  assert.deepEqual(
    skipped.map((entry) => [entry.game.appid, entry.reason]),
    [
      [2, resetMany.SKIP.OFFICIAL],
      [3, resetMany.SKIP.NOTHING],
    ]
  );
});

test('a game whose planning throws is skipped with its message, the others are still planned', () => {
  const { ready, skipped } = resetMany.planMany([{ appid: 'a' }, { appid: 'b' }], {
    planOne: (game) => {
      if (game.appid === 'a') throw new Error('unreadable');
      return plan(true);
    },
  });
  assert.equal(ready.length, 1);
  assert.equal(skipped[0].reason, resetMany.SKIP.ERROR);
  assert.match(skipped[0].message, /unreadable/);
});

test('a game listed twice is planned once', () => {
  let calls = 0;
  resetMany.planMany([{ appid: 7 }, { appid: '7' }, null, {}], { planOne: () => (calls++, plan(true)) });
  assert.equal(calls, 1);
});

test('one failed game does not stop the next one, and is reported with its errors', () => {
  const ready = [
    { game: { appid: 1 }, plan: { appid: '1' } },
    { game: { appid: 2 }, plan: { appid: '2' } },
    { game: { appid: 3 }, plan: { appid: '3' } },
  ];
  const outcome = resetMany.runMany(ready, {
    runOne: (resetPlan) => {
      if (resetPlan.appid === '1') return { ok: false, errors: [{ path: 'x', message: 'locked' }] };
      if (resetPlan.appid === '2') throw new Error('boom');
      return { ok: true, errors: [] };
    },
  });
  assert.deepEqual(
    outcome.done.map((entry) => entry.game.appid),
    [3]
  );
  assert.deepEqual(
    outcome.failed.map((entry) => [entry.game.appid, entry.errors[0].message]),
    [
      [1, 'locked'],
      [2, 'boom'],
    ]
  );
});

test('real saves: two games are reset, each backed up under its own folder, the official one is left alone', () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-ach-reset-many-'));
  achievementReset.setUserDataPath(profile);
  manualUnlock.setUserDataPath(profile);
  const save = (name) => {
    const dir = path.join(profile, 'saves', name);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'achievements.json'), '{"ACH_1":{"earned":true,"earned_time":1}}');
    return dir;
  };
  const games = [
    { appid: '111', name: 'One', source: 'GSE', dataPaths: [{ source: 'GSE', path: save('one') }] },
    { appid: '222', name: 'Two', source: 'GSE', dataPaths: [{ source: 'GSE', path: save('two') }] },
    { appid: '333', name: 'Official', source: 'Steam (official)' },
  ];
  const { ready, skipped } = resetMany.planMany(games);
  assert.deepEqual(
    skipped.map((entry) => [entry.game.appid, entry.reason]),
    [['333', resetMany.SKIP.OFFICIAL]]
  );
  const { done, failed } = resetMany.runMany(ready);
  assert.equal(failed.length, 0);
  assert.equal(done.length, 2);
  for (const entry of done) {
    assert.equal(fs.existsSync(path.join(profile, 'saves', entry.game.name.toLowerCase(), 'achievements.json')), false);
    assert.ok(entry.result.backupDir.startsWith(achievementReset.gameBackupRoot(entry.game.appid)));
    assert.equal(achievementReset.listBackups(entry.game.appid).length, 1);
  }
});
