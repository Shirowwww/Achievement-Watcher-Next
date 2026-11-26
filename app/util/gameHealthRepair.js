'use strict';

/*
  The two file-changing repairs Game Health can run, and the plans describing them beforehand.
  Both delegate to the existing parsers, so their backup behaviour is inherited: goldberg.repair()
  copies replaced files into steam_settings/.aw-backups/<timestamp>/, and
  gbeInstaller.installDlls() copies each replaced steam_api dll to <name>.bak once. Dependencies
  are injected so this is testable without Electron, a network or a game install.
*/

const fs = require('fs');
const path = require('path');
const unrealLayout = require('./unrealLayout.js');
const crackLoaderDetect = require('./crackLoaderDetect.js');
const gbeSchemaFiles = require('../parser/gbeSchema.js');
const steamApiCallers = require('../parser/steamApiCallers.js');
const { usableInterfacesFile } = require('./steamInterfacesFile.js');
const runtimeSwitchUndo = require('./runtimeSwitchUndo.js');

function sameDir(a, b) {
  if (!a || !b) return false;
  try {
    return path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
  } catch {
    return false;
  }
}

/*
  Which folder the repair must write into. Goldberg and GBE read steam_settings only from the folder
  their own dll was loaded from, so a diagnosed folder that has no dll beside it (steam_settings at
  the game root, dll in <Name>/Binaries/Win64) is one the emulator never opens - rewriting it would
  clear the warning on screen and change nothing in the game. Writing beside the dll is what makes
  the setup real. The old folder is left alone: it is inert, and it is a backup.
*/
function settingsTarget({ current, dllDirs = [], exePath = null, gameDir = '' }) {
  const dirs = (dllDirs || []).filter(Boolean);
  const currentParent = current ? path.dirname(current) : '';
  // A GBE runtime that a proxy dll loads (version.dll -> steamclient64.dll) is read from this folder
  // while Valve's steam_api stays elsewhere: the settings are already where the game looks (#169).
  if (currentParent && crackLoaderDetect.proxyLoadedRuntime(currentParent)) return current;
  /*
    A packaged Unreal build loads steam_api by explicit path from Engine/Binaries/ThirdParty/
    Steamworks, so that folder outranks every other candidate - including a folder that already has
    a dll beside it. Writing beside the game root's own copy is what looked correct on screen and
    changed nothing in the game. Resolved from gameDir as well as from the diagnosed dll folders,
    because the engine's copy is still Valve's own until the fix replaces it.
  */
  const engineDir = dirs.find((dir) => unrealLayout.isSteamworksDllDir(dir)) || unrealLayout.steamworksDllDirs(gameDir)[0];
  if (engineDir) return sameDir(engineDir, currentParent) ? current : path.join(engineDir, 'steam_settings');
  if (dirs.length === 0) return current;
  if (currentParent && dirs.some((dir) => sameDir(dir, currentParent))) return current;

  // Several dlls can be on disk (a launcher's copy, a leftover from another crack). The one beside
  // the game's own executable is the one that gets loaded.
  const exeDir = exePath ? path.dirname(exePath) : '';
  const chosen = (exeDir && dirs.find((dir) => sameDir(dir, exeDir))) || dirs[0];
  return path.join(chosen, 'steam_settings');
}

// What "Repair the achievement data" is about to write, in the caller's own terms. The renderer
// shows this before the first byte is written; nothing here touches the disk.
function planAchievementDataRepair({ steamSettings, gameDir, achievementCount = 0, downloadIcons = false, dllDirs = [], exePath = null } = {}) {
  const current = steamSettings || (gameDir ? path.join(gameDir, 'steam_settings') : '');
  const target = settingsTarget({ current, dllDirs, exePath, gameDir });
  const writes = ['achievements.json', 'steam_appid.txt', 'configs.app.ini', 'configs.main.ini', 'configs.user.ini'];
  if (downloadIcons) writes.push('images/');
  return {
    target,
    writes,
    achievementCount,
    backup: target ? path.join(target, '.aw-backups') : '',
    // Set only when the repair moves to a different folder than the one diagnosed, so the
    // confirmation can say where the settings are going and why.
    relocatedFrom: target && current && !sameDir(target, current) ? current : '',
  };
}

