'use strict';

/*
  Where save-file emulators keep their saves: one row per folder, read by the library
  (saveRoots.addHostRoots) and by the Watchdog (monitor.js builtinRoots), so a new emulator is one
  row. The Watchdog loads this at startup: data and path joins only.
*/

const path = require('path');
const { hostPath } = require('../util/winHosts.js');
const { SOCIALCLUB_ACHIEVEMENT_FILES } = require('./socialclubNames.js');

// The folder of one numeric appid, anywhere below the root.
const APPID_FOLDER = /([0-9]+)/;
// EMPRESS keeps both <appid>\remote\<appid> and the flat remote\<appid>.
const EMPRESS_REMOTE = /remote[\\/]([0-9]+)/;

// What a save-file emulator writes in a folder of its own, whichever it is: the Watchdog's watch on a
// configured folder no emulator config describes, and the files a reset deletes.
const SAVE_FILE_NAMES = ['achievements.ini', 'achievements.json', 'achiev.ini', 'stats.ini', 'Achievements.Bin', 'achieve.dat', 'Achievements.ini', 'stats.bin', 'user_stats.ini', 'stats.json'];
// RAZOR1911's save: a name too common to mean a save outside its own root.
const RAZOR1911_FILE = 'achievement';

const CODEX_FILES = ['achievements.ini', 'stats.ini'];
const RLD_FILES = ['achiev.ini', 'Achievements.Bin', 'Achievements.ini'];
// achievements.ini is kept for custom Goldberg builds that still write it.
const GSE_FILES = ['achievements.json', 'stats.json', 'achievements.ini'];

// stats.ini changes alone when only a counter moves; statsSibling reads achievements.ini for it.
const CODEX_WATCH = { filter: APPID_FOLDER, file: CODEX_FILES, statsSibling: true };
const RLD_WATCH = { filter: APPID_FOLDER, file: RLD_FILES };
const GSE_WATCH = { filter: APPID_FOLDER, file: GSE_FILES };
const EMPRESS_WATCH = { filter: EMPRESS_REMOTE, file: ['achievements.json'] };
const SKIDROW_WATCH = { filter: APPID_FOLDER, file: ['achieve.dat'] };

