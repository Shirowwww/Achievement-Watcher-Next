'use strict';

// Read Epic launcher manifests and native achievement data.
// Schemas are public; unlock state is available after the user connects Epic.

const fs = require('fs');
const path = require('path');

let cacheRoot;
let debug = { log() {}, warn() {}, error() {} };

module.exports.initDebug = ({ isDev, userDataPath }) => {
  module.exports.setUserDataPath(userDataPath);
  debug = new (require('../util/logger'))({
    console: isDev || false,
    file: path.join(userDataPath, 'logs/parser.log'),
  });
};

module.exports.setUserDataPath = (p) => {
  cacheRoot = p;
};

const EPIC_GRAPHQL_URL = 'https://launcher.store.epicgames.com/graphql';
const EPIC_PUBLIC_ACHIEVEMENTS_BASE = 'https://api.epicgames.dev/epic/achievements/v1/public/achievements';
const EPIC_MANIFESTS_DIR = path.join(process.env['ProgramData'] || 'C:\\ProgramData', 'Epic', 'EpicGamesLauncher', 'Data', 'Manifests');
const SCHEMA_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

// steam-api language names → Epic locale codes (Epic serves "fr", "en", "pt-BR" …)
const EPIC_LOCALE_MAP = {
  english: 'en', french: 'fr', german: 'de', italian: 'it', spanish: 'es', latam: 'es-419',
  portuguese: 'pt-PT', brazilian: 'pt-BR', russian: 'ru', polish: 'pl', japanese: 'ja',
  koreana: 'ko', schinese: 'zh-Hans', tchinese: 'zh-Hant', dutch: 'nl', danish: 'da',
  finnish: 'fi', swedish: 'sv', norwegian: 'no', czech: 'cs', hungarian: 'hu', romanian: 'ro',
  slovak: 'sk', turkish: 'tr', ukrainian: 'uk', greek: 'el', thai: 'th', vietnamese: 'vi',
  indonesian: 'id', arabic: 'ar',
};

function firstNonEmpty(...values) {
  for (const value of values) {
    const text = String(value || '').trim();
    if (text) return text;
  }
  return '';
}

function readJsonFile(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

// [{title, namespace, catalogItemId, appName, installLocation, executablePath, processName}]
function buildEpicLocalInstallIndex(manifestsDir = EPIC_MANIFESTS_DIR) {
  const entries = [];
  let files = [];
  try {
    if (!fs.existsSync(manifestsDir)) return entries;
    files = fs.readdirSync(manifestsDir);
  } catch {
    return entries;
  }
  for (const file of files) {
    if (!String(file || '').toLowerCase().endsWith('.item')) continue;
    const item = readJsonFile(path.join(manifestsDir, file));
    if (!item || typeof item !== 'object') continue;
    const installLocation = firstNonEmpty(item.InstallLocation, item.installLocation);
    const launchExecutable = firstNonEmpty(item.LaunchExecutable, item.launchExecutable);
    entries.push({
      title: firstNonEmpty(item.DisplayName, item.displayName),
      namespace: firstNonEmpty(item.CatalogNamespace, item.catalogNamespace),
      catalogItemId: firstNonEmpty(item.CatalogItemId, item.catalogItemId),
      appName: firstNonEmpty(item.AppName, item.appName),
      installLocation,
      executablePath: installLocation && launchExecutable ? path.join(installLocation, launchExecutable) : '',
      processName: launchExecutable ? path.basename(launchExecutable) : '',
    });
  }
  return entries;
}

/*
  Epic answers no CORS headers, so any of these requests made from the window fails with a bare
  "Failed to fetch" no matter what the page's connect-src allows - it emptied the whole Epic
  library. In the renderer the main process is asked to make the call, and it attaches the account
  token itself; everywhere else (the monitor, a test) the request goes out directly.
*/
async function epicFetchJson(url, { method = 'GET', headers = {}, body, timeoutMs = 15000, authenticated = false } = {}) {
  const { ipcAvailable, ipcInvoke } = require('../util/ipcInvoke.js');
  if (ipcAvailable()) {
    let payload = null;
    try {
      payload = body === undefined ? null : JSON.parse(body);
    } catch {
      payload = null;
    }
    const answer = await ipcInvoke('epic:fetch-json', { url, method, body: payload, authenticated });
    if (!answer) return { status: 599, data: {} };
    return { status: answer.ok ? Number(answer.status) || 200 : Number(answer.status) || 599, data: answer.json || {} };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method,
      headers: { Accept: 'application/json', 'User-Agent': 'EpicGamesLauncher', ...headers },
      // A GET carries no body, and passing the key at all is what some fetch implementations reject.
      ...(body === undefined ? {} : { body }),
      signal: controller.signal,
    });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data };
  } finally {
    clearTimeout(timer);
  }
}

