'use strict';

// Validate and repair Goldberg Uplay R2 setups.
// Unlocks are redirected to GSE Saves/<Steam AppID> and keyed by Steam api-names.

const fs = require('fs');
const path = require('path');
const { parseIni, stringifyIni, getIniSection, readIniSectionValues, upsertIniSection, upsertIniKeys, sanitizeIniValue } = require(path.join(__dirname, '..', 'util', 'emuIni.js'));
const pe = require(path.join(__dirname, '..', 'util', 'pe.js'));
const { userDataDir } = require(path.join(__dirname, '..', 'util', 'userDataPath.js'));
const fuzzyAppid = require(path.join(__dirname, '..', 'util', 'fuzzyAppid.js'));
const goldberg = require(path.join(__dirname, 'goldberg.js'));
const uplaySteamTable = require(path.join(__dirname, 'uplaySteamTable.js'));

/*
  Two generations of the same emulator. Ubisoft games call either the R2 API (roughly 2019 onward) or
  the older R1 one, and a game only ever loads the generation its executable imports - which is why a
  2014-2018 title can never be served by an R2 loader.

  The R1 build was checked against the R2 one instruction by instruction: it resolves its config from
  its own directory in the same order, reads the same achievement keys, and builds its lookup key with
  the same MSVC integer-to-string helper followed by the same prefix insert. Everything below is the
  complete list of what actually differs, so both generations share one implementation.
*/
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
const MAPPING_OVERRIDES_FILE = 'uplay-r2-mappings.json';
const OBJECTIVE_MAP_FILE = 'uplay-objectives.json';
const PRODUCT_MAPPINGS_FILE = 'uplay-product-mappings.json';
const UPLAY_LANGUAGE_CODES = Object.freeze({
  arabic: 'ar-SA',
  schinese: 'zh-CN',
  tchinese: 'zh-TW',
  danish: 'da-DK',
  dutch: 'nl-NL',
  english: 'en-US',
  finnish: 'fi-FI',
  french: 'fr-FR',
  german: 'de-DE',
  greek: 'el-GR',
  italian: 'it-IT',
  japanese: 'ja-JP',
  koreana: 'ko-KR',
  norwegian: 'no-NO',
  polish: 'pl-PL',
  portuguese: 'pt-PT',
  brazilian: 'pt-BR',
  romanian: 'ro-RO',
  russian: 'ru-RU',
  spanish: 'es-ES',
  latam: 'es-MX',
  swedish: 'sv-SE',
  thai: 'th-TH',
});
const UPLAY_LANGUAGE_VALUES = new Map(Object.values(UPLAY_LANGUAGE_CODES).map((value) => [value.toLowerCase(), value]));

// Each loader's shipped default (captured from a real release) - used as the starting document when a
// game has no ini yet, so repair() produces a fully faithful file (comments included), the same
// spirit as GBE Fork's steam_settings.EXAMPLE in goldberg.js.
const DEFAULT_INI_TEMPLATE_R1 = `[Uplay]
IsAppOwned = 1
UplayConnection = 0
UserId = c91c91c9-1c91-c91c-91c9-1c91c91c91c9
CdKey = 1111-2222-3333-4444
TickedId = noT456umPqRt
;---------------------------------
Username = Rat
Email = UplayEmu@rat43.com
Password = FetchTheGame23
Language = en-US
;---------------------------------
;0 = appdata\\roaming\\R1 UplayEmu Saves
;1 = SavePath in game folder
;2 = Custom (SavePath)
SaveType = 0
SavePath =
;---------------------------------
Logging = 0
;---------------------------------
;0 = disabled
;1 = enabled (you must also provide achievements_schema.json in the same folder as the .ini)
; check the example file for the structure
Achievements = 0

;Prefix to apply for the achievements_schema.json keys - default uses only achievement id as key
; The achievements_schema.json keys must also have the prefix in them
; Example: FenyxRising_Ach_
AchKeyPrefix =

;0 = same as SavePath
;1 = Custom (AchSavePath)
AchSaveType = 0
AchSavePath =

;Use only if game does not provide the correct uplay id on its own
;GameUplayId = 123

;Far Cry 3 Deluxe edition
;GameEditionUplayId = 599

[DLC]

[Items]

[Chunks]
`;

const DEFAULT_INI_TEMPLATE = `[Settings]
Username = Goldberg
Email = goldberg@gmail.com
UserId = 80f33a39-e682-4d1f-b693-39267e890df2

;Country probably has to be country short ISO code (currently no game uses the func this value will provide)
;Country = US

;Valid languages:
; es-MX zh-TW ru-RU pt-PT ot-OT it-IT en-US es-ES ko-KR
; el-GR fr-FR pt-BR ja-JP ro-RO no-NO ko-KO zh-CN pl-PL
; nl-NL da-DK fi-FI th-TH sv-SE de-DE ar-SA ar-AA
Language = en-US
; avatar must be png for best results use 64x64, 128x128, 256x256
Avatar = avatar.png

;0 = disabled
;1 = enabled (you must also provide achievements_schema.json in the same folder as the .ini)
; check the example file for the structure
Achievements = 0

;Prefix to apply for the achievements_schema.json keys - default uses only achievement id as key
; The achievements_schema.json keys must also have the prefix in them
; Example: FenyxRising_Ach_
AchKeyPrefix =

;0 = same as SaveType/SavePath
;1 = Custom (AchSavePath)
AchSaveType = 0
AchSavePath =

;Emu Logging
;0 = disabled
;1 = enabled
Logging = 0

;0 = appdata\\roaming\\Goldberg UplayEmu Saves
;1 = SavePath in game folder
;2 = Custom (SavePath)
SaveType = 0
SavePath =
SaveExtension = .save

[DLC]

[Items]

[Chunks]
`;

function listShallow(dir) {
  try {
    return fs.readdirSync(dir);
  } catch {
    return [];
  }
}

let _userDataPath = '';
function setUserDataPath(value) {
  _userDataPath = value ? path.resolve(value) : '';
}

function mappingOverridesFile() {
  const root = _userDataPath || userDataDir();
  return root ? path.join(root, 'cfg', MAPPING_OVERRIDES_FILE) : '';
}

function objectiveMapFile() {
  const root = _userDataPath || userDataDir();
  return root ? path.join(root, 'cfg', OBJECTIVE_MAP_FILE) : '';
}

/*
  Product ids a lookup could not resolve this scan. Discovery is synchronous and drops such a save
  folder on the spot, so the automatic resolver (which needs the network) cannot run there. It runs
  after the scan instead and writes what it learns, which the next scan reads synchronously - one
  scan late, and never in the way of one.
*/
const _unresolvedProducts = new Set();

function noteUnresolvedProduct(uplayId) {
  const id = String(uplayId || '').trim();
  if (/^\d+$/.test(id)) _unresolvedProducts.add(id);
}

function takeUnresolvedProducts() {
  const ids = [..._unresolvedProducts];
  _unresolvedProducts.clear();
  return ids;
}

function productMappingsFile() {
  const root = _userDataPath || userDataDir();
  return root ? path.join(root, 'cfg', PRODUCT_MAPPINGS_FILE) : '';
}

/*
  Ubisoft product id -> Steam AppID, learned automatically (parser/uplayAutoMap.js) for products the
  shipped table does not list. Kept in its own file, and read only AFTER that table: the table is a
  curated record of decisions a name match cannot make, and a learned answer must never overrule one.
  Distinct from uplay-r2-mappings.json, which holds the user's own per-installation choices.
*/
function readProductMappings() {
  try {
    const parsed = JSON.parse(fs.readFileSync(productMappingsFile(), 'utf8'));
    const games = parsed && parsed.format === 1 && parsed.games && typeof parsed.games === 'object' ? parsed.games : {};
    return games;
  } catch {
    return {}; // absent or unreadable: nothing has been learned yet
  }
}

function findProductMapping(uplayId) {
  const id = String(uplayId || '').trim();
  if (!/^\d+$/.test(id)) return null;
  const entry = readProductMappings()[id];
  if (!entry || !/^\d+$/.test(String(entry.steamAppid || ''))) return null;
  return resolvedSteamMapping({ steamAppid: entry.steamAppid, uplayId: id, steamName: entry.steamName });
}

function saveProductMapping({ uplayId, steamAppid, steamName = '' } = {}) {
  const id = String(uplayId || '').trim();
  const appid = String(steamAppid || '').trim();
  const file = productMappingsFile();
  if (!/^\d+$/.test(id) || !/^\d+$/.test(appid) || !file) return false;
  const games = readProductMappings();
  games[id] = { steamAppid: appid, steamName: String(steamName || '').slice(0, 300), learnedAt: new Date().toISOString() };
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    writeFileAtomic(file, JSON.stringify({ format: 1, games }, null, 2));
    return true;
  } catch {
    return false; // a lost lesson is re-learned on the next scan
  }
}

/*
  The objective id of every achievement, written where the Watchdog can read it. The Watchdog matches
  a live unlock by re-keying what the emulator wrote onto the schema's api-names, and it can only
  derive that itself when the api-name ends in the id. For a game keyed from Ubisoft's own archive
  the api-names carry no id at all, so without this table those games would show correct progress on
  the next scan but never raise a notification.
*/
function saveObjectiveMap({ steamAppid, prefix = '', objectiveIds } = {}) {
  const appid = String(steamAppid || '').trim();
  const file = objectiveMapFile();
  if (!/^\d+$/.test(appid) || !objectiveIds || !file) return false;
  const ids = {};
  for (const [name, id] of objectiveIds) {
    const key = String(Number(id));
    if (!Number.isFinite(Number(id))) continue;
    // Two api-names on one objective would make the reverse lookup a guess; drop the pair instead.
    ids[key] = Object.prototype.hasOwnProperty.call(ids, key) ? null : String(name);
  }
  for (const key of Object.keys(ids)) if (ids[key] === null) delete ids[key];
  if (Object.keys(ids).length === 0) return false;

  let stored = { format: 1, games: {} };
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (parsed && typeof parsed.games === 'object' && parsed.games) stored = { format: 1, games: parsed.games };
  } catch {
    /* absent or unreadable: start a fresh table rather than lose the repair */
  }
  stored.games[appid] = { prefix: String(prefix || ''), ids };
  try {
    writeFileAtomic(file, JSON.stringify(stored, null, 2));
    return true;
  } catch {
    return false;
  }
}

