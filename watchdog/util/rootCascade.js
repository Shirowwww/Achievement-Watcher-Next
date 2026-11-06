'use strict';

const { sharedAppModulePath } = require('./sharedAppModule.js');
/*
 * The watches monitor.js adds for a configured folder no emulator config describes: a GOG .info game
 * or a UniverseLAN one. The signatures checked before each are the ones that claim the folder for
 * another reader (a console emulator, an official client, numeric appid folders), in which case the
 * folder keeps monitor.js's generic watch. Discovery only - it never writes anything.
 */

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const ini = require(sharedAppModulePath('util/ini.js'));
const { SAVE_FILE_NAMES } = require(sharedAppModulePath('parser/emuSaveRoots.js'));

const MAX_DEPTH = 6;

const STRICT_ROOT_PROFILES = [
  { key: 'steam-codex', suffix: ['steam', 'codex'] },
  { key: 'steam-rld', suffix: ['steam', 'rld!'] },
  { key: 'empress', suffix: ['empress'] },
  { key: 'goldberg-steam', suffix: ['goldberg steamemu saves'] },
  { key: 'gse', suffix: ['gse saves'] },
  { key: 'goldberg-uplay', suffix: ['goldberg uplayemu saves'] },
  { key: 'anadius-lsx', suffix: ['anadius', 'lsx emu', 'achievement_watcher'] },
];

function getInvalidAutoAppIdReason(name) {
  const value = String(name || '').trim();
  if (!value) return 'empty';
  if (!/^[0-9a-fA-F]+$/.test(value)) return '';
  if (value.length === 1) return 'single-character-id';
  if (/^0+$/.test(value)) return 'zero-only-id';
  if (/^0{4,}/.test(value)) return 'leading-zero-padding';
  return '';
}

function isAppIdName(name) {
  const value = String(name || '').trim();
  return /^[0-9a-fA-F]+$/.test(value) && !getInvalidAutoAppIdReason(value);
}

function shouldIgnoreDiscoveredId(id) {
  const value = String(id || '').trim();
  if (!value) return true;
  // SteamID64 (user id), not a game appid
  if (/^7656\d{13}$/.test(value)) return true;
  // Numeric IDs longer than 11 digits are unlikely to be game appids
  if (/^\d{12,}$/.test(value)) return true;
  // Short hex with letters (e.g. 0F74F) is likely noise
  if (value.length < 6 && /[a-f]/i.test(value)) return true;
  return false;
}

function splitPathLower(inputPath) {
  return String(inputPath || '')
    .replace(/[\\/]+/g, path.sep)
    .toLowerCase()
    .split(path.sep)
    .filter(Boolean);
}

function matchesPathSuffix(pathParts, suffixParts) {
  if (!Array.isArray(pathParts) || !Array.isArray(suffixParts)) return false;
  if (!suffixParts.length || pathParts.length < suffixParts.length) return false;
  const offset = pathParts.length - suffixParts.length;
  for (let i = 0; i < suffixParts.length; i += 1) {
    if (pathParts[offset + i] !== suffixParts[i]) return false;
  }
  return true;
}

function getStrictRootProfile(rootPath) {
  const parts = splitPathLower(rootPath);
  for (const profile of STRICT_ROOT_PROFILES) {
    if (matchesPathSuffix(parts, profile.suffix)) return profile;
  }
  return null;
}

function normalizeRoot(inputRoot) {
  let root = inputRoot;
  try {
    root = fs.realpathSync(inputRoot);
  } catch {
    /* keep original */
  }
  if (isAppIdName(path.basename(root))) root = path.dirname(root);
  return root;
}