/*
  Game Health's button since #194: the same folder, but only the schema files and the icons they
  name. The icon folder is the one the existing schema already uses (img/ from the generator),
  never a second copy beside it.
*/
function planSchemaRewrite({ steamSettings, gameDir, achievementCount = 0, downloadIcons = false, dllDirs = [], exePath = null, advanced = false } = {}) {
  const base = planAchievementDataRepair({ steamSettings, gameDir, achievementCount, downloadIcons, dllDirs, exePath });
  let folder = 'images';
  try {
    const existing = JSON.parse(fs.readFileSync(path.join(base.target, 'achievements.json'), 'utf8'));
    folder = gbeSchemaFiles.iconFolder(Array.isArray(existing) ? existing : []) || folder;
  } catch {
    /* no schema yet: the default folder */
  }
  const writes = ['achievements.json', 'stats.json'];
  if (downloadIcons) writes.push(`${folder}/`);
  // Said before the click: whether the definitions come from the generator Settings names (#194).
  return { ...base, writes, iconFolder: folder, source: advanced ? 'generator' : 'community' };
}

// Run the schema-only rewrite planned above. Nothing outside achievements.json, stats.json and
// the icon folder is written; see gbeSchema.rewrite for the backup it keeps.
async function rewriteAchievementSchema({ gbeSchema, plan, schema, emulator = 'gbe', language = 'english', reference = {}, links = [], downloadIcon = null, onProgress = null } = {}) {
  if (!plan || !plan.target) throw new Error('rewriteAchievementSchema: no steam_settings target resolved');
  return gbeSchema.rewrite({ steamSettings: plan.target, schema, emulator, language, reference, links, downloadIcon, onProgress });
}

/*
  Resolve where the emulator runtime dll(s) would go. Mirrors the directory choice the right-click
  emulator fix makes, so a game repaired from here ends up with the same layout. A native Linux game
  gets libsteam_api.so of its own architecture instead of a Windows dll.
*/
function planRuntimeInstall({ gbeInstaller, gameDir, exePath = null, steamSettings = null, dllPaths = [], arch = 'x64', native = false } = {}) {
  const dirs = gbeInstaller.runtimeDllDirs({ gameDir, dllPaths, exePath, steamSettings });
  const dllFile = gbeInstaller.ARCH[arch] ? gbeInstaller.ARCH[arch].file : gbeInstaller.ARCH.x64.file;
  const file = native ? gbeInstaller.NATIVE_LIB : dllFile;
  return { dirs, arch, native, file, backup: `${file}.bak` };
}

function releaseRuntimeFiles(dir, gbeInstaller, native, isAwBuild) {
  const names = native ? [gbeInstaller.NATIVE_LIB] : Object.values(gbeInstaller.ARCH).map((entry) => entry.file);
  return names.filter((name) => fs.existsSync(path.join(dir, name)) && !runtimeSwitchUndo.isAwLeftover(path.join(dir, name), isAwBuild));
}

