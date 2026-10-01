'use strict';

/*
  RetroAchievements: the games an account has played on emulators, with their unlocks, read from the
  public Web API under the user's own username and Web API key (retroachievements.org/settings).

  Imported games are cached under steam_cache/retroachievements/<gameId>/ as schema.json + state.json,
  the Xbox PC layout. The Watchdog loads this file through sharedAppModule to announce live unlocks,
  so it must load without Electron and must not require anything outside app/parser.
*/

const fs = require('fs');
const path = require('path');

const SOURCE = 'RetroAchievements';
const DATA_TYPE = 'retroAchievements';
// Game ids are small integers, the same space as Steam appids: "1" is Sonic the Hedgehog here and
// a Steam tool there. Every id that leaves this file carries the prefix.
const APPID_PREFIX = 'ra-';
const API_ROOT = 'https://retroachievements.org/API';
const MEDIA_ROOT = 'https://media.retroachievements.org';
const USER_AGENT = 'AchievementWatcherNext (+https://github.com/Shirowwww/Achievement-Watcher-Next)';
const PAGE_SIZE = 500;
const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);
// A game whose completion row has not moved is not fetched again, but its rarity drifts as other
// people play, so an unchanged game is still refreshed once a week.
const SCHEMA_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const IMPORT_DELAY_MS = 250;
// The import waits out a 429 up to this long (the API asks for about four minutes).
const IMPORT_MAX_RATE_WAIT_MS = 10 * 60 * 1000;
const IMPORT_MAX_DELAY_MS = 4000;

let userDataPath = null;
let cipher = null;

function setUserDataPath(p) {
  userDataPath = p;
}

// The app and the Watchdog each ship their own copy of util/aes.js; the Watchdog hands its one in.
function setCipher(value) {
  cipher = value;
}

function getCipher() {
  if (!cipher) cipher = require(path.join(__dirname, '..', 'util', 'aes.js'));
  return cipher;
}

function getUserDataPath() {
  if (userDataPath) return userDataPath;
  return require(path.join(__dirname, '..', 'util', 'userDataPath.js')).userDataDir();
}

function firstNonEmpty(...values) {
  for (const value of values) {
    const text = String(value ?? '').trim();
    if (text) return text;
  }
  return '';
}

function normalizeGameId(value) {
  const raw = String(value ?? '')
    .trim()
    .replace(new RegExp(`^${APPID_PREFIX}`, 'i'), '');
  return /^\d{1,12}$/.test(raw) && Number(raw) > 0 ? String(Number(raw)) : '';
}

function toAppid(gameId) {
  const id = normalizeGameId(gameId);
  return id ? `${APPID_PREFIX}${id}` : '';
}

function isRetroAchievementsAppid(value) {
  return new RegExp(`^${APPID_PREFIX}\\d+$`, 'i').test(String(value || '').trim());
}

function normalizeUsername(value) {
  const raw = String(value || '').trim();
  return /^[A-Za-z0-9_.-]{2,32}$/.test(raw) ? raw : '';
}

function normalizeApiKey(value) {
  const raw = String(value || '').trim();
  return /^[A-Za-z0-9]{16,64}$/.test(raw) ? raw : '';
}

function cacheRoot() {
  return path.join(getUserDataPath(), 'steam_cache', 'retroachievements');
}

function cacheDir(gameId) {
  return path.join(cacheRoot(), normalizeGameId(gameId));
}

function schemaFile(gameId) {
  return path.join(cacheDir(gameId), 'schema.json');
}

function stateFile(gameId) {
  return path.join(cacheDir(gameId), 'state.json');
}

