'use strict';

/*
  The PlayStation release of a game played elsewhere, found by name in the catalog, its achievements
  tied to trophies by name or description: the trophy mode then shows real grades and the platinum
  instead of grades worked out from unlock rates. One file per game, also read by the Watchdog.
*/

const path = require('path');
const lib = require('./psnLibrary.js');
const catalog = require('./psnCatalog.js');

// A grade never changes once found; a game with no PlayStation release is looked at again later.
const LINK_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const MISS_MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000;
const MAX_CANDIDATES = 3;
const MIN_MATCHED = 3;
// Raised when a link is built differently: older links are made again on the next pass.
const LINK_VERSION = 3;
// Below half of the smaller list, a list with the same name is another game.
const MIN_SHARE = 0.5;
// "Definitive Edition" on one store is often the plain name on the other.
const EDITION_SUFFIX = /\s*[-:]?\s*(game of the year|goty|definitive|complete|deluxe|remastered|enhanced|ultimate|gold|director s cut)( edition)?$/;

const linksDir = () => path.join(lib.cacheRoot(), 'links');
const safeKey = (appid) => String(appid || '').replace(/[^\w.-]/g, '_');
const linkFile = (appid) => path.join(linksDir(), `${safeKey(appid)}.json`);

const readRawLink = (appid) => (safeKey(appid) ? lib.readJson(linkFile(appid)) : null);

function readLink(appid) {
  const link = readRawLink(appid);
  return link && link.listId && link.trophies && typeof link.trophies === 'object' ? link : null;
}

function isFresh(appid, locale) {
  const link = readRawLink(appid);
  if (!link || link.locale !== locale || link.version !== LINK_VERSION) return false;
  return Date.now() - Number(link.checkedAt || 0) < (link.listId ? LINK_MAX_AGE_MS : MISS_MAX_AGE_MS);
}

// The newest console first: its list is the one the PC release usually copies.
const newestFirst = (lists) => [...lists].sort((a, b) => Number(b.service === 'trophy2') - Number(a.service === 'trophy2')).slice(0, MAX_CANDIDATES);

function candidatesFor(name) {
  const exact = catalog.listsNamed(name);
  return newestFirst(exact.length ? exact : catalog.listsNamed(bareName(name)));
}

const bareName = (name) => lib.normalizedName(name).replace(EDITION_SUFFIX, '');

/*
  The catalog first, then the store for a game no public hunter played. `budget.store` caps the store
  lookups of one pass; a game left over is not marked as missing, so the next pass takes it.
*/
async function findCandidates(ctx, name, budget) {
  const known = candidatesFor(name);
  if (known.length || !budget) return { lists: known, settled: true };
  if (budget.store <= 0) return { lists: [], settled: false };
  budget.store -= 1;
  let lists = await catalog.listsFromStore(ctx, name);
  const base = bareName(name);
  if (!lists.length && base !== lib.normalizedName(name)) lists = await catalog.listsFromStore(ctx, base);
  return { lists: newestFirst(lists), settled: true };
}

// Ties each achievement to one trophy: the same name first, then the same description.
function matchTrophies(achievements, trophies) {
  const nonPlatinum = trophies.filter((trophy) => trophy.trophyType !== 'platinum');
  const used = new Set();
  const byKey = (key) => {
    const index = new Map();
    for (const trophy of nonPlatinum) {
      const value = lib.normalizedName(trophy[key]);
      if (value && !index.has(value)) index.set(value, trophy);
    }
    return index;
  };
  const byName = byKey('trophyName');
  const byDetail = byKey('trophyDetail');
  const matched = new Map();
  for (const [index, field] of [
    [byName, 'displayName'],
    [byDetail, 'description'],
  ]) {
    for (const achievement of achievements) {
      if (!achievement || matched.has(achievement.name)) continue;
      const trophy = index.get(lib.normalizedName(achievement[field]));
      if (trophy && !used.has(trophy.trophyId)) {
        used.add(trophy.trophyId);
        matched.set(achievement.name, trophy);
      }
    }
  }
  // A game's own "everything unlocked" achievement often bears the platinum's name: it is that trophy.
  const platinum = trophies.find((trophy) => trophy.trophyType === 'platinum');
  const platinumName = platinum && lib.normalizedName(platinum.trophyName);
  const twin = platinumName && achievements.find((achievement) => achievement && !matched.has(achievement.name) && lib.normalizedName(achievement.displayName) === platinumName);
  if (twin) matched.set(twin.name, platinum);
  return { matched, size: nonPlatinum.length };
}