async function walkTree(root, visitor, { maxDepth = MAX_DEPTH } = {}) {
  const stack = [{ dir: root, depth: 0 }];
  while (stack.length) {
    const current = stack.pop();
    let entries;
    try {
      entries = await fsp.readdir(current.dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const ent of entries) {
      const full = path.join(current.dir, ent.name);
      const isDir = ent.isDirectory();
      const keep = await visitor(full, ent, current.depth, isDir);
      if (keep === false) continue;
      if (isDir && current.depth < maxDepth) stack.push({ dir: full, depth: current.depth + 1 });
    }
  }
}

async function discoverAppIdsUnder(root) {
  const out = new Map();
  await walkTree(root, (full, ent, depth, isDir) => {
    if (!isDir) return false;
    if (!isAppIdName(ent.name) || shouldIgnoreDiscoveredId(ent.name)) return depth < MAX_DEPTH;
    out.set(ent.name, full);
    // An AppID folder can contain further AppID folders (nested emulator saves).
    return true;
  });
  return out;
}

async function hasGpdFile(root) {
  let found = false;
  await walkTree(root, (full) => {
    if (String(full).toLowerCase().endsWith('.gpd')) found = true;
    return true;
  });
  return found;
}

async function discoverRpcs3TrophyDirsUnder(root, options = {}) {
  const found = [];
  await walkTree(
    root,
    async (full, ent, depth, isDir) => {
      // The walk already knows what each entry is; only a link needs a stat to learn its target.
      if (!isDir) {
        if (!ent.isSymbolicLink()) return true;
        try {
          if (!fs.statSync(full).isDirectory()) return true;
        } catch {
          return true;
        }
      }
      if (fs.existsSync(path.join(full, 'TROPCONF.SFM')) && fs.existsSync(path.join(full, 'TROPUSR.DAT'))) {
        found.push(full);
        return false;
      }
      return true;
    },
    options
  );
  return found;
}

async function hasPs4TrophyDir(root) {
  let found = false;
  await walkTree(root, (full, ent, depth, isDir) => {
    if (!isDir) return true;
    if (
      String(ent.name).toLowerCase() === 'trophy00' &&
      path.basename(path.dirname(full)).toLowerCase() === 'trophyfiles' &&
      fs.existsSync(path.join(full, 'Xml', 'TROP.XML'))
    ) {
      found = true;
      return false;
    }
    return true;
  });
  return found;
}

async function hasModernPs4TrophySet(root) {
  const trophyRoot = path.join(root, 'trophy');
  let entries;
  try {
    entries = await fsp.readdir(trophyRoot, { withFileTypes: true });
  } catch {
    return false;
  }
  return entries.some(
    (ent) => ent.isDirectory() && /^NP[A-Z0-9_]+$/i.test(ent.name) && fs.existsSync(path.join(trophyRoot, ent.name, 'Xml', 'TROP.XML'))
  );
}

const GOG_INFO_FILE = /^goggame-(\d+)\.info$/i;
const HEX_ID = /^[0-9a-fA-F]+$/;

// The game a goggame-<id>.info file describes: { gameId, rootGameId, file }, or null.
async function readGogInfo(file) {
  try {
    const parsed = JSON.parse(await fsp.readFile(file, 'utf8'));
    const fromJson = parsed.gameId ?? parsed.gameID ?? parsed.game_id ?? parsed.GameId ?? parsed.GameID;
    const rootFromJson = parsed.rootGameId ?? parsed.rootgameid ?? parsed.root_game_id ?? parsed.RootGameId ?? parsed.RootGameID ?? parsed.Rootgameid;
    const gameId = HEX_ID.test(String(fromJson || '')) ? String(fromJson) : path.basename(file).match(GOG_INFO_FILE)[1];
    const rootGameId = HEX_ID.test(String(rootFromJson || '')) ? String(rootFromJson) : '';
    return { gameId, rootGameId: rootGameId || gameId, file };
  } catch {
    return null; // an unparsable .info names no game
  }
}

async function findGogInfoAppId(root) {
  const found = [];
  await walkTree(root, (full, ent) => {
    if (ent.isFile() && GOG_INFO_FILE.test(ent.name)) found.push(full);
    return true;
  });
  const entries = (await Promise.all(found.map(readGogInfo))).filter(Boolean);
  if (!entries.length) return null;
  const base = entries.find((entry) => entry.rootGameId === entry.gameId) || entries[0];
  return { appid: base.rootGameId, baseDir: path.dirname(base.file) };
}

async function findNamedFiles(root, lowerName) {
  const found = [];
  await walkTree(root, (full, ent) => {
    if (ent.isFile() && ent.name.toLowerCase() === lowerName) found.push(full);
    return true;
  });
  return found;
}

function universeLanAppId(text) {
  try {
    const parsed = ini.parse(text);
    const value = String((parsed && parsed.GameSettings && parsed.GameSettings.AppID) || '').trim();
    return /^\d+$/.test(value) ? value : '';
  } catch {
    return '';
  }
}

async function findUniverseLanAppId(root) {
  for (const file of await findNamedFiles(root, 'universelan.ini')) {
    try {
      const buf = await fsp.readFile(file);
      const appid = universeLanAppId(buf.toString('utf8')) || universeLanAppId(buf.toString('utf16le'));
      if (appid) return { appid, baseDir: path.dirname(file) };
    } catch {
      /* unreadable: try the next one */
    }
  }
  return null;
}

async function hasTenokeConfig(root) {
  for (const file of await findNamedFiles(root, 'tenoke.ini')) {
    try {
      if (/^\s*id\s*=\s*\d+/im.test(await fsp.readFile(file, 'utf8'))) return true;
    } catch {
      /* unreadable: try the next one */
    }
  }
  return false;
}

async function hasNemirtingasEpicAppIds(root) {
  const normalized = String(root).replace(/[\\/]+/g, path.sep);
  const idx = normalized.toLowerCase().split(path.sep).lastIndexOf('nemirtingasepicemu');
  if (idx === -1) return false;
  const rawParts = normalized.split(path.sep);
  const base = rawParts.slice(0, idx + 1).join(path.sep);
  const sub = rawParts.slice(idx + 1);
  const listDirs = async (dir) => {
    try {
      return (await fsp.readdir(dir, { withFileTypes: true })).filter((ent) => ent.isDirectory()).map((ent) => ent.name);
    } catch {
      return [];
    }
  };
  const userDirs = sub.length ? [sub[0]] : await listDirs(base);
  for (const user of userDirs) {
    if ((await listDirs(path.join(base, user))).some((name) => isAppIdName(name) && !shouldIgnoreDiscoveredId(name))) return true;
  }
  return false;
}

function hasSchemaBins(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true }).some((ent) => ent.isFile() && /^UserGameStatsSchema_\d+\.bin$/i.test(ent.name));
  } catch {
    return false;
  }
}