/*
  A switch replaces the Steam dlls the release ships, and only those: same folder, same architecture.
  Planned from the exe, it seeded GBE wherever the exe pointed. D4: Dark Dreams Don't Die starts from
  a 32-bit launcher at its root, and the switch put an x86 steam_api.dll beside the game's x64 one in
  Binaries/Win64 and two more dlls at a root that had none. A release with no Steam dll at all keeps
  the install plan. `dllPaths` are the dlls the scan found, so their folders are looked at too.
*/
function planRuntimeSwitch({ gbeInstaller, plan, dllPaths = [], isAwBuild = null } = {}) {
  if (!plan || !Array.isArray(plan.dirs)) return plan;
  const dirs = [...plan.dirs];
  for (const file of dllPaths || []) {
    const dir = file ? path.dirname(file) : '';
    if (dir && !dirs.some((known) => sameDir(known, dir))) dirs.push(dir);
  }
  const held = dirs.map((dir) => ({ dir, files: releaseRuntimeFiles(dir, gbeInstaller, plan.native, isAwBuild) })).filter((entry) => entry.files.length > 0);
  if (held.length === 0) return plan;
  // The dll steam_settings goes beside leads: the plan's own file where the release has one.
  const first = held.find((entry) => entry.files.includes(plan.file)) || held[0];
  const ordered = [first, ...held.filter((entry) => entry !== first)];
  const file = first.files.includes(plan.file) ? plan.file : first.files[0];
  const arch = plan.native ? plan.arch : file === gbeInstaller.ARCH.x86.file ? 'x86' : 'x64';
  const replace = ordered.flatMap((entry) => entry.files.map((name) => path.join(entry.dir, name)));
  return { ...plan, dirs: ordered.map((entry) => entry.dir), file, arch, backup: `${file}.bak`, replace };
}

const LEGACY_DLC_CONFIG_FILES = ['steam_emu.ini', 'steam_api.ini', 'cpy.ini'];

function parseLegacyDlcConfig(text) {
  let inDlc = false;
  let unlockAll = false;
  const dlcs = [];
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim();
    const section = line.match(/^\[([^\]]+)\]$/);
    if (section) {
      inDlc = section[1].toLowerCase() === 'dlc';
      continue;
    }
    if (!inDlc || line.startsWith(';') || line.startsWith('#')) continue;
    const unlock = line.match(/^dlcunlockall\s*=\s*([01])\s*$/i);
    if (unlock) {
      unlockAll = unlock[1] === '1';
      continue;
    }
    const entry = line.match(/^(\d+)\s*=\s*(.*?)\s*$/);
    if (entry) dlcs.push({ appid: entry[1], name: entry[2] || `DLC ${entry[1]}` });
  }
  return unlockAll || dlcs.length > 0 ? { dlcs, unlockAll } : null;
}

function captureLegacyDlcConfig({ dirs = [] } = {}) {
  for (const dir of dirs || []) {
    for (const name of LEGACY_DLC_CONFIG_FILES) {
      const file = path.join(dir, name);
      try {
        if (!fs.existsSync(file)) continue;
        const parsed = parseLegacyDlcConfig(fs.readFileSync(file, 'utf8'));
        if (parsed) return { ...parsed, source: file };
      } catch {
        // A malformed legacy config should not block the runtime switch.
      }
    }
  }
  return null;
}

function migrateDlcConfig({ goldberg, steamSettings, legacy = null } = {}) {
  if (!legacy) return null;
  if (!goldberg || typeof goldberg.writeDlcConfig !== 'function') {
    throw new Error('migrateDlcConfig: Goldberg DLC writer is required');
  }
  const configFile = path.join(steamSettings, 'configs.app.ini');
  const existing = fs.existsSync(configFile) ? fs.readFileSync(configFile, 'utf8') : '';
  if (typeof goldberg.dlcConfigMode === 'function' && goldberg.dlcConfigMode(existing) !== 'none') {
    return { migrated: false, reason: 'existing-config', source: legacy.source };
  }
  const backupDir = typeof goldberg.backupDirFor === 'function' ? goldberg.backupDirFor(steamSettings) : null;
  const result = goldberg.writeDlcConfig({
    steamSettings,
    dlcs: legacy.dlcs,
    unlockAll: legacy.unlockAll,
    backupDir,
  });
  return { migrated: true, source: legacy.source, ...result };
}

