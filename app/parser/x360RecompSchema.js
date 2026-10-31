'use strict';

/*
  A recompiled game's achievement list, texts, pictures and art. The game's own default.xex is the
  exact source (its SPA: every language, the real image ids, the icons themselves); dbox.tools,
  which lists every Xbox 360 achievement by title id, stands in when no default.xex has been found,
  and names a JSON list's title from its ids and gamerscores.
*/

const fs = require('fs');
const path = require('path');
// Unpacked beside this file for the Watchdog (electron-builder.yml asarUnpack).
const { fillMissingIcons, nodeFetch, marketplaceArtUrl, downloadImage } = require(path.join(__dirname, '..', 'util', 'xboxLiveIcons.js'));
const xex = require(path.join(__dirname, 'xex.js'));
const spaReader = require(path.join(__dirname, 'xllnSpa.js'));
const reblueBonus = require(path.join(__dirname, 'reblueBonus.js'));
const state = require(path.join(__dirname, 'x360RecompState.js'));
const formats = require(path.join(__dirname, 'x360RecompFormats.js'));
const { readXexIndex } = require(path.join(__dirname, 'x360RecompDiscovery.js'));

const { debug, writeAtomic, iconDirFor, appidOf } = state;

const DBOX_API = 'https://dbox.tools/api';
const DBOX_TIMEOUT_MS = 15000;
const SCHEMA_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const IDENTIFY_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const IDENTIFY_MAX_CANDIDATES = 12;
const IDENTIFY_MIN_ACHIEVEMENTS = 5;
const ISOLATION_ATTEMPTS = 2;
// How long a game load waits for its default.xex to be read before taking dbox.tools' copy of the
// list. Extractions run one at a time, and one queued behind others used to cost the whole game
// load (#157); the read goes on, and its list is the one used from the next scan.
const SPA_WAIT_MS = 8000;
const CJK_RE = /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/;
const CJK_LANGS = new Set(['japanese', 'schinese', 'tchinese', 'koreana']);

// AW's Steam language names onto the ten locales dbox.tools carries.
const DBOX_LOCALE_BY_LANG = Object.freeze({
  english: 'en_US',
  french: 'fr_FR',
  german: 'de_DE',
  spanish: 'es_ES',
  latam: 'es_ES',
  italian: 'it_IT',
  japanese: 'ja_JP',
  koreana: 'ko_KR',
  russian: 'ru_RU',
  polish: 'pl_PL',
  dutch: 'nl_NL',
});

const fileUrl = (file) => 'file:///' + file.replace(/\\/g, '/');

