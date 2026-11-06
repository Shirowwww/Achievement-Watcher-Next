'use strict';

// How Goldberg SocialClub saves are named, shared by the app parser (socialclub.js) and the Watchdog
// (monitor.js, util/socialClub.js). Pure: parser/socialclub.js pulls in steam.js, which the Watchdog must not.

const path = require('path');

const ROOT_NAME_RE = /^goldberg\s*social\s*club\s*emu\s*saves$/i;
// Profile folders are emulator-generated hex ids (e.g. 0F74F4C4). Cap the length and exclude
// long all-digit ids (SteamID64 / appid-like folders) so the SocialClub check never claims an
// unrelated numeric save root.
const HEX_PROFILE_RE = /^[0-9a-fA-F]{6,12}$/;
const LONG_NUMERIC_RE = /^\d{12,}$/;

// Achievement file names shared with the Steam emulator pipeline (steam.getAchievementsFromFile).
const ACHIEVEMENT_FILE_GLOB = [
  'achievements.ini',
  'achievements.json',
  'achiev.ini',
  'stats.ini',
  'Achievements.Bin',
  'achieve.dat',
  'achievement.dat',
  'achievements.dat',
  'accomplishments.json',
  'accomplishments.dat',
  'awards.json',
  'awards.dat',
  'Achievements.ini',
  'stats.bin',
  'user_stats.ini',
  'stats.json',
  'stats/achievements.ini',
  'SteamEmu/UserStats/achiev.ini',
];

// The Watchdog matches a changed file by its name alone. Rockstar's own save blobs (SGTA*, SRDR*,
// cfg.dat) are deliberately not here: nothing decodes them yet, so waking on each autosave is churn.
const SOCIALCLUB_ACHIEVEMENT_FILES = [...new Set(ACHIEVEMENT_FILE_GLOB.map((entry) => path.posix.basename(entry)))];

function isSocialClubRootName(name) {
  return ROOT_NAME_RE.test(String(name || ''));
}

function isProfileFolderName(name) {
  const base = String(name || '');
  return HEX_PROFILE_RE.test(base) && !LONG_NUMERIC_RE.test(base);
}

// A folder belongs to SocialClub when the root is on its path, not by its shape: a numeric Steam
// AppID like "1546990" is also valid hex and would pick the wrong parser.
function isUnderSocialClubRoot(dirPath) {
  return String(dirPath || '')
    .split(/[\\/]+/)
    .some((segment) => ROOT_NAME_RE.test(segment));
}

function normalizeNameKey(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[™®©]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// The folder name is the only stable link from a changed save path back to a library entry: the
// entry's `name` is the resolved Steam title ("Grand Theft Auto V"), not the folder ("GTA V").
function socialClubAppId(gameName) {
  const slug = normalizeNameKey(gameName).replace(/\s+/g, '-');
  return `socialclub-${slug || 'unknown'}`;
}

// Which folder under the watched directory names the game. The user can add the SocialClub root OR
// a single game folder, so the answer is not simply "first segment below the watched dir":
//   - the emulator root is on the path        -> the game is the segment right after it,
//   - the watched dir is itself a game folder -> the game is that folder's own name.
function gameFolderName(rootDir, changedDir) {
  const segments = String(changedDir || '')
    .split(/[\\/]+/)
    .filter(Boolean);
  const rootIndex = segments.findIndex((segment) => ROOT_NAME_RE.test(segment));
  if (rootIndex >= 0) return segments[rootIndex + 1] || '';

  const root = String(rootDir || '');
  const rel = path.relative(root, String(changedDir || ''));
  if (rel.startsWith('..') || path.isAbsolute(rel)) return '';
  const parts = rel.split(path.sep).filter(Boolean);
  // No segment left, or straight into a profile folder: the watched directory IS the game.
  if (!parts.length || isProfileFolderName(parts[0])) return path.basename(root);
  return parts[0];
}

module.exports = {
  ROOT_NAME_RE,
  HEX_PROFILE_RE,
  ACHIEVEMENT_FILE_GLOB,
  SOCIALCLUB_ACHIEVEMENT_FILES,
  isSocialClubRootName,
  isProfileFolderName,
  isUnderSocialClubRoot,
  normalizeNameKey,
  socialClubAppId,
  gameFolderName,
};
