'use strict';

/*
  Resolve Steam game artwork for notifications: prefer the resolved URLs the app caches during scans
  (schema, store, SteamDB covers), falling back to the predictable legacy CDN URLs.
*/

const fs = require('fs');
const path = require('path');
const { userDataDir } = require('./userData.js');
const { sharedAppModulePath } = require('./sharedAppModule.js');

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function isImageUrl(value) {
  return typeof value === 'string' && /^https?:\/\//i.test(value) && /\.(?:jpe?g|png|webp)(?:$|[?#])/i.test(value);
}

// The app seeds `store.portrait` with a guessable path that 404s for modern titles; never treat
// that placeholder as a resolved asset.
function isKnownPlaceholder(value) {
  return typeof value === 'string' && /\/portrait\.png(?:$|[?#])/i.test(value);
}

// Predictable `/steam/apps/<id>/…` URLs 404 on newer titles whose real assets live under hashed
// store_item_assets paths. A resolved/custom URL (anything else) is always preferred as-is.
function isPredictableLegacySteamUrl(value) {
  return (
    typeof value === 'string' &&
    /\/steam\/apps\/\d+\/(?:header|library_600x900|library_capsule)\.(?:jpe?g|png)/i.test(value)
  );
}

// A real, non-placeholder image URL - worth using, but may still be a legacy-shaped guess.
function isUsableArt(value) {
  return isImageUrl(value) && !isKnownPlaceholder(value);
}

// Usable *and* not a legacy-shaped guess likely to 404 on modern titles - the best tier.
function isResolvedArt(value) {
  return isUsableArt(value) && !isPredictableLegacySteamUrl(value);
}

// Keyed by resolved file path so tests using temp roots never see stale cached art, and so a game
// re-scanned mid-session (new schema/store/cover json written) picks up the change on its next read.
const jsonFileCache = new Map();

function readJsonCached(filePath) {
  let stat;
  try {
    stat = fs.statSync(filePath);
  } catch {
    return null;
  }
  const key = path.resolve(filePath);
  const cached = jsonFileCache.get(key);
  if (cached && cached.mtimeMs === stat.mtimeMs) return cached.data;
  const data = readJson(filePath);
  jsonFileCache.set(key, { mtimeMs: stat.mtimeMs, data });
  return data;
}

// The app normally caches the english schema, but a fresh install may only have the user's
// language. Search any language directory so the resolved header/portrait is still found.
function findSchemaArtFile(root, appid) {
  const schemaRoot = path.join(root, 'steam_cache', 'schema');
  const english = path.join(schemaRoot, 'english', `${appid}.db`);
  if (fs.existsSync(english)) return english;
  try {
    const dirs = fs.readdirSync(schemaRoot, { withFileTypes: true });
    for (const dir of dirs) {
      if (!dir.isDirectory()) continue;
      const candidate = path.join(schemaRoot, dir.name, `${appid}.db`);
      if (fs.existsSync(candidate)) return candidate;
    }
  } catch {
    /* schema dir is optional */
  }
  return null;
}

function cachedSchemaArt(appid, root) {
  const file = findSchemaArtFile(root, appid);
  if (!file) return null;
  const data = readJsonCached(file);
  return data && typeof data.img === 'object' && data.img ? data.img : null;
}

function cachedStoreArt(appid, root) {
  return readJsonCached(path.join(root, 'steam_cache', 'store', `${appid}.json`));
}

function cachedSteamDbPortrait(appid, root) {
  const single = readJsonCached(path.join(root, 'steam_cache', 'steamdb_cover', `${appid}.json`));
  if (single && isImageUrl(single.url)) return single.url;

  const list = readJsonCached(path.join(root, 'steam_cache', 'steamdb_covers', `${appid}.json`));
  if (list && Array.isArray(list.urls)) {
    const urls = list.urls.filter(isImageUrl);
    return (
      urls.find((url) => /library_600x900/i.test(url)) ||
      urls.find((url) => /library_capsule/i.test(url)) ||
      urls[0] ||
      null
    );
  }
  return null;
}

// The square game logo the app resolved from SteamGridDB's icon set, if it has one for this game.
// Notification thumbnails need a square slot that neither Steam artwork nor the 32x32 clienticon
// fits. The app writes the answer (misses included) under steam_cache; this only reads it, so an
// unlooked-up game falls through to the artwork chain below. The cache key must match init.js's exactly.
function cachedSquareLogo(appid, gameName, root) {
  const id = normalizedAppid(appid);
  const name = String(gameName == null ? '' : gameName).trim();
  if (!id && !name) return null;
  const key = require('crypto').createHash('sha1').update(`${id}\0${name.toLowerCase()}`).digest('hex');
  const cached = readJsonCached(path.join(root, 'steam_cache', 'steamgriddb_icons', `${key}.json`));
  return cached && isImageUrl(cached.url) ? cached.url : null;
}

function steamSquareLogo(appid, gameName, options = {}) {
  return cachedSquareLogo(appid, gameName, options.userDataRoot || userDataDir());
}

/*
  The icon the game's own executable carries, extracted by the app into the shared icon cache.

  The Watchdog has no PE reader and paints Windows toasts without going through the app's resolver,
  so it reads the file the app wrote rather than growing a second copy of that logic. The app
  extracts it when the game starts (see prefetchSquareGameLogo), which is well before the first card
  is due; a game that has never been seen running simply has no file here and falls through.
*/
function executableIcon(appid, options = {}) {
  const id = String(appid == null ? '' : appid).trim();
  if (!id) return null;
  const root = options.userDataRoot || userDataDir();
  const file = path.join(root, 'steam_cache', 'icon', id, 'executable-icon.png');
  try {
    return fs.statSync(file).isFile() ? file : null;
  } catch {
    return null;
  }
}

/*
  The same file, but only when it is the game's real, modern icon rather than a legacy stamp.

  At this size it is the picture Windows itself paints for the game, and it beats anything that had
  to be guessed at or cut out of a poster - so the card takes it before the community icon set, the
  same order the app's own resolver uses. Below it the icon keeps its later place in the chain.
*/
const PREFERRED_EXECUTABLE_ICON_SIDE = 256;

function highResExecutableIcon(appid, options = {}) {
  const file = executableIcon(appid, options);
  if (!file) return null;
  try {
    const { imageSize } = require(sharedAppModulePath('util/imageSize.js'));
    const size = imageSize(file);
    if (!size) return null;
    return Math.min(size.width, size.height) >= PREFERRED_EXECUTABLE_ICON_SIDE ? file : null;
  } catch {
    return null;
  }
}

/*
  The icon the user picked for this game on its achievement page (cfg/gameIcons.db, written by
  app/util/gameIconStore.js). It outranks every lookup here for the same reason it does in the app:
  it is the only source that is a decision rather than a guess.

  Read straight from the file - the Watchdog has no Electron and no renderer state - and only a
  value that still resolves is returned, so a deleted picture falls through to the artwork chain
  instead of turning the card's thumbnail into an empty box.
*/
function customGameIcon(appid, options = {}) {
  const id = String(appid == null ? '' : appid).trim();
  if (!id) return null;
  const root = options.userDataRoot || userDataDir();
  const map = readJsonCached(path.join(root, 'cfg', 'gameIcons.db'));
  const value = map && typeof map === 'object' ? map[id] : null;
  if (!value || typeof value !== 'string') return null;
  if (isImageUrl(value)) return value;
  if (!/^file:/i.test(value)) return null;
  try {
    const file = require('url').fileURLToPath(value);
    return fs.existsSync(file) ? file : null;
  } catch {
    return null;
  }
}

function normalizedAppid(appid) {
  const id = String(appid == null ? '' : appid).trim();
  return /^\d+$/.test(id) ? id : '';
}

function steamHeaderImage(appid, options = {}) {
  const id = normalizedAppid(appid);
  if (!id) return undefined;
  const root = options.userDataRoot || userDataDir();

  const schemaImg = cachedSchemaArt(id, root);
  const schemaHeader = schemaImg && isUsableArt(schemaImg.header) ? schemaImg.header : null;
  if (schemaHeader && isResolvedArt(schemaHeader)) return schemaHeader;

  const store = cachedStoreArt(id, root);
  if (store && isResolvedArt(store.header)) return store.header;
  if (schemaHeader) return schemaHeader;
  if (store && isUsableArt(store.header)) return store.header;

  return `https://cdn.cloudflare.steamstatic.com/steam/apps/${id}/header.jpg`;
}

function steamLibraryImage(appid, options = {}) {
  const id = normalizedAppid(appid);
  if (!id) return undefined;
  const root = options.userDataRoot || userDataDir();

  const schemaImg = cachedSchemaArt(id, root);
  const schemaPortrait = schemaImg && isUsableArt(schemaImg.portrait) ? schemaImg.portrait : null;
  if (schemaPortrait && isResolvedArt(schemaPortrait)) return schemaPortrait;

  const steamdb = cachedSteamDbPortrait(id, root);
  if (steamdb) return steamdb;
  if (schemaPortrait) return schemaPortrait;

  const store = cachedStoreArt(id, root);
  if (store && isResolvedArt(store.portrait)) return store.portrait;

  // Modern titles put their real (hashed) store assets under store_item_assets. When no portrait
  // has been resolved yet, the landscape header is still far sharper than Steam's 32×32 clienticon.
  if (store && isResolvedArt(store.header)) return store.header;

  return `https://cdn.cloudflare.steamstatic.com/steam/apps/${id}/library_600x900.jpg`;
}

module.exports = { steamHeaderImage, steamLibraryImage, steamSquareLogo, customGameIcon, executableIcon, highResExecutableIcon };
