'use strict';

/*
  Trophy links without a PlayStation account. A game's list is found by name in the site's index of
  the public trophy archive (tools/psn/build-index.js) and read from that archive; a game it does not
  hold (PS5, newer PS4) is looked up on Exophase. The link file is the one psnTrophyLink.js writes.
*/

const path = require('path');
const lib = require('./psnLibrary.js');
const links = require('./psnTrophyLink.js');
const { SITE } = require('../util/links.js');

const INDEX_URL = `${SITE}/data/psn-index.json`;
const INDEX_VERSION = 1;
const INDEX_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const INDEX_TIMEOUT_MS = 20000;
const DAY_MS = 24 * 60 * 60 * 1000;
// A list read from the archive costs one or two GitHub requests; an Exophase lookup a search and up
// to two pages, a browser when Cloudflare steps in. Games left over wait for the next pass or day.
const ARCHIVE_LISTS_PER_PASS = 60;
const ARCHIVE_LISTS_PER_DAY = 200;
const EXOPHASE_LOOKUPS_PER_PASS = 5;
const EXOPHASE_LOOKUPS_PER_DAY = 15;
const EXOPHASE_PAGES_PER_GAME = 2;
const GRADE_TYPE = { P: 'platinum', G: 'gold', S: 'silver', B: 'bronze' };

// A platinum's Exophase rate moves slowly; a game with none may get a page any day.
const EXOPHASE_RATE_MAX_AGE_MS = 7 * DAY_MS;
const EXOPHASE_MISS_MAX_AGE_MS = DAY_MS;

const indexFile = () => path.join(lib.cacheRoot(), 'public-index.json');
const platinumRatesFile = () => path.join(lib.cacheRoot(), 'exophase-platinum.json');
const quotaFile = () => path.join(lib.cacheRoot(), 'public-lookups.json');
const validNames = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

// The index cached for a week; a failed download keeps the copy already there.
async function loadIndex(ctx, now = Date.now()) {
  const cached = lib.readJson(indexFile());
  const usable = cached && cached.version === INDEX_VERSION && validNames(cached.names);
  if (usable && now - Number(cached.fetchedAt || 0) < INDEX_MAX_AGE_MS) return cached.names;
  try {
    const res = await ctx.fetchImpl(INDEX_URL, { signal: AbortSignal.timeout(INDEX_TIMEOUT_MS) });
    const body = res && res.ok ? await res.json() : null;
    if (body && body.version === INDEX_VERSION && validNames(body.names)) {
      lib.writeJson(indexFile(), { version: INDEX_VERSION, fetchedAt: now, names: body.names });
      return body.names;
    }
  } catch {
    // offline or a bad answer: the cached copy, or no index, serves this pass
  }
  return usable ? cached.names : {};
}

function listsInIndex(names, name) {
  const lookup = (key) => (key && Object.prototype.hasOwnProperty.call(names, key) && Array.isArray(names[key]) ? names[key] : []);
  const exact = lookup(lib.normalizedName(lib.cleanTitleName(name)));
  const found = exact.length ? exact : lookup(links.bareName(name));
  return found
    .map((entry) => ({ id: lib.normalizeListId(entry && entry.id), platform: String((entry && entry.platform) || ''), service: entry && entry.service === 'trophy2' ? 'trophy2' : 'trophy' }))
    .filter((entry) => entry.id)
    .slice(0, links.MAX_CANDIDATES);
}

// Reads lists from the archive; `state.failed` tells an unreachable archive from a real miss.
function archiveLoader(ctx, englishCtx, state) {
  return (candidate) => ({
    definitions: async () => {
      const list = await lib.fetchArchivedList(ctx, candidate.id);
      if (!list) state.failed = true;
      return { definitions: list, groups: list };
    },
    english: englishCtx ? () => lib.fetchArchivedList(englishCtx, candidate.id) : null,
  });
}