// Public, unauthenticated: full localized achievement schema (name, texts, icons, XP, rarity).
async function fetchEpicAchievementSchemaBySandbox(sandboxId, locale = 'en') {
  const query = `
    query Achievement($SandboxId: String!, $Locale: String!) {
      Achievement {
        productAchievementsRecordBySandbox(sandboxId: $SandboxId, locale: $Locale) {
          productId
          sandboxId
          totalAchievements
          achievements {
            achievement {
              name
              unlockedDisplayName
              unlockedDescription
              unlockedIconLink
              lockedIconLink
              hidden
              rarity { percent }
            }
          }
        }
      }
    }`;
  const { status, data } = await epicFetchJson(EPIC_GRAPHQL_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables: { SandboxId: String(sandboxId), Locale: String(locale) } }),
  });
  if (status >= 400) throw `Epic GraphQL ${status}`;
  const record = data?.data?.Achievement?.productAchievementsRecordBySandbox;
  if (!record) return null;
  return {
    productId: String(record.productId || '').trim(),
    sandboxId: String(record.sandboxId || sandboxId).trim(),
    achievements: Array.isArray(record.achievements) ? record.achievements : [],
  };
}

// Public REST fallback keyed by productId (used when we know the product but the sandbox query is empty).
async function fetchEpicPublicProductAchievements(productId, locale = 'en') {
  const url = `${EPIC_PUBLIC_ACHIEVEMENTS_BASE}/product/${encodeURIComponent(productId)}/locale/${encodeURIComponent(locale)}?includeAchievements=true`;
  const { status, data } = await epicFetchJson(url);
  if (status >= 400) throw `Epic public achievements ${status}`;
  return Array.isArray(data?.achievements) ? data.achievements : [];
}

// Authenticated: the player's unlock state for one product.
async function fetchEpicPlayerAchievements(epicAccountId, productId, accessToken, tokenType = 'bearer') {
  const query = `
    query playerProfileAchievementsByProductId($EpicAccountId: String!, $ProductId: String!) {
      PlayerProfile {
        playerProfile(epicAccountId: $EpicAccountId) {
          productAchievements(productId: $ProductId) {
            ... on PlayerProductAchievementsResponseSuccess {
              data {
                playerAchievements {
                  playerAchievement { achievementName unlocked unlockDate }
                }
              }
            }
          }
        }
      }
    }`;
  const { status, data } = await epicFetchJson(EPIC_GRAPHQL_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `${tokenType} ${accessToken}` },
    body: JSON.stringify({ query, variables: { EpicAccountId: String(epicAccountId), ProductId: String(productId) } }),
    authenticated: true,
  });
  if (status >= 400) throw `Epic player achievements ${status}`;
  const profile = data?.data?.PlayerProfile?.playerProfile;
  const inner = profile?.productAchievements?.data || profile?.productAchievements || {};
  return Array.isArray(inner?.playerAchievements) ? inner.playerAchievements : [];
}

function schemaCacheFile(sandboxId, locale) {
  return path.join(cacheRoot || '', 'steam_cache', 'epicOfficial', `${String(sandboxId).replace(/[^\w.-]/g, '_')}_${locale}.json`);
}

