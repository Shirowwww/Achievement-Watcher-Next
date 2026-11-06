'use strict';

/*
  Which Uplay R1/R2 loader a game folder carries and what it can do, read from its files only.
  Low-level on purpose: launcher detection asks it without loading the repair code in uplayR2.js.
*/

const fs = require('fs');
const path = require('path');
const { parseIni, readIniSectionValues } = require(path.join(__dirname, '..', 'util', 'emuIni.js'));
const pe = require(path.join(__dirname, '..', 'util', 'pe.js'));

// Every repair() keeps its backups here; the loader search never descends into them.
const BACKUP_DIR_NAME = '.aw-backups';

// Two generations of the same emulator. Ubisoft games call either the R2 API (roughly 2019 onward)
// or the older R1 one, and a game only loads the generation its executable imports. The R1 build was
// checked against R2 instruction by instruction, so both generations share one implementation below.
const FLAVOURS = Object.freeze({
  r2: Object.freeze({
    id: 'r2',
    label: 'Uplay R2',
    dllNames: Object.freeze(['uplay_r2_loader.dll', 'uplay_r2_loader64.dll', 'upc_r2_loader.dll', 'upc_r2_loader64.dll']),
    // Config precedence, NOT alphabetical: the loader opens the "upc" name first and only falls back
    // to the "uplay" one (verified in the binary string table - the two literals appear in that order
    // in the config-open path). A game shipping both therefore runs on the upc file, so that is the
    // one diagnose() must read and the one repair() must get right.
    iniNames: Object.freeze(['upc_r2.ini', 'uplay_r2.ini']),
    section: 'Settings',
    saveRoot: 'Goldberg UplayEmu Saves',
    logFile: 'upc_r2.log',
  }),
  r1: Object.freeze({
    id: 'r1',
    label: 'Uplay R1',
    dllNames: Object.freeze(['uplay_r1_loader.dll', 'uplay_r1_loader64.dll', 'upc_r1_loader.dll', 'upc_r1_loader64.dll']),
    iniNames: Object.freeze(['upc_r1.ini', 'uplay_r1.ini']),
    section: 'Uplay',
    saveRoot: 'R1 UplayEmu Saves',
    logFile: 'upc_r1.log',
  }),
});
const FLAVOUR_LIST = Object.freeze([FLAVOURS.r2, FLAVOURS.r1]);
const DEFAULT_FLAVOUR = FLAVOURS.r2;
const EMU_DLL_NAMES = FLAVOUR_LIST.flatMap((flavour) => [...flavour.dllNames]);
const ALL_INI_NAMES = FLAVOUR_LIST.flatMap((flavour) => [...flavour.iniNames]);
// Kept as the R2 names: a caller naming a single generation means this one.
const INI_NAMES = FLAVOURS.r2.iniNames;
const UPLAY_INSTALL_MARKERS = ['uplay_install.manifest', 'uplay_install.state', 'upc.cfg', ...ALL_INI_NAMES];
// The in-game-folder subfolder used by SaveType=1.
const UPLAY_GAME_SAVE_SUBDIR = 'saves';

// Which generation a file belongs to, by its public basename. Returns null for anything else.
function flavourForDll(file) {
  const name = path.basename(String(file || '')).toLowerCase();
  return FLAVOUR_LIST.find((flavour) => flavour.dllNames.includes(name)) || null;
}

function flavourForIni(file) {
  const name = path.basename(String(file || '')).toLowerCase();
  return FLAVOUR_LIST.find((flavour) => flavour.iniNames.includes(name)) || null;
}

// A flavour from anything a caller may hold: a descriptor, an id, a loader or ini path. Falls back to
// R2, which is what every caller written before R1 existed meant.
function resolveFlavour(value) {
  if (!value) return DEFAULT_FLAVOUR;
  if (typeof value === 'object' && value.id && FLAVOURS[value.id]) return FLAVOURS[value.id];
  const text = String(value).toLowerCase();
  return FLAVOURS[text] || flavourForDll(text) || flavourForIni(text) || DEFAULT_FLAVOUR;
}

