'use strict';

/*
  Resolve "which Steam game is Ubisoft product 3539?" without a shipped table.

  Why this is allowed to answer at all: a Uplay emulator save is a folder named with the Ubisoft
  product id and keyed by Ubisoft objective ids. Nothing in it names a Steam game, yet the only free
  public copy of a Ubisoft game's achievement list is Steam's - so a product id has to be paired with
  an AppID before any of it can be read. app/assets/uplay-steam.json is a snapshot of those pairings;
  this module is what answers for a product the snapshot does not list.

  Why it refuses so often: writing the wrong AppID is not a cosmetic error. It would generate another
  game's achievement schema into this game's folder, so the loader would look up ids that mean
  something else and the setup would look healthy while recording nonsense. A refusal costs a game
  its automatic mapping and nothing more - the shipped table, the install's own files, and the
  interactive "Identify the game" picker all still apply. So the bar is: answer only when the two
  titles are the SAME title, and only when exactly one candidate qualifies.

  Measured before shipping, against every one of the 274 pairings the shipped table carries and
  with the WHOLE Ubisoft catalogue offered as candidates: 219 resolved, zero wrong.
*/

const path = require('path');
const fuzzyAppid = require(path.join(__dirname, '..', 'util', 'fuzzyAppid.js'));
const uplayCatalogue = require(path.join(__dirname, 'uplayCatalogue.js'));

let debug = { log() {}, warn() {}, error() {} };

module.exports.initDebug = ({ isDev, userDataPath }) => {
  debug = new (require(path.join(__dirname, '..', 'util', 'logger.js')))({
    console: isDev || false,
    file: path.join(userDataPath, 'logs/parser.log'),
  });
};

/*
  A Ubisoft product id is per-SKU: the same game has separate ids for its regional releases, its
  storefront variants and its editions. These suffixes name the same game and are noise for a Steam
  lookup; they are stripped rather than being allowed to defeat the search.
*/
const SKU_SUFFIX =
  /\s*[([](?:uplay(?: connect)?|ubisoft connect|steam(?: version)?|epic|pc|ru|jpn|cz|kr|asia|australia|steam version\/australia|uplay version\/australia)[)\]]\s*/gi;

/*
  These name a DIFFERENT product that merely shares a title. A demo has its own product id, no
  achievements of its own, and resolving it to the full game would attach that game's whole
  achievement list to a build that can never unlock any of it.
*/
const NOT_THE_BASE_GAME = /\b(demo|beta|trial|pts|public test|open test|test server|preview|benchmark|club access|season pass|starter pack)\b/i;

