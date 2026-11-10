'use strict';

/*
  Loads a game page's details when the page opens, never during a scan: Steam appdetails is limited
  per address. Each answer is cached on disk on its own (Steam per language, the game's own store:
  egdata or the Epic page, GOG, the Microsoft Store; a GamesDB release, a title search), so a page is
  rebuilt from the cache without asking anything. A source
  that could not be reached is not cached and is asked again next time.
*/

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { writeFileAtomicSync } = require('./replaceFile.js');
const { steamAppidOf, rawAppId } = require('./platformId.js');
const sourceIdentity = require('./sourceIdentity.js');
const { resolveSteamStoreDetails } = require('./steamMetadata.js');
const details = require('./gameDetails.js');
const stores = require('./gameDetailsStores.js');
const gameRatings = require('./gameRatings.js');

const DAY_MS = 24 * 60 * 60 * 1000;
const FOUND_TTL_MS = 14 * DAY_MS;
// "Nothing there" is a real answer, but stores add pages: ask again sooner.
const EMPTY_TTL_MS = 2 * DAY_MS;
const GAMESDB = 'https://gamesdb.gog.com';
const EPIC_CONTENT = 'https://store-content.ak.epicgames.com/api';
const EGDATA = 'https://api.egdata.app';
const GOG_API = 'https://api.gog.com';
const MICROSOFT = 'https://displaycatalog.mp.microsoft.com/v7.0';
const GOG_CATALOG = 'https://catalog.gog.com';
const METACRITIC = 'https://backend.metacritic.com';
const STEAM_STORE = 'https://store.steampowered.com';
const SAFE_ID = /^[\w.:-]{1,200}$/;
// An id that goes into a store url path: only dots would be a ".." step to another route of the API.
const isSafeSegment = (value) => SAFE_ID.test(value) && !/^\.+$/.test(value);
const STEAM_LANGUAGE = /^[a-z]{2,24}$/;
const steamKey = (appid, lang) => `steam:${appid}:${lang}`;

function gameRequest(game) {
  if (!game || typeof game !== 'object') return null;
  const appid = String(game.appid || '');
  if (!isSafeSegment(appid)) return null;
  const text = (value, max) => (typeof value === 'string' ? value.slice(0, max) : '');
  return { appid, source: text(game.source, 80), system: text(game.system, 80), steamappid: text(game.steamappid, 20), name: text(game.name, 240), console: text(game.console, 60), detailsTitle: text(game.detailsTitle, 240) };
}

const cacheFile = (ctx, key) => path.join(ctx.cacheDir, `${crypto.createHash('sha1').update(key).digest('hex')}.json`);

function readCache(ctx, key) {
  try {
    const entry = JSON.parse(fs.readFileSync(cacheFile(ctx, key), 'utf8'));
    if (!entry || entry.key !== key || !Number.isFinite(entry.fetchedAt)) return undefined;
    const ttl = entry.value ? FOUND_TTL_MS : EMPTY_TTL_MS;
    return ctx.now() - entry.fetchedAt < ttl ? entry.value : undefined;
  } catch {
    return undefined;
  }
}

function writeCache(ctx, key, value) {
  try {
    writeFileAtomicSync(cacheFile(ctx, key), JSON.stringify({ key, fetchedAt: ctx.now(), value: value || null }));
  } catch (err) {
    ctx.log(`could not cache ${key}: ${err.message || err}`);
  }
}

// The cached answer, else one fetch; `ask` returns undefined when the host never answered.
async function cached(ctx, key, force, ask) {
  const hit = force ? undefined : readCache(ctx, key);
  if (hit !== undefined) return { value: hit };
  const value = await ask();
  if (value === undefined) return { value: null, networkError: true };
  writeCache(ctx, key, value);
  return { value };
}

// GamesDB: a 404 means "no such release", anything else means it did not answer.
async function gamesDbJson(ctx, url) {
  try {
    return await ctx.getJson(url);
  } catch (err) {
    if (err && err.status === 404) return null;
    ctx.log(`GamesDB did not answer ${url}: ${err.message || err}`);
    return undefined;
  }
}

