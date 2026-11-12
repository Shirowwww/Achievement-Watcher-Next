'use strict';

const fs = require('fs');
const path = require('path');
const gamesInfosDatas = require('../util/gamesInfosDatas.js');
const { toolCacheDir } = require('../util/toolCaches.js');

function numericStatValue(entry) {
  if (entry == null) return null;
  if (typeof entry === 'number') return Number.isFinite(entry) ? entry : null;
  if (typeof entry === 'string') {
    const n = Number(entry);
    return Number.isFinite(n) ? n : null;
  }
  if (typeof entry === 'object') {
    for (const key of ['value', 'Value', 'CurProgress', 'curProgress', 'progress', 'current', 'Current']) {
      if (!(key in entry)) continue;
      const n = Number(entry[key]);
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

// Each schema achievement tied to a stat the save holds, with the stat value capped at its goal.
// `rawFor(statName)` gives the save's entry for that stat; a generator, so a caller that adds entries
// as it goes sees them in the next lookup.
function* statProgressPairs(localSchema, rawFor) {
  for (const achievement of localSchema) {
    const statName = achievement && achievement.progress && achievement.progress.value && achievement.progress.value.operand1;
    if (!achievement || !achievement.name || !statName) continue;
    const raw = numericStatValue(rawFor(statName));
    if (raw == null) continue;
    const max = Number(achievement.progress.max_val || achievement.progress.max || achievement.progress.maxProgress || 0) || 0;
    // A stat keeps counting past the goal (BG3 reports 14 for a 10-step achievement).
    yield { achievement, statName, max, value: max > 0 ? Math.min(raw, max) : raw };
  }
}

/*
  The Watchdog's form of the same mapping: its parsed save is an array of { name, Achieved,
  CurProgress, ... }, not a keyed object, so a missing achievement is appended, the larger progress
  wins, a reached goal marks it unlocked, and the consumed raw stat entries are removed so a stat
  hash is never announced as an achievement.
*/
function mapStatProgressEntries(entries, localSchema) {
  if (!Array.isArray(entries) || !Array.isArray(localSchema) || localSchema.length === 0) return 0;
  const byName = new Map();
  for (const entry of entries) if (entry && entry.name != null) byName.set(String(entry.name).toUpperCase(), entry);
  const consumedStats = new Set();
  const achievementNames = new Set();
  for (const a of localSchema) {
    if (a && a.name && a.progress && a.progress.value && a.progress.value.operand1) achievementNames.add(String(a.name).toUpperCase());
  }
  let applied = 0;
  for (const { achievement, statName, max, value } of statProgressPairs(localSchema, (stat) => byName.get(String(stat).toUpperCase()))) {
    const key = String(achievement.name).toUpperCase();
    let target = byName.get(key);
    if (!target) {
      target = { name: achievement.name, Achieved: false, CurProgress: 0, MaxProgress: 0, UnlockTime: 0 };
      entries.push(target);
      byName.set(key, target);
    }
    if (!target.CurProgress || value > Number(target.CurProgress || 0)) target.CurProgress = value;
    if (!(Number(target.MaxProgress) > 0) && max) target.MaxProgress = max;
    if (!target.Achieved && max > 0 && value >= max) target.Achieved = true;
    consumedStats.add(String(statName).toUpperCase());
    applied++;
  }
  for (let i = entries.length - 1; i >= 0 && consumedStats.size > 0; i--) {
    const name = entries[i] && entries[i].name != null ? String(entries[i].name).toUpperCase() : '';
    if (consumedStats.has(name) && !achievementNames.has(name)) entries.splice(i, 1);
  }
  return applied;
}

function applyLocalStatProgress(root, localSchema) {
  if (!root || typeof root !== 'object' || !Array.isArray(localSchema) || localSchema.length === 0) return 0;
  const byKey = new Map(Object.keys(root).map((key) => [String(key).toUpperCase(), key]));
  let applied = 0;
  const rawFor = (statName) => {
    const statKey = byKey.get(String(statName).toUpperCase());
    return statKey ? root[statKey] : undefined;
  };
  for (const { achievement, max, value } of statProgressPairs(localSchema, rawFor)) {
    if (root[achievement.name] && typeof root[achievement.name] === 'object') {
      // CODEX writes CurProgress=0 and MaxProgress=0 for every entry: a string '0' is not a value.
      const entry = root[achievement.name];
      if (!(Number(entry.CurProgress) > 0) && !(Number(entry.progress) > 0)) entry.CurProgress = value;
      if (!(Number(entry.MaxProgress) > 0) && !(Number(entry.max_progress) > 0) && max) entry.MaxProgress = max;
    } else {
      root[achievement.name] = {
        CurProgress: value,
        MaxProgress: max,
        Achieved: max > 0 && value >= max ? '1' : '0',
      };
    }
    applied++;
  }
  return applied;
}

function hasProgress(schema) {
  return Array.isArray(schema) && schema.some((a) => a && a.progress && a.progress.value && a.progress.value.operand1);
}

// The Steam client's own schema for a game (appcache/stats), reduced to the GBE achievements.json
// shape applyLocalStatProgress reads. It is the one place that names the stat behind a progress
// achievement without an account, so a CODEX/RUNE stats.ini can be mapped with no steam_settings.
function appcacheProgressSchema(statsDir, appid) {
  const file = path.join(String(statsDir || ''), `UserGameStatsSchema_${appid}.bin`);
  if (!statsDir || !fs.existsSync(file)) return [];
  const steamOfficial = require('./steamOfficial.js');
  return steamOfficial
    .extractSchemaAchievements(steamOfficial.parseKVBinary(fs.readFileSync(file)).data)
    .filter((a) => a.progressStatName && a.progressMax > 0)
    .map((a) => ({
      name: a.api,
      progress: { min_val: a.progressMin || 0, max_val: a.progressMax, value: { operation: 'statvalue', operand1: a.progressStatName } },
    }));
}

function readJsonArray(file) {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// Only what the mapping needs, so a cached table stays small whatever it was cut from.
function progressEntries(schema) {
  return (Array.isArray(schema) ? schema : [])
    .filter((a) => a && a.name && a.progress && a.progress.value && a.progress.value.operand1)
    .map((a) => ({ name: a.name, progress: a.progress }));
}

function progressCachePath(cacheDir, appid) {
  return cacheDir && appid != null ? path.join(cacheDir, 'steam_cache', 'progress', `${appid}.json`) : null;
}

function writeProgressCache(cacheDir, appid, schema) {
  const file = progressCachePath(cacheDir, appid);
  const entries = progressEntries(schema);
  if (!file || entries.length === 0) return false;
  const body = JSON.stringify(entries, null, 2);
  try {
    if (fs.readFileSync(file, 'utf8') === body) return true;
  } catch {
    /* not written yet */
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, body);
  return true;
}

/*
  games-infos-datas (util/gamesInfosDatas.js) publishes, per appid, the list Steam's own stats schema
  gives a signed-in account - including each achievement's stat and goal. Checked against 44 local
  appcache schemas (803 progress achievements): every stat name and goal matched. It is what a
  CODEX/RUNE save needs when no Steam client ever cached the game.
*/

// Its `stats_thresholds` rows, in the GBE `progress` shape the rest of this module reads.
function communityProgressEntries(list) {
  return (Array.isArray(list) ? list : [])
    .map((a) => {
      const threshold = a && Array.isArray(a.stats_thresholds) ? a.stats_thresholds[0] : null;
      const max = threshold ? Number(threshold.max_val) : 0;
      if (!threshold || !a.name || !threshold.stat_name || !(max > 0)) return null;
      return {
        name: String(a.name),
        progress: { min_val: Number(threshold.min_val) || 0, max_val: max, value: { operation: 'statvalue', operand1: String(threshold.stat_name) } },
      };
    })
    .filter(Boolean);
}

// The table for one appid, saved into the same cache as a Steam-client copy. A game with no counter
// there is not asked again until the repository's copy would be stale anyway.
async function fetchCommunityProgressSchema(appid, { cacheDir, getJson } = {}) {
  if (!/^[0-9]+$/.test(String(appid || ''))) return [];
  const noCounter = cacheDir ? path.join(cacheDir, 'steam_cache', 'progress', `${appid}.community-none`) : null;
  try {
    if (noCounter && Date.now() - fs.statSync(noCounter).mtimeMs < gamesInfosDatas.TTL_MS) return [];
  } catch {
    /* never looked */
  }
  const list = await gamesInfosDatas.readJson(`steam/${appid}/achievements_db.json`, { cacheDir, getJson });
  if (list == null) return [];
  const entries = communityProgressEntries(list);
  try {
    if (entries.length > 0) writeProgressCache(cacheDir, appid, entries);
    else if (noCounter) {
      fs.mkdirSync(path.dirname(noCounter), { recursive: true });
      fs.writeFileSync(noCounter, '');
    }
  } catch {
    /* the cache is a convenience */
  }
  return entries;
}

/*
  What a GBE steam_settings needs so the emulator itself can reach a stat threshold: every stat the
  game declares (stats.json - GBE refuses SetStat on an undeclared one, so the counter never moves)
  and the stat behind each progress achievement. Both come from games-infos-datas, so no Steam
  account is involved. Returns { stats, progress }, both empty when the repository lacks the game.
*/
async function fetchCommunityStats(appid, { cacheDir, getJson } = {}) {
  if (!/^[0-9]+$/.test(String(appid || ''))) return { stats: [], progress: [] };
  const [statsList, achievementList] = await Promise.all([
    gamesInfosDatas.readJson(`steam/${appid}/stats_db.json`, { cacheDir, getJson }),
    gamesInfosDatas.readJson(`steam/${appid}/achievements_db.json`, { cacheDir, getJson }),
  ]);
  const stats = (Array.isArray(statsList) ? statsList : [])
    .filter((s) => s && s.name)
    .map((s) => ({
      default: String(s.default ?? 0),
      global: '0',
      name: String(s.name),
      type: ['int', 'float', 'avgrate'].includes(String(s.type)) ? String(s.type) : 'int',
    }));
  return { stats, progress: communityProgressEntries(achievementList) };
}

/*
  Counter achievements (schema entries carrying `counter: {min, max}`, from Steam's own list) that
  nothing ties to a stat yet, matched with the stats the game wrote. Steam names the goal but not
  the stat, and a game missing from games-infos-datas has no other source. A stat belongs to an
  achievement when it is that achievement's name or ends with `_<name>` (rmostat_rank_rmo_ach_19 for
  ACH_19); a stat or an achievement with two candidates is skipped, a wrong link being worse than none.
  Returns entries in the GBE `progress` shape, like communityProgressEntries.
*/
function inferStatLinks({ achievements = [], statNames = [], allNames = null } = {}) {
  const tiedStat = (a) => (a && a.progress && a.progress.value && a.progress.value.operand1) || '';
  const everyCounter = (Array.isArray(achievements) ? achievements : []).filter((a) => a && a.name && a.counter && Number(a.counter.max) > 0);
  const counters = everyCounter.filter((a) => !tiedStat(a));
  const stats = [...new Set((Array.isArray(statNames) ? statNames : []).map(String).filter(Boolean))];
  const owns = (stat, name) => {
    const s = stat.toLowerCase();
    const n = String(name).toLowerCase();
    return s === n || s.endsWith(`_${n}`);
  };
  // Every achievement of the game counts for ambiguity, not only the counters still untied.
  const everyName = Array.isArray(allNames) ? allNames.map(String) : counters.map((a) => String(a.name));
  const link = (achievement, stat) => ({
    name: String(achievement.name),
    progress: { min_val: Number(achievement.counter.min) || 0, max_val: Number(achievement.counter.max), value: { operation: 'statvalue', operand1: stat } },
  });
  const links = [];
  for (const achievement of counters) {
    const candidates = stats.filter((stat) => owns(stat, achievement.name));
    if (candidates.length !== 1) continue;
    if (everyName.filter((name) => owns(candidates[0], name)).length !== 1) continue;
    links.push(link(achievement, candidates[0]));
  }
  // The game writes a stat only once its counter moves. When every link known so far, these and
  // the ones already tied, spells its stat the same way, that spelling names the stats to come.
  const known = [...links.map((l) => [l.name, l.progress.value.operand1]), ...everyCounter.filter(tiedStat).map((a) => [String(a.name), String(tiedStat(a))])];
  const naming = sharedStatNaming(known);
  if (!naming) return links;
  const linked = new Set(links.map((l) => l.name));
  for (const achievement of counters) {
    if (linked.has(String(achievement.name))) continue;
    const stat = naming(String(achievement.name));
    if (stats.some((s) => owns(s, achievement.name)) || everyName.filter((name) => owns(stat, name)).length !== 1) continue;
    links.push(link(achievement, stat));
  }
  return links;
}

// `<prefix><achievement name>`, lower-cased or as written, when at least two links agree on it.
function sharedStatNaming(pairs) {
  if (pairs.length < 2) return null;
  for (const spell of [(name) => name.toLowerCase(), (name) => name]) {
    const prefixes = new Set(pairs.map(([name, stat]) => (stat.endsWith(spell(name)) ? stat.slice(0, stat.length - name.length) : null)));
    const [prefix] = prefixes;
    if (prefixes.size === 1 && prefix) return (name) => prefix + spell(name);
  }
  return null;
}

/*
  Where the stat -> achievement table for a game comes from, without writing anything:
  - 'game'  the emulator's own steam_settings schema
  - 'steam' the Steam client's appcache
  - 'saved' AW Next's cache, filled from either the client or a fetch the user asked for
*/
function findProgressSchema({ appid, localSchema, steamStatsDir, cacheDir } = {}) {
  if (hasProgress(localSchema)) return { schema: localSchema, origin: 'game' };
  try {
    const schema = appcacheProgressSchema(steamStatsDir, appid);
    if (schema.length > 0) return { schema, origin: 'steam' };
  } catch {
    /* an unreadable appcache file is the same as none */
  }
  const cached = progressCachePath(cacheDir, appid);
  const saved = cached ? progressEntries(readJsonArray(cached)) : [];
  if (saved.length > 0) return { schema: saved, origin: 'saved' };
  // What an earlier generate_emu_config run left under its own tool folder.
  const toolRoot = cacheDir ? toolCacheDir(cacheDir, 'emuConfig') : null;
  try {
    for (const tag of toolRoot ? fs.readdirSync(toolRoot, { withFileTypes: true }) : []) {
      if (!tag.isDirectory()) continue;
      const file = path.join(toolRoot, tag.name, 'generate_emu_config', '_OUTPUT', String(appid), 'steam_settings', 'achievements.json');
      const generated = progressEntries(readJsonArray(file));
      if (generated.length > 0) return { schema: generated, origin: 'saved' };
    }
  } catch {
    /* no generator was ever downloaded */
  }
  return { schema: [], origin: null };
}

// The table for a scan. What the Steam client gave is copied into AW's cache (never the game
// folder): the Watchdog reads it from there, and it outlives the client dropping the file.
function resolveProgressSchema(options = {}) {
  const found = findProgressSchema(options);
  if (found.origin === 'steam') {
    try {
      writeProgressCache(options.cacheDir, options.appid, found.schema);
    } catch {
      /* the cache is a convenience */
    }
  }
  return found.schema;
}

// Numeric stats a CODEX/RUNE (`[UserStats]`) or OnlineFix (`[Stats]`) save keeps beside its
// achievements, or 0 when the folder has none.
function countSaveStats(dir) {
  for (const name of ['stats.ini', 'Stats.ini']) {
    let text;
    try {
      text = fs.readFileSync(path.join(String(dir || ''), name), 'utf8');
    } catch {
      continue;
    }
    let section = '';
    let count = 0;
    for (const line of text.split(/\r?\n/)) {
      const header = line.match(/^\s*\[([^\]]+)\]\s*$/);
      if (header) section = header[1].trim().toLowerCase();
      else if ((section === 'userstats' || section === 'stats') && /^\s*[A-Za-z0-9_.-]+\s*=\s*-?[\d.]+\s*$/.test(line)) count++;
    }
    return count;
  }
  return 0;
}

// How many achievements Steam gives a counter, from a keyless GetGameAchievements answer. It names
// no stat, so it cannot fill a counter, but it says whether there is anything to fetch at all.
function countOfficialProgress(response) {
  const list = response && Array.isArray(response.achievements) ? response.achievements : null;
  if (!list) return null;
  return list.filter((a) => a && Number(a.progress_type) > 0).length;
}

const OFFICIAL_PROGRESS_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const COUNTERS_FETCH_TIMEOUT_MS = 8000;

// The count above for one appid, cached for a week beside the tables. null when Steam could not be
// asked, which is not the same answer as 0.
async function officialProgressCount(appid, { cacheDir, fetchImpl = globalThis.fetch } = {}) {
  if (!/^[0-9]+$/.test(String(appid || ''))) return null;
  const file = cacheDir ? path.join(cacheDir, 'steam_cache', 'progress', `${appid}.official.json`) : null;
  try {
    if (file && Date.now() - fs.statSync(file).mtimeMs < OFFICIAL_PROGRESS_TTL_MS) {
      const cached = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (Number.isInteger(cached.count)) return cached.count;
    }
  } catch {
    /* not cached yet */
  }
  try {
    const response = await fetchImpl(`https://api.steampowered.com/IPlayerService/GetGameAchievements/v1/?appid=${appid}&language=english`);
    if (!response || !response.ok) return null;
    const count = countOfficialProgress((await response.json()).response);
    if (count == null) return null;
    if (file) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify({ count }));
    }
    return count;
  } catch {
    return null;
  }
}

/*
  A schema cached before AW kept `counter` (see steamSchemaFetch.mapOfficialAchievements) has none,
  and is never refetched. Complete it in place from Steam's list, asked once a week at most, so
  inferStatLinks has the goals. Returns how many entries now carry one; a failed ask changes nothing.
*/
async function attachOfficialCounters(game, appid, { cacheDir, fetchImpl = globalThis.fetch } = {}) {
  const list = game && game.achievement && Array.isArray(game.achievement.list) ? game.achievement.list : null;
  if (!list || !/^[0-9]+$/.test(String(appid || ''))) return 0;
  if (list.some((a) => a && a.counter)) return list.filter((a) => a && a.counter).length;
  const file = cacheDir ? path.join(cacheDir, 'steam_cache', 'progress', `${appid}.counters.json`) : null;
  let counters = null;
  try {
    if (file && Date.now() - fs.statSync(file).mtimeMs < OFFICIAL_PROGRESS_TTL_MS) counters = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    /* not cached yet */
  }
  if (!Array.isArray(counters)) {
    try {
      const response = await fetchImpl(`https://api.steampowered.com/IPlayerService/GetGameAchievements/v1/?appid=${appid}&language=english`, {
        signal: AbortSignal.timeout(COUNTERS_FETCH_TIMEOUT_MS),
      });
      if (!response || !response.ok) return 0;
      const answer = (await response.json()).response;
      if (!answer || !Array.isArray(answer.achievements)) return 0;
      counters = require('../util/steamSchemaFetch.js')
        .mapOfficialAchievements(answer, appid)
        .filter((a) => a.counter)
        .map((a) => ({ name: a.name, counter: a.counter }));
      if (file) {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, JSON.stringify(counters));
      }
    } catch {
      return 0;
    }
  }
  const byName = new Map(counters.map((c) => [String(c.name).toUpperCase(), c.counter]));
  let attached = 0;
  for (const a of list) {
    const counter = a && a.name ? byName.get(String(a.name).toUpperCase()) : null;
    if (counter) {
      a.counter = counter;
      attached++;
    }
  }
  return attached;
}

module.exports = {
  attachOfficialCounters,
  countOfficialProgress,
  officialProgressCount,
  applyLocalStatProgress,
  mapStatProgressEntries,
  numericStatValue,
  appcacheProgressSchema,
  findProgressSchema,
  resolveProgressSchema,
  writeProgressCache,
  communityProgressEntries,
  fetchCommunityProgressSchema,
  fetchCommunityStats,
  inferStatLinks,
  progressEntries,
  countSaveStats,
};
