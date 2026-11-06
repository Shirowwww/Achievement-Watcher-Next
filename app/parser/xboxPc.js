'use strict';

/*
  Xbox PC support: OAuth → XSTS session stored in cfg/xbox-auth.json, then "Import Xbox PC library"
  lists local installs + title history and caches achievements under steam_cache/xbox/<titleId>/.
  Live polling of running titles is not part of this first port; a refresh/import re-syncs state.
*/

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { mapLimit } = require('../util/onboardingDetect.js');
// Session, API, snapshot and cache-file pieces shared with the Watchdog's live polling.
const {
  XBOX_PC_CLIENT_ID,
  XBOX_PC_OAUTH_SCOPE,
  XBOX_ACHIEVEMENTS_URL,
  setUserDataPath,
  getUserDataPath,
  firstNonEmpty,
  normalizeTitleId,
  normalizeXuid,
  schemaCacheFile,
  stateCacheFile,
  readJson,
  writeJson,
  exchangeLiveTokenForXboxSession,
  saveAuth,
  loadAuth,
  clearAuth,
  ensureXboxDirectSession,
  xboxServiceGetAll,
  fetchXboxTitleAchievements,
  normalizeXboxAchievement,
  buildXboxStateSnapshot,
  mergeXboxStateSnapshots,
} = require('./xboxPcCore.js');
const { SOURCE_LABEL } = require('../util/sourceIdentity.js');

const XBOX_PC_SOURCE = SOURCE_LABEL.XBOX_PC;
const XBOX_PC_REDIRECT_URI = 'http://localhost:8080/auth/callback';
const XBOX_TITLEHUB_URL = 'https://titlehub.xboxlive.com';
const IMPORT_CONCURRENCY = 4;
const XBOX_SCHEMA_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const XBOX_SCHEMA_LANGUAGE_LOCALES = Object.freeze({
  arabic: 'ar-SA',
  schinese: 'zh-CN',
  tchinese: 'zh-TW',
  czech: 'cs-CZ',
  danish: 'da-DK',
  dutch: 'nl-NL',
  english: 'en-US',
  finnish: 'fi-FI',
  french: 'fr-FR',
  german: 'de-DE',
  greek: 'el-GR',
  hungarian: 'hu-HU',
  indonesian: 'id-ID',
  italian: 'it-IT',
  japanese: 'ja-JP',
  koreana: 'ko-KR',
  norwegian: 'nb-NO',
  polish: 'pl-PL',
  portuguese: 'pt-PT',
  brazilian: 'pt-BR',
  romanian: 'ro-RO',
  russian: 'ru-RU',
  slovak: 'sk-SK',
  spanish: 'es-ES',
  latam: 'es-MX',
  swedish: 'sv-SE',
  thai: 'th-TH',
  turkish: 'tr-TR',
  ukrainian: 'uk-UA',
  vietnamese: 'vi-VN',
});

function normalizeXboxClientId(value) {
  const raw = String(value || '').trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw) ? raw : '';
}

function buildXboxDirectAuthorizeUrl(clientId, state = '') {
  const normalized = normalizeXboxClientId(clientId || XBOX_PC_CLIENT_ID);
  if (!normalized) throw new Error('xbox-pc-client-id-invalid');
  const { live } = require('@xboxreplay/xboxlive-auth');
  const url = new URL(live.getAuthorizeUrl(normalized, XBOX_PC_OAUTH_SCOPE, 'code', XBOX_PC_REDIRECT_URI));
  if (state) url.searchParams.set('state', String(state));
  return url.toString();
}