function authFile() {
  return path.join(getUserDataPath(), 'cfg', 'retroachievements-auth.json');
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

/*
  Temp sibling then rename: the Watchdog writes state.json while the library reads it, and a torn
  file reads as "nothing unlocked", which announces every unlock again. A rename refused by Windows
  (a read-only or locked target) falls back to writing in place rather than losing the update.
*/
function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const contents = JSON.stringify(value, null, 2);
  const temporary = `${file}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(temporary, contents, 'utf8');
    fs.renameSync(temporary, file);
  } catch {
    fs.writeFileSync(file, contents, 'utf8');
  } finally {
    try {
      if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
    } catch {
      /* the rename already consumed it */
    }
  }
}

function saveAuth(auth) {
  writeJson(authFile(), { v: 1, data: getCipher().encrypt(JSON.stringify(auth)) });
}

function loadAuth() {
  const wrapper = readJson(authFile());
  if (!wrapper || typeof wrapper.data !== 'string') return null;
  try {
    const auth = JSON.parse(getCipher().decrypt(wrapper.data));
    const username = normalizeUsername(auth && auth.username);
    const apiKey = normalizeApiKey(auth && auth.apiKey);
    return username && apiKey ? { username, apiKey, ulid: String(auth.ulid || '') } : null;
  } catch {
    // Written under an installation key this process does not hold (a Watchdog started by hand).
    return null;
  }
}

function clearAuth() {
  try {
    fs.unlinkSync(authFile());
  } catch {}
}

function apiError(code, httpStatus) {
  const error = new Error(code);
  error.code = code;
  error.status = Number(httpStatus) || 0;
  return error;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryAfterMs(res) {
  const seconds = Number(res.headers && res.headers.get && res.headers.get('retry-after'));
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 0;
}

/*
  One Web API call. The key travels in the query string, so neither the URL nor anything built from
  it may end up in an error message: these errors are logged and shown in Settings.

  The API allows a burst of about a hundred calls, then answers 429 with a Retry-After of several
  minutes. A caller that can wait (the import) passes maxRateWaitMs and is told through onRateLimit;
  any other caller gets 'retroachievements-rate-limited' at once, with err.retryAfterMs.
*/
async function apiGet(endpoint, auth, params = {}, options = {}) {
  const fetchImpl = options.fetch || fetch;
  const url = new URL(`${API_ROOT}/${endpoint}`);
  url.searchParams.set('y', auth.apiKey);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
  const maxRetries = Number.isInteger(options.retries) ? options.retries : 2;
  let rateWaits = 0;
  for (let attempt = 0; ; attempt += 1) {
    let res;
    try {
      res = await fetchImpl(url, {
        signal: AbortSignal.timeout(Math.max(3000, Number(options.timeoutMs) || 15000)),
        headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
      });
    } catch {
      if (attempt >= maxRetries) throw apiError('retroachievements-network-error');
      await sleep(1000 * 2 ** attempt);
      continue;
    }
    if (res.status === 401 || res.status === 403) throw apiError('retroachievements-unauthorized', res.status);
    if (res.ok) {
      const payload = await res.json().catch(() => null);
      if (payload === null) throw apiError('retroachievements-bad-response', res.status);
      return payload;
    }
    if (res.status === 429) {
      const waitMs = retryAfterMs(res) || 60000;
      if (waitMs > (Number(options.maxRateWaitMs) || 0) || rateWaits >= 5) {
        const error = apiError('retroachievements-rate-limited', 429);
        error.retryAfterMs = waitMs;
        throw error;
      }
      rateWaits += 1;
      attempt -= 1; // waiting out the limit is not a failed attempt
      options.onRateLimit?.(waitMs);
      await sleep(waitMs);
      continue;
    }
    if (!RETRYABLE_STATUS.has(res.status) || attempt >= maxRetries) throw apiError(`retroachievements-http-${res.status}`, res.status);
    await sleep(Math.min(30000, retryAfterMs(res) || 1000 * 2 ** attempt));
  }
}

// The account the key belongs to. An unknown user comes back as an empty object, not an error.
async function connect({ username, apiKey } = {}, options = {}) {
  const auth = { username: normalizeUsername(username), apiKey: normalizeApiKey(apiKey) };
  if (!auth.username) throw apiError('retroachievements-username-invalid');
  if (!auth.apiKey) throw apiError('retroachievements-api-key-invalid');
  const profile = await apiGet('API_GetUserProfile.php', auth, { u: auth.username }, options);
  const confirmed = normalizeUsername(profile && profile.User);
  if (!confirmed) throw apiError('retroachievements-user-not-found');
  const saved = { username: confirmed, apiKey: auth.apiKey, ulid: String(profile.ULID || '') };
  // Another account's games and unlocks would otherwise stay in the library beside this one's.
  const previous = loadAuth();
  if (previous && previous.username.toLowerCase() !== confirmed.toLowerCase()) {
    fs.rmSync(cacheRoot(), { recursive: true, force: true });
  }
  saveAuth(saved);
  return { username: confirmed };
}

function status() {
  const auth = loadAuth();
  return auth ? { connected: true, username: auth.username } : { connected: false };
}

function mediaUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^https:\/\//i.test(raw)) return raw;
  if (/^http:\/\//i.test(raw)) return `https://${raw.slice('http://'.length)}`;
  return `${MEDIA_ROOT}/${raw.replace(/^\/+/, '')}`;
}