async function steamPart(ctx, steamAppid, lang, force) {
  if (!steamAppid) return { value: null };
  const ask = async () => {
    const store = await ctx.fetchSteamStore(steamAppid, lang).catch((err) => {
      ctx.log(`Steam store did not answer ${steamAppid}: ${err.message || err}`);
      return null;
    });
    if (!store || !store.answered) return undefined;
    return store.data ? resolveSteamStoreDetails(store.data) : null;
  };
  const part = await cached(ctx, steamKey(steamAppid, lang), force, ask);
  if (part.value || lang === 'english') return part;
  const english = readCache(ctx, steamKey(steamAppid, 'english'));
  return english ? { value: english, networkError: part.networkError } : part;
}

// Epic's mapping of namespaces to store pages, fetched once per session.
async function epicSlug(ctx, appid) {
  if (!ctx.epicMapping) {
    ctx.epicMapping = ctx.getJson(`${EPIC_CONTENT}/content/productmapping`).catch((err) => {
      ctx.epicMapping = null;
      ctx.log(`Epic product mapping unavailable: ${err.message || err}`);
      return null;
    });
  }
  const mapping = await ctx.epicMapping;
  if (mapping === null) return undefined;
  const slug = mapping && typeof mapping === 'object' ? mapping[appid] : '';
  return typeof slug === 'string' && /^[\w-]{1,120}$/.test(slug) ? slug : null;
}

// A store answer: null for a 404 ("not there"), undefined when the host did not answer.
async function storeJson(ctx, url) {
  try {
    return await ctx.getJson(url);
  } catch (err) {
    if (err && err.status === 404) return null;
    ctx.log(`no answer from ${url}: ${err.message || err}`);
    return undefined;
  }
}

// Epic's own store page, the older and thinner source: kept for the games egdata does not know.
async function epicPagePart(ctx, game, lang, force) {
  const tag = stores.storeLocale(lang);
  return cached(ctx, `epic:${game.appid}:${tag}`, force, async () => {
    const slug = await epicSlug(ctx, game.appid);
    if (!slug) return slug;
    const page = await storeJson(ctx, `${EPIC_CONTENT}/${tag}/content/products/${slug}`);
    return page ? details.fromEpicProduct(page) : page;
  });
}

// Achievement sources name an Epic game by its namespace, or by an artifact id that egdata maps to one.
async function egdataOffer(ctx, appid, locale) {
  const offer = await storeJson(ctx, `${EGDATA}/sandboxes/${encodeURIComponent(appid)}/base-game?locale=${locale}`);
  if (offer !== null) return offer;
  const asset = await storeJson(ctx, `${EGDATA}/assets/${encodeURIComponent(appid)}`);
  const namespace = asset && String(asset.artifactId || '').toLowerCase() === appid.toLowerCase() ? String(asset.namespace || '') : '';
  if (!isSafeSegment(namespace)) return asset === undefined ? undefined : null;
  return storeJson(ctx, `${EGDATA}/sandboxes/${encodeURIComponent(namespace)}/base-game?locale=${locale}`);
}

async function egdataPart(ctx, game, lang, force) {
  const locale = stores.epicLocale(lang);
  return cached(ctx, `egdata:${game.appid}:${locale}`, force, async () => {
    const offer = await egdataOffer(ctx, game.appid, locale);
    if (!offer || !isSafeSegment(String(offer.id || ''))) return offer && null;
    const id = encodeURIComponent(offer.id);
    const [media, polls] = await Promise.all([storeJson(ctx, `${EGDATA}/offers/${id}/media`), storeJson(ctx, `${EGDATA}/offers/${id}/polls`)]);
    // A 404 there is an offer without them; no answer is asked again rather than cached half-empty.
    if (media === undefined || polls === undefined) return undefined;
    return stores.fromEgdata(offer, media, polls);
  });
}

async function epicPart(ctx, game, lang, force) {
  const fresh = await egdataPart(ctx, game, lang, force);
  if (fresh.value) return fresh;
  const page = await epicPagePart(ctx, game, lang, force);
  return page.value ? page : { value: null, networkError: fresh.networkError || page.networkError };
}

