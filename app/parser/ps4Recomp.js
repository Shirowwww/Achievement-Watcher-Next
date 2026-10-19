'use strict';

/*
  PC ports of PS4 games built on the run.py runner. The launcher's settings.json names the original
  game dump (game_dir), whose trophy list is read, and the user folder holding the unlock logs.
  Scripts are only ever read for literal values, never run. Synchronous and dependency-free: the
  Watchdog loads this file through sharedAppModule.
*/

const fs = require('fs');
const os = require('os');
const path = require('path');
const { hostPath, hostsFor, allowedFromConfig } = require(path.join(__dirname, '..', 'util', 'winHosts.js'));
const formats = require(path.join(__dirname, 'ps4RecompTrophies.js'));
const logs = require(path.join(__dirname, 'ps4RecompLogs.js'));

const SOURCE = 'PS4 Recomp';
const TYPE = 'ps4recomp';
const RUNNER = 'run.py';
const TROPHIES_LOG = 'trophies.log';
const LAST_RUN_LOG = 'last_run.log';
const LOG_FILES = [TROPHIES_LOG, LAST_RUN_LOG];

const MAX_SCRIPT_BYTES = 512 * 1024;
const MAX_LAUNCHER_SOURCE_BYTES = 256 * 1024;
const MAX_LAUNCHER_SOURCES = 32;
const MAX_INSTALL_DEPTH = 3;
const MAX_INSTALL_DIRECTORIES = 400;
const MAX_DUMP_DEPTH = 2;
const MAX_DUMP_DIRECTORIES = 128;
const SKIP_DIRECTORIES = /^(?:bin|out|_internal|launcher|user|node_modules|\.git|sce_sys|\$recycle\.bin|windows)$/i;
const WINDOWS_ABSOLUTE = /^[a-zA-Z]:[\\/]/;

// `env` is the prefix of the runner's <PREFIX>_GAME_DIR / _DATA_DIR / _USER_DIR variables.
const PORTS = [
  { port: 'bloodborne', launcher: 'Bloodborne.exe', settings: 'bbport-launcher', env: 'BB', marker: 'bloodborne' },
  {
    port: 'uncharted',
    launcher: 'Uncharted.exe',
    settings: 'uncharted-launcher',
    env: 'BB',
    marker: 'uncharted',
    games: [
      { game: 'u1', title: "Uncharted: Drake's Fortune Remastered", slot: 0 },
      { game: 'u2', title: 'Uncharted 2: Among Thieves Remastered', slot: 1 },
      { game: 'u3', title: "Uncharted 3: Drake's Deception Remastered", slot: 2 },
    ],
  },
  { port: 'gow3', launcher: 'God of War III.exe', settings: 'gow3-launcher', env: 'GOW3', marker: 'gow3' },
  { port: 'medievil', launcher: 'MediEvil.exe', settings: 'medievil-launcher', env: 'GOW3', marker: 'medievil' },
];

let debug = { log() {}, warn() {}, error() {} };

module.exports.initDebug = ({ isDev, userDataPath }) => {
  debug = new (require(path.join(__dirname, '..', 'util', 'logger.js')))({
    console: isDev || false,
    file: path.join(userDataPath, 'logs/parser.log'),
  });
};

// Resolved on first use and overridable: the Watchdog locates userData its own way.
let _dataRoot = '';
function dataRoot() {
  if (!_dataRoot) {
    const { userDataDir } = require(path.join(__dirname, '..', 'util', 'userDataPath.js'));
    _dataRoot = userDataDir();
  }
  return _dataRoot;
}
module.exports.setDataRoot = (dir) => {
  _dataRoot = dir ? path.resolve(String(dir)) : '';
};
const safeName = (value) => String(value || '').replace(/[^\w.-]/g, '_');
const iconDirFor = (appid) => path.join(dataRoot(), 'icon_cache', TYPE, safeName(appid));
const journalFile = (appid) => path.join(dataRoot(), 'cache', TYPE, `${safeName(appid)}.json`);

function isRegularFile(file) {
  try {
    const stat = fs.lstatSync(file);
    return stat.isFile() && !stat.isSymbolicLink();
  } catch {
    return false;
  }
}

