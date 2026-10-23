'use strict';

/*
  Turns a .san theme, or SAN's own settings (config.json), into AW Next presets that draw as SAN does.
  A .san is untrusted: nothing in it runs, its paths are looked up only inside the package, and only
  pictures, fonts and sounds are ever written. A preset is staged, then moved in one rename.
*/

const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const sanTheme = require('./sanTheme.js');
const sanEngine = require('./sanEngine/index.js');
const engine = require('./sanEngine/engine.js');
const { sanitizePresetName, PRESET_PACKAGE_FILE } = require('./customPreset.js');
const { fontKind } = require('./presetSchema.js');
const { renameRetry } = require('./replaceFile.js');
const { safePackagePath, isInside, installSideFile, PRESET_PACKAGE_FORMAT, PRESET_PACKAGE_FORMAT_VERSION } = require('./presetPackage.js');

const SAN_MANIFEST = 'usertheme.json';
const SAN_CONFIG = 'config.json';
const SAN_ASSETS_DIR = 'assets';
const PRESET_ASSETS_DIR = 'assets';

const SAN_ORIGIN_APP = 'Steam Achievement Notifier';
const SAN_ORIGIN_FORMAT = 'san-usertheme';

// SAN's own settings folder, named after its major.minor version ("... (V1.9)").
const SAN_DATA_DIR_RE = /^Steam Achievement Notifier \(V(\d+(?:\.\d+)*)\)$/;

/*
  Deliberately tighter than the .awpreset limits: a theme is a handful of small images, a font and
  a few sounds, so anything approaching these numbers is not a theme.
*/
const SAN_LIMITS = {
  packageBytes: 96 * 1024 * 1024,
  fileBytes: 16 * 1024 * 1024,
  totalBytes: 64 * 1024 * 1024,
  entries: 400,
  manifestBytes: 4 * 1024 * 1024,
  configBytes: 16 * 1024 * 1024,
  sounds: 24,
  savedThemes: 64,
};

// SAN's cut-offs for semi-rare and rare, and when it prints the unlock rate, when a theme says nothing.
const SAN_DEFAULT_SETTINGS = { rarity: 10, semirarity: 25, showpercent: 'rareonly', notify1line: false };

// The notification type a theme was exported from, when SAN stamped it into the folder name.
const SAN_TYPE_SUFFIX = /_(main|semi|rare|plat)$/;

function fail(error, extra = {}) {
  return { ok: false, error, ...extra };
}

function text(value) {
  return typeof value === 'string' ? value : value == null ? '' : String(value);
}

// ---- reading a .san -------------------------------------------------------------------------------

function parseUserTheme(raw) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return fail('invalid-theme');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return fail('invalid-theme');
  if (!parsed.customisation || typeof parsed.customisation !== 'object' || Array.isArray(parsed.customisation)) return fail('invalid-theme');
  return { ok: true, theme: parsed };
}

// What may be taken out of a package at all: a picture, a font or a sound.
function isCarriedFile(name) {
  return sanTheme.assetAccepts('image', name) || sanTheme.assetAccepts('font', name) || sanTheme.assetAccepts('sound', name);
}

/*
  A theme as its manifest plus a lookup of the files it brought. `files` is keyed by lower-case
  basename (SAN flattens assets to basenames); `folders` lists the sounds of a sound folder by the
  folder's lower-case name.
*/
function readSanTheme(file) {
  let stat;
  try {
    stat = fs.statSync(file);
  } catch {
    return fail('unreadable-theme');
  }
  if (!stat.isFile()) return fail('unreadable-theme');
  if (stat.size > SAN_LIMITS.packageBytes) return fail('theme-too-large');
  return path.basename(file).toLowerCase() === SAN_MANIFEST ? readThemeFolder(file) : readThemeZip(file);
}

