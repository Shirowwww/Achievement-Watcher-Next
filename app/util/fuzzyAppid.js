'use strict';

/*
  Resolve a Steam AppID from a messy folder/exe/game name (three-tier exact/token/fuzzy search). The
  automatic path only auto-commits high-confidence matches - writing a wrong AppID corrupts a game's
  identity; fuzzy hits are returned as candidates for manual confirmation. Pure + dependency-free.
*/

// Scene/repack groups, store/source tags and packaging words that wrap a real title in a folder name.
// Removing them turns "Cyberpunk 2077 [FitGirl Repack]" into "cyberpunk 2077", which then matches the
// store name exactly. Edition words (deluxe/goty/…) are deliberately NOT stripped - they're part of
// many real Steam names, and the token matcher already tolerates them on either side.
const JUNK_TOKENS = new Set([
  'repack', 'fitgirl', 'dodi', 'elamigos', 'kaos', 'codex', 'plaza', 'cpy', 'skidrow', 'reloaded',
  'razor1911', 'razor', 'flt', 'tenoke', 'rune', 'empress', 'hoodlum', 'prophet', 'tinyiso', 'gog',
  'steamrip', 'steam', 'rip', 'gse', 'goldberg', 'gbe', 'crack', 'cracked', 'proper', 'readnfo',
  'repacked', 'incl', 'dlc', 'win', 'win32', 'win64', 'x86', 'x64', 'x32', 'pcdvd', 'pc', 'edition',
]);

// Lower-case, drop bracketed tags + version/build markers, split on separators, drop junk tokens.
// Returns { clean, tokens }. Note: "edition" is junk here only as a trailing packaging word; the core
// title words survive, which is what matching needs.
function cleanGameName(raw) {
  let s = String(raw || '');
  s = s.replace(/[[({][^\])}]*[\])}]/g, ' '); // [..] (..) {..} tags
  // Release-site domains ride along in repack folder names ("... v1.52 RexaGames.com"). Left in,
  // they push a title out of the exact/token tiers and into a fuzzy score that is never
  // auto-committed, so the game is simply not identified. Strip before separators are flattened.
  s = s.replace(/\b[a-z0-9][a-z0-9-]*\.(com|net|org|ru|to|io|cc|info|xyz|me|site|online|club|pw)\b/gi, ' ');
  // A glued name ("EnhancedEdition", "LittleNightmares") is the same name as the spaced one and has
  // to be cleaned like it. Kept whole, the glued word escaped the junk list and matched inside a
  // longer store title as a substring, scoring a packaging word as a confident title (Little
  // Nightmares II was set up as The Witcher: Enhanced Edition). Split after the domains, which are
  // glued words too.
  s = s.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
  s = s.replace(/\bv?\d+(\.\d+){1,}[a-z]?\b/g, ' '); // dotted versions: v1.2.3 / 1.0.0.0 (before separators are flattened)
  s = s.replace(/\bmulti\d*\b/g, ' ');
  s = s.replace(/[._-]+/g, ' '); // flatten separators so "update.5" / "update_5" become "update 5"
  s = s.replace(/\b(build|update|hotfix|patch)\s*\d+\b/g, ' ');
  s = stripPlatformTag(s);
  const tokens = s.split(/\s+/).filter((t) => t && !JUNK_TOKENS.has(t));
  return { clean: tokens.join(' ').trim(), tokens };
}

// An Xbox library calls its games "<title> for Windows 10"; the platform says nothing about the game,
// so it is dropped from both sides of a comparison. Expects lower case.
function stripPlatformTag(s) {
  return s.replace(/\b(for )?windows (10|11)\b/g, ' ');
}