function isRealDirectory(dir) {
  try {
    const stat = fs.lstatSync(dir);
    return stat.isDirectory() && !stat.isSymbolicLink();
  } catch {
    return false;
  }
}

function readDirectory(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

function readText(file, max) {
  const buffer = formats.readBounded(file, max);
  return buffer ? buffer.toString('utf8').replace(/^\uFEFF/, '') : '';
}

function hasFileNamed(dir, name) {
  const wanted = name.toLowerCase();
  return readDirectory(dir).some((entry) => entry.isFile() && entry.name.toLowerCase() === wanted);
}

// Files only a given port ships: its launcher art and launcher scripts.
function ownsPortFiles(root, port) {
  const launcher = path.join(root, 'launcher');
  const names = [`${port.marker}.png`, `${port.marker}.ico`, `${port.marker}_launcher.py`, `${port.marker}_launcher_win.py`, `${port.marker}_launcher_windows.py`];
  return names.some((name) => isRegularFile(path.join(launcher, name)));
}

function localSettingsFiles(root) {
  return [path.join(root, 'settings.json'), path.join(root, 'launcher', 'settings.json')].filter(isRegularFile);
}

// Where a launcher keeps settings.json: under each host's APPDATA, and ~/.config for a native Linux build.
function hostSettingsFiles(root, folder) {
  const files = [];
  for (const host of hostsFor(root)) {
    const file = hostPath(host, 'APPDATA', folder, 'settings.json');
    if (file) files.push(file);
  }
  if (process.platform !== 'win32') files.push(path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), folder, 'settings.json'));
  return files;
}