// RetroAchievements fills a missing box art or screenshot with a "No Screenshot Found" picture
// (/Images/000002.png). Taken as art, it put that text on every tile of a set without box art.
const PLACEHOLDER_IMAGE = /\/Images\/00000[0-2]\.png$/i;
function artUrl(value) {
  const url = mediaUrl(value);
  return PLACEHOLDER_IMAGE.test(url) ? '' : url;
}

function badgeUrl(badgeName, locked = false) {
  const badge = String(badgeName || '').trim();
  return /^[A-Za-z0-9_-]+$/.test(badge) ? `${MEDIA_ROOT}/Badge/${badge}${locked ? '_lock' : ''}.png` : '';
}

// RetroAchievements writes its dates as "YYYY-MM-DD HH:MM:SS" in UTC. Read bare, Date.parse would
// take that as local time and shift every unlock by the user's offset.
function parseDate(value) {
  const raw = String(value || '').trim();
  if (!raw) return 0;
  const iso = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(raw) ? `${raw.replace(' ', 'T')}Z` : raw;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) && ms > 0 ? Math.floor(ms / 1000) : 0;
}

function gameDisplayName(title, consoleName) {
  const name = String(title || '').trim();
  const system = String(consoleName || '').trim();
  return system ? `${name} (${system})` : name;
}

function achievementRows(payload) {
  const raw = payload && (payload.Achievements || payload.achievements);
  if (Array.isArray(raw)) return raw;
  return raw && typeof raw === 'object' ? Object.values(raw) : [];
}

/*
  One API_GetGameInfoAndUserProgress answer, as the cached schema and unlock state. RetroAchievements
  has no hidden achievements; rarity is the share of the game's players who earned each one, in any
  mode, which is what the site itself shows.
*/
function buildGameRecord(payload, gameId) {
  const id = normalizeGameId(gameId || (payload && payload.ID));
  const players = Number(payload && (payload.NumDistinctPlayers || payload.NumDistinctPlayersCasual)) || 0;
  const rows = achievementRows(payload)
    .filter((row) => row && normalizeGameId(row.ID))
    .sort((a, b) => (Number(a.DisplayOrder) || 0) - (Number(b.DisplayOrder) || 0) || Number(a.ID) - Number(b.ID));
  const list = [];
  const state = {};
  for (const row of rows) {
    const name = String(Number(row.ID));
    const awarded = Number(row.NumAwarded) || 0;
    list.push({
      name,
      displayName: firstNonEmpty(row.Title, `Achievement ${name}`),
      description: firstNonEmpty(row.Description),
      hidden: 0,
      icon: badgeUrl(row.BadgeName, false),
      icongray: badgeUrl(row.BadgeName, true),
      points: Number(row.Points) || 0,
      ...(players > 0 ? { rarityPct: Math.round(Math.min(100, (awarded / players) * 100) * 100) / 100 } : {}),
      ...(row.type || row.Type ? { type: String(row.type || row.Type) } : {}),
    });
    const softcore = parseDate(row.DateEarned);
    const hardcore = parseDate(row.DateEarnedHardcore);
    if (softcore || hardcore) {
      state[name] = { earned: true, earned_time: softcore && hardcore ? Math.min(softcore, hardcore) : softcore || hardcore, hardcore: hardcore > 0 };
    }
  }
  const consoleName = firstNonEmpty(payload && payload.ConsoleName);
  const schema = {
    gameId: id,
    name: gameDisplayName(firstNonEmpty(payload && payload.Title, `Game ${id}`), consoleName),
    console: consoleName,
    source: SOURCE,
    img: {
      header: artUrl(payload && payload.ImageTitle) || artUrl(payload && payload.ImageIngame),
      background: artUrl(payload && payload.ImageIngame) || artUrl(payload && payload.ImageTitle),
      portrait: artUrl(payload && payload.ImageBoxArt),
      icon: artUrl(payload && payload.ImageIcon),
    },
    achievement: { total: list.length, list },
  };
  return { schema, state };
}

