'use strict';

/*
  Executables that start a game and then step aside: anti-cheat bootstrappers (Easy Anti-Cheat's
  start_protected_game.exe, BattlEye's <game>_BE.exe, EA's anti-cheat starter) and launchers. Steam
  often declares them as the launch exe, yet the game itself runs under another name, so watching
  one of them counts seconds of playtime and misses the game (#193). Pure name checks: also loaded
  by the Watchdog. The rules were checked against 1341 real executable names (see the tests).
*/
const ANTI_CHEAT_BOOTSTRAPPERS = [
  /^start_protected_game\.exe$/i,
  /^easyanticheat(?:_eos)?(?:_launcher)?\.exe$/i,
  /^eaclauncher\.exe$/i,
  /^eaanticheat\.gameservicelauncher\.exe$/i,
  /^belauncher\.exe$/i,
  /^beservice(?:_x64)?\.exe$/i,
];

// BattlEye's starter is "<game>_BE.exe" beside "<game>*.exe". The name alone could be a game's own,
// so where the other executable is known it must carry that stem (battlEyeHandsOverTo).
const BATTLEYE_LAUNCHER = /^(.+)_be\.exe$/i;

// Every name with "launcher" in it was a launcher on the corpus; anchoring it at the end of the name
// lost real ones (hirezlauncherui.exe, launcheregs.exe, launchersystem.exe).
const LAUNCHER = /launcher/i;

function baseName(file) {
  return String(file || '').split(/[\\/]/).pop();
}

function isAntiCheatBootstrapper(file) {
  const name = baseName(file);
  return !!name && (ANTI_CHEAT_BOOTSTRAPPERS.some((pattern) => pattern.test(name)) || BATTLEYE_LAUNCHER.test(name));
}

// Anything that hands over to the game rather than being it, by name alone.
function isLaunchBootstrapper(file) {
  const name = baseName(file);
  return isAntiCheatBootstrapper(name) || LAUNCHER.test(name);
}

// "TslGame_BE.exe" starts "TslGame.exe", "DayZ_BE.exe" starts "DayZ_x64.exe".
function battlEyeHandsOverTo(launcher, game) {
  const match = BATTLEYE_LAUNCHER.exec(baseName(launcher));
  const target = baseName(game).toLowerCase();
  return !!match && !!target && !BATTLEYE_LAUNCHER.test(target) && target.startsWith(match[1].toLowerCase());
}

// Whether `launcher` is what starts `game`: a BattlEye starter only for the game named after it.
function startsGame(launcher, game) {
  if (BATTLEYE_LAUNCHER.test(baseName(launcher))) return battlEyeHandsOverTo(launcher, game);
  return isLaunchBootstrapper(launcher) && !isLaunchBootstrapper(game);
}

/*
  The executable the playtime monitor should watch. The one the user configured wins (it is also
  what Play starts), except a launcher when detection found the game itself: then the game is
  watched and Game Health says so. Both are full paths, '' when unknown.
*/
function pickTrackedExe(configured, detected) {
  if (!configured) return detected || '';
  if (!detected || baseName(detected).toLowerCase() === baseName(configured).toLowerCase()) return configured;
  return startsGame(configured, detected) ? detected : configured;
}

module.exports = { ANTI_CHEAT_BOOTSTRAPPERS, BATTLEYE_LAUNCHER, baseName, battlEyeHandsOverTo, isAntiCheatBootstrapper, isLaunchBootstrapper, startsGame, pickTrackedExe };
