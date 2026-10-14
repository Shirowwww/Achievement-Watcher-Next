'use strict';

/*
  What the automatic fix should do to one game, decided from the same diagnosis Game Health shows.

  Two repairs exist and are not interchangeable. The data repair (goldberg.repair) rewrites the
  schema, icons, steam_appid.txt and configs where the emulator reads them, and never touches a
  dll. The runtime install (the GBE Fork setup) replaces the steam_api dll. MODE 'repair' installs
  the runtime only when no supported one is there; 'runtime' re-applies the whole setup whenever
  anything is flagged.

  Neither mode takes a game away from a runtime that already works: a renamed GBE build
  (Pragmata's steam_api64.v38) or a scene crack (RUNE) reports RUNTIME_DLL_NOT_EMULATOR, and
  swapping that dll is what crashes the game. Game Health offers it as a button, never automatically.

  Pure: no fs, no network, no Electron.
*/

const gameHealth = require('./gameHealth.js');

const MODE = { REPAIR: 'repair', RUNTIME: 'runtime' };
const DEFAULT_MODE = MODE.REPAIR;

function normalizeMode(value) {
  return value === MODE.RUNTIME ? MODE.RUNTIME : MODE.REPAIR;
}

/*
  Codes saying the dll that would read steam_settings is somebody else's runtime. The data repair
  would write a perfect folder next to a file that never opens it, so there is nothing useful to do
  automatically: these hand the game to the panel instead.
*/
const FOREIGN_RUNTIME_CODES = new Set(['RUNTIME_DLL_NOT_EMULATOR']);

// Codes about the game folder itself. Nothing can be written until they are resolved.
const BLOCKING_CODES = new Set(['NO_GAME_DIR']);

/*
  Findings a data repair can only clear when the matching setting lets it write that file. With
  icons off, MISSING_ICONS is not repairable: counting it would schedule a repair that cannot change
  anything, and it would come back on every scan. Both settings are opt-in on purpose - DLC
  ownership and the account identity are not "repair my achievements".
*/
const ICON_REPAIR_CODES = ['MISSING_ICONS'];
const DLC_REPAIR_CODES = ['NO_DLC_CONFIG', 'BAD_DLC_CONFIG'];

// What the automatic fix is allowed to repair under the current settings.
function repairableCodesFor(option = {}) {
  const codes = new Set(gameHealth.REPAIRABLE_GOLDBERG_CODES);
  if (!(option.achievement && option.achievement.goldbergDownloadIcons)) for (const code of ICON_REPAIR_CODES) codes.delete(code);
  if (!(option.emulator && option.emulator.manageDlc === true)) for (const code of DLC_REPAIR_CODES) codes.delete(code);
  return codes;
}

function codesOf(report) {
  const issues = report && Array.isArray(report.issues) ? report.issues : [];
  return issues.filter(Boolean).map((issue) => String(issue.code || '')).filter(Boolean);
}

function result(fields) {
  return { act: false, fullSetup: false, repairData: false, codes: [], ...fields };
}

/*
  plan({ report, repairableCodes, needsSchema, needsRuntimeFix, mode })
    -> { act, fullSetup, repairData, codes, reason }

  `repairableCodes` comes from repairableCodesFor(option). `act` is false when there is nothing to
  do, so the caller skips the backup, the cool-down entry and the toast.
  `codes` carries the repairable codes behind the decision, for the log line.
*/
function plan({ report = null, repairableCodes = new Set(), needsSchema = false, needsRuntimeFix = false, mode = DEFAULT_MODE } = {}) {
  const resolvedMode = normalizeMode(mode);
  const codes = codesOf(report);
  const repairable = codes.filter((code) => repairableCodes.has(code));

  if (codes.some((code) => BLOCKING_CODES.has(code))) {
    return result({ reason: 'no-game-folder' });
  }
  // Checked before anything is flagged: a foreign runtime makes every other finding in the report
  // moot, and it is the one case where acting automatically can break a game that works.
  if (codes.some((code) => FOREIGN_RUNTIME_CODES.has(code))) {
    return result({ reason: 'foreign-runtime', codes: repairable });
  }
  if (!(needsSchema || needsRuntimeFix || repairable.length > 0)) {
    return result({ reason: 'nothing-flagged' });
  }

  // The full setup covers the dll and the data, so a mode that asks for it needs nothing else
  // decided. It is also the only path that can set a game up from nothing at all.
  if (resolvedMode === MODE.RUNTIME) {
    return result({ act: true, fullSetup: true, codes: repairable, reason: 'mode-runtime' });
  }

  // No supported runtime to read the folder: repairing the data alone would change nothing.
  if (needsRuntimeFix) {
    return result({ act: true, fullSetup: true, codes: repairable, reason: 'runtime-missing' });
  }

  return result({
    act: true,
    repairData: true,
    codes: repairable,
    reason: needsSchema ? 'schema-missing' : 'health-repairable',
  });
}

module.exports = { plan, repairableCodesFor, MODE, DEFAULT_MODE, normalizeMode, FOREIGN_RUNTIME_CODES, BLOCKING_CODES };
