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

const EMU_DLL_NAMES = ['uplay_r2_loader.dll', 'uplay_r2_loader64.dll', 'upc_r2_loader.dll', 'upc_r2_loader64.dll'];
// Config precedence, NOT alphabetical: the loader looks for "\upc_r2.ini" first and only falls back
// to "\uplay_r2.ini" (verified in the binary's string table - the two literals appear in that order
// in the config-open path). A game that ships both therefore runs on upc_r2.ini, so that is the file
// diagnose() must read and the one repair() must get right.
const INI_NAMES = ['upc_r2.ini', 'uplay_r2.ini'];
const UPLAY_INSTALL_MARKERS = ['uplay_install.manifest', 'uplay_install.state', 'upc.cfg', ...INI_NAMES];
// Emulator default save root for SaveType=0, and the in-game-folder subfolder used by SaveType=1.
const UPLAY_SAVE_ROOT_NAME = 'Goldberg UplayEmu Saves';
const UPLAY_GAME_SAVE_SUBDIR = 'saves';
// The unlock-state file the emulator writes inside whichever save dir it resolved, and the schema it
// reads next to the ini. Both names are hardcoded in every known loader build.
const ACH_SAVE_FILE = 'achievements.json';
const ACH_SCHEMA_FILE = 'achievements_schema.json';
const MAPPING_OVERRIDES_FILE = 'uplay-r2-mappings.json';
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