// The generation an install runs, taken from the loaders actually present. A folder holding both is
// reported as R2: that is the one a modern game would load.
function flavourForDir(dir) {
  const found = detectEmulator(dir).dll.map((file) => flavourForDll(file)).filter(Boolean);
  return FLAVOUR_LIST.find((flavour) => found.some((entry) => entry.id === flavour.id)) || null;
}
// The unlock-state file the emulator writes inside whichever save dir it resolved, and the schema it
// reads next to the ini. Both names are hardcoded in every known loader build.
const ACH_SAVE_FILE = 'achievements.json';
const ACH_SCHEMA_FILE = 'achievements_schema.json';

// Find the Uplay R2 loader dll(s) shallow under a game root (same bounded walk as
// goldberg.detectEmulator's findDll). Returns { type: 'uplayR2' | 'none', dll: [...] }.
function detectEmulator(gameDir) {
  const result = { type: 'none', dll: [] };
  if (!gameDir || !fs.existsSync(gameDir)) return result;

  const findDll = (dir, depth) => {
    if (depth > 4) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const lower = e.name.toLowerCase();
      if (e.isDirectory()) {
        // Transaction snapshots can contain the original loader at the same relative path. It is
        // history, not another runtime, and must never be diagnosed or configured as if the game
        // loaded it.
        if (lower === BACKUP_DIR_NAME) continue;
        findDll(path.join(dir, e.name), depth + 1);
      } else if (e.isFile() && EMU_DLL_NAMES.includes(lower)) {
        result.dll.push(path.join(dir, e.name));
      }
    }
  };
  findDll(gameDir, 0);

  if (result.dll.length > 0) result.type = 'uplayR2';
  return result;
}

/*
  Is `needle` a string of its OWN in this binary, rather than a fragment of a longer one?

  A plain indexOf was wrong in the one way that matters here: every Uplay loader exports
  UPLAY_USER_GetTicketUtf8 and UPLAY_ACH_GetAchievements, so a substring search for the ini keys
  "Ticket" and "Achievements" answered yes for builds that read neither. That is how an R1 loader -
  whose session key is spelled TickedId and which has no Ticket key at all - was offered the offline
  achievements fix, and then reported as "the ticket had no effect" forever after (South Park TFBW).

  A key literal sits between two bytes that cannot continue an identifier (a NUL terminator, in
  practice), which is exactly what separates it from the same letters inside an export name.
*/
function isIdentifierByte(byte) {
  return (byte >= 0x30 && byte <= 0x39) || (byte >= 0x41 && byte <= 0x5a) || (byte >= 0x61 && byte <= 0x7a) || byte === 0x5f;
}

function hasWholeString(bytes, needle) {
  const pattern = Buffer.from(needle, 'ascii');
  let at = bytes.indexOf(pattern);
  while (at !== -1) {
    const before = at === 0 ? 0 : bytes[at - 1];
    const afterIndex = at + pattern.length;
    const after = afterIndex >= bytes.length ? 0 : bytes[afterIndex];
    if (!isIdentifierByte(before) && !isIdentifierByte(after)) return true;
    at = bytes.indexOf(pattern, at + 1);
  }
  return false;
}

// Which optional [Settings] keys does THIS loader build understand? Redirect keys are recent
// additions that older builds silently ignore, so probe the DLL's literal key names instead.
const _loaderCapabilities = new Map();
function inspectLoader(dllPath) {
  const name = path.basename(String(dllPath || '')).toLowerCase();
  const expectedArch = name.endsWith('64.dll') ? 'x64' : EMU_DLL_NAMES.includes(name) ? 'x86' : null;
  const fallback = {
    path: dllPath || '',
    exists: false,
    arch: null,
    expectedArch,
    supportsAchievements: false,
    supportsAchRedirect: false,
    supportsAchKeyPrefix: false,
    supportsTicket: false,
  };
  if (!dllPath) return fallback;

  let stat;
  try {
    stat = fs.statSync(dllPath);
  } catch {
    return fallback;
  }
  const cacheKey = `${dllPath}|${stat.mtimeMs}|${stat.size}`;
  const cached = _loaderCapabilities.get(cacheKey);
  if (cached) return cached;

  let result;
  try {
    const bytes = fs.readFileSync(dllPath);
    const has = (needle) => hasWholeString(bytes, needle);
    result = {
      path: dllPath,
      exists: true,
      arch: pe.exeArch(dllPath),
      expectedArch,
      supportsAchievements: has('Achievements'),
      supportsAchRedirect: has('AchSavePath') && has('AchSaveType'),
      supportsAchKeyPrefix: has('AchKeyPrefix'),
      supportsTicket: has('Ticket'),
    };
  } catch {
    result = { ...fallback, exists: true };
  }
  _loaderCapabilities.set(cacheKey, result);
  return result;
}

