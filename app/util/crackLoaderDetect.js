'use strict';

// Detects folders already handled by a crack loader AW must not touch: loaders like OnlineFix
// hook the existing steam_api(64).dll in place, so swapping in GBE Fork would break their
// handshake. Read-only, top-level check, cheap enough to run on every auto-fix decision.

const fs = require('fs');
const path = require('path');
const unrealLayout = require('./unrealLayout.js');

/*
  Every Goldberg/GSE build reads its configuration from a steam_settings folder and carries that
  string in the binary; no Valve steam_api dll does. It is the one certain, offline answer to "is
  this dll an emulator or the original?" - which decides whether a steam_api dll found on disk is
  evidence of a setup at all, and whether steam_interfaces.txt may be generated from it.
*/
const EMULATOR_DLL_MARKER = Buffer.from('steam_settings', 'ascii');

function isEmulatorDll(file) {
  try {
    return fs.readFileSync(file).includes(EMULATOR_DLL_MARKER);
  } catch {
    return false;
  }
}

/*
  One entry per known loader: `markers` are exact, case-insensitive basenames looked for directly in
  the game folder. Every listed family already supplies its own Steam emulation, so replacing its
  runtime with GBE is never an automatic/config-generation operation.

  `replaceable` says whether that emulation IS the steam_api dll, and so whether swapping that one
  file for GBE Fork is a complete change the user may choose to make. It is false for families that
  emulate from a side channel - OnlineFix proxies through a dll of its own, ColdClient launches the
  game itself, SmartSteamEmu injects from a loader - where replacing steam_api leaves half a setup.
*/
const KNOWN_CRACK_LOADERS = [
  { name: 'OnlineFix', markers: ['onlinefix64.dll', 'onlinefix32.dll', 'onlinefix.dll', 'onlinefix.ini'], replaceable: false },
  /*
    Checked before the scene and legacy families: ColdClientLoader.ini names the loader that
    actually launches the game, while a stray SteamConfig.ini or steam_emu.ini is often a leftover
    of the crack a repack replaced (The Jackbox Party Pack Collection ships both). Taking the
    leftover reported every ColdClient save as somebody else's.
  */
  { name: 'ColdClient', markers: ['coldclientloader.ini', 'coldapi.ini'], replaceable: false },
  { name: 'TENOKE', markers: ['tenoke.ini'], replaceable: true },
  { name: 'ALI213', markers: ['ali213.ini'], replaceable: true },
  { name: 'SmartSteamEmu', markers: ['smartsteamemu.ini'], replaceable: false },
  { name: 'UniverseLAN', markers: ['universelan.ini'], replaceable: false },
  /*
    steam_api64.rne is RUNE's copy of the Valve dll its runtime replaced. Some releases ship it with no
    ini at all beside the dll (The Blood of Dawnwalker, Engine/Binaries/ThirdParty/Steamworks), so
    without it the folder read as unclaimed and a GBE steam_settings was written for a dll that never
    opens one.
  */
  { name: 'CODEX / RUNE / scene emulator', markers: ['steam_emu.ini', 'steam_api.ini', 'cpy.ini', 'steam_api64.rne', 'steam_api.rne'], replaceable: true },
  { name: 'Hoodlum / legacy emulator', markers: ['valve.ini', 'hlm.ini', 'ds.ini', 'steamconfig.ini'], replaceable: true },
  /*
    anadius EA/Origin cracks (The Sims 4, EA SPORTS FC...). Not Steam emulation at all: the loader
    proxies the EA layer through winmm.dll and records unlocks under %LOCALAPPDATA%\anadius\LSX emu,
    which the watchdog already watches. Never replaceable - there is no steam_api dll to swap, and
    installing one only litters the folder.
  */
  { name: 'anadius (EA)', markers: ['anadius.cfg', 'anadius64.dll', 'anadius32.dll', 'anadius64online.dll'], replaceable: false },
];

const STEAM_API_DLLS = ['steam_api.dll', 'steam_api64.dll'];