function mappingInstallKey(gameDir) {
  if (!gameDir) return '';
  try {
    return path.resolve(gameDir).toLowerCase();
  } catch {
    return '';
  }
}

function readMappingOverrides() {
  try {
    const parsed = JSON.parse(fs.readFileSync(mappingOverridesFile(), 'utf8'));
    const entries = parsed && Array.isArray(parsed.mappings) ? parsed.mappings : [];
    return entries.filter(
      (entry) =>
        entry &&
        mappingInstallKey(entry.gameDir) &&
        /^\d+$/.test(String(entry.steamAppid || '')) &&
        (!entry.uplayId || /^\d+$/.test(String(entry.uplayId)))
    );
  } catch {
    return [];
  }
}

function mappingOverrideResult(entry) {
  if (!entry) return null;
  return {
    uplay_id: String(entry.uplayId || ''),
    steam_appid: Number(entry.steamAppid),
    steam_name: String(entry.steamName || `Steam App ${entry.steamAppid}`),
    manual: true,
  };
}

function resolvedSteamMapping({ steamAppid, uplayId = '', steamName = '' } = {}) {
  const catalogId = String(steamAppid || '').trim();
  const nativeId = String(uplayId || '').trim();
  if (!/^\d+$/.test(catalogId) || (nativeId && !/^\d+$/.test(nativeId))) return null;
  return {
    uplay_id: nativeId,
    steam_appid: Number(catalogId),
    steam_name: String(steamName || `Steam App ${catalogId}`),
    automatic: true,
  };
}

function getSteamMappingOverride(gameDir) {
  const key = mappingInstallKey(gameDir);
  if (!key) return null;
  return readMappingOverrides().find((entry) => mappingInstallKey(entry.gameDir) === key) || null;
}

function findSteamMappingOverride({ gameDir, uplayId } = {}) {
  const exact = getSteamMappingOverride(gameDir);
  if (exact) return mappingOverrideResult(exact);

  const id = String(uplayId || '').trim();
  if (!/^\d+$/.test(id)) return null;
  const matches = readMappingOverrides().filter((entry) => String(entry.uplayId || '') === id);
  const appids = new Set(matches.map((entry) => String(entry.steamAppid)));
  if (appids.size !== 1) return null;
  matches.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
  return mappingOverrideResult(matches[0]);
}

function saveSteamMappingOverride({ gameDir, uplayId = '', steamAppid, steamName = '' } = {}) {
  const key = mappingInstallKey(gameDir);
  const nativeId = String(uplayId || '').trim();
  const catalogId = String(steamAppid || '').trim();
  if (!key) throw new Error('saveSteamMappingOverride: gameDir is required');
  if (nativeId && !/^\d+$/.test(nativeId)) throw new Error('saveSteamMappingOverride: uplayId must be numeric');
  if (!/^\d+$/.test(catalogId)) throw new Error('saveSteamMappingOverride: steamAppid must be numeric');

  const entries = readMappingOverrides().filter((entry) => mappingInstallKey(entry.gameDir) !== key);
  const stored = {
    gameDir: path.resolve(gameDir),
    uplayId: nativeId,
    steamAppid: catalogId,
    steamName: String(steamName || '').trim().slice(0, 300),
    updatedAt: new Date().toISOString(),
  };
  entries.push(stored);
  const file = mappingOverridesFile();
  if (!file) throw new Error('saveSteamMappingOverride: user data path is unavailable');
  writeFileAtomic(file, JSON.stringify({ format: 1, mappings: entries }, null, 2));
  return mappingOverrideResult(stored);
}

function clearSteamMappingOverride(gameDir) {
  const key = mappingInstallKey(gameDir);
  if (!key) return false;
  const previous = readMappingOverrides();
  const entries = previous.filter((entry) => mappingInstallKey(entry.gameDir) !== key);
  if (entries.length === previous.length) return false;
  writeFileAtomic(mappingOverridesFile(), JSON.stringify({ format: 1, mappings: entries }, null, 2));
  return true;
}

// A dual-layer repack can carry Steam's appid marker even though achievements flow through Uplay R2.
// Treat it only as a candidate for the confirmation dialog, never as automatic identity evidence.
function findSteamAppidHints(gameDir, { maxDepth = 4, maxDirectories = 600 } = {}) {
  if (!gameDir || !fs.existsSync(gameDir)) return [];
  const found = [];
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
    const marker = entries.find((entry) => entry.isFile() && entry.name.toLowerCase() === 'steam_appid.txt');
    if (marker) {
      try {
        const appid = fs.readFileSync(path.join(dir, marker.name), 'utf8').trim();
        if (/^\d+$/.test(appid) && !found.some((entry) => entry.appid === appid)) {
          found.push({ appid, file: path.join(dir, marker.name) });
        }
      } catch {
        /* an unreadable marker is not a candidate */
      }
    }
    if (depth >= maxDepth) continue;
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const lower = entry.name.toLowerCase();
      if (lower === BACKUP_DIR_NAME) continue;
      queue.push({ dir: path.join(dir, entry.name), depth: depth + 1 });
    }
  }
  return found;
}

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
  Which optional [Settings] keys does THIS loader build understand? The redirect keys are recent
  additions; older builds silently ignore them, so probe the DLL's literal key names (exact, cheap,
  no version numbers). An unreadable or unrelated DLL is never assumed capable. Returns architecture
  and achievement/config capabilities.
*/
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
    const has = (needle) => bytes.indexOf(Buffer.from(needle, 'ascii')) !== -1;
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
    supportsAchRedirect: known.length === 0 || known.every((l) => l.supportsAchRedirect),
    supportsAchKeyPrefix: known.length === 0 || known.every((l) => l.supportsAchKeyPrefix),
    supportsTicket: known.length > 0 && known.every((l) => l.supportsTicket),
    architectureValid: known.length > 0 && known.every((l) => l.arch && l.expectedArch === l.arch),
  };
}

/*
  One readdir: does the top of this folder look like a Uplay install at all? Not proof of anything -
  it is the cheap gate in front of hasEmulatorEvidence(), which walks the whole tree. A library scan
  asks this of every install folder it resolves, so it must never recurse.
*/
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

/*
  This install's own Ubisoft product id, read from the install rather than from any catalogue - the
  one identity a game absent from every shipped table can still supply. The loader log is the game's
  own word (it passes the id in on startup); the ini's GameUplayId is what a repack states when the
  game does not; both beat guessing. Returns '' when the install says nothing.

  Deliberately NOT derived from a save folder's name: that folder is created from an id, so reading
  it back would only repeat whatever was configured, right or wrong.
*/
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

/*
  A Ubisoft DLL basename is not proof of emulation: official games ship the same uplay/upc R2
  loader names. Require a Goldberg-only configuration signal before discovery, Fix all, or Game
  Health classifies an install as repairable. This remains deliberately separate from detectEmulator,
  which inventories candidate DLLs for an explicitly known Uplay R2 record.
*/
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

/*
  The ini the loader will actually read: first existing name in its own precedence order. Without a
  flavour every generation is searched, R2 first, so a caller that only has a directory still finds
  whichever config is really there.
*/
function activeIniFile(dir, flavour) {
  if (!dir) return '';
  const names = flavour ? resolveFlavour(flavour).iniNames : ALL_INI_NAMES;
  const files = names.map((name) => path.join(dir, name));
  return files.find((file) => fs.existsSync(file)) || '';
}

/*
  The settings section of an ini file as a lower-cased key/value object ({} when absent/unreadable).
  R1 keeps the very same keys under [Uplay] rather than [Settings], so the section follows the file
  name when the caller does not name a generation.
*/
function readIniSettings(file, flavour) {
  if (!file) return {};
  const section = resolveFlavour(flavour || flavourForIni(file)).section;
  try {
    return readIniSectionValues(parseIni(fs.readFileSync(file, 'utf8')), section);
  } catch {
    return {};
  }
}

function uplayDefaultSaveRoot(flavour) {
  const appdata = process.env['APPDATA'];
  return appdata ? path.join(appdata, resolveFlavour(flavour).saveRoot) : '';
}

/*
  Every directory the emulator could write achievements.json into, most-likely first (SaveType +
  AchSavePath, plus leftovers from reconfigs/repack updates - reading all of them costs a few stats
  and survives an ini that changed under us).
*/
function resolveAchievementSaveDirs({ gameDir, runtimeDir, uplayId, steamAppid, iniFile } = {}) {
  const dirs = [];
  const add = (dir) => {
    if (!dir) return;
    const value = String(dir).trim();
    if (!value) return;
    if (!dirs.some((existing) => path.normalize(existing).toLowerCase() === path.normalize(value).toLowerCase())) dirs.push(value);
  };

  const dir = runtimeDir || gameDir;
  const configFile = iniFile || activeIniFile(dir);
  const settings = readIniSettings(configFile);
  const id = String(uplayId || '').trim();

  // Configured achievement redirect (newer loaders only) wins when it is actually set.
  if (String(settings.achsavetype || '').trim() === '1' && String(settings.achsavepath || '').trim()) add(settings.achsavepath.trim());

  const saveType = String(settings.savetype || '').trim();
  const savePath = String(settings.savepath || '').trim();
  if (saveType === '2' && savePath) {
    add(savePath);
    if (id) add(path.join(savePath, id));
  } else if (saveType === '1' && gameDir) {
    add(path.join(gameDir, savePath || UPLAY_GAME_SAVE_SUBDIR, id || ''));
  }

  // Unconditional fallbacks: every generation's built-in default, plus the GSE folder AW's own repair
  // redirects to, so a game configured by an older AW build (or by a community script) still reads
  // back. Both save roots are probed whatever the loader on disk is: it costs a stat each, and it is
  // what lets an install read correctly while it is being switched from one generation to the other.
  if (id) {
    for (const known of FLAVOUR_LIST) {
      const root = uplayDefaultSaveRoot(known);
      if (root) add(path.join(root, id));
    }
    if (gameDir) add(path.join(gameDir, UPLAY_GAME_SAVE_SUBDIR, id));
  }
  if (steamAppid) add(defaultSavePath(steamAppid));

  return dirs;
}