function normAlnum(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function bigrams(s) {
  const m = new Map();
  for (let i = 0; i < s.length - 1; i++) {
    const g = s.slice(i, i + 2);
    m.set(g, (m.get(g) || 0) + 1);
  }
  return m;
}

// Sørensen–Dice coefficient over character bigrams (0..1). Robust to small typos/transpositions and
// cheap to compute.
function diceCoefficient(a, b) {
  if (a === b) return a ? 1 : 0;
  if (a.length < 2 || b.length < 2) return 0;
  const A = bigrams(a);
  const B = bigrams(b);
  let inter = 0;
  let total = 0;
  for (const [g, c] of A) {
    total += c;
    if (B.has(g)) inter += Math.min(c, B.get(g));
  }
  for (const [, c] of B) total += c;
  return (2 * inter) / total;
}

const lenRatio = (a, b) => (a && b ? Math.min(a, b) / Math.max(a, b) : 0);

// Score a candidate store name against a cleaned query, high → low: exact (auto-commit safe), token
// containment, fuzzy bigram (typos). Returns { score, tier } or { score: 0, tier: null }.
function scoreName(queryClean, queryTokens, queryNorm, longTok, rawName) {
  const name = stripPlatformTag(String(rawName).toLowerCase());
  const nNorm = normAlnum(name);
  if (!queryNorm || !nNorm) return { score: 0, tier: null };
  if (queryNorm === nNorm) return { score: 1, tier: 'exact' };

  const nameTokens = name.replace(/[._-]+/g, ' ').split(/\s+/).filter(Boolean);
  const nameJoined = ' ' + nameTokens.join(' ') + ' ';
  // A number only counts as a whole word: the "0" of Yakuza 0 is not inside the "10" of another name.
  const allQueryInName =
    queryTokens.length > 0 && queryTokens.every((t) => nameJoined.includes(` ${t} `) || (!/^\d+$/.test(t) && nNorm.includes(normAlnum(t))));
  const allNameInQuery = nameTokens.length > 0 && nameTokens.every((t) => queryTokens.includes(t));
  if (allQueryInName || allNameInQuery) {
    return { score: 0.82 + 0.17 * lenRatio(queryNorm.length, nNorm.length), tier: 'token' };
  }

  // Fuzzy is only worth its cost when there's a shared signal (a shared 3-char head, or the longest
  // query word's head appears in the name); skip the dice for the 99% of unrelated titles.
  const share3 = queryNorm.length >= 3 && nNorm.includes(queryNorm.slice(0, 3));
  const shareTok = longTok.length >= 4 && nameJoined.includes(longTok.slice(0, 4));
  if (!share3 && !shareTok) return { score: 0, tier: null };
  const d = diceCoefficient(queryNorm, nNorm);
  return d >= 0.5 ? { score: d, tier: 'fuzzy' } : { score: 0, tier: null };
}

/*
  Rank Steam apps against a (raw) query. `apps` is any iterable of { appid, name }. Returns the top
  matches sorted by score: [{ appid, name, score, tier }].
*/
function rankAppidCandidates(query, apps, { limit = 5, minScore = 0.5 } = {}) {
  const { clean, tokens } = cleanGameName(query);
  const queryNorm = normAlnum(clean);
  if (!queryNorm) return [];
  const longTok = tokens.reduce((a, t) => (t.length > a.length ? t : a), '');

  const results = [];
  for (const app of apps) {
    if (!app || !app.name) continue;
    const { score, tier } = scoreName(clean, tokens, queryNorm, longTok, app.name);
    if (tier && score >= minScore) results.push({ appid: app.appid, name: app.name, score, tier });
  }
  results.sort((a, b) => b.score - a.score || String(a.name).length - String(b.name).length);
  return results.slice(0, limit);
}

// Best high-confidence AppID for automatic use, or null. Only an exact match or a near-length token
// match (every cleaned query word present, lengths close) is trusted - a fuzzy guess is never
// auto-applied, since the AppID gets written to steam_appid.txt.
function bestConfidentAppid(query, apps) {
  if (!namesAGame(query)) return null;
  const ranked = rankAppidCandidates(query, apps, { limit: 10, minScore: 0.6 });
  // A token match leaves words out on one side, and a series number is never one of them: Yakuza
  // Kiwami is not Yakuza Kiwami 2, nor is Frostpunk 2 Frostpunk.
  const hit = ranked.find((r) => r.tier === 'exact') || ranked.find((r) => r.tier === 'token' && r.score >= 0.9 && sameNumbers(query, r.name));
  return hit ? hit.appid : null;
}

/*
  Words that never distinguish one game from another: grammar, packaging, and the platform tag a
  Ubisoft SKU name carries. Ignored on BOTH sides of the comparison below, so "Anno 1404" and
  "Anno 1404 - History Edition" are the same title while "Far Cry" and "Far Cry Primal" are not.
*/
const TITLE_FILLER = new Set([
  'the', 'a', 'an', 'of', 'and', 'for', 'to', 'in', 'on', 'at', 'de', 'le', 'la', 'les',
  'edition', 'editions', 'gold', 'deluxe', 'standard', 'complete', 'ultimate', 'premium', 'history',
  'definitive', 'special', 'collectors', 'collector', 'anniversary', 'goty', 'game', 'year', 'pack',
  'bundle', 'uplay', 'ubisoft', 'connect', 'steam', 'version', 'pc',
]);

// Packaging words a repack names a subfolder after, on top of TITLE_FILLER. None of them says which
// game it is, so a query made only of these is not a title at all.
const PACKAGING_WORDS = new Set(['enhanced', 'remastered', 'remaster', 'director', 'directors', 'cut', 'digital', 'content', 'soundtrack', 'artbook', 'extras', 'bonus']);

/*
  Does `query` contain at least one word that could tell one game from another? A repack that ships
  two builds side by side names one of them "EnhancedEdition": glued into one token, that word sits
  inside "The Witcher: Enhanced Edition" and scored as a confident token match, so Little Nightmares
  II was set up as The Witcher (its DLC list and all). camelCase is split here so the glued form is
  judged like the spaced one.
*/
function namesAGame(query) {
  const spaced = String(query || '').replace(/([a-z])([A-Z])/g, '$1 $2');
  return cleanGameName(spaced)
    .tokens.map((t) => t.replace(/[^a-z0-9]/g, ''))
    .some((t) => t && !TITLE_FILLER.has(t) && !PACKAGING_WORDS.has(t));
}

const ROMAN_NUMERALS = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10, xi: 11, xii: 12 };