function normalizedEntry(value) {
  const entry = value && typeof value === 'object' ? value : {};
  const result = { earned: entry.earned === true };
  const time = Number(entry.earned_time);
  if (Number.isFinite(time) && time > 0) result.earned_time = Math.floor(time);
  if (entry.hardcore === true) result.hardcore = true;
  return result;
}

/*
  Fresh state over the cached one, keyed by the fresh schema. An unlock the Watchdog recorded a moment
  ago survives an import that was fetched just before it; an achievement the set no longer has is
  dropped with it.
*/
function mergeState(previous, fresh, schemaList) {
  const before = previous && typeof previous === 'object' ? previous : {};
  const incoming = fresh && typeof fresh === 'object' ? fresh : {};
  const merged = {};
  for (const achievement of schemaList || []) {
    const id = String(achievement.name);
    const oldValue = normalizedEntry(before[id]);
    const newValue = normalizedEntry(incoming[id]);
    if (!oldValue.earned && !newValue.earned) continue;
    const times = [oldValue.earned_time, newValue.earned_time].filter((time) => time > 0);
    merged[id] = {
      earned: true,
      ...(times.length ? { earned_time: Math.min(...times) } : {}),
      ...(oldValue.hardcore || newValue.hardcore ? { hardcore: true } : {}),
    };
  }
  return merged;
}

function readState(gameId) {
  const state = readJson(stateFile(gameId));
  return state && typeof state === 'object' && !Array.isArray(state) ? state : {};
}

function readSchema(gameId) {
  const schema = readJson(schemaFile(gameId));
  return schema && schema.achievement && Array.isArray(schema.achievement.list) ? schema : null;
}

function writeGame(gameId, payload, meta = {}) {
  const { schema, state } = buildGameRecord(payload, gameId);
  if (schema.achievement.list.length === 0) return null;
  const previous = readSchema(gameId);
  // An account can see a game's art blank for a while after a set is rebuilt; keep the old picture.
  for (const key of Object.keys(schema.img)) if (!schema.img[key] && previous && previous.img) schema.img[key] = artUrl(previous.img[key]);
  schema.meta = { ...meta, fetchedAt: Date.now() };
  writeJson(schemaFile(gameId), schema);
  writeJson(stateFile(gameId), mergeState(readState(gameId), state, schema.achievement.list));
  return { schema, created: !previous };
}

async function fetchGameProgress(auth, gameId, options = {}) {
  const id = normalizeGameId(gameId);
  if (!id) throw apiError('retroachievements-game-id-invalid');
  return apiGet('API_GetGameInfoAndUserProgress.php', auth, { u: auth.username, g: id }, options);
}

async function fetchCompletionProgress(auth, options = {}) {
  const rows = [];
  for (let offset = 0; offset < 20000; offset += PAGE_SIZE) {
    const payload = await apiGet('API_GetUserCompletionProgress.php', auth, { u: auth.username, c: PAGE_SIZE, o: offset }, options);
    const page = Array.isArray(payload && payload.Results) ? payload.Results : [];
    rows.push(...page);
    const total = Number(payload && payload.Total) || 0;
    if (page.length < PAGE_SIZE || rows.length >= total) break;
  }
  return rows;
}

