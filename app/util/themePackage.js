'use strict';

// Portable application themes: read and write the `.awtheme` package (manifest.json, the
// per-layer theme.json model, an optional assets/ folder). It can carry colors, gradients, fits
// and pictures, but no HTML, CSS, script or URL, so a `user:` CSS theme cannot be exported.

const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const semver = require('semver');
const { sanitizePresetName } = require('./customPreset.js');
const { isInside, safePackagePath } = require('./presetPackage.js');
const { imageInfo } = require('./imageSize.js');
const { LAYER_IDS, IMAGE_LAYER_IDS, BUILTIN_COLORS, sanitizeCustomTheme, defaultCustomTheme } = require('./themeLayers.js');

const THEME_PACKAGE_EXTENSION = '.awtheme';
const THEME_PACKAGE_FORMAT = 'aw-theme';

// Bumped only when a package written today would be misread by this code. A reader refuses a
// higher number outright rather than guessing at a layout it does not know.
const THEME_PACKAGE_FORMAT_VERSION = 1;

const MANIFEST_NAME = 'manifest.json';
const THEME_NAME = 'theme.json';
const ASSETS_DIR = 'assets';

// The marker that makes an installed theme one the app may manage - and delete - and what a
// re-export reads its metadata back from. Mirrors aw-package.json for presets.
const THEME_INSTALLED_FILE = 'aw-theme.json';

// Blur and veil copies the app generates for an installed theme. Never packaged: they are derived
// from the source image and the effect settings, and both of those travel.
const THEME_DERIVED_DIR = 'derived';

// What a theme asset is allowed to be. Deliberately narrower than the image picker: no SVG,
// because an SVG is a document with its own script and external-reference surface, and a theme
// layer only ever needs a picture.
const ASSET_EXT_RE = /\.(?:png|jpe?g|webp|gif|bmp)$/i;

const EXT_FOR_TYPE = { png: '.png', jpeg: '.jpg', webp: '.webp', gif: '.gif', bmp: '.bmp' };

const LIMITS = {
  packageBytes: 64 * 1024 * 1024,
  fileBytes: 24 * 1024 * 1024,
  totalBytes: 48 * 1024 * 1024,
  entries: 32,
  assets: 10,
  // A zip that unpacks to hundreds of times what it weighs is not a theme somebody made.
  expansion: 200,
  nameLength: 48,
  textLength: 400,
  tags: 12,
  // Well past a 4K wallpaper, and far below what would cost real memory to decode.
  imageDimension: 12000,
  imagePixels: 40 * 1000 * 1000,
};

function fail(error, extra = {}) {
  return { ok: false, error, ...extra };
}

