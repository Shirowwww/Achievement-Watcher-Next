'use strict';

/*
  What a game page shows about a game, read from the stores' public answers: Steam appdetails (see
  resolveSteamStoreDetails in steamMetadata.js), GamesDB (gamesdb.gog.com, which covers GOG, Epic,
  Ubisoft, EA, Xbox and PSN) and Epic's product page. Presentation only: nothing here ever becomes a
  game's id, source or achievement data. Every field is optional, text is plain and links are https.
  `releaseDate` is an ISO day when the source gives one, else Steam's own text in the page language.
*/

const { decodeXmlEntities } = require('./xmlText.js');
const sourceIdentity = require('./sourceIdentity.js');
const { rawAppId } = require('./platformId.js');

const MAX_VIDEOS = 12;
const MAX_SCREENSHOTS = 30;
const MAX_LIST = 12;
const LIST_FIELDS = ['genres', 'developers', 'publishers', 'videos', 'screenshots'];
const TEXT_FIELDS = ['title', 'description', 'releaseDate', 'website', 'background'];
// GamesDB images are url templates; this formatter is its 639px-wide card, close to Steam's 600px.
const GOG_THUMB_FORMATTER = '_product_card_v2_mobile_slider_639';

// Store text is HTML: beyond the XML five it uses the named accents (&eacute;) and a few signs.
const ACCENTS = { acute: '́', grave: '̀', circ: '̂', uml: '̈', tilde: '̃', ring: '̊', cedil: '̧' };
const NAMED = { nbsp: ' ', laquo: '«', raquo: '»', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', hellip: '…', mdash: '-', ndash: '-', copy: '©', reg: '®', trade: '™', szlig: 'ß', aelig: 'æ', AElig: 'Æ', oelig: 'œ', OElig: 'Œ', bull: '•' };
function decodeHtmlNames(text) {
  return text
    .replace(/&([a-zA-Z])(acute|grave|circ|uml|tilde|ring|cedil);/g, (match, letter, accent) => `${letter}${ACCENTS[accent]}`.normalize('NFC'))
    .replace(/&([a-zA-Z]+);/g, (match, name) => (Object.prototype.hasOwnProperty.call(NAMED, name) ? NAMED[name] : match));
}

function cleanText(value, max = 240) {
  if (typeof value !== 'string') return '';
  const text = decodeXmlEntities(decodeHtmlNames(value.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, '')))
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

function httpsUrl(value) {
  if (typeof value !== 'string' || value.length > 2048) return '';
  try {
    const url = new URL(value.startsWith('//') ? `https:${value}` : value);
    return url.protocol === 'https:' ? url.href : '';
  } catch {
    return '';
  }
}

function textList(values) {
  const list = (Array.isArray(values) ? values : [values]).map((value) => cleanText(value, 120)).filter(Boolean);
  return [...new Set(list)].slice(0, MAX_LIST);
}

// GamesDB localises its strings as { '*': ..., 'en-US': ... }.
function localized(value) {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return '';
  return [value['en-US'], value['*'], value.en].find((text) => typeof text === 'string') || '';
}

function isoDate(value) {
  const match = /^(\d{4}-\d{2}-\d{2})(?:T|\s|$)/.exec(typeof value === 'string' ? value : '');
  return match ? match[1] : '';
}

function gogImage(image, formatter = '') {
  const template = image && typeof image.url_format === 'string' ? image.url_format : '';
  return template ? httpsUrl(template.replace('{formatter}', formatter).replace('{ext}', 'jpg')) : '';
}

function youtubeVideo(video) {
  const id = String(video?.video_id || '');
  if (video?.provider !== 'youtube' || !/^[\w-]{6,20}$/.test(id)) return null;
  return { name: cleanText(video.name), thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`, youtube: id };
}

// A release (platforms/<p>/external_releases/<id>) carries the game under `game`; a game record
// (games/<id>) is the game itself.
function fromGamesDb(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const game = payload.game && typeof payload.game === 'object' ? payload.game : payload;
  const rating = Number(game.aggregated_rating);
  const names = (list) => (Array.isArray(list) ? list : []).map((entry) => localized(entry?.name));
  return {
    title: cleanText(localized(payload.title) || localized(game.title)),
    description: cleanText(localized(payload.summary) || localized(game.summary), 4000),
    genres: textList(names(game.genres)),
    developers: textList(names(game.developers)),
    publishers: textList(names(game.publishers)),
    releaseDate: isoDate(game.first_release_date || payload.first_release_date),
    ratings: Number.isFinite(rating) && rating > 0 ? [{ source: 'gamesdb', score: Math.round(rating), url: '' }] : [],
    videos: (Array.isArray(game.videos) ? game.videos : []).map(youtubeVideo).filter(Boolean).slice(0, MAX_VIDEOS),
    screenshots: (Array.isArray(game.screenshots) ? game.screenshots : [])
      .map((image) => ({ thumb: gogImage(image, GOG_THUMB_FORMATTER), full: gogImage(image) }))
      .filter((shot) => shot.full)
      .slice(0, MAX_SCREENSHOTS),
    background: gogImage(game.background || game.horizontal_artwork),
  };
}

// Epic lists a trailer's streams as a JSON string of recipes per locale; only direct outputs help.
function epicVideo(item) {
  let recipes;
  try {
    recipes = JSON.parse(item?.video?.recipes || 'null');
  } catch {
    return null;
  }
  const entries = recipes && typeof recipes === 'object' ? recipes['en-US'] || Object.values(recipes)[0] : null;
  const outputs = (Array.isArray(entries) ? entries : []).flatMap((recipe) => (Array.isArray(recipe?.outputs) ? recipe.outputs : []));
  const output = (pattern) => httpsUrl(outputs.find((entry) => pattern.test(String(entry?.contentType || '')))?.url);
  const video = { name: '', thumbnail: output(/^image\//), dash: output(/dash\+xml/i), hls: output(/mpegurl/i) };
  return video.dash || video.hls ? video : null;
}

function fromEpicProduct(product) {
  if (!product || typeof product !== 'object') return null;
  const pages = (Array.isArray(product.pages) ? product.pages : []).map((page) => page?.data || {});
  const home = pages[0] || {};
  const about = home.about || {};
  const images = (Array.isArray(home.gallery?.galleryImages) ? home.gallery.galleryImages : []).map((image) => httpsUrl(image?.src)).filter(Boolean);
  const carousel = Array.isArray(home.carousel?.items) ? home.carousel.items : [];
  return {
    title: cleanText(typeof product.productName === 'string' ? product.productName : about.title),
    description: cleanText(about.shortDescription, 4000),
    genres: [],
    developers: textList(about.developerAttribution),
    publishers: textList(about.publisherAttribution),
    releaseDate: isoDate(home.meta?.releaseDate),
    ratings: [],
    videos: carousel.map(epicVideo).filter(Boolean).slice(0, MAX_VIDEOS),
    screenshots: images.slice(0, MAX_SCREENSHOTS).map((url) => ({ thumb: url, full: url })),
    background: httpsUrl(home.hero?.backgroundImageUrl),
  };
}

const hasValue = (value) => (Array.isArray(value) ? value.length > 0 : Boolean(value));

// The first source to know a field gives it; ratings add up, one per rating source.
function mergeDetails(parts) {
  const known = (Array.isArray(parts) ? parts : []).filter((part) => part && part.value);
  if (known.length === 0) return null;
  const merged = { sources: [], ratings: [] };
  for (const field of [...TEXT_FIELDS, ...LIST_FIELDS]) {
    const giver = known.find((part) => hasValue(part.value[field]));
    merged[field] = giver ? giver.value[field] : LIST_FIELDS.includes(field) ? [] : '';
  }
  for (const part of known) {
    merged.sources.push(part.source);
    for (const rating of Array.isArray(part.value.ratings) ? part.value.ratings : []) {
      const at = merged.ratings.findIndex((seen) => seen.source === rating.source);
      if (at < 0) merged.ratings.push(rating);
      // Steam carries the Metacritic score alone; Metacritic itself adds how many reviewed.
      else if (!(merged.ratings[at].count > 0) && rating.count > 0) merged.ratings[at] = rating;
    }
  }
  return merged;
}

function isComplete(game) {
  return Boolean(game && game.description && game.releaseDate && ['genres', 'developers', 'publishers'].every((field) => hasValue(game[field])));
}

// The GamesDB release named by the game's own store id. Only ids that cannot be confused cross over.
function gamesDbIdentity(game, steamAppid) {
  if (/^\d+$/.test(String(steamAppid || ''))) return { platform: 'steam', id: String(steamAppid) };
  const family = sourceIdentity.libraryBadgeOf(game?.source);
  const raw = rawAppId(game?.appid);
  if (family === 'gog' && /^\d+$/.test(raw)) return { platform: 'gog', id: raw };
  if (family === 'ubisoft' && /^\d+$/.test(raw)) return { platform: 'uplay', id: raw };
  const serial = /^((?:CUSA|PPSA)\d{5})(?:_\d{2})?$/i.exec(raw);
  if (family === 'playstation' && serial) return { platform: 'psn', id: `${serial[1].toUpperCase()}_00` };
  if (family === 'xbox') return xboxIdentity(game?.source, raw);
  return null;
}

// GamesDB files Xbox 360 games under xboxone too, by the title id in decimal; the 360 sources give it in hex.
const XBOX_360_SOURCES = /xenia|360 recomp|xlivelessness/i;
const isXbox360Source = (source) => XBOX_360_SOURCES.test(String(source || ''));
function xboxIdentity(source, raw) {
  const hex = /^(?:0x)?([0-9a-f]{8})$/i.exec(raw);
  if (isXbox360Source(source)) return hex ? { platform: 'xboxone', id: String(parseInt(hex[1], 16)) } : null;
  return /^\d{1,10}$/.test(raw) ? { platform: 'xboxone', id: raw } : null;
}

// The GamesDB platforms a game's own store goes by, so a title match prefers its own release.
const PLATFORMS_BY_FAMILY = { '': ['steam'], epic: ['epic'], gog: ['gog'], ubisoft: ['uplay'], ea: ['origin'], playstation: ['psn'], xbox: ['xboxone', 'xbox'] };

// RetroAchievements names the console; GamesDB has a platform for the ones it tracks.
const PLATFORMS_BY_CONSOLE = {
  playstation: ['psx'],
  'playstation 2': ['ps2'],
  'playstation portable': ['psp'],
  'nintendo 64': ['n64'],
  'nes/famicom': ['nes'],
  'snes/super famicom': ['snes'],
  'genesis/mega drive': ['segag'],
  dreamcast: ['dc'],
  saturn: ['saturn'],
};

// RetroAchievements titles end with their console, "Spyro the Dragon (PlayStation)": not part of the name.
// The console comes with the game when the caller sends it, else from that ending.
function consoleOf(game) {
  const given = String(game?.console || '').trim();
  if (given || sourceIdentity.libraryBadgeOf(game?.source) !== 'retroachievements') return given;
  return ((/ \(([^()]{2,60})\)$/.exec(String(game?.name || '')) || [])[1] || '').trim();
}

function preferredPlatforms(game) {
  const family = sourceIdentity.libraryBadgeOf(game?.source);
  if (family === 'retroachievements') return PLATFORMS_BY_CONSOLE[consoleOf(game).toLowerCase()] || [];
  return PLATFORMS_BY_FAMILY[family] || [];
}

function ownTitle(game) {
  const name = String(game?.name || '');
  const consoleName = consoleOf(game);
  const suffix = ` (${consoleName})`;
  return consoleName && name.endsWith(suffix) ? name.slice(0, -suffix.length).trim() : name;
}

const titleKey = (value) =>
  localized(value)
    .replace(/[™®©]/g, '')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '');

function searchTitle(name) {
  const title = String(name || '')
    .replace(/[™®©]/g, '')
    .trim();
  if (title.length > 200 || !titleKey(title) || /^\d+$/.test(title)) return '';
  if (/^(?:NPWR\d{5}_\d{2}|(?:CUSA|PPSA)\d{5}(?:_\d{2})?|[A-F\d]{8,32})$/i.test(title)) return '';
  return title;
}

const releasePlatforms = (item) =>
  (Array.isArray(item?.releases) ? item.releases : []).map((release) => String(release?.platform_id || '')).filter((platform) => platform && platform !== 'generic' && platform !== 'test');

/*
  A name is not an id, so the search is careful: only one game with exactly that title, on the game's
  own store when several stores carry it. Two candidates left is no answer, never a guess.
*/
function chooseTitleMatch(items, title, preferred = []) {
  const key = titleKey(title);
  if (!key) return null;
  const exact = new Map();
  for (const item of Array.isArray(items) ? items : []) {
    if (/^\d{1,24}$/.test(String(item?.id)) && titleKey(item.title) === key && releasePlatforms(item).length) exact.set(String(item.id), item);
  }
  const candidates = [...exact.values()];
  const nativeCount = (item) => releasePlatforms(item).filter((platform) => preferred.includes(platform)).length;
  const native = candidates.filter((item) => nativeCount(item) > 0);
  const pool = native.length ? native : candidates;
  if (pool.length === 1) return pool[0];
  // GamesDB keeps some retro games twice (a re-release record beside the full one): the full one
  // has far more releases on the console. Close counts are two games, never a guess.
  const ranked = native.length ? [...native].sort((a, b) => nativeCount(b) - nativeCount(a)) : [];
  return ranked.length > 1 && nativeCount(ranked[0]) > 2 * nativeCount(ranked[1]) ? ranked[0] : null;
}

module.exports = {
  MAX_VIDEOS,
  MAX_SCREENSHOTS,
  cleanText,
  httpsUrl,
  textList,
  fromGamesDb,
  fromEpicProduct,
  mergeDetails,
  isComplete,
  gamesDbIdentity,
  isXbox360Source,
  preferredPlatforms,
  ownTitle,
  searchTitle,
  titleKey,
  chooseTitleMatch,
};