async function gogPart(ctx, game, lang, force) {
  const id = rawAppId(game.appid);
  if (!/^\d{1,12}$/.test(id)) return { value: null };
  const tag = stores.storeLocale(lang);
  const page = await cached(ctx, `gog:${id}:${tag}`, force, async () => {
    const product = await storeJson(ctx, `${GOG_API}/products/${id}?expand=description,screenshots,videos&locale=${tag}`);
    return product ? stores.fromGogProduct(product) : product;
  });
  const title = page.value ? details.searchTitle(page.value.title) : '';
  if (!title) return page;
  // The players rating lives in GOG's catalogue, searched by title and matched by this product id;
  // cached on its own so a catalogue that does not answer never costs the page.
  const rating = await cached(ctx, `gog-rating:${id}`, force, async () => {
    const catalog = await storeJson(ctx, `${GOG_CATALOG}/v1/catalog?query=like:${encodeURIComponent(title)}&limit=20`);
    return catalog ? { ratings: gameRatings.gogRating(catalog, id) } : catalog;
  });
  const value = { ...page.value, ratings: (rating.value && rating.value.ratings) || [] };
  return { value, networkError: page.networkError || rating.networkError };
}

// Steam's players rating, for a game with a Steam appid: cached on its own, beside the store page.
async function steamReviewsPart(ctx, steamAppid, force) {
  if (!/^\d{1,12}$/.test(String(steamAppid || ''))) return { value: null };
  return cached(ctx, `steam-reviews:${steamAppid}`, force, async () => {
    const answer = await storeJson(ctx, `${STEAM_STORE}/appreviewhistogram/${steamAppid}?l=english&review_score_preference=0`);
    if (!answer) return answer;
    const ratings = gameRatings.steamReviews(answer, steamAppid);
    return ratings.length ? { ratings } : null;
  });
}

// Metacritic, for every game: its critics and players scores, by exact title on the game's platform.
async function metacriticPart(ctx, game, force) {
  const title = details.searchTitle(details.ownTitle(game));
  if (!title) return { value: null };
  const platforms = gameRatings.metacriticPlatforms(game);
  const match = await cached(ctx, `metacritic-search:${details.titleKey(title)}:${platforms.join(',')}`, force, async () => {
    const answer = await storeJson(ctx, `${METACRITIC}/finder/metacritic/search/${encodeURIComponent(title)}/web?offset=0&limit=20&mcoTypeId=13`);
    if (!answer) return answer;
    const slug = gameRatings.chooseMetacriticGame(answer, title, platforms);
    return slug ? { slug } : null;
  });
  const slug = match.value && /^[a-z0-9-]{1,120}$/.test(String(match.value.slug)) ? match.value.slug : '';
  if (!slug) return { value: null, networkError: match.networkError };
  return cached(ctx, `metacritic:${slug}`, force, async () => {
    const stats = (who) => storeJson(ctx, `${METACRITIC}/reviews/metacritic/${who}/games/${slug}/stats/web`);
    const [critic, user] = await Promise.all([stats('critic'), stats('user')]);
    if (critic === undefined || user === undefined) return undefined;
    const ratings = gameRatings.metacriticRatings(slug, critic, user);
    return ratings.length ? { ratings } : null;
  });
}

// The Microsoft Store knows Xbox PC games by a product id the sources do not carry: by exact title.
async function microsoftPart(ctx, game, lang, force) {
  const title = details.searchTitle(game.name);
  if (!title) return { value: null };
  const { market, language } = stores.microsoftMarket(lang);
  const where = `market=${market}&languages=${language}`;
  const match = await cached(ctx, `microsoft-search:${details.titleKey(title)}:${market}`, force, async () => {
    const answer = await storeJson(ctx, `${MICROSOFT}/productFamilies/autosuggest?${where}&query=${encodeURIComponent(title)}&productFamilyNames=Games`);
    if (!answer) return answer;
    const id = stores.chooseMicrosoftProduct(answer, title);
    return id ? { id } : null;
  });
  const id = match.value && /^[A-Z0-9]{12}$/.test(String(match.value.id)) ? match.value.id : '';
  if (!id) return { value: null, networkError: match.networkError };
  return cached(ctx, `microsoft:${id}:${language}`, force, async () => {
    const answer = await storeJson(ctx, `${MICROSOFT}/products?bigIds=${id}&${where}`);
    if (!answer) return answer;
    return stores.fromMicrosoftProduct(Array.isArray(answer.Products) ? answer.Products[0] : null);
  });
}

// Xbox 360 games (Xenia, recompilations) have no Microsoft Store page; GamesDB has them by title id.
const STORE_PARTS = {
  epic: epicPart,
  gog: gogPart,
  xbox: (ctx, game, lang, force) => (details.isXbox360Source(game.source) ? { value: null } : microsoftPart(ctx, game, lang, force)),
};