function extractXboxDirectAuthResult(rawUrl, expectedState = '') {
  let url;
  try {
    url = new URL(String(rawUrl || ''));
  } catch {
    return null;
  }
  const expectedRedirect = new URL(XBOX_PC_REDIRECT_URI);
  if (url.origin !== expectedRedirect.origin) return null;
  // Microsoft may hand back the callback with or without a trailing slash; compare pathnames
  // without it so both `…/auth/callback` and `…/auth/callback/` are recognized.
  const normalizePath = (value) => String(value || '/').toLowerCase().replace(/\/+$/, '') || '/';
  if (normalizePath(url.pathname) !== normalizePath(expectedRedirect.pathname)) return null;
  const fragment = new URLSearchParams(url.hash.replace(/^#/, ''));
  const getParameter = (name) => fragment.get(name) || url.searchParams.get(name) || '';
  const state = getParameter('state');
  if (expectedState && state !== expectedState) return { error: 'xbox-pc-oauth-state-mismatch' };
  const error = getParameter('error');
  if (error) return { error: getParameter('error_description') || error || 'xbox-pc-oauth-failed' };
  const code = getParameter('code');
  return code ? { code } : null;
}

async function completeXboxDirectAuthentication(authResult) {
  const clientId = normalizeXboxClientId(XBOX_PC_CLIENT_ID);
  if (!clientId) throw new Error('xbox-pc-client-id-invalid');
  const { live } = require('@xboxreplay/xboxlive-auth');
  let liveTokens = authResult?.tokens || null;
  if (!liveTokens && authResult?.code) {
    liveTokens = await live.exchangeCodeForAccessToken(String(authResult.code), clientId, XBOX_PC_OAUTH_SCOPE, XBOX_PC_REDIRECT_URI);
  }
  if (!liveTokens) throw new Error('xbox-pc-oauth-result-invalid');
  const auth = await exchangeLiveTokenForXboxSession(liveTokens, clientId);
  saveAuth(auth);
  return auth;
}

async function fetchXboxTitleHistory(options = {}) {
  const auth = options.auth || (await ensureXboxDirectSession(options));
  try {
    return await xboxServiceGetAll(
      XBOX_TITLEHUB_URL,
      `users/xuid(${auth.xuid})/titles/titleHistory/decoration/GamePass,TitleHistory,Achievement,Stats,Image?maxItems=1000`,
      ['titles', 'titleHistory', 'items'],
      { ...options, auth }
    );
  } catch {
    return xboxServiceGetAll(
      XBOX_ACHIEVEMENTS_URL,
      `users/xuid(${auth.xuid})/history/titles?maxItems=1000`,
      ['titles', 'titleHistory', 'items'],
      { ...options, auth }
    );
  }
}

function parseMicrosoftGameConfig(configPath) {
  const xml = fs.readFileSync(configPath, 'utf8');
  const pick = (names) => {
    for (const name of names) {
      const m = new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, 'i').exec(xml);
      if (m) return m[1].trim();
    }
    return '';
  };
  const titleIdAttr = /titleid\s*=\s*"((?:0x)?[0-9A-Fa-f]{1,16})"/i.exec(xml)?.[1] || '';
  const titleIdTag = /<titleid[^>]*>((?:0x)?[0-9A-Fa-f]{1,16})<\/titleid>/i.exec(xml)?.[1] || '';
  const titleIdHex = titleIdAttr || titleIdTag;
  const packageFamilyName = pick(['PackageFamilyName', 'packageFamilyName']);
  const applicationId = pick(['AppId', 'appId']);
  const executable = pick(['executable', 'Executable']);
  return {
    titleId: titleIdHex ? normalizeTitleId(titleIdHex) : '',
    title: firstNonEmpty(pick(['name', 'Name']), path.basename(path.dirname(configPath))),
    installLocation: path.dirname(configPath),
    executable,
    packageFamilyName,
    applicationId,
    aumid: packageFamilyName && applicationId ? `${packageFamilyName}!${applicationId}` : '',
    processName: executable ? path.basename(executable) : '',
  };
}

function parseGamingRootMarker(markerPath) {
  try {
    const bytes = fs.readFileSync(markerPath);
    if (bytes.length <= 8 || bytes.subarray(0, 4).toString('ascii') !== 'RGBX') return '';
    const relativePath = bytes.subarray(8).toString('utf16le').replace(/\0+$/g, '').trim();
    if (!relativePath) return '';
    const driveRoot = path.parse(path.resolve(markerPath)).root;
    const resolved = path.resolve(driveRoot, relativePath);
    if (!driveRoot || path.parse(resolved).root.toLowerCase() !== driveRoot.toLowerCase()) return '';
    return resolved;
  } catch {
    return '';
  }
}

function listXboxGamesRoots() {
  const roots = [];
  const seen = new Set();
  const addRoot = (candidate) => {
    const resolved = String(candidate || '').trim();
    if (!resolved || !fs.existsSync(resolved)) return;
    const key = path.resolve(resolved).toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    roots.push(resolved);
  };
  for (let code = 65; code <= 90; code += 1) {
    const drive = `${String.fromCharCode(code)}:\\`;
    try {
      addRoot(path.join(drive, 'XboxGames'));
      addRoot(parseGamingRootMarker(path.join(drive, '.GamingRoot')));
    } catch {}
  }
  return roots;
}

function findMicrosoftGameConfigs(root, maxDepth = 4) {
  const found = [];
  const walk = (current, depth) => {
    if (depth > maxDepth) return;
    let entries = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isFile() && entry.name.toLowerCase() === 'microsoftgame.config') {
        found.push(fullPath);
      } else if (entry.isDirectory()) {
        walk(fullPath, depth + 1);
      }
    }
  };
  walk(root, 0);
  return found;
}

