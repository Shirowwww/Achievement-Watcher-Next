'use strict';

/*
  PlayStation Network library: every trophy list of the signed-in account, imported into
  steam_cache/psn/<NPWR id> the way the Xbox and RetroAchievements libraries are. A list is never
  merged by name with a PC game: a PS4 trophy list and a Steam achievement set are different games,
  with different unlocks. Only the lists of one game on two consoles may share a card.
*/

const fs = require('fs');
const path = require('path');
const { writeFileAtomicSync } = require('../util/replaceFile.js');

const SOURCE = 'PlayStation Network';
const DATA_TYPE = 'psnLibrary';
const APPID_PREFIX = 'psn-';
const API_ROOT = 'https://m.np.playstation.com/api';
const PUBLIC_ARCHIVE = 'https://raw.githubusercontent.com/FlexBy420/sce-tmdb-scraper/main/trophies';
// The largest public libraries hold about 19,000 lists: the paging stops well past that.
const MAX_OFFSET = 60000;
const LIST_ID_RE = /^NPWR\d{5}_\d{2}$/;
const STORE_TITLE_ID_RE = /^[A-Z]{4}\d{5}_\d{2}$/;
const TITLE_PAGE = 800;
const GAMELIST_PAGE = 200;
// Sony answers a Bad Request past five title ids in one lookup.
const TITLE_ID_BATCH = 5;
const TIMEOUT_MS = 20000;
const SCHEMA_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const IMPORT_DELAY_MS = 150;
// Where Sony's language codes differ from Xbox's (es-MX and zh-CN come back in English).
const PSN_LOCALES = { latam: 'es-419', schinese: 'zh-Hans', tchinese: 'zh-Hant' };
const TYPE_LETTER = { platinum: 'P', gold: 'G', silver: 'S', bronze: 'B' };
const PLATFORM_ORDER = ['PS5', 'PS4', 'PS3', 'PSVITA'];
const PLATFORM_LABEL = { PSVITA: 'PS Vita' };

// Store pictures per slot, best first: the hub art is the wide key art, MASTER the square icon.
const ART_TYPES = {
  header: ['GAMEHUB_COVER_ART', 'FOUR_BY_THREE_BANNER', 'MASTER'],
  background: ['GAMEHUB_COVER_ART', 'BACKGROUND_LAYER_ART', 'FOUR_BY_THREE_BANNER'],
  portrait: ['PORTRAIT_BANNER', 'MASTER'],
  icon: ['MASTER'],
  logo: ['LOGO'],
};

let userDataPath = '';

function setUserDataPath(p) {
  userDataPath = String(p || '');
}

function getUserDataPath() {
  return userDataPath || require('../util/userDataPath.js').userDataDir();
}

function normalizeListId(value) {
  const raw = String(value || '').trim();
  const id = (raw.toLowerCase().startsWith(APPID_PREFIX) ? raw.slice(APPID_PREFIX.length) : raw).toUpperCase();
  return LIST_ID_RE.test(id) ? id : '';
}

const toAppid = (listId) => `${APPID_PREFIX}${listId}`;
const cacheRoot = () => path.join(getUserDataPath(), 'steam_cache', 'psn');
const schemaFile = (listId) => path.join(cacheRoot(), listId, 'schema.json');
const stateFile = (listId) => path.join(cacheRoot(), listId, 'state.json');
const titleIdsFile = () => path.join(cacheRoot(), 'title-ids.json');

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function writeJson(file, value) {
  writeFileAtomicSync(file, JSON.stringify(value, null, 2));
}

function readSchema(listId) {
  const schema = readJson(schemaFile(listId));
  return schema && schema.achievement && Array.isArray(schema.achievement.list) ? schema : null;
}

function readState(listId) {
  const state = readJson(stateFile(listId));
  return state && typeof state === 'object' && !Array.isArray(state) ? state : {};
}

function apiError(code) {
  const err = new Error(code);
  err.code = code;
  return err;
}