async function storePart(ctx, game, lang, force) {
  const family = sourceIdentity.libraryBadgeOf(game.source);
  const read = STORE_PARTS[family];
  return { source: family === 'xbox' ? 'microsoft' : family, ...(read ? await read(ctx, game, lang, force) : { value: null }) };
}

async function gamesDbPart(ctx, identity, force) {
  if (!identity) return { value: null };
  const url = `${GAMESDB}/platforms/${identity.platform}/external_releases/${encodeURIComponent(identity.id)}`;
  return cached(ctx, `gamesdb:${identity.platform}:${identity.id}`, force, async () => {
    const release = await gamesDbJson(ctx, url);
    return release ? details.fromGamesDb(release) : release;
  });
}

// The careful title search: one exact title or nothing. Remembers the chosen GamesDB game id.
async function titlePart(ctx, game, force) {
  const title = details.searchTitle(details.ownTitle(game));
  if (!title) return { value: null };
  const preferred = details.preferredPlatforms(game);
  const decide = details.decidesTies(game);
  const match = await cached(ctx, `search:${details.titleKey(title)}:${preferred.join(',')}${decide ? ':decide' : ''}`, force, async () => {
    const answer = await gamesDbJson(ctx, `${GAMESDB}/games?title=${encodeURIComponent(title)}`);
    if (!answer) return answer;
    const chosen = details.chooseTitleMatch(answer.items, title, preferred, { decide });
    return chosen ? { id: String(chosen.id) } : null;
  });
  if (!match.value) return match;
  return cached(ctx, `gamesdb-game:${match.value.id}`, force, async () => {
    const record = await gamesDbJson(ctx, `${GAMESDB}/games/${match.value.id}`);
    return record ? details.fromGamesDb(record) : record;
  });
}

// The game's own stores first; GamesDB by store id, then by title, only for what they left out.
async function build(ctx, game, lang, force) {
  const steamAppid = steamAppidOf(game);
  const [steam, store, metacritic, reviews] = await Promise.all([
    steamPart(ctx, steamAppid, lang, force),
    storePart(ctx, game, lang, force),
    metacriticPart(ctx, game, force),
    steamReviewsPart(ctx, steamAppid, force),
  ]);
  const parts = [{ source: 'steam', ...steam }, { source: 'steam-reviews', ...reviews }, store, { source: 'metacritic', ...metacritic }];
  if (!details.isComplete(details.mergeDetails(parts))) {
    const release = await gamesDbPart(ctx, details.gamesDbIdentity(game, steamAppid), force);
    parts.push({ source: 'gamesdb', ...release });
    if (!release.value && !details.isComplete(details.mergeDetails(parts))) parts.push({ source: 'gamesdb', ...(await titlePart(ctx, game, force)) });
  }
  const result = { details: details.mergeDetails(parts) };
  if (parts.some((part) => part.networkError)) result.networkError = true;
  return result;
}

function createGameDetailsService({ cacheDir, getJson, fetchSteamStore, now = Date.now, log = () => {} }) {
  const ctx = { cacheDir, getJson, fetchSteamStore, now, log, epicMapping: null };
  const inFlight = new Map();

  function get(rawGame, { lang = 'english', force = false } = {}) {
    const game = gameRequest(rawGame);
    if (!game) return Promise.resolve({ details: null });
    const language = STEAM_LANGUAGE.test(String(lang)) ? String(lang) : 'english';
    const forced = force === true;
    const key = JSON.stringify([game.appid, game.source, game.system, game.steamappid, game.name, language, forced]);
    if (!inFlight.has(key)) {
      const job = build(ctx, game, language, forced)
        .catch((err) => {
          log(`game details failed for ${game.appid}: ${err.message || err}`);
          return { details: null, networkError: true };
        })
        .finally(() => inFlight.delete(key));
      inFlight.set(key, job);
    }
    return inFlight.get(key);
  }

  // A scan that already fetched the English store page keeps it for the game page, for free.
  function rememberSteamStore(steamAppid, storeData) {
    if (/^\d{1,12}$/.test(String(steamAppid)) && storeData && typeof storeData === 'object') {
      writeCache(ctx, steamKey(steamAppid, 'english'), resolveSteamStoreDetails(storeData));
    }
  }

  return { get, rememberSteamStore };
}

module.exports = { createGameDetailsService };
