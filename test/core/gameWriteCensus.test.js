'use strict';

/*
  Every action that writes into a game's folder goes through the repair journal, so Game Health can
  undo it and a failure half way rolls back whole (#195: a fix left the exe rewritten when a later
  download was blocked). This is the census of the calls that do write there, in the files that
  start actions. A new call, or one that moved, fails here until it is listed with what covers it:
  the journal (`journaledRepair`, `recordRepair`, a begin/fail pair), or a module's own transaction.
*/

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const app = path.join(__dirname, '..', '..', 'app');

// Functions that change files inside a game folder (or, for the reset, beside its saves).
const WRITERS = [
  'installDlls',
  'stripDrm',
  'downloadAndApply',
  'applyLocalArchive',
  'applyBestFix',
  'applyBypass',
  'disableLoaderMarkers',
  'restoreSwitchedLoader',
  'writeSteamAppId',
  'turnOfflineModeOff',
  'restoreOfflineMode',
  'setSessionTicket',
  'restoreConfigBackup',
  'repairInstallation',
  'restoreSetup',
  'goldberg.repair',
  'repairAchievementData',
  'installEmulatorRuntime',
  'seedRuntimeSave',
  'applyCommunityStats',
  'mergeIntoGame',
  'generateInterfaces',
  'writeRuntimeConfigs',
  'installer.repair',
  'awManagedConfig.strip',
  'achievementReset.run',
  'achievementReset.restore',
  'repairJournal.undo',
];

const RIGHT_CLICK_FIX = "right-click emulator fix: fixRecord, failRepairRecord on error";
const AUTO_FIX = 'autoApplyEmulatorFix: run by the scan (autoRecord) and Fix all (bulkRecord), both rolled back on error';

// file -> writer -> [count, what covers it]
const CENSUS = {
  'app.js': {
    downloadAndApply: [1, 'CrakFiles entry: journaledCrackApply'],
    applyLocalArchive: [1, 'CrakFiles entry, a file the user downloaded: journaledCrackApply'],
    'goldberg.repair': [2, 'diagnosis repair: journaledRepair; Fix all: bulkRecord'],
    writeSteamAppId: [1, 'Set AppID manually: journaledRepair'],
    restoreSetup: [1, 'Restore GBE backup: journaledRepair'],
    'awManagedConfig.strip': [2, "Remove AW Next's configuration: a dry run, then journaledRepair"],
    applyBestFix: [1, RIGHT_CLICK_FIX],
    mergeIntoGame: [1, RIGHT_CLICK_FIX],
    stripDrm: [2, `${RIGHT_CLICK_FIX}; Remove DRM entry: journaledRepair`],
    generateInterfaces: [1, RIGHT_CLICK_FIX],
    installDlls: [1, RIGHT_CLICK_FIX],
    applyBypass: [1, RIGHT_CLICK_FIX],
    applyCommunityStats: [1, RIGHT_CLICK_FIX],
    'installer.repair': [1, 'GOG UniverseLAN fix: journaledRepair'],
    seedRuntimeSave: [1, 'Fix all: bulkRecord'],
    'achievementReset.run': [2, 'own transaction: backup first, achievementReset.rollBack on any failure'],
    'achievementReset.restore': [1, 'own transaction: atomic restore, taken back whole on any failure'],
  },
  'parser/achievements.js': {
    applyBestFix: [1, AUTO_FIX],
    repairAchievementData: [1, 'repairHealthFindings: the scan (autoRecord)'],
    seedRuntimeSave: [3, `repairHealthFindings and ${AUTO_FIX}; schema repair: autoRecord`],
    stripDrm: [1, AUTO_FIX],
    generateInterfaces: [1, AUTO_FIX],
    installDlls: [2, AUTO_FIX],
    applyBypass: [1, AUTO_FIX],
    mergeIntoGame: [1, AUTO_FIX],
    writeRuntimeConfigs: [2, "writeRuntimeConfigs journals itself (recordRepair 'automatic-config')"],
    repairInstallation: [1, "automatic Uplay repair: recordRepair 'automatic-uplay', plus the installer's own snapshot"],
    'goldberg.repair': [2, 'schema repair and artwork recheck: autoRecord'],
  },
  'ui/gameHealthPanel.js': {
    'repairJournal.undo': [2, 'a dry run, then the all-or-nothing undo (its own guard record)'],
    turnOfflineModeOff: [1, 'journaledRepair'],
    restoreOfflineMode: [1, 'journaledRepair'],
    writeSteamAppId: [1, 'journaledRepair'],
    setSessionTicket: [1, 'journaledRepair'],
    restoreSwitchedLoader: [1, 'journaledRepair'],
    disableLoaderMarkers: [1, 'runtime switch: journaledRepair'],
    installEmulatorRuntime: [1, 'runtime install/switch: journaledRepair'],
  },
  'ui/uplayRepair.js': {
    restoreConfigBackup: [1, 'journaledRepair'],
    repairInstallation: [1, "journaledRepair, plus the installer's own snapshot"],
  },
};

// The files that start actions: the window's scripts, the scan, and the main process.
function actionFiles() {
  const listed = (dir) => fs.readdirSync(path.join(app, dir)).filter((name) => name.endsWith('.js')).map((name) => `${dir}/${name}`);
  return ['app.js', 'parser/achievements.js', ...listed('ui'), ...listed('electron')];
}

function callsIn(source, writer) {
  const name = writer.split('.').pop();
  const escaped = writer.replace(/\./g, '\\.');
  const call = new RegExp(`(^|[^\\w.$])${escaped}\\(|\\.${escaped}\\(`);
  const definition = new RegExp(`function\\s+${name}\\(`);
  return source.split('\n').filter((line) => call.test(line) && !definition.test(line)).length;
}

test('every call that writes into a game folder is listed with what rolls it back', () => {
  const found = {};
  for (const file of actionFiles()) {
    const source = fs.readFileSync(path.join(app, file), 'utf8');
    for (const writer of WRITERS) {
      const count = callsIn(source, writer);
      if (count > 0) (found[file] = found[file] || {})[writer] = count;
    }
  }
  const expected = Object.fromEntries(Object.entries(CENSUS).map(([file, writers]) => [file, Object.fromEntries(Object.entries(writers).map(([writer, [count]]) => [writer, count]))]));
  assert.deepEqual(
    found,
    expected,
    'A call that writes into a game folder was added, moved or removed. Put it under the repair journal (journaledRepair, or a begin/failRepairRecord pair) and update CENSUS with what covers it.'
  );
});

test('the journal helpers the census relies on roll a failure back', () => {
  const journal = fs.readFileSync(path.join(app, 'util', 'repairJournal.js'), 'utf8');
  assert.match(journal, /catch \(err\) \{\s*rollbackAfterFailure\(handle, err, log\);\s*throw err;/, 'record() rolls a failed repair back');
  const appSource = fs.readFileSync(path.join(app, 'app.js'), 'utf8');
  assert.match(appSource, /function failRepairRecord\(handle, err\) \{\s*return repairJournal\.rollbackAfterFailure/);
  const scan = fs.readFileSync(path.join(app, 'parser', 'achievements.js'), 'utf8');
  assert.match(scan, /function failRecord\(handle, err\) \{\s*return repairJournal\.rollbackAfterFailure/);
});