// What a completion row says about a game; while it stays the same there is nothing new to fetch.
function completionFingerprint(row) {
  return [row.MaxPossible, row.NumAwarded, row.NumAwardedHardcore, row.MostRecentAwardedDate].map((value) => String(value ?? '')).join('|');
}

/*
  Every game the account has a completion row for, most recently played first. A game whose row is
  unchanged since the last import is skipped, so a second import costs one request per 500 games,
  and an import cut short by the rate limit picks up where it stopped.
*/
async function importLibrary(options = {}) {
  const auth = options.auth || loadAuth();
  if (!auth) throw apiError('retroachievements-login-required');
  let current = 0;
  let total = 0;
  let delayMs = Number.isFinite(options.delayMs) ? options.delayMs : IMPORT_DELAY_MS;
  const requestOptions = {
    ...options,
    maxRateWaitMs: Number.isFinite(options.maxRateWaitMs) ? options.maxRateWaitMs : IMPORT_MAX_RATE_WAIT_MS,
    onRateLimit: (waitMs) => {
      // The API answers a second burst with a much longer block (14 s, then 10 min), so after a
      // 429 the import slows down instead of running into the next one.
      if (delayMs > 0) delayMs = Math.min(IMPORT_MAX_DELAY_MS, Math.max(1000, delayMs * 2));
      options.onProgress?.({ current, total, rateLimitedMs: waitMs });
    },
  };
  const rows = (await fetchCompletionProgress(auth, requestOptions)).sort(
    (a, b) => String(b.MostRecentAwardedDate || '').localeCompare(String(a.MostRecentAwardedDate || ''))
  );
  total = rows.length;
  const result = { account: auth.username, total: rows.length, created: 0, updated: 0, unchanged: 0, skipped: 0, failed: 0, rateLimited: false };
  const seen = new Set();
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index] || {};
    const gameId = normalizeGameId(row.GameID);
    const title = gameDisplayName(firstNonEmpty(row.Title, `Game ${gameId}`), row.ConsoleName);
    current = index + 1;
    options.onProgress?.({ current, total: rows.length, detail: title, appid: toAppid(gameId) });
    if (!gameId || seen.has(gameId) || !(Number(row.MaxPossible) > 0)) {
      result.skipped += 1;
      continue;
    }
    seen.add(gameId);
    const fingerprint = completionFingerprint(row);
    const cached = readSchema(gameId);
    const fresh = cached && cached.meta && cached.meta.fingerprint === fingerprint && Date.now() - Number(cached.meta.fetchedAt || 0) < SCHEMA_MAX_AGE_MS;
    if (fresh && !options.force) {
      result.unchanged += 1;
      continue;
    }
    try {
      const written = writeGame(gameId, await fetchGameProgress(auth, gameId, requestOptions), { fingerprint });
      if (!written) result.skipped += 1;
      else if (written.created) result.created += 1;
      else result.updated += 1;
    } catch (err) {
      if (err && err.code === 'retroachievements-unauthorized') throw err;
      // Still limited after waiting: every game left would fail the same way. Stop here; the next
      // import resumes at this game.
      if (err && err.code === 'retroachievements-rate-limited') {
        result.rateLimited = true;
        break;
      }
      result.failed += 1;
    }
    if (delayMs > 0) await sleep(delayMs);
  }
  return result;
}

