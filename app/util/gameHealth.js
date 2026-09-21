'use strict';

/*
  Turns the per-game signals AW Next already collects into one overall state, a plain-language
  explanation, check rows and repair actions. Deliberately pure (no fs/Electron/i18n): every
  user-visible string comes out as an ID the renderer resolves through t(), so every branch is
  testable without a window, install or locale bundle.
*/

const STATE = { READY: 'ready', ATTENTION: 'attention', NOT_TRACKING: 'not-tracking' };
const LEVEL = { OK: 'ok', WARN: 'warn', FAIL: 'fail', INFO: 'info' };

// Repair actions. Each one maps to a capability AW Next already has - nothing here is aspirational.
const ACTION = {
  CHOOSE_EXE: 'choose-exe', //    the panel's own executable picker
  OPEN_FOLDER: 'open-folder', //  shell.openPath(gameDir)
  REPAIR_DATA: 'repair-data', //  goldberg.repair() - writes schema + icons + configs, backs up first
  REPAIR_UPLAY: 'repair-uplay', // shared Uplay R2 transaction - loader/schema/config + rollback
  REPAIR_UPLAY_TICKET: 'repair-uplay-ticket', // uplayR2.setSessionTicket({enabled:true}) - one ini key
  REMOVE_UPLAY_TICKET: 'remove-uplay-ticket', // uplayR2.setSessionTicket({enabled:false}) - takes it back
  INSTALL_RUNTIME: 'install-runtime', // gbeInstaller.installDlls() - backs up replaced dlls as .bak
  // Same install, offered over a folder a scene crack already serves: the runtime is there, it just
  // is not one that reads a steam_settings folder. Its own action so the button can say that.
  SWITCH_RUNTIME: 'switch-runtime',
  START_TRACKING: 'start-tracking', //  gameIndex.upsert() - the same seed the scan writes
  UNMUTE_PROGRESS: 'unmute-progress', // progressMute.toggle()
  FETCH_PROGRESS: 'fetch-progress', // anonymous generate_emu_config, kept in AW's cache only
  TEST_NOTIFICATION: 'test-notification', // the watchdog websocket test the Settings panel uses
  FIX_APPID: 'fix-appid', //          goldberg.writeSteamAppId() - one file, previous value kept
};

// goldberg.diagnose() issue codes that goldberg.repair() actually rewrites. Mirrors the list the
// right-click diagnosis uses to decide whether to offer its repair button.
const REPAIRABLE_GOLDBERG_CODES = new Set([
  'NO_ACHIEVEMENTS_JSON',
  'BAD_ACHIEVEMENTS_JSON',
  'ACHIEVEMENTS_JSON_NOT_ARRAY',
  'MISSING_ACHIEVEMENTS',
  'NO_STEAM_SETTINGS',
  // Repaired by writing a complete steam_settings beside the dll instead of the one the emulator
  // never opens; planAchievementDataRepair() picks that folder from the diagnosis.
  'SETTINGS_NOT_BESIDE_DLL',
  // Same repair, one folder further: planAchievementDataRepair() targets the engine's own
  // Steamworks folder, which is the only one a packaged Unreal build ever reads.
  'UNREAL_ENGINE_DLL_UNCONFIGURED',
  'NO_APPID_TXT',
  'MISSING_ICONS',
  'NO_DLC_CONFIG',
  'NO_MAIN_CONFIG',
  'NO_NEW_APP_TICKET',
  'NO_GC_TOKEN',
  'NO_USER_CONFIG',
  // writeUserConfig() blanks GBE's example value whenever it rewrites configs.user.ini.
  'PLACEHOLDER_SAVE_PATH',
  'BAD_DLC_CONFIG',
  'BAD_USER_CONFIG',
  // Both are properties of achievements.json, which the repair rewrites from the fetched schema.
  'BLANK_NAMES',
  'BLANK_DESCRIPTIONS',
]);

const REPAIRABLE_UPLAY_CODES = new Set([
  'NO_UPLAY_R2_DLL',
  'NOT_UPLAY_R2_LOADER',
  'LOADER_ARCH_MISMATCH',
  'LOADER_ARCH_UNKNOWN',
  'NO_SCHEMA_JSON',
  'BAD_SCHEMA_JSON',
  'SCHEMA_KEYS_NOT_CANONICAL',
  'NO_INI',
  'ACHIEVEMENTS_DISABLED',
  'BAD_SAVE_REDIRECT',
  'NO_STEAM_MAPPING',
]);