function readThemeZip(file) {
  let entries;
  try {
    entries = new AdmZip(file).getEntries();
  } catch (err) {
    if (/duplicate entry/i.test(err.message || '')) return fail('duplicate-entry');
    return fail('unreadable-theme');
  }
  if (entries.length > SAN_LIMITS.entries) return fail('too-many-files');

  const seen = new Set();
  const files = new Map();
  const folders = new Map();
  const rejected = [];
  let manifestEntry = null;
  let total = 0;

  for (const entry of entries) {
    if (entry.isDirectory) continue;
    const raw = String(entry.entryName || '').replace(/\\/g, '/');
    if (seen.has(raw)) return fail('duplicate-entry');
    seen.add(raw);
    if (entry.header.size > SAN_LIMITS.fileBytes) return fail('asset-too-large');
    total += entry.header.size;
    if (total > SAN_LIMITS.totalBytes) return fail('theme-too-large');

    if (raw === SAN_MANIFEST) {
      if (entry.header.size > SAN_LIMITS.manifestBytes) return fail('invalid-theme');
      manifestEntry = entry;
      continue;
    }
    const clean = safePackagePath(raw);
    if (!clean || clean !== raw) return fail('unsafe-path', { path: raw });
    const parts = clean.split('/');
    const name = parts[parts.length - 1];
    if (parts[0] !== SAN_ASSETS_DIR || parts.length > 3 || !isCarriedFile(name)) {
      rejected.push({ name: raw, code: 'asset-rejected' });
      continue;
    }
    const record = { name, size: entry.header.size, read: () => entry.getData() };
    if (parts.length === 3) {
      // assets/<sound folder>/<file>: what SAN exports for "play a random sound from a folder".
      const folder = parts[1].toLowerCase();
      if (!folders.has(folder)) folders.set(folder, []);
      folders.get(folder).push(record);
      continue;
    }
    if (!files.has(name.toLowerCase())) files.set(name.toLowerCase(), record);
  }

  if (!manifestEntry) return fail('missing-theme-manifest');
  const parsed = parseUserTheme(manifestEntry.getData().toString('utf8'));
  if (!parsed.ok) return parsed;
  return { ok: true, theme: parsed.theme, files, folders, rejected, source: 'package' };
}

// The usertheme.json inside a theme SAN already unpacked: read strictly below the folder picked.
function readThemeFolder(manifestFile) {
  let parsed;
  try {
    if (fs.statSync(manifestFile).size > SAN_LIMITS.manifestBytes) return fail('invalid-theme');
    parsed = parseUserTheme(fs.readFileSync(manifestFile, 'utf8'));
  } catch {
    return fail('unreadable-theme');
  }
  if (!parsed.ok) return parsed;

  const root = path.dirname(path.resolve(manifestFile));
  const files = new Map();
  const folders = new Map();
  const rejected = [];
  let total = 0;
  let count = 0;

  const record = (full, name) => {
    let size = 0;
    try {
      size = fs.statSync(full).size;
    } catch {
      return null;
    }
    if (size > SAN_LIMITS.fileBytes) {
      rejected.push({ name, code: 'asset-rejected' });
      return null;
    }
    total += size;
    if (total > SAN_LIMITS.totalBytes) return null;
    return { name, size, read: () => fs.readFileSync(full) };
  };

  const list = (dir) => {
    try {
      return fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return [];
    }
  };
  for (const entry of list(path.join(root, SAN_ASSETS_DIR))) {
    const full = path.join(root, SAN_ASSETS_DIR, entry.name);
    if (!isInside(root, full) || (count += 1) > SAN_LIMITS.entries) continue;
    if (entry.isDirectory()) {
      for (const inner of list(full)) {
        const innerFull = path.join(full, inner.name);
        if (!inner.isFile() || !isInside(root, innerFull) || !sanTheme.assetAccepts('sound', inner.name)) continue;
        const item = record(innerFull, inner.name);
        if (!item) continue;
        if (!folders.has(entry.name.toLowerCase())) folders.set(entry.name.toLowerCase(), []);
        folders.get(entry.name.toLowerCase()).push(item);
      }
      continue;
    }
    if (!entry.isFile()) continue;
    if (!isCarriedFile(entry.name)) {
      rejected.push({ name: entry.name, code: 'asset-rejected' });
      continue;
    }
    const item = record(full, entry.name);
    if (item && !files.has(entry.name.toLowerCase())) files.set(entry.name.toLowerCase(), item);
  }
  return { ok: true, theme: parsed.theme, files, folders, rejected, source: 'folder' };
}