// The unlocks of the last `minutes` minutes, across every game, oldest first.
async function fetchRecentUnlocks(auth, minutes, options = {}) {
  const window = Math.max(1, Math.min(24 * 60, Math.ceil(Number(minutes) || 0)));
  const payload = await apiGet('API_GetUserRecentAchievements.php', auth, { u: auth.username, m: window }, options);
  const unlocks = [];
  for (const row of Array.isArray(payload) ? payload : []) {
    const gameId = normalizeGameId(row && row.GameID);
    const achievementId = normalizeGameId(row && row.AchievementID);
    if (!gameId || !achievementId) continue;
    unlocks.push({
      gameId,
      achievementId,
      title: firstNonEmpty(row.Title, `Achievement ${achievementId}`),
      description: firstNonEmpty(row.Description),
      points: Number(row.Points) || 0,
      hardcore: Number(row.HardcoreMode) === 1 || row.HardcoreMode === true,
      icon: row.BadgeURL ? mediaUrl(row.BadgeURL) : badgeUrl(row.BadgeName),
      gameIcon: mediaUrl(row.GameIcon),
      gameName: gameDisplayName(firstNonEmpty(row.GameTitle, `Game ${gameId}`), row.ConsoleName),
      time: parseDate(row.Date),
    });
  }
  return unlocks.sort((a, b) => a.time - b.time);
}

// Record live unlocks in the cached state, so the library shows them before the next import.
function recordUnlocks(gameId, unlocks) {
  const schema = readSchema(gameId);
  if (!schema) return;
  const fresh = {};
  for (const unlock of unlocks) fresh[unlock.achievementId] = { earned: true, earned_time: unlock.time, hardcore: unlock.hardcore };
  writeJson(stateFile(gameId), mergeState(readState(gameId), fresh, schema.achievement.list));
}

function listCachedTitles() {
  let entries = [];
  try {
    entries = fs.readdirSync(cacheRoot());
  } catch {
    return [];
  }
  return entries.filter((name) => normalizeGameId(name) === name && fs.existsSync(schemaFile(name))).map(toAppid);
}

function cachedTitleName(appid) {
  const schema = readSchema(normalizeGameId(appid));
  return schema ? String(schema.name || '').trim() : '';
}

async function getGameData(appid) {
  const gameId = normalizeGameId(appid);
  const schema = gameId ? readSchema(gameId) : null;
  if (!schema) return null;
  const state = readState(gameId);
  const list = schema.achievement.list.map((achievement) => {
    const entry = state[achievement.name] || {};
    return { ...achievement, Achieved: entry.earned === true, UnlockTime: Number(entry.earned_time) || 0 };
  });
  return {
    appid: toAppid(gameId),
    name: schema.name || `RetroAchievements ${gameId}`,
    source: SOURCE,
    // The background is a raw screenshot: veiled at paint time until its blurred, tinted copy
    // (stylize-background-for-appid, asked for by the scan) exists, which then replaces it.
    // Filtered again on read: a cache written before the placeholder was recognised still holds it.
    img: { ...Object.fromEntries(Object.entries(schema.img || {}).map(([key, value]) => [key, artUrl(value)])), overlay: true },
    achievement: { total: list.length, unlocked: list.filter((a) => a.Achieved).length, list },
  };
}

// The unlock map the aggregator merges into the game, keyed by achievement id.
function getAchievements(appid) {
  const gameId = normalizeGameId(appid);
  const unlocks = {};
  if (!gameId) return unlocks;
  for (const [id, entry] of Object.entries(readState(gameId))) {
    if (entry && entry.earned === true) unlocks[id] = { Achieved: true, UnlockTime: Number(entry.earned_time) || 0 };
  }
  return unlocks;
}

module.exports = {
  SOURCE,
  DATA_TYPE,
  APPID_PREFIX,
  setUserDataPath,
  setCipher,
  normalizeGameId,
  normalizeUsername,
  normalizeApiKey,
  toAppid,
  isRetroAchievementsAppid,
  cacheRoot,
  authFile,
  saveAuth,
  loadAuth,
  clearAuth,
  apiGet,
  connect,
  status,
  parseDate,
  badgeUrl,
  buildGameRecord,
  mergeState,
  writeGame,
  readSchema,
  readState,
  fetchGameProgress,
  fetchCompletionProgress,
  completionFingerprint,
  importLibrary,
  fetchRecentUnlocks,
  recordUnlocks,
  listCachedTitles,
  cachedTitleName,
  getGameData,
  getAchievements,
};