/*
  Write the achievement schema, icons and GBE config files for one game. `schema` is the AW game
  object; every other argument is passed straight through to goldberg.repair(), including the
  backup it performs first.
*/
async function repairAchievementData({
  goldberg,
  plan,
  appid,
  schema,
  downloadIcon = null,
  fetchDlc = null,
  fetchStats = null,
  accountName = '',
  language = '',
  accountSteamId = undefined,
  localSavePath = undefined,
  // Complete configs.user.ini even when the app has no name or language to stamp into it - the two
  // user-config warnings are listed as repairable, so the repair has to be able to clear them.
  fillUserDefaults = false,
  // Turns the emulator's offline=1 off: set only when the diagnosis raised EMULATOR_OFFLINE.
  online = false,
  // The automatic fix passes the manageDlc setting; dropping it here made every repair write
  // configs.app.ini. The panel's explicit repair passes nothing and keeps writing it, as before.
  writeDlc = true,
  // Passed straight to goldberg.repair(); see its onProgress for the phases and their counts.
  onProgress = null,
} = {}) {
  if (!plan || !plan.target) throw new Error('repairAchievementData: no steam_settings target resolved');
  return goldberg.repair({
    steamSettings: plan.target,
    appid,
    schema,
    downloadIcon,
    fetchDlc,
    fetchStats,
    accountName,
    language,
    accountSteamId,
    localSavePath,
    fillUserDefaults,
    online,
    writeDlc,
    onProgress,
  });
}

/*
  Installs the supported GBE Fork runtime dll(s) into the planned directories - the fix for a
  complete steam_settings with no steam_api dll beside it. steam_interfaces.txt is regenerated
  when the original dll is still recoverable; that step is best-effort and never fails the install.
*/
async function installEmulatorRuntime({
  gbeInstaller,
  plan,
  cacheDir,
  steamSettings = null,
  log,
  dlls: staged = null,
  goldberg = null,
  legacyDlc = null,
  appid = '',
} = {}) {
  if (!plan || !Array.isArray(plan.dirs) || plan.dirs.length === 0) {
    throw new Error('installEmulatorRuntime: no target directory resolved');
  }
  // `staged`: the build the caller downloaded before changing anything, so a blocked download
  // cannot land between two writes.
  const dlls = staged || (await gbeInstaller.ensureEmulatorDlls({ cacheDir, log }));
  // A switch plan (planRuntimeSwitch) names the release's own files and seeds nothing.
  const replaceOnly = Array.isArray(plan.replace);
  const summary = gbeInstaller.installDlls({
    dllDirs: plan.dirs,
    dlls,
    writeIfMissing: plan.native || replaceOnly ? null : plan.arch,
    ensureArch: plan.native || replaceOnly ? null : plan.arch,
    nativeArch: plan.native && !replaceOnly ? plan.arch : null,
    only: replaceOnly ? plan.replace : null,
    log,
  });

  let interfaces = null;
  if (steamSettings) {
    try {
      interfaces = await gbeInstaller.generateInterfaces({
        dllPath: path.join(plan.dirs[0], plan.file),
        steamSettings,
        dlls,
        // The other target folders hold copies of the same dll; one of them may still be the
        // original when the one just replaced was already an emulator (see interfaceSourceFor).
        candidates: plan.dirs.slice(1).map((dir) => path.join(dir, plan.file)),
        appid,
        log,
      });
    } catch (err) {
      // The emulator still works without steam_interfaces.txt for most titles; surface it in the
      // result instead of failing an otherwise successful install.
      interfaces = { generated: false, reason: String((err && err.message) || err) };
    }
  }

  gbeInstaller.ensureTitleSetup({ appid, dirs: plan.dirs, log });
  const dlc = migrateDlcConfig({ goldberg, steamSettings, legacy: legacyDlc });
  return { ...summary, interfaces, dlc };
}

/*
  Where a switch writes steam_settings: GBE reads the one beside its dll, and the first target is the
  dll the game loads (an engine folder leads the list). A folder left beside the exe is not it.
*/
function switchSettingsDir(plan, steamSettings = null) {
  if (!plan || !Array.isArray(plan.dirs) || plan.dirs.length === 0) return steamSettings;
  const target = path.join(plan.dirs[0], 'steam_settings');
  return steamSettings && path.resolve(steamSettings).toLowerCase() === path.resolve(target).toLowerCase() ? steamSettings : target;
}