// Shared by the success and the "answered, but empty" paths so both land on the same TTL.
function writeSchemaCache(cacheFile, result) {
  try {
    fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
    fs.writeFileSync(cacheFile, JSON.stringify(result, null, 2));
  } catch {
    /* cache write failure is non-fatal */
  }
}

function localeFor(lang) {
  return EPIC_LOCALE_MAP[String(lang || '').toLowerCase()] || 'en';
}

// Resolve the localized schema (cached), returning { productId, list: [{name, displayName,
// description, hidden, icon, icongray, rarity}] }.
// The same schema is read for its product id and again for its texts, for every game, on every
// scan. Reading and parsing it once per process is enough.
const schemaMemo = new Map();

async function resolveSchema(sandboxId, lang) {
  const locale = localeFor(lang);
  const memoKey = `${sandboxId}::${locale}`;
  if (schemaMemo.has(memoKey)) return schemaMemo.get(memoKey);
  const resolved = await resolveSchemaUncached(sandboxId, locale);
  // Only a schema is remembered. A null is either "Epic could not be reached" or "no achievements
  // here", and holding on to the first would turn one bad moment into an empty game for as long as
  // the app stays open - offline, every game would be answered from that memory instead of retried.
  if (resolved) schemaMemo.set(memoKey, resolved);
  return resolved;
}

async function resolveSchemaUncached(sandboxId, locale) {
  const cacheFile = schemaCacheFile(sandboxId, locale);
  try {
    if (fs.existsSync(cacheFile) && Date.now() - fs.statSync(cacheFile).mtimeMs < SCHEMA_CACHE_TTL_MS) {
      const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
      // A cached "this sandbox has no achievements" answers as null, exactly like the live path, so
      // callers never have to handle an empty schema object and a null differently.
      return cached && Array.isArray(cached.list) && cached.list.length ? cached : null;
    }
  } catch {
    /* stale/corrupt -> refetch */
  }

  /*
    `answered` separates "Epic replied, no achievements" from "Epic could not be reached" - only the
    first is worth caching. Fortnite (sandbox `fn`) is the standing example: HTTP 200 with every field
    null, so without this distinction every scan would retry forever instead of caching the empty
    answer on the normal 24h TTL.
  */
  let record = null;
  let answered = false;
  try {
    record = await fetchEpicAchievementSchemaBySandbox(sandboxId, locale);
    answered = true;
  } catch (err) {
    debug.log(`[epic ${sandboxId}] sandbox schema fetch failed => ${err}`);
  }

  let productId = record?.productId || '';
  let rows = record?.achievements || [];
  if (!rows.length) {
    // fall back to the public product REST endpoint if we already know a productId
    if (productId) {
      answered = false;
      try {
        rows = await fetchEpicPublicProductAchievements(productId, locale);
        answered = true;
      } catch (err) {
        debug.log(`[epic ${sandboxId}] public product achievements fetch failed => ${err}`);
      }
    }
    if (!rows.length) {
      let stale = null;
      try {
        if (fs.existsSync(cacheFile)) stale = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
      } catch {
        /* corrupt cache - treat as absent */
      }
      // A schema resolved earlier beats an empty answer, so an Epic hiccup can never erase one.
      if (stale && Array.isArray(stale.list) && stale.list.length) return stale;
      // Nothing better to serve. Record the empty answer only if Epic actually gave one; re-writing
      // it on each expiry is what keeps the retry down to once a day instead of once a scan.
      if (answered) writeSchemaCache(cacheFile, { productId, list: [] });
      return null;
    }
  }

  const list = rows.map((entry) => {
    const a = entry?.achievement || entry || {};
    return {
      name: String(a.name != null ? a.name : '').trim(),
      displayName: firstNonEmpty(a.unlockedDisplayName, a.lockedDisplayName, a.name),
      description: firstNonEmpty(a.unlockedDescription, a.lockedDescription),
      hidden: a.hidden ? 1 : 0,
      icon: firstNonEmpty(a.unlockedIconLink, a.lockedIconLink),
      /*
        Epic's locked art is not the achievement greyed out, it is a padlock - the same padlock for
        every achievement of every game. Showing the real picture for both states is what the other
        sources do, and the list already tells locked from unlocked on its own.
      */
      icongray: firstNonEmpty(a.unlockedIconLink, a.lockedIconLink),
      rarity: a.rarity && Number.isFinite(Number(a.rarity.percent)) ? Number(a.rarity.percent) : null,
    };
  });

  const result = { productId, list };
  writeSchemaCache(cacheFile, result);
  return result;
}

