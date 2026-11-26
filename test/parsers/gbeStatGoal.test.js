'use strict';

/*
  #232: counter achievements that never unlock under GBE. GBE unlocks one only when SetStat moves its
  stat to the goal, so a stat already there, one whose link is missing, or one declared with another
  type never fires it. AW Next reads the stat files and counts the achievement itself; these tests
  pin every place that chain could break.
*/

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const app = (...parts) => path.join(__dirname, '..', '..', 'app', ...parts);
const emuSaveRoots = require(app('parser', 'emuSaveRoots.js'));
const statProgress = require(app('parser', 'statProgress.js'));
const gbeStatFiles = require(app('parser', 'gbeStatFiles.js'));
const gbeSchema = require(app('parser', 'gbeSchema.js'));
const goldberg = require(app('parser', 'goldberg.js'));

const link = (name, stat, max = 100) => ({ name, progress: { min_val: 0, max_val: max, value: { operation: 'statvalue', operand1: stat } } });
const int32 = (n) => {
  const b = Buffer.alloc(4);
  b.writeInt32LE(n, 0);
  return b;
};

function tempDir(t, prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test('a GBE stat file moving is read through the achievements.json of its save folder', () => {
  const watch = emuSaveRoots.watchOptions(emuSaveRoots.GSE_WATCH);
  const save = path.join('C:', 'GSE Saves', '1245620');
  assert.equal(emuSaveRoots.saveFileFor(path.join(save, 'stats', 'kills_total'), watch), path.join(save, 'achievements.json'));
  assert.equal(emuSaveRoots.saveFileFor(path.join(save, 'Stats', 'kills_total'), watch), path.join(save, 'achievements.json'));
  assert.equal(emuSaveRoots.saveFileFor(path.join(save, 'achievements.json'), watch), path.join(save, 'achievements.json'));
  assert.equal(emuSaveRoots.saveFileFor(path.join(save, 'settings', 'configs.user.ini'), watch), null);
});

test('a CODEX or RUNE stats.ini is still read through the achievements.ini beside it', () => {
  const rune = emuSaveRoots.SAVE_ROOTS.find((row) => row.dir.join('/') === 'Documents/Steam/RUNE');
  const watch = emuSaveRoots.watchOptions(rune.watch);
  const save = path.join('C:', 'Users', 'Public', 'Documents', 'Steam', 'RUNE', '1245620');
  assert.equal(emuSaveRoots.saveFileFor(path.join(save, 'stats.ini'), watch), path.join(save, 'achievements.ini'));
  assert.equal(emuSaveRoots.saveFileFor(path.join(save, 'achievements.ini'), watch), path.join(save, 'achievements.ini'));
  // Only GBE keeps a stats folder: CODEX has none to watch.
  assert.equal(emuSaveRoots.saveFileFor(path.join(save, 'stats', 'kills_total'), watch), null);
});

test('links the game file lacks are taken from the other tables, the game file winning', (t) => {
  const cacheDir = tempDir(t, 'aw-gbe-goal-');
  statProgress.writeProgressCache(cacheDir, '1245620', [link('ACH_KILLS', 'cached_kills', 50), link('ACH_LOOT', 'loot_total', 30)]);
  const found = statProgress.findProgressSchema({ appid: '1245620', localSchema: [link('ACH_KILLS', 'kills_total', 100), { name: 'ACH_ONCE' }], cacheDir });
  assert.equal(found.origin, 'game');
  assert.deepEqual(
    found.schema.filter((a) => a.progress).map((a) => [a.name, a.progress.value.operand1, a.progress.max_val]),
    [
      ['ACH_KILLS', 'kills_total', 100],
      ['ACH_LOOT', 'loot_total', 30],
    ]
  );
});

test('a save folder holding GBE stat files is told apart from one with none', (t) => {
  const withStats = tempDir(t, 'aw-gbe-goal-');
  fs.mkdirSync(path.join(withStats, 'stats'));
  fs.writeFileSync(path.join(withStats, 'stats', 'kills_total'), int32(3));
  const without = tempDir(t, 'aw-gbe-goal-');
  assert.equal(gbeStatFiles.hasStatFiles([without, withStats]), true);
  assert.equal(gbeStatFiles.hasStatFiles([without]), false);
  assert.equal(gbeStatFiles.hasStatFiles([]), false);
});

// Seen live on 2026-11-26: a GSE Saves folder whose game folder AW never located has no steam_settings,
// and its counters were never mapped, so the Watchdog had no table to turn a stat at its goal into an unlock.
test('a GBE save is mapped through a progress table even when its steam_settings is unknown', (t) => {
  const withStats = tempDir(t, 'aw-gbe-goal-');
  fs.mkdirSync(path.join(withStats, 'stats'));
  fs.writeFileSync(path.join(withStats, 'stats', 'stat_ach_destroyenemies'), int32(100));
  const without = tempDir(t, 'aw-gbe-goal-');
  const gbeSave = { ach_all_crows: { earned: false, earned_time: 0 } };

  assert.equal(gbeStatFiles.needsProgressMapping(gbeSave, { steamSettings: null, saveFolders: [withStats] }), true);
  assert.equal(gbeStatFiles.needsProgressMapping(gbeSave, { steamSettings: null, saveFolders: [without] }), false);
  assert.equal(gbeStatFiles.needsProgressMapping(gbeSave, { steamSettings: 'C:/Game/steam_settings', saveFolders: [] }), true);
  assert.equal(gbeStatFiles.needsProgressMapping(Object.assign({}, { __rawStatKeys: [] }), { saveFolders: [] }), true);
  assert.equal(gbeStatFiles.needsProgressMapping(null, { steamSettings: 'C:/Game/steam_settings', saveFolders: [withStats] }), false);
});

test('an avgrate stat file is read as the average it starts with', () => {
  // GBE stores an avgrate stat as average (float), count (float), session length (double).
  const buffer = Buffer.alloc(16);
  buffer.writeFloatLE(2.5, 0);
  buffer.writeFloatLE(10, 4);
  buffer.writeDoubleLE(4, 8);
  assert.equal(gbeStatFiles.decodeStat(buffer, 'avgrate'), 2.5);
  assert.equal(gbeStatFiles.decodeStat(buffer, undefined), 2.5);
  assert.equal(gbeStatFiles.decodeStat(buffer, 'int'), null);
});

test('a stat declared with a type other than the game uses is reported', () => {
  const report = gbeSchema.drift({
    entries: [link('ACH_DIST', 'distance'), link('ACH_KILLS', 'kills')],
    stats: [
      { name: 'distance', type: 'int', default: '0' },
      { name: 'kills', type: 'int', default: '0' },
    ],
    reference: {
      progress: [link('ACH_DIST', 'distance'), link('ACH_KILLS', 'kills')],
      stats: [
        { name: 'distance', type: 'float' },
        { name: 'kills', type: 'int' },
      ],
    },
  });
  assert.deepEqual(report.mistyped, ['distance']);
});

// gbe_fork release-2026_09_27, run for real: a stat declared int refuses SetStat(float) and writes
// nothing, while an undeclared one under allow_unknown_stats=1 takes the type the game sets.
test('a progress stat of unknown type is left to allow_unknown_stats, not declared as a guess', () => {
  const entries = [link('ACH_DIST', 'distance'), link('ACH_KILLS', 'kills')];
  const reference = [{ name: 'kills', type: 'int', default: '0' }];
  const allowed = gbeSchema.planStats({ existing: [], reference, entries, unknownStatsAllowed: true });
  assert.deepEqual(allowed.stats.map((s) => s.name), ['kills']);
  const refused = gbeSchema.planStats({ existing: [], reference, entries, unknownStatsAllowed: false });
  assert.deepEqual(refused.stats.map((s) => [s.name, s.type]), [
    ['kills', 'int'],
    ['distance', 'int'],
  ]);
});

function install(t, { statValue, earned = false }) {
  const root = tempDir(t, 'aw-gbe-goal-');
  const gameDir = path.join(root, 'game');
  const steamSettings = path.join(gameDir, 'steam_settings');
  const save = path.join(root, 'GSE Saves', '3486530');
  fs.mkdirSync(steamSettings, { recursive: true });
  fs.mkdirSync(path.join(save, 'stats'), { recursive: true });
  fs.writeFileSync(path.join(gameDir, 'steam_api64.dll'), 'dll');
  fs.writeFileSync(path.join(steamSettings, 'achievements.json'), JSON.stringify([link('ACH_19', 'rmostat_rank_rmo_ach_19'), { name: 'ACH_01' }]));
  fs.writeFileSync(path.join(steamSettings, 'stats.json'), JSON.stringify([{ name: 'rmostat_rank_rmo_ach_19', type: 'int', default: '0', global: '0' }]));
  fs.writeFileSync(path.join(save, 'achievements.json'), JSON.stringify({ ACH_19: { earned, earned_time: earned ? 1700000000 : 0, progress: 0, max_progress: 100 } }));
  fs.writeFileSync(path.join(save, 'stats', 'rmostat_rank_rmo_ach_19'), int32(statValue));
  return { gameDir, savesRoots: [{ type: 'gbe', root: path.dirname(save) }] };
}

const schema = { achievement: { list: [{ name: 'ACH_19', displayName: 'ACH_19' }, { name: 'ACH_01', displayName: 'ACH_01' }] } };
const goalIssue = (setup) => goldberg.diagnose({ gameDir: setup.gameDir, appid: '3486530', schema, savesRoots: setup.savesRoots }).issues.find((i) => i.code === 'STAT_GOAL_REACHED');

test('Game Health says which counters AW Next counts from a stat GBE never turned into an unlock', (t) => {
  const issue = goalIssue(install(t, { statValue: 100 }));
  assert.ok(issue, 'a stat at its goal with the achievement locked in the save is reported');
  assert.equal(issue.level, 'info');
  assert.deepEqual(issue.data.names, ['ACH_19']);
  assert.equal(goalIssue(install(t, { statValue: 40 })), undefined);
  assert.equal(goalIssue(install(t, { statValue: 100, earned: true })), undefined);
});