// Which part of the setup each diagnosis code is about, so the row can name actual subjects
// instead of a bare issue count; the codes and messages still show under Technical details.
const ISSUE_TOPIC = {
  NO_ACHIEVEMENTS_JSON: 'schema',
  BAD_ACHIEVEMENTS_JSON: 'schema',
  ACHIEVEMENTS_JSON_NOT_ARRAY: 'schema',
  MISSING_ACHIEVEMENTS: 'schema',
  BLANK_NAMES: 'schema',
  BLANK_DESCRIPTIONS: 'schema',
  NO_SCHEMA_JSON: 'schema',
  BAD_SCHEMA_JSON: 'schema',
  SCHEMA_KEYS_NOT_CANONICAL: 'schema',
  LOADER_LOG_UNKNOWN_OBJECTIVE: 'schema',
  LOADER_LOG_NO_ACH_CALL: 'schema',
  NO_LOADER_LOG: 'schema',
  MISSING_ICONS: 'icons',
  NO_APPID_TXT: 'appid',
  APPID_MISMATCH: 'appid',
  NO_DLC_CONFIG: 'dlc',
  BAD_DLC_CONFIG: 'dlc',
  NO_MAIN_CONFIG: 'compat',
  NO_NEW_APP_TICKET: 'compat',
  NO_GC_TOKEN: 'compat',
  NO_INI: 'compat',
  NO_USER_CONFIG: 'account',
  BAD_USER_CONFIG: 'account',
  CUSTOM_SAVE_PATH: 'savepath',
  PLACEHOLDER_SAVE_PATH: 'savepath',
  SETTINGS_NOT_BESIDE_DLL: 'location',
  UNREAL_ENGINE_DLL_UNCONFIGURED: 'location',
  RUNTIME_DLL_NOT_EMULATOR: 'runtime',
  LOADER_NO_ACH_REDIRECT: 'loader',
  NO_SESSION_TICKET: 'session',
  SESSION_TICKET_NO_EFFECT: 'session',
  SESSION_TICKET_PENDING: 'session',
  SESSION_TICKET_UNSUPPORTED: 'session',
  NO_UPLAY_R2_DLL: 'loader',
  NOT_UPLAY_R2_LOADER: 'loader',
  LOADER_ARCH_MISMATCH: 'loader',
  LOADER_ARCH_UNKNOWN: 'loader',
  NO_STEAM_MAPPING: 'mapping',
};

// Distinct topics raised by these issues, in a stable order so the row text doesn't reshuffle.
function issueTopics(issues) {
  const topics = [];
  for (const issue of issues || []) {
    const topic = ISSUE_TOPIC[issue && issue.code];
    if (topic && !topics.includes(topic)) topics.push(topic);
  }
  return topics;
}