async function psnRequest(ctx, url, init = {}) {
  const res = await ctx.fetchImpl(url, {
    ...init,
    headers: { Authorization: `Bearer ${ctx.token}`, Accept: 'application/json', 'Accept-Language': ctx.locale, ...init.headers },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (res.status === 401) throw apiError('psn-not-connected');
  if (res.status === 429) throw apiError('psn-rate-limited');
  if (res.status === 404) return null;
  if (!res.ok) throw apiError(`psn-http-${res.status}`);
  return res.json();
}

async function fetchAllPages(ctx, pageUrl, pageSize, key, keep) {
  const rows = [];
  for (let offset = 0; offset < MAX_OFFSET; offset += pageSize) {
    const page = await psnRequest(ctx, pageUrl(offset));
    const batch = (page && Array.isArray(page[key]) && page[key]) || [];
    rows.push(...batch.filter((row) => row && keep(row)));
    if (!page || !page.nextOffset || batch.length === 0) break;
  }
  return rows;
}

const fetchTrophyTitles = (ctx) =>
  fetchAllPages(ctx, (offset) => `${API_ROOT}/trophy/v1/users/me/trophyTitles?limit=${TITLE_PAGE}&offset=${offset}`, TITLE_PAGE, 'trophyTitles', (row) =>
    LIST_ID_RE.test(String(row.npCommunicationId || ''))
  );

// The PS4 and PS5 games the account played, with their store pictures, keyed by store title id.
const fetchPlayedGames = (ctx) =>
  fetchAllPages(
    ctx,
    (offset) => `${API_ROOT}/gamelist/v2/users/me/titles?categories=ps4_game,ps5_native_game&limit=${GAMELIST_PAGE}&offset=${offset}`,
    GAMELIST_PAGE,
    'titles',
    (row) => STORE_TITLE_ID_RE.test(String(row.titleId || ''))
  );

const isSecureImage = (image) => Boolean(image) && String(image.url || '').startsWith('https://');

function storeImages(game) {
  const concept = (game && game.concept && game.concept.media && game.concept.media.images) || [];
  const own = (game && game.media && game.media.images) || [];
  return [...concept, ...own].filter(isSecureImage);
}

function pickArt(images) {
  const art = {};
  for (const [slot, types] of Object.entries(ART_TYPES)) {
    for (const type of types) {
      const hit = images.find((image) => image.type === type);
      if (hit) {
        art[slot] = hit.url;
        break;
      }
    }
  }
  return art;
}

/*
  Store title id -> trophy list id, which Sony only answers for titles the account played. Kept in
  title-ids.json, so a second import only asks about games played since.
*/
async function mapTitleIds(ctx, titleIds) {
  const known = readJson(titleIdsFile()) || {};
  const missing = titleIds.filter((id) => !(id in known));
  for (let i = 0; i < missing.length; i += TITLE_ID_BATCH) {
    const batch = missing.slice(i, i + TITLE_ID_BATCH);
    const answer = await psnRequest(ctx, `${API_ROOT}/trophy/v1/users/me/titles/trophyTitles?npTitleIds=${batch.join(',')}`);
    for (const id of batch) known[id] = '';
    for (const entry of (answer && answer.titles) || []) {
      const listId = normalizeListId(entry && entry.trophyTitles && entry.trophyTitles[0] && entry.trophyTitles[0].npCommunicationId);
      if (entry && entry.npTitleId in known && listId) known[entry.npTitleId] = listId;
    }
  }
  if (missing.length) writeJson(titleIdsFile(), known);
  return known;
}

// Pictures and the store's own name per trophy list, for the lists the game list can name.
async function collectStoreInfo(ctx) {
  const games = await fetchPlayedGames(ctx);
  const listByTitle = await mapTitleIds(ctx, [...new Set(games.map((game) => game.titleId))]);
  const info = new Map();
  for (const game of games) {
    const listId = listByTitle[game.titleId];
    if (!listId || info.has(listId)) continue;
    info.set(listId, { name: String(game.localizedName || game.name || '').trim(), img: pickArt(storeImages(game)) });
  }
  return info;
}

const normalizedName = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/[™®©]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

// PS3 and Vita games are not in the game list: the store search finds their pictures by exact name.
async function searchStoreArt(ctx, name) {
  const body = JSON.stringify({ searchTerm: name, domainRequests: [{ domain: 'MobileGames', pagination: { cursor: '', pageSize: '5' } }] });
  const answer = await psnRequest(ctx, `${API_ROOT}/search/v1/universalSearch`, { method: 'POST', body, headers: { 'Content-Type': 'application/json' } });
  const results = (answer && answer.domainResponses && answer.domainResponses[0] && answer.domainResponses[0].results) || [];
  const wanted = normalizedName(name);
  const hit = results.map((result) => result && result.conceptMetadata).find((concept) => concept && normalizedName(concept.name) === wanted);
  return hit ? pickArt(((hit.media && hit.media.images) || []).filter(isSecureImage)) : {};
}

function platformLabel(platform) {
  const parts = String(platform || '').toUpperCase().split(',');
  const main = PLATFORM_ORDER.find((candidate) => parts.includes(candidate)) || parts[0] || '';
  return PLATFORM_LABEL[main] || main;
}

// Sony names some lists "<Game> Trophies" or "Trophées <Game>"; the tile wants the game's name.
function cleanTitleName(value) {
  return String(value || '')
    .replace(/\s+(trophies|trophy set)$/i, '')
    .replace(/^troph[ée]es\s+/i, '')
    .trim();
}

const trophyService = (title) => (title.npServiceName === 'trophy2' ? 'trophy2' : 'trophy');

function parseTime(value) {
  const ms = Date.parse(String(value || ''));
  return Number.isFinite(ms) && ms > 0 ? Math.floor(ms / 1000) : 0;
}

function trophyEntry(definition, earned, groupNames) {
  const id = String(definition.trophyId);
  const rate = Number.parseFloat(earned && earned.trophyEarnedRate);
  const target = Number(definition.trophyProgressTargetValue);
  const groupName = groupNames.get(String(definition.trophyGroupId || 'default'));
  return {
    name: id,
    displayName: String(definition.trophyName || `Trophy ${id}`),
    description: String(definition.trophyDetail || ''),
    hidden: definition.trophyHidden ? 1 : 0,
    type: TYPE_LETTER[definition.trophyType] || 'B',
    icon: definition.trophyIconUrl || '',
    icongray: definition.trophyIconUrl || '',
    ...(Number.isFinite(rate) && rate >= 0 && rate <= 100 ? { rarityPct: rate } : {}),
    ...(groupName ? { category: groupName } : {}),
    ...(target > 0 ? { maxProgress: target } : {}),
  };
}

/*
  One trophy list as the cached schema and unlock state. The DLC groups become each trophy's
  category; the base game's group ("default") carries none.
*/
function buildGameRecord({ title, name, img, definitions, groups, earned }) {
  const groupNames = new Map(
    ((groups && groups.trophyGroups) || []).filter((group) => group && group.trophyGroupId !== 'default').map((group) => [String(group.trophyGroupId), String(group.trophyGroupName || '')])
  );
  const earnedById = new Map(((earned && earned.trophies) || []).map((entry) => [String(entry.trophyId), entry]));
  const list = [];
  const state = {};
  for (const definition of (definitions && definitions.trophies) || []) {
    if (!definition || !Number.isInteger(Number(definition.trophyId))) continue;
    const mine = earnedById.get(String(definition.trophyId));
    const entry = trophyEntry(definition, mine, groupNames);
    list.push(entry);
    const progress = Number(mine && mine.progress);
    if (mine && mine.earned) state[entry.name] = { earned: true, earned_time: parseTime(mine.earnedDateTime) };
    else if (progress > 0) state[entry.name] = { earned: false, progress };
  }
  const schema = {
    listId: normalizeListId(title.npCommunicationId),
    service: trophyService(title),
    name,
    platform: platformLabel(title.trophyTitlePlatform),
    source: SOURCE,
    img: { ...img, ...(title.trophyTitleIconUrl ? { trophyIcon: title.trophyTitleIconUrl } : {}) },
    achievement: { total: list.length, list },
  };
  return { schema, state };
}

function normalizedState(value) {
  const entry = value && typeof value === 'object' ? value : {};
  const time = Number(entry.earned_time);
  const progress = Number(entry.progress);
  return {
    earned: entry.earned === true,
    ...(Number.isFinite(time) && time > 0 ? { earned_time: Math.floor(time) } : {}),
    ...(Number.isFinite(progress) && progress > 0 ? { progress } : {}),
  };
}

// Never clears an unlock, keeps the earliest time and never lets progress go back.
function mergeState(previous, fresh, schemaList) {
  const merged = {};
  for (const trophy of schemaList || []) {
    const id = String(trophy.name);
    const before = normalizedState(previous && previous[id]);
    const after = normalizedState(fresh && fresh[id]);
    const times = [before.earned_time, after.earned_time].filter((time) => time > 0);
    const progress = Math.max(before.progress || 0, after.progress || 0);
    if (before.earned || after.earned) merged[id] = { earned: true, ...(times.length ? { earned_time: Math.min(...times) } : {}) };
    else if (progress > 0) merged[id] = { earned: false, progress };
  }
  return merged;
}

function writeGame(record, meta) {
  const { schema, state } = buildGameRecord(record);
  if (!schema.listId || schema.achievement.list.length === 0) return null;
  const previous = readSchema(schema.listId);
  // A picture the store stopped returning keeps the one found last time.
  if (previous && previous.img) schema.img = { ...previous.img, ...schema.img };
  schema.meta = { ...meta, fetchedAt: Date.now() };
  writeJson(schemaFile(schema.listId), schema);
  writeJson(stateFile(schema.listId), mergeState(readState(schema.listId), state, schema.achievement.list));
  return { schema, created: !previous };
}

/*
  The same list as Sony serves it, from the public trophy-list archive on GitHub: used when Sony
  refuses a list's contents. The archive holds a few languages per list, so English is the fallback.
*/
async function fetchArchivedList(ctx, listId) {
  const lang = String(ctx.locale || '').slice(0, 2).toLowerCase();
  for (const folder of [...new Set([lang, 'en'])].filter(Boolean)) {
    const res = await ctx.fetchImpl(`${PUBLIC_ARCHIVE}/${folder}/${listId}.json`, { signal: AbortSignal.timeout(TIMEOUT_MS) }).catch(() => null);
    if (res && res.ok) {
      const body = await res.json().catch(() => null);
      if (body && Array.isArray(body.trophies)) return body;
    }
  }
  return null;
}

// A refused token or a rate limit must not pass for an empty answer: it stops the work, any
// other refusal falls back (to the archive, to an empty page) instead.
const unlessAccessError = (fallback) => (err) => {
  if (err && (err.code === 'psn-not-connected' || err.code === 'psn-rate-limited')) throw err;
  return fallback;
};

// A list's trophies and DLC groups in the context's language, whoever played it.
async function fetchDefinitions(ctx, title, { withGroups = Number(title.trophyGroupCount) > 1 } = {}) {
  const listId = normalizeListId(title.npCommunicationId);
  const query = `npServiceName=${trophyService(title)}`;
  let definitions = await psnRequest(ctx, `${API_ROOT}/trophy/v1/npCommunicationIds/${listId}/trophyGroups/all/trophies?${query}`).catch(unlessAccessError(null));
  let groups = withGroups ? await psnRequest(ctx, `${API_ROOT}/trophy/v1/npCommunicationIds/${listId}/trophyGroups?${query}`).catch(unlessAccessError(null)) : null;
  if (!definitions || !Array.isArray(definitions.trophies)) {
    const archived = await fetchArchivedList(ctx, listId);
    definitions = archived;
    groups = groups || archived;
  }
  return { definitions, groups };
}

// `owner` is 'me', or the account id of a public player whose unlocks only lend their rates.
async function fetchTrophyList(ctx, title, owner = 'me') {
  const listId = normalizeListId(title.npCommunicationId);
  const query = `npServiceName=${trophyService(title)}`;
  const { definitions, groups } = await fetchDefinitions(ctx, title);
  const earned = await psnRequest(ctx, `${API_ROOT}/trophy/v1/users/${owner}/npCommunicationIds/${listId}/trophyGroups/all/trophies?${query}`);
  return { definitions, earned, groups };
}

// "(PlayStation®5)", "PS4™ & PS5™", "(PS4)": Sony gives the PS4 and PS5 titles of one game the same
// store name, so the console a store name carries can be the wrong one for the list.
const STORE_CONSOLE_TAG = /\s*[-:]?\s*\(?\s*(playstation\s*®?\s*[45]|ps[45]\s*™?(\s*(&|and|\/)\s*ps[45]\s*™?)?)\s*\)?\s*$/i;
const withoutConsoleTag = (name) => name.replace(STORE_CONSOLE_TAG, '').trim() || name;

// The tile names, with the console added where one game has a list on two of them.
function displayNames(titles, storeInfo) {
  const names = new Map(
    titles.map((title) => [title.npCommunicationId, withoutConsoleTag((storeInfo.get(title.npCommunicationId) || {}).name || cleanTitleName(title.trophyTitleName))])
  );
  const counts = new Map();
  for (const name of names.values()) {
    const key = normalizedName(name);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  for (const title of titles) {
    const name = names.get(title.npCommunicationId);
    if (counts.get(normalizedName(name)) > 1) names.set(title.npCommunicationId, `${name} (${platformLabel(title.trophyTitlePlatform)})`);
  }
  return names;
}

// The game's name and the tile's name of a saved list. Lists saved before 3.12.2 still carry the
// store's console tag ("Grand Theft Auto V (PlayStation®5) (PS4)"), so it is dropped on reading too.
function savedNames(schema) {
  const name = String(schema.name || '').trim();
  const suffix = schema.platform ? ` (${schema.platform})` : '';
  const labelled = suffix !== '' && name.endsWith(suffix) && name.length > suffix.length;
  const game = withoutConsoleTag(labelled ? name.slice(0, -suffix.length) : name);
  return { game, tile: labelled ? `${game}${suffix}` : game };
}

const CONSOLE_RANK = ['PS5', 'PS4', 'PS3', 'PS Vita'];
const consoleRank = (schema) => (CONSOLE_RANK.includes(schema.platform) ? CONSOLE_RANK.indexOf(schema.platform) : CONSOLE_RANK.length);

/*
  For a library that shows one card per game: each list that joins the same game's list on another
  console (GTA V on PS4 and PS5), mapped to the list that keeps the card - the one with the most
  trophies earned, then the newest console. Two games that only share a name share few trophy
  titles and stay apart, and so does a list whose earned trophies would not all find their match.
*/
function sameGameLists(appids) {
  const { indexByTitle, remapUnlocksOntoSchema } = require('../util/crossSchemaUnlocks.js');
  const groups = new Map();
  for (const appid of appids) {
    const schema = readSchema(normalizeListId(appid));
    const key = schema ? normalizedName(savedNames(schema).game) : '';
    if (key) groups.set(key, [...(groups.get(key) || []), { appid: String(appid), schema, earned: getAchievements(appid) }]);
  }
  const joins = new Map();
  for (const lists of groups.values()) {
    if (lists.length < 2) continue;
    const count = (list) => Object.keys(list.earned).length;
    const [holder, ...others] = [...lists].sort((a, b) => count(b) - count(a) || consoleRank(a.schema) - consoleRank(b.schema) || a.appid.localeCompare(b.appid));
    const holderList = holder.schema.achievement.list;
    const holderTitles = indexByTitle(holderList);
    for (const other of others) {
      const titles = indexByTitle(other.schema.achievement.list);
      const shared = [...titles.keys()].filter((title) => holderTitles.has(title)).length;
      const sameGame = shared > 0 && shared * 2 > Math.min(titles.size, holderTitles.size);
      if (sameGame && Object.keys(remapUnlocksOntoSchema(other.earned, other.schema.achievement.list, holderList)).length === count(other)) {
        joins.set(other.appid, holder.appid);
      }
    }
  }
  return joins;
}

// A change of app language counts as a change: the trophy texts are fetched in the new one.
function isFresh(cached, title, locale) {
  const meta = (cached && cached.meta) || {};
  return meta.lastUpdated === title.lastUpdatedDateTime && meta.locale === locale && Date.now() - Number(meta.fetchedAt || 0) < SCHEMA_MAX_AGE_MS;
}

async function importOne(ctx, title, name, storeInfo) {
  const listId = normalizeListId(title.npCommunicationId);
  const cached = readSchema(listId);
  let img = (storeInfo.get(title.npCommunicationId) || {}).img || {};
  if (!img.header && !(cached && cached.img && cached.img.header)) img = await searchStoreArt(ctx, cleanTitleName(title.trophyTitleName));
  const trophies = await fetchTrophyList(ctx, title);
  return writeGame({ title, name, img, ...trophies }, { lastUpdated: title.lastUpdatedDateTime, locale: ctx.locale });
}

/*
  A list from outside the account, added from the catalog: a public player who has it lends its
  rates, never its unlocks, so the game starts with nothing earned.
*/
async function addOtherList(ctx, title, holderAccountId) {
  const cached = readSchema(normalizeListId(title.npCommunicationId));
  const name = cleanTitleName(title.trophyTitleName);
  const img = cached && cached.img && cached.img.header ? {} : await searchStoreArt(ctx, name);
  const trophies = await fetchTrophyList(ctx, { ...title, trophyGroupCount: 2 }, holderAccountId);
  const rates = { trophies: ((trophies.earned && trophies.earned.trophies) || []).map((entry) => ({ trophyId: entry.trophyId, trophyEarnedRate: entry.trophyEarnedRate })) };
  return writeGame({ title, name, img, ...trophies, earned: rates }, { added: true, locale: ctx.locale });
}

async function createContext(options = {}) {
  const auth = options.auth || require('../util/psnAuth.js');
  const token = await auth.accessToken(options.authOptions);
  if (!token) throw apiError('psn-not-connected');
  const locale = options.locale || PSN_LOCALES[String(options.lang || '').toLowerCase()] || require('./xboxPc.js').xboxLocaleForLang(options.lang);
  return { token, locale, fetchImpl: options.fetchImpl || fetch };
}

/*
  Every trophy list of the account, most recently played first. A list whose last update has not
  moved since the last import is skipped; a rate limit stops the import, and the next one resumes
  where it stopped.
*/
async function importLibrary(options = {}) {
  const ctx = await createContext(options);
  const delayMs = Number.isFinite(options.delayMs) ? options.delayMs : IMPORT_DELAY_MS;
  const titles = await fetchTrophyTitles(ctx);
  const storeInfo = await collectStoreInfo(ctx);
  const names = displayNames(titles, storeInfo);
  const result = { total: titles.length, created: 0, updated: 0, unchanged: 0, skipped: 0, failed: 0, rateLimited: false };
  for (let index = 0; index < titles.length; index += 1) {
    const title = titles[index];
    const name = names.get(title.npCommunicationId);
    options.onProgress?.({ current: index + 1, total: titles.length, detail: name, appid: toAppid(normalizeListId(title.npCommunicationId)) });
    const listId = normalizeListId(title.npCommunicationId);
    const cached = readSchema(listId);
    if (!options.force && isFresh(cached, title, ctx.locale)) {
      // A better tile name needs no trip to Sony: only the name is rewritten.
      if (name && cached.name !== name) writeJson(schemaFile(listId), { ...cached, name });
      result.unchanged += 1;
      continue;
    }
    try {
      const written = await importOne(ctx, title, name, storeInfo);
      if (!written) result.skipped += 1;
      else result[written.created ? 'created' : 'updated'] += 1;
    } catch (err) {
      if (err && err.code === 'psn-not-connected') throw err;
      if (err && err.code === 'psn-rate-limited') {
        result.rateLimited = true;
        break;
      }
      result.failed += 1;
    }
    if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return result;
}

function listCachedTitles() {
  let entries = [];
  try {
    entries = fs.readdirSync(cacheRoot());
  } catch {
    return [];
  }
  return entries.filter((name) => normalizeListId(name) === name && fs.existsSync(schemaFile(name))).map(toAppid);
}

function cachedTitleName(appid) {
  const schema = readSchema(normalizeListId(appid));
  return schema ? savedNames(schema).tile : '';
}

// The name without the console, for a card that holds the game's lists from several consoles.
function cachedGameName(appid) {
  const schema = readSchema(normalizeListId(appid));
  return schema ? savedNames(schema).game : '';
}

function getGameData(appid) {
  const listId = normalizeListId(appid);
  const schema = listId ? readSchema(listId) : null;
  if (!schema) return null;
  const state = readState(listId);
  const list = schema.achievement.list.map((trophy) => {
    const entry = normalizedState(state[trophy.name]);
    const progress = trophy.maxProgress > 0 ? { CurProgress: entry.earned ? trophy.maxProgress : entry.progress || 0, MaxProgress: trophy.maxProgress } : {};
    return { ...trophy, Achieved: entry.earned, UnlockTime: entry.earned_time || 0, ...progress };
  });
  const { trophyIcon, ...img } = schema.img || {};
  return {
    appid: toAppid(listId),
    name: savedNames(schema).tile || listId,
    source: SOURCE,
    system: 'playstation',
    npCommId: listId,
    ...(schema.meta && schema.meta.added ? { psnAdded: true } : {}),
    platform: schema.platform || '',
    // A PS3 or Vita list may have no store picture: its trophy-list icon stands in until one is found.
    img: {
      ...img,
      icon: img.icon || trophyIcon,
      header: img.header || trophyIcon,
      ...(img.header ? {} : { headerStandIn: true }),
      overlay: true,
    },
    achievement: { total: list.length, unlocked: list.filter((trophy) => trophy.Achieved).length, list },
  };
}

// The unlock map the aggregator merges into the game, keyed by trophy id.
function getAchievements(appid) {
  const unlocks = {};
  const listId = normalizeListId(appid);
  if (!listId) return unlocks;
  for (const [id, value] of Object.entries(readState(listId))) {
    const entry = normalizedState(value);
    if (entry.earned) unlocks[id] = { Achieved: true, UnlockTime: entry.earned_time || 0 };
  }
  return unlocks;
}

// A list read for the card of its game's list on another console: the trophies match by title.
function unlocksForSchema(appid, schemaList) {
  const schema = readSchema(normalizeListId(appid));
  if (!schema) return {};
  return require('../util/crossSchemaUnlocks.js').remapUnlocksOntoSchema(getAchievements(appid), schema.achievement.list, schemaList);
}

module.exports = {
  SOURCE,
  DATA_TYPE,
  API_ROOT,
  TITLE_PAGE,
  MAX_OFFSET,
  setUserDataPath,
  normalizeListId,
  cacheRoot,
  readJson,
  writeJson,
  createContext,
  psnRequest,
  apiError,
  unlessAccessError,
  trophyService,
  fetchAllPages,
  fetchDefinitions,
  TYPE_LETTER,
  normalizedName,
  cleanTitleName,
  platformLabel,
  addOtherList,
  readSchema,
  displayNames,
  importLibrary,
  listCachedTitles,
  cachedTitleName,
  cachedGameName,
  sameGameLists,
  getGameData,
  getAchievements,
  unlocksForSchema,
};
