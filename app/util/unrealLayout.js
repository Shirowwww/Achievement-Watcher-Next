'use strict';

/*
  Where a packaged Unreal Engine build keeps the Steam API dll the engine actually loads.

  UE's OnlineSubsystemSteam does not load steam_api(64).dll from beside the game executable: it
  loads it by explicit path from Engine/Binaries/ThirdParty/Steamworks/Steamv<version>/Win64. A
  packaged build therefore looks like this, and the two folders are five levels apart:

    <build root>/
      <Game>.exe                                   launcher shim
      Engine/Binaries/ThirdParty/Steamworks/Steamv162/Win64/steam_api64.dll   <- the loaded one
      <Game>/Binaries/Win64/<Game>.exe             the real executable
      <Game>/Content/...

  Every emulator walk in AW is depth-limited (four levels, so a game folder is not walked whole on
  every scan), which put that dll permanently out of reach: it was never counted, never backed up,
  never replaced, and never got a steam_settings beside it. A GBE fix applied to the game folder
  then validated perfectly on screen while the process kept loading the untouched dll and recorded
  nothing at all (reported for The Blood of Dawnwalker and STAR WARS Zero Company, both UE5).

  Rather than deepen those walks - which costs I/O on every game, every scan - this module probes
  the one fixed path the engine uses. Purely structural: no game name, no version guessing.
*/

const path = require('path');
const dirCache = require('./dirCache.js');

const STEAM_API_DLLS = new Set(['steam_api.dll', 'steam_api64.dll']);

// Engine/Binaries/ThirdParty/Steamworks holds one Steamv<version> folder per SDK the build shipped
// with (usually exactly one), each with the Win64/Win32 pair the engine picks its arch from.
const STEAMWORKS_PARENT = ['Engine', 'Binaries', 'ThirdParty', 'Steamworks'];
const STEAMWORKS_ARCH_DIRS = new Set(['win64', 'win32']);
const STEAMWORKS_SDK_DIR = /^steamv\d+$/i;

// A packaged build always carries Engine/Binaries; a UE project folder inside it carries Binaries or
// Content. Neither shape occurs in a games library root, so the climb below cannot swallow one.
const PROJECT_MARKER_DIRS = new Set(['binaries', 'content']);

// Engine internals the climb may pass through on its way out, so a folder deep in the build (the
// executable's own Binaries/Win64) still resolves. Same names exeDetect.gameDirForExe climbs.
const NESTED_ENGINE_DIR = /^(?:x86|x64|x86_64|win32|win64|binaries|bin|plugins)$/i;

function subdirectories(dir) {
  const entries = dirCache.readdir(dir);
  if (!entries) return [];
  return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
}

function hasSubdirectory(dir, name) {
  const wanted = name.toLowerCase();
  return subdirectories(dir).some((entry) => entry.toLowerCase() === wanted);
}

// Case-insensitive resolution of a relative chain, so a build extracted on a case-sensitive share
// still matches. Returns the real path, or '' when any link is missing.
function resolveChain(root, chain) {
  let current = root;
  for (const name of chain) {
    const wanted = name.toLowerCase();
    const match = subdirectories(current).find((entry) => entry.toLowerCase() === wanted);
    if (!match) return '';
    current = path.join(current, match);
  }
  return current;
}

// Is `dir` the root of a packaged Unreal build (the folder holding Engine/Binaries)?
function isBuildRoot(dir) {
  if (!dir) return false;
  const engine = resolveChain(dir, ['Engine']);
  return !!engine && hasSubdirectory(engine, 'Binaries');
}

// Does `dir` look like the UE project folder inside a packaged build (<build root>/<Game>)?
function isProjectFolder(dir) {
  if (!dir) return false;
  return subdirectories(dir).some((entry) => PROJECT_MARKER_DIRS.has(entry.toLowerCase()));
}

