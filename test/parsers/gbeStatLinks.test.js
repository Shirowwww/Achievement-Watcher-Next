'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const goldberg = require(path.join(__dirname, '..', '..', 'app', 'parser', 'goldberg.js'));
const gameHealth = require(path.join(__dirname, '..', '..', 'app', 'util', 'gameHealth.js'));
const statProgress = require(path.join(__dirname, '..', '..', 'app', 'parser', 'statProgress.js'));
const steamSchemaFetch = require(path.join(__dirname, '..', '..', 'app', 'util', 'steamSchemaFetch.js'));

// #168: Stupid Never Dies is missing from games-infos-datas, so no achievement is tied to its stat.
// GBE keeps the stats the game writes (rmostat_rank_rmo_ach_19) but only unlocks ACH_19 when
// achievements.json says which stat feeds it. Steam's own list says ACH_19 is a counter (0 to 100)
// without naming the stat, so the link is read from what the game wrote.
const counter = (name) => ({ name, displayName: name, counter: { min: 0, max: 100 } });
const plain = (name) => ({ name, displayName: name });

test('the official list marks a counter achievement with its bounds', () => {
  const [counted, once] = steamSchemaFetch.mapOfficialAchievements(
    {
      achievements: [
        { internal_name: 'ACH_19', progress_type: 2, min_progress_float: 0, max_progress_float: 100 },
        { internal_name: 'ACH_01', progress_type: 0 },
      ],
    },
    3486530
  );
  assert.deepEqual(counted.counter, { min: 0, max: 100 });
  assert.equal(once.counter, undefined);
});

test('a stat named after the achievement feeds that counter', () => {
  const links = statProgress.inferStatLinks({
    achievements: [counter('ACH_19'), counter('ACH_25'), plain('ACH_01')],
    statNames: ['rmostat_rank_rmo_ach_19', 'rmostat_rank_rmo_ach_25', 'somethingelse'],
  });
  assert.deepEqual(
    links.map((l) => [l.name, l.progress.value.operand1, l.progress.value.operation, l.progress.min_val, l.progress.max_val]),
    [
      ['ACH_19', 'rmostat_rank_rmo_ach_19', 'statvalue', 0, 100],
      ['ACH_25', 'rmostat_rank_rmo_ach_25', 'statvalue', 0, 100],
    ]
  );
});

test('ACH_1 is not matched by the stat of ACH_19', () => {
  const links = statProgress.inferStatLinks({ achievements: [counter('ACH_1')], statNames: ['rmostat_rank_rmo_ach_19', 'x_ach_11'] });
  assert.deepEqual(links, []);
});

test('an ambiguous match links nothing', () => {
  const twoStats = statProgress.inferStatLinks({ achievements: [counter('ACH_19')], statNames: ['a_ach_19', 'b_ach_19'] });
  assert.deepEqual(twoStats, []);
  const twoAchievements = statProgress.inferStatLinks({ achievements: [counter('ACH_19'), counter('X_ACH_19')], statNames: ['x_ach_19'] });
  assert.deepEqual(twoAchievements, []);
});

test('a stat that belongs to another achievement, counter or not, is not borrowed', () => {
  const links = statProgress.inferStatLinks({
    achievements: [counter('WIN')],
    allNames: ['ACH_WIN', 'WIN'],
    statNames: ['ach_win'],
  });
  assert.deepEqual(links, []);
});

test('an achievement already tied to a stat is left alone', () => {
  const linked = { ...counter('ACH_19'), progress: { value: { operation: 'statvalue', operand1: 'scrap' }, min_val: 0, max_val: 1000 } };
  assert.deepEqual(statProgress.inferStatLinks({ achievements: [linked], statNames: ['x_ach_19'] }), []);
});

// #168, second round: the game writes a stat only once its counter first moves, so a repair tied 8
// of 17 counters and the rest waited for another repair. Two links spelled the same way are a naming
// rule, and the rule names the stat of every counter still untied.
test('counters whose stat is not written yet follow the naming the others share', () => {
  const links = statProgress.inferStatLinks({
    achievements: [counter('ACH_19'), counter('ACH_25'), counter('ACH_17'), plain('ACH_01')],
    statNames: ['rmostat_rank_rmo_ach_19', 'rmostat_rank_rmo_ach_25'],
  });
  assert.deepEqual(
    links.map((l) => [l.name, l.progress.value.operand1, l.progress.max_val]),
    [
      ['ACH_19', 'rmostat_rank_rmo_ach_19', 100],
      ['ACH_25', 'rmostat_rank_rmo_ach_25', 100],
      ['ACH_17', 'rmostat_rank_rmo_ach_17', 100],
    ]
  );
});

test('links made by an earlier repair count as the naming rule', () => {
  const tied = (name) => ({ ...counter(name), progress: { value: { operation: 'statvalue', operand1: `rmostat_rank_rmo_${name.toLowerCase()}` }, min_val: 0, max_val: 100 } });
  const links = statProgress.inferStatLinks({ achievements: [tied('ACH_19'), tied('ACH_25'), counter('ACH_17')], statNames: [] });
  assert.deepEqual(links.map((l) => [l.name, l.progress.value.operand1]), [['ACH_17', 'rmostat_rank_rmo_ach_17']]);
});