// The integrated loader's shipped default (captured from a real release) - used as the starting
// document when a game has no ini yet, so repair() produces a fully faithful file (comments
// included), the same spirit as GBE Fork's steam_settings.EXAMPLE in goldberg.js.
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
    architectureValid: known.length > 0 && known.every((l) => l.arch && l.expectedArch === l.arch),
  };
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
    for (const iniName of INI_NAMES) {
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

// The ini the loader will actually read: first existing name in INI_NAMES precedence order.
function activeIniFile(dir) {
  if (!dir) return '';
  const files = INI_NAMES.map((name) => path.join(dir, name));
  return files.find((file) => fs.existsSync(file)) || '';
}

// [Settings] of an ini file as a lower-cased key/value object ({} when absent/unreadable).
function readIniSettings(file) {
  if (!file) return {};
  try {
    return readIniSectionValues(parseIni(fs.readFileSync(file, 'utf8')), 'settings');
  } catch {
    return {};
  }
}

function uplayDefaultSaveRoot() {
  const appdata = process.env['APPDATA'];
  return appdata ? path.join(appdata, UPLAY_SAVE_ROOT_NAME) : '';
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
  const settings = readIniSettings(iniFile || activeIniFile(dir));
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

  // Unconditional fallbacks: the two built-in defaults, plus the GSE folder AW's own repair redirects
  // to, so a game configured by an older AW build (or by a community script) still reads back.
  if (id) {
    const root = uplayDefaultSaveRoot();
    if (root) add(path.join(root, id));
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
  "<prefix><objectiveId>", so the translation is exact: try as-is, then prefixed, then trailing digits.
  Unresolvable entries are dropped.
*/
function mapSaveToSchemaKeys(entries, { prefix = '', apiNames = [] } = {}) {
  const out = {};
  if (!entries || typeof entries !== 'object') return out;

  const byName = new Map();
  const byDigits = new Map();
  for (const name of apiNames) {
    const value = String(name == null ? '' : name);
    if (!value) continue;
    byName.set(value.toUpperCase(), value);
    const digits = value.match(/(\d+)$/);
    if (digits && !byDigits.has(digits[1])) byDigits.set(digits[1], value);
  }

  for (const [rawKey, entry] of Object.entries(entries)) {
    const key = String(rawKey);
    const candidates = [key, `${prefix}${key}`];
    let resolved = candidates.map((c) => byName.get(c.toUpperCase())).find(Boolean);
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
  const configFiles = runtimeDir ? INI_NAMES.map((name) => path.join(runtimeDir, name)) : [];
  const configFile = configFiles.find((file) => fs.existsSync(file)) || configFiles[0] || '';

  return {
    ...identity,
    gameDir,
    runtimeDir,
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

let _uplaySteamMap = null;
function loadUplaySteamMap() {
  if (_uplaySteamMap) return _uplaySteamMap;
  try {
    _uplaySteamMap = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'assets', 'uplay-steam.json'), 'utf8'));
  } catch {
    _uplaySteamMap = [];
  }
  return _uplaySteamMap;
}

function mappingResult(hit) {
  return hit ? { uplay_id: String(hit.uplay_id), steam_appid: hit.steam_appid, steam_name: hit.steam_name } : null;
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
  }

  if (map.length === 0) return null;

  const installStateHit = resolveMappingFromInstallState(gameDir, map);
  if (installStateHit) return installStateHit;

  if (name && String(name).trim()) {
    const apps = map.map((e) => ({ appid: e.steam_appid, name: e.uplay_name }));
    const steamAppid = fuzzyAppid.bestConfidentAppid(name, apps);
    if (steamAppid != null) {
      const hit = map.find((e) => e.steam_appid === steamAppid);
      if (hit) return mappingResult(hit);
    }
  }

  return null;
}

// Given the Steam schema's achievement list ([{name, ...}]), verify every api-name ends in
// "<one shared prefix><digits>" - the convention the Ubisoft objective id is embedded in for many
// Ubisoft-published Steam ports. Returns { prefix, count } when the whole list agrees, else null
// (this game isn't auto-supported; diagnose() surfaces that instead of writing a broken schema).
function derivePrefixedIds(achievementList) {
  const list = Array.isArray(achievementList) ? achievementList : [];
  if (list.length === 0) return null;

  let prefix = null;
  for (const a of list) {
    const nm = a && a.name != null ? String(a.name) : '';
    const m = nm.match(/^(.*?)(\d+)$/);
    if (!m) return null;
    if (prefix === null) prefix = m[1];
    else if (prefix !== m[1]) return null;
  }
  return { prefix: prefix || '', count: list.length };
}

/*
  Build the Uplay R2 achievements_schema.json from the AW schema. keyed:true → real Steam api-names (loader
  with AchKeyPrefix); keyed:false → bare objective ids (older loader that would otherwise never match).
*/
function buildAchievementsSchemaJson(schema, { keyed = true } = {}) {
  const list = (schema && schema.achievement && Array.isArray(schema.achievement.list) && schema.achievement.list) || [];
  const out = {};
  for (const a of list) {
    if (!a || a.name == null) continue;
    const name = String(a.name);
    const digits = name.match(/(\d+)$/);
    const key = keyed || !digits ? name : digits[1];
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
  Read-modify-write BOTH upc_r2.ini and uplay_r2.ini beside the loader dll, preserving every other key
  (UserId in particular) and section. Only keys the installed loader parses are written: redirect keys
  are left out on builds without support, or the ini would look configured while saves stay elsewhere.
*/
function planSettingsConfig({ dir, steamAppid, prefix, accountName, language, logging, capabilities } = {}) {
  if (!dir) throw new Error('writeSettingsConfig: dir is required');
  if (steamAppid == null) throw new Error('writeSettingsConfig: steamAppid is required');

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

  const written = [];
  for (const iniName of INI_NAMES) {
    const file = path.join(dir, iniName);
    const previous = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : DEFAULT_INI_TEMPLATE;
    const doc = parseIni(previous);
    let settings = getIniSection(doc, 'settings');
    if (!settings) {
      settings = { key: 'settings', header: '[Settings]', body: [] };
      doc.sections.unshift(settings);
    }
    settings.body = upsertIniKeys(settings.body, updates);
    const next = stringifyIni(doc);
    const changed = previous !== next;
    written.push({ file, previous, next, changed });
  }
  return {
    files: written,
    achSavePath: updates.AchSavePath || '',
    achKeyPrefix: caps.supportsAchKeyPrefix ? updates.AchKeyPrefix : '',
    supportsAchRedirect: caps.supportsAchRedirect,
    supportsAchKeyPrefix: caps.supportsAchKeyPrefix,
  };
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
  Diagnose a Ubisoft game's Goldberg Uplay R2 setup.

  cfg: { gameDir, appid, name }
  Returns a structured report; report.issues is an array of { level, code, message }, same shape as
  goldberg.diagnose so app.js's dialog-building code can be reused.
*/
function diagnose({ gameDir, appid, name, loaderPaths = null, mapping: suppliedMapping = null } = {}) {
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

  const caps = inspectInstalledLoaders(emu.dll);
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

  const schemaFile = path.join(dir, ACH_SCHEMA_FILE);
  if (!fs.existsSync(schemaFile)) {
    add('error', 'NO_SCHEMA_JSON', `${ACH_SCHEMA_FILE} is missing - run "Apply emulator fix (Uplay R2)" to generate it. A game update re-extracting the repack removes it.`);
  } else {
    try {
      const parsedSchema = JSON.parse(fs.readFileSync(schemaFile, 'utf8'));
      // The schema's key shape has to agree with the loader: prefixed api-names on builds that parse
      // AchKeyPrefix, bare objective ids on the ones that don't. A mismatch means every in-game unlock
      // looks up a key that isn't there, and nothing is ever recorded.
      const keys = Object.keys(parsedSchema || {});
      if (keys.length > 0) {
        const bareIds = keys.every((k) => /^\d+$/.test(k));
        if (caps.supportsAchKeyPrefix && bareIds) {
          add('warning', 'SCHEMA_KEYS_UNPREFIXED', `${ACH_SCHEMA_FILE} uses bare objective ids but this loader expects AchKeyPrefix keys - re-apply the fix.`);
        } else if (!caps.supportsAchKeyPrefix && !bareIds) {
          add('warning', 'SCHEMA_KEYS_PREFIXED', `${ACH_SCHEMA_FILE} uses prefixed keys but this loader only understands bare objective ids - re-apply the fix.`);
        }
      }
    } catch (e) {
      add('error', 'BAD_SCHEMA_JSON', `${ACH_SCHEMA_FILE} is not valid JSON: ${e.message}`);
    }
  }

  const iniFile = activeIniFile(dir);
  const expectedSavePath = defaultSavePath(mapping.steam_appid);
  report.iniFile = iniFile;
  if (!iniFile) {
    add('warning', 'NO_INI', `No ${INI_NAMES.join('/')} found beside the loader dll.`);
  } else {
    const settings = readIniSettings(iniFile);
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

  report.ok = !report.issues.some((i) => i.level === 'error');
  return report;
}

/*
  Repair / auto-configure a Goldberg Uplay R2 setup so unlocks land in GSE Saves\<steamAppid> with real
  Steam api-name keys. cfg: dir (loader folder), steamAppid, schema, prefix, accountName, language.
  Returns { dir, achievementsSchemaJson, ini, wroteSchema, backupDir }.
*/
function repair({ dir, gameDir, steamAppid, schema, prefix, accountName, language, logging, capabilities = null, backup = true, backupDir = null } = {}) {
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
  const achievementsSchemaJson = buildAchievementsSchemaJson(schema, { keyed: caps.supportsAchKeyPrefix });
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
  const iniPlan = planSettingsConfig({ dir, steamAppid, prefix, accountName, language, logging, capabilities: caps });
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

  return summary;
}

/*
  Every repair() copies the schema and the ini files it is about to overwrite into
  `<gameDir>/.aw-backups/<timestamp>/` first. Those snapshots were write-only until now: the Steam
  side has had "restore a GBE backup" in its right-click menu from the start, while the Ubisoft side
  could apply a fix with no way back short of editing the game folder by hand.

  Newest first, so the caller can offer "undo the last repair" without inspecting the layout.
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
          files = fs.readdirSync(full).filter((name) => name === ACH_SCHEMA_FILE || INI_NAMES.includes(name));
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
  UPLAY_INSTALL_MARKERS,
  UPLAY_SAVE_ROOT_NAME,
  ACH_SAVE_FILE,
  ACH_SCHEMA_FILE,
  MAPPING_OVERRIDES_FILE,
  setUserDataPath,
  mappingOverridesFile,
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
  activeIniFile,
  readIniSettings,
  resolveAchievementSaveDirs,
  readAchievementSave,
  mapSaveToSchemaKeys,
  isUbisoftInstall,
  isUbisoftGame,
  isUplayR2Game,
  resolveGameIdentity,
  getGameToolPaths,
  resolveSteamMapping,
  derivePrefixedIds,
  buildAchievementsSchemaJson,
  normalizeLoaderLanguage,
  planSettingsConfig,
  applySettingsConfigPlan,
  writeSettingsConfig,
  diagnose,
  repair,
};