// Exophase awards in the shape of Sony's trophies; null for a page with no trophy grades.
function exophaseTrophies(items, langKey) {
  if (!Array.isArray(items) || !items.some((item) => item && GRADE_TYPE[item.grade])) return null;
  return items.map((item) => ({
    trophyId: Number(item.index),
    trophyType: GRADE_TYPE[item.grade] || 'bronze',
    trophyName: (item.titles && (item.titles[langKey] || item.titles.english)) || '',
    trophyDetail: (item.descriptions && (item.descriptions[langKey] || item.descriptions.english)) || '',
    // The page shows 64px icons; the same picture exists at 240px, Sony's own size.
    trophyIconUrl: String(item.icon_url || '').replace('://m.exophase.com/psn/awards/s/', '://m.exophase.com/psn/awards/l/'),
    trophyGroupId: 'default',
  }));
}

function exophaseLoader(exophase, lang, state) {
  return (candidate) => {
    let page = null;
    const items = async () => {
      if (!page) {
        page = await exophase
          .fetchExophaseAchievementsMultiLang({ slug: candidate.slug, platform: candidate.exophasePlatform, baseUrl: candidate.baseUrl, langKeys: [...new Set(['english', lang])] })
          .catch(() => {
            state.failed = true;
            return { items: [] };
          });
      }
      return page.items;
    };
    return {
      definitions: async () => {
        const trophies = exophaseTrophies(await items(), lang);
        return { definitions: trophies ? { trophies } : null, groups: null };
      },
      english: lang === 'english' ? null : async () => ({ trophies: exophaseTrophies(await items(), 'english') || [] }),
    };
  };
}

// Exophase pages filed under the game's name, the PS5 list first. No NPWR id: `exophase:<slug>`.
async function exophaseCandidates(exophase, name, state) {
  const wanted = new Set([lib.normalizedName(name), links.bareName(name)]);
  const hits = await exophase.searchExophaseTrophyLists(name).catch(() => {
    state.failed = true;
    return [];
  });
  return hits
    .filter((hit) => wanted.has(lib.normalizedName(hit.title)))
    .sort((a, b) => Number(b.platform === 'ps5') - Number(a.platform === 'ps5'))
    .slice(0, EXOPHASE_PAGES_PER_GAME)
    .map((hit) => ({ id: `exophase:${hit.slug}`, platform: hit.platform.toUpperCase(), service: hit.platform === 'ps5' ? 'trophy2' : 'trophy', slug: hit.slug, exophasePlatform: hit.platform, baseUrl: hit.baseUrl }));
}

/*
  A linked platinum's rate among Exophase's own members, for a list no account at hand has: not
  Sony's figure (hunters weigh in, so it runs higher), which the caller must say. The link's own
  Exophase page, else the pages named like the game, the link's console first; null when none says.
*/
// Read again at the write: another game's page may have saved its rate while this one waited.
function rememberPlatinumRate(listId, record) {
  const stored = lib.readJson(platinumRatesFile());
  lib.writeJson(platinumRatesFile(), { ...(validNames(stored) ? stored : {}), [listId]: record });
}

async function exophasePlatinumRate(link, name, { exophase = require('./exophase.js'), now = Date.now() } = {}) {
  const listId = String((link && link.listId) || '');
  if (!listId) return null;
  const stored = lib.readJson(platinumRatesFile());
  const rates = validNames(stored) ? stored : {};
  const known = validNames(rates[listId]) ? rates[listId] : null;
  const age = known ? now - Number(known.at) : Infinity;
  if (known && age >= 0 && age < (known.percent == null ? EXOPHASE_MISS_MAX_AGE_MS : EXOPHASE_RATE_MAX_AGE_MS)) return known.percent ?? null;

  const console_ = link.service === 'trophy2' ? 'ps5' : 'ps4';
  const state = {};
  const remembered = known && known.slug ? [{ slug: known.slug, exophasePlatform: known.exophasePlatform, baseUrl: known.baseUrl }] : [];
  // The page found last time, then (only when it no longer answers) a search by name.
  const searched = async () =>
    listId.startsWith('exophase:')
      ? [{ slug: listId.slice('exophase:'.length), exophasePlatform: console_ }]
      : (await exophaseCandidates(exophase, name, state)).sort((a, b) => Number(b.exophasePlatform === console_) - Number(a.exophasePlatform === console_));
  for (const candidates of [remembered, null]) {
    for (const candidate of candidates || (await searched())) {
      const page = await exophase.fetchExophaseAchievementsMultiLang({ slug: candidate.slug, platform: candidate.exophasePlatform, baseUrl: candidate.baseUrl, langKeys: ['english'] }).catch(() => {
        state.failed = true;
        return null;
      });
      const platinum = ((page && page.items) || []).find((item) => item && item.grade === 'P');
      const percent = platinum && platinum.rarityPct != null ? Number(platinum.rarityPct) : NaN;
      if (Number.isFinite(percent) && percent >= 0 && percent <= 100) {
        rememberPlatinumRate(listId, { at: now, percent, slug: candidate.slug, exophasePlatform: candidate.exophasePlatform, baseUrl: candidate.baseUrl });
        return percent;
      }
    }
  }
  // An unreachable Exophase is no answer: only a page that says nothing is remembered as a miss.
  if (!state.failed) rememberPlatinumRate(listId, { at: now, percent: null });
  return null;
}

