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
};

/*
  Emulator save files; mirrors the list watchdog/monitor.js watches (files.achievement plus the
  console/cascade entries) - keep both in sync. Matched case-insensitively since builds vary.
  Stats files are included on purpose: for progressive achievements the counter IS the progress,
  so leaving it maxed would re-fire or block the unlock. Everything here is backed up first.
*/
const SAVE_FILES = new Set(
  [
    'achievements.ini',
    'achievements.json',
    'achiev.ini',
    'stats.ini',
    'achievements.bin',
    'achieve.dat',
    'stats.bin',
    'user_stats.ini',
    'stats.json',
    // RPCS3 keeps unlock state apart from the schema, so this one is safe to remove outright.
    'tropusr.dat',
  ].map((name) => name.toLowerCase())
);

// Schema files that live in the same folders and must survive every reset.
const PROTECTED_FILES = new Set(['tropconf.sfm', 'trophy.trp', 'appid.txt', 'steam_appid.txt']);

// Steam/GOG Galaxy/Ubisoft Connect/EA/Epic/Xbox unlocks live on the platform account, not a
// local file: a reset here would just get overwritten by the next sync. Saying so beats
// offering a button that looks like it works but does not.
const OFFICIAL_PLATFORM_SOURCES = /^(?:steam\s*\(|gog(?:\s|$)|gog galaxy|epic(?:-official)?$|ea$|ubisoft connect|xbox)/i;

function isOfficialPlatformSource(source) {
  return OFFICIAL_PLATFORM_SOURCES.test(String(source || '').trim());
}

// The app's own manual-unlock overrides are not a save file; they are cleared separately.
function isManualSource(source) {
  return String(source || '').trim().toLowerCase() === 'manual';
}

// Returns the action needed to reset this file, or null if it's not part of the reset.
// `fileName` is a base name; the caller has already matched the folder to this game.
function resetActionFor(fileName) {
  const name = String(fileName || '').trim().toLowerCase();
  if (!name || PROTECTED_FILES.has(name)) return null;
  if (SAVE_FILES.has(name)) return ACTION.DELETE;
  // ShadPS4 ships one file per language (TROP.XML, TROP_01.XML, …); all of them carry the state.
  if (/^trop(_\d+)?\.xml$/.test(name)) return ACTION.CLEAR_SHADPS4_XML;
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
