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
  { name: 'ColdClient', markers: ['coldclientloader.ini', 'coldapi.ini'], replaceable: false },
  /*
    anadius EA/Origin cracks (The Sims 4, EA SPORTS FC...). Not Steam emulation at all: the loader
    proxies the EA layer through winmm.dll and records unlocks under %LOCALAPPDATA%nadius\LSX emu,
    which the watchdog already watches. Never replaceable - there is no steam_api dll to swap, and
    installing one only litters the folder.
  */
  { name: 'anadius (EA)', markers: ['anadius.cfg', 'anadius64.dll', 'anadius32.dll', 'anadius64online.dll'], replaceable: false },
];

function loaderForEntries(entries, dir) {
  const present = new Set(entries.map((e) => e.toLowerCase()));
  for (const loader of KNOWN_CRACK_LOADERS) {
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
  Enhanced Edition).
*/
function detectWorkingCrackLoader(gameDir) {
  if (!gameDir) return null;
  let entries;
  try {
    entries = fs.readdirSync(gameDir);
  } catch {
    return null;
  }
  const atRoot = loaderForEntries(entries, gameDir);
  if (atRoot) return atRoot;
  for (const dllDir of unrealLayout.steamworksDllDirs(gameDir)) {
    let engineEntries;
    try {
      engineEntries = fs.readdirSync(dllDir);
    } catch {
      continue;
    }
    const loader = loaderForEntries(engineEntries, dllDir);
    if (loader) return loader;
  }
  return null;
}

function hasWorkingCrackLoader(gameDir) {
  return !!detectWorkingCrackLoader(gameDir);
}

module.exports = { detectWorkingCrackLoader, hasWorkingCrackLoader, disableLoaderMarkers, isEmulatorDll, EMULATOR_DLL_MARKER };