function execFileJson(file, args, options = {}) {
  return new Promise((resolve) => {
    execFile(
      file,
      args,
      { windowsHide: true, timeout: Number(options.timeoutMs) || 30000, maxBuffer: 16 * 1024 * 1024 },
      (error, stdout) => {
        if (error || !String(stdout || '').trim()) return resolve([]);
        try {
          const parsed = JSON.parse(stdout);
          resolve(Array.isArray(parsed) ? parsed : parsed ? [parsed] : []);
        } catch {
          resolve([]);
        }
      }
    );
  });
}

async function listPackagedGameConfigPaths() {
  if (process.platform !== 'win32') return [];
  const command =
    "Get-AppxPackage | Where-Object { $_.InstallLocation } | " +
    "ForEach-Object { $p = Join-Path $_.InstallLocation 'MicrosoftGame.config'; " +
    "if (Test-Path -LiteralPath $p) { [pscustomobject]@{ Path=$p; PackageFamilyName=$_.PackageFamilyName } } } | " +
    'ConvertTo-Json -Compress';
  return execFileJson('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { timeoutMs: 30000 });
}

async function discoverXboxPcInstallations(options = {}) {
  const candidates = new Map();
  for (const root of listXboxGamesRoots()) {
    for (const configPath of findMicrosoftGameConfigs(root, 4)) {
      candidates.set(configPath.toLowerCase(), { path: configPath, packageFamilyName: '' });
    }
  }
  if (!options.skipAppx) {
    for (const entry of await listPackagedGameConfigPaths()) {
      const configPath = String(entry?.Path || '').trim();
      if (configPath) candidates.set(configPath.toLowerCase(), { path: configPath, packageFamilyName: String(entry?.PackageFamilyName || '').trim() });
    }
  }

  const byTitleId = new Map();
  const withoutTitleId = [];
  for (const candidate of candidates.values()) {
    try {
      const parsed = parseMicrosoftGameConfig(candidate.path);
      if (!parsed.packageFamilyName && candidate.packageFamilyName) {
        parsed.packageFamilyName = candidate.packageFamilyName;
        if (parsed.applicationId) parsed.aumid = `${candidate.packageFamilyName}!${parsed.applicationId}`;
      }
      if (!parsed.titleId) {
        withoutTitleId.push(parsed);
        continue;
      }
      if (!byTitleId.has(parsed.titleId)) byTitleId.set(parsed.titleId, parsed);
    } catch {}
  }
  return [...byTitleId.values(), ...withoutTitleId];
}

function normalizeDeviceNames(title = {}) {
  const devices = [
    ...(Array.isArray(title?.devices) ? title.devices : []),
    ...(Array.isArray(title?.deviceTypes) ? title.deviceTypes : []),
    title?.deviceType,
    title?.platform,
  ];
  return devices
    .map((entry) =>
      String(typeof entry === 'object' ? entry?.name || entry?.type || entry?.deviceType : entry || '')
        .trim()
        .toLowerCase()
    )
    .filter(Boolean);
}

// What the title history says the account has unlocked there, or could. The decoration fills only
// one of the two counters for some titles, so the larger of them is what "has achievements" means.
function xboxTitleAchievementCount(title = {}) {
  const achievement = title?.achievement || {};
  return Math.max(
    Number(achievement.currentAchievements) || 0,
    Number(achievement.totalAchievements) || 0,
    Number(title?.earnedAchievements) || 0,
    Number(title?.maxAchievements) || 0
  );
}

function isWindowsPcTitle(title, installedTitleIds = new Set()) {
  const titleId = normalizeTitleId(title?.titleId ?? title?.id);
  const devices = normalizeDeviceNames(title);
  if (titleId && installedTitleIds.has(titleId)) return true;
  /*
    Win32 is what the Xbox app records for every PC game it has ever seen running, Steam and Epic
    copies included, and almost none of those carry Xbox achievements. Dropping the whole device
    class also dropped the few that do, so keep a Win32 title exactly when the history credits it
    with achievements.
  */
  if (devices.some((device) => device === 'win32')) return xboxTitleAchievementCount(title) > 0;
  return devices.some((device) => /(?:^|[^a-z])(pc|windows|windowsonecore)(?:$|[^a-z])/.test(device));
}

function xboxLocaleForLang(lang) {
  return XBOX_SCHEMA_LANGUAGE_LOCALES[String(lang || '').toLowerCase()] || 'en-US';
}

async function fetchXboxLocalizedTitleAchievements(xuid, titleId, lang, options = {}) {
  const locale = xboxLocaleForLang(lang);
  const achievements = await fetchXboxTitleAchievements(xuid, titleId, { ...options, locale });
  const rows = [];
  for (const raw of achievements) {
    const achievement = normalizeXboxAchievement(raw);
    if (achievement) rows.push(achievement);
  }
  return { achievements: rows, languages: [locale] };
}

/*
  Xbox hands its store artwork out over plain http, and the window's img-src allows 'self', data:
  and https only - left as it comes back, every Xbox tile and header is blocked and the game shows
  up with no picture at all. The same host serves the same file over https.
*/
function secureImageUrl(value) {
  const url = String(value || '').trim();
  return url.startsWith('http://') ? `https://${url.slice('http://'.length)}` : url;
}

/*
  Xbox answers for the same title with two different records - the store one, which carries the
  artwork, and a bare desktop one that carries none - and which of them the history returns varies
  between calls. A re-import must not blank a tile that already had a picture, so an empty field
  keeps what the cache already holds.
*/
function mergeXboxArtwork(previous = {}, fresh = {}) {
  const merged = {};
  for (const key of ['header', 'portrait', 'icon', 'background']) {
    merged[key] = String(fresh?.[key] || '').trim() || secureImageUrl(previous?.[key]);
  }
  return merged;
}

function resolveXboxTitleArtwork(title = {}) {
  const images = Array.isArray(title?.images) ? title.images : [];
  const find = (types) => {
    for (const type of types) {
      const match = images.find(
        (image) =>
          String(image?.type || '').toLowerCase() === type.toLowerCase() && /^https?:\/\//i.test(String(image?.url || ''))
      );
      if (match) return secureImageUrl(match.url);
    }
    return '';
  };
  const displayImage = secureImageUrl(
    firstNonEmpty(title?.displayImage, title?.image, title?.titleImage, title?.titleImageUrl)
  );
  const coverUrl = find(['Poster', 'BoxArt', 'BrandedKeyArt', 'FeaturePromotionalSquareArt']) || displayImage;
  const headerUrl = find(['TitledHeroArt', 'SuperHeroArt', 'BrandedKeyArt', 'Hero']) || displayImage || coverUrl;
  return { coverUrl, headerUrl };
}

/*
  What the title history says about a title's state, so an import can skip a title that has not
  moved: unlocks, gamerscore, last play and the schema language. Empty when the history carries no
  achievement counters (a locally found title, the bare fallback history): that title is always fetched.
*/
function xboxTitleMarker(title, lang) {
  const achievement = title?.achievement;
  if (!achievement || !Number.isFinite(Number(achievement.currentAchievements))) return '';
  const played = title?.titleHistory?.lastTimePlayed ?? title?.lastTimePlayed ?? '';
  const parts = [achievement.currentAchievements, achievement.totalAchievements, achievement.currentGamerscore, played, xboxLocaleForLang(lang)];
  return parts.map((part) => String(part ?? '')).join('|');
}

// Rarity moves without any unlock, so a saved title is also fetched again once a week.
function isXboxTitleUnchanged(titleId, marker) {
  if (!marker) return false;
  const schema = readJson(schemaCacheFile(titleId));
  if (!schema?.achievement?.list || schema.meta?.marker !== marker) return false;
  if (Date.now() - Number(schema.meta.fetchedAt || 0) >= XBOX_SCHEMA_MAX_AGE_MS) return false;
  return readJson(stateCacheFile(titleId)) !== null;
}

async function importLibrary(options = {}) {
  const lang = String(options.lang || 'english').trim() || 'english';
  const auth = await ensureXboxDirectSession(options);
  const account = { xuid: auth.xuid, gamertag: auth.gamertag };

  const installations = await discoverXboxPcInstallations();
  const installedByTitleId = new Map(installations.filter((e) => e.titleId).map((e) => [e.titleId, e]));
  const installedTitleIds = new Set(installedByTitleId.keys());
  const history = await fetchXboxTitleHistory({ ...options, auth });
  const pcTitles = new Map();
  for (const title of history) {
    if (!isWindowsPcTitle(title, installedTitleIds)) continue;
    const titleId = normalizeTitleId(title?.titleId ?? title?.id);
    if (titleId) pcTitles.set(titleId, title);
  }
  for (const installation of installations) {
    if (!installation.titleId || pcTitles.has(installation.titleId)) continue;
    pcTitles.set(installation.titleId, {
      titleId: installation.titleId,
      name: installation.title,
      devices: ['PC'],
      discoveredLocally: true,
    });
  }

  const result = {
    provider: 'Microsoft / Xbox Network',
    account,
    installedDetected: installations.length,
    historyTotal: history.length,
    pcTitles: pcTitles.size,
    created: 0,
    updated: 0,
    unchanged: 0,
    skipped: 0,
    failed: 0,
  };
  const titles = [...pcTitles.values()];
  const marks = new Map(titles.map((title) => [title, xboxTitleMarker(title, lang)]));
  let started = 0;
  await mapLimit(titles, IMPORT_CONCURRENCY, async (title) => {
    started += 1;
    const titleId = normalizeTitleId(title?.titleId ?? title?.id);
    const titleName = firstNonEmpty(title?.name, title?.titleName, title?.displayName, `Xbox ${titleId}`);
    options.onProgress?.({
      current: started,
      total: titles.length,
      percent: Math.round((started / Math.max(1, titles.length)) * 100),
      detail: titleName,
      appid: titleId,
    });
    if (!titleId) {
      result.skipped += 1;
      return;
    }
    try {
      const marker = marks.get(title);
      if (!options.force && isXboxTitleUnchanged(titleId, marker)) {
        result.unchanged += 1;
        return;
      }
      const localized = await fetchXboxLocalizedTitleAchievements(account.xuid, titleId, lang, { ...options, auth });
      if (!localized.achievements.length) {
        result.skipped += 1;
        return;
      }
      const artwork = resolveXboxTitleArtwork(title);
      const schema = {
        titleId,
        name: titleName,
        source: XBOX_PC_SOURCE,
        meta: { marker, fetchedAt: Date.now() },
        img: {
          header: artwork.headerUrl || '',
          portrait: artwork.coverUrl || '',
          icon: artwork.coverUrl || '',
          background: artwork.headerUrl || '',
        },
        achievement: {
          total: localized.achievements.length,
          list: localized.achievements.map((a) => ({
            name: a.id,
            displayName: a.displayName,
            description: a.description,
            hidden: a.hidden ? 1 : 0,
            icon: a.icon || '',
            icongray: a.icon || '',
            rarityPct: a.rarity,
            points: a.gamerscore || undefined,
          })),
        },
      };
      const previous = readJson(schemaCacheFile(titleId));
      const previousState = readJson(stateCacheFile(titleId));
      const freshState = buildXboxStateSnapshot(localized.achievements);
      schema.img = mergeXboxArtwork(previous?.img, schema.img);
      writeJson(schemaCacheFile(titleId), schema);
      writeJson(stateCacheFile(titleId), mergeXboxStateSnapshots(previousState, freshState));
      if (previous) result.updated += 1;
      else result.created += 1;
    } catch (error) {
      result.failed += 1;
    }
  });
  return result;
}

function listCachedTitles() {
  const root = path.join(getUserDataPath(), 'steam_cache', 'xbox');
  let entries = [];
  try {
    entries = fs.readdirSync(root);
  } catch {
    return [];
  }
  return entries.filter((name) => fs.existsSync(path.join(root, name, 'schema.json')));
}

// The imported title's name, straight off the cached schema. Discovery needs it to recognise that
// this game is the one another source already found, and it must stay cheap: this runs per cached
// title on every scan, so it reads the schema rather than building the whole game record.
function cachedTitleName(appid) {
  const titleId = normalizeTitleId(appid);
  if (!titleId) return '';
  const schema = readJson(schemaCacheFile(titleId));
  return String(schema?.name || '').trim();
}

/*
  The unlocks this title carries, keyed by the api-names of the schema passed in rather than by
  Xbox's own ids. Xbox numbers its achievements 1, 2, 3 while Steam names them, so a merged game
  has no key in common with its Xbox twin - the achievement titles are the only thing the two
  schemas share, and they match because both come from the publisher.
*/
function unlocksForSchema(appid, schemaList) {
  const titleId = normalizeTitleId(appid);
  if (!titleId) return {};
  const schema = readJson(schemaCacheFile(titleId));
  const state = readJson(stateCacheFile(titleId));
  if (!schema?.achievement?.list || !state) return {};

  const unlocks = {};
  for (const achievement of schema.achievement.list) {
    const saved = state[achievement.name];
    if (!saved?.earned) continue;
    unlocks[achievement.name] = { Achieved: true, UnlockTime: Number(saved.earned_time) || 0 };
  }
  return require('../util/crossSchemaUnlocks.js').remapUnlocksOntoSchema(unlocks, schema.achievement.list, schemaList);
}

async function getGameData(appid) {
  const titleId = normalizeTitleId(appid);
  if (!titleId) return null;
  const schema = readJson(schemaCacheFile(titleId));
  if (!schema || !schema.achievement || !Array.isArray(schema.achievement.list)) return null;
  const state = readJson(stateCacheFile(titleId)) || {};
  const list = schema.achievement.list.map((a) => {
    const entry = state[a.name] || {};
    // The counter fields travel too, or a "collect 100 items" achievement renders with no bar even
    // though its progress was fetched and cached.
    return {
      ...a,
      Achieved: entry.earned === true,
      UnlockTime: Number(entry.earned_time) || 0,
      ...(entry.progress !== undefined ? { CurProgress: entry.progress } : {}),
      ...(entry.max_progress !== undefined ? { MaxProgress: entry.max_progress } : {}),
    };
  });
  return {
    appid: titleId,
    name: schema.name || `Xbox ${titleId}`,
    source: XBOX_PC_SOURCE,
    // Xbox has one hero picture and it is the same file the tile uses, so it cannot be blurred and
    // tinted in the cache the way a Steam or Epic background is without darkening the tile too.
    // `overlay` asks the game page for the veil at paint time instead, which is the same look.
    img: { ...schema.img, overlay: true },
    achievement: {
      total: list.length,
      unlocked: list.filter((a) => a.Achieved).length,
      list,
    },
  };
}

function status() {
  const auth = loadAuth();
  if (!auth) return { connected: false, provider: 'Microsoft / Xbox Network' };
  return { connected: true, gamertag: auth.gamertag || '', xuid: auth.xuid || '', provider: 'Microsoft / Xbox Network' };
}

module.exports = {
  setUserDataPath,
  XBOX_PC_SOURCE,
  XBOX_PC_CLIENT_ID,
  XBOX_PC_REDIRECT_URI,
  buildXboxDirectAuthorizeUrl,
  extractXboxDirectAuthResult,
  completeXboxDirectAuthentication,
  ensureXboxDirectSession,
  saveAuth,
  loadAuth,
  clearAuth,
  discoverXboxPcInstallations,
  parseMicrosoftGameConfig,
  parseGamingRootMarker,
  listXboxGamesRoots,
  normalizeTitleId,
  normalizeXuid,
  normalizeXboxClientId,
  normalizeXboxAchievement,
  xboxLocaleForLang,
  buildXboxStateSnapshot,
  mergeXboxStateSnapshots,
  mergeXboxArtwork,
  isWindowsPcTitle,
  resolveXboxTitleArtwork,
  importLibrary,
  getGameData,
  listCachedTitles,
  cachedTitleName,
  unlocksForSchema,
  status,
};