// Is this save entry an actual unlock? Builds differ between `earned: true` and `earned: 1`.
function isEarnedEntry(entry) {
  if (!entry || typeof entry !== 'object') return false;
  return entry.earned === true || Number(entry.earned) > 0;
}

function entryUnlockTime(entry) {
  const value = Number((entry && (entry.earned_time ?? entry.unlock_time)) || 0);
  return Number.isFinite(value) ? value : 0;
}

/*
  Read the emulator's runtime unlock state, MERGED across every candidate directory. Stale all-zero
  copies (schema seed, previous SaveType, pre-created redirect target) must not mask the live file, so
  "earned wins, newest timestamp wins". Returns { dir, file, files, entries } | null.
*/
function readAchievementSave(dirs) {
  const merged = {};
  const files = [];
  let best = null;
  let bestEarned = -1;

  for (const dir of Array.isArray(dirs) ? dirs : [dirs]) {
    if (!dir) continue;
    const file = path.join(dir, ACH_SAVE_FILE);
    let parsed;
    try {
      if (!fs.existsSync(file)) continue;
      parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      continue; // an unreadable/half-written save must not abort the scan
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) continue;

    files.push(file);
    let earnedHere = 0;
    for (const [key, entry] of Object.entries(parsed)) {
      if (isEarnedEntry(entry)) earnedHere++;
      const current = merged[key];
      if (!current) {
        merged[key] = entry;
        continue;
      }
      if (isEarnedEntry(entry) && !isEarnedEntry(current)) merged[key] = entry;
      else if (isEarnedEntry(entry) && isEarnedEntry(current) && entryUnlockTime(entry) > entryUnlockTime(current)) merged[key] = entry;
    }
    if (earnedHere > bestEarned) {
      bestEarned = earnedHere;
      best = { dir, file };
    }
  }

  if (files.length === 0) return null;
  return { ...best, files, entries: merged };
}

/*
  Re-key an emulator save onto the Steam schema's api-names. For supported games the api-name IS
  "<prefix><objectiveId>", so the translation is exact: try as-is, then prefixed, then the objective id.

  `canonical` says the caller proved this list is a single prefix + unique objective ids
  (derivePrefixedIds returned non-null). Only then may an id be compared numerically, which is what
  reads back a save the loader wrote as "<prefix>1" for an api-name spelled "<prefix>001". Lists that
  failed that proof keep the literal digit match, because there the same numeric id can belong to two
  different api-names ("ACH_FS_01" and "ACH_FSDLC_1"). Unresolvable entries are dropped.
*/
function mapSaveToSchemaKeys(entries, { prefix = '', apiNames = [], canonical = false, objectiveIds = null } = {}) {
  const out = {};
  if (!entries || typeof entries !== 'object') return out;

  const byName = new Map();
  const byDigits = new Map();
  const byObjectiveId = new Map();
  const rememberObjectiveId = (id, value) => {
    // Defensive: the numeric path is the caller's promise, this is the check. A collision disables it
    // entirely rather than resolving an entry onto the wrong achievement.
    if (byObjectiveId.has(id)) byObjectiveId.set(id, null);
    else byObjectiveId.set(id, value);
  };
  for (const name of apiNames) {
    const value = String(name == null ? '' : name);
    if (!value) continue;
    byName.set(value.toUpperCase(), value);
    const digits = value.match(/(\d+)$/);
    if (!digits) continue;
    if (!byDigits.has(digits[1])) byDigits.set(digits[1], value);
    if (!objectiveIds) rememberObjectiveId(String(Number(digits[1])), value);
  }
  // An explicit table (Ubisoft's own archive) supersedes whatever the api-names end in.
  if (objectiveIds) for (const [name, id] of objectiveIds) rememberObjectiveId(String(Number(id)), String(name));

  const lowerPrefix = String(prefix || '').toLowerCase();
  const useObjectiveIds = canonical || !!objectiveIds;
  const resolveObjectiveId = (key) => {
    if (!useObjectiveIds) return undefined;
    let digits = null;
    if (/^\d+$/.test(key)) digits = key;
    else if (lowerPrefix && key.toLowerCase().startsWith(lowerPrefix)) {
      const rest = key.slice(lowerPrefix.length);
      if (/^\d+$/.test(rest)) digits = rest;
    }
    return digits === null ? undefined : byObjectiveId.get(String(Number(digits))) || undefined;
  };

  for (const [rawKey, entry] of Object.entries(entries)) {
    const key = String(rawKey);
    const candidates = [key, `${prefix}${key}`];
    let resolved = candidates.map((c) => byName.get(c.toUpperCase())).find(Boolean);
    if (!resolved) resolved = resolveObjectiveId(key);
    if (!resolved && /^\d+$/.test(key)) resolved = byDigits.get(key);
    if (!resolved) continue;
    // Two source keys can land on the same achievement - a merged save can hold both the bare id a
    // legacy loader wrote and the prefixed key a newer one writes. Same rule as the merge: an unlock
    // is never un-earned.
    const current = out[resolved];
    if (!current || (isEarnedEntry(entry) && !isEarnedEntry(current)) || (isEarnedEntry(entry) && entryUnlockTime(entry) > entryUnlockTime(current))) {
      out[resolved] = entry;
    }
  }
  return out;
}

// Classify the install independently from its folder name or from Steam artifacts. Ubisoft builds
// carry uplay_install.* / upc.cfg, while already-cracked installs may only expose the Uplay R2 loader
// or ini. This is deliberately separate from resolveSteamMapping(): an unknown Ubisoft game must
// still be identified as Ubisoft so the UI never offers the incompatible Steam/GBE Fork repair.
function isUbisoftInstall(gameDir) {
  if (!gameDir || !fs.existsSync(gameDir)) return false;
  if (UPLAY_INSTALL_MARKERS.some((name) => fs.existsSync(path.join(gameDir, name)))) return true;
  return detectEmulator(gameDir).type === 'uplayR2';
}

// Renderer-safe classification for already-discovered game records. Discovery persists both a
// dedicated flag and system="uplay"; the source/appid checks keep legacy UPLAY/Lumaplay records
// compatible. Keeping this rule here gives the context menu one authoritative GBE-vs-Uplay decision.
function isUbisoftGame(game, fallbackAppid) {
  const source = String((game && game.source) || '');
  const system = String((game && game.system) || '').toLowerCase();
  const appid = game && game.appid != null ? game.appid : fallbackAppid;
  return !!(
    (game && game.uplayR2) ||
    system === 'uplay' ||
    /uplay|ubisoft|lumaplay/i.test(source) ||
    /^UPLAY/i.test(String(appid || ''))
  );
}

// Narrower than isUbisoftGame(): official Ubisoft Connect records also use system="uplay", but they
// must never be offered or batch-applied an emulator DLL. A persisted discovery flag, an explicit
// legacy emulator source/id, or an actual loader on disk is required.
function isUplayR2Game(game, fallbackAppid) {
  const record = game && typeof game === 'object' ? game : {};
  const data = record.data && typeof record.data === 'object' ? record.data : {};
  const source = String(record.source || '');
  const appid = record.appid != null ? record.appid : fallbackAppid;
  const gameDir = record.gameDir || data.gameDir || '';
  if (record.uplayR2 || data.uplayR2 || /uplay r2|goldberg uplay|lumaplay|^uplay$/i.test(source)) return true;
  // Official records also use namespaced uplay-<id> identities. Source/type must veto that legacy
  // heuristic or Fix all could put an emulator DLL into a legitimate Ubisoft Connect installation.
  if (/^ubisoft connect$/i.test(source) || data.type === 'ubisoftOfficial') return false;
  if (gameDir && hasEmulatorEvidence(gameDir)) return true;
  return /^(?:UPLAY|uplay-)\d+$/i.test(String(appid || ''));
}

// Resolve the two ids a Ubisoft game can carry in the UI: the native Ubisoft product id and the
// mapped Steam catalog id used for schema, cover and community links. Renderer records differ by
// source (UPLAY65043, uplay-65043, or a promoted numeric Steam appid), so keep that normalization in
// one tested place instead of making every context-menu action guess independently.
function resolveGameIdentity(game, fallbackAppid) {
  const record = game && typeof game === 'object' ? game : {};
  const appid = record.appid != null ? record.appid : fallbackAppid;
  const appidText = String(appid == null ? '' : appid).trim();
  const data = record.data && typeof record.data === 'object' ? record.data : {};
  const embeddedMatch = appidText.match(/^(?:UPLAY|uplay-)(\d+)$/i);
  const explicitUplayId = record.ubisoftProductId || record.uplayId || data.uplayId || (embeddedMatch && embeddedMatch[1]) || '';
  const explicitSteamAppid = record.steamappid != null ? String(record.steamappid).trim() : '';
  const promotedSteamAppid = (record.uplayR2 || data.uplayR2) && /^\d+$/.test(appidText) ? appidText : '';
  const mapping = resolveSteamMapping({
    // A promoted Uplay R2 record uses its numeric Steam AppID as `appid`. Do not reinterpret that
    // number as a Ubisoft product id; use an explicit native id when one is available.
    appid: explicitUplayId ? `UPLAY${explicitUplayId}` : promotedSteamAppid ? undefined : appid,
    name: record.name,
    gameDir: record.gameDir || data.gameDir,
  }) ||
    resolvedSteamMapping({
      steamAppid: explicitSteamAppid || promotedSteamAppid,
      uplayId: explicitUplayId,
      steamName: record.name,
    });
  const steamAppid = explicitSteamAppid || (mapping && String(mapping.steam_appid)) || promotedSteamAppid;
  const uplayId = String(explicitUplayId || (mapping && mapping.uplay_id) || '');

  return {
    uplayId: /^\d+$/.test(uplayId) ? uplayId : '',
    steamAppid: /^\d+$/.test(steamAppid) ? steamAppid : '',
    mapping,
  };
}

