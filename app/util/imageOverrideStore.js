'use strict';

/*
  Per-appid image overrides: a JSON map { "<appid>": "<file:// or http(s) url>" } under cfg/, taking
  precedence over the artwork a game normally resolves to. Downloaded picks are stored as their
  remote URL (not copied), so steam_cache stays disposable; a local file the user picked is copied
  into a durable folder because nothing could ever fetch it again.

  One factory, two instances: coverStore.js (library tiles, per orientation) and gameIconStore.js
  (the square game logo, one value per game). Pure fs/JSON, no Electron, so both work from the
  renderer and are unit-testable headless.
*/

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { fileURLToPath, pathToFileURL } = require('url');
const { userDataDir } = require('./userDataPath.js');
const { imageSize } = require('./imageSize.js');

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.gif']);

function stamp(stat) {
  return stat ? `${stat.mtimeNs || BigInt(Math.round(stat.mtimeMs * 1000000))}:${stat.size}` : null;
}

function localPathFromUrl(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  if (/^file:/i.test(text)) {
    try {
      return fileURLToPath(text);
    } catch {
      return null;
    }
  }
  return path.isAbsolute(text) ? text : null;
}

function isOrientation(value) {
  return value === 'portrait' || value === 'landscape';
}

// A stored entry is either a legacy plain URL (applies to every orientation, pre-dating this
// distinction) or an { portrait, landscape } object. Resolve to the string a caller can use.
function valueForOrientation(entry, orientation) {
  if (entry == null) return null;
  if (typeof entry === 'string') return entry;
  if (!isOrientation(orientation)) return entry.landscape || entry.portrait || null;
  return entry[orientation] || null;
}

/*
  Which tile shape an image was made for, from its own pixel ratio: a header is about 2:1, a
  portrait grid 2:3. Anything close to square (a fan cover, an icon) is left unclassified on
  purpose - forcing it into one shape would silently drop it from the other.
*/
function orientationOfImage(file) {
  const size = file ? imageSize(file) : null;
  if (!size) return null;
  const ratio = size.width / size.height;
  if (ratio <= 0.9) return 'portrait';
  if (ratio >= 1.1) return 'landscape';
  return null;
}

function pathIsWithin(candidate, parent) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function idFor(appid) {
  return String(appid || '').replace(/[^\w.-]/g, '_');
}