// ---- reading SAN's own settings -----------------------------------------------------------------

/*
  Where SAN keeps its settings on this machine: %LOCALAPPDATA% on Windows, ~/.local/share on Linux,
  in a folder named after its version. The newest version found wins.
*/
function findSanConfig({ platform = process.platform, env = process.env, home = '' } = {}) {
  const roots = platform === 'win32' ? [env.LOCALAPPDATA || env.localappdata] : [path.join(home || env.HOME || '', '.local', 'share')];
  const found = [];
  for (const root of roots.filter(Boolean)) {
    let names = [];
    try {
      names = fs.readdirSync(root);
    } catch {
      continue;
    }
    for (const name of names) {
      const match = SAN_DATA_DIR_RE.exec(name);
      if (!match) continue;
      const file = path.join(root, name, SAN_CONFIG);
      if (fs.existsSync(file)) found.push({ file, version: match[1] });
    }
  }
  const rank = (version) => version.split('.').map((part) => Number(part) || 0);
  found.sort((a, b) => {
    const x = rank(a.version);
    const y = rank(b.version);
    for (let i = 0; i < Math.max(x.length, y.length); i += 1) if ((x[i] || 0) !== (y[i] || 0)) return (y[i] || 0) - (x[i] || 0);
    return 0;
  });
  return found.length ? found[0].file : '';
}

function percentSetting(value, fallback) {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN;
  return Number.isFinite(parsed) ? Math.min(100, Math.max(0, parsed)) : fallback;
}

/*
  The themes SAN's settings hold: the one in use for each of the four types, and every saved theme
  (by type, with its label). Paths stay as SAN wrote them; they are files on this machine.
*/
function readSanConfig(configFile) {
  let raw;
  try {
    if (fs.statSync(configFile).size > SAN_LIMITS.configBytes) return fail('invalid-config');
    raw = JSON.parse(fs.readFileSync(configFile, 'utf8'));
  } catch {
    return fail('unreadable-config');
  }
  const customisation = raw && raw.customisation;
  if (!customisation || typeof customisation !== 'object') return fail('invalid-config');

  const active = {};
  const saved = [];
  for (const type of engine.TYPES) {
    const current = customisation[type];
    if (!current || typeof current !== 'object') continue;
    const { usertheme: themes, ...rest } = current;
    active[type] = rest;
    for (const theme of Array.isArray(themes) ? themes.slice(0, SAN_LIMITS.savedThemes) : []) {
      if (!theme || typeof theme !== 'object' || !theme.customisation || typeof theme.customisation !== 'object') continue;
      saved.push({ type, label: text(theme.label).slice(0, 80), enabled: theme.enabled === true, customisation: theme.customisation });
    }
  }
  if (!Object.keys(active).length) return fail('invalid-config');
  return {
    ok: true,
    active,
    saved,
    settings: {
      rarity: percentSetting(raw.rarity, SAN_DEFAULT_SETTINGS.rarity),
      semirarity: percentSetting(raw.semirarity, SAN_DEFAULT_SETTINGS.semirarity),
      showpercent: ['off', 'rareonly', 'all'].includes(raw.showpercent) ? raw.showpercent : SAN_DEFAULT_SETTINGS.showpercent,
      notify1line: raw.notify1line === true,
    },
    // SAN names its settings folder after its version; the file itself may not say it.
    version: (text(raw.version || '') || (SAN_DATA_DIR_RE.exec(path.basename(path.dirname(configFile))) || [])[1] || '').slice(0, 32),
  };
}

// A file a config names, read from disk if it is one of the three kinds a theme may carry.
function diskRecord(file) {
  if (typeof file !== 'string' || !path.isAbsolute(file)) return null;
  const name = path.basename(file);
  if (!isCarriedFile(name)) return null;
  try {
    const stat = fs.statSync(file);
    if (!stat.isFile() || stat.size > SAN_LIMITS.fileBytes) return null;
    return { name, size: stat.size, read: () => fs.readFileSync(file) };
  } catch {
    return null;
  }
}