// Paths exposed by the Ubisoft context menu. The loader may live below the install root, so config
// and schema actions must follow the actual DLL directory rather than assume every repack is flat.
function getGameToolPaths(game, fallbackAppid) {
  const record = game && typeof game === 'object' ? game : {};
  const data = record.data && typeof record.data === 'object' ? record.data : {};
  const gameDir = record.gameDir || data.gameDir || '';
  const identity = resolveGameIdentity(record, fallbackAppid);
  const emulator = detectEmulator(gameDir);
  const runtimeDir = emulator.dll.length > 0 ? path.dirname(emulator.dll[0]) : gameDir;
  const flavour = resolveFlavour(emulator.dll[0] || DEFAULT_FLAVOUR);
  const configFiles = runtimeDir ? flavour.iniNames.map((name) => path.join(runtimeDir, name)) : [];
  const configFile = configFiles.find((file) => fs.existsSync(file)) || configFiles[0] || '';

  return {
    ...identity,
    gameDir,
    runtimeDir,
    flavour: flavour.id,
    loaderFiles: emulator.dll,
    loader: inspectInstalledLoaders(emulator.dll),
    configFiles,
    configFile,
    schemaFile: runtimeDir ? path.join(runtimeDir, ACH_SCHEMA_FILE) : '',
    saveDir: identity.steamAppid ? defaultSavePath(identity.steamAppid) : '',
    saveDirs: resolveAchievementSaveDirs({
      gameDir,
      runtimeDir,
      uplayId: identity.uplayId,
      steamAppid: identity.steamAppid,
      iniFile: fs.existsSync(configFile) ? configFile : '',
    }),
  };
}

// The table is shared with ubisoftOfficial.js and re-read whenever the asset changes on disk, so a
// product added to it resolves without a restart.
function loadUplaySteamMap() {
  return uplaySteamTable.rows();
}

function mappingResult(hit) {
  // uplay_name comes along because a row can deliberately have NO Steam counterpart, and then the
  // Ubisoft title is the only name the game has.
  return hit
    ? { uplay_id: String(hit.uplay_id), steam_appid: hit.steam_appid, steam_name: hit.steam_name, uplay_name: hit.uplay_name || '' }
    : null;
}

// uplay_install.state is a small protobuf-like binary written by Ubisoft's installer. It contains
// the canonical product title as UTF-8 even when a repack renamed the parent folder. Match the
// longest known title embedded in the file; longest-first avoids a base title stealing a remaster or
// edition whose name contains it. No protobuf schema is required and malformed files fail closed.
function resolveMappingFromInstallState(gameDir, map) {
  if (!gameDir) return null;
  const stateFile = path.join(gameDir, 'uplay_install.state');
  try {
    const stat = fs.statSync(stateFile);
    if (!stat.isFile() || stat.size <= 0 || stat.size > 8 * 1024 * 1024) return null;
    const stateText = fs.readFileSync(stateFile, 'utf8').toLocaleLowerCase();
    const candidates = map
      .flatMap((entry) => [entry.uplay_name, entry.steam_name].filter(Boolean).map((title) => ({ entry, title: String(title) })))
      .sort((a, b) => Buffer.byteLength(b.title, 'utf8') - Buffer.byteLength(a.title, 'utf8'));
    const match = candidates.find(({ title }) => stateText.includes(title.toLocaleLowerCase()));
    return match ? mappingResult(match.entry) : null;
  } catch {
    return null;
  }
}

// Resolve a Ubisoft game's Steam equivalent via uplay-steam.json: exact uplay_id, then the
// uplay_install.state title, then a high-confidence fuzzy name match. Returns { uplay_id,
// steam_appid, steam_name } | null.
function resolveSteamMapping({ appid, name, gameDir } = {}) {
  const map = loadUplaySteamMap();
  const exactOverride = findSteamMappingOverride({ gameDir });
  if (exactOverride) return exactOverride;

  const rawId = appid != null ? String(appid).replace(/^uplay-?/i, '') : null;
  if (rawId && /^\d+$/.test(rawId)) {
    const hit = map.find((e) => String(e.uplay_id) === rawId);
    if (hit) return mappingResult(hit);
    const idOverride = findSteamMappingOverride({ uplayId: rawId });
    if (idOverride) return idOverride;
    // Last id-keyed source: what the automatic resolver learned for a product the table omits.
    const learned = findProductMapping(rawId);
    if (learned) return learned;
  }

  if (map.length === 0) return null;

  const installStateHit = resolveMappingFromInstallState(gameDir, map);
  if (installStateHit) return installStateHit;

  if (name && String(name).trim()) {
    // A folder can be named after either catalogue spelling, and one of them can simply be wrong -
    // the shipped Uplay title for Avatar read "Frontier of Pandora" for a while. Offer both.
    const apps = map.flatMap((e) => [e.uplay_name, e.steam_name].filter(Boolean).map((title) => ({ appid: e.steam_appid, name: title })));
    const steamAppid = fuzzyAppid.bestConfidentAppid(name, apps);
    if (steamAppid != null) {
      const hit = map.find((e) => e.steam_appid === steamAppid);
      if (hit) return mappingResult(hit);
    }
  }

  return null;
}

/*
  The one key the loader can ever look up. Verified against upc_r2_loader64.dll: UPC_AchievementUnlock
  takes the objective id as a uint32 and builds its lookup key as AchKeyPrefix + std::to_string(id), so
  the digits are always a plain decimal. An api-name whose trailing digits are zero-padded ("001",
  "spc_01") therefore names a key no game can ever produce, which is why the id is renormalised here
  rather than reused verbatim.
*/
function canonicalObjectiveKey(apiName) {
  const name = String(apiName == null ? '' : apiName);
  const m = name.match(/^(.*?)(\d+)$/);
  if (!m) return name;
  return `${m[1]}${Number(m[2])}`;
}

// Titles are the only field the Steam schema and Ubisoft's own archive are guaranteed to share, so
// they are the join key. Fold away case, accents and punctuation, which the two catalogues spell
// differently for the same achievement.
function normalizeObjectiveTitle(value) {
  return String(value == null ? '' : value)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '');
}

/*
  Ubisoft Connect caches the achievement definitions of every product whose achievements page it has
  displayed: the real objective ids plus their titles in each shipped language. It is the only offline
  source that owes nothing to a naming convention, so it both proves the convention right and keys the
  games the convention cannot describe. The archive is a snapshot and can predate a DLC, so it is a
  source of ids, never a source of truth about how many achievements a game has.

  Returns { ids, byTitle: Map(normalizedTitle -> objectiveId | null) } | null.
*/
function readUbisoftObjectives(uplayId, { achievementsRoot = '' } = {}) {
  const id = String(uplayId || '').trim();
  if (!/^\d+$/.test(id)) return null;
  try {
    // Lazily required: ubisoftOfficial.js requires this module back, and only from inside functions.
    const ubisoftOfficial = require(path.join(__dirname, 'ubisoftOfficial.js'));
    const resolved = ubisoftOfficial._internal.resolveAchievementsArchive(id, achievementsRoot ? { achievementsRoot } : {});
    const data = ubisoftOfficial._internal.collectSchemaData(resolved.archivePath);
    if (!data || !Array.isArray(data.ids) || data.ids.length === 0) return null;
    const byTitle = new Map();
    for (const localization of data.localizations.values()) {
      for (const [objectiveId, entry] of localization) {
        const key = normalizeObjectiveTitle(entry && entry.displayName);
        if (!key) continue;
        // One title held by two objectives identifies neither: poison the entry rather than pick.
        byTitle.set(key, byTitle.has(key) && byTitle.get(key) !== objectiveId ? null : objectiveId);
      }
    }
    return { ids: data.ids.slice(), byTitle };
  } catch {
    return null; // launcher absent, product never opened, or an unreadable archive
  }
}

// Given the Steam schema's achievement list ([{name, ...}]), verify every api-name ends in
// "<one shared prefix><digits>" - the convention the Ubisoft objective id is embedded in for many
// Ubisoft-published Steam ports. Returns { prefix, count, ids } when the whole list agrees, else null
// (this game isn't auto-supported; diagnose() surfaces that instead of writing a broken schema).
function derivePrefixedIds(achievementList) {
  const list = Array.isArray(achievementList) ? achievementList : [];
  if (list.length === 0) return null;

  let prefix = null;
  const ids = [];
  for (const a of list) {
    const nm = a && a.name != null ? String(a.name) : '';
    const m = nm.match(/^(.*?)(\d+)$/);
    if (!m) return null;
    if (prefix === null) prefix = m[1];
    else if (prefix !== m[1]) return null;
    ids.push(Number(m[2]));
  }
  // Padding is dropped when the loader rebuilds the key, so two api-names that differ only by leading
  // zeros would collapse onto one objective id. Refuse the game instead of writing a schema that
  // silently loses an achievement.
  if (new Set(ids).size !== ids.length) return null;
  return { prefix: prefix || '', count: list.length, ids };
}

const _ubisoftObjectiveCache = new Map();