/*
  The account's own library, for the games that are not installed here. The launcher's asset list is
  what the Epic client itself reads at startup: one row per owned Windows build, carrying the
  namespace the achievement schema is keyed by. It says nothing about what a game is called, so the
  catalog is asked once per namespace - and both halves are kept in one file, because a fresh answer
  costs one request per owned game and the library changes about as often as a purchase.
*/
const EPIC_LAUNCHER_ASSETS_URL =
  'https://launcher-public-service-prod06.ol.epicgames.com/launcher/api/public/assets/Windows?label=Live';
const EPIC_CATALOG_BASE = 'https://catalog-public-service-prod06.ol.epicgames.com/catalog/api/shared/namespace';
const OWNED_CACHE_TTL_MS = 12 * 60 * 60 * 1000;
// The Unreal Engine marketplace ships under one namespace and holds assets, not games.
const EPIC_NON_GAME_NAMESPACES = new Set(['ue']);

function ownedCacheFile() {
  return path.join(cacheRoot || '', 'steam_cache', 'epicOfficial', 'owned-library.json');
}

async function epicGet(url) {
  const { status, data } = await epicFetchJson(url, { authenticated: true, timeoutMs: 20000 });
  if (status >= 400) throw new Error(`epic-http-${status}`);
  return data;
}

/*
  What the catalog says a namespace holds. Only the entry the account owns is asked for, and only
  two things are read off it: the name to put on the tile, and whether this is a game at all -
  `mainGameItem` marks an add-on, and an entry with no `games` category is a soundtrack, a bundle or
  an engine asset. Anything the catalog will not answer for is dropped rather than guessed at.
*/
async function fetchOwnedTitle(namespace, catalogItemId) {
  const url = `${EPIC_CATALOG_BASE}/${encodeURIComponent(namespace)}/bulk/items?id=${encodeURIComponent(
    catalogItemId
  )}&country=US&locale=en-US&includeMainGameDetails=true`;
  const items = await epicGet(url);
  const item = items && items[catalogItemId];
  if (!item || item.mainGameItem) return '';
  const categories = Array.isArray(item.categories) ? item.categories.map((c) => String(c?.path || '')) : [];
  if (!categories.includes('games')) return '';
  return String(item.title || '').trim();
}

async function refreshOwnedLibrary() {
  const assets = await epicGet(EPIC_LAUNCHER_ASSETS_URL);
  const byNamespace = new Map();
  for (const asset of Array.isArray(assets) ? assets : []) {
    const namespace = String(asset?.namespace || '').trim();
    const catalogItemId = String(asset?.catalogItemId || '').trim();
    if (!namespace || !catalogItemId || EPIC_NON_GAME_NAMESPACES.has(namespace)) continue;
    if (!byNamespace.has(namespace)) byNamespace.set(namespace, { namespace, catalogItemId, appName: String(asset?.appName || '') });
  }

  const games = [];
  for (const entry of byNamespace.values()) {
    try {
      const title = await fetchOwnedTitle(entry.namespace, entry.catalogItemId);
      if (title) games.push({ ...entry, title });
    } catch (err) {
      debug.log(`[epic ${entry.namespace}] catalog lookup failed => ${err}`);
    }
  }

  const payload = { fetchedAt: Date.now(), games };
  try {
    fs.mkdirSync(path.dirname(ownedCacheFile()), { recursive: true });
    fs.writeFileSync(ownedCacheFile(), JSON.stringify(payload, null, 2));
  } catch {
    /* cache write failure is non-fatal */
  }
  debug.log(`[epic] owned library: ${games.length} game(s) out of ${byNamespace.size} owned namespace(s)`);
  return games;
}