/*
  SAN's own pictures (saniconborder*.png and the like) ship with SAN and a .san export leaves them
  out. When SAN is installed here, its resources/img folder fills the gap; the newest install wins.
*/
const SAN_PROGRAM_DIR_RE = /^steamachievementnotifierv(\d+(?:\.\d+)*)$/i;

function findSanImages({ platform = process.platform, env = process.env } = {}) {
  if (platform !== 'win32' || !env.LOCALAPPDATA) return '';
  const programs = path.join(env.LOCALAPPDATA, 'Programs');
  let names;
  try {
    names = fs.readdirSync(programs);
  } catch {
    return '';
  }
  const found = names
    .map((name) => ({ name, match: SAN_PROGRAM_DIR_RE.exec(name) }))
    .filter((entry) => entry.match)
    .map((entry) => ({ dir: path.join(programs, entry.name, 'resources', 'img'), version: entry.match[1].split('.').map(Number) }))
    .filter((entry) => fs.existsSync(entry.dir))
    .sort((a, b) => compareVersions(b.version, a.version));
  return found.length ? found[0].dir : '';
}

function compareVersions(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] || 0) - (b[i] || 0);
    if (diff) return diff;
  }
  return 0;
}

function diskFolder(dir) {
  if (typeof dir !== 'string' || !path.isAbsolute(dir)) return [];
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && sanTheme.assetAccepts('sound', entry.name))
      .slice(0, SAN_LIMITS.sounds)
      .map((entry) => diskRecord(path.join(dir, entry.name)))
      .filter(Boolean);
  } catch {
    return [];
  }
}

// ---- building the preset ------------------------------------------------------------------------

/*
  Collects the files of one preset while its themes are cleaned: each distinct file once, under a
  name unique within the preset. `lookup(value, kind)` finds the record a theme value points at.
*/
function assetCollector(lookup) {
  const byName = new Map();
  const written = [];
  const rejected = [];
  const unique = (name, data) => {
    const ext = path.extname(name);
    const stem = path.basename(name, ext) || 'file';
    for (let i = 1; i < 100; i += 1) {
      const candidate = i === 1 ? name : `${stem} (${i})${ext}`;
      const existing = byName.get(candidate.toLowerCase());
      if (!existing) return candidate;
      if (existing.data.equals(data)) return existing.name;
    }
    return '';
  };
  const resolve = (kind, value) => {
    if (kind === 'sound' || kind === 'sound-folder') return '';
    const record = lookup(value, kind);
    if (!record || !sanTheme.assetAccepts(kind, record.name)) return '';
    const data = record.read();
    if (data.length > SAN_LIMITS.fileBytes) return '';
    // A font that is not one would make the preset's own .awpreset refuse to install later.
    const unsafe = sanTheme.extensionOf(record.name) === '.svg' ? !sanTheme.isSafeSvg(data) : kind === 'font' && !fontKind(data);
    if (unsafe) {
      rejected.push({ name: record.name, code: 'asset-rejected' });
      return '';
    }
    const name = unique(safeFileName(record.name), data);
    if (!name) return '';
    if (!byName.has(name.toLowerCase())) {
      byName.set(name.toLowerCase(), { name, data });
      written.push({ name, data });
    }
    return `${PRESET_ASSETS_DIR}/${name}`;
  };
  return { resolve, written, rejected };
}

// A name that is safe as one path segment on every system, keeping its extension.
function safeFileName(name) {
  const ext = path.extname(name).toLowerCase();
  const stem = path.basename(name, path.extname(name)).replace(/[^\w .()+-]+/g, '_').trim().slice(0, 80) || 'file';
  return `${stem}${ext}`;
}