// Capability of the install as a whole. A repack can ship several loader dlls (32- and 64-bit); the
// game loads exactly one of them and we can't know which, so the redirect is only considered usable
// when EVERY present loader supports it.
function inspectInstalledLoaders(dllPaths) {
  const loaders = (dllPaths || []).map((file) => inspectLoader(file));
  const known = loaders.filter((l) => l.exists);
  return {
    loaders,
    supportsAchievements: known.length > 0 && known.every((l) => l.supportsAchievements),
    supportsAchRedirect: known.every((l) => l.supportsAchRedirect),
    supportsAchKeyPrefix: known.every((l) => l.supportsAchKeyPrefix),
    supportsTicket: known.length > 0 && known.every((l) => l.supportsTicket),
    architectureValid: known.length > 0 && known.every((l) => l.arch && l.expectedArch === l.arch),
  };
}

// One readdir: does the top of this folder look like a Uplay install? Not proof - the cheap gate in
// front of hasEmulatorEvidence(), which walks the whole tree; this must never recurse.
function looksLikeUplayInstall(gameDir) {
  if (!gameDir) return false;
  let entries;
  try {
    entries = fs.readdirSync(gameDir);
  } catch {
    return false;
  }
  const present = new Set(entries.map((name) => name.toLowerCase()));
  if (present.has(ACH_SCHEMA_FILE)) return true;
  return [...ALL_INI_NAMES, ...EMU_DLL_NAMES, 'uplay_install.state', 'uplay_install.manifest', 'upc.cfg'].some((name) => present.has(name));
}

// This install's own Ubisoft product id, read from the install rather than any catalogue - the one
// identity a game absent from every shipped table can still supply. Not derived from a save folder's
// name: that folder is created from an id, so reading it back would only repeat what was configured.
// The game states its product id on the loader's very first line, so only the head of the log is
// worth reading. A library scan asks this of every Uplay-looking folder, and these logs run to
// megabytes: reading them whole to get one number off line 1 is the difference between 64 KB and 7 MB
// per game per scan.
const PRODUCT_ID_HEAD_BYTES = 64 * 1024;

function productIdFromLogHead(file) {
  let fd;
  try {
    const stat = fs.statSync(file);
    if (!stat.isFile() || stat.size === 0) return '';
    fd = fs.openSync(file, 'r');
    const length = Math.min(stat.size, PRODUCT_ID_HEAD_BYTES);
    const buffer = Buffer.alloc(length);
    fs.readSync(fd, buffer, 0, length, 0);
    const match = buffer.toString('latin1').match(/UPC_Init[^\r\n]*?\bappid\s*\((\d+)\)|aUplayId\s*\((\d+)\)/);
    return match ? String(Number(match[1] || match[2])) : '';
  } catch {
    return ''; // absent or unreadable: the install simply says nothing here
  } finally {
    if (fd !== undefined) {
      try {
        fs.closeSync(fd);
      } catch {
        /* already gone */
      }
    }
  }
}

function readInstalledProductId(gameDir, { loaderDir = '' } = {}) {
  for (const dir of [loaderDir, gameDir].filter(Boolean)) {
    // Both generations' log names are tried rather than the one the DLLs suggest: a folder can carry
    // a log from a run that predates the loader now installed, and guessing the wrong name reads as
    // "the install says nothing" - which would silently fall back to the weaker ini answer.
    for (const kind of FLAVOUR_LIST) {
      const declared = productIdFromLogHead(path.join(dir, kind.logFile));
      if (/^\d+$/.test(declared)) return declared;
    }
    const iniFile = activeIniFile(dir);
    if (!iniFile) continue;
    const fromIni = String(readIniSettings(iniFile)['gameuplayid'] || '').trim();
    if (/^\d+$/.test(fromIni)) return fromIni;
  }
  return '';
}