/*
  Switch a crack-served game to GBE Fork in one step. Installing the dll alone left GBE with no
  steam_settings and no appid, and the game crashed at launch until the second step ran (Clair
  Obscur). The dll, steam_appid.txt and the schema now go in together; the caller runs this inside
  one repairJournal record, so a failure anywhere puts every file back. Downloads (`dlls`, the
  reference) happen before: nothing here waits on the network.
*/

async function switchToSupportedRuntime({
  gbeInstaller,
  goldberg,
  plan,
  steamSettings = null,
  appid,
  schema,
  reference = {},
  dlls,
  legacyDlc = null,
  sideline = () => [],
  log,
} = {}) {
  if (!/^[0-9]+$/.test(String(appid || ''))) throw new Error('switchToSupportedRuntime: GBE needs a Steam appid, none is known for this game');
  if (!plan || !Array.isArray(plan.dirs) || plan.dirs.length === 0) throw new Error('switchToSupportedRuntime: no target directory resolved');
  const target = switchSettingsDir(plan, steamSettings);
  // What the folders held before, so the Undo can put them back as they were (runtimeSwitchUndo).
  const before = runtimeSwitchUndo.begin(plan.dirs, target);
  const sidelined = sideline() || [];
  const summary = await installEmulatorRuntime({
    gbeInstaller,
    plan,
    steamSettings: target,
    dlls,
    goldberg,
    legacyDlc,
    appid,
    log,
  });
  // Only when absent: an appid the release already names is not this step's to change.
  if (!fs.existsSync(path.join(target, 'steam_appid.txt'))) goldberg.writeSteamAppId({ steamSettings: target, appid });
  // No icon download here: that is network, and a missing icon is offered by the rewrite later.
  const written = await gbeSchemaFiles.rewrite({ steamSettings: target, schema, emulator: 'gbe', reference });
  runtimeSwitchUndo.finish(before);
  return { ...summary, steamSettings: target, sidelined, schema: written.schema };
}

/*
  Whether swapping the runtime in `plan` for GBE Fork leaves the game able to start. A game whose
  original steam_api dll predates May 2016 needs steam_interfaces.txt (Goldberg's readme), and once a
  crack has replaced Valve's dll nothing may be left to generate it from: Dark Souls III over CODEX
  then closed three seconds after every launch. Tried before anything changes, in a throwaway folder.
*/
async function switchInterfacesReady({ gbeInstaller, plan, cacheDir, steamSettings = null, gameDir = '', appid = '', log } = {}) {
  if (usableInterfacesFile(steamSettings)) return { ready: true, reason: '' };
  if (plan.native) return { ready: true, reason: '' };
  if (steamApiCallers.namesItsInterfaces(gameDir)) return { ready: true, reason: '' };
  const dlls = await gbeInstaller.ensureEmulatorDlls({ cacheDir, log });
  try {
    const result = await gbeInstaller.tryGenerateInterfaces({
      dllPath: path.join(plan.dirs[0], plan.file),
      dlls,
      candidates: plan.dirs.slice(1).map((dir) => path.join(dir, plan.file)),
      appid,
      log,
    });
    return result && result.generated ? { ready: true, reason: '' } : { ready: false, reason: (result && result.reason) || 'no-output' };
  } catch (err) {
    return { ready: false, reason: String((err && err.message) || err) };
  }
}

module.exports = {
  planAchievementDataRepair,
  planSchemaRewrite,
  rewriteAchievementSchema,
  planRuntimeInstall,
  planRuntimeSwitch,
  repairAchievementData,
  installEmulatorRuntime,
  switchToSupportedRuntime,
  switchSettingsDir,
  switchInterfacesReady,
  captureLegacyDlcConfig,
  migrateDlcConfig,
};