// "III" and "3" name the same entry in a series, and a title's number is the one token that must
// never be treated loosely: Assassin's Creed and Assassin's Creed II are different games.
function titleNumbers(tokens) {
  const out = new Set();
  for (const token of tokens) {
    if (/^\d+$/.test(token)) out.add(Number(token));
    else if (/^\d+(st|nd|rd|th)$/.test(token)) out.add(Number(token.replace(/\D+$/, '')));
    else if (ROMAN_NUMERALS[token] != null) out.add(ROMAN_NUMERALS[token]);
  }
  return out;
}

function sameNumberSet(q, n) {
  return q.size === n.size && [...q].every((value) => n.has(value));
}

function sameNumbers(query, name) {
  return sameNumberSet(titleNumbers(significantTokens(query)), titleNumbers(significantTokens(name)));
}

// A store dates an edition ("Sea of Thieves 2024 Edition", "... 40th Anniversary Edition"); that number
// is packaging. A year in brackets is the opposite: it is how a store tells the original of a game
// from its remake ("Dead Space (2008)"), and cleanGameName drops brackets, so it is read first.
const EDITION_NUMBER = /\b\d{4} edition\b|\b\d+(st|nd|rd|th) anniversary\b/gi;
const BRACKETED_YEAR = /[([]\s*((?:19|20)\d{2})\s*[)\]]/g;

function significantTokens(raw) {
  const text = String(raw || '');
  const years = [...text.matchAll(BRACKETED_YEAR)].map((m) => m[1]);
  const tokens = cleanGameName(text.replace(EDITION_NUMBER, ' '))
    .tokens.map((t) => t.replace(/[^a-z0-9]/g, ''))
    .filter((t) => t && !TITLE_FILLER.has(t));
  return tokens.concat(years);
}

// What sameTitle compares, worked out once so a name can be held against many others.
function titleKey(raw) {
  const tokens = significantTokens(raw);
  return {
    numbers: titleNumbers(tokens),
    words: tokens.filter((t) => !/^\d+$/.test(t) && ROMAN_NUMERALS[t] == null),
    empty: tokens.length === 0,
  };
}

function sameTitleKeys(q, n) {
  if (q.empty || n.empty || !sameNumberSet(q.numbers, n.numbers)) return false;
  return q.words.every((t) => tokenCovered(t, n.words)) && n.words.every((t) => tokenCovered(t, q.words));
}