// A Ubisoft DLL basename is not proof of emulation: official games ship the same loader names.
// Require a Goldberg-only configuration signal before classifying an install as repairable.
function hasEmulatorEvidence(gameDir, { maxDepth = 4, maxDirectories = 600 } = {}) {
  if (!gameDir || !fs.existsSync(gameDir)) return false;
  const loader = detectEmulator(gameDir);
  for (const file of loader.dll) {
    const caps = inspectLoader(file);
    if (caps.supportsAchievements && (caps.supportsAchRedirect || caps.supportsAchKeyPrefix)) return true;
  }

  const queue = [{ dir: path.resolve(gameDir), depth: 0 }];
  let visited = 0;
  while (queue.length > 0 && visited < maxDirectories) {
    const { dir, depth } = queue.shift();
    visited++;
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    if (entries.some((entry) => entry.isFile() && entry.name.toLowerCase() === ACH_SCHEMA_FILE)) return true;
    for (const iniName of ALL_INI_NAMES) {
      const entry = entries.find((candidate) => candidate.isFile() && candidate.name.toLowerCase() === iniName);
      if (!entry) continue;
      try {
        const file = path.join(dir, entry.name);
        if (fs.statSync(file).size <= 1024 * 1024 && /^\s*(?:Achievements|AchKeyPrefix|AchSaveType|AchSavePath)\s*=/im.test(fs.readFileSync(file, 'utf8'))) {
          return true;
        }
      } catch {
        /* unreadable config is not evidence */
      }
    }
    if (depth >= maxDepth) continue;
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name.toLowerCase() !== BACKUP_DIR_NAME) queue.push({ dir: path.join(dir, entry.name), depth: depth + 1 });
    }
  }
  return false;
}

// When a file was last written, 0 when it cannot be read. Used to order a config write against the
// loader's own log, which is what tells "the fix did nothing" apart from "the fix has not run yet".
function statMtimeMs(file) {
  try {
    return fs.statSync(file).mtimeMs;
  } catch {
    return 0;
  }
}

// The ini the loader will actually read: first existing name in its own precedence order. Without a
// flavour every generation is searched, R2 first.
function activeIniFile(dir, flavour) {
  if (!dir) return '';
  const names = flavour ? resolveFlavour(flavour).iniNames : ALL_INI_NAMES;
  const files = names.map((name) => path.join(dir, name));
  return files.find((file) => fs.existsSync(file)) || '';
}

// The settings section of an ini file as a lower-cased key/value object ({} when absent/unreadable).
// R1 keeps the same keys under [Uplay] rather than [Settings], so the section follows the flavour.
function readIniSettings(file, flavour) {
  if (!file) return {};
  const section = resolveFlavour(flavour || flavourForIni(file)).section;
  try {
    return readIniSectionValues(parseIni(fs.readFileSync(file, 'utf8')), section);
  } catch {
    return {};
  }
}

module.exports = {
  FLAVOURS,
  FLAVOUR_LIST,
  DEFAULT_FLAVOUR,
  EMU_DLL_NAMES,
  ALL_INI_NAMES,
  INI_NAMES,
  UPLAY_INSTALL_MARKERS,
  UPLAY_GAME_SAVE_SUBDIR,
  flavourForDll,
  flavourForIni,
  resolveFlavour,
  flavourForDir,
  ACH_SAVE_FILE,
  ACH_SCHEMA_FILE,
  detectEmulator,
  inspectLoader,
  inspectInstalledLoaders,
  looksLikeUplayInstall,
  readInstalledProductId,
  hasEmulatorEvidence,
  statMtimeMs,
  activeIniFile,
  readIniSettings,
  BACKUP_DIR_NAME,
};