/*
  Decide how this game's achievements_schema.json has to be keyed, best source first:

  - the Steam api-name convention "<prefix><objectiveId>", which Ubisoft's own archive confirms is the
    real objective id. Checked by matching the two lists on the achievement title for every product
    where both could be obtained: 409 achievements across eight titles, from Assassin's Creed III to
    Shadows, and the two numberings agreed on all of them;
  - Ubisoft Connect's cached archive, joined to the Steam list on the achievement title, for games
    whose api-names carry no id at all. Its snapshot can predate a DLC, so an achievement it does not
    know is left out of the schema rather than given an invented id.

  Returns { origin, prefix, objectiveIds: Map(apiName -> id), count, total } or null when neither
  source can key this game, which is what keeps a guess out of a game folder.
*/
function resolveObjectiveKeying({ achievementList, uplayId, achievementsRoot = '' } = {}) {
  const list = (Array.isArray(achievementList) ? achievementList : []).filter((a) => a && a.name != null);
  if (list.length === 0) return null;

  const convention = derivePrefixedIds(list);
  if (convention) {
    const objectiveIds = new Map(list.map((a) => [String(a.name), String(Number(String(a.name).match(/(\d+)$/)[1]))]));
    return { origin: 'steam-apiname', prefix: convention.prefix, objectiveIds, count: list.length, total: list.length };
  }

  const id = String(uplayId || '').trim();
  if (!/^\d+$/.test(id)) return null;
  // Parsing the archive costs a zip inflate, and a scan asks for the same product repeatedly. An
  // explicit root is a caller pinning one archive, so it never shares the session cache.
  let archive;
  if (achievementsRoot) {
    archive = readUbisoftObjectives(id, { achievementsRoot });
  } else {
    if (!_ubisoftObjectiveCache.has(id)) _ubisoftObjectiveCache.set(id, readUbisoftObjectives(id));
    archive = _ubisoftObjectiveCache.get(id);
  }
  if (!archive) return null;

  const objectiveIds = new Map();
  for (const a of list) {
    const objectiveId = archive.byTitle.get(normalizeObjectiveTitle(a.displayName != null ? a.displayName : a.name));
    if (objectiveId) objectiveIds.set(String(a.name), String(objectiveId));
  }
  // Two api-names landing on one objective would silently drop an achievement; the game is safer
  // unkeyed than half keyed.
  if (objectiveIds.size === 0 || new Set(objectiveIds.values()).size !== objectiveIds.size) return null;
  return { origin: 'ubisoft-archive', prefix: '', objectiveIds, count: objectiveIds.size, total: list.length };
}

/*
  Build the Uplay R2 achievements_schema.json from the AW schema. keyed:true → prefixed objective keys
  (loader with AchKeyPrefix); keyed:false → bare objective ids (older loader that would otherwise never
  match). Both forms drop any zero padding, so the key matches what the loader actually looks up.

  `objectiveIds` (from resolveObjectiveKeying) makes the id explicit rather than read off the end of
  the api-name. An achievement missing from that map has no trusted id and is left out.
*/
function buildAchievementsSchemaJson(schema, { keyed = true, prefix = '', objectiveIds = null } = {}) {
  const list = (schema && schema.achievement && Array.isArray(schema.achievement.list) && schema.achievement.list) || [];
  const out = {};
  for (const a of list) {
    if (!a || a.name == null) continue;
    const name = String(a.name);
    let key;
    if (objectiveIds) {
      const id = objectiveIds.get(name);
      if (!id) continue;
      key = keyed ? `${prefix}${id}` : String(id);
    } else {
      const digits = name.match(/(\d+)$/);
      key = keyed || !digits ? canonicalObjectiveKey(name) : String(Number(digits[1]));
    }
    out[key] = {
      displayName: a.displayName || a.name,
      description: a.description || '',
      earned: 0,
    };
  }
  return out;
}

function backupTimestamp(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, '-');
}

function defaultSavePath(steamAppid) {
  const appdata = process.env['APPDATA'];
  if (!appdata) return '';
  return path.join(appdata, 'GSE Saves', String(steamAppid));
}

function normalizeLoaderLanguage(language) {
  const value = String(language || '').trim();
  if (!value) return '';
  return UPLAY_LANGUAGE_CODES[value.toLowerCase()] || UPLAY_LANGUAGE_VALUES.get(value.toLowerCase()) || 'en-US';
}

/*
  Read-modify-write BOTH of a generation's ini names beside the loader dll, preserving every other key
  (UserId in particular) and section. Only keys the installed loader parses are written: redirect keys
  are left out on builds without support, or the ini would look configured while saves stay elsewhere.
  R1 holds the same keys under [Uplay], so the section and the starting template follow the flavour.
*/
function planSettingsConfig({ dir, steamAppid, prefix, accountName, language, logging, capabilities, flavour } = {}) {
  if (!dir) throw new Error('writeSettingsConfig: dir is required');
  if (steamAppid == null) throw new Error('writeSettingsConfig: steamAppid is required');

  const kind = resolveFlavour(flavour || flavourForDir(dir) || DEFAULT_FLAVOUR);
  const caps = capabilities || inspectInstalledLoaders(detectEmulator(dir).dll);
  const updates = { Achievements: '1' };
  if (caps.supportsAchKeyPrefix) updates.AchKeyPrefix = sanitizeIniValue(prefix || '');
  if (caps.supportsAchRedirect) {
    const achievementSavePath = defaultSavePath(steamAppid);
    if (!achievementSavePath) throw new Error('writeSettingsConfig: APPDATA is unavailable for the achievement save redirect');
    updates.AchSaveType = '1';
    updates.AchSavePath = sanitizeIniValue(achievementSavePath);
  }
  if (accountName && String(accountName).trim()) updates.Username = sanitizeIniValue(accountName);
  if (language && String(language).trim()) updates.Language = normalizeLoaderLanguage(language);
  if (typeof logging === 'boolean') updates.Logging = logging ? '1' : '0';

  const template = kind.id === 'r1' ? DEFAULT_INI_TEMPLATE_R1 : DEFAULT_INI_TEMPLATE;
  const written = [];
  for (const iniName of kind.iniNames) {
    const file = path.join(dir, iniName);
    const previous = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : template;
    const doc = parseIni(previous);
    let settings = getIniSection(doc, kind.section);
    if (!settings) {
      settings = { key: kind.section.toLowerCase(), header: `[${kind.section}]`, body: [] };
      doc.sections.unshift(settings);
    }
    settings.body = upsertIniKeys(settings.body, updates);
    const next = stringifyIni(doc);
    const changed = previous !== next;
    written.push({ file, previous, next, changed });
  }
  return {
    flavour: kind.id,
    files: written,
    achSavePath: updates.AchSavePath || '',
    achKeyPrefix: caps.supportsAchKeyPrefix ? updates.AchKeyPrefix : '',
    supportsAchRedirect: caps.supportsAchRedirect,
    supportsAchKeyPrefix: caps.supportsAchKeyPrefix,
  };
}

/*
  A game asks the loader for its Ubisoft session ticket through UPC_TicketGet, and the loader answers
  with whatever `[Settings] Ticket` holds - defaulting to the empty string. Several titles read that
  emptiness as "no session" and never enable achievements at all: they call nothing, so nothing is
  missed, nothing is mis-keyed, and the setup looks perfect while recording zero. Avatar: Frontiers of
  Pandora is one, measured here: no achievement call whatsoever across a 47 minute session with the
  triggering quest completed, then a list query 7 seconds after launch and a real unlock once this
  value was present.

  What this is: a syntactically well-formed JWE, five base64url segments, whose header matches the
  shape a real Ubisoft session provides. What it is not: a credential. Nothing here is signed,
  decryptable or issued by anyone - it only lets a game that checks whether a token EXISTS, or looks
  like one, get past that check. A game that genuinely validates the signature is unaffected by it.

  Fixed rather than generated, because it carries no secret and a constant keeps a repair
  reproducible: two machines with the same game end up with byte-identical files.
*/
const SESSION_TICKET =
  'eyJlbmMiOiJBMTI4Q0JDIiwiZW52aXJvbm1lbnQiOiJwcm9kIiwiaW50IjoiSFMyNTYiLCJpdiI6IkV6eG96NkRxZ2xKcS0xYjF3NVVSUU9IIiwidHlwIjoiSldFIn0.aFdyN0xxNVpjM0ZuVWtwbWJHOTFhM0J4Y21WMFlXbHVaWEo0WTJKcg.WkdWbVlYVnNkR2xrWlc1MGFYUjU.c2Vzc2lvbi1wbGFjZWhvbGRlci1ub3QtYS1yZWFsLXViaXNvZnQtdGlja2V0LWlzc3VlZC1ieS1hdy1uZXh0.dW5zaWduZWQtcGxhY2Vob2xkZXI';

/*
  Write (or remove) that one key, and nothing else.

  Deliberately not part of planSettingsConfig: that rewrites Achievements, AchKeyPrefix, AchSaveType,
  AchSavePath, Username and Language, and needs a Steam appid to do so. Flipping a single setting must
  not be able to disturb a setup that already works. The reverse holds too - upsertIniKeys only
  touches the keys it is handed, so a Ticket written here survives a later full re-apply untouched.
*/
function setSessionTicket({ dir, flavour = null, enabled = true } = {}) {
  const target = String(dir || '').trim();
  if (!target) throw 'uplay: no folder to configure';
  const kind = resolveFlavour(flavour || flavourForDir(target) || DEFAULT_FLAVOUR);

  const written = [];
  for (const iniName of kind.iniNames) {
    const file = path.join(target, iniName);
    // Only files that are already there: this never creates an ini from a template, because a folder
    // with no configuration has nothing to unblock yet.
    if (!fs.existsSync(file)) continue;
    const previous = fs.readFileSync(file, 'utf8');
    const doc = parseIni(previous);
    const settings = getIniSection(doc, kind.section);
    if (!settings) continue;

    if (enabled) {
      settings.body = upsertIniKeys(settings.body, { Ticket: SESSION_TICKET });
    } else {
      settings.body = settings.body.filter((line) => !/^\s*Ticket\s*=/i.test(line));
    }

    const next = stringifyIni(doc);
    const changed = previous !== next;
    if (changed) writeFileAtomic(file, next);
    written.push({ file, changed });
  }
  return { flavour: kind.id, enabled, files: written };
}

// True when this folder's active ini already carries a non-empty Ticket.
function hasSessionTicket(dir, flavour = null) {
  const iniFile = activeIniFile(dir, flavour);
  if (!iniFile) return false;
  return String(readIniSettings(iniFile, flavour).ticket || '').trim().length > 0;
}

