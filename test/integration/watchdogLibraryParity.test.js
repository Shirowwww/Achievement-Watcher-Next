'use strict';

/*
  The library and the Watchdog read the same save files and must agree on every achievement: a toast
  for an unlock the library then shows locked was #225. Each save below is read the way the library
  reads a save folder (steam.js, then saveState.js as achievements.js calls it) and the way the
  Watchdog reads the file it watched (monitor.parse), and the two states are compared.
*/

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const steam = require('../../app/parser/steam.js');
const { saveState, addSaveStats } = require('../../app/parser/saveState.js');
const monitor = require('../../watchdog/monitor.js');

const progress = (name, stat, max) => ({ name, progress: { min_val: 0, max_val: max, value: { operation: 'statvalue', operand1: stat } } });

// The library's reading of one save folder: steam.js picks the file, then achievements.js's steps.
async function libraryView(dir, { source, schema }) {
  const root = await steam.getAchievementsFromFile(dir);
  addSaveStats(root, { folders: [dir], steamSettings: null, schema });
  return comparable(saveState(root, { source, schema }).map(({ name, state }) => ({ name, ...state })));
}

async function watchdogView(file, { source, schema }) {
  return comparable(await monitor.parse(file, { source, schema }));
}

function comparable(list) {
  const byName = {};
  for (const item of list) {
    byName[String(item.name).toUpperCase()] = {
      Achieved: Boolean(item.Achieved),
      CurProgress: Number(item.CurProgress) || 0,
      MaxProgress: Number(item.MaxProgress) || 0,
      UnlockTime: Number(item.UnlockTime) || 0,
    };
  }
  return byName;
}

function tempDir(t, prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

const SAVES = [
  {
    label: 'RUNE achievements.ini with a float counter past its goal and its Stats.ini (#225)',
    file: 'achievements.ini',
    schema: [progress('ACH_LUGGER', 'stat_dist', 80), progress('ACH_PORTER', 'stat_orders', 100)],
    write(dir) {
      fs.writeFileSync(
        path.join(dir, 'achievements.ini'),
        [
          '[SteamAchievements]',
          '00000=ACH_LUGGER',
          '00001=ACH_HEAVY',
          '00002=ACH_PORTER',
          'Count=3',
          '',
          '[ACH_LUGGER]',
          'Achieved=0',
          'CurProgress=80.43',
          'MaxProgress=80',
          'UnlockTime=0',
          '',
          '[ACH_HEAVY]',
          'Achieved=1',
          'CurProgress=0',
          'MaxProgress=0',
          'UnlockTime=1763888000',
          '',
          '[ACH_PORTER]',
          'Achieved=0',
          'CurProgress=0',
          'MaxProgress=0',
          'UnlockTime=0',
        ].join('\r\n')
      );
      fs.writeFileSync(path.join(dir, 'Stats.ini'), ['[UserStats]', 'stat_dist=80.43', 'stat_orders=37'].join('\r\n'));
    },
    expect: { ACH_LUGGER: true, ACH_HEAVY: true, ACH_PORTER: false },
  },
  {
    label: 'GBE achievements.json stamped in milliseconds, with a stat file at its goal',
    file: 'achievements.json',
    schema: [progress('ACH_TEN', 'kills', 10)],
    write(dir) {
      fs.writeFileSync(
        path.join(dir, 'achievements.json'),
        JSON.stringify({ ACH_EARLY: { earned: true, earned_time: 1712253396000 }, ACH_TEN: { earned: false, earned_time: 0, progress: 4, max_progress: 10 } })
      );
      fs.mkdirSync(path.join(dir, 'stats'));
      const value = Buffer.alloc(4);
      value.writeInt32LE(10);
      fs.writeFileSync(path.join(dir, 'stats', 'kills'), value);
    },
    expect: { ACH_EARLY: true, ACH_TEN: true },
  },
  {
    label: 'CODEX achievements.ini with progress at its goal and no Achieved flag',
    file: 'achievements.ini',
    schema: [],
    write(dir) {
      fs.writeFileSync(
        path.join(dir, 'achievements.ini'),
        ['[SteamAchievements]', '00000=ACH_GEARS', 'Count=1', '', '[ACH_GEARS]', 'CurProgress=25', 'MaxProgress=25'].join('\r\n')
      );
    },
    expect: { ACH_GEARS: true },
  },
];

for (const save of SAVES) {
  test(`the library and the Watchdog read alike: ${save.label}`, async (t) => {
    const dir = tempDir(t, 'aw-parity-');
    save.write(dir);
    const options = { source: 'steam', schema: save.schema };
    const library = await libraryView(dir, options);
    const watchdog = await watchdogView(path.join(dir, save.file), options);
    assert.deepEqual(watchdog, library);
    for (const [name, achieved] of Object.entries(save.expect)) assert.equal(library[name] && library[name].Achieved, achieved, name);
  });
}

test('the library and the Watchdog both read saves through saveState.js, nowhere else', () => {
  const read = (rel) => fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');
  const library = read('app/parser/achievements.js');
  const watchdog = read('watchdog/watchdog.js') + read('watchdog/monitor.js');
  assert.match(library, /saveState\(root, \{ source: game\.source, schema: progressSchema \}\)/);
  assert.match(read('watchdog/monitor.js'), /saveState\(local, \{ source, schema \}\)/);
  // The rules saveState.js applies, called directly, would be a second reading of the same save.
  for (const rule of ['normalizeSaveEntry(', 'applyLocalStatProgress(', 'mapStatProgressEntries(', 'readSiblingStats(', 'parseUnlockTimeSeconds(']) {
    assert.equal(library.includes(rule), false, `achievements.js calls ${rule}`);
    assert.equal(watchdog.includes(rule), false, `the Watchdog calls ${rule}`);
  }
});
