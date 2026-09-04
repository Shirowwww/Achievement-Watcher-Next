'use strict';

/*
  The two file-changing repairs Game Health can run, and the plans describing them beforehand.
  Both delegate to the existing parsers, so their backup behaviour is inherited: goldberg.repair()
  copies replaced files into steam_settings/.aw-backups/<timestamp>/, and
  gbeInstaller.installDlls() copies each replaced steam_api dll to <name>.bak once. Dependencies
  are injected so this is testable without Electron, a network or a game install.
*/

const path = require('path');

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
  their own dll was loaded from, so a diagnosed folder that has no dll beside it (the Unreal case:
  steam_settings at the game root, dll in <Name>/Binaries/Win64) is one the emulator never opens -
  rewriting it would clear the warning on screen and change nothing in the game. Writing beside the
  dll is what makes the setup real. The old folder is left alone: it is inert, and it is a backup.
*/
function settingsTarget({ current, dllDirs = [], exePath = null }) {
  const dirs = (dllDirs || []).filter(Boolean);
  if (dirs.length === 0) return current;
  const currentParent = current ? path.dirname(current) : '';
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
  const target = settingsTarget({ current, dllDirs, exePath });
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
  Resolve where the emulator runtime dll(s) would go. Mirrors the directory choice the right-click
  emulator fix makes, so a game repaired from here ends up with the same layout.
*/
function planRuntimeInstall({ gbeInstaller, gameDir, exePath = null, steamSettings = null, dllPaths = [], arch = 'x64' } = {}) {
  const dirs = gbeInstaller.runtimeDllDirs({ gameDir, dllPaths, exePath, steamSettings });
  const file = gbeInstaller.ARCH[arch] ? gbeInstaller.ARCH[arch].file : gbeInstaller.ARCH.x64.file;
  return { dirs, arch, file, backup: `${file}.bak` };
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
  accountName = '',
  language = '',
  // Complete configs.user.ini even when the app has no name or language to stamp into it - the two
  // user-config warnings are listed as repairable, so the repair has to be able to clear them.
  fillUserDefaults = false,
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
    accountName,
    language,
    fillUserDefaults,
    onProgress,
  });
}

/*
  Installs the supported GBE Fork runtime dll(s) into the planned directories - the fix for a
  complete steam_settings with no steam_api dll beside it. steam_interfaces.txt is regenerated
  when the original dll is still recoverable; that step is best-effort and never fails the install.
*/
async function installEmulatorRuntime({ gbeInstaller, plan, cacheDir, steamSettings = null, log } = {}) {
  if (!plan || !Array.isArray(plan.dirs) || plan.dirs.length === 0) {
    throw new Error('installEmulatorRuntime: no target directory resolved');
  }
  const dlls = await gbeInstaller.ensureEmulatorDlls({ cacheDir, log });
  const summary = gbeInstaller.installDlls({
    dllDirs: plan.dirs,
    dlls,
    writeIfMissing: plan.arch,
    ensureArch: plan.arch,
    log,
  });

  let interfaces = null;
  if (steamSettings) {
    try {
      interfaces = await gbeInstaller.generateInterfaces({
        dllPath: path.join(plan.dirs[0], plan.file),
        steamSettings,
        dlls,
        log,
      });
    } catch (err) {
      // The emulator still works without steam_interfaces.txt for most titles; surface it in the
      // result instead of failing an otherwise successful install.
      interfaces = { generated: false, reason: String((err && err.message) || err) };
    }
  }

  return { ...summary, interfaces };
}

module.exports = { planAchievementDataRepair, planRuntimeInstall, repairAchievementData, installEmulatorRuntime };
