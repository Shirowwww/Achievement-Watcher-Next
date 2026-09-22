'use strict';

/*
  Three things one OnlineFix install (Little Nightmares III) and one GBE release (Little Nightmares II)
  showed together:
  - the right-click diagnosis called an OnlineFix folder "Goldberg not set up" and offered a repair
    that writes a steam_settings nothing loads;
  - Game Health went green while the only save read was a GSE one left by another copy;
  - a release with a complete achievements.json but no stats.json never unlocks a stat-driven
    achievement, and only a signed-in generate_emu_config run could add it.
*/

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const goldberg = require('../../app/parser/goldberg.js');
const statProgress = require('../../app/parser/statProgress.js');
const gameHealth = require('../../app/util/gameHealth.js');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-onlinefix-'));
const folder = (name) => {
  const dir = path.join(tmp, name);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
};

test('an OnlineFix folder is named in the diagnosis and not offered a steam_settings repair', () => {
  const dir = folder('LN3');
  fs.writeFileSync(path.join(dir, 'OnlineFix64.dll'), Buffer.alloc(64, 1));
  fs.writeFileSync(path.join(dir, 'OnlineFix.ini'), '[Main]\n');

  const report = goldberg.diagnose({ gameDir: dir, appid: '1392860', schema: null });
  assert.equal(report.loader, 'OnlineFix');
  assert.equal(report.ok, true, 'a working crack is not a fault');
  assert.deepEqual(
    report.issues.map((i) => i.code),
    ['SERVED_BY_LOADER']
  );
  assert.ok(!gameHealth.REPAIRABLE_GOLDBERG_CODES.has('SERVED_BY_LOADER'), 'nothing to write for it');
});

test('a GBE dll installed over a loader folder is still diagnosed as an unconfigured Goldberg setup', () => {
  const dir = folder('ALI-then-GBE');
  fs.writeFileSync(path.join(dir, 'ALI213.ini'), '[Settings]\n');
  fs.writeFileSync(path.join(dir, 'steam_api64.dll'), Buffer.concat([Buffer.alloc(32, 1), Buffer.from('steam_settings')]));

  const report = goldberg.diagnose({ gameDir: dir, appid: '339230', schema: null });
  assert.ok(report.issues.some((i) => i.code === 'NO_STEAM_SETTINGS'), 'the repair must stay reachable right after a re-apply');
});

const healthSignals = (saveSources, loader = 'OnlineFix') => ({
  appid: '1392860',
  name: 'Little Nightmares III',
  gameDir: 'D:\\Games\\LN3',
  gameDirExists: true,
  installed: true,
  exe: 'D:\\Games\\LN3\\LN3.exe',
  exeExists: true,
  achievements: { total: 44, unlocked: 0 },
  crackLoader: { name: loader, replaceable: false },
  saveSources,
});
const emulatorRow = (signals) => gameHealth.deriveHealth(signals).checks.find((c) => c.id === 'emulator');

test('a loader-served game reading only an old GSE save is flagged', () => {
  const row = emulatorRow(healthSignals([{ source: 'Goldberg', path: 'C:/Users/p/AppData/Roaming/GSE Saves/1392860' }]));
  assert.equal(row.level, gameHealth.LEVEL.WARN);
  assert.equal(row.params.oldSave, true);
  assert.equal(row.params.servedBy, 'OnlineFix');
});

test('its own save, no save yet, or a Goldberg-based loader stay informational', () => {
  const own = emulatorRow(healthSignals([{ source: 'OnlineFix', path: 'C:\\Users\\Public\\Documents\\OnlineFix\\1392860\\Stats' }]));
  assert.equal(own.level, gameHealth.LEVEL.INFO);
  assert.equal(own.params.oldSave, undefined);
  assert.equal(emulatorRow(healthSignals([])).level, gameHealth.LEVEL.INFO);
  const cold = emulatorRow(healthSignals([{ source: 'Goldberg', path: 'C:\\x\\GSE Saves\\1' }], 'ColdClient'));
  assert.equal(cold.level, gameHealth.LEVEL.INFO);
});

const communityFiles = {
  'steam/860510/stats_db.json': JSON.stringify([
    { name: 'FindAllHats_FindAllHats', type: 'int', incrementonly: true, default: 0 },
    { name: 'CallSix_CallSix', type: 'int', default: 0 },
  ]),
  'steam/860510/achievements_db.json': JSON.stringify([
    { name: 'Hats', stats_thresholds: [{ stat_name: 'FindAllHats_FindAllHats', min_val: 0, max_val: 9 }] },
    { name: 'Plain' },
  ]),
};
const getJson = async (url) => {
  const key = Object.keys(communityFiles).find((k) => url.endsWith(k));
  if (!key) throw Object.assign(new Error('404'), { code: 404 });
  return communityFiles[key];
};

test('stats and thresholds are read from games-infos-datas without an account', async () => {
  const { stats, progress } = await statProgress.fetchCommunityStats('860510', { getJson });
  assert.deepEqual(stats[0], { default: '0', global: '0', name: 'FindAllHats_FindAllHats', type: 'int' });
  assert.equal(stats.length, 2);
  assert.deepEqual(progress, [
    { name: 'Hats', progress: { min_val: 0, max_val: 9, value: { operation: 'statvalue', operand1: 'FindAllHats_FindAllHats' } } },
  ]);
});

test('re-applying completes a release that shipped without stats.json, keeping what is there', async () => {
  const settings = folder('LN2/steam_settings');
  fs.writeFileSync(
    path.join(settings, 'achievements.json'),
    JSON.stringify([
      { name: 'Hats', displayName: 'Hats', hidden: '0' },
      { name: 'Plain', displayName: 'Plain', hidden: '0' },
    ])
  );
  const community = await statProgress.fetchCommunityStats('860510', { getJson });

  const first = goldberg.applyCommunityStats(settings, community);
  assert.deepEqual(first, { stats: 2, progress: 1 });
  const schema = JSON.parse(fs.readFileSync(path.join(settings, 'achievements.json'), 'utf8'));
  assert.equal(schema[0].progress.value.operand1, 'FindAllHats_FindAllHats');
  assert.equal(schema[1].progress, undefined);
  assert.equal(JSON.parse(fs.readFileSync(path.join(settings, 'stats.json'), 'utf8')).length, 2);
  assert.ok(fs.readdirSync(path.join(settings, '.aw-backups')).length > 0, 'the old schema is kept');

  assert.deepEqual(goldberg.applyCommunityStats(settings, community), { stats: 0, progress: 0 }, 'a second run changes nothing');
});

test('the repair writes stats.json and progress when a fetcher is given', async () => {
  const settings = folder('LN2-repair/steam_settings');
  const summary = await goldberg.repair({
    steamSettings: settings,
    appid: '860510',
    schema: { achievement: { list: [{ name: 'Hats', displayName: 'Hats' }, { name: 'Plain', displayName: 'Plain' }] } },
    writeDlc: false,
    writeMain: false,
    fetchStats: (id) => statProgress.fetchCommunityStats(id, { getJson }),
  });
  assert.equal(summary.stats, 2);
  const schema = JSON.parse(fs.readFileSync(path.join(settings, 'achievements.json'), 'utf8'));
  assert.equal(schema[0].progress.max_val, 9);
});