// Launcher folder names the runner or the launcher sources spell out literally ("bbport-launcher").
function launcherFolderHints(root, script) {
  let text = script;
  const sources = readDirectory(path.join(root, 'launcher')).filter((entry) => entry.isFile() && /\.py$/i.test(entry.name));
  for (const entry of sources.slice(0, MAX_LAUNCHER_SOURCES)) text += `\n${readText(path.join(root, 'launcher', entry.name), MAX_LAUNCHER_SOURCE_BYTES)}`;
  return [...new Set([...text.matchAll(/['"]([a-z0-9][a-z0-9._-]{0,63}[-_]launcher)['"]/gi)].map((match) => match[1]))];
}

/*
  A port built on the shared runner without a profile here: run.py boots a linked PS4 executable
  and names one <PREFIX>_GAME_DIR at most. More than one prefix is a collection we cannot split.
*/
function genericPort(root, script) {
  if (!/boot-linked\.bin|--app0/.test(script)) return null;
  const prefixes = [...new Set([...script.matchAll(/\b([A-Z][A-Z0-9_]*)_GAME_DIR\b/g)].map((match) => match[1]))];
  if (prefixes.length > 1) return null;
  const hinted = launcherFolderHints(root, script).filter((folder) => hostSettingsFiles(root, folder).some(isRegularFile));
  if (prefixes.length === 0 && hinted.length === 0 && localSettingsFiles(root).length === 0 && !isRegularFile(path.join(root, 'sce_sys', 'param.sfo'))) return null;
  return { port: 'generic', launcher: '', settings: hinted.length === 1 ? hinted[0] : '', env: prefixes[0] || '', marker: '' };
}

// The port a folder holding run.py is: by its own files, then its launcher's name, then the runner.
function identifyPort(root) {
  if (!isRealDirectory(root) || !isRegularFile(path.join(root, RUNNER))) return null;
  const script = readText(path.join(root, RUNNER), MAX_SCRIPT_BYTES);
  if (!script) return null;
  const owned = PORTS.filter((port) => ownsPortFiles(root, port));
  if (owned.length === 1) return owned[0];
  const candidates = owned.length > 1 ? owned : PORTS;
  const launched = candidates.filter((port) => hasFileNamed(root, port.launcher));
  if (launched.length === 1) return launched[0];
  if (/big2-ps4_Shipping\.elf/.test(script) && /big3-ps4_Shipping\.elf/.test(script)) return PORTS.find((port) => port.port === 'uncharted');
  return genericPort(root, script);
}

function readSettings(file) {
  try {
    const value = JSON.parse(readText(file, formats.MAX_SMALL_BYTES));
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

function launcherSettings(root, port) {
  const files = [...localSettingsFiles(root), ...(port.settings ? hostSettingsFiles(root, port.settings) : [])];
  for (const file of files) {
    if (!isRegularFile(file)) continue;
    const values = readSettings(file);
    if (values) return { file, values };
  }
  return { file: '', values: {} };
}

// KEY=VALUE tokens the launcher passes on to the runner, read as text only.
function parseExtraEnv(value) {
  const env = {};
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const [key, item] of Object.entries(value)) if (/^[A-Za-z_]\w*$/.test(key) && typeof item === 'string') env[key] = item;
    return env;
  }
  for (const match of String(value || '').matchAll(/(?:^|\s)([A-Za-z_]\w*)=(?:"([^"]*)"|'([^']*)'|(\S+))/g)) {
    env[match[1]] = match[2] ?? match[3] ?? match[4];
  }
  return env;
}

/*
  The default a runner gives a directory variable, when it is a literal path expression such as
  env.get('BB_GAME_DIR', PORT.parent / 'Game'). Anything computed is left unresolved.
*/
function scriptDefault(script, key, bases) {
  const call = new RegExp(`(?:env|environ|os\\.environ)\\.get\\(\\s*['"]${key}['"]\\s*,\\s*([^\\r\\n)]+)\\)`).exec(script);
  if (!call) return '';
  const expression = /^([A-Za-z_]\w*)((?:\.parent)*)((?:\s*\/\s*(?:'[^'\r\n]*'|"[^"\r\n]*"))*)\s*$/.exec(call[1].trim());
  if (!expression || !bases[expression[1]]) return '';
  let result = bases[expression[1]];
  for (let parents = expression[2].split('.parent').length - 1; parents > 0; parents -= 1) result = path.dirname(result);
  for (const part of expression[3].matchAll(/['"]([^'"]*)['"]/g)) result = path.resolve(result, part[1]);
  return result;
}

function localDir(root, value) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) return '';
  const host = hostsFor(root)[0];
  const local = WINDOWS_ABSOLUTE.test(text) && process.platform !== 'win32' && host ? host.localPath(text) : '';
  return path.resolve(root, local || text);
}

/*
  game_dir, data_dir and user_dir as the runner would see them: a variable from extra_env (then the
  environment), else the launcher setting, else the runner's literal default.
*/
function resolveDirs(root, port, settings, script) {
  const extra = parseExtraEnv(settings.extra_env);
  const variable = (suffix) => (port.env ? extra[`${port.env}_${suffix}`] || process.env[`${port.env}_${suffix}`] || '' : '');
  // The port's files may name a share only on the server the port is on (see allowedFromConfig).
  const fromConfig = (dir) => (dir && allowedFromConfig(dir, root) ? dir : '');
  const pick = (suffix, setting, bases) =>
    fromConfig(localDir(root, variable(suffix))) ||
    fromConfig(localDir(root, settings[setting])) ||
    (port.env ? fromConfig(scriptDefault(script, `${port.env}_${suffix}`, bases)) : '');
  const dataDir = pick('DATA_DIR', 'data_dir', { PORT: root }) || root;
  const bases = { PORT: root, data: dataDir, DATA: dataDir };
  const gameDir = pick('GAME_DIR', 'game_dir', bases);
  const explicitUser = pick('USER_DIR', 'user_dir', bases);
  const logsInData = port.port === 'generic' && LOG_FILES.some((name) => isRegularFile(path.join(dataDir, name)));
  return { gameDir, dataDir, userDir: explicitUser || (logsInData ? dataDir : path.join(dataDir, 'user')) };
}

// The one original dump below a port that names none: a folder holding sce_sys/param.sfo.
function findDump(root) {
  const queue = [{ dir: root, depth: 0 }];
  const found = [];
  let visited = 0;
  while (queue.length && visited++ < MAX_DUMP_DIRECTORIES) {
    const { dir, depth } = queue.shift();
    if (isRegularFile(path.join(dir, 'sce_sys', 'param.sfo'))) {
      found.push(dir);
      continue;
    }
    if (depth >= MAX_DUMP_DEPTH) continue;
    for (const entry of readDirectory(dir)) {
      if (entry.isDirectory() && !SKIP_DIRECTORIES.test(entry.name)) queue.push({ dir: path.join(dir, entry.name), depth: depth + 1 });
    }
  }
  return found.length === 1 ? found[0] : '';
}

/*
  The port installs at or below a folder the user added. A port is a game of its own, never a
  library: nothing below one is searched.
*/
function findInstallations(dir) {
  const installs = [];
  const queue = [{ dir: path.resolve(String(dir || '')), depth: 0 }];
  let visited = 0;
  while (queue.length && visited++ < MAX_INSTALL_DIRECTORIES) {
    const current = queue.shift();
    const port = identifyPort(current.dir);
    if (port) {
      installs.push({ root: current.dir, port });
      continue;
    }
    if (current.depth >= MAX_INSTALL_DEPTH) continue;
    for (const entry of readDirectory(current.dir)) {
      if (entry.isDirectory() && !SKIP_DIRECTORIES.test(entry.name)) queue.push({ dir: path.join(current.dir, entry.name), depth: current.depth + 1 });
    }
  }
  return installs;
}

const SET_FILE = /^trophy(\d{2})(\.trp)?$/i;

// trophy set slot -> { trp, exports }: the dump's trophy<NN>.trp, and decrypted exports of it.
function trophySets(dumpDir, installRoot) {
  const sets = new Map();
  const add = (slot, key, value) => {
    const set = sets.get(slot) || { trp: '', exports: [] };
    if (key === 'trp' && !set.trp) set.trp = value;
    if (key === 'exports') set.exports.push(value);
    sets.set(slot, set);
  };
  for (const folder of [dumpDir && path.join(dumpDir, 'sce_sys', 'trophy'), installRoot && path.join(installRoot, 'TrophyFiles')]) {
    if (!folder) continue;
    for (const entry of readDirectory(folder)) {
      const match = SET_FILE.exec(entry.name);
      if (!match) continue;
      const file = path.join(folder, entry.name);
      if (match[2] && entry.isFile()) add(Number(match[1]), 'trp', file);
      else if (!match[2] && entry.isDirectory()) add(Number(match[1]), 'exports', file);
    }
  }
  return sets;
}

function dumpIdentity(dumpDir) {
  const sfo = dumpDir ? formats.readSfo(formats.readBounded(path.join(dumpDir, 'sce_sys', 'param.sfo'), formats.MAX_SMALL_BYTES)) : {};
  const bindings = dumpDir ? formats.readNpbind(formats.readBounded(path.join(dumpDir, 'sce_sys', 'npbind.dat'), formats.MAX_SMALL_BYTES)) : new Map();
  return { title: sfo.TITLE || '', titleId: /^CUSA\d{5}$/.test(sfo.TITLE_ID || '') ? sfo.TITLE_ID : '', bindings };
}

function appidOf(identity) {
  return `ps4recomp-${identity}`;
}

function gameTargets(install, dirs, identity, sets) {
  const { root, port } = install;
  const base = { port: port.port, installRoot: root, dumpDir: dirs.gameDir, dataDir: dirs.dataDir, userDir: dirs.userDir };
  const exe = port.launcher && hasFileNamed(root, port.launcher) ? path.join(root, port.launcher) : '';
  if (port.games) {
    return port.games
      .filter((entry) => sets.has(entry.slot))
      .map((entry) => {
        const npcommid = identity.bindings.get(entry.slot) || '';
        const appid = appidOf(npcommid || `${port.port}-${entry.game}`);
        return { appid, ...base, game: entry.game, title: entry.title, slot: entry.slot, npcommid, exe, logs: [LAST_RUN_LOG] };
      });
  }
  if (sets.size !== 1) {
    debug.log(`[ps4recomp] '${root}': ${sets.size} trophy sets, a single-game port needs exactly one`);
    return [];
  }
  const [slot] = sets.keys();
  const npcommid = identity.bindings.get(slot) || '';
  const id = npcommid || identity.titleId;
  if (!id) return [];
  return [{ appid: appidOf(id), ...base, game: '', title: identity.title, slot, npcommid, exe, logs: LOG_FILES.slice() }];
}

// Every game of every port at or below `dir` whose trophy list can be read from its original dump.
function discover(dir) {
  const games = [];
  for (const install of findInstallations(dir)) {
    try {
      const script = readText(path.join(install.root, RUNNER), MAX_SCRIPT_BYTES);
      const dirs = resolveDirs(install.root, install.port, launcherSettings(install.root, install.port).values, script);
      if (!dirs.gameDir) dirs.gameDir = findDump(install.root);
      const sets = trophySets(dirs.gameDir, install.root);
      if (sets.size === 0) {
        debug.log(`[ps4recomp] '${install.root}': no trophy data, the launcher must point at the original game`);
        continue;
      }
      games.push(...gameTargets(install, dirs, dumpIdentity(dirs.gameDir), sets));
    } catch (err) {
      debug.warn(`[ps4recomp] '${install.root}' could not be read: ${err && err.message ? err.message : err}`);
    }
  }
  return games;
}

function scan(dir) {
  return discover(dir).map((target) => ({
    appid: target.appid,
    source: SOURCE,
    data: { type: TYPE, ...target, gameDir: target.installRoot, path: target.userDir, trustedInstalled: true },
  }));
}

// The logs a record reads: the collection's only carries its game in last_run.log.
function logNames(info) {
  const wanted = Array.isArray(info.logs) ? info.logs : info.game ? [LAST_RUN_LOG] : LOG_FILES;
  return wanted.filter((name) => LOG_FILES.includes(name));
}

function writeAtomic(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, content);
  fs.renameSync(temporary, file);
}

/*
  last_run.log is rewritten every session, and a collection game has no other record of its
  unlocks: what was once read is kept in a small journal of its own, merged into every read.
*/
function rememberUnlocks(appid, unlocked) {
  const file = journalFile(appid);
  let stored = {};
  try {
    const parsed = JSON.parse(readText(file, formats.MAX_SMALL_BYTES) || '{}');
    if (parsed && parsed.unlocked && typeof parsed.unlocked === 'object') stored = parsed.unlocked;
  } catch {
    stored = {};
  }
  const merged = new Map(Object.entries(stored).filter(([id, time]) => /^\d{1,4}$/.test(id) && Number.isFinite(time)));
  const grew = [...unlocked.keys()].some((id) => !merged.has(id));
  for (const [id, time] of unlocked) if (!merged.has(id) || (time > 0 && !(merged.get(id) > 0))) merged.set(id, time);
  if (grew) {
    try {
      writeAtomic(file, JSON.stringify({ unlocked: Object.fromEntries(merged) }));
    } catch (err) {
      debug.warn(`[ps4recomp] could not keep the unlocks of ${appid}: ${err}`);
    }
  }
  return merged;
}

/*
  { unlocked: Map(id -> unix seconds, 0 when unknown), unstable }. `unstable` says a log was being
  rewritten: what it held is left out of this read and must be read again.
*/
function readUnlocks(data) {
  const info = data && typeof data === 'object' ? data : {};
  const unlocked = new Map();
  let unstable = false;
  const keep = (id, time) => {
    const previous = unlocked.get(id);
    if (previous === undefined || (time > 0 && (previous === 0 || time < previous))) unlocked.set(id, time);
  };
  if (!info.userDir) return { unlocked, unstable };
  for (const name of logNames(info)) {
    const read = logs.readLog(path.join(String(info.userDir), name));
    if (read.unstable) unstable = true;
    for (const unlock of logs.parseLog(name, read.lines)) if (!info.game || unlock.game === info.game) keep(unlock.id, unlock.time);
  }
  if (info.game && info.appid) return { unlocked: rememberUnlocks(info.appid, unlocked), unstable };
  return { unlocked, unstable };
}

function getAchievements(data) {
  let read = readUnlocks(data);
  if (read.unstable) read = readUnlocks(data);
  return [...read.unlocked].map(([id, earned_time]) => ({ id, achieved: true, earned_time }));
}

function containerOf(files, info, key) {
  const container = files ? formats.readContainer(files, info.npcommid, key) : null;
  return container && container.documents.size > 0 ? container : null;
}

// The trophy list of a record's set: a decrypted export when there is one, else the dump's .trp.
function loadTrophySet(info) {
  const set = trophySets(info.dumpDir, info.installRoot).get(Number(info.slot));
  if (!set) return null;
  const key = formats.readKeyFile(path.join(String(info.installRoot || ''), 'trophy.key')) || formats.RETAIL_TROPHY_KEY;
  const trp = () => formats.readTrp(formats.readBounded(set.trp, formats.MAX_TRP_BYTES));
  for (const dir of set.exports) {
    const exported = containerOf(formats.readExportFolder(dir), info, '');
    if (!exported) continue;
    const packed = exported.icons.size === 0 && set.trp ? trp() : null;
    if (packed) return { ...exported, icons: formats.readContainer(packed, '', '').icons };
    return exported;
  }
  return set.trp ? containerOf(trp(), info, key) : null;
}

function toFileUrl(file) {
  return 'file:///' + file.replace(/\\/g, '/');
}

function writeIcon(file, image) {
  if (!image || image.length === 0) return '';
  try {
    if (!isRegularFile(file) || fs.statSync(file).size !== image.length) fs.writeFileSync(file, image);
    return toFileUrl(file);
  } catch (err) {
    debug.warn(`[ps4recomp] could not write icon '${file}': ${err}`);
    return '';
  }
}

// The dump's own key art and icon, the trophy set's icon when the dump has none.
function gameArt(info, container, iconDir) {
  const art = (name) => (isRegularFile(path.join(String(info.dumpDir || ''), 'sce_sys', name)) ? toFileUrl(path.join(info.dumpDir, 'sce_sys', name)) : '');
  const background = art('pic1.png') || art('pic0.png');
  const icon = art('icon0.png') || writeIcon(path.join(iconDir, 'icon0.png'), container.icon0);
  return { header: background || icon, background, overlay: !!background, icon };
}

function textsById(document) {
  return new Map((document ? document.trophies : []).map((trophy) => [trophy.id, trophy]));
}

function trophyEntry(trophy, local, english, icon) {
  const own = local.get(trophy.id) || {};
  const reference = english.get(trophy.id) || {};
  return {
    name: trophy.id,
    displayName: own.name || reference.name || trophy.name || trophy.id,
    description: own.detail || reference.detail || trophy.detail || '',
    rarityName: reference.name || undefined,
    rarityDescription: reference.detail || undefined,
    hidden: trophy.hidden ? 1 : 0,
    type: trophy.grade,
    icon,
    icongray: icon,
  };
}

function cleanTitle(text) {
  return String(text || '').replace(/[™®©]/g, '').replace(/\s+/g, ' ').trim();
}

async function getGameData(data, lang = 'english') {
  const info = data && typeof data === 'object' ? data : {};
  const container = loadTrophySet(info);
  if (!container) throw new Error(`PS4 Recomp: no readable trophy list for ${info.appid} (set ${info.slot}) under '${info.dumpDir}'`);
  const documents = container.documents;
  const base = documents.get('') || documents.get('english') || documents.values().next().value;
  const local = documents.get(String(lang || '').toLowerCase()) || base;
  const english = documents.get('english') || base;
  const iconDir = iconDirFor(info.appid);
  try {
    fs.mkdirSync(iconDir, { recursive: true });
  } catch {
    /* the trophies still list, just without their art */
  }
  const img = gameArt(info, container, iconDir);
  const localTexts = textsById(local);
  const englishTexts = textsById(english);
  const list = base.trophies.map((trophy) => {
    const icon = writeIcon(path.join(iconDir, `${trophy.id}.png`), container.icons.get(trophy.id)) || img.icon;
    return trophyEntry(trophy, localTexts, englishTexts, icon);
  });
  return {
    name: cleanTitle(local.title) || cleanTitle(base.title) || info.title || info.npcommid || String(info.appid || ''),
    appid: String(info.appid || ''),
    system: 'playstation',
    img,
    rarityTitles: [...new Set([cleanTitle(english.title), info.title].filter(Boolean))],
    achievement: { total: list.length, list },
  };
}

module.exports.SOURCE = SOURCE;
module.exports.TYPE = TYPE;
module.exports.LOG_FILES = LOG_FILES;
module.exports.findInstallations = findInstallations;
module.exports.discover = discover;
module.exports.scan = scan;
module.exports.readUnlocks = readUnlocks;
module.exports.getAchievements = getAchievements;
module.exports.getGameData = getGameData;
module.exports.iconDirFor = iconDirFor;
module.exports._internal = { PORTS, identifyPort, resolveDirs, scriptDefault, parseExtraEnv, launcherSettings, trophySets, findDump, journalFile };
