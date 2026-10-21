'use strict';

/*
  Every PlayStation trophy list, not only the account's. Sony has no catalog to search and gives a
  list's rates only to an account that played it, but it shows any public player's lists and rates:
  a few public trophy hunters, with nearly 20,000 lists each, stand in for both.
*/

const fs = require('fs');
const path = require('path');
const lib = require('./psnLibrary.js');

// Public profiles with the most trophy lists; one going private only shrinks the catalog.
const PUBLIC_HUNTERS = ['ikemenzi', 'dav1d_123', 'RobThanatos', 'yalkanderi2007'];
const ACCOUNT_ID_RE = /^\d{1,20}$/;
const ACCOUNTS_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
// Like the rest of the app's remote data: looked at again every three days.
const CATALOG_MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000;
const SEARCH_LIMIT = 30;
// Sony names a list in the language asked for ("Trophées de X"): the catalog keeps the English name,
// the one every store and save uses. A catalog built otherwise is started again.
const CATALOG_LOCALE = 'en-US';
const CATALOG_VERSION = 2;
// Title ids asked about in one store lookup.
const TITLE_IDS_PER_ASK = 5;

const accountsFile = () => path.join(lib.cacheRoot(), 'public-accounts.json');
const catalogFile = () => path.join(lib.cacheRoot(), 'catalog.json');

const fresh = (stamp, maxAge) => Date.now() - Number(stamp || 0) < maxAge;

const { unlessAccessError, apiError } = lib;

async function resolveAccountId(ctx, onlineId) {
  const body = JSON.stringify({ searchTerm: onlineId, domainRequests: [{ domain: 'SocialAllAccounts', pagination: { cursor: '', pageSize: '5' } }] });
  const answer = await lib.psnRequest(ctx, `${lib.API_ROOT}/search/v1/universalSearch`, { method: 'POST', body, headers: { 'Content-Type': 'application/json' } });
  const results = (answer && answer.domainResponses && answer.domainResponses[0] && answer.domainResponses[0].results) || [];
  const hit = results.map((result) => result && result.socialMetadata).find((meta) => meta && String(meta.onlineId).toLowerCase() === onlineId.toLowerCase());
  const accountId = String((hit && hit.accountId) || '');
  return ACCOUNT_ID_RE.test(accountId) ? accountId : '';
}

// The hunters' account ids, looked up by name once a month.
async function publicAccounts(ctx) {
  const cached = lib.readJson(accountsFile());
  const sameHunters = cached && String(cached.names) === String(PUBLIC_HUNTERS);
  if (sameHunters && Array.isArray(cached.ids) && cached.ids.length && fresh(cached.resolvedAt, ACCOUNTS_MAX_AGE_MS)) return cached.ids;
  const ids = [];
  for (const onlineId of PUBLIC_HUNTERS) {
    const id = await resolveAccountId(ctx, onlineId).catch(unlessAccessError(''));
    if (id) ids.push(id);
  }
  if (ids.length) lib.writeJson(accountsFile(), { resolvedAt: Date.now(), names: PUBLIC_HUNTERS, ids });
  return ids;
}

const toEntry = (row, holder) => ({
  id: lib.normalizeListId(row.npCommunicationId),
  name: lib.cleanTitleName(row.trophyTitleName),
  platform: lib.platformLabel(row.trophyTitlePlatform),
  service: lib.trophyService(row),
  icon: String(row.trophyTitleIconUrl || '').startsWith('https://') ? row.trophyTitleIconUrl : '',
  holder,
});

let catalogMemo = null;
let refreshing = null;

const storedCatalog = () => {
  if (!catalogMemo) {
    const cached = lib.readJson(catalogFile());
    const usable = cached && cached.version === CATALOG_VERSION && Array.isArray(cached.lists);
    catalogMemo = usable ? cached : { version: CATALOG_VERSION, builtAt: 0, lists: [], walked: [] };
  }
  return catalogMemo;
};

/*
  A hunter's lists come most recently played first, so once a hunter was read in full a refresh stops
  at the first page that holds nothing new: a few requests every three days. Each page is searchable
  as soon as it lands.
*/
async function refreshCatalog(appCtx) {
  const ctx = { ...appCtx, locale: CATALOG_LOCALE };
  const stored = storedCatalog();
  const lists = new Map(stored.lists.map((entry) => [entry.id, entry]));
  const walked = new Set(stored.walked || []);
  for (const holder of await publicAccounts(ctx)) {
    const known = walked.has(holder);
    let complete = false;
    for (let offset = 0; offset < lib.MAX_OFFSET; offset += lib.TITLE_PAGE) {
      const page = await lib.psnRequest(ctx, `${lib.API_ROOT}/trophy/v1/users/${holder}/trophyTitles?limit=${lib.TITLE_PAGE}&offset=${offset}`).catch(unlessAccessError(null));
      const rows = ((page && page.trophyTitles) || []).filter((row) => row && lib.normalizeListId(row.npCommunicationId));
      let added = 0;
      for (const row of rows) {
        const entry = toEntry(row, holder);
        if (!lists.has(entry.id)) {
          lists.set(entry.id, entry);
          added += 1;
        }
      }
      catalogMemo = { ...catalogMemo, lists: [...lists.values()] };
      if (!page) break;
      complete = !page.nextOffset || rows.length === 0 || (known && added === 0);
      if (complete) break;
    }
    // A walk cut short by a failed page is read in full again next time.
    if (complete) walked.add(holder);
  }
  if (lists.size === 0) throw apiError('psn-catalog-empty');
  catalogMemo = { version: CATALOG_VERSION, builtAt: Date.now(), lists: [...lists.values()], walked: [...walked] };
  lib.writeJson(catalogFile(), catalogMemo);
  return catalogMemo;
}