function num(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function issuesAtLevel(report, level) {
  if (!report || !Array.isArray(report.issues)) return [];
  return report.issues.filter((issue) => issue && issue.level === level);
}

// Own action rather than folding into "rewrite achievement data", since that repair deliberately
// never overwrites an existing steam_appid.txt and would leave this exact warning standing.
function appidMismatch(report) {
  const issue = (report && Array.isArray(report.issues) ? report.issues : []).find(
    (entry) => entry && entry.code === 'APPID_MISMATCH' && entry.data && entry.data.expected
  );
  return issue ? issue.data : null;
}

// One check row. `blocking` marks failures that mean AW Next cannot observe this game at all -
// that's what separates "Not tracking" from "Needs attention", so an incomplete setup isn't
// reported as untracked.
function check(id, level, { params = {}, blocking = false, actions = [] } = {}) {
  return { id, level, params, blocking, actions };
}

// An unknown install folder limits repairs and playtime but doesn't by itself stop tracking: most
// cracked games are known to AW Next only through their emulator's save folder, re-read every scan.
function readableWithoutInstall(signals) {
  if (Array.isArray(signals.saveSources) && signals.saveSources.length > 0) return true;
  return num(signals.achievements && signals.achievements.unlocked) > 0;
}

function installCheck(signals) {
  const { gameDir, gameDirExists, installed } = signals;
  const readable = readableWithoutInstall(signals);
  if (gameDir && gameDirExists) return check('install', LEVEL.OK, { params: { path: gameDir } });
  if (gameDir && !gameDirExists) {
    // The folder was resolved once and is gone now: moved, uninstalled or an unmounted drive.
    return check('install', LEVEL.FAIL, { params: { path: gameDir }, blocking: !readable, actions: [ACTION.CHOOSE_EXE] });
  }
  if (installed || readable) return check('install', LEVEL.WARN, { actions: [ACTION.CHOOSE_EXE] });
  return check('install', LEVEL.FAIL, { blocking: true, actions: [ACTION.CHOOSE_EXE] });
}

function executableCheck(signals) {
  const { exe, exeExists, gameDir } = signals;
  if (exe && exeExists) return check('executable', LEVEL.OK, { params: { path: exe } });
  if (exe && !exeExists) return check('executable', LEVEL.FAIL, { params: { path: exe }, actions: [ACTION.CHOOSE_EXE] });
  // No executable is only worth reporting once AW Next knows where to look for one.
  if (!gameDir) return null;
  return check('executable', LEVEL.WARN, { actions: [ACTION.CHOOSE_EXE] });
}

function identityCheck(signals) {
  const { appid, steamappid, source, unconfigured, system } = signals;
  // An Xbox 360 game (Xenia, a recompilation) is identified by its 8-digit hex title id, not a Steam appid.
  const titleId = system === 'xbox' ? (/^(?:x360-)?([0-9a-f]{8})$/i.exec(String(appid || '')) || [])[1] : '';
  const resolved = steamappid || (/^\d+$/.test(String(appid || '')) ? String(appid) : '') || (titleId ? titleId.toUpperCase() : '');
  if (resolved && !unconfigured) return check('identity', LEVEL.OK, { params: { appid: resolved, source: source || '' } });
  if (resolved) return check('identity', LEVEL.WARN, { params: { appid: resolved, source: source || '' } });
  return check('identity', LEVEL.WARN, { params: { source: source || '' } });
}

/*
  Steam settled that this appid publishes no achievements (achievements.js sets the flag from the
  verdict steam.js stamps, never from a count). A game like The Sims 4 has nothing to track, so
  nothing here can be broken: every check that would otherwise read the empty list as a failure
  has to step aside instead.
*/
function hasNoAchievements(signals) {
  return !!(signals.achievements && signals.achievements.none);
}

function achievementDataCheck(signals) {
  const total = num(signals.achievements && signals.achievements.total);
  const goldberg = signals.goldberg;

  // Not a missing schema: there is no schema to have. Informational, never blocking.
  if (hasNoAchievements(signals)) return check('achievement-data', LEVEL.INFO, { params: { none: true } });

  if (total === 0) {
    // An emulated game with a readable on-disk schema still has data even when the app's own
    // list came back empty, so only call it missing when neither source produced anything.
    const onDisk = goldberg ? num(goldberg.achievements && goldberg.achievements.found) : 0;
    if (onDisk > 0) return check('achievement-data', LEVEL.WARN, { params: { found: onDisk } });
    return check('achievement-data', LEVEL.FAIL, { blocking: true });
  }

  if (goldberg && goldberg.steamSettings) {
    const missing = (goldberg.achievements && goldberg.achievements.missing) || [];
    const missingIcons = (goldberg.achievements && goldberg.achievements.missingIcons) || [];
    const repairable = issuesAtLevel(goldberg, 'error')
      .concat(issuesAtLevel(goldberg, 'warning'))
      .some((issue) => REPAIRABLE_GOLDBERG_CODES.has(issue.code));
    if (missing.length > 0) {
      return check('achievement-data', LEVEL.FAIL, {
        params: { total, missing: missing.length },
        actions: [ACTION.REPAIR_DATA],
      });
    }
    if (missingIcons.length > 0) {
      // Steam has no achievement artwork for this appid yet: the list is complete and REPAIR_DATA
      // has nothing left to fetch, so this is something to know, not something to fix.
      if (goldberg.achievements && goldberg.achievements.iconsUnavailable) {
        return check('achievement-data', LEVEL.INFO, { params: { total, missingIcons: missingIcons.length, iconsUnavailable: true } });
      }
      return check('achievement-data', LEVEL.WARN, {
        params: { total, missingIcons: missingIcons.length },
        actions: [ACTION.REPAIR_DATA],
      });
    }
    if (repairable) return check('achievement-data', LEVEL.WARN, { params: { total }, actions: [ACTION.REPAIR_DATA] });
  }

  return check('achievement-data', LEVEL.OK, { params: { total } });
}

/*
  Goldberg/GBE setup, split from the achievement-data check since "schema is fine but nothing
  writes to it" is a different problem. `emulated` means Goldberg/GBE proven on disk, never
  inferred from the source label: other loaders (CODEX, OnlineFix, TENOKE...) keep unlocks
  elsewhere entirely, and demanding steam_settings from them reported working games as broken.
*/
function emulatorCheck(signals) {
  // An emulator setup over a game with no achievements has nothing to read and nothing to repair.
  // Diagnosing it anyway turned an inert folder into a list of faults on a game that is fine.
  if (hasNoAchievements(signals)) return null;
  const goldberg = signals.goldberg;
  /*
    A folder a crack loader already serves (RUNE, CODEX, OnlineFix, ...) is deliberately never
    diagnosed as a Goldberg setup - measuring it against steam_settings reports working games as
    broken. Saying nothing at all then left no row at all on exactly the games whose unlocks come
    from somewhere unexpected, so name the loader instead. Informational: AW cannot inspect that
    runtime, and a crack that works is not a fault.
  */
  if ((!signals.emulated || !goldberg) && signals.crackLoader && signals.crackLoader.name) {
    // Launched at least once and still nothing recorded: some scene builds simply never call the
    // achievement API. Swapping their runtime for GBE Fork is the only thing that changes that, so
    // offer it here - never automatically, and never over a crack that is demonstrably working.
    const idle = num(signals.playtime && signals.playtime.total) > 0 && num(signals.achievements && signals.achievements.unlocked) === 0;
    // ...and only where that runtime IS the steam_api dll: see crackLoaderDetect's `replaceable`.
    const canSwitch = idle && signals.crackLoader.replaceable === true;
    return check('emulator', LEVEL.INFO, {
      params: { servedBy: signals.crackLoader.name, ...(idle ? { idle: true } : {}) },
      actions: canSwitch ? [ACTION.SWITCH_RUNTIME] : [],
    });
  }
  if (!signals.emulated || !goldberg) return null;

  const dllCount = num(goldberg.dllCount);
  if (!goldberg.steamSettings && dllCount === 0) {
    // Nothing is set up at all. The full setup chain lives in the right-click menu; offering a
    // partial copy of it here would fork that flow, so this check explains and stops.
    return check('emulator', LEVEL.FAIL, { blocking: true });
  }
  if (goldberg.steamSettings && dllCount === 0) {
    // The schema is present but no steam_api dll will ever read it. installDlls() repairs exactly
    // this, backing the replaced file up as .bak.
    return check('emulator', LEVEL.FAIL, { blocking: true, actions: [ACTION.INSTALL_RUNTIME] });
  }
  if (!goldberg.steamSettings) return check('emulator', LEVEL.FAIL, { params: { emulator: goldberg.emulator || 'none' }, blocking: true });

  // Offered alongside whatever else the report raises: a mismatched appid is its own one-file fix.
  const mismatch = appidMismatch(goldberg);
  /*
    A packaged Unreal build reads settings only from the engine's Steamworks folder, and rewriting
    the schema there is half the job: without the emulator dll beside it nothing loads the folder at
    all. dllCount is about the rest of the game, so the runtime action has to be offered on this
    code specifically rather than on "no dll anywhere".
  */
  const codes = new Set((goldberg.issues || []).map((issue) => issue && issue.code));
  const engineUnconfigured = codes.has('UNREAL_ENGINE_DLL_UNCONFIGURED');
  /*
    The dll that will be loaded is somebody else's runtime, so the settings beside it are inert and
    every other row of this report describes a folder the game never opens. Installing the supported
    build over it is the fix, and the same one-file install as above.
  */
  const foreignRuntime = codes.has('RUNTIME_DLL_NOT_EMULATOR');
  const needsRuntime = engineUnconfigured || foreignRuntime;
  const withAppidFix = (actions) => {
    const withRuntime = needsRuntime && !actions.includes(ACTION.INSTALL_RUNTIME) ? [...actions, ACTION.INSTALL_RUNTIME] : actions;
    return mismatch ? [...withRuntime, ACTION.FIX_APPID] : withRuntime;
  };
  const appidParams = { ...(mismatch ? { appidOnDisk: mismatch.onDisk, appidExpected: mismatch.expected } : {}), ...(foreignRuntime ? { foreignRuntime: true } : {}) };

  const errors = issuesAtLevel(goldberg, 'error');
  if (errors.length > 0) {
    const actions = errors.some((issue) => REPAIRABLE_GOLDBERG_CODES.has(issue.code)) ? [ACTION.REPAIR_DATA] : [];
    return check('emulator', LEVEL.FAIL, {
      params: { emulator: goldberg.emulator || 'none', topics: issueTopics(errors), ...appidParams },
      // Nothing this setup holds will ever be read while a foreign runtime serves the folder.
      blocking: foreignRuntime,
      actions: withAppidFix(actions),
    });
  }

  const warnings = issuesAtLevel(goldberg, 'warning');
  if (warnings.length > 0) {
    const actions = warnings.some((issue) => REPAIRABLE_GOLDBERG_CODES.has(issue.code)) ? [ACTION.REPAIR_DATA] : [];
    return check('emulator', LEVEL.WARN, {
      params: { emulator: goldberg.emulator || 'none', topics: issueTopics(warnings), ...appidParams },
      actions: withAppidFix(actions),
    });
  }

  return check('emulator', LEVEL.OK, { params: { emulator: goldberg.emulator || 'none' } });
}

function uplayCheck(signals) {
  const uplay = signals.uplay;
  if (!uplay) return null;
  // A Uplay loader in the folder doesn't mean the Uplay layer serves achievements: a crack loader
  // (ALI213, OnlineFix, TENOKE...) may already be doing that, making Uplay unused rather than broken.
  const servedBy = signals.crackLoader && signals.crackLoader.name;
  if (servedBy) {
    return check('uplay', LEVEL.INFO, { params: { servedBy, ...(uplay.mapping ? { steamAppid: String(uplay.mapping.steam_appid || ''), steamName: String(uplay.mapping.steam_name || '') } : {}) } });
  }
  const mappingParams = uplay.mapping
    ? {
        steamAppid: String(uplay.mapping.steam_appid || ''),
        steamName: String(uplay.mapping.steam_name || ''),
        mappingMode: uplay.mapping.manual ? 'manual' : uplay.mapping.automatic ? 'automatic' : 'built-in',
      }
    : {};
  /*
    Kept outside REPAIRABLE_UPLAY_CODES since a game that never asked the loader for anything isn't
    broken; this writes one reversible ini key instead of being offered unconditionally.

    Which of the two actions is offered follows the key that is actually on disk, so the button says
    what pressing it does. One action that flipped meaning silently read as if the last press had not
    registered: it still said "Enable" over a game whose ticket was already written.
  */
  const ticketCodes = new Set((uplay.issues || []).map((issue) => issue && issue.code));
  // What the row has to SAY about the setting, so a green row that suddenly grew a "turn it off"
  // button explains itself instead of looking like a leftover.
  const ticketState = ticketCodes.has('SESSION_TICKET_PENDING')
    ? 'pending'
    : ticketCodes.has('SESSION_TICKET_NO_EFFECT')
      ? 'no-effect'
      : ticketCodes.has('SESSION_TICKET_UNSUPPORTED')
        ? 'unsupported'
        : '';
  const ticketAction = ticketCodes.has('NO_SESSION_TICKET') ? ACTION.REPAIR_UPLAY_TICKET : ticketState ? ACTION.REMOVE_UPLAY_TICKET : null;
  const withTicketFix = (actions) => (ticketAction ? [...actions, ticketAction] : actions);
  const ticketParams = ticketState ? { ticket: ticketState } : {};

  const errors = issuesAtLevel(uplay, 'error');
  if (errors.length > 0) {
    // NO_STEAM_MAPPING is repairable interactively: the shared transaction tries the automatic
    // resolver first, then the validated manual picker, same recovery path as the context menu.
    const actions = withTicketFix(errors.some((issue) => REPAIRABLE_UPLAY_CODES.has(issue.code)) ? [ACTION.REPAIR_UPLAY] : []);
    return check('uplay', LEVEL.FAIL, {
      params: { topics: issueTopics(errors), ...mappingParams, ...ticketParams },
      blocking: !uplay.mapping,
      actions,
    });
  }
  const warnings = issuesAtLevel(uplay, 'warning');
  if (warnings.length > 0) {
    const actions = withTicketFix(warnings.some((issue) => REPAIRABLE_UPLAY_CODES.has(issue.code)) ? [ACTION.REPAIR_UPLAY] : []);
    return check('uplay', LEVEL.WARN, { params: { topics: issueTopics(warnings), ...mappingParams, ...ticketParams }, actions });
  }
  return check('uplay', LEVEL.OK, { params: { ...mappingParams, ...ticketParams }, actions: withTicketFix([]) });
}

// Has anything actually been unlocked or recorded yet: "has progress data" vs "has nowhere to
// read progress from" is the distinction that matters - a genuine 0% game is not a fault.
function progressCheck(signals) {
  // Nothing to unlock, so "nothing unlocked yet" is not a sentence worth printing.
  if (hasNoAchievements(signals)) return null;
  const unlocked = num(signals.achievements && signals.achievements.unlocked);
  const save = signals.goldberg && signals.goldberg.save;
  const uplaySave = signals.uplay && signals.uplay.save;

  /*
    A save AW Next seeded itself and nothing has written to since is not a save: it is the locked
    placeholder the fix leaves behind. Counting it as one turned "nothing is recording unlocks" into
    a calm "nothing unlocked yet", which is exactly the wrong sentence for a setup the game never
    loads (goldberg.inspectSaveState sets the flag).
  */
  const written = !!(save && save.exists && !save.seeded);

  if (unlocked > 0) return check('progress', LEVEL.OK, { params: { unlocked } });
  if (written && num(save.earned) > 0) return check('progress', LEVEL.OK, { params: { unlocked: num(save.earned) } });
  if (uplaySave && uplaySave.exists && num(uplaySave.earned) > 0) return check('progress', LEVEL.OK, { params: { unlocked: num(uplaySave.earned) } });
  if (written) return check('progress', LEVEL.INFO, { params: { type: save.type || '' } });
  /*
    The placeholder only means something once the game has run on it. Right after a setup or a
    repair nothing could have been written yet, and a warning there reads as a fault in the fix
    that was just applied. lastPlayed is in seconds, seededAt in milliseconds.
  */
  if (save && save.exists && save.seeded && num(save.seededAt) > 0) {
    const lastPlayedMs = num(signals.playtime && signals.playtime.lastPlayed) * 1000;
    if (lastPlayedMs <= num(save.seededAt)) return check('progress', LEVEL.INFO, {});
  }
  // Only warn when the save location is actually known and empty. Without a diagnosed setup there
  // is nowhere to have looked, so "no progress" is just a game with no progress.
  if (signals.emulated && signals.goldberg && signals.goldberg.steamSettings) return check('progress', LEVEL.WARN, {});
  return check('progress', LEVEL.INFO, {});
}

/*
  Progress counters ("37/50") for a save that keeps its stats apart from its unlocks (CODEX, RUNE,
  OnlineFix). Shown only when that save has stats: every other game either stores progress itself
  or has none. A missing table is not a fault, so it is INFO with the fetch offered.
*/
function countersCheck(signals) {
  if (hasNoAchievements(signals)) return null;
  const counters = signals.counters;
  if (!counters || num(counters.stats) <= 0) return null;
  const params = { stats: num(counters.stats), count: num(counters.count), source: counters.source || '' };
  if (counters.source && params.count > 0) return check('counters', LEVEL.OK, { params });
  // Steam itself says no achievement has a counter: nothing is missing, and nothing to fetch.
  if (counters.official === 0) return check('counters', LEVEL.OK, { params: { ...params, none: true } });
  if (num(counters.official) > 0) params.official = num(counters.official);
  return check('counters', LEVEL.INFO, { params, actions: counters.canFetch ? [ACTION.FETCH_PROGRESS] : [] });
}

// Live tracking means the watchdog's process monitor matched a running binary; console emulators
// and official platform libraries use their own watchers, so a missing entry there is normal.
function trackingCheck(signals) {
  // The process monitor exists to catch unlocks. With no achievement to catch, a game missing from
  // the index is not a gap, and playtime alone has never been worth a warning row.
  if (hasNoAchievements(signals)) return null;
  if (signals.processTracking === false) return null;
  const tracking = signals.tracking || {};
  if (tracking.indexed && tracking.binary) return check('tracking', LEVEL.OK, { params: { binary: tracking.binary } });
  if (signals.exe && signals.exeExists) return check('tracking', LEVEL.WARN, { actions: [ACTION.START_TRACKING] });
  return check('tracking', LEVEL.WARN, { actions: [ACTION.CHOOSE_EXE] });
}

// `effective` records what actually carried a delivered notification (transport/reason/outcome),
// distinct from the configured `transport`, so the row can say "via the Windows fallback".
function notificationCheck(signals) {
  const notifications = signals.notifications || {};
  const effective = notifications.effective || null;
  const params = { transport: notifications.transport || '' };
  if (effective) {
    params.effective = effective.transport || '';
    params.effectiveReason = effective.reason || '';
    params.outcome = effective.outcome || 'delivered';
    // "It worked, but not through the transport you picked" is a decision, not a wording choice, so
    // it belongs here: the renderer must not have to compare transport ids to phrase a sentence.
    params.fallbackActive = params.outcome === 'fallback' || (!!params.effective && params.effective !== params.transport);
  }

  if (notifications.progressMuted) {
    return check('notifications', LEVEL.INFO, { params, actions: [ACTION.UNMUTE_PROGRESS, ACTION.TEST_NOTIFICATION] });
  }
  // The transport itself reported the send failing - the one notification state that is a fault
  // rather than a routing detail.
  if (effective && effective.outcome === 'failed') {
    return check('notifications', LEVEL.WARN, { params, actions: [ACTION.TEST_NOTIFICATION] });
  }
  return check('notifications', LEVEL.OK, { params, actions: [ACTION.TEST_NOTIFICATION] });
}

function buildChecks(signals) {
  return [
    installCheck(signals),
    executableCheck(signals),
    identityCheck(signals),
    achievementDataCheck(signals),
    emulatorCheck(signals),
    uplayCheck(signals),
    progressCheck(signals),
    countersCheck(signals),
    trackingCheck(signals),
    notificationCheck(signals),
  ].filter(Boolean);
}

function byId(checks, id) {
  return checks.find((entry) => entry.id === id) || null;
}

// The one sentence a user reads first, ordered by what blocks unlocks earliest so the explanation
// names the root cause rather than a downstream symptom.
function explain(state, checks, signals) {
  const install = byId(checks, 'install');
  const data = byId(checks, 'achievement-data');
  const emulator = byId(checks, 'emulator');
  const uplay = byId(checks, 'uplay');
  const progress = byId(checks, 'progress');
  const tracking = byId(checks, 'tracking');
  const notifications = byId(checks, 'notifications');

  if (install && install.level === LEVEL.FAIL) {
    return { reason: signals.gameDir ? 'install-gone' : 'not-installed', params: install.params };
  }
  // Outranks every setup sentence below: there is no achievement to track, so nothing downstream
  // can be a fault. Only the install rows above still matter, since a missing folder is one.
  if (hasNoAchievements(signals)) return { reason: 'no-achievements', params: {} };
  if (data && data.level === LEVEL.FAIL && data.blocking) return { reason: 'no-achievement-data', params: data.params };
  // Only a blocking emulator failure means "there is no emulator here"; a report that merely
  // carries schema or config errors is explained by the check that owns those instead.
  if (emulator && emulator.level === LEVEL.FAIL && emulator.blocking) {
    // The runtime is present, it just belongs to another crack - a different sentence from "the
    // emulator file is missing", and a different thing for the user to decide.
    if (emulator.params && emulator.params.foreignRuntime) return { reason: 'emulator-runtime-foreign', params: emulator.params };
    const canInstall = emulator.actions.includes(ACTION.INSTALL_RUNTIME);
    return { reason: canInstall ? 'emulator-runtime-missing' : 'emulator-missing', params: emulator.params };
  }
  if (uplay && uplay.level === LEVEL.FAIL) return { reason: 'uplay-broken', params: uplay.params };
  if (data && data.level === LEVEL.FAIL) return { reason: 'achievement-data-incomplete', params: data.params };
  // A wrong appid outranks "nothing unlocked yet" below, since it's the actual reason: the
  // emulator announces one game and AW Next watches another.
  if (emulator && emulator.params && emulator.params.appidExpected) return { reason: 'appid-mismatch', params: emulator.params };
  // The signature case: everything needed is present, nothing has been recorded yet. Say where the
  // fault is likely to be, because "no notifications appeared" is the usual misread.
  if (progress && progress.level === LEVEL.WARN) return { reason: 'no-progress-yet', params: progress.params };
  if (data && data.level === LEVEL.WARN) return { reason: 'achievement-data-incomplete', params: data.params };
  if (emulator && (emulator.level === LEVEL.WARN || emulator.level === LEVEL.FAIL)) return { reason: 'emulator-partial', params: emulator.params };
  // Reading unlocks out of a save folder without knowing where the game lives is a real state, and
  // a common one for cracked games. Saying "nothing unlocked yet" here would contradict the chip.
  if (install && install.level === LEVEL.WARN) return { reason: 'install-unknown', params: install.params };
  if (tracking && tracking.level === LEVEL.WARN) return { reason: 'not-watched', params: tracking.params };
  // Everything is set up and unlocks are being seen - the last one just could not be announced.
  if (notifications && notifications.level === LEVEL.WARN) return { reason: 'notification-failed', params: notifications.params };
  if (notifications && notifications.level === LEVEL.INFO) return { reason: 'progress-muted', params: notifications.params };
  if (progress && progress.level === LEVEL.INFO) return { reason: 'nothing-unlocked-yet', params: progress.params };
  if (state === STATE.READY) return { reason: 'ready', params: {} };
  return { reason: 'attention', params: {} };
}

function deriveState(checks, signals = {}) {
  if (checks.some((entry) => entry.blocking && entry.level === LEVEL.FAIL)) return STATE.NOT_TRACKING;
  /*
    The state answers "are this game's achievements being tracked". A game that publishes none is
    trivially fine, whatever the rows above say about an executable AW could not place or a folder
    somebody set up for nothing - none of it can cost an unlock that does not exist.
  */
  if (hasNoAchievements(signals)) return STATE.READY;
  if (checks.some((entry) => entry.level === LEVEL.FAIL || entry.level === LEVEL.WARN)) return STATE.ATTENTION;
  return STATE.READY;
}

// Everything the Technical details block shows, kept as raw values (paths, counts, issue codes
// and messages) so a bug report can be assembled from this alone.
function buildTechnical(signals) {
  const goldberg = signals.goldberg;
  const uplay = signals.uplay;
  return {
    appid: signals.appid != null ? String(signals.appid) : '',
    steamAppid: signals.steamappid ? String(signals.steamappid) : '',
    name: signals.name || '',
    source: signals.source || '',
    system: signals.system || '',
    installed: !!signals.installed,
    gameDir: signals.gameDir || '',
    gameDirExists: !!signals.gameDirExists,
    exe: signals.exe || '',
    exeExists: !!signals.exeExists,
    achievements: {
      total: num(signals.achievements && signals.achievements.total),
      unlocked: num(signals.achievements && signals.achievements.unlocked),
    },
    emulated: !!signals.emulated,
    // When the achievement list was last re-read from Steam (steam.js descBackfilledAt, every 3
    // days). 0 means never checked, which is a different answer from "checked and unchanged".
    achievementsCheckedAt: num(signals.achievementsCheckedAt),
    processTracking: signals.processTracking !== false,
    saveSources: Array.isArray(signals.saveSources) ? signals.saveSources : [],
    goldberg: goldberg
      ? {
          emulator: goldberg.emulator || 'none',
          steamSettings: goldberg.steamSettings || '',
          dllCount: num(goldberg.dllCount),
          // The folders behind that count, and whether steam_settings is in one of them: a report
          // that only said "2 dlls" could not distinguish a working layout from an unread one.
          dllDirs: Array.isArray(goldberg.dllDirs) ? goldberg.dllDirs : [],
          // Packaged Unreal builds only: the folder the engine loads steam_api from, which is not
          // under the game folder at all when the library anchored the game on its project folder.
          engineDllDirs: Array.isArray(goldberg.engineDllDirs) ? goldberg.engineDllDirs : [],
          // One entry per steam_api dll on disk, saying which build it is (gbeInstaller
          // .describeRuntimeDlls). "awBuild: false" on the engine's own copy is the whole answer
          // when a repaired game still records nothing, and no other field can carry it.
          runtimeDlls: Array.isArray(goldberg.runtimeDlls) ? goldberg.runtimeDlls : [],
          settingsBesideDll: goldberg.settingsBesideDll === undefined ? null : goldberg.settingsBesideDll,
          localSaveDir: goldberg.localSaveDir || '',
          expected: goldberg.achievements ? goldberg.achievements.expected : null,
          found: num(goldberg.achievements && goldberg.achievements.found),
          missing: ((goldberg.achievements && goldberg.achievements.missing) || []).length,
          missingIcons: ((goldberg.achievements && goldberg.achievements.missingIcons) || []).length,
          save: goldberg.save || null,
          issues: (goldberg.issues || []).map((issue) => ({ level: issue.level, code: issue.code, message: issue.message })),
        }
      : null,
    uplay: uplay
      ? {
          dll: uplay.dll || null,
          loader: uplay.loader || null,
          iniFile: uplay.iniFile || '',
          mapping: uplay.mapping || null,
          saveDirs: uplay.saveDirs || [],
          save: uplay.save || null,
          issues: (uplay.issues || []).map((issue) => ({ level: issue.level, code: issue.code, message: issue.message })),
        }
      : null,
    tracking: signals.tracking || { indexed: false, binary: '' },
    counters: signals.counters || null,
    notifications: signals.notifications || {},
    playtime: signals.playtime || { total: 0, lastPlayed: 0 },
  };
}

// signals: see buildTechnical() for the full accepted shape. Every field is optional; a game the
// app knows almost nothing about still produces a usable report.
function deriveHealth(signals = {}) {
  const checks = buildChecks(signals);
  const state = deriveState(checks, signals);
  const { reason, params } = explain(state, checks, signals);

  // Offer each action once, in the order the checks raised it, so the primary fix for the reported
  // problem is always the first button.
  const actions = [];
  for (const entry of checks) {
    for (const action of entry.actions) if (!actions.includes(action)) actions.push(action);
  }

  return { state, reason, params, checks, actions, technical: buildTechnical(signals) };
}

/*
  The tile dot, from what a library scan already knows (the panel's full report replaces it once
  opened); lives here so both halves of "what colour is this game" are in one tested place. A
  Uplay R1/R2 game has no steam_api dll by design, so it needs its own marking or gets no dot.
*/
function hasDot(game) {
  const record = game && typeof game === 'object' ? game : {};
  // A game Steam says has no achievements gets no dot: there is no state to report and no repair
  // to offer, and any colour there reads as a verdict on a setup that was never needed.
  if (record.achievement && record.achievement.none) return false;
  return typeof record.hasSteamApiDll === 'boolean' || !!record.uplayR2 || record.system === 'uplay';
}

function scannedState(game) {
  const record = game && typeof game === 'object' ? game : {};
  if (record.achievement && record.achievement.none) return STATE.READY;
  const total = num(record.achievement && record.achievement.total);
  if (record.uplayR2 || record.system === 'uplay') {
    // uplayHealthy is set by the scan only after diagnosing the loader/config; absent means "not
    // looked at", a different answer from "broken".
    if (record.uplayHealthy === false) return STATE.NOT_TRACKING;
    if (record.uplayHealthy === true && total > 0) return STATE.READY;
    return STATE.ATTENTION;
  }
  if (!record.hasSteamApiDll) return STATE.NOT_TRACKING;
  if (record.unconfigured || total <= 0) return STATE.ATTENTION;
  return STATE.READY;
}

module.exports = {
  deriveHealth,
  issueTopics,
  hasDot,
  scannedState,
  STATE,
  LEVEL,
  ACTION,
  ISSUE_TOPIC,
  REPAIRABLE_GOLDBERG_CODES,
  REPAIRABLE_UPLAY_CODES,
};
