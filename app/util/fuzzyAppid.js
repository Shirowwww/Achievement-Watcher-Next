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
  let s = String(raw || '').toLowerCase();
  s = s.replace(/[[({][^\])}]*[\])}]/g, ' '); // [..] (..) {..} tags
  // Release-site domains ride along in repack folder names ("... v1.52 RexaGames.com"). Left in,
  // they push a title out of the exact/token tiers and into a fuzzy score that is never
  // auto-committed, so the game is simply not identified. Strip before separators are flattened.
  s = s.replace(/\b[a-z0-9][a-z0-9-]*\.(com|net|org|ru|to|io|cc|info|xyz|me|site|online|club|pw)\b/g, ' ');
  s = s.replace(/\bv?\d+(\.\d+){1,}[a-z]?\b/g, ' '); // dotted versions: v1.2.3 / 1.0.0.0 (before separators are flattened)
  s = s.replace(/\bmulti\d*\b/g, ' ');
  s = s.replace(/[._-]+/g, ' '); // flatten separators so "update.5" / "update_5" become "update 5"
  s = s.replace(/\b(build|update|hotfix|patch)\s*\d+\b/g, ' ');
  const tokens = s.split(/\s+/).filter((t) => t && !JUNK_TOKENS.has(t));
  return { clean: tokens.join(' ').trim(), tokens };
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
function scoreName(queryClean, queryTokens, queryNorm, longTok, name) {
  const nNorm = normAlnum(name);
  if (!queryNorm || !nNorm) return { score: 0, tier: null };
  if (queryNorm === nNorm) return { score: 1, tier: 'exact' };

  const nameTokens = String(name).toLowerCase().replace(/[._-]+/g, ' ').split(/\s+/).filter(Boolean);
  const nameJoined = ' ' + nameTokens.join(' ') + ' ';
  const allQueryInName = queryTokens.length > 0 && queryTokens.every((t) => nameJoined.includes(` ${t} `) || nNorm.includes(normAlnum(t)));
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
  const ranked = rankAppidCandidates(query, apps, { limit: 10, minScore: 0.6 });
  const hit = ranked.find((r) => r.tier === 'exact') || ranked.find((r) => r.tier === 'token' && r.score >= 0.9);
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

function significantTokens(raw) {
  return cleanGameName(raw)
    .tokens.map((t) => t.replace(/[^a-z0-9]/g, ''))
    .filter((t) => t && !TITLE_FILLER.has(t));
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
  const q = significantTokens(query);
  const n = significantTokens(name);
  if (q.length === 0 || n.length === 0) return false;

  const qNumbers = titleNumbers(q);
  const nNumbers = titleNumbers(n);
  if (qNumbers.size !== nNumbers.size) return false;
  for (const value of qNumbers) if (!nNumbers.has(value)) return false;

  const words = (tokens) => tokens.filter((t) => !/^\d+$/.test(t) && ROMAN_NUMERALS[t] == null);
  const qWords = words(q);
  const nWords = words(n);
  return qWords.every((t) => tokenCovered(t, nWords)) && nWords.every((t) => tokenCovered(t, qWords));
}

module.exports = { cleanGameName, normAlnum, diceCoefficient, rankAppidCandidates, bestConfidentAppid, sameTitle, TITLE_FILLER };