/*
  The packaged build root at or above `dir`, or '' when `dir` is not part of one. Climbs at most
  `maxClimb` levels and only through folders that look like a UE project, so an ordinary game folder
  inside a library is never traded for the library itself.
*/
function buildRootFor(dir, { maxClimb = 4 } = {}) {
  if (!dir) return '';
  let current = path.resolve(dir);
  if (isBuildRoot(current)) return current;
  for (let i = 0; i < maxClimb; i++) {
    if (!isProjectFolder(current) && !NESTED_ENGINE_DIR.test(path.basename(current))) return '';
    const parent = path.dirname(current);
    if (!parent || parent === current) return '';
    current = parent;
    if (isBuildRoot(current)) return current;
  }
  return '';
}

/*
  The Win64/Win32 folders under Engine/Binaries/ThirdParty/Steamworks of the packaged build at or
  above `dir`, newest SDK first so the folder the engine most likely loads leads the list. Empty
  when `dir` is not a packaged Unreal build.
*/
function steamworksDllDirs(dir) {
  const root = buildRootFor(dir);
  if (!root) return [];
  const parent = resolveChain(root, STEAMWORKS_PARENT);
  if (!parent) return [];
  const sdks = subdirectories(parent)
    .filter((name) => STEAMWORKS_SDK_DIR.test(name))
    .sort((left, right) => Number(right.replace(/\D+/g, '')) - Number(left.replace(/\D+/g, '')));
  const out = [];
  for (const sdk of sdks) {
    const sdkDir = path.join(parent, sdk);
    const arches = subdirectories(sdkDir).filter((name) => STEAMWORKS_ARCH_DIRS.has(name.toLowerCase()));
    // Win64 first: readdir order would otherwise put the 32-bit folder of a 64-bit game in front.
    arches.sort((left, right) => (left.toLowerCase() === 'win64' ? -1 : right.toLowerCase() === 'win64' ? 1 : 0));
    for (const arch of arches) out.push(path.join(sdkDir, arch));
  }
  return out;
}

// The steam_api(64).dll files sitting in those folders, in the same order.
function steamworksDlls(dir) {
  const out = [];
  for (const dllDir of steamworksDllDirs(dir)) {
    const entries = dirCache.readdir(dllDir);
    if (!entries) continue;
    for (const entry of entries) {
      if (entry.isFile() && STEAM_API_DLLS.has(entry.name.toLowerCase())) out.push(path.join(dllDir, entry.name));
    }
  }
  return out;
}

// Is `dir` one of those folders? Path-only, so it also answers for a folder that no longer exists.
function isSteamworksDllDir(dir) {
  if (!dir) return false;
  const parts = path
    .resolve(dir)
    .split(/[\\/]+/)
    .map((part) => part.toLowerCase())
    .filter(Boolean);
  if (parts.length < STEAMWORKS_PARENT.length + 2) return false;
  const arch = parts[parts.length - 1];
  const sdk = parts[parts.length - 2];
  if (!STEAMWORKS_ARCH_DIRS.has(arch) || !STEAMWORKS_SDK_DIR.test(sdk)) return false;
  const chain = parts.slice(parts.length - 2 - STEAMWORKS_PARENT.length, parts.length - 2);
  return chain.join('/') === STEAMWORKS_PARENT.join('/').toLowerCase();
}

// The architecture a Steamworks folder is for ('x64' | 'x86'), or '' when it is not one. Seeding a
// Win32 folder with steam_api64.dll (or the reverse) only leaves a file the engine never opens.
function archOfSteamworksDir(dir) {
  if (!isSteamworksDllDir(dir)) return '';
  return path.basename(path.resolve(dir)).toLowerCase() === 'win64' ? 'x64' : 'x86';
}

module.exports = {
  archOfSteamworksDir,
  buildRootFor,
  isBuildRoot,
  isProjectFolder,
  isSteamworksDllDir,
  steamworksDllDirs,
  steamworksDlls,
  STEAM_API_DLLS,
};