function cleanText(value, max = LIMITS.textLength) {
  if (typeof value !== 'string') return '';
  return value.replace(/[\x00-\x1f\x7f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function cleanTags(value) {
  if (!Array.isArray(value)) return [];
  const out = [];
  for (const tag of value) {
    const clean = cleanText(tag, 24).toLowerCase();
    if (clean && !out.includes(clean)) out.push(clean);
    if (out.length >= LIMITS.tags) break;
  }
  return out;
}

function sanitizeThemeName(raw) {
  return sanitizePresetName(raw).slice(0, LIMITS.nameLength).trim();
}

// An asset name as it may appear in `theme.json` and under `assets/`: one flat segment, since a
// theme image has no folder structure and allowing one would only enable a path escape.
function safeAssetName(raw) {
  const value = String(raw == null ? '' : raw);
  if (!value || value.length > 120) return '';
  if (value !== safePackagePath(value)) return '';
  if (value.includes('/')) return '';
  // Every asset this format writes is named after its layer, so a leading dot is never one we produced.
  if (value.startsWith('.')) return '';
  if (!ASSET_EXT_RE.test(value)) return '';
  return value;
}

// Which built-in palette a theme started from. Descriptive only, nothing reads it to decide behaviour.
function cleanBase(value) {
  const name = cleanText(value, 32).toLowerCase();
  return Object.prototype.hasOwnProperty.call(BUILTIN_COLORS, name) ? name : '';
}

// The theme as it travels: images reduced to the bare asset name, generated blur copies dropped.
// Returns null when `assetFor` could not take an image, rather than installing with a blank layer.
function packagedTheme(raw, assetFor) {
  const clean = sanitizeCustomTheme(raw);
  const out = {};
  for (const id of LAYER_IDS) {
    const layer = clean[id];
    const entry = { color: layer.color, gradient: { ...layer.gradient } };
    if (IMAGE_LAYER_IDS.includes(id)) {
      const asset = layer.image ? assetFor(layer.image, id) : '';
      if (layer.image && !asset) return null;
      entry.image = asset;
      entry.fit = layer.fit;
      // blurImage is regenerated on the machine that installs this, from the image and these
      // settings; a path off somebody else's disk is exactly what must not travel.
      entry.effect = { ...layer.effect, blurImage: '' };
    }
    out[id] = entry;
  }
  return out;
}

// Validate the manifest before a single byte is written. An omitted or unparsable `appVersion`
// skips only the compatibility floor, never the structural checks.
function validateManifest(raw, { appVersion = '' } = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return fail('invalid-manifest');
  if (raw.format !== THEME_PACKAGE_FORMAT) return fail('not-a-theme-package');

  const formatVersion = Number(raw.formatVersion);
  if (!Number.isInteger(formatVersion) || formatVersion < 1) return fail('invalid-manifest');
  if (formatVersion > THEME_PACKAGE_FORMAT_VERSION) {
    return fail('format-too-new', { formatVersion, supported: THEME_PACKAGE_FORMAT_VERSION });
  }

  const name = sanitizeThemeName(raw.name);
  if (!name) return fail('invalid-name');

  const minVersion = cleanText(raw.app && raw.app.minVersion, 32);
  if (minVersion) {
    if (!semver.valid(minVersion)) return fail('invalid-manifest');
    const current = semver.valid(semver.coerce(appVersion));
    if (current && semver.lt(current, minVersion)) return fail('app-too-old', { requires: minVersion });
  }

  // Declared so a reader knows the weight before unpacking; the assets folder is still the
  // authority, and the two are compared when the package is read.
  const declared = [];
  if (raw.assets != null) {
    if (!Array.isArray(raw.assets) || raw.assets.length > LIMITS.assets) return fail('invalid-manifest');
    for (const entry of raw.assets) {
      const asset = safeAssetName(entry);
      if (!asset || declared.includes(asset)) return fail('invalid-manifest');
      declared.push(asset);
    }
  }

  return {
    ok: true,
    manifest: {
      format: THEME_PACKAGE_FORMAT,
      formatVersion,
      name,
      description: cleanText(raw.description),
      author: cleanText(raw.author, 80),
      version: cleanText(raw.version, 32) || '1.0.0',
      tags: cleanTags(raw.tags),
      createdAt: cleanText(raw.createdAt, 40),
      app: {
        createdWith: cleanText(raw.app && raw.app.createdWith, 32),
        // Only stated when a package actually needs a newer app; an absent floor means "any build
        // that understands this format version".
        minVersion,
      },
      base: cleanBase(raw.base),
      assets: declared,
    },
  };
}

// Writing

// Write `theme` out as a package. Every image is copied in under a name derived from its layer,
// so the package never carries a path from this machine.
function exportTheme({ theme, name, destination, meta = {}, appVersion = '', base = '' }) {
  const themeName = sanitizeThemeName(name);
  if (!themeName) return fail('invalid-name');

  const assets = new Map(); // absolute source path -> { name inside the package, data }
  const used = new Set();
  let total = 0;

  // Takes one layer image and returns the name it travels under, or throws the reason it cannot.
  const assetFor = (file, layerId) => {
    const known = assets.get(file);
    if (known) return known.name;

    let data;
    try {
      const stat = fs.statSync(file);
      if (!stat.isFile()) throw new Error('missing-asset');
      if (stat.size > LIMITS.fileBytes) throw new Error('asset-too-large');
      data = fs.readFileSync(file);
    } catch (err) {
      throw new Error(err.message === 'asset-too-large' ? 'asset-too-large' : 'missing-asset', { cause: err });
    }

    const info = imageInfo(data);
    if (!info) throw new Error('not-an-image');
    if (info.width > LIMITS.imageDimension || info.height > LIMITS.imageDimension || info.width * info.height > LIMITS.imagePixels) {
      throw new Error('image-too-large');
    }
    if (assets.size >= LIMITS.assets) throw new Error('too-many-files');
    total += data.length;
    if (total > LIMITS.totalBytes) throw new Error('package-too-large');

    // Named after the layer and the real format, never after the file on this disk: a wallpaper
    // path can carry an account name, a game name or a folder somebody would rather not share.
    const extension = EXT_FOR_TYPE[info.type] || '.png';
    let asset = `${layerId}${extension}`;
    for (let i = 2; used.has(asset); i += 1) asset = `${layerId}-${i}${extension}`;
    used.add(asset);
    assets.set(file, { name: asset, data });
    return asset;
  };

  let packaged;
  try {
    packaged = packagedTheme(theme, assetFor);
  } catch (err) {
    return fail(String(err.message || err));
  }
  if (!packaged) return fail('missing-asset');

  const manifest = {
    format: THEME_PACKAGE_FORMAT,
    formatVersion: THEME_PACKAGE_FORMAT_VERSION,
    name: themeName,
    description: cleanText(meta.description),
    author: cleanText(meta.author, 80),
    version: cleanText(meta.version, 32) || '1.0.0',
    tags: cleanTags(meta.tags),
    createdAt: new Date().toISOString(),
    app: {
      createdWith: cleanText(appVersion, 32),
      minVersion: cleanText(meta.minAppVersion, 32),
    },
    base: cleanBase(base),
    assets: [...assets.values()].map((asset) => asset.name).sort((a, b) => a.localeCompare(b)),
  };

  const check = validateManifest(manifest, { appVersion });
  if (!check.ok) return check;

  try {
    const zip = new AdmZip();
    zip.addFile(MANIFEST_NAME, Buffer.from(JSON.stringify(manifest, null, 2), 'utf8'));
    zip.addFile(THEME_NAME, Buffer.from(JSON.stringify(packaged, null, 2), 'utf8'));
    // The bytes already read and checked, not a second read: a file that changed underneath us
    // between the check and the write would otherwise go in unvalidated.
    for (const asset of assets.values()) zip.addFile(`${ASSETS_DIR}/${asset.name}`, asset.data);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    zip.writeZip(destination);
  } catch (err) {
    return fail(String(err.message || err));
  }

  return { ok: true, name: themeName, file: destination, assets: assets.size, bytes: fs.statSync(destination).size };
}

// A theme built from one of the built-in palettes, so a built-in can be exported and passed on
// like any other. Colors only: no built-in carries an image.
function themeFromBuiltin(name) {
  const colors = BUILTIN_COLORS[name] || BUILTIN_COLORS.default;
  const theme = defaultCustomTheme();
  for (const id of LAYER_IDS) {
    if (!colors[id]) continue;
    theme[id].color = colors[id];
    theme[id].gradient = { enabled: false, from: colors[id], to: colors[id], angle: 180 };
  }
  return sanitizeCustomTheme(theme);
}

// Reading

// Parse and fully validate a package without touching theme storage, so a caller can show the
// user what an import would do before anything is installed.
function readThemePackage(file, { appVersion = '' } = {}) {
  let stat;
  try {
    stat = fs.statSync(file);
  } catch {
    return fail('unreadable-package');
  }
  if (!stat.isFile() || !stat.size) return fail('unreadable-package');
  if (stat.size > LIMITS.packageBytes) return fail('package-too-large');

  let entries;
  try {
    entries = new AdmZip(file).getEntries();
  } catch {
    return fail('unreadable-package');
  }
  if (entries.length > LIMITS.entries) return fail('too-many-files');

  const seen = new Set();
  const assetEntries = new Map();
  let manifestEntry = null;
  let themeEntry = null;
  let total = 0;

  for (const entry of entries) {
    if (entry.isDirectory) continue;
    const raw = String(entry.entryName || '').replace(/\\/g, '/');
    if (seen.has(raw)) return fail('duplicate-entry');
    seen.add(raw);

    if (entry.header.size > LIMITS.fileBytes) return fail('asset-too-large');
    total += entry.header.size;
    if (total > LIMITS.totalBytes) return fail('package-too-large');

    if (raw === MANIFEST_NAME) {
      manifestEntry = entry;
      continue;
    }
    if (raw === THEME_NAME) {
      themeEntry = entry;
      continue;
    }

    const slash = raw.indexOf('/');
    if (slash === -1) return fail('unexpected-file', { path: raw });
    const root = raw.slice(0, slash);
    const rest = raw.slice(slash + 1);
    if (root !== ASSETS_DIR) return fail('unexpected-file', { path: raw });
    // A path that does not clean up to exactly what the package claimed is a traversal attempt.
    const asset = safeAssetName(rest);
    if (!asset || asset !== rest) return fail('unsafe-path', { path: raw });
    if (assetEntries.size >= LIMITS.assets) return fail('too-many-files');
    assetEntries.set(asset, entry);
  }

  // What the archive says it unpacks to, against what it weighs. A theme is pictures, which barely
  // compress; a ratio like this is a zip built to be expanded, not a theme somebody made.
  if (total > stat.size * LIMITS.expansion) return fail('package-too-large');

  if (!manifestEntry) return fail('missing-manifest');
  if (!themeEntry) return fail('missing-theme');

  let parsed;
  try {
    parsed = JSON.parse(manifestEntry.getData().toString('utf8'));
  } catch {
    return fail('invalid-manifest');
  }
  const check = validateManifest(parsed, { appVersion });
  if (!check.ok) return check;

  let rawTheme;
  try {
    rawTheme = JSON.parse(themeEntry.getData().toString('utf8'));
  } catch {
    return fail('invalid-theme');
  }
  if (!rawTheme || typeof rawTheme !== 'object' || Array.isArray(rawTheme)) return fail('invalid-theme');

  // Every asset really is an image, of a size worth decoding, read from its own bytes rather than
  // from its name - and the size its header declared really is the size that came out.
  const assets = [];
  for (const [name, entry] of assetEntries) {
    let data;
    try {
      data = entry.getData();
    } catch {
      return fail('unreadable-package');
    }
    // The header can lie about the size; the data itself cannot.
    if (data.length > LIMITS.fileBytes) return fail('asset-too-large');
    const info = imageInfo(data);
    if (!info) return fail('not-an-image', { path: `${ASSETS_DIR}/${name}` });
    if (info.width > LIMITS.imageDimension || info.height > LIMITS.imageDimension || info.width * info.height > LIMITS.imagePixels) {
      return fail('image-too-large', { path: `${ASSETS_DIR}/${name}` });
    }
    assets.push({ name, data, info });
  }

  const present = new Set(assets.map((asset) => asset.name));
  for (const name of check.manifest.assets) {
    if (!present.has(name)) return fail('missing-asset', { path: `${ASSETS_DIR}/${name}` });
  }

  // The model, re-clamped through the editor's own ranges so a hand-edited theme.json cannot widen
  // them, with each image field checked against what the package actually carries.
  const clean = sanitizeCustomTheme(rawTheme);
  const theme = {};
  const usedAssets = new Set();
  for (const id of LAYER_IDS) {
    const layer = clean[id];
    const entry = { color: layer.color, gradient: { ...layer.gradient } };
    if (IMAGE_LAYER_IDS.includes(id)) {
      const wanted = String((rawTheme[id] && rawTheme[id].image) || '');
      const asset = wanted ? safeAssetName(wanted) : '';
      if (wanted && (!asset || !present.has(asset))) return fail('missing-asset', { path: wanted.slice(0, 80) });
      if (asset) usedAssets.add(asset);
      entry.image = asset;
      entry.fit = layer.fit;
      entry.effect = { ...layer.effect, blurImage: '' };
    }
    theme[id] = entry;
  }

  return {
    ok: true,
    manifest: { ...check.manifest, assets: [...usedAssets].sort((a, b) => a.localeCompare(b)) },
    theme,
    // Only what a layer actually points at is kept: an asset nothing references is dead weight
    // somebody attached, and there is no reason to put it on the importer's disk.
    assets: assets.filter((asset) => usedAssets.has(asset.name)),
    bytes: stat.size,
  };
}

// Installed themes

function themePackDir(userDataPath) {
  return path.join(String(userDataPath || ''), 'theme-packs');
}

// The theme as the app uses it: asset names resolved to absolute paths inside this install.
function resolveInstalled(theme, dir) {
  const out = {};
  for (const id of LAYER_IDS) {
    const layer = (theme && theme[id]) || {};
    out[id] = { ...layer };
    if (IMAGE_LAYER_IDS.includes(id)) {
      const asset = layer.image ? safeAssetName(layer.image) : '';
      out[id].image = asset ? path.join(dir, ASSETS_DIR, asset) : '';
      const effect = layer.effect || {};
      const derived = effect.blurImage ? safeAssetName(effect.blurImage) : '';
      out[id].effect = { ...effect, blurImage: derived ? path.join(dir, THEME_DERIVED_DIR, derived) : '' };
    }
  }
  return sanitizeCustomTheme(out);
}

// The reverse: absolute paths back to the bare names stored on disk, so an install describes
// itself the same way whatever folder it happens to sit in.
function relativizeInstalled(theme, dir) {
  const assetsDir = path.join(dir, ASSETS_DIR);
  const derivedDir = path.join(dir, THEME_DERIVED_DIR);
  const out = {};
  for (const id of LAYER_IDS) {
    const layer = (theme && theme[id]) || {};
    out[id] = { color: layer.color, gradient: { ...layer.gradient } };
    if (IMAGE_LAYER_IDS.includes(id)) {
      const image = layer.image && isInside(assetsDir, layer.image) ? path.basename(layer.image) : '';
      const effect = layer.effect || {};
      const blur = effect.blurImage && isInside(derivedDir, effect.blurImage) ? path.basename(effect.blurImage) : '';
      out[id].image = safeAssetName(image);
      out[id].fit = layer.fit;
      out[id].effect = { ...effect, blurImage: safeAssetName(blur) };
    }
  }
  return out;
}

function readInstalledTheme(userDataPath, name) {
  const safe = sanitizeThemeName(name);
  if (!safe) return null;
  const root = themePackDir(userDataPath);
  const dir = path.join(root, safe);
  if (!isInside(root, dir)) return null;

  let stored;
  try {
    stored = JSON.parse(fs.readFileSync(path.join(dir, THEME_NAME), 'utf8'));
  } catch {
    return null;
  }
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return null;

  let manifest = {};
  try {
    manifest = JSON.parse(fs.readFileSync(path.join(dir, THEME_INSTALLED_FILE), 'utf8')) || {};
  } catch {
    manifest = {};
  }
  return { name: safe, dir, manifest, stored, theme: resolveInstalled(stored, dir) };
}

// Every installed theme, by name. A folder without a readable theme.json is simply not one.
function listInstalledThemes(userDataPath) {
  let entries = [];
  try {
    entries = fs.readdirSync(themePackDir(userDataPath), { withFileTypes: true });
  } catch {
    return [];
  }
  const out = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    const installed = readInstalledTheme(userDataPath, entry.name);
    if (!installed) continue;
    out.push({
      name: installed.name,
      dir: installed.dir,
      author: cleanText(installed.manifest.author, 80),
      description: cleanText(installed.manifest.description),
      version: cleanText(installed.manifest.version, 32),
      tags: cleanTags(installed.manifest.tags),
      base: cleanBase(installed.manifest.base),
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

// Persist the model of an installed theme, keeping the stored form free of absolute paths.
function saveInstalledTheme(userDataPath, name, theme) {
  const safe = sanitizeThemeName(name);
  if (!safe) return null;
  const root = themePackDir(userDataPath);
  const dir = path.join(root, safe);
  if (!isInside(root, dir) || !fs.existsSync(dir)) return null;
  const stored = relativizeInstalled(theme, dir);
  fs.writeFileSync(path.join(dir, THEME_NAME), JSON.stringify(stored, null, 2), 'utf8');
  return resolveInstalled(stored, dir);
}

function deleteInstalledTheme(userDataPath, name) {
  const safe = sanitizeThemeName(name);
  if (!safe) return fail('invalid-name');
  const root = themePackDir(userDataPath);
  const dir = path.join(root, safe);
  if (!isInside(root, dir)) return fail('outside-theme-storage');
  if (!fs.existsSync(dir)) return fail('not-installed');
  try {
    // Windows refuses to remove a folder while a file in it is still held open, which a picture
    // can be for a moment after the window stops drawing it. Retrying turns that into a wait.
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
  } catch (err) {
    return fail(String(err.message || err));
  }
  return { ok: true, name: safe };
}

// "Name", then "Name (2)", "Name (3)"... - the same shape the preset and sound importers use.
function nextFreeName(root, name, taken) {
  for (let i = 2; i < 100; i += 1) {
    const candidate = sanitizeThemeName(`${name} (${i})`);
    if (candidate && !taken.has(candidate.toLowerCase()) && !fs.existsSync(path.join(root, candidate))) return candidate;
  }
  return '';
}

// Install a package into the user's theme storage. `duplicate` decides what an existing theme of
// the same name means: 'fail', 'rename' or 'replace'. `takenNames` covers names living outside
// this folder (built-ins, user CSS themes). Built in a staging folder and moved in one rename.
function installThemePackage({ file, userDataPath, appVersion = '', duplicate = 'fail', reservedNames = [], takenNames = [] }) {
  const read = readThemePackage(file, { appVersion });
  if (!read.ok) return read;

  const { manifest, theme, assets } = read;
  if (reservedNames.map((n) => String(n).toLowerCase()).includes(manifest.name.toLowerCase())) {
    return fail('reserved-name', { name: manifest.name });
  }

  const root = themePackDir(userDataPath);
  fs.mkdirSync(root, { recursive: true });

  const taken = new Set(takenNames.map((n) => String(n).toLowerCase()));
  let name = manifest.name;
  const installedHere = fs.existsSync(path.join(root, name));
  const existed = installedHere || taken.has(name.toLowerCase());
  if (existed) {
    if (duplicate === 'fail') return fail('duplicate', { name, bundled: !installedHere });
    if (duplicate === 'rename') {
      name = nextFreeName(root, manifest.name, taken);
      if (!name) return fail('duplicate', { name: manifest.name });
    } else if (duplicate !== 'replace') {
      return fail('invalid-duplicate-policy');
    }
  }

  const destination = path.join(root, name);
  if (!isInside(root, destination)) return fail('outside-theme-storage');

  const staging = fs.mkdtempSync(path.join(root, '.awtheme-'));
  const staged = path.join(staging, 'theme');
  const backup = `${destination}.awtheme-old`;
  let backedUp = false;

  try {
    fs.mkdirSync(path.join(staged, ASSETS_DIR), { recursive: true });
    for (const asset of assets) {
      const target = path.join(staged, ASSETS_DIR, asset.name);
      if (!isInside(staged, target)) throw new Error('unsafe-path');
      fs.writeFileSync(target, asset.data);
    }
    fs.writeFileSync(path.join(staged, THEME_NAME), JSON.stringify(theme, null, 2), 'utf8');
    fs.writeFileSync(path.join(staged, THEME_INSTALLED_FILE), JSON.stringify({ ...manifest, name }, null, 2), 'utf8');

    if (fs.existsSync(destination)) {
      fs.renameSync(destination, backup);
      backedUp = true;
    }
    try {
      fs.renameSync(staged, destination);
    } catch (err) {
      if (backedUp) {
        fs.renameSync(backup, destination);
        backedUp = false;
      }
      throw err;
    }
    if (backedUp) {
      fs.rmSync(backup, { recursive: true, force: true });
      backedUp = false;
    }

    return {
      ok: true,
      name,
      replaced: existed && duplicate === 'replace',
      manifest: { ...manifest, name },
      assets: assets.length,
      theme: resolveInstalled(theme, destination),
    };
  } catch (err) {
    if (backedUp) {
      try {
        fs.rmSync(destination, { recursive: true, force: true });
        fs.renameSync(backup, destination);
      } catch {}
    }
    return fail(String(err.message || err));
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
}

// What the Save button in the theme editor writes, into the same storage an imported `.awtheme`
// installs into. Layer pictures (in the shared `theme-images` folder while editing) are copied in
// under a per-layer name, as an export does, instead of left pointing back at that shared folder.
function saveThemeAs({ userDataPath, name, theme, meta = {}, appVersion = '', base = '', overwrite = false, reservedNames = [] }) {
  const themeName = sanitizeThemeName(name);
  if (!themeName) return fail('invalid-name');
  if (reservedNames.map((n) => String(n).toLowerCase()).includes(themeName.toLowerCase())) {
    return fail('reserved-name', { name: themeName });
  }

  const root = themePackDir(userDataPath);
  const destination = path.join(root, themeName);
  if (!isInside(root, destination)) return fail('outside-theme-storage');

  const existed = fs.existsSync(destination);
  if (existed && !overwrite) return fail('duplicate', { name: themeName });

  // The bytes of every layer image, keyed by the name they will travel under. Same reader the
  // export path uses, so a picture this refuses is a picture an export would have refused too.
  const assets = new Map();
  const used = new Set();
  let total = 0;
  const assetFor = (file, layerId) => {
    const known = assets.get(file);
    if (known) return known.name;

    let data;
    try {
      const stat = fs.statSync(file);
      if (!stat.isFile()) throw new Error('missing-asset');
      if (stat.size > LIMITS.fileBytes) throw new Error('asset-too-large');
      data = fs.readFileSync(file);
    } catch (err) {
      throw new Error(err.message === 'asset-too-large' ? 'asset-too-large' : 'missing-asset', { cause: err });
    }

    const info = imageInfo(data);
    if (!info) throw new Error('not-an-image');
    if (info.width > LIMITS.imageDimension || info.height > LIMITS.imageDimension || info.width * info.height > LIMITS.imagePixels) {
      throw new Error('image-too-large');
    }
    if (assets.size >= LIMITS.assets) throw new Error('too-many-files');
    total += data.length;
    if (total > LIMITS.totalBytes) throw new Error('package-too-large');

    const extension = EXT_FOR_TYPE[info.type] || '.png';
    let asset = `${layerId}${extension}`;
    for (let i = 2; used.has(asset); i += 1) asset = `${layerId}-${i}${extension}`;
    used.add(asset);
    assets.set(file, { name: asset, data });
    return asset;
  };

  let packaged;
  try {
    packaged = packagedTheme(theme, assetFor);
  } catch (err) {
    return fail(String(err.message || err));
  }
  if (!packaged) return fail('missing-asset');

  const manifest = {
    format: THEME_PACKAGE_FORMAT,
    formatVersion: THEME_PACKAGE_FORMAT_VERSION,
    name: themeName,
    description: cleanText(meta.description),
    author: cleanText(meta.author, 80),
    version: cleanText(meta.version, 32) || '1.0.0',
    tags: cleanTags(meta.tags),
    createdAt: new Date().toISOString(),
    app: { createdWith: cleanText(appVersion, 32), minVersion: cleanText(meta.minAppVersion, 32) },
    base: cleanBase(base),
    assets: [...assets.values()].map((asset) => asset.name).sort((a, b) => a.localeCompare(b)),
  };

  const check = validateManifest(manifest, { appVersion });
  if (!check.ok) return check;

  // Built somewhere else and moved in one rename, like an install: a failure anywhere leaves the
  // theme that was already there exactly as it was.
  fs.mkdirSync(root, { recursive: true });
  const staging = fs.mkdtempSync(path.join(root, '.awtheme-'));
  const staged = path.join(staging, 'theme');
  const backup = `${destination}.awtheme-old`;
  let backedUp = false;

  try {
    fs.mkdirSync(path.join(staged, ASSETS_DIR), { recursive: true });
    for (const asset of assets.values()) {
      const target = path.join(staged, ASSETS_DIR, asset.name);
      if (!isInside(staged, target)) throw new Error('unsafe-path');
      fs.writeFileSync(target, asset.data);
    }
    fs.writeFileSync(path.join(staged, THEME_NAME), JSON.stringify(packaged, null, 2), 'utf8');
    fs.writeFileSync(path.join(staged, THEME_INSTALLED_FILE), JSON.stringify(manifest, null, 2), 'utf8');

    if (existed) {
      fs.renameSync(destination, backup);
      backedUp = true;
    }
    try {
      fs.renameSync(staged, destination);
    } catch (err) {
      if (backedUp) {
        fs.renameSync(backup, destination);
        backedUp = false;
      }
      throw err;
    }
    if (backedUp) {
      fs.rmSync(backup, { recursive: true, force: true });
      backedUp = false;
    }

    return { ok: true, name: themeName, replaced: existed, assets: assets.size, theme: resolveInstalled(packaged, destination) };
  } catch (err) {
    if (backedUp) {
      try {
        fs.rmSync(destination, { recursive: true, force: true });
        fs.renameSync(backup, destination);
      } catch {}
    }
    return fail(String(err.message || err));
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
}

module.exports = {
  THEME_PACKAGE_EXTENSION,
  THEME_PACKAGE_FORMAT,
  THEME_PACKAGE_FORMAT_VERSION,
  THEME_INSTALLED_FILE,
  THEME_DERIVED_DIR,
  ASSETS_DIR,
  LIMITS,
  saveThemeAs,
  sanitizeThemeName,
  safeAssetName,
  validateManifest,
  exportTheme,
  themeFromBuiltin,
  readThemePackage,
  installThemePackage,
  themePackDir,
  listInstalledThemes,
  readInstalledTheme,
  saveInstalledTheme,
  deleteInstalledTheme,
  resolveInstalled,
  relativizeInstalled,
};