// Starts a refresh when the catalog is three days old, at most one at a time; never waits for it.
function ensureCatalog(ctx) {
  if (!refreshing && !fresh(storedCatalog().builtAt, CATALOG_MAX_AGE_MS)) {
    refreshing = refreshCatalog(ctx).finally(() => {
      refreshing = null;
    });
    // A failed refresh keeps the stored catalog; the next search or check tries again.
    refreshing.catch(() => {});
  }
  return refreshing;
}

async function refreshInBackground(options = {}) {
  const ctx = await lib.createContext(options);
  await ensureCatalog(ctx);
}

/*
  Public players with ordinary libraries: the hunters' catalogs miss many big releases, which an
  ordinary player often owns. Taken from a hunter's public friends list, once a month.
*/
const PLAYERS_MAX = 12;
const playersFile = () => path.join(lib.cacheRoot(), 'public-players.json');

async function publicPlayers(ctx) {
  const cached = lib.readJson(playersFile());
  if (cached && Array.isArray(cached.ids) && cached.ids.length && fresh(cached.resolvedAt, ACCOUNTS_MAX_AGE_MS)) return cached.ids;
  const hunters = await publicAccounts(ctx);
  let ids = [];
  for (const hunter of hunters) {
    const answer = await lib.psnRequest(ctx, `${lib.API_ROOT}/userProfile/v1/internal/users/${hunter}/friends?limit=${PLAYERS_MAX * 4}`).catch(unlessAccessError(null));
    ids = ((answer && answer.friends) || []).filter((id) => ACCOUNT_ID_RE.test(String(id)) && !hunters.includes(id));
    if (ids.length) break;
  }
  ids = ids.slice(0, PLAYERS_MAX);
  if (ids.length) lib.writeJson(playersFile(), { resolvedAt: Date.now(), ids });
  return ids;
}

// The store's title ids for a game of exactly this name (PS4 CUSA..., PS5 PPSA...).
async function storeTitleIds(ctx, name) {
  const wanted = lib.normalizedName(name);
  const body = JSON.stringify({ searchTerm: name, domainRequests: [{ domain: 'MobileGames', pagination: { cursor: '', pageSize: '5' } }] });
  const answer = await lib.psnRequest(ctx, `${lib.API_ROOT}/search/v1/universalSearch`, { method: 'POST', body, headers: { 'Content-Type': 'application/json' } }).catch(unlessAccessError(null));
  const results = (answer && answer.domainResponses && answer.domainResponses[0] && answer.domainResponses[0].results) || [];
  const concept = results.map((result) => result && result.conceptMetadata).find((meta) => meta && [meta.nameEn, meta.name].some((value) => lib.normalizedName(value) === wanted));
  return ((concept && concept.titleIds) || []).filter((id) => /^[A-Z]{4}\d{5}_00$/.test(String(id)));
}


/*
  A game's trophy lists through the store: its title ids, then the first player who owns one of them,
  the signed-in account first. Each one asked costs a request, so only a few are.
*/
async function listsFromStore(appCtx, name) {
  const ctx = { ...appCtx, locale: CATALOG_LOCALE };
  const titleIds = (await storeTitleIds(ctx, name)).slice(0, TITLE_IDS_PER_ASK);
  if (!titleIds.length) return [];
  const owners = ['me', ...(await publicAccounts(ctx)), ...(await publicPlayers(ctx))];
  for (const owner of owners) {
    const answer = await lib.psnRequest(ctx, `${lib.API_ROOT}/trophy/v1/users/${owner}/titles/trophyTitles?npTitleIds=${titleIds.join(',')}`).catch(unlessAccessError(null));
    const rows = ((answer && answer.titles) || []).flatMap((title) => title.trophyTitles || []).filter((row) => row && lib.normalizeListId(row.npCommunicationId));
    if (rows.length) return rows.map((row) => toEntry(row));
  }
  return [];
}

