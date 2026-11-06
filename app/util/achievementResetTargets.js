'use strict';

/*
  What a per-game reset may touch, and how. Pure logic (no fs/Electron) so both "is this
  resettable" and "what does this file need" can be tested without a game install.

  Confusing the three file kinds is how a reset destroys a library: most emulator saves (and
  RPCS3's TROPUSR.DAT) are state-only, so deleting them IS the reset. ShadPS4's TROP*.XML and
  Xenia's .gpd carry state AND schema, so those are edited in place instead. Schema-only files
  (TROPCONF.SFM, achievements.json, etc.) are never a target: they hold no unlock state.
*/

const ACTION = {
  DELETE: 'delete',
  CLEAR_SHADPS4_XML: 'clear-shadps4-xml',
  CLEAR_XENIA_GPD: 'clear-xenia-gpd',
  CLEAR_X360_JSON: 'clear-x360-json',
  // Saves that also hold settings or every user's other games: their unlock fields are zeroed in place.
  CLEAR_RUNE_CFG: 'clear-rune-cfg',
  CLEAR_UNLOCK_FLAG: 'clear-unlock-flag',
  CLEAR_ACL: 'clear-acl',
  CLEAR_CONSOLE_BASELINE: 'clear-console-baseline',
};

const path = require('path');
const { SAVE_ROOTS, SAVE_FILE_NAMES, RAZOR1911_FILE } = require(path.join(__dirname, '..', 'parser', 'emuSaveRoots.js'));
const { SOURCE_LABEL } = require(path.join(__dirname, 'sourceIdentity.js'));

const PS3_RECOMP_UNLOCKS = /^npwr\d{5}\.json$/;

/*
  Emulator save files: the names the Watchdog watches, from the same table. SocialClub's are left
  out (its folders mix in Rockstar's own files) and RAZOR1911's has a rule of its own below. Stats
  count too: a maxed counter would re-fire or block a progressive unlock. Matched case-insensitively.
*/
const SAVE_FILES = new Set(
  [
    ...SAVE_FILE_NAMES,
    ...SAVE_ROOTS.filter((row) => row.watch && !row.watch.socialClub).flatMap((row) => row.watch.file),
    // RPCS3 keeps unlock state apart from the schema, so this one is safe to remove outright.
    'tropusr.dat',
  ]
    .map((name) => name.toLowerCase())
    .filter((name) => name !== RAZOR1911_FILE)
);

// Schema files that live in the same folders and must survive every reset.
const PROTECTED_FILES = new Set(['tropconf.sfm', 'trophy.trp', 'appid.txt', 'steam_appid.txt']);

// Steam/GOG Galaxy/Ubisoft Connect/EA/Epic/Xbox/RetroAchievements/PlayStation Network unlocks live on the platform
// account, not a local file: a reset here would just get overwritten by the next sync. Saying so
// beats offering a button that looks like it works but does not.
const OFFICIAL_PLATFORM_SOURCES = /^(?:steam\s*\(|gog galaxy|epic-official$|ea$|ubisoft connect|xbox(?! 360 recomp$)|retroachievements$|playstation network$)/i;

function isOfficialPlatformSource(source) {
  return OFFICIAL_PLATFORM_SOURCES.test(String(source || '').trim());
}

// The app's own manual-unlock overrides are not a save file; they are cleared separately.
function isManualSource(source) {
  return String(source || '').trim().toLowerCase() === 'manual';
}

// Returns the action needed to reset this file, or null if it's not part of the reset.
// `fileName` is a base name; the caller has already matched the folder to this game.
function resetActionFor(fileName, source = '') {
  const name = String(fileName || '').trim().toLowerCase();
  if (!name || PROTECTED_FILES.has(name)) return null;
  const label = String(source || '').trim().toLowerCase();
  if (label === SOURCE_LABEL.X360_RECOMP) {
    // ReXGlue's .toml and the per-profile .tsv hold unlocks only, and a missing one reads as none.
    // The JSON shape also carries the list itself, so only its flags are cleared.
    if (/^[0-9a-f]{8}\.toml$/.test(name) || name.endsWith('.tsv')) return ACTION.DELETE;
    // Lost Odyssey's earned list and the Unleashed/Marathon unlock records hold nothing else either.
    if (name === 'achievements.ini' || name === 'ach-data' || name === 'sonicnextachievementdata.bin') return ACTION.DELETE;
    if (name === 'achievements.json') return ACTION.CLEAR_X360_JSON;
    return null;
  }
  // A PS4 port's user folder also holds the game's own saves; its unlock logs are not reset from here.
  if (label === SOURCE_LABEL.PS4_RECOMP) return null;
  // A PS3 port's gamedata/trophies holds its unlock files only, and a missing one reads as none.
  if (label === SOURCE_LABEL.PS3_RECOMP) return PS3_RECOMP_UNLOCKS.test(name) ? ACTION.DELETE : null;
  if (SAVE_FILES.has(name)) return ACTION.DELETE;
  // RAZOR1911's `achievement` only in its own root: the name alone is too common to delete elsewhere.
  if (name === RAZOR1911_FILE) return label === 'razor1911' ? ACTION.DELETE : null;
  // KytyPS5 keeps one unlock list per user and trophy set, apart from the list in the game's package.
  if (/^trophies_\d+_\d+\.json$/.test(name)) return ACTION.DELETE;
  // ShadPS4 ships one file per language (TROP.XML, TROP_01.XML, …); all of them carry the state.
  if (/^trop(_\d+)?\.xml$/.test(name)) return ACTION.CLEAR_SHADPS4_XML;
  // Since 0.19 the state is a per-user copy of TROPCONF.XML named after the trophy set.
  if (/^npwr\d{5}_\d{2}\.xml$/.test(name)) return ACTION.CLEAR_SHADPS4_XML;
  if (name.endsWith('.gpd')) return ACTION.CLEAR_XENIA_GPD;
  return null;
}

// Splits resolved achievement folders (util/achievementDataPath.js) into resettable vs blocked,
// using where unlocks are actually read from rather than guessing from the source label.
function classifySources(dataPaths = []) {
  const resettable = [];
  const blocked = [];
  for (const entry of Array.isArray(dataPaths) ? dataPaths : []) {
    if (!entry || !entry.path) continue;
    const source = String(entry.source || '');
    if (isOfficialPlatformSource(source)) {
      blocked.push({ source, path: entry.path, reason: 'official-platform' });
      continue;
    }
    if (isManualSource(source)) continue; // handled by clearing the overrides, not by touching files
    resettable.push({ source, path: entry.path });
  }
  return { resettable, blocked };
}

module.exports = {
  ACTION,
  SAVE_FILES,
  PROTECTED_FILES,
  OFFICIAL_PLATFORM_SOURCES,
  isOfficialPlatformSource,
  isManualSource,
  resetActionFor,
  classifySources,
};