/*
  `fileName`  the cfg/<fileName> JSON map holding the selections.
  `folder`    the durable <userData>/<folder> directory local picks are copied into.
  `recoverPrefix`
              the CDN base a legacy cache path can be rebuilt into when its basename carries the
              provider's content hash, or null for a store whose provider has no such convention.
*/
function createImageOverrideStore({ fileName, folder, recoverPrefix = null } = {}) {
  if (!fileName || !folder) throw new Error('createImageOverrideStore needs a fileName and a folder');

  let storeFile = null;
  let cachePath = null;
  let cacheStamp = null;
  let cacheMap = null;

  function defaultFile() {
    return path.join(userDataDir(), 'cfg', fileName);
  }

  function setStoreFile(p) {
    storeFile = p || null;
    cachePath = null;
    cacheStamp = null;
    cacheMap = null;
  }

  function file() {
    return storeFile || defaultFile();
  }

  /*
    The stored filename includes a digest of the image bytes. A fixed `<appid>.<ext>` name meant a
    second pick overwrote the first at the same URL, and Chromium's decoded-image cache kept
    painting the old picture for that URL - so picking new art looked like nothing happened.
    Identical bytes still reuse the same file, so re-picking the same image isn't a second copy.
  */
  function safeName(appid, sourcePath, digest) {
    const id = idFor(appid);
    if (!id) return null;
    const sourceExtension = path.extname(String(sourcePath || '')).toLowerCase();
    const extension = IMAGE_EXTENSIONS.has(sourceExtension) ? sourceExtension : '.png';
    return digest ? `${id}-${digest}${extension}` : `${id}${extension}`;
  }

  // Every file this game has ever had in the durable folder, including the pre-digest spelling.
  function filesFor(root, appid) {
    const id = idFor(appid);
    if (!id) return [];
    const dir = path.join(root, folder);
    const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`^${escaped}(?:-[a-f0-9]+)?\\.[a-z0-9]+$`, 'i');
    try {
      return fs
        .readdirSync(dir)
        .filter((name) => pattern.test(name))
        .map((name) => path.join(dir, name));
    } catch {
      return [];
    }
  }

  // Drops copies this game no longer points at. Called only after the new selection is recorded,
  // so an interrupted run leaves a stale file rather than an entry pointing at nothing. Must keep
  // every current orientation's path, or pruning after writing one deletes the other's pick.
  function pruneOld(root, appid, keepPaths) {
    const keep = new Set(keepPaths.map((p) => path.resolve(p).toLowerCase()));
    for (const stale of filesFor(root, appid)) {
      if (keep.has(path.resolve(stale).toLowerCase())) continue;
      try {
        fs.rmSync(stale, { force: true });
      } catch {
        /* a locked leftover is harmless; it is simply no longer referenced */
      }
    }
  }

  // Every local file this game's stored entry (legacy string or per-orientation object) still points
  // at, so a prune after writing one orientation never touches the other's file.
  function keepPathsForEntry(entry) {
    const values = typeof entry === 'string' ? [entry] : entry && typeof entry === 'object' ? [entry.portrait, entry.landscape] : [];
    return values.map(localPathFromUrl).filter(Boolean);
  }

  function writeMapToFile(targetFile, map) {
    fs.mkdirSync(path.dirname(targetFile), { recursive: true });
    fs.writeFileSync(targetFile, JSON.stringify(map, null, 2), 'utf8');
  }

  function readAll() {
    const f = file();
    try {
      const stat = fs.statSync(f, { bigint: true });
      const nextStamp = stamp(stat);
      if (cacheMap && cachePath === f && cacheStamp === nextStamp) return { ...cacheMap };
      const data = JSON.parse(fs.readFileSync(f, 'utf8'));
      cachePath = f;
      cacheStamp = nextStamp;
      cacheMap = data && typeof data === 'object' ? data : {};
      return { ...cacheMap };
    } catch {
      cachePath = f;
      cacheStamp = null;
      cacheMap = {};
      return {};
    }
  }

  function writeAll(map) {
    const f = file();
    const next = map && typeof map === 'object' ? map : {};
    writeMapToFile(f, next);
    cachePath = f;
    try {
      cacheStamp = stamp(fs.statSync(f, { bigint: true }));
    } catch {
      cacheStamp = null;
    }
    cacheMap = { ...next };
  }

  // `orientation` ('portrait' | 'landscape') is optional. Omitted, this is the legacy single-value
  // API: get returns whatever is stored regardless of shape, set/remove act on the whole entry.
  function get(appid, orientation) {
    return valueForOrientation(readAll()[String(appid)] ?? null, orientation);
  }

  function set(appid, url, orientation) {
    if (!appid || !url) return;
    const map = readAll();
    const id = String(appid);
    if (!isOrientation(orientation)) {
      map[id] = String(url);
    } else {
      const existing = map[id];
      const next = existing && typeof existing === 'object' ? { ...existing } : {};
      if (typeof existing === 'string') {
        // A pre-existing legacy pick applied to both orientations; keep it for the one not being
        // changed now instead of dropping it.
        next[orientation === 'portrait' ? 'landscape' : 'portrait'] = existing;
      }
      next[orientation] = String(url);
      map[id] = next;
    }
    writeAll(map);
  }

  function remove(appid, orientation) {
    const map = readAll();
    const id = String(appid);
    if (!Object.prototype.hasOwnProperty.call(map, id)) return;
    const entry = map[id];
    if (!isOrientation(orientation) || typeof entry === 'string') {
      delete map[id];
    } else {
      const next = { ...entry };
      delete next[orientation];
      if (next.portrait || next.landscape) map[id] = next;
      else delete map[id];
    }
    writeAll(map);
  }

  // The provider's grid URLs use the content hash as their filename. Older AW builds kept only the
  // downloaded cache path, but that basename is enough to reconstruct the exact remote selection
  // after the cache was already deleted. Do not guess generic names such as header.jpg: an alternate
  // Steam AppID is no longer present in that old path, so guessing could silently select wrong art.
  function recoverRemote(url) {
    if (!recoverPrefix) return null;
    const local = localPathFromUrl(url);
    if (!local) return null;
    const basename = path.basename(local);
    if (!/^[a-f0-9]{32}\.(?:jpe?g|png|webp)$/i.test(basename)) return null;
    return `${recoverPrefix}${basename}`;
  }

  // A selected image is user state, but downloaded bytes are not. Store remote selections as the
  // source URL so clearing steam_cache removes the image and the next render can fetch it again.
  // Local images selected by the user remain in the durable folder; they are not re-downloadable.
  function persist(appid, url, root = userDataDir(), orientation) {
    if (!appid || !url) return null;
    const value = String(url);
    const source = localPathFromUrl(value);
    let stored = value;
    let destination = null;
    if (source) {
      if (!fs.existsSync(source) || !fs.statSync(source).isFile()) return null;
      const cacheRoot = path.join(root, 'steam_cache');
      const recovered = pathIsWithin(source, cacheRoot) ? recoverRemote(value) : null;
      if (recovered) {
        // Legacy provider cache paths contain the content hash, so old selections can be converted
        // to a source URL instead of being copied into durable storage during the next write.
        stored = recovered;
      } else {
        const bytes = fs.readFileSync(source);
        const digest = crypto.createHash('sha1').update(bytes).digest('hex').slice(0, 12);
        const name = safeName(appid, source, digest);
        if (!name) return null;
        destination = path.join(root, folder, name);
        fs.mkdirSync(path.dirname(destination), { recursive: true });
        if (path.resolve(source).toLowerCase() !== path.resolve(destination).toLowerCase() && !fs.existsSync(destination)) {
          fs.writeFileSync(destination, bytes);
        }
        stored = pathToFileURL(destination).href;
      }
    }
    set(appid, stored, orientation);
    // Record first, then tidy: the entry above is what makes the new file(s) the ones in use. Keep
    // every orientation's current file, not just the one just written. A remote selection therefore
    // also removes a stale durable copy left by an older build.
    pruneOld(root, appid, keepPathsForEntry(readAll()[String(appid)]));
    return stored;
  }

  /*
    Migrates legacy single-URL entries (pre-dating per-orientation storage) to the orientation their
    image actually has, using the file itself as the only record of which shape was picked - e.g. a
    920x430 header no longer gets cropped into a portrait tile. Unmeasurable entries (remote URL,
    deleted file, square image) keep applying to both orientations, as before. Returns changed appids.
  */
  function splitLegacyByShape() {
    const map = readAll();
    const changed = [];
    for (const [appid, entry] of Object.entries(map)) {
      if (typeof entry !== 'string') continue;
      const orientation = orientationOfImage(localPathFromUrl(entry));
      if (!orientation) continue;
      map[appid] = { [orientation]: entry };
      changed.push(appid);
    }
    if (changed.length > 0) writeAll(map);
    return changed;
  }

  function isUsable(url) {
    const local = localPathFromUrl(url);
    if (!local) return /^https?:\/\//i.test(String(url || ''));
    try {
      return fs.statSync(local).isFile();
    } catch {
      return false;
    }
  }

  // Upgrade overrides created by older builds before deleting steam_cache. This runs in the main
  // process, so it reads/writes the requested user-data tree directly instead of relying on this
  // module's renderer-side store override/cache.
  function preserveCachedOverrides(root = userDataDir()) {
    const targetFile = path.join(root, 'cfg', fileName);
    let map;
    try {
      map = JSON.parse(fs.readFileSync(targetFile, 'utf8'));
    } catch {
      return [];
    }
    if (!map || typeof map !== 'object' || Array.isArray(map)) return [];

    const cacheRoot = path.join(root, 'steam_cache');
    const preserved = new Set();

    // Convert a cache-backed value to its original source URL when the old filename carries a
    // provider content hash. Generic legacy filenames do not contain enough information to rebuild
    // the link, so retain those bytes as a last-resort compatibility path instead of losing a user's
    // selection during migration.
    const preserveValue = (appid, value) => {
      const source = localPathFromUrl(value);
      if (!source || !pathIsWithin(source, cacheRoot)) return null;
      try {
        if (!fs.statSync(source).isFile()) return null;
        const recovered = recoverRemote(value);
        if (recovered) {
          preserved.add(String(appid));
          return recovered;
        }
        const bytes = fs.readFileSync(source);
        const digest = crypto.createHash('sha1').update(bytes).digest('hex').slice(0, 12);
        const name = safeName(appid, source, digest);
        if (!name) return null;
        const destination = path.join(root, folder, name);
        fs.mkdirSync(path.dirname(destination), { recursive: true });
        if (!fs.existsSync(destination)) fs.writeFileSync(destination, bytes);
        preserved.add(String(appid));
        return pathToFileURL(destination).href;
      } catch (err) {
        throw new Error(`Could not preserve custom image for ${appid}: ${err.message || err}`, { cause: err });
      }
    };

    for (const [appid, entry] of Object.entries(map)) {
      if (typeof entry === 'string') {
        const upgraded = preserveValue(appid, entry);
        if (upgraded) map[appid] = upgraded;
        continue;
      }
      if (entry && typeof entry === 'object') {
        for (const orientation of ['portrait', 'landscape']) {
          const upgraded = preserveValue(appid, entry[orientation]);
          if (upgraded) entry[orientation] = upgraded;
        }
      }
    }
    if (preserved.size) writeMapToFile(targetFile, map);
    return [...preserved];
  }

  return {
    setStoreFile,
    defaultFile,
    readAll,
    writeAll,
    get,
    set,
    remove,
    persist,
    isUsable,
    recoverRemote,
    preserveCachedOverrides,
    valueForOrientation,
    orientationOfImage,
    splitLegacyByShape,
  };
}

module.exports = { createImageOverrideStore, IMAGE_EXTENSIONS };