// The owned games, from the cache while it is fresh. A refresh that fails keeps serving the last
// good answer rather than emptying the library because Epic was unreachable for a minute.
async function listOwnedGames() {
  let cached = null;
  try {
    cached = JSON.parse(fs.readFileSync(ownedCacheFile(), 'utf8'));
  } catch {
    /* absent or corrupt - refresh below */
  }
  const fresh = cached && Date.now() - Number(cached.fetchedAt || 0) < OWNED_CACHE_TTL_MS;
  if (fresh && Array.isArray(cached.games)) return cached.games;
  try {
    return await refreshOwnedLibrary();
  } catch (err) {
    debug.log(`Epic owned library refresh skipped => ${err}`);
    return Array.isArray(cached?.games) ? cached.games : [];
  }
}

/*
  One entry per owned game that is not installed here. `installed: false` is explicit: these carry no
  folder and no executable, so nothing downstream may take them for something it can launch.
*/
module.exports.scanOwned = async (installedNamespaces = new Set()) => {
  const games = await listOwnedGames();
  const records = [];
  for (const game of games) {
    if (!game?.namespace || installedNamespaces.has(String(game.namespace))) continue;
    records.push({
      appid: game.namespace,
      name: game.title,
      source: 'epic-official',
      data: {
        type: 'epicOfficial',
        namespace: game.namespace,
        catalogItemId: game.catalogItemId,
        appName: game.appName,
        title: game.title,
        gameDir: null,
        exe: null,
        installed: false,
      },
    });
  }
  return records;
};

/*
  The account's unlocks for this game, keyed by the api-names of the schema passed in rather than by
  Epic's own. A game merged with the copy installed here is read through that copy's schema, and the
  two name their achievements differently; the titles are what they have in common.
*/
module.exports.unlocksForSchema = async (appid, schemaList, lang, { forceRecheck = false } = {}) => {
  const unlocks = await module.exports.getAchievements(appid, { forceRecheck, lang });
  const earned = {};
  for (const [name, value] of Object.entries(unlocks || {})) {
    if (!value?.earned) continue;
    earned[name] = { Achieved: true, UnlockTime: Number(value.earned_time) || 0 };
  }
  if (Object.keys(earned).length === 0) return {};
  const schema = await resolveSchema(appid?.data?.namespace, lang);
  return require('../util/crossSchemaUnlocks.js').remapUnlocksOntoSchema(earned, schema?.list || [], schemaList);
};

// One entry per installed Epic game that carries a sandbox (namespace). appid = namespace (stable,
// used for the sandbox schema query and the rarity sidecar).
module.exports.scan = () => {
  let entries;
  try {
    entries = buildEpicLocalInstallIndex();
  } catch (err) {
    debug.log(`Epic official scan skipped => ${err}`);
    return [];
  }
  const byNamespace = new Map();
  for (const entry of entries) {
    if (!entry.namespace) continue;
    if (byNamespace.has(entry.namespace)) continue;
    byNamespace.set(entry.namespace, {
      appid: entry.namespace,
      source: 'epic-official',
      data: {
        type: 'epicOfficial',
        namespace: entry.namespace,
        catalogItemId: entry.catalogItemId,
        appName: entry.appName,
        title: entry.title,
        gameDir: entry.installLocation && fs.existsSync(entry.installLocation) ? entry.installLocation : null,
        exe: entry.executablePath && fs.existsSync(entry.executablePath) ? entry.executablePath : null,
        exeAuthoritative: true,
      },
    });
  }
  return Array.from(byNamespace.values());
};