/*
  The sounds a theme plays, installed into AW Next's sounds folder: one file, or every file of a
  sound folder (SAN picks one at random per notification). Returns what the preset should play.
*/
function installSounds(customisation, { soundsDir, lookupFile, lookupFolder, created, report }) {
  const mode = customisation.soundmode === 'folder' ? 'folder' : 'file';
  const install = (record) => {
    const data = record.read();
    if (data.length > SAN_LIMITS.fileBytes) return '';
    const done = installSideFile(soundsDir, safeFileName(record.name), data);
    if (done.created) created.push(path.join(soundsDir, done.name));
    report.assets.push({ name: done.name, kind: 'sound', code: 'installed' });
    return done.name;
  };
  if (mode === 'file') {
    if (!customisation.soundfile) return { mode, files: [] };
    const record = lookupFile(customisation.soundfile);
    if (!record) {
      report.assets.push({ name: sanTheme.baseName(customisation.soundfile), kind: 'sound', code: 'asset-missing' });
      return { mode, files: [] };
    }
    const name = install(record);
    return { mode, files: name ? [name] : [] };
  }
  const records = lookupFolder(customisation.sounddir).slice(0, SAN_LIMITS.sounds);
  if (!records.length && customisation.sounddir) report.assets.push({ name: sanTheme.baseName(customisation.sounddir), kind: 'sound', code: 'asset-missing' });
  return { mode, files: records.map(install).filter(Boolean) };
}

// The name itself, then "name (2)", "name (3)"... Callers pick the first one that suits them.
function nameCandidates(name) {
  const candidates = [name];
  for (let i = 2; i < 100; i += 1) candidates.push(sanitizePresetName(`${name} (${i})`));
  return candidates;
}

// Only called for a name already taken, so the checks below skip the bare name on their own.
function nextFreeName(presetsDir, name, taken) {
  const free = nameCandidates(name).find((candidate) => candidate && !taken.has(candidate.toLowerCase()) && !fs.existsSync(path.join(presetsDir, candidate)));
  return free || '';
}

function madeFromSanTheme(dir, label) {
  if (!sanEngine.isSanPreset(dir)) return false;
  try {
    const origin = JSON.parse(fs.readFileSync(path.join(dir, PRESET_PACKAGE_FILE), 'utf8')).origin || {};
    return origin.app === SAN_ORIGIN_APP && origin.name === label;
  } catch {
    return false;
  }
}

/*
  Where an 'auto' import goes: over the preset an earlier import made from the same SAN theme, so a
  second run refreshes rather than piles up copies, else the first free name. Anything else, the
  user's own presets included, is never replaced.
*/
function autoTarget(presetsDir, name, taken, label) {
  const usable = nameCandidates(name).filter((candidate) => candidate && !taken.has(candidate.toLowerCase()));
  const earlier = usable.find((candidate) => madeFromSanTheme(path.join(presetsDir, candidate), label));
  if (earlier) return { name: earlier, replace: true };
  const free = usable.find((candidate) => !fs.existsSync(path.join(presetsDir, candidate)));
  return free ? { name: free, replace: false } : null;
}

function presetNameFor(label) {
  return sanitizePresetName(text(label)) || sanitizePresetName('SAN theme');
}