function writeFileAtomic(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.${Date.now()}.tmp`);
  try {
    fs.writeFileSync(temporary, content);
    fs.renameSync(temporary, file);
  } finally {
    try {
      if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
    } catch {
      /* ignore cleanup failure */
    }
  }
}

function applySettingsConfigPlan(plan) {
  for (const entry of plan.files) if (entry.changed) writeFileAtomic(entry.file, entry.next);
  return plan;
}

function writeSettingsConfig(options = {}) {
  return applySettingsConfigPlan(planSettingsConfig(options));
}

/*
  UPC_Init seeds <AchSavePath>\achievements.json from the schema only when that file does not exist
  yet, so a setup re-applied with different keys would keep an unreachable runtime save for good.
  Removing it lets the loader rebuild it - but only when it demonstrably holds nothing: no unlock
  recorded and not one key in common with the schema just written. That is why no backup is taken.
*/
function removeStaleRuntimeSave(saveDir, schemaJson) {
  if (!saveDir || !schemaJson) return false;
  const file = path.join(saveDir, ACH_SAVE_FILE);
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return false;
    const keys = Object.keys(parsed);
    if (keys.length === 0) return false;
    if (Object.values(parsed).some(isEarnedEntry)) return false;
    if (keys.some((key) => Object.prototype.hasOwnProperty.call(schemaJson, key))) return false;
    fs.unlinkSync(file);
    return true;
  } catch {
    return false; // absent, unreadable or half-written: leave it to the runtime
  }
}

/*
  The loader appends a line per call and never rotates, so a game that polls for its asynchronous
  operations grows this without bound - 61 MB per hour of play on one measured title, 97% of it the
  same repeated line. Past the point where readLoaderLog would still read the whole file, the excess
  is noise nobody can act on, so it goes rather than sitting in somebody's game folder forever.

  Deleted, not truncated: the loader holds the file open while a game runs, and a truncation it does
  not know about leaves it writing at its old offset, producing a file padded with NUL bytes.
*/
const MAX_LOADER_LOG_BYTES = 25 * 1024 * 1024;

function pruneLoaderLog(dir, flavour = null, maxBytes = MAX_LOADER_LOG_BYTES) {
  const kind = resolveFlavour(flavour || flavourForDir(dir) || DEFAULT_FLAVOUR);
  const file = path.join(String(dir || ''), kind.logFile);
  try {
    if (fs.statSync(file).size <= maxBytes) return false;
    fs.unlinkSync(file);
    return true;
  } catch {
    // Absent, or held open by a running game: either way there is nothing to do about it here.
    return false;
  }
}

/*
  Read the loader's own diagnostic log, which is the only record of what the GAME asked for. It says
  apart the two failures that look identical from the outside: a game that never calls the
  achievement API at all, and one that calls it with an objective id the schema does not carry.

  The log grows without bound while a game runs (7 MB after a few minutes at a menu in one measured
  session), so it is read bounded: the head for the startup lines and the tail for what happened
  most recently. Returns null when logging was never switched on.
*/
const LOG_HEAD_BYTES = 1024 * 1024;
const LOG_TAIL_BYTES = 23 * 1024 * 1024;

function readLoaderLog(dir, flavour) {
  const kind = resolveFlavour(flavour || flavourForDir(dir) || DEFAULT_FLAVOUR);
  const file = path.join(dir, kind.logFile);
  let stat;
  try {
    stat = fs.statSync(file);
  } catch {
    return null;
  }
  if (!stat.isFile() || stat.size === 0) return null;

  let text = '';
  let truncated = false;
  try {
    const fd = fs.openSync(file, 'r');
    try {
      if (stat.size <= LOG_HEAD_BYTES + LOG_TAIL_BYTES) {
        const buffer = Buffer.alloc(stat.size);
        fs.readSync(fd, buffer, 0, stat.size, 0);
        text = buffer.toString('latin1');
      } else {
        truncated = true;
        const head = Buffer.alloc(LOG_HEAD_BYTES);
        fs.readSync(fd, head, 0, LOG_HEAD_BYTES, 0);
        const tail = Buffer.alloc(LOG_TAIL_BYTES);
        fs.readSync(fd, tail, 0, LOG_TAIL_BYTES, stat.size - LOG_TAIL_BYTES);
        text = head.toString('latin1') + '\n' + tail.toString('latin1');
      }
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return null;
  }

  /*
    Both generations name the objective, in their own words:

      R1  UPLAY_ACH_EarnAchievement => achievementId (42)
      R2  UPC_AchievementUnlock => inId (42)

    The calls are counted as well as parsed, because the two answer different questions: the ids say
    which objective was asked for, the count says that the game asked at all. A log truncated between
    them still supports the second, and that alone convicts a setup sitting at 0%.
  */
  const objectiveIds = [];
  const unlockPattern = /(?:UPC_AchievementUnlock[^\r\n]*?inId|UPLAY_ACH_EarnAchievement[^\r\n]*?achievementId)\s*\((\d+)\)/g;
  for (const match of text.matchAll(unlockPattern)) {
    const id = String(Number(match[1]));
    if (!objectiveIds.includes(id)) objectiveIds.push(id);
  }
  const unlockCalls = (text.match(/UPC_AchievementUnlock|UPLAY_ACH_EarnAchievement/g) || []).length;
  /*
    The Ubisoft product id straight from the game, which is the only source that owes nothing to a
    catalogue: the game passes it to the loader on startup, R2 as "UPC_Init -> ... appid (4740)" and
    R1 as "UPLAY_Start => aUplayId (3539)". It is what every save folder is named after, so it is
    what an automatic mapping has to start from for a game no shipped table lists.
  */
  const productMatch = text.match(/UPC_Init[^\r\n]*?\bappid\s*\((\d+)\)|aUplayId\s*\((\d+)\)/);
  const productId = productMatch ? String(Number(productMatch[1] || productMatch[2])) : '';

  return {
    file,
    size: stat.size,
    truncated,
    productId,
    // Any achievement entry point at all, not just the unlock: a game that only lists them still
    // proves it speaks this API.
    touchedAchievementApi: /UPC_Achievement[A-Za-z]*|UPLAY_ACH_[A-Za-z]*/.test(text),
    // How many times the game asked for an unlock, whether or not the build names the objective.
    unlockCalls,
    parsedSchema: text.includes('Parsing achievements schema'),
    skippedSchema: text.includes('Skip parsing of achievements schema'),
    reportedDisabled: text.includes('Achievements disabled or achievements.json file not found'),
    objectiveIds,
  };
}

/*
  report.issues is an array of { level, code, message }, the same shape as goldberg.diagnose so
  app.js's dialog-building code can be reused.

  `readLog: false` skips the loader-log pass. The log is the only way to tell "the game never asked"
  apart from "the game asked for an id the schema lacks", so the panel always wants it - but it can
  be tens of megabytes and a library scan runs this once per Ubisoft game, where the setup verdict is
  all that is needed.
*/
function diagnose({ gameDir, appid, name, loaderPaths = null, mapping: suppliedMapping = null, flavour: suppliedFlavour = null, readLog = true } = {}) {
  const report = {
    gameDir,
    dll: null,
    mapping: null,
    ok: false,
    issues: [],
    save: null,
  };
  const add = (level, code, message) => report.issues.push({ level, code, message });

  if (!gameDir || !fs.existsSync(gameDir)) {
    add('error', 'NO_GAME_DIR', `Game folder not found: ${gameDir}`);
    return report;
  }

  const mapping = suppliedMapping || resolveSteamMapping({ appid, name, gameDir });
  report.mapping = mapping;
  if (!mapping) {
    add('error', 'NO_STEAM_MAPPING', `No safe Steam equivalent has been resolved for this Ubisoft game (appid=${appid}, name=${name}).`);
    return report;
  }

  const scopedLoaders = Array.isArray(loaderPaths) ? loaderPaths.filter((file) => fs.existsSync(file)) : null;
  const emu = scopedLoaders ? { type: scopedLoaders.length > 0 ? 'uplayR2' : 'none', dll: scopedLoaders } : detectEmulator(gameDir);
  if (emu.type === 'none') {
    add('error', 'NO_UPLAY_R2_DLL', 'No uplay_r2_loader(64).dll / upc_r2_loader(64).dll found - Goldberg Uplay R2 is not installed here.');
    return report;
  }
  const dir = path.dirname(emu.dll[0]);
  report.dll = emu.dll;

  /*
    Which generation this install runs decides the config names, the ini section and the save root -
    and which loaders count. A folder can still hold the other generation's DLL (a repack update, a
    crack left in place); the game never loads it, so letting it drag the capability probe down would
    strip a redirect the loader in use supports.
  */
  const flavour = suppliedFlavour ? resolveFlavour(suppliedFlavour) : resolveFlavour(emu.dll[0] || DEFAULT_FLAVOUR);
  report.flavour = flavour.id;
  const activeLoaders = emu.dll.filter((file) => (flavourForDll(file) || DEFAULT_FLAVOUR).id === flavour.id);
  const caps = inspectInstalledLoaders(activeLoaders.length > 0 ? activeLoaders : emu.dll);
  report.loader = caps;
  if (!caps.supportsAchievements) {
    add('error', 'NOT_UPLAY_R2_LOADER', 'A matching Ubisoft loader filename exists, but the DLL does not expose Goldberg Uplay R2 achievement support.');
  }
  for (const loader of caps.loaders.filter((entry) => entry.exists && (!entry.arch || entry.arch !== entry.expectedArch))) {
    add(
      'error',
      loader.arch ? 'LOADER_ARCH_MISMATCH' : 'LOADER_ARCH_UNKNOWN',
      `${path.basename(loader.path)} is ${loader.arch || 'not a readable PE'}; this filename requires ${loader.expectedArch || 'a known architecture'}.`
    );
  }
  if (!caps.supportsAchRedirect) {
    add(
      'info',
      'LOADER_NO_ACH_REDIRECT',
      'This loader build predates AchSaveType/AchSavePath support, so the emulator cannot be redirected. ' +
        'AW Next reads its own save folder instead - update the loader dll for the redirect.'
    );
  }

  const iniFile = activeIniFile(dir, flavour);
  const settings = iniFile ? readIniSettings(iniFile, flavour) : {};

  const schemaFile = path.join(dir, ACH_SCHEMA_FILE);
  if (!fs.existsSync(schemaFile)) {
    add('error', 'NO_SCHEMA_JSON', `${ACH_SCHEMA_FILE} is missing - run "Apply emulator fix (Uplay R2)" to generate it. A game update re-extracting the repack removes it.`);
  } else {
    try {
      const parsedSchema = JSON.parse(fs.readFileSync(schemaFile, 'utf8'));
      /*
        Every key has to be exactly what the loader rebuilds at unlock time: AchKeyPrefix (empty on a
        build that does not parse it) followed by the objective id as a plain decimal. Anything else -
        an unexpected prefix, a zero-padded id, a non-numeric suffix - names a key no unlock can ever
        produce, and the game records nothing while the setup still looks configured.
      */
      const keys = Object.keys(parsedSchema || {});
      const expectedPrefix = caps.supportsAchKeyPrefix ? String(settings.achkeyprefix || '').trim() : '';
      const lowerExpected = expectedPrefix.toLowerCase();
      const isCanonicalKey = (key) => {
        if (lowerExpected && !key.toLowerCase().startsWith(lowerExpected)) return false;
        return /^(?:0|[1-9]\d*)$/.test(key.slice(expectedPrefix.length));
      };
      // No ini means no reliable expected prefix; NO_INI below already forces the same repair.
      const offenders = iniFile && keys.length > 0 ? keys.filter((key) => !isCanonicalKey(key)) : [];
      if (offenders.length > 0) {
        add(
          'warning',
          'SCHEMA_KEYS_NOT_CANONICAL',
          `${offenders.length}/${keys.length} ${ACH_SCHEMA_FILE} key(s) cannot be produced by this loader, which looks up "${expectedPrefix}<objective id>" ` +
            `with no leading zeros (for example "${offenders[0]}") - re-apply the fix.`
        );
      }
    } catch (e) {
      add('error', 'BAD_SCHEMA_JSON', `${ACH_SCHEMA_FILE} is not valid JSON: ${e.message}`);
    }
  }

  const expectedSavePath = defaultSavePath(mapping.steam_appid);
  report.iniFile = iniFile;
  if (!iniFile) {
    add('warning', 'NO_INI', `No ${flavour.iniNames.join('/')} found beside the loader dll.`);
  } else {
    if (String(settings.achievements || '').trim() !== '1') {
      add('error', 'ACHIEVEMENTS_DISABLED', `Achievements=1 is not set in ${path.basename(iniFile)} - the emulator records no unlocks at all.`);
    }
    if (caps.supportsAchRedirect) {
      const configured = String(settings.achsavepath || '').trim();
      if (String(settings.achsavetype || '').trim() !== '1' || path.normalize(configured.toLowerCase()) !== path.normalize(expectedSavePath.toLowerCase())) {
        add('warning', 'BAD_SAVE_REDIRECT', `AchSaveType/AchSavePath is not redirected to ${expectedSavePath}.`);
      }
    }
  }

  // Where the unlocks really are. On a redirected install that is GSE Saves\<steamAppid>; on an old
  // loader it is the emulator's own folder - read both rather than reporting 0% from the wrong one.
  const saveDirs = resolveAchievementSaveDirs({
    gameDir,
    runtimeDir: dir,
    uplayId: mapping.uplay_id,
    steamAppid: mapping.steam_appid,
    iniFile,
  });
  report.saveDirs = saveDirs;
  const emuSave = readAchievementSave(saveDirs);
  report.save = goldberg.inspectSaveState(mapping.steam_appid);
  if (emuSave) {
    const total = Object.keys(emuSave.entries).length;
    const earned = Object.values(emuSave.entries).filter(isEarnedEntry).length;
    report.emulatorSave = { ...emuSave, total, earned };
    add('info', 'SAVE_PRESENT', `Runtime save found in ${emuSave.dir}: ${earned}/${total} unlocked.`);
  } else if (report.save && report.save.exists) {
    add('info', 'SAVE_PRESENT', `Runtime save found: ${report.save.earned}/${report.save.total} unlocked.`);
  } else {
    add('info', 'NO_SAVE_YET', `No runtime save has been written yet. Checked: ${saveDirs.join(', ') || '(none)'}`);
  }

  /*
    "Setup looks valid but nothing unlocks" has two causes that look identical from the outside, and
    only the loader's own log tells them apart: the game never asked the achievement API for anything,
    or it did ask and named an objective the schema does not carry. The first is a game this fix
    cannot serve; the second is a wrong mapping, and the log names the ids to fix it with.
  */
  const earnedSoFar = report.emulatorSave ? report.emulatorSave.earned : (report.save && report.save.earned) || 0;
  if (earnedSoFar === 0 && readLog) {
    const log = readLoaderLog(dir, flavour);
    report.loaderLog = log;
    if (!log) {
      add(
        'info',
        'NO_LOADER_LOG',
        `The loader keeps no diagnostic log yet. Set Logging=1 in ${path.basename(iniFile || flavour.iniNames[0])} and run the game once: ` +
          `${flavour.logFile} then records every objective id the game asks for, which is what tells a wrong mapping apart from a game that never asks.`
      );
    } else {
      let schemaKeys = [];
      try {
        schemaKeys = Object.keys(JSON.parse(fs.readFileSync(schemaFile, 'utf8')) || {});
      } catch {
        /* the schema problems are already reported above */
      }
      const expectedPrefix = caps.supportsAchKeyPrefix ? String(settings.achkeyprefix || '').trim() : '';
      const unmatched = log.objectiveIds.filter((id) => !schemaKeys.includes(`${expectedPrefix}${id}`));
      if (unmatched.length > 0) {
        add(
          'warning',
          'LOADER_LOG_UNKNOWN_OBJECTIVE',
          `The game unlocked objective ${unmatched.slice(0, 6).join(', ')}${unmatched.length > 6 ? ', ...' : ''} but ` +
            `${ACH_SCHEMA_FILE} has no "${expectedPrefix}${unmatched[0]}" key: this game's Steam achievement names do not carry its Ubisoft objective ids.`
        );
      } else if (log.unlockCalls > 0 && log.objectiveIds.length === 0) {
        /*
          The game asked, nothing was recorded, and not one id could be read: a log whose unlock
          lines were cut off by the bounded tail read, or a loader build that words them differently.
          The verdict survives without them, so it is still given; naming a key would not be.
        */
        add(
          'warning',
          'LOADER_LOG_UNLOCK_NOT_RECORDED',
          `The game asked the loader to unlock ${log.unlockCalls === 1 ? 'an achievement' : `${log.unlockCalls} achievements`} and the save still records none, ` +
            `but ${flavour.logFile} no longer holds the objective it named. A key ${ACH_SCHEMA_FILE} carries would have been written, so this game's Steam ` +
            `achievement names most likely do not carry its Ubisoft objective ids: re-apply the fix to key the schema from Ubisoft's own data.`
        );
      } else if (!log.touchedAchievementApi) {
        /*
          The game ran and asked for nothing at all. That used to be reported as reassurance - the
          setup missed nothing - which is wrong in the case it fires most often: a title that only
          enables achievements once it believes it has a Ubisoft session. The loader answers
          UPC_TicketGet from `[Settings] Ticket`, defaulting to empty, and an empty answer reads as
          "offline". Avatar: Frontiers of Pandora sat silent through a 47 minute session with the
          triggering quest completed, and queried its list 7 seconds after launch once a ticket was
          there.

          Only said where it can be acted on: the loader has to read the key at all.

          With a ticket already configured, the same silence means the opposite - it was tried and it
          changed nothing - and that is the one case where taking it back out is worth offering. A
          title the ticket does unblock queries its list within seconds, which sets
          touchedAchievementApi and skips this whole branch, so neither of these is ever said about a
          game that works.
        */
        const hasTicket = Boolean(String(settings.ticket || '').trim());
        if (caps.supportsTicket && !hasTicket) {
          add(
            'warning',
            'NO_SESSION_TICKET',
            `${flavour.logFile} records no achievement call at all: the game never asked to unlock anything. Titles that only report achievements while signed in to ` +
              `Ubisoft behave exactly like this, because the loader answers with an empty session ticket. Adding one usually unblocks them.`
          );
        } else if (caps.supportsTicket && hasTicket) {
          add(
            'warning',
            'SESSION_TICKET_NO_EFFECT',
            `${flavour.logFile} still records no achievement call although a session ticket is configured: this game asks for nothing for some other reason, and the ` +
              `ticket can be removed if it is unwanted.`
          );
        } else {
          add(
            'info',
            'LOADER_LOG_NO_ACH_CALL',
            `${flavour.logFile} records no achievement call at all, so nothing was missed by this setup: the game did not ask the loader to unlock anything.`
          );
        }
      }
    }
  }

  report.ok = !report.issues.some((i) => i.level === 'error');
  return report;
}