module.exports.getGameData = async (appid, lang) => {
  const data = appid.data || {};
  const schema = await resolveSchema(data.namespace, lang);
  if (!schema || !schema.list.length) throw `No Epic achievement schema for ${appid.appid}`;

  // seed the shared rarity sidecar from the public schema (keyed on the namespace, source epic)
  try {
    const entries = schema.list
      .filter((a) => a.name && a.rarity != null)
      .map((a) => ({ name: a.name, percent: Number(Math.min(100, Math.max(0, a.rarity)).toFixed(4)) }));
    if (entries.length > 0) require('../util/rarity.js').writeRarityCache(appid.appid, entries, 'epic');
  } catch (err) {
    debug.log(`[${appid.appid}] epic rarity sidecar seed failed => ${err}`);
  }

  /*
    Artwork is left to the shared fallback in achievements.js, which asks for the same pictures with
    the platform and the appid attached. Asking here as well meant two SteamGridDB lookups and two
    cache entries for every Epic game, and a blur-and-tint pipeline per game on top; `overlay` gets
    the same veiled background painted at display time instead.
  */
  const img = { header: null, background: null, portrait: null, icon: null, overlay: true };

  return {
    name: data.title || `Epic ${appid.appid}`,
    appid: appid.appid,
    img,
    achievement: {
      total: schema.list.length,
      list: schema.list.map((a) => ({
        name: a.name,
        displayName: a.displayName,
        description: a.description,
        hidden: a.hidden,
        icon: a.icon,
        icongray: a.icongray,
      })),
    },
  };
};

// Unlock state map {achievementName: {earned, earned_time(s)}}. Requires a connected Epic account;
// without a token every achievement stays locked (returns {}), which the UI renders as 0%.
/*
  The account's unlock state for one product, kept on disk between scans.

  Every owned game costs one authenticated query, and a library of a hundred of them turned a scan
  into ninety seconds of waiting on Epic - it was the whole cost of a refresh. A short lifetime
  keeps a scan honest without asking again per game every time, and an explicit refresh
  (`forceRecheck`) always goes and asks.
*/
/*
  Who is signed in, asked once for a whole scan. Every game asked on its own before, and each answer
  cost a hop to the main process and a decryption of the token file - a hundred of those, in a row,
  on the thread the rest of the scan is waiting on.
*/
let authStatusCache = { at: 0, value: null };
const AUTH_STATUS_TTL_MS = 60 * 1000;
async function cachedAuthStatus(ipcInvoke) {
  if (authStatusCache.value && Date.now() - authStatusCache.at < AUTH_STATUS_TTL_MS) return authStatusCache.value;
  const value = await ipcInvoke('epic:auth-status');
  authStatusCache = { at: Date.now(), value };
  return value;
}

const PLAYER_CACHE_TTL_MS = 15 * 60 * 1000;

/*
  The last state read back, with its age, or null when there is none to serve.
*/
function readPlayerCache(cacheFile) {
  try {
    const age = Date.now() - fs.statSync(cacheFile).mtimeMs;
    const value = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
    return value && typeof value === 'object' ? { value, age } : null;
  } catch {
    return null;
  }
}

/*
  Refreshes run behind the scan, a few at a time. All of them at once would be a hundred requests
  racing the scan through the same bridge, which is the wait this was meant to remove; queued, they
  land over the following seconds and are read by the next scan. A failure is the cache's problem,
  not the caller's.
*/
const playerRefreshQueue = [];
const playerRefreshQueued = new Set();
let playerRefreshActive = 0;
const PLAYER_REFRESH_CONCURRENCY = 3;

function refreshPlayerStateInBackground(appid, { lang }) {
  const key = String(appid && appid.appid);
  if (playerRefreshQueued.has(key)) return;
  playerRefreshQueued.add(key);
  playerRefreshQueue.push({ appid, lang, key });
  drainPlayerRefreshQueue();
}

function drainPlayerRefreshQueue() {
  while (playerRefreshActive < PLAYER_REFRESH_CONCURRENCY && playerRefreshQueue.length > 0) {
    const next = playerRefreshQueue.shift();
    playerRefreshActive += 1;
    module.exports
      .getAchievements(next.appid, { forceRecheck: true, lang: next.lang })
      .catch(() => {})
      .finally(() => {
        playerRefreshActive -= 1;
        playerRefreshQueued.delete(next.key);
        drainPlayerRefreshQueue();
      });
  }
}

function playerCacheFile(namespace, accountId) {
  const safe = (value) => String(value || '').replace(/[^\w.-]/g, '_');
  return path.join(cacheRoot || '', 'steam_cache', 'epicOfficial', `player_${safe(namespace)}_${safe(accountId)}.json`);
}