test('one link, or links spelled two ways, name no other stat', () => {
  const one = statProgress.inferStatLinks({ achievements: [counter('ACH_19'), counter('ACH_17')], statNames: ['rmostat_rank_rmo_ach_19'] });
  assert.deepEqual(one.map((l) => l.name), ['ACH_19']);
  const mixed = statProgress.inferStatLinks({
    achievements: [counter('ACH_19'), counter('ACH_25'), counter('ACH_17')],
    statNames: ['rmostat_rank_rmo_ach_19', 'other_ach_25'],
  });
  assert.deepEqual(mixed.map((l) => l.name), ['ACH_19', 'ACH_25']);
});

test('a guessed name that another stat or achievement could claim is not used', () => {
  const links = statProgress.inferStatLinks({
    achievements: [counter('ACH_19'), counter('ACH_25'), counter('ACH_17')],
    allNames: ['ACH_19', 'ACH_25', 'ACH_17', 'RMO_ACH_17'],
    statNames: ['rmostat_rank_rmo_ach_19', 'rmostat_rank_rmo_ach_25'],
  });
  assert.deepEqual(links.map((l) => l.name), ['ACH_19', 'ACH_25']);
});

function install({ stats =['rmostat_rank_rmo_ach_19'], achievements = null } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-gbe-links-'));
  const gameDir = path.join(root, 'game');
  const steamSettings = path.join(gameDir, 'steam_settings');
  const saves = path.join(root, 'GSE Saves');
  fs.mkdirSync(steamSettings, { recursive: true });
  fs.mkdirSync(path.join(saves, '3486530', 'stats'), { recursive: true });
  fs.writeFileSync(path.join(gameDir, 'steam_api64.dll'), 'dll');
  fs.writeFileSync(path.join(steamSettings, 'achievements.json'), JSON.stringify(achievements || [{ name: 'ACH_19' }, { name: 'ACH_01' }]));
  fs.writeFileSync(path.join(steamSettings, 'configs.main.ini'), '[main::general]\nnew_app_ticket=1\ngc_token=1\n[main::stats]\nallow_unknown_stats=1\n');
  fs.writeFileSync(path.join(saves, '3486530', 'achievements.json'), '{}');
  for (const name of stats) fs.writeFileSync(path.join(saves, '3486530', 'stats', name), Buffer.alloc(4));
  return { gameDir, steamSettings, savesRoots: [{ type: 'gbe', root: saves }] };
}

const schema = { achievement: { list: [counter('ACH_19'), plain('ACH_01')] } };
const diagnose = (setup, s = schema) => goldberg.diagnose({ gameDir: setup.gameDir, appid: '3486530', schema: s, savesRoots: setup.savesRoots });
const codes = (report) => report.issues.map((issue) => issue.code);

test('stats written for a counter nothing is tied to are flagged', () => {
  assert.ok(codes(diagnose(install())).includes('STAT_LINK_MISSING'));
});

test('nothing is flagged without a matching stat, or once the counter is tied', () => {
  assert.ok(!codes(diagnose(install({ stats: ['unrelated'] }))).includes('STAT_LINK_MISSING'));
  const tied = install({
    achievements: [{ name: 'ACH_19', progress: { value: { operation: 'statvalue', operand1: 'rmostat_rank_rmo_ach_19' }, min_val: 0, max_val: 100 } }],
  });
  assert.ok(!codes(diagnose(tied)).includes('STAT_LINK_MISSING'));
  assert.ok(!codes(diagnose(install(), { achievement: { list: [plain('ACH_19')] } })).includes('STAT_LINK_MISSING'));
});

test('the repair ties the counter to the stat so GBE can unlock it', async () => {
  const setup = install();
  await goldberg.repair({ steamSettings: setup.steamSettings, appid: '3486530', schema, savesRoots: setup.savesRoots, writeMain: false, writeDlc: false, writeAppId: false });
  const written = JSON.parse(fs.readFileSync(path.join(setup.steamSettings, 'achievements.json'), 'utf8'));
  const entry = written.find((a) => a.name === 'ACH_19');
  assert.deepEqual(entry.progress, { min_val: 0, max_val: 100, value: { operation: 'statvalue', operand1: 'rmostat_rank_rmo_ach_19' } });
  assert.equal(written.find((a) => a.name === 'ACH_01').progress, undefined);
  assert.ok(!codes(diagnose(setup)).includes('STAT_LINK_MISSING'));
});

test('Game Health offers the repair for it', () => {
  assert.ok(gameHealth.REPAIRABLE_GOLDBERG_CODES.has('STAT_LINK_MISSING'));
});

// A schema cached before this fix has no `counter`; Steam's list is asked once to complete it.
test("a cached schema gets the counters of Steam's own list, fetched once", async () => {
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-gbe-counters-'));
  let calls = 0;
  const fetchImpl = async () => {
    calls++;
    return {
      ok: true,
      json: async () => ({
        response: {
          achievements: [
            { internal_name: 'ACH_19', progress_type: 2, min_progress_float: 0, max_progress_float: 100 },
            { internal_name: 'ACH_01', progress_type: 0 },
          ],
        },
      }),
    };
  };
  const game = { achievement: { list: [plain('ACH_19'), plain('ACH_01')] } };
  assert.equal(await statProgress.attachOfficialCounters(game, '3486530', { cacheDir, fetchImpl }), 1);
  assert.deepEqual(game.achievement.list[0].counter, { min: 0, max: 100 });
  assert.equal(game.achievement.list[1].counter, undefined);
  await statProgress.attachOfficialCounters({ achievement: { list: [plain('ACH_19')] } }, '3486530', { cacheDir, fetchImpl });
  assert.equal(calls, 1);
  assert.equal(await statProgress.attachOfficialCounters(game, 'socialclub-x', { cacheDir, fetchImpl }), 0);
});