/*
  Repair / auto-configure a Goldberg Uplay R2 setup so unlocks land in GSE Saves\<steamAppid> with real
  Steam api-name keys. cfg: dir (loader folder), steamAppid, schema, prefix, accountName, language.
  Returns { dir, achievementsSchemaJson, ini, wroteSchema, backupDir }.
*/
function repair({ dir, gameDir, steamAppid, schema, prefix, objectiveIds = null, accountName, language, logging, capabilities = null, flavour = null, backup = true, backupDir = null } = {}) {
  if (!dir) throw new Error('repair: dir is required');
  if (steamAppid == null) throw new Error('repair: steamAppid is required');
  if (prefix == null) throw new Error('repair: prefix is required (derive it with derivePrefixedIds first)');
  fs.mkdirSync(dir, { recursive: true });

  // The schema's keys and the ini's redirect must both match what THIS loader build parses, so the
  // capability probe drives them together - a schema keyed one way and an ini written the other is
  // exactly the silent no-op this pair of checks exists to prevent.
  const caps = capabilities || inspectInstalledLoaders(detectEmulator(dir).dll);
  if (!caps.supportsAchievements) throw new Error('repair: no compatible Goldberg Uplay R2 loader found in the target folder');
  if (!caps.architectureValid) throw new Error('repair: loader architecture does not match its filename');
  const achievementsSchemaJson = buildAchievementsSchemaJson(schema, { keyed: caps.supportsAchKeyPrefix, prefix, objectiveIds });
  if (Object.keys(achievementsSchemaJson).length === 0) throw new Error('repair: achievement schema is empty');
  const schemaText = JSON.stringify(achievementsSchemaJson, null, 2);
  const schemaFile = path.join(dir, ACH_SCHEMA_FILE);
  let previousSchema = null;
  try {
    previousSchema = fs.readFileSync(schemaFile, 'utf8');
  } catch {
    /* absent schema is part of the repair plan */
  }
  const schemaChanged = previousSchema !== schemaText;
  // A repair is the moment the folder is being set up anyway, and the only one where the game is
  // reliably not running, so it is where an overgrown log gets cleared.
  pruneLoaderLog(dir, flavour);
  const iniPlan = planSettingsConfig({ dir, steamAppid, prefix, accountName, language, logging, capabilities: caps, flavour: flavour || flavourForDir(dir) });
  const changedFiles = [
    ...(schemaChanged ? [schemaFile] : []),
    ...iniPlan.files.filter((entry) => entry.changed).map((entry) => entry.file),
  ];
  const summary = {
    dir,
    achievementsSchemaJson,
    wroteSchema: false,
    changed: changedFiles.length > 0,
    backupDir: null,
    ini: null,
    loader: caps,
  };

  if (changedFiles.length > 0 && backup) {
    const snapshot = createSetupBackup({ gameDir: gameDir || dir, files: changedFiles, backupDir });
    summary.backupDir = snapshot && snapshot.backupDir;
  } else if (backupDir) {
    summary.backupDir = backupDir;
  }

  if (schemaChanged) {
    writeFileAtomic(schemaFile, schemaText);
    summary.wroteSchema = true;
  }

  summary.ini = applySettingsConfigPlan(iniPlan);
  // The Watchdog needs the id -> api-name direction to notify a live unlock; it cannot always derive it.
  summary.wroteObjectiveMap = saveObjectiveMap({ steamAppid, prefix, objectiveIds });
  summary.removedStaleSave = summary.wroteSchema ? removeStaleRuntimeSave(iniPlan.achSavePath, achievementsSchemaJson) : false;

  return summary;
}