module.exports.getAchievements = async (appid, { forceRecheck = false, lang = 'english' } = {}) => {
  const data = appid.data || {};
  let epicAuth;
  try {
    epicAuth = require('../util/epicAuth.js');
  } catch {
    return {};
  }
  // In the window, refreshing the token would be a cross-origin call of its own: ask the main
  // process what the account is, and let the bridge below attach the token to the query.
  const { ipcAvailable, ipcInvoke } = require('../util/ipcInvoke.js');
  let accountId = '';
  let token = {};
  if (ipcAvailable()) {
    const status = await cachedAuthStatus(ipcInvoke);
    if (!status?.connected) return {};
    accountId = epicAuth.normalizeEpicAccountId(status.accountId);
  } else {
    try {
      token = await epicAuth.ensureEpicAccessToken({ userDataDir: cacheRoot });
    } catch {
      return {}; // not connected - everything locked
    }
    accountId = epicAuth.normalizeEpicAccountId(token?.account_id);
    if (!token?.access_token) return {};
  }
  if (!accountId) return {};

  // the player query is keyed by productId; resolve it from the cached schema (sandbox → productId)
  let productId = '';
  try {
    // The same language the rest of the scan asked for: the product id does not change with the
    // locale, and asking for another one would read and parse a second copy of every schema.
    const cached = await resolveSchema(data.namespace, lang);
    productId = cached?.productId || '';
  } catch {}
  if (!productId) return {};

  const cacheFile = playerCacheFile(data.namespace, accountId);
  if (!forceRecheck) {
    const known = readPlayerCache(cacheFile);
    if (known) {
      /*
        A scan never waits on Epic for something it already knows. The state that is on disk is
        served straight away and, once it is old enough, a refresh is started behind it - the first
        scan after a night away used to spend forty-five seconds asking about a hundred games one at
        a time. What comes back lands in the cache for the next scan, seconds later.
      */
      if (known.age >= PLAYER_CACHE_TTL_MS) refreshPlayerStateInBackground(appid, { lang });
      return known.value;
    }
  }

  let players;
  try {
    players = await fetchEpicPlayerAchievements(accountId, productId, token.access_token, token.token_type || 'bearer');
  } catch (err) {
    debug.log(`[${appid.appid}] epic player achievements fetch failed => ${err}`);
    // Serve what was last known rather than reporting everything locked because Epic was busy.
    try {
      return JSON.parse(fs.readFileSync(cacheFile, 'utf8')) || {};
    } catch {
      return {};
    }
  }

  const out = {};
  for (const entry of players) {
    const pa = entry?.playerAchievement || entry || {};
    const name = String(pa.achievementName || '').trim();
    if (!name) continue;
    const unlocked = pa.unlocked === true || Number(pa.progress) >= 100;
    const epochMs = pa.unlockDate ? Date.parse(pa.unlockDate) : 0;
    out[name] = { earned: unlocked, earned_time: unlocked && Number.isFinite(epochMs) && epochMs > 0 ? Math.floor(epochMs / 1000) : 0 };
  }
  try {
    fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
    fs.writeFileSync(cacheFile, JSON.stringify(out));
  } catch {
    /* cache write failure is non-fatal */
  }
  return out;
};

// Localized schema lookup by raw Epic namespace (sandbox id) - used by parser/epic.js once
// util/epicIdentity.js has resolved a NemirtingasEpicEmu artifact id to its real namespace, so those
// installs get the same cached, rarity-annotated schema real Epic installs get instead of a direct
// (and often mis-targeted) achievements-by-id lookup.
module.exports.getSchemaByNamespace = resolveSchema;

// The steam-api language name to Epic locale mapping, so parser/epic.js's direct REST fallback asks
// for the same locale this module would rather than being pinned to English.
module.exports.localeFor = localeFor;

// Exposed for unit tests.
module.exports._internal = {
  buildEpicLocalInstallIndex,
  resolveSchema,
  fetchEpicAchievementSchemaBySandbox,
  localeFor,
};