/*
  env: the host folder variable, or DOCUMENTS for the host's Documents folder. watch: the Watchdog's
  options (always recursive), null when the library alone reads the folder. library: false for a
  folder whose library side is a source of its own. expandForLibrary: the library takes each child.
*/
const SAVE_ROOTS = [
  { env: 'PUBLIC', dir: ['Documents', 'OnlineFix'], watch: { filter: APPID_FOLDER, file: ['achievements.ini'] } },
  { env: 'PUBLIC', dir: ['Documents', 'Steam', 'RUNE'], watch: CODEX_WATCH },
  { env: 'PUBLIC', dir: ['Documents', 'Steam', 'CODEX'], watch: CODEX_WATCH },
  // CPY releases run CODEX's emulator and keep its tree under their own name.
  { env: 'PUBLIC', dir: ['Documents', 'Steam', 'CPY'], watch: CODEX_WATCH },
  { env: 'PUBLIC', dir: ['Documents', 'Steam', 'RLD!'], watch: RLD_WATCH },
  { env: 'PUBLIC', dir: ['Documents', 'EMPRESS'], watch: EMPRESS_WATCH },
  { env: 'APPDATA', dir: ['Goldberg SteamEmu Saves'], watch: GSE_WATCH },
  // Goldberg Uplay R1 and R2: folders are Ubisoft product ids, which watchdog.js maps through the
  // game index's uplayId before loading and re-keying api-names.
  { env: 'APPDATA', dir: ['Goldberg UplayEmu Saves'], watch: { filter: APPID_FOLDER, file: ['achievements.json'], uplayR2: true } },
  { env: 'APPDATA', dir: ['R1 UplayEmu Saves'], watch: { filter: APPID_FOLDER, file: ['achievements.json'], uplayR2: true } },
  // <GameName>\<hex profile>\...: the filter accepts game-name folders, and `file` leaves out
  // Rockstar's own unreadable blobs. watchdog.js resolves the name through the game index.
  { env: 'APPDATA', dir: ['Goldberg SocialClub Emu Saves'], watch: { filter: () => true, file: SOCIALCLUB_ACHIEVEMENT_FILES, socialClub: true } },
  { env: 'APPDATA', dir: ['GSE Saves'], watch: GSE_WATCH },
  { env: 'APPDATA', dir: ['EMPRESS'], watch: EMPRESS_WATCH },
  // The flat remote\<appid> shape for the library; the Watchdog's EMPRESS row above covers it.
  { env: 'APPDATA', dir: ['EMPRESS', 'remote'], watch: null },
  // RAZOR1911 (post-2023 releases): plain-text `achievement` file per appid.
  { env: 'APPDATA', dir: ['.1911'], watch: { filter: APPID_FOLDER, file: [RAZOR1911_FILE] } },
  { env: 'APPDATA', dir: ['Steam', 'CODEX'], watch: CODEX_WATCH },
  { env: 'APPDATA', dir: ['Steam', 'RUNE'], watch: CODEX_WATCH },
  { env: 'APPDATA', dir: ['Steam', 'RLD!'], watch: RLD_WATCH },
  { env: 'APPDATA', dir: ['SmartSteamEmu'], watch: { filter: APPID_FOLDER, file: ['stats.bin'] } },
  // CreamAPI writes <appid>\stats\CreamAPI.Achievements.cfg; achievements.ini is kept for older builds.
  { env: 'APPDATA', dir: ['CreamAPI'], watch: { filter: APPID_FOLDER, file: ['achievements.ini', 'CreamAPI.Achievements.cfg'] } },
  { env: 'LOCALAPPDATA', dir: ['SKIDROW'], watch: SKIDROW_WATCH },
  { env: 'LOCALAPPDATA', dir: ['anadius', 'LSX emu', 'achievement_watcher'], watch: { filter: APPID_FOLDER, file: ['achievements.ini'] } },
  // Both spellings: one folder on NTFS (kept once), two on a case-sensitive Linux filesystem.
  { env: 'DOCUMENTS', dir: ['SkidRow'], watch: SKIDROW_WATCH },
  { env: 'DOCUMENTS', dir: ['SKIDROW'], watch: SKIDROW_WATCH },
  // DARKSiDERS writes here when the release is not portable; the Watchdog finds it through the
  // game folder's emulator ini instead (monitor.getFolders).
  { env: 'DOCUMENTS', dir: ['DARKSiDERS'], watch: null },
  {
    env: 'PROGRAMDATA',
    dir: ['Steam'],
    expandForLibrary: true,
    watch: { disableCheckIfProcessIsRunning: true, disableCheckTimestamp: true, filter: /([0-9]+)[\\/]stats/, file: ['achievements.ini'] },
  },
  // GOG UniverseLAN, one folder per GOG product id; the library reads it through gog.js.
  { env: 'LOCALAPPDATA', dir: ['UniverseLAN'], library: false, watch: { filter: APPID_FOLDER, file: ['Achievements.ini'] } },
  // Nemirtingas, read by epic.js and gog.js. No path filter on Epic: its ids can be non-numeric.
  { env: 'APPDATA', dir: ['NemirtingasEpicEmu'], library: false, watch: { file: ['achievements.json'] } },
  { env: 'APPDATA', dir: ['NemirtingasGalaxyEmu'], library: false, watch: { filter: APPID_FOLDER, file: ['achievements.json'] } },
];

// A row's folder on one host, or null when the host has no such base folder.
function rowDir(row, host, documents) {
  if (row.env === 'DOCUMENTS') return documents ? path.join(documents, ...row.dir) : null;
  return hostPath(host, row.env, ...row.dir);
}

// Fresh options for one watcher: callers may set fields on them.
function watchOptions(watch) {
  return { recursive: true, ...watch, file: [...watch.file] };
}

module.exports = { SAVE_ROOTS, SAVE_FILE_NAMES, RAZOR1911_FILE, GSE_WATCH, rowDir, watchOptions };