/*
  Every repair() copies the schema and the ini files it is about to overwrite into
  `<gameDir>/.aw-backups/<timestamp>/` first, mirroring the "restore a GBE backup" menu action the
  Steam side already has. Newest first, so the caller can offer "undo the last repair" without
  inspecting the layout.
*/
const BACKUP_DIR_NAME = '.aw-backups';
const BACKUP_MANIFEST = 'uplay-r2-backup.json';

function pathInside(root, target) {
  const relative = path.relative(path.resolve(root), path.resolve(target));
  return relative && !relative.startsWith('..') && !path.isAbsolute(relative) ? relative : '';
}

function uniqueBackupDir(root) {
  let candidate = path.join(root, backupTimestamp());
  let suffix = 2;
  while (fs.existsSync(candidate)) candidate = path.join(root, `${backupTimestamp()}-${suffix++}`);
  return candidate;
}

/*
  Snapshot every file a repair may change, including files that do not exist yet. Recording absence
  is what makes a first-time install reversible: restore removes a loader/schema/ini that AW added
  instead of pretending there was an original file to copy back.
*/
function createSetupBackup({ gameDir, files, backupDir } = {}) {
  if (!gameDir || !fs.existsSync(gameDir)) throw new Error(`backup: game folder not found: ${gameDir}`);
  const root = path.resolve(gameDir);
  const uniqueFiles = [];
  for (const file of files || []) {
    const relative = pathInside(root, file);
    if (!relative) throw new Error(`backup: path is outside the game folder: ${file}`);
    if (!uniqueFiles.some((entry) => entry.relative.toLowerCase() === relative.toLowerCase())) {
      uniqueFiles.push({ file: path.resolve(file), relative });
    }
  }
  if (uniqueFiles.length === 0) return null;

  const target = backupDir ? path.resolve(backupDir) : uniqueBackupDir(path.join(root, BACKUP_DIR_NAME));
  fs.mkdirSync(target, { recursive: true });
  const manifestFile = path.join(target, BACKUP_MANIFEST);
  let manifest = { format: 2, type: 'uplay-r2', gameDir: root, createdAt: new Date().toISOString(), files: [] };
  if (fs.existsSync(manifestFile)) {
    manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
    if (manifest.type !== 'uplay-r2' || !Array.isArray(manifest.files)) throw new Error('backup: invalid Uplay R2 backup manifest');
    if (path.resolve(manifest.gameDir) !== root) throw new Error('backup: manifest belongs to another game folder');
  }

  for (const entry of uniqueFiles) {
    const portable = entry.relative.split(path.sep).join('/');
    if (manifest.files.some((existing) => String(existing.path).toLowerCase() === portable.toLowerCase())) continue;
    const existed = fs.existsSync(entry.file) && fs.statSync(entry.file).isFile();
    manifest.files.push({ path: portable, existed });
    if (existed) {
      const destination = path.join(target, 'files', entry.relative);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.copyFileSync(entry.file, destination);
    }
  }
  writeFileAtomic(manifestFile, JSON.stringify(manifest, null, 2));
  return { backupDir: target, manifest, files: manifest.files.map((entry) => entry.path) };
}

function listConfigBackups(dir) {
  if (!dir) return [];
  const gameDir = path.resolve(dir);
  const roots = [path.join(gameDir, BACKUP_DIR_NAME)];
  for (const loader of detectEmulator(gameDir).dll) {
    const legacyRoot = path.join(path.dirname(loader), BACKUP_DIR_NAME);
    if (!roots.some((root) => path.resolve(root).toLowerCase() === path.resolve(legacyRoot).toLowerCase())) roots.push(legacyRoot);
  }
  const backups = [];
  for (const root of roots) {
    let entries = [];
    try {
      entries = fs.readdirSync(root, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries.filter((item) => item.isDirectory())) {
      const full = path.join(root, entry.name);
      let files = [];
      let createdAt = null;
      let manifest = null;
      try {
        const manifestFile = path.join(full, BACKUP_MANIFEST);
        if (fs.existsSync(manifestFile)) {
          manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
          if (manifest.type !== 'uplay-r2' || !Array.isArray(manifest.files)) continue;
          files = manifest.files.map((file) => file.path);
          createdAt = manifest.createdAt ? new Date(manifest.createdAt) : fs.statSync(full).mtime;
        } else {
          files = fs.readdirSync(full).filter((name) => name === ACH_SCHEMA_FILE || ALL_INI_NAMES.includes(name));
          createdAt = fs.statSync(full).mtime;
        }
      } catch {
        /* unreadable snapshot - reported with no files so the caller can skip it */
      }
      if (files.length > 0) backups.push({ name: entry.name, dir: full, files, createdAt, manifest });
    }
  }
  return backups
    .filter((backup) => backup.files.length > 0)
    .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
}

// Restore a manifest snapshot exactly. Legacy config-only snapshots remain readable.
function restoreConfigBackup({ dir, backup } = {}) {
  if (!dir) throw new Error('restoreConfigBackup: dir is required');
  const snapshot = backup || listConfigBackups(dir)[0];
  if (!snapshot) throw new Error('restoreConfigBackup: no backup available');
  const restored = [];
  const removed = [];
  if (snapshot.manifest) {
    const targetRoot = path.resolve(dir);
    for (const entry of snapshot.manifest.files) {
      const relative = String(entry.path || '').split('/').join(path.sep);
      const destination = path.resolve(targetRoot, relative);
      if (!pathInside(targetRoot, destination)) throw new Error(`restore: manifest path is outside the game folder: ${entry.path}`);
      if (entry.existed) {
        const source = path.join(snapshot.dir, 'files', relative);
        if (!fs.existsSync(source)) throw new Error(`restore: backup file is missing: ${entry.path}`);
        writeFileAtomic(destination, fs.readFileSync(source));
        restored.push(entry.path);
      } else if (fs.existsSync(destination)) {
        fs.unlinkSync(destination);
        removed.push(entry.path);
      }
    }
    return { dir: targetRoot, backup: snapshot.name, restored, removed };
  }
  for (const name of snapshot.files) {
    writeFileAtomic(path.join(dir, name), fs.readFileSync(path.join(snapshot.dir, name)));
    restored.push(name);
  }
  return { dir, backup: snapshot.name, restored, removed };
}

module.exports = {
  BACKUP_DIR_NAME,
  BACKUP_MANIFEST,
  createSetupBackup,
  listConfigBackups,
  restoreConfigBackup,
  EMU_DLL_NAMES,
  INI_NAMES,
  ALL_INI_NAMES,
  UPLAY_INSTALL_MARKERS,
  UPLAY_SAVE_ROOT_NAME: FLAVOURS.r2.saveRoot,
  FLAVOURS,
  FLAVOUR_LIST,
  flavourForDll,
  flavourForIni,
  flavourForDir,
  resolveFlavour,
  ACH_SAVE_FILE,
  ACH_SCHEMA_FILE,
  MAPPING_OVERRIDES_FILE,
  setUserDataPath,
  mappingOverridesFile,
  objectiveMapFile,
  saveObjectiveMap,
  OBJECTIVE_MAP_FILE,
  PRODUCT_MAPPINGS_FILE,
  findProductMapping,
  saveProductMapping,
  readProductMappings,
  noteUnresolvedProduct,
  takeUnresolvedProducts,
  resolvedSteamMapping,
  getSteamMappingOverride,
  findSteamMappingOverride,
  saveSteamMappingOverride,
  clearSteamMappingOverride,
  findSteamAppidHints,
  detectEmulator,
  inspectLoader,
  inspectInstalledLoaders,
  hasEmulatorEvidence,
  looksLikeUplayInstall,
  readInstalledProductId,
  activeIniFile,
  readIniSettings,
  readLoaderLog,
  resolveAchievementSaveDirs,
  readAchievementSave,
  mapSaveToSchemaKeys,
  isUbisoftInstall,
  isUbisoftGame,
  isUplayR2Game,
  resolveGameIdentity,
  getGameToolPaths,
  resolveSteamMapping,
  canonicalObjectiveKey,
  normalizeObjectiveTitle,
  readUbisoftObjectives,
  derivePrefixedIds,
  resolveObjectiveKeying,
  buildAchievementsSchemaJson,
  normalizeLoaderLanguage,
  planSettingsConfig,
  applySettingsConfigPlan,
  writeSettingsConfig,
  pruneLoaderLog,
  MAX_LOADER_LOG_BYTES,
  setSessionTicket,
  hasSessionTicket,
  SESSION_TICKET,
  removeStaleRuntimeSave,
  diagnose,
  repair,
};
