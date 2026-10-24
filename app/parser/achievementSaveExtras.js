'use strict';

/*
  Unlock state kept outside the record folders, shared by the full reset and the relock. Console
  baselines must go too, or the Watchdog would take the next unlock as already seen.
*/

const fs = require('fs');
const path = require('path');

const lazy = (file) => require(path.join(__dirname, file));

const GREENLUMA_KEYS = ['GLR', 'GL2020', 'GL2024', 'GL2025'];
const REGISTRY_SOURCE_RE = /^(greenluma |lumaplay$)/i;

// Mirrors watchdog/util/baselineCache.js; keep both in sync.
const CONSOLE_PREFIXES = {
  'rpcs3 emulator': 'rpcs3',
  'shadps4 emulator': '',
  'xenia emulator': 'xenia',
  'kytyps5 emulator': 'kytyps5',
  xlivelessness: 'xlln',
  'xbox 360 recomp': 'x360recomp',
};

const isFile = (file) => {
  try {
    return fs.statSync(file).isFile();
  } catch {
    return false;
  }
};

function sourcesOf(game) {
  const paths = Array.isArray(game && game.dataPaths) ? game.dataPaths : [];
  return new Set([game && game.source, ...paths.map((entry) => entry && entry.source)].filter(Boolean).map((source) => String(source).trim().toLowerCase()));
}

// The { source, path } list a game's unlocks are read from, as the full reset reads it.
function dataPathsOf(game) {
  if (Array.isArray(game && game.dataPaths) && game.dataPaths.length) return game.dataPaths;
  return game && game.dataPath ? [{ source: game.source, path: game.dataPath }] : [];
}

function dataRoots(game, source = null) {
  return dataPathsOf(game).filter((entry) => entry && entry.path && (source == null || String(entry.source || '').trim().toLowerCase() === source)).map((entry) => entry.path);
}

const hasRegistrySource = (game) => [...sourcesOf(game)].some((source) => REGISTRY_SOURCE_RE.test(source));

function uplayIdOf(game) {
  const embedded = /^uplay-?(\d+)$/i.exec(String((game && game.appid) || ''));
  if (embedded) return embedded[1];
  try {
    return lazy('uplayR2.js').resolveGameIdentity(game).uplayId;
  } catch {
    return '';
  }
}

function readerFiles(game, sources) {
  const found = [];
  const roots = dataRoots(game);
  if (sources.has('xlivelessness')) {
    const titleId = String(game.appid || '').replace(/^xlln-/i, '');
    for (const entry of lazy('xlln.js').stateFiles({ gameDir: game.gameDir || roots[0], titleId })) found.push({ path: entry.file, kind: 'xlln', source: 'XLiveLessNess' });
  }
  if (sources.has('ff7 (2013)')) {
    for (const root of roots) {
      const detected = lazy('ff7.js').detect(root);
      if (detected.detected && isFile(detected.stateFile)) found.push({ path: detected.stateFile, kind: 'ff7', source: 'FF7 (2013)' });
    }
  }
  if (sources.has('rune uplay')) {
    const uplayId = uplayIdOf(game);
    for (const entry of lazy('runeUplay.js').discoverFiles()) {
      if (uplayId && entry.uplayId === uplayId) found.push({ path: entry.file, kind: 'rune-uplay', source: 'RUNE Uplay', key: `${entry.userId}_${entry.uplayId}` });
    }
  }
  if (sources.has('madnesspatch')) {
    for (const profile of lazy('madnesspatch.js').listProfiles()) found.push({ path: profile.file, kind: 'madnesspatch', source: 'MadnessPatch', key: profile.profile });
  }
  if (sources.has('markerpatch')) {
    for (const file of lazy('markerpatch.js').stateFilePaths()) if (isFile(file)) found.push({ path: file, kind: 'markerpatch', source: 'MarkerPatch', key: 'markerpatch' });
  }
  return found;
}

// Every state file a reader locates on its own, once each.
function extraSaveFiles(game) {
  const seen = new Set();
  return readerFiles(game || {}, sourcesOf(game)).filter((entry) => {
    const key = entry.path.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const safeName = (key) => String(key == null ? '' : key).replace(/[^\w.-]/g, '_');

function consoleBaselineFile(userDataPath, prefix, key) {
  return path.join(userDataPath || '', 'steam_cache', 'console', `${prefix ? `${prefix}-` : ''}${safeName(key)}.json`);
}

function consoleKeys(game, source) {
  const appid = String(game.appid || '');
  const roots = dataRoots(game, source);
  if (source === 'rpcs3 emulator') return roots.map((root) => path.basename(root));
  if (source === 'xenia emulator') return [appid, ...roots.map((root) => path.parse(root).name)];
  if (source === 'xlivelessness') return [appid.replace(/^xlln-/i, '')];
  return [appid];
}

// The console baselines that exist for this game: { file } each, found from its sources and extras.
function consoleBaselines(game, userDataPath, extras = []) {
  const files = [];
  for (const source of sourcesOf(game)) {
    if (!Object.hasOwn(CONSOLE_PREFIXES, source)) continue;
    for (const key of consoleKeys(game, source)) files.push(consoleBaselineFile(userDataPath, CONSOLE_PREFIXES[source], key));
  }
  for (const extra of extras) if (extra.key) files.push(consoleBaselineFile(userDataPath, extra.kind, extra.key));
  return [...new Set(files)].filter(isFile);
}

function windowsRegistry() {
  const reg = lazy(path.join('..', 'util', 'reg.js'));
  const safe = (read) => {
    try {
      return read() || [];
    } catch {
      return [];
    }
  };
  return {
    names: (key) => safe(() => reg.ListRegistryAllValues('HKCU', key)),
    subkeys: (key) => safe(() => reg.listRegistryAllSubkeys('HKCU', key)),
    read: (key, name) => reg.readRegistryValue('HKCU', key, name),
    write: (key, name, value, type = 'REG_DWORD') => (type === 'REG_SZ' ? reg.writeRegistryString('HKCU', key, name, value) : reg.writeRegistryDword('HKCU', key, name, value)),
  };
}

/*
  The HKCU keys holding this game's unlocks, { key, kind } each. Only the family its own sources name:
  a GreenLuma game's LumaPlay twin is another record.
*/
function registryKeys(game, registry) {
  const keys = [];
  const sources = [...sourcesOf(game || {})];
  const ids = [...new Set([game && game.appid, game && game.steamappid].map((id) => String(id == null ? '' : id)).filter((id) => /^\d+$/.test(id)))];
  if (sources.some((source) => source.startsWith('greenluma '))) {
    for (const name of GREENLUMA_KEYS) for (const id of ids) keys.push({ key: `SOFTWARE/${name}/AppID/${id}/Achievements`, kind: 'greenluma' });
  }
  const uplayId = sources.includes('lumaplay') ? uplayIdOf(game || {}) : '';
  if (uplayId) {
    for (const user of registry.subkeys('SOFTWARE/LumaPlay')) keys.push({ key: `SOFTWARE/LumaPlay/${user}/${uplayId}/Achievements`, kind: 'lumaplay' });
  }
  return keys.filter((entry) => registry.names(entry.key).length > 0);
}

module.exports = {
  sourcesOf,
  dataPathsOf,
  dataRoots,
  hasRegistrySource,
  uplayIdOf,
  extraSaveFiles,
  consoleBaselineFile,
  consoleBaselines,
  windowsRegistry,
  registryKeys,
};