/*
  Ubisoft sells editions; Steam's name search does not know them. Left in, "Assassin's Creed Origins
  - Gold Edition" returns no results at all, which reads as "no such game" rather than "wrong search
  term". Stripped only from the END of the title, so a game genuinely called "Gold" keeps its name.
  This affects the QUERY only - sameTitle() still decides, so a looser search cannot produce a looser
  answer, just a search that finds the game at all.
*/
const TRAILING_EDITION =
  /\s*[-\u2013\u2014:]?\s*\b(gold|deluxe|standard|complete|ultimate|premium|history|definitive|special|collector'?s|anniversary|legacy|remastered edition|game of the year|goty)\b\s*(edition)?\s*$/i;

/*
  The same suffixes again, but written without brackets - "Far Cry 4 RU", "Assassin's Creed Rogue
  Asia", "Watch Dogs Asia (Steam)". A region is a SKU of one game, never a different game, so it is
  dropped; only as a trailing token, so a title that ends in a real word keeps it. Deliberately does
  NOT include "HD": Liberation HD and Liberation are separate releases with separate achievements.
*/
const TRAILING_REGION = /\s+(ru|jpn|jp|cz|kr|eu|na|asia|australia|latam|brazil|china|chinese|korea|japan|japanese|russia|russian)\s*$/i;

function cleanProductName(raw) {
  let name = String(raw == null ? '' : raw)
    .replace(SKU_SUFFIX, ' ')
    .replace(/[®™©]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const withoutRegion = name.replace(TRAILING_REGION, '').trim();
  if (withoutRegion) name = withoutRegion;
  // "X - Gold Edition" can also be "X - Complete Edition Gold": peel repeatedly, bounded.
  for (let i = 0; i < 3; i++) {
    const peeled = name.replace(TRAILING_EDITION, '').trim();
    if (peeled === name || !peeled) break;
    name = peeled;
  }
  return name.replace(/\s*[-\u2013\u2014:]\s*$/, '').trim();
}

/*
  Pick the one candidate that is this product, or null.

  `candidates` is whatever a Steam name search returned ([{ appid, name }]). Exported separately from
  the network so the decision is testable on its own - it is the part that must never be wrong.
*/
function chooseCandidate(productName, candidates) {
  const term = cleanProductName(productName);
  if (!term || NOT_THE_BASE_GAME.test(term)) return null;

  const same = [];
  for (const app of Array.isArray(candidates) ? candidates : []) {
    if (!app || !app.name) continue;
    const appid = String(app.appid || '');
    if (!/^[0-9]+$/.test(appid)) continue;
    // A demo/beta on the Steam side is not this product either, whatever its title says.
    if (NOT_THE_BASE_GAME.test(app.name)) continue;
    if (!fuzzyAppid.sameTitle(term, app.name)) continue;
    if (!same.some((entry) => entry.appid === appid)) same.push({ appid, name: String(app.name) });
  }
  if (same.length === 0) return null;

  /*
    The product names an edition, and some OTHER Steam release carries that same edition word. Steam
    splits a game into separate AppIDs that way ("The Settlers 7: Paths to a Kingdom" and "The
    Settlers 7 : History Edition" are two releases with two achievement lists), and the edition is
    stripped from the search term, so the survivor here is the base game while the product is not.
    Checked against every candidate, not just the survivors: the release that would win carries a
    title the stripped term no longer resembles, which is exactly why it is not among them.
  */
  const wanted = editionMarkers(productName);
  if (wanted.size > 0) {
    const productWords = titleWords(term);
    const elsewhere = (Array.isArray(candidates) ? candidates : []).some((app) => {
      if (!app || !app.name || same.some((entry) => entry.appid === String(app.appid))) return false;
      if (!sameMarkers(wanted, editionMarkers(app.name))) return false;
      // Only ANOTHER RELEASE OF THIS GAME counts. Steam sells a "History Edition" of half the Anno
      // and Settlers back-catalogue; sharing that word with an unrelated title means nothing. A
      // shorter form of the same title does ("The Settlers 7" against "The Settlers 7: Paths to a
      // Kingdom"), and that shorter form is why the stripped search term missed it.
      const other = titleWords(app.name);
      return other.length > 0 && other.every((word) => productWords.includes(word));
    });
    if (elsewhere) return null;
  }

  if (same.length === 1) return same[0];

  /*
    More than one Steam release carries this title. That happens because an edition word is packaging
    on Ubisoft's side (it sells "Assassin's Creed Origins - Gold Edition" of one game) but a SEPARATE
    RELEASE on Steam's ("Anno 1404" and "Anno 1404 - History Edition" are two AppIDs with two
    achievement lists). The stripped term cannot tell them apart, so compare against the FULL product
    name, editions included, and take the release that spells it exactly. Anything else is a question
    the name cannot settle, and goes unanswered.
  */
  const full = fuzzyAppid.normAlnum(String(productName).replace(/[®™©]/g, ''));
  const exact = same.filter((entry) => fuzzyAppid.normAlnum(entry.name) === full);
  return exact.length === 1 ? exact[0] : null;
}

// The words a storefront uses to sell one game twice. Not a general vocabulary: only tokens that
// really do split a Ubisoft title into separate Steam AppIDs belong here.
const EDITION_MARKERS = new Set([
  'gold', 'deluxe', 'complete', 'ultimate', 'premium', 'history', 'definitive', 'special',
  'collectors', 'collector', 'anniversary', 'goty', 'remastered', 'remaster', 'legacy', 'enhanced', 'redux',
]);

// A title's own words, with the packaging removed: what is left is what names the game.
function titleWords(name) {
  return fuzzyAppid
    .cleanGameName(name)
    .tokens.map((token) => token.replace(/[^a-z0-9]/g, ''))
    .filter((token) => token && !EDITION_MARKERS.has(token) && !fuzzyAppid.TITLE_FILLER.has(token));
}

function editionMarkers(name) {
  const out = new Set();
  for (const token of String(name).toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(/\s+/)) {
    if (EDITION_MARKERS.has(token)) out.add(token);
  }
  return out;
}

function sameMarkers(a, b) {
  if (a.size !== b.size) return false;
  for (const value of a) if (!b.has(value)) return false;
  return true;
}

/*
  The same decision, with the Steam search in front of it. `steam` is app/parser/steam.js, passed in
  so this module stays free of the renderer-only requires that file pulls in.
  Returns { steamAppid, steamName, productName } | null.
*/
async function resolve(uplayId, { name = '', steam } = {}) {
  const id = String(uplayId || '').trim();
  if (!/^[0-9]+$/.test(id) || !steam || typeof steam.searchAppsByName !== 'function') return null;

  // The catalogue's own name is preferred over a caller's: Ubisoft's spelling of its own product
  // beats a folder name, and the catalogue is refreshed while a folder name never is.
  const productName = uplayCatalogue.nameFor(id) || String(name || '').trim();
  const term = cleanProductName(productName);
  if (!term) return null;
  if (NOT_THE_BASE_GAME.test(term)) {
    debug.log(`[uplay-automap] ${id} "${productName}" names a demo/beta, not the game it belongs to - not mapped`);
    return null;
  }

  let candidates = [];
  try {
    candidates = await steam.searchAppsByName(term);
  } catch (err) {
    debug.log(`[uplay-automap] Steam search failed for "${term}" => ${err && (err.code || err.message) ? err.code || err.message : err}`);
    return null;
  }

  const chosen = chooseCandidate(productName, candidates);
  if (!chosen) {
    debug.log(`[uplay-automap] ${id} "${term}": no single Steam game carries this exact title - left unmapped`);
    return null;
  }
  debug.log(`[uplay-automap] ${id} "${term}" -> Steam ${chosen.appid} "${chosen.name}"`);
  return { steamAppid: chosen.appid, steamName: chosen.name, productName };
}

module.exports.resolve = resolve;
module.exports.chooseCandidate = chooseCandidate;
module.exports.cleanProductName = cleanProductName;