/*
  Installs one preset from up to four SAN themes (`themes`: type -> raw customisation). Missing
  types fall back to `main` at render time, as SAN's "sync theme" does. Mirrors installPackage():
  staging folder, one rename, `duplicate` decides what an existing name means.
*/
function installPreset({
  name: wanted,
  themes,
  settings,
  origin,
  lookupFile,
  lookupFolder,
  rejected = [],
  presetsDir,
  soundsDir,
  appVersion = '',
  duplicate = 'fail',
  reservedNames = [],
  takenNames = [],
}) {
  let name = presetNameFor(wanted);
  if (reservedNames.includes(name)) return fail('reserved-name', { name });
  fs.mkdirSync(presetsDir, { recursive: true });

  const taken = new Set(takenNames.map((entry) => String(entry).toLowerCase()));
  const installedHere = fs.existsSync(path.join(presetsDir, name));
  const existed = installedHere || taken.has(name.toLowerCase());
  let replacing = false;
  if (duplicate === 'auto') {
    const target = autoTarget(presetsDir, name, taken, text(origin.name));
    if (!target) return fail('duplicate', { name });
    name = target.name;
    replacing = target.replace;
  } else if (existed) {
    if (duplicate === 'fail') return fail('duplicate', { name, bundled: !installedHere });
    if (duplicate === 'rename') {
      name = nextFreeName(presetsDir, name, taken);
      if (!name) return fail('duplicate', { name: presetNameFor(wanted) });
    } else if (duplicate === 'replace') {
      replacing = true;
    } else {
      return fail('invalid-duplicate-policy');
    }
  }
  const destination = path.join(presetsDir, name);
  if (!isInside(presetsDir, destination)) return fail('outside-preset-storage');

  const report = { types: [], kept: 0, unknown: [], missing: [], assets: [...rejected], layouts: [], label: text(origin.name), sanVersion: text(origin.version) };

  const collector = assetCollector((value, kind) => lookupFile(value, kind));
  const cleanTypes = {};
  for (const type of engine.TYPES) {
    if (!themes[type]) continue;
    const cleaned = sanTheme.cleanCustomisation(themes[type], { resolveAsset: collector.resolve });
    cleanTypes[type] = cleaned.customisation;
    report.types.push(type);
    report.kept += cleaned.report.kept.length;
    for (const key of cleaned.report.unknown) if (!report.unknown.includes(key)) report.unknown.push(key);
    for (const miss of cleaned.report.missing) {
      // A sound is looked up by the sound installer below, which reports it itself.
      if (miss.key === 'soundfile' || miss.key === 'sounddir') continue;
      if (!report.missing.some((entry) => entry.name === miss.name)) report.missing.push(miss);
    }
  }
  if (!cleanTypes.main) cleanTypes.main = cleanTypes[report.types[0]];
  if (!cleanTypes.main) return fail('invalid-theme');
  for (const entry of collector.rejected) report.assets.push(entry);
  report.layouts = sanEngine.layoutsOf({ types: cleanTypes });

  const staging = fs.mkdtempSync(path.join(presetsDir, '.awsan-'));
  const stagedPreset = path.join(staging, 'preset');
  const backup = `${destination}.awsan-old`;
  const createdSounds = [];
  let backedUp = false;

  try {
    fs.mkdirSync(path.join(stagedPreset, PRESET_ASSETS_DIR), { recursive: true });
    for (const file of collector.written) {
      const target = path.join(stagedPreset, PRESET_ASSETS_DIR, file.name);
      if (!isInside(stagedPreset, target)) throw new Error('unsafe-path');
      fs.writeFileSync(target, file.data);
      report.assets.push({ name: file.name, kind: 'file', code: 'installed' });
    }

    const sounds = {};
    for (const type of Object.keys(cleanTypes)) {
      const raw = themes[type] || {};
      sounds[type] = installSounds(raw, { soundsDir, lookupFile: (value) => lookupFile(value, 'sound'), lookupFolder, created: createdSounds, report });
    }

    const theme = {
      label: text(origin.name).slice(0, 80),
      sanVersion: text(origin.version).slice(0, 32),
      thresholds: { rarity: settings.rarity, semirarity: settings.semirarity },
      showpercent: settings.showpercent,
      notify1line: settings.notify1line === true,
      types: cleanTypes,
    };
    sanEngine.writePresetFiles(stagedPreset, theme, { name });

    const mainSound = (sounds.main && sounds.main.mode === 'file' && sounds.main.files[0]) || '';
    const manifest = {
      format: PRESET_PACKAGE_FORMAT,
      formatVersion: PRESET_PACKAGE_FORMAT_VERSION,
      name,
      description: `Imported from a ${SAN_ORIGIN_APP} theme.`,
      author: '',
      version: '1.0.0',
      tags: ['imported', 'san'],
      createdAt: new Date().toISOString(),
      app: { createdWith: String(appVersion || '').slice(0, 32), minVersion: '' },
      origin: { app: SAN_ORIGIN_APP, format: SAN_ORIGIN_FORMAT, version: theme.sanVersion, name: theme.label },
      // The preset's own sound for an ordinary unlock; `sanSounds` keeps what each state plays.
      sound: mainSound,
      sanSounds: sounds,
      sanThresholds: theme.thresholds,
    };
    fs.writeFileSync(path.join(stagedPreset, PRESET_PACKAGE_FILE), JSON.stringify(manifest, null, 2), 'utf8');

    if (fs.existsSync(destination)) {
      renameRetry(destination, backup);
      backedUp = true;
    }
    try {
      renameRetry(stagedPreset, destination);
    } catch (err) {
      if (backedUp) {
        renameRetry(backup, destination);
        backedUp = false;
      }
      throw err;
    }
    if (backedUp) {
      fs.rmSync(backup, { recursive: true, force: true });
      backedUp = false;
    }
    return { ok: true, name, replaced: replacing, report, manifest, theme };
  } catch (err) {
    for (const created of createdSounds) fs.rmSync(created, { force: true });
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

// ---- the two entry points -----------------------------------------------------------------------

function themeLabel(theme) {
  return text(theme && theme.label) || 'SAN theme';
}

/*
  A `.san` (or the usertheme.json of a theme SAN unpacked). It carries one of SAN's four themes; it
  paints every state of the preset, like SAN with "sync theme" on.
*/
function installSanTheme({ file, presetsDir, soundsDir, appVersion = '', duplicate = 'fail', reservedNames = [], takenNames = [], sanImagesDir = findSanImages() }) {
  const read = readSanTheme(file);
  if (!read.ok) return read;
  const theme = read.theme;
  const suffix = SAN_TYPE_SUFFIX.exec(text(theme.userthemedir));
  const lookupFile = (value) => {
    const base = sanTheme.baseName(value);
    return read.files.get(base.toLowerCase()) || (sanImagesDir && base ? diskRecord(path.join(sanImagesDir, base)) : null);
  };
  const lookupFolder = (value) => read.folders.get(sanTheme.baseName(value).toLowerCase()) || [];
  const out = installPreset({
    name: themeLabel(theme),
    themes: { main: theme.customisation },
    settings: SAN_DEFAULT_SETTINGS,
    origin: { name: themeLabel(theme), version: text(theme.version) },
    lookupFile,
    lookupFolder,
    rejected: read.rejected,
    presetsDir,
    soundsDir,
    appVersion,
    duplicate,
    reservedNames,
    takenNames,
  });
  if (out.ok) out.report.notifyType = suffix ? suffix[1] : '';
  else if (out.error === 'duplicate') out.report = { label: themeLabel(theme) };
  return out;
}

/*
  SAN's own settings: one preset for the four themes in use, then one per other saved theme (each
  painting every state, like a .san). Defaults SAN created and the user never changed are skipped.
  Returns every preset installed; one failing does not stop the others.
*/
function installSanSetup({ configFile, presetsDir, soundsDir, appVersion = '', duplicate = 'auto', reservedNames = [], takenNames = [] }) {
  const config = readSanConfig(configFile);
  if (!config.ok) return config;
  const lookupFile = (value) => diskRecord(value);
  const lookupFolder = (value) => diskFolder(value);
  const common = { settings: config.settings, lookupFile, lookupFolder, presetsDir, soundsDir, appVersion, duplicate, reservedNames, takenNames };

  const installed = [];
  const failed = [];
  const activeLabel = (config.saved.find((entry) => entry.type === 'main' && entry.enabled) || {}).label || '';
  const setup = installPreset({
    ...common,
    name: `SAN - ${activeLabel || 'current setup'}`,
    themes: config.active,
    origin: { name: activeLabel || 'Current setup', version: config.version },
  });
  if (setup.ok) installed.push(setup);
  else failed.push({ name: activeLabel, error: setup.error });

  for (const entry of config.saved) {
    // The theme in use is already in the setup preset; an untouched default would only add noise.
    if (entry.enabled || /^Default (Main|Semi-Rare|Rare|100%)$/.test(entry.label)) continue;
    const one = installPreset({ ...common, name: entry.label, themes: { main: entry.customisation }, origin: { name: entry.label, version: config.version } });
    if (one.ok) installed.push(one);
    else failed.push({ name: entry.label, error: one.error });
  }
  return { ok: installed.length > 0, installed, failed, error: installed.length ? '' : (failed[0] && failed[0].error) || 'nothing-to-import' };
}

module.exports = {
  SAN_ORIGIN_APP,
  SAN_ORIGIN_FORMAT,
  SAN_LIMITS,
  readSanTheme,
  findSanConfig,
  findSanImages,
  installSanTheme,
  installSanSetup,
};