function steamStatsRootOf(scanBase) {
  if (matchesPathSuffix(splitPathLower(scanBase), ['steam', 'appcache', 'stats'])) return scanBase;
  const nested = path.join(scanBase, 'appcache', 'stats');
  return splitPathLower(scanBase).includes('steam') && fs.existsSync(nested) ? nested : scanBase;
}

function hasEaVerboseLogs(root) {
  return fs.existsSync(path.join(root, 'EADesktopVerbose.log')) || fs.existsSync(path.join(root, 'EADesktopVerbose.bak'));
}

function listDirents(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

function hasUbisoftSpoolFiles(root) {
  return listDirents(root).some(
    (ent) => ent.isDirectory() && listDirents(path.join(root, ent.name)).some((file) => file.isFile() && /^\d+\.spool$/i.test(file.name))
  );
}

function hasGogGameplayDbs(root) {
  return listDirents(root).some((ent) => {
    if (!ent.isDirectory()) return false;
    const gameplay = path.join(root, ent.name, 'Gameplay');
    return listDirents(gameplay).some((user) => user.isDirectory() && fs.existsSync(path.join(gameplay, user.name, 'gameplay.db')));
  });
}

// Signatures checked before GOG .info, in order: each claims the folder for its own reader.
async function claimedBeforeGog(scanBase) {
  return (
    (await hasGpdFile(scanBase)) ||
    (await discoverRpcs3TrophyDirsUnder(scanBase)).length > 0 ||
    (await hasModernPs4TrophySet(scanBase)) ||
    (await hasPs4TrophyDir(scanBase)) ||
    hasSchemaBins(steamStatsRootOf(scanBase)) ||
    hasEaVerboseLogs(scanBase) ||
    hasUbisoftSpoolFiles(scanBase) ||
    hasGogGameplayDbs(scanBase)
  );
}

// Then, before UniverseLAN: Nemirtingas, numeric appid folders and TENOKE.
async function claimedBeforeUniverseLan(scanBase) {
  return (await hasNemirtingasEpicAppIds(scanBase)) || (await discoverAppIdsUnder(scanBase)).size > 0 || (await hasTenokeConfig(scanBase));
}

// Monitor-style watch entries ({ dir, options }) for a GOG .info or UniverseLAN folder, else [].
async function signatureWatchEntries(rootPath) {
  if (!rootPath || !fs.existsSync(rootPath)) return [];
  const scanBase = normalizeRoot(rootPath);
  if (getStrictRootProfile(scanBase) || (await claimedBeforeGog(scanBase))) return [];

  const gogInfo = await findGogInfoAppId(scanBase);
  if (gogInfo) return [{ dir: gogInfo.baseDir, options: { appid: gogInfo.appid, recursive: false, file: [...SAVE_FILE_NAMES] } }];
  if (await claimedBeforeUniverseLan(scanBase)) return [];

  const universeLan = await findUniverseLanAppId(scanBase);
  if (!universeLan) return [];
  return [{ dir: path.join(universeLan.baseDir, 'UniverseLANData'), options: { appid: universeLan.appid, recursive: false, file: ['Achievements.ini'] } }];
}

module.exports = {
  discoverRpcs3TrophyDirsUnder,
  getStrictRootProfile,
  isAppIdName,
  signatureWatchEntries,
  shouldIgnoreDiscoveredId,
};