function buildLink(candidate, definitions, groups, matched, locale) {
  const groupNames = new Map(((groups && groups.trophyGroups) || []).filter((group) => group.trophyGroupId !== 'default').map((group) => [String(group.trophyGroupId), String(group.trophyGroupName || '')]));
  const trophies = {};
  for (const [name, trophy] of matched) {
    const group = groupNames.get(String(trophy.trophyGroupId || 'default'));
    trophies[name] = { type: lib.TYPE_LETTER[trophy.trophyType] || 'B', ...(group ? { group } : {}) };
  }
  const platinum = definitions.trophies.find((trophy) => trophy.trophyType === 'platinum');
  return {
    version: LINK_VERSION,
    checkedAt: Date.now(),
    locale,
    listId: candidate.id,
    platform: candidate.platform,
    service: candidate.service === 'trophy2' ? 'trophy2' : 'trophy',
    trophies,
    platinum: platinum
      ? { id: String(platinum.trophyId), name: String(platinum.trophyName || ''), description: String(platinum.trophyDetail || ''), icon: String(platinum.trophyIconUrl || '').startsWith('https://') ? platinum.trophyIconUrl : '' }
      : null,
  };
}

/*
  `game` is { appid, name, achievements: [{ name, displayName, description }] } in the app language;
  `english` the same achievements in English when the store gave them, a second chance to match.
  Without that copy the game's own texts are tried against the English trophies: a store with no
  translation (LEGO Batman: Legacy of the Dark Knight) answers in English whatever was asked.
*/
const sonyLoader = (ctx, englishCtx) => (candidate) => {
  const title = { npCommunicationId: candidate.id, npServiceName: candidate.service };
  return {
    definitions: () => lib.fetchDefinitions(ctx, title, { withGroups: true }),
    english: englishCtx ? async () => (await lib.fetchDefinitions(englishCtx, title, { withGroups: false })).definitions : null,
  };
};

/*
  The candidate list whose trophies match the most achievements, above MIN_MATCHED and MIN_SHARE, or
  null. `load(candidate)` gives { definitions(), english() }: the list in the link's language, and
  the same trophies in English (same trophyId) for a second chance, or no `english` at all.
*/
async function bestCandidate(game, lists, load, english) {
  const englishTexts = Array.isArray(english) ? english : game.achievements;
  let best = null;
  for (const candidate of lists) {
    const source = load(candidate);
    const { definitions, groups } = await source.definitions();
    const trophies = (definitions && definitions.trophies) || [];
    const { matched, size } = matchTrophies(game.achievements, trophies);
    const comparable = Math.min(game.achievements.length, size);
    if (source.english && matched.size < comparable) {
      const englishDefs = await source.english();
      const byId = new Map(trophies.map((trophy) => [trophy.trophyId, trophy]));
      const englishMatched = matchTrophies(englishTexts, (englishDefs && englishDefs.trophies) || []).matched;
      for (const [name, trophy] of englishMatched) if (!matched.has(name) && byId.has(trophy.trophyId)) matched.set(name, byId.get(trophy.trophyId));
    }
    const needed = Math.max(MIN_MATCHED, Math.ceil(MIN_SHARE * comparable));
    if (matched.size >= needed && (!best || matched.size > best.matched.size)) best = { candidate, definitions, groups, matched };
  }
  return best;
}

// The link of `best`, or a miss remembered for MISS_MAX_AGE_MS; null when nothing matched.
function saveLink(appid, best, locale) {
  const link = best ? buildLink(best.candidate, best.definitions, best.groups, best.matched, locale) : { version: LINK_VERSION, checkedAt: Date.now(), locale, listId: null };
  lib.writeJson(linkFile(appid), link);
  return link.listId ? link : null;
}

async function linkGame(ctx, game, { englishCtx = null, english = null, budget = null } = {}) {
  const { lists, settled } = await findCandidates(ctx, game.name, budget);
  if (!settled) return null;
  return saveLink(game.appid, await bestCandidate(game, lists, sonyLoader(ctx, englishCtx), english), ctx.locale);
}

/*
  The game's achievements in English, from the Steam schema cache (`<appid>.db`, JSON inside), for
  the second chance against English trophies. Only Steam appids have one.
*/
function englishAchievementsOf(userDataDir, appid) {
  if (!/^\d+$/.test(String(appid || ''))) return null;
  const schema = lib.readJson(path.join(userDataDir, 'steam_cache', 'schema', 'english', `${appid}.db`));
  const list = schema && schema.achievement && schema.achievement.list;
  if (!Array.isArray(list)) return null;
  return list.map((entry) => ({ name: String((entry && entry.name) || ''), displayName: String((entry && entry.displayName) || ''), description: String((entry && entry.description) || '') }));
}

module.exports = { readLink, isFresh, candidatesFor, bareName, matchTrophies, bestCandidate, saveLink, linkGame, linkFile, englishAchievementsOf, MAX_CANDIDATES };