function readJsonOrNull(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function readSchemaCache(titleId) {
  const cached = readJsonOrNull(state.schemaCacheFile(titleId));
  return cached && Array.isArray(cached.achievements) && cached.achievements.length > 0 ? cached : null;
}

/*
  A dbox.tools that could not be reached is left alone for a while, as Xbox Live's image hosts are
  (xboxLiveIcons.js): a network that resets it after twelve seconds made every request of one load
  pay that again, and a game read from its own executable missed the load limit (#157).
*/
const DBOX_COOLDOWN_MS = 10 * 60 * 1000;
const dboxDownUntil = new WeakMap();

async function fetchJson(url, fetchImpl) {
  if ((dboxDownUntil.get(fetchImpl) || 0) > Date.now()) throw new Error(`dbox.tools was unreachable a moment ago, ${url} is not asked`);
  let resp;
  try {
    resp = await fetchImpl(url, { signal: AbortSignal.timeout(DBOX_TIMEOUT_MS) });
    if (!resp.ok) throw Object.assign(new Error(`${url} answered ${resp.status}`), { status: resp.status });
    return await resp.json();
  } catch (err) {
    // An answer, a refusal or a broken page included, says the site is up.
    if (!(err && err.status) && !(err instanceof SyntaxError)) dboxDownUntil.set(fetchImpl, Date.now() + DBOX_COOLDOWN_MS);
    throw err;
  }
}

// A 404 is the site saying there is nothing there; any other failure may go better next time.
const isNotFound = (err) => Boolean(err && err.status === 404);

// The title's list from dbox.tools, cached; a stale copy still answers when the site does not.
async function loadSchema(titleId, fetchImpl = nodeFetch) {
  const cached = readSchemaCache(titleId);
  if (cached && Date.now() - Number(cached.fetchedAt || 0) < SCHEMA_TTL_MS) return cached;
  try {
    const achievements = await fetchJson(`${DBOX_API}/achievements/v1/${titleId}`, fetchImpl);
    if (!Array.isArray(achievements) || achievements.length === 0) throw new Error(`dbox.tools lists no achievements for ${titleId}`);
    // A failed name request keeps the name already known instead of caching none for the TTL.
    const title = await fetchJson(`${DBOX_API}/title_ids/${titleId}`, fetchImpl).catch((err) => {
      debug.warn(`[x360recomp] no title name for ${titleId}: ${err}`);
      return cached;
    });
    const fresh = { fetchedAt: Date.now(), name: String((title && title.name) || '').trim(), achievements };
    try {
      writeAtomic(state.schemaCacheFile(titleId), JSON.stringify(fresh));
    } catch (err) {
      debug.warn(`[x360recomp] could not cache the schema of ${titleId}: ${err}`);
    }
    return fresh;
  } catch (err) {
    if (cached) return cached;
    throw err;
  }
}

// The entry's text in `lang`, falling back to English; with `exact`, only that language or null.
// A locale whose text merely repeats another locale's is a copy dbox.tools filled in, not a
// translation (Castlevania's Japanese release has Japanese under ru_RU), so it counts as missing.
function localized(entry, lang, { exact = false } = {}) {
  const list = Array.isArray(entry.localizations) ? entry.localizations : [];
  const pick = (id) => list.find((l) => l && l.locale && l.locale.identifier === id);
  // English and Japanese are the texts dbox copies from; any other locale must differ from both.
  const originals = new Set(['en_US', 'ja_JP']);
  const own = (l) =>
    !!l && (originals.has(l.locale.identifier) || !list.some((other) => other && other.locale && originals.has(other.locale.identifier) && other.name === l.name));
  const wanted = DBOX_LOCALE_BY_LANG[lang] ? pick(DBOX_LOCALE_BY_LANG[lang]) : null;
  if (exact) return wanted && own(wanted) ? wanted : null;
  if (wanted && (own(wanted) || DBOX_LOCALE_BY_LANG[lang] === 'en_US')) return wanted;
  return pick('en_US') || wanted || list[0] || {};
}

// ReXGlue names its Documents folder like "dantes_inferno"; a real folder name is kept as it is.
function prettyFolderName(folder) {
  const name = String(folder || '').trim();
  if (!name.includes('_') && /[A-Z]/.test(name)) return name;
  return name.replace(/_+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).trim();
}

/*
  dbox.tools names some titles after a regional edition ("Dante's Inferno: Shinkyoku Jigoku-hen").
  When the game's folder names it without the subtitle, the subtitle goes.
*/
function gameName(schemaName, folder) {
  const compact = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const head = String(schemaName || '').split(':')[0].trim();
  if (head && head !== schemaName && compact(folder) && compact(folder) === compact(head)) return head;
  return schemaName;
}

/*
  Without the game's executable, icons come from Xbox Live's old image host, keyed by an image id
  dbox.tools does not carry. Titles whose achievements run 1..N use the id as image id (checked on
  Dante's Inferno and LEGO Dimensions); the others do not (Spider-Man: Edge of Time pairs 46 with
  image 2, Midnight Club shuffles them), and a guess there puts the wrong picture on every row.
*/
async function withIcons(titleId, list, fetchImpl, { trusted = false } = {}) {
  if (!trusted && !list.every((entry) => Number(entry.name) >= 1 && Number(entry.name) <= list.length)) {
    debug.log(`[x360recomp] ${titleId} achievement ids do not run 1..${list.length}; no Xbox Live icons`);
    return;
  }
  const iconDir = iconDirFor(titleId);
  try {
    fs.mkdirSync(iconDir, { recursive: true });
  } catch {
    return;
  }
  await fillMissingIcons(titleId, iconDir, list.map((entry) => ({ entry, imageId: Number(entry.name) })), fetchImpl);
}

// The stamp of the default.xex a SPA would come from (path, size, mtime), '' when it cannot be read.
function xexStamp(file) {
  try {
    const stat = fs.statSync(file);
    return `${file}|${stat.size}|${stat.mtimeMs}`;
  } catch {
    return '';
  }
}

const missFile = (titleId) => `${state.spaCacheFile(titleId)}.missing`;
const attemptsFile = (titleId) => `${state.spaCacheFile(titleId)}.attempts`;

// The extractions of this exact xex that could not run, this one included. Kept on disk: every scan
// host is a new process, so a count kept in memory never reached the limit (#157).
function countIsolationFailure(titleId, stamp) {
  const [seenStamp, seen] = String(readFileOrNull(attemptsFile(titleId), 'utf8') || '').split('\n');
  const failures = (seenStamp === stamp ? Number(seen) || 0 : 0) + 1;
  try {
    if (stamp) writeAtomic(attemptsFile(titleId), `${stamp}\n${failures}`);
  } catch {
    /* only a count */
  }
  return failures;
}

function rememberMiss(titleId, stamp) {
  try {
    if (stamp) writeAtomic(missFile(titleId), stamp);
  } catch {
    /* only a cache */
  }
}

function readFileOrNull(file, encoding) {
  try {
    return fs.readFileSync(file, encoding);
  } catch {
    return null;
  }
}

/*
  The SPA inside the title's default.xex as { spa, stamp }, kept in the cache, or null. It runs
  isolated and time-limited, so a crafted executable cannot hang the caller. A miss is remembered
  for this exact xex: reading and unpacking up to 256 MB again on every scan and every unlock would
  never find a different answer.
*/
async function extractSpa(titleId, xexPath) {
  const candidate = xexPath && fs.existsSync(xexPath) ? xexPath : readXexIndex()[titleId];
  if (!candidate || !fs.existsSync(candidate)) return null;
  const stamp = xexStamp(candidate);
  if (stamp && readFileOrNull(missFile(titleId), 'utf8') === stamp) return null;
  try {
    const read = await xex.readSpaIsolated(candidate);
    if (!read || read.titleId !== titleId) {
      rememberMiss(titleId, stamp);
      return null;
    }
    writeAtomic(state.spaCacheFile(titleId), read.spa);
    return { spa: read.spa, stamp };
  } catch (err) {
    debug.warn(`[x360recomp] cannot read the achievement list inside '${candidate}': ${err}`);
    // A timeout or a worker that could not start (an antivirus, a busy machine) is tried once
    // more; a file that fails twice would hold the one extraction queue on every scan.
    if ((err && err.answered) || countIsolationFailure(titleId, stamp) >= ISOLATION_ATTEMPTS) rememberMiss(titleId, stamp);
    return null;
  }
}

// The SPA of a title, parsed, or null. Extracted once from the default.xex and kept: it never changes.
async function loadSpa(titleId, xexPath) {
  const cached = readFileOrNull(state.spaCacheFile(titleId));
  const fresh = cached ? null : await extractSpa(titleId, xexPath);
  const spa = cached || (fresh && fresh.spa);
  if (!spa) return null;
  try {
    return spaReader.parseSpa(spa, { onSkip: (message) => debug.log(`[x360recomp] ${titleId}: ${message}`) });
  } catch (err) {
    debug.warn(`[x360recomp] the cached achievement list of ${titleId} is unreadable: ${err}`);
    // Dropped so the next look extracts it again; a fresh copy that fails as well is not retried.
    try {
      fs.rmSync(state.spaCacheFile(titleId), { force: true });
    } catch {
      /* read again, and dropped again, next time */
    }
    if (fresh) rememberMiss(titleId, fresh.stamp);
    return null;
  }
}

// Bit 3 of an Xbox 360 achievement's flags shows it before it is earned; without it, it is secret.
const isSecret = (flags) => (Number(flags) & 0x8) === 0;

// The achievement's picture written once into the icon cache, as a file URL; '' without one.
function spaIcon(iconDir, parsed, achievement) {
  const image = parsed.images.get(achievement.imageId);
  if (!iconDir || !image || image.length === 0) return '';
  const iconPath = path.join(iconDir, `${achievement.imageId}.png`);
  try {
    // Whole or not at all: a picture cut short would be kept as it is from then on.
    if (!fs.existsSync(iconPath)) writeAtomic(iconPath, image);
    return fileUrl(iconPath);
  } catch {
    return '';
  }
}

function listFromSpa(titleId, parsed, lang) {
  const languageId = spaReader.pickLanguage(parsed, lang);
  const strings = languageId == null ? new Map() : parsed.stringsByLanguage.get(languageId) || new Map();
  const englishId = spaReader.pickLanguage(parsed, 'english');
  const english = englishId == null ? strings : parsed.stringsByLanguage.get(englishId) || strings;
  const text = (id) => String(strings.get(id) || english.get(id) || '').trim();
  const englishText = (id) => String(english.get(id) || strings.get(id) || '').trim();

  let iconDir = iconDirFor(titleId);
  try {
    fs.mkdirSync(iconDir, { recursive: true });
  } catch {
    iconDir = '';
  }
  return parsed.achievements.map((achievement) => {
    const icon = spaIcon(iconDir, parsed, achievement);
    return {
      name: String(achievement.id),
      displayName: text(achievement.titleStringId) || String(achievement.id),
      description: text(achievement.unlockedDescriptionId) || text(achievement.lockedDescriptionId),
      hidden: isSecret(achievement.flags) ? 1 : 0,
      gamerscore: achievement.gamerscore,
      icon,
      icongray: icon,
      rarityName: englishText(achievement.titleStringId),
      rarityDescription: englishText(achievement.unlockedDescriptionId) || englishText(achievement.lockedDescriptionId),
    };
  });
}

function listFromDbox(schema, lang, { exact = false } = {}) {
  return schema.achievements
    .filter((entry) => entry && Number.isInteger(entry.achievement_id) && !entry.is_revoked)
    .filter((entry) => !exact || localized(entry, lang, { exact: true }))
    .map((entry) => {
      const text = localized(entry, lang, { exact });
      const english = localized(entry, 'english');
      return {
        name: String(entry.achievement_id),
        displayName: String(text.name || entry.achievement_id).trim(),
        description: String(text.description || text.locked_description || '').trim(),
        hidden: entry.is_secret || (entry.flags !== undefined && isSecret(entry.flags)) ? 1 : 0,
        gamerscore: Number(entry.gamerscore) || 0,
        icon: '',
        icongray: '',
        rarityName: String(english.name || '').trim(),
        rarityDescription: String(english.description || english.locked_description || '').trim(),
      };
    });
}

/*
  The title's own marketplace art: a 219x300 box, a 1280x720 background and a 64x64 tile. The host is
  plain http, so the files are kept in the icon cache and shown from disk like the achievement icons.
*/
async function marketplaceArt(titleId, fetchImpl) {
  const dir = path.join(iconDirFor(titleId), 'art');
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {
    return {};
  }
  const img = {};
  const wanted = { portrait: 'boxartlg.jpg', background: 'background.jpg', icon: 'tile.png' };
  await Promise.all(
    Object.entries(wanted).map(async ([slot, file]) => {
      const target = path.join(dir, file);
      if (fs.existsSync(target) || (await downloadImage(marketplaceArtUrl(titleId, file), target, fetchImpl))) img[slot] = fileUrl(target);
    })
  );
  // The marketplace background is raw key art, not a pre-darkened page: the game screen veils it.
  return img.background ? { ...img, overlay: true } : img;
}

// { name, marketName }: dbox.tools' title name and the Xbox 360 marketplace's English one.
async function titleNamesFor(titleId, fetchImpl) {
  const cached = readJsonOrNull(state.titleCacheFile(titleId));
  if (cached && cached.name) return cached;
  const names = { name: '', marketName: '' };
  let answered = true;
  try {
    const title = await fetchJson(`${DBOX_API}/title_ids/${titleId}`, fetchImpl);
    names.name = String((title && title.name) || '').trim();
    const productUrl = `${DBOX_API}/marketplace/products/66acd000-77fe-1000-9115-d802${titleId.toLowerCase()}`;
    const product = await fetchJson(productUrl, fetchImpl).catch((err) => {
      answered = isNotFound(err);
      return null;
    });
    names.marketName = String((product && product.default_title) || '').replace(/^Full Game\s*-\s*/i, '').trim();
  } catch {
    return { name: (readSchemaCache(titleId) || {}).name || '', marketName: '' };
  }
  // A product request that failed is asked again: cached, its missing name would stay missing.
  if (names.name && answered) {
    try {
      writeAtomic(state.titleCacheFile(titleId), JSON.stringify(names));
    } catch {
      /* asked again next time */
    }
  }
  return names;
}

// A Japanese title name is kept for a player reading an Asian language and replaced otherwise.
function displayTitle(names, fallback, lang) {
  const name = names.name || fallback;
  if (name && CJK_RE.test(name) && !CJK_LANGS.has(lang) && names.marketName && !CJK_RE.test(names.marketName)) return names.marketName;
  return name;
}

// "Gears of War 2 Hollow" -> the name, then the name less one trailing word at a time.
function titleSearchNames(folder) {
  const words = prettyFolderName(folder).split(/\s+/).filter(Boolean);
  const names = [];
  for (let n = words.length; n >= 2; n -= 1) names.push(words.slice(0, n).join(' '));
  return names;
}

// The cached answer for a JSON list of `count` achievements: a title id, null, or undefined when not asked yet.
function readIdentity(key, count) {
  const cached = readJsonOrNull(state.identityCacheFile(key));
  if (cached && cached.count === count && (cached.titleId || Date.now() - cached.checkedAt < IDENTIFY_TTL_MS)) return cached.titleId || null;
  return undefined;
}

// The first of `items` whose list carries every wanted id and gamerscore, and whether a list failed to load.
async function matchingTitle(items, wanted, tried, fetchImpl) {
  let failed = false;
  for (const title of items) {
    const titleId = String((title && title.title_id) || '').toUpperCase();
    if (!state.TITLE_ID_RE.test(titleId) || tried.has(titleId) || tried.size >= IDENTIFY_MAX_CANDIDATES) continue;
    tried.add(titleId);
    let list;
    try {
      list = await fetchJson(`${DBOX_API}/achievements/v1/${titleId}`, fetchImpl);
    } catch (err) {
      failed = failed || !isNotFound(err);
      continue;
    }
    const matched = (Array.isArray(list) ? list : []).filter((a) => a && wanted.get(a.achievement_id) === Number(a.gamerscore)).length;
    if (matched === wanted.size) return { titleId, failed };
  }
  return { titleId: null, failed };
}

// { found, reachedSite, failed } for the candidates dbox.tools lists under each search name.
async function searchTitle(names, wanted, fetchImpl) {
  const tried = new Set();
  const result = { found: null, reachedSite: false, failed: false };
  for (const name of names) {
    if (result.found || tried.size >= IDENTIFY_MAX_CANDIDATES) break;
    let titles;
    try {
      titles = await fetchJson(`${DBOX_API}/title_ids/?name=${encodeURIComponent(name)}&system=XBOX360&limit=10`, fetchImpl);
      result.reachedSite = true;
    } catch {
      break; // offline: try again on a later scan
    }
    const match = await matchingTitle((titles && titles.items) || [], wanted, tried, fetchImpl);
    result.found = match.titleId;
    result.failed = result.failed || match.failed;
  }
  return result;
}

/*
  The JSON shape names no title id, but it does list every achievement's id and gamerscore. A title on
  dbox.tools whose list carries every one of those pairs is that game (Gears of War 2 Hollow's 50 match
  4D53082D exactly; its nearest neighbour matches 48). Anything short of all of them is refused: a
  wrong title would put another game's texts and pictures on this one. The answer, found or not, is
  cached, so this costs a few requests once per game rather than per scan.
*/
async function identifyJsonTitle(info, entries, fetchImpl) {
  if (entries.length < IDENTIFY_MIN_ACHIEVEMENTS) return null;
  const key = state.slug(info.folder);
  const known = readIdentity(key, entries.length);
  if (known !== undefined) return known;
  const wanted = new Map(entries.map((entry) => [entry.id, entry.gamerscore]));
  const { found, reachedSite, failed } = await searchTitle(titleSearchNames(info.folder), wanted, fetchImpl);
  // Offline, or a candidate whose list did not load: "not found" would be kept for a week.
  if (!reachedSite || (failed && !found)) return null;
  try {
    writeAtomic(state.identityCacheFile(key), JSON.stringify({ titleId: found, count: entries.length, checkedAt: Date.now() }));
  } catch {
    /* asked again next scan */
  }
  if (found) debug.log(`[x360recomp] '${info.folder}' identified as ${found} from its ${entries.length} achievements`);
  return found;
}

// The identified title's texts in the player's language over the JSON list's own.
function withDboxTexts(list, schema, lang) {
  const byId = new Map(listFromDbox(schema, lang).map((entry) => [entry.name, entry]));
  for (const entry of list) {
    const known = byId.get(entry.name);
    if (!known) continue;
    entry.displayName = known.displayName || entry.displayName;
    entry.description = known.description || entry.description;
    entry.hidden = known.hidden;
    entry.rarityName = known.rarityName;
    entry.rarityDescription = known.rarityDescription;
  }
}

// The JSON shape: its own list is the authority (the game can only unlock those), enriched with the
// identified title's texts in the player's language, pictures, art and rarity when there is one.
async function jsonGameData(info, lang, fetchImpl) {
  const entries = formats.parseJson(formats.readSmallFile(info.file));
  const list = entries.map((entry) => ({
    name: String(entry.id),
    displayName: entry.name || String(entry.id),
    description: entry.description,
    hidden: 0,
    gamerscore: entry.gamerscore,
    icon: '',
    icongray: '',
  }));
  const titleId = await identifyJsonTitle(info, entries, fetchImpl);
  if (!titleId) {
    return { name: prettyFolderName(info.folder), appid: appidOf(info), system: 'xbox', img: {}, achievement: { total: list.length, list }, descBackfilledAt: Date.now() };
  }
  let schema = null;
  try {
    schema = await loadSchema(titleId, fetchImpl);
  } catch {
    /* identified earlier, offline now: the game's own texts stand */
  }
  if (schema) {
    withDboxTexts(list, schema, lang);
    const dboxIds = schema.achievements.map((a) => a && a.achievement_id).filter(Number.isInteger);
    // Pictures follow the id only on titles whose whole list runs 1..N, as for the other shapes.
    if (dboxIds.every((id) => id >= 1 && id <= dboxIds.length)) await withIcons(titleId, list, fetchImpl, { trusted: true });
  }
  const data = await finish(info, titleId, (schema && schema.name) || prettyFolderName(info.folder), [], list, fetchImpl, schema ? Number(schema.fetchedAt) || 0 : Date.now());
  // Named after the folder: "Gears of War 2 Hollow" is not the retail game, and says so.
  data.name = prettyFolderName(info.folder);
  data.rarityTitles = [...new Set([...(schema && schema.name ? [schema.name] : []), data.name])];
  return data;
}

async function getGameData(data, lang = 'english', { fetchImpl = nodeFetch, spaWaitMs = SPA_WAIT_MS } = {}) {
  const info = data && typeof data === 'object' ? data : {};
  if (info.format === 'json' && info.knownTitleId && !fs.existsSync(info.file)) {
    // A known port before its list exists: the title's own list, under the id the list will keep.
    const known = await titleGameData({ ...info, titleId: info.knownTitleId }, lang, fetchImpl, spaWaitMs);
    return { ...known, appid: appidOf(info) };
  }
  if (info.format === 'json') return jsonGameData(info, lang, fetchImpl);
  return titleGameData(info, lang, fetchImpl, spaWaitMs);
}

const STILL_READING = Symbol('still reading');

// The SPA if it is read within `ms`, STILL_READING otherwise; the read itself goes on either way.
function spaWithin(reading, ms) {
  let timer;
  const waited = new Promise((resolve) => {
    timer = setTimeout(resolve, ms, STILL_READING);
  });
  return Promise.race([reading, waited]).finally(() => clearTimeout(timer));
}

/*
  The executable only knows the base game: DLC achievements (12 of Dante's Inferno's 54) come from
  dbox.tools when it answers, without pictures, since their image ids are unknown. A disc ships the
  languages of its region; dbox.tools gathers every region's, so a player whose language this disc
  lacks (Russian on a US copy) still reads it rather than English.
*/
async function addDboxToSpaList(titleId, spa, list, lang, fetchImpl) {
  const known = new Set(list.map((entry) => entry.name));
  const schema = await loadSchema(titleId, fetchImpl);
  if (!spaReader.hasLanguage(spa, lang)) {
    const translated = new Map(listFromDbox(schema, lang, { exact: true }).map((entry) => [entry.name, entry]));
    for (const entry of list) {
      const other = translated.get(entry.name);
      if (!other) continue;
      entry.displayName = other.displayName;
      entry.description = other.description || entry.description;
    }
  }
  const extra = listFromDbox(schema, lang).filter((entry) => !known.has(entry.name));
  list.push(...extra);
  // When every base achievement uses its own id as image id (LEGO Dimensions, Dante's Inferno),
  // the DLC follows the same convention; Midnight Club's shuffled ids prove it is not universal.
  if (extra.length && spa.achievements.every((a) => a.id === a.imageId)) await withIcons(titleId, extra, fetchImpl, { trusted: true });
}

async function titleGameData(info, lang, fetchImpl, spaWaitMs = SPA_WAIT_MS) {
  const titleId = String(info.titleId || '').toUpperCase();
  // Another host than dbox.tools: its pictures need not wait for that site's answers.
  const art = marketplaceArt(titleId, fetchImpl).catch(() => ({}));
  const reading = loadSpa(titleId, info.xex).catch(() => null);
  let spa = await spaWithin(reading, spaWaitMs);
  let schema = null;
  if (spa === STILL_READING) {
    schema = await loadSchema(titleId, fetchImpl).catch(() => null);
    // Offline, the executable is still the only list: wait for it after all.
    spa = schema ? null : await reading;
  }
  if (spa && spa.achievements.length > 0) {
    const list = listFromSpa(titleId, spa, lang);
    try {
      await addDboxToSpaList(titleId, spa, list, lang, fetchImpl);
    } catch {
      /* offline: the base game's list stands on its own */
    }
    const names = await titleNamesFor(titleId, fetchImpl);
    const spaName = spaReader.titleName(spa, lang);
    return finish(info, titleId, displayTitle(names, spaName, lang), [names.name, names.marketName, spaReader.titleName(spa, 'english')], list, fetchImpl, Date.now(), art);
  }

  schema = schema || (await loadSchema(titleId, fetchImpl));
  const list = listFromDbox(schema, lang);
  await withIcons(titleId, list, fetchImpl);
  const names = await titleNamesFor(titleId, fetchImpl);
  return finish(info, titleId, displayTitle(names, schema.name, lang), [names.name, names.marketName], list, fetchImpl, Number(schema.fetchedAt) || 0, art);
}

// `checkedAt` answers Game Health's "when was this list last read": every scan for the executable's
// own list, the download time for a dbox.tools copy.
async function finish(info, titleId, schemaName, extraTitles, list, fetchImpl, checkedAt, art = marketplaceArt(titleId, fetchImpl)) {
  const name = gameName(schemaName, info.folder) || prettyFolderName(info.folder) || titleId;
  const bonus = await reblueBonus.bonusAchievements({ ...info, titleId }, path.join(iconDirFor(titleId), 'reblue'), {
    fetchImpl,
    log: (message) => debug.log(`[x360recomp] ${message}`),
  });
  const known = new Set(list.map((entry) => entry.name));
  const all = [...list, ...bonus.filter((entry) => !known.has(entry.name))];
  return {
    name,
    appid: appidOf(info),
    system: 'xbox',
    // Never an achievement picture as the header: it would stand in for the game's art.
    img: await art,
    // Exophase names some pages after the dashboard's short title ("midnight-club-la").
    rarityTitles: [...new Set([name, ...extraTitles].filter((title) => title && !CJK_RE.test(title)))],
    achievement: { total: all.length, list: all },
    descBackfilledAt: checkedAt,
  };
}

module.exports = { getGameData, gameName };