/*
  One game: the archive lists named like it, then Exophase. Returns the link, or null when nothing
  matched or the game waits for budget or a reachable host (then nothing is written).
*/
async function linkGame(ctx, game, { englishCtx = null, english = null, names = {}, budget, exophase, lang = 'english' }) {
  const state = { failed: false };
  const lists = listsInIndex(names, game.name);
  let best = null;
  if (lists.length) {
    if (budget.archive < lists.length) return null;
    budget.archive -= lists.length;
    best = await links.bestCandidate(game, lists, archiveLoader(ctx, englishCtx, state), english);
  }
  if (!best) {
    if (budget.exophase <= 0) return null;
    budget.exophase -= 1;
    const candidates = await exophaseCandidates(exophase, game.name, state);
    best = await links.bestCandidate(game, candidates, exophaseLoader(exophase, lang, state), english);
  }
  if (!best && state.failed) return null;
  return links.saveLink(game.appid, best, ctx.locale);
}

// Lookups spent today, per source.
function dailyQuota(saved, now) {
  const sameDay = saved && now - Number(saved.since) < DAY_MS;
  return { since: sameDay ? Number(saved.since) : now, archive: sameDay ? Number(saved.archive) || 0 : 0, exophase: sameDay ? Number(saved.exophase) || 0 : 0 };
}

/*
  A pass over the library's games, for an install with no PlayStation account. `english(appid)`
  gives a game's English achievements, `exophase` the parser module (injected by the tests).
*/
async function linkGames(games, { lang = 'english', fetchImpl = fetch, exophase = require('./exophase.js'), english = () => null, now = Date.now() } = {}) {
  const ctx = lib.publicContext({ lang, fetchImpl });
  const englishCtx = String(ctx.locale).startsWith('en') ? null : lib.publicContext({ locale: 'en-US', fetchImpl });
  const quota = dailyQuota(lib.readJson(quotaFile()), now);
  const allowed = {
    archive: Math.max(0, Math.min(ARCHIVE_LISTS_PER_PASS, ARCHIVE_LISTS_PER_DAY - quota.archive)),
    exophase: Math.max(0, Math.min(EXOPHASE_LOOKUPS_PER_PASS, EXOPHASE_LOOKUPS_PER_DAY - quota.exophase)),
  };
  const budget = { ...allowed };
  let linked = 0;
  try {
    const names = await loadIndex(ctx, now);
    for (const game of games) {
      if (budget.archive <= 0 && budget.exophase <= 0) break;
      if (links.isFresh(game.appid, ctx.locale)) continue;
      if (await linkGame(ctx, game, { englishCtx, english: english(game.appid), names, budget, exophase, lang })) linked += 1;
    }
  } finally {
    lib.writeJson(quotaFile(), { since: quota.since, archive: quota.archive + allowed.archive - budget.archive, exophase: quota.exophase + allowed.exophase - budget.exophase });
  }
  return linked;
}

module.exports = { INDEX_URL, loadIndex, listsInIndex, exophaseTrophies, exophasePlatinumRate, linkGame, linkGames, ARCHIVE_LISTS_PER_PASS, EXOPHASE_LOOKUPS_PER_PASS, EXOPHASE_LOOKUPS_PER_DAY };