// Is `token` the same word as one of `others`, allowing the kind of slip a catalogue really contains
// ("Frontier" for "Frontiers")? Deliberately not a general fuzzy match: a shared prefix alone is not
// enough, or "Primal" would be covered by "Pri…" and the whole guard would leak.
function tokenCovered(token, others) {
  for (const other of others) {
    if (token === other) return true;
    if (token.length >= 4 && other.length >= 4 && (token.startsWith(other) || other.startsWith(token))) {
      // One word being a prefix of the other is only a typo when they are nearly the same length
      // ("frontier"/"frontiers"), never when it is a longer, different word.
      if (Math.abs(token.length - other.length) <= 2) return true;
    }
    if (token.length >= 5 && other.length >= 5 && diceCoefficient(token, other) >= 0.8) return true;
  }
  return false;
}

/*
  Does `name` title the SAME game as `query`, rather than a relative of it?

  Every significant word has to be accounted for in both directions, and the series numbers have to
  be identical. This is what separates a spelling slip from a different product:

    "Avatar: Frontier of Pandora"  vs "Avatar: Frontiers of Pandora"   -> same  (a typo)
    "Anno 1404"                    vs "Anno 1404 - History Edition"    -> same  (packaging)
    "Silent Hunter 3"              vs "Silent Hunter III"              -> same  (numeral spelling)
    "Assassin's Creed III"         vs "Assassin's Creed III Remastered"-> DIFFERENT
    "Far Cry"                      vs "Far Cry Primal"                 -> DIFFERENT
    "Tom Clancy's Rainbow Six"     vs "Tom Clancy's Rainbow Six Siege" -> DIFFERENT
    "Assassin's Creed"             vs "Assassin's Creed II"            -> DIFFERENT

  It refuses some correct pairs too ("Starlink" vs "Starlink: Battle for Atlas"). That is the trade
  this is for: a refusal costs a game its automatic mapping, a wrong answer writes another game's
  achievements into it.
*/
function sameTitle(query, name) {
  return sameTitleKeys(titleKey(query), titleKey(name));
}

/*
  Two titles sameTitleKeys accepts always share their numbers and the first letters of their words
  (a covered word is the same word, a near-length prefix of it, or a slip of it), so this bucket is
  the only place a match can be. It keeps a whole account library against a whole Steam library
  from comparing every pair.
*/
function titleBucket(key) {
  const numbers = [...key.numbers].sort((a, b) => a - b).join(',');
  const initials = [...new Set(key.words.map((w) => w[0]))].sort().join('');
  return `${numbers}|${initials}`;
}

// Index `apps` ({ appid, name }) once for repeated sameTitleAppid lookups.
function titleIndex(apps) {
  const buckets = new Map();
  for (const app of apps || []) {
    if (!app || !app.name) continue;
    const key = titleKey(app.name);
    if (key.empty) continue;
    const bucket = titleBucket(key);
    if (!buckets.has(bucket)) buckets.set(bucket, []);
    buckets.get(bucket).push({ ...app, key });
  }
  return { buckets };
}

/*
  The one app in `apps` ({ appid, name }, or a titleIndex of them) that is the same game as
  `query`, or null - also null when two apps qualify equally, since picking either would be a
  guess. Unlike bestConfidentAppid this is not a search: a listing named after its edition ("Control Ultimate Edition") is the bare store
  title however much longer its name is, and a relative ("Far Cry Primal") never is.
*/
function sameTitleAppid(query, appsOrIndex) {
  const key = titleKey(query);
  if (key.empty) return null;
  const index = appsOrIndex && appsOrIndex.buckets instanceof Map ? appsOrIndex : titleIndex(appsOrIndex);
  const matches = (index.buckets.get(titleBucket(key)) || []).filter((app) => sameTitleKeys(key, app.key));
  if (matches.length === 1) return matches[0].appid;
  // Several candidates: only one spelled exactly like the query can settle it.
  const queryNorm = normAlnum(stripPlatformTag(String(query).toLowerCase()));
  const exact = matches.filter((app) => normAlnum(stripPlatformTag(String(app.name).toLowerCase())) === queryNorm);
  return exact.length === 1 ? exact[0].appid : null;
}

module.exports = {
  cleanGameName,
  normAlnum,
  diceCoefficient,
  rankAppidCandidates,
  bestConfidentAppid,
  sameTitle,
  sameTitleAppid,
  titleIndex,
  TITLE_FILLER,
};