/*
  A release can keep Valve's steam_api dll and load a renamed GBE build through a proxy dll of its
  own (VOICES38: dstorage.dll loads steam_api64.v38). The renamed file counts only when it is an
  emulator AND a small dll beside it names it, so neither an orphan copy nor RUNE's .rne original does.
*/
const RENAMED_RUNTIME = /^steam_api(64)?\.(?!dll$)[a-z0-9]{1,8}$/i;
const PROXY_MAX_BYTES = 1024 * 1024;

function proxyLoadedRuntime(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true }).filter((entry) => entry.isFile());
  } catch {
    return null;
  }
  const runtimes = entries.filter((entry) => RENAMED_RUNTIME.test(entry.name) && isEmulatorDll(path.join(dir, entry.name)));
  if (runtimes.length === 0) return null;
  for (const entry of entries) {
    if (!/\.dll$/i.test(entry.name) || STEAM_API_DLLS.includes(entry.name.toLowerCase())) continue;
    const file = path.join(dir, entry.name);
    let bytes;
    try {
      if (fs.statSync(file).size > PROXY_MAX_BYTES) continue;
      bytes = fs.readFileSync(file);
    } catch {
      continue;
    }
    const named = runtimes.find((runtime) => bytes.includes(Buffer.from(runtime.name, 'ascii')));
    if (named) return { runtime: path.join(dir, named.name), loadedBy: file };
  }
  return null;
}

function loaderForEntries(entries, dir) {
  const present = new Set(entries.map((e) => e.toLowerCase()));
  // A replaceable loader IS its steam_api dll. Once GBE sits in that dll's place, the loader's ini is
  // a leftover the swap did not rename (every Jackbox Party Pack of one collection kept its
  // SteamConfig.ini), and reading it as the live runtime called GBE's own saves foreign.
  const emulatorDllHere = STEAM_API_DLLS.some((name) => present.has(name) && isEmulatorDll(path.join(dir, name)));
  for (const loader of KNOWN_CRACK_LOADERS) {
    if (loader.replaceable && emulatorDllHere) continue;
    const found = loader.markers.filter((marker) => present.has(marker));
    if (found.length > 0) return { name: loader.name, replaceable: loader.replaceable === true, dir, markers: found };
  }
  return null;
}

/*
  Move a loader's own configuration aside before its runtime is replaced, so the folder stops
  reading as crack-served and the ordinary GBE path (schema generation, repair, diagnosis) applies
  again. Renamed, never deleted: the same `.bak` convention gbeInstaller uses for the dll it
  replaces, so the whole swap can be undone by hand.
*/
function disableLoaderMarkers(dirs) {
  const moved = [];
  for (const dir of Array.isArray(dirs) ? dirs : [dirs]) {
    let entries;
    try {
      entries = fs.readdirSync(dir);
    } catch {
      continue;
    }
    const loader = loaderForEntries(entries, dir);
    if (!loader || !loader.replaceable) continue;
    for (const name of entries) {
      if (!loader.markers.includes(name.toLowerCase())) continue;
      const from = path.join(dir, name);
      const to = `${from}.bak`;
      try {
        if (fs.existsSync(to)) fs.rmSync(to, { force: true });
        fs.renameSync(from, to);
        moved.push(to);
      } catch {
        /* a file held open by the game stays where it is - the dll swap is still worth doing */
      }
    }
  }
  return moved;
}

/*
  Returns { name } for the first known crack loader whose markers exist directly in `gameDir`, or in
  the Steamworks folder a packaged Unreal build loads its dll from, or null.

  Two levels only, both of them drop points: a marker nested anywhere else isn't the loader's and
  would false-positive on a game that merely references the string in an asset. The Unreal one
  matters because a scene crack (RUNE, CODEX) puts its steam_emu.ini beside the dll it replaced,
  six levels down, where the game root sees nothing - AW then read the install as an unclaimed
  folder and offered it a GBE setup the crack's own dll never opens (reported for Little Nightmares
  Enhanced Edition). RUNE's steamclient layout and a ColdClient folder of its own follow below.
*/
const STEAMCLIENT_DLLS = ['steamclient64.dll', 'steamclient.dll'];