// The catalog lists that bear exactly this name, without the hunter who holds them.
function listsNamed(name) {
  const wanted = lib.normalizedName(lib.cleanTitleName(name));
  if (!wanted) return [];
  return storedCatalog()
    .lists.filter((entry) => lib.normalizedName(entry.name) === wanted)
    .map((entry) => ({ ...entry, holder: undefined }));
}

// Every word typed must appear in the name; an exact name, then a name that starts with it, come first.
function rankMatches(lists, query, limit = SEARCH_LIMIT) {
  const wanted = lib.normalizedName(query);
  const words = wanted.split(' ').filter(Boolean);
  if (words.length === 0) return [];
  const scored = [];
  for (const entry of lists) {
    const name = lib.normalizedName(entry.name);
    if (!words.every((word) => name.includes(word))) continue;
    const rank = name === wanted ? 0 : name.startsWith(wanted) ? 1 : 2;
    scored.push({ entry, rank, length: name.length });
  }
  scored.sort((a, b) => a.rank - b.rank || a.length - b.length);
  return scored.slice(0, limit).map(({ entry }) => entry);
}

// Answers at once from what the catalog holds now; `loading` says a first load is still filling it.
async function search(query, options = {}) {
  const ctx = await lib.createContext(options);
  ensureCatalog(ctx);
  const { builtAt, lists } = storedCatalog();
  const results = rankMatches(lists, query).map((entry) => {
    const owned = lib.readSchema(entry.id);
    return { ...entry, holder: undefined, inLibrary: Boolean(owned), added: Boolean(owned && owned.meta && owned.meta.added) };
  });
  return { results, loading: Boolean(refreshing) && !builtAt, count: lists.length };
}

async function addGame(listId, options = {}) {
  const id = lib.normalizeListId(listId);
  if (!id) throw apiError('psn-list-invalid');
  // A list already in the library is the account's own, or was added before: it stays as it is.
  const existing = lib.readSchema(id);
  if (existing) return { appid: `psn-${id}`, name: existing.name };
  const ctx = await lib.createContext(options);
  const entry = storedCatalog().lists.find((candidate) => candidate.id === id);
  if (!entry) throw apiError('psn-list-unknown');
  const title = { npCommunicationId: id, npServiceName: entry.service, trophyTitleName: entry.name, trophyTitlePlatform: entry.platform, trophyTitleIconUrl: entry.icon };
  const written = await lib.addOtherList(ctx, title, entry.holder);
  if (!written) throw apiError('psn-list-empty');
  return { appid: `psn-${id}`, name: written.schema.name };
}

// The lists added from the catalog, as the search shows them.
function addedGames() {
  return lib
    .listCachedTitles()
    .map((appid) => lib.readSchema(lib.normalizeListId(appid)))
    .filter((schema) => schema && schema.meta && schema.meta.added)
    .map((schema) => ({ id: schema.listId, name: schema.name, platform: schema.platform, icon: (schema.img && schema.img.trophyIcon) || '', inLibrary: true, added: true }));
}

// Only a list added from the catalog goes: the account's own lists come back with every import.
function removeGame(listId) {
  const id = lib.normalizeListId(listId);
  const schema = id ? lib.readSchema(id) : null;
  if (!schema || !schema.meta || !schema.meta.added) throw apiError('psn-list-not-added');
  fs.rmSync(path.join(lib.cacheRoot(), id), { recursive: true, force: true });
  return { appid: `psn-${id}`, name: schema.name };
}

/*
  Official rates for a list the signed-in account never played, from a hunter who did: an RPCS3 or
  shadPS4 game then shows Sony's own figures instead of Exophase's.
*/
async function publicRates({ npCommId, service } = {}, options = {}) {
  const id = lib.normalizeListId(npCommId);
  if (!id) return { ok: false, error: 'psn-list-invalid' };
  const ctx = await lib.createContext(options);
  // A game page must not wait for the whole catalog: without one at hand, every hunter is asked.
  const entry = storedCatalog().lists.find((candidate) => candidate.id === id);
  const holders = entry ? [entry.holder] : await publicAccounts(ctx);
  const npService = service === 'trophy2' ? 'trophy2' : (entry && entry.service) || 'trophy';
  for (const holder of holders) {
    const body = await lib.psnRequest(ctx, `${lib.API_ROOT}/trophy/v1/users/${holder}/npCommunicationIds/${id}/trophyGroups/all/trophies?npServiceName=${npService}`).catch(unlessAccessError(null));
    const entries = ((body && body.trophies) || [])
      .map((trophy) => ({ name: String(trophy.trophyId), percent: Number.parseFloat(trophy.trophyEarnedRate) }))
      .filter((rate) => /^\d+$/.test(rate.name) && Number.isFinite(rate.percent) && rate.percent >= 0 && rate.percent <= 100);
    if (entries.length) return { ok: true, entries };
  }
  return { ok: false, error: 'psn-not-on-account' };
}

module.exports = { PUBLIC_HUNTERS, rankMatches, search, addGame, publicRates, refreshInBackground, listsNamed, listsFromStore, addedGames, removeGame };