// RUNE's steamclient builds keep Valve's steam_api and run from Steam\steamclient64.dll with their
// ini beside it, so the loader lives there and there is no steam_api runtime to replace.
function steamclientLoader(gameDir) {
  const dir = path.join(gameDir, 'Steam');
  let entries;
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return null;
  }
  if (!entries.some((entry) => STEAMCLIENT_DLLS.includes(entry.toLowerCase()))) return null;
  const loader = loaderForEntries(entries, dir);
  return loader ? { ...loader, replaceable: false } : null;
}

/*
  ColdClient runs from wherever its loader sits, often a folder of its own (Achievement Enabler's
  _ColdClient). One level down, names only, its own ini beside the steamclient dll it injects. A GBE
  dll where the game loads it wins: the swap leaves an old ColdClient folder it never loads. A
  subfolder with a steam_api dll of its own is another game (a pack of a collection), not a loader.
*/
const COLDCLIENT_INI = 'coldclientloader.ini';

// Listed first: on Linux the dll's case is whatever the release shipped.
function hasEmulatorDll(dir) {
  let names;
  try {
    names = fs.readdirSync(dir);
  } catch {
    return false;
  }
  return names.some((name) => STEAM_API_DLLS.includes(name.toLowerCase()) && isEmulatorDll(path.join(dir, name)));
}

function coldClientSubfolder(gameDir, dirents, engineDirs) {
  if ([gameDir, ...engineDirs].some(hasEmulatorDll)) return null;
  for (const entry of dirents) {
    // A junction or symlink to a folder counts: readdir follows it, and fails on one to a file.
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
    const dir = path.join(gameDir, entry.name);
    let names;
    try {
      names = fs.readdirSync(dir).map((name) => name.toLowerCase());
    } catch {
      continue;
    }
    if (!names.some((name) => STEAMCLIENT_DLLS.includes(name)) || names.some((name) => STEAM_API_DLLS.includes(name))) continue;
    if (names.includes(COLDCLIENT_INI)) return { name: 'ColdClient', replaceable: false, dir, markers: [COLDCLIENT_INI] };
  }
  return null;
}

// `subfolders: false` for a caller that walks the tree itself and visits each subfolder anyway.
function detectWorkingCrackLoader(gameDir, { subfolders = true } = {}) {
  if (!gameDir) return null;
  let dirents;
  try {
    dirents = fs.readdirSync(gameDir, { withFileTypes: true });
  } catch {
    return null;
  }
  const atRoot = loaderForEntries(dirents.map((entry) => entry.name), gameDir);
  if (atRoot) return atRoot;
  const steamclient = steamclientLoader(gameDir);
  if (steamclient) return steamclient;
  const engineDirs = unrealLayout.steamworksDllDirs(gameDir);
  for (const dllDir of engineDirs) {
    let engineEntries;
    try {
      engineEntries = fs.readdirSync(dllDir);
    } catch {
      continue;
    }
    const loader = loaderForEntries(engineEntries, dllDir);
    if (loader) return loader;
  }
  return subfolders ? coldClientSubfolder(gameDir, dirents, engineDirs) : null;
}

function hasWorkingCrackLoader(gameDir) {
  return !!detectWorkingCrackLoader(gameDir);
}

/*
  OnlineFix's Friend's Pass runs the game on real Steam: with `UserStats=false` under [Interfaces] it
  leaves achievements and stats to the Steam client, which writes them to its own appcache, and its
  OnlineFix\<appid> folder stays empty.
*/
function leavesStatsToSteam(loader) {
  if (!loader || loader.name !== 'OnlineFix' || !loader.dir) return false;
  let text;
  try {
    text = fs.readFileSync(path.join(loader.dir, 'OnlineFix.ini'), 'utf8');
  } catch {
    return false;
  }
  const section = text.match(/^\s*\[Interfaces\][^\S\r\n]*\r?\n([\s\S]*?)(?=^\s*\[|(?![\s\S]))/im);
  return !!section && /^\s*UserStats\s*=\s*(false|0)\s*$/im.test(section[1]);
}

module.exports = { detectWorkingCrackLoader, hasWorkingCrackLoader, disableLoaderMarkers, isEmulatorDll, leavesStatsToSteam, proxyLoadedRuntime, EMULATOR_DLL_MARKER, STEAM_API_DLLS };
