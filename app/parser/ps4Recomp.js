'use strict';

/*
  PC ports of PS4 games (run.py, native, runtime and PORTHEON layouts): their trophy lists and unlock
  logs. Scripts, sources and frozen launchers are only read for literal values, never run.
  Synchronous and dependency-free: the Watchdog loads this file through sharedAppModule.
*/

const fs = require('fs');
const os = require('os');
const path = require('path');
const { hostPath, hostsFor, allowedFromConfig } = require(path.join(__dirname, '..', 'util', 'winHosts.js'));
const { writeFileAtomicSync } = require(path.join(__dirname, '..', 'util', 'replaceFile.js'));
const formats = require(path.join(__dirname, 'ps4RecompTrophies.js'));
const logs = require(path.join(__dirname, 'ps4RecompLogs.js'));
const config = require(path.join(__dirname, 'ps4RecompConfig.js'));
const packages = require(path.join(__dirname, 'ps4RecompPackages.js'));
const progress = require(path.join(__dirname, 'ps4RecompProgress.js'));
const { compiledLauncherStrings } = require(path.join(__dirname, 'ps4RecompPyInstaller.js'));
const schema = require(path.join(__dirname, 'ps4RecompSchema.js'));
const { trophySets, trophyKey, recoveredNpcommid } = schema;

const SOURCE = 'PS4 Recomp';
const TYPE = 'ps4recomp';
const RUNNER = 'run.py';
const TROPHIES_LOG = 'trophies.log';
const LAST_RUN_LOG = 'last_run.log';
const UNLOCKED_LIST = 'unlocked.txt';
const TROPHY_LIST = 'trophies.tsv';
const RUNNER_LOGS = [TROPHIES_LOG, LAST_RUN_LOG];
// The Shadow of the Colossus launcher keeps the sessions before the last as last_run.1-4.log.
const ROTATED_LOGS = [1, 2, 3, 4].map((n) => `last_run.${n}.log`);
const isRunLog = (name) => name === LAST_RUN_LOG || ROTATED_LOGS.includes(name);
// A port on BilalReloaded's runtime keeps the unlocks of trophy list NN in trophy/trophyNN.txt.
const listLog = (slot) => `trophy${String(slot).padStart(2, '0')}.txt`;
const LIST_LOGS = Array.from({ length: 100 }, (_, slot) => listLog(slot));
const LOG_FILES = [...RUNNER_LOGS, ...ROTATED_LOGS, UNLOCKED_LIST, ...LIST_LOGS];
const TITLE_ID = /^[A-Z]{4}\d{5}$/;

const MAX_SCRIPT_BYTES = 512 * 1024;
const MAX_LAUNCHER_SOURCE_BYTES = 256 * 1024;
const MAX_LAUNCHER_SOURCES = 32;
const MAX_INSTALL_DEPTH = 3;
const MAX_INSTALL_DIRECTORIES = 400;
const MAX_DUMP_DEPTH = 2;
const MAX_DUMP_DIRECTORIES = 128;
const SKIP_DIRECTORIES = /^(?:bin|out|_internal|launcher|user|node_modules|\.git|sce_sys|\$recycle\.bin|windows)$/i;
const WINDOWS_ABSOLUTE = /^[a-zA-Z]:[\\/]/;
const LIST_PORT = { port: 'tsv', launcher: '', settings: '', env: '', marker: '' };
const NATIVE_PORT = { port: 'native', launcher: '', settings: '', env: '', marker: '', native: true };
// Where native ports keep their user folder, in the order they are looked for.
const NATIVE_USER_DIRS = [['user'], ['data', 'user'], ['bin', 'user']];

// The Collection dump (CUSA02344) binds service labels 1-3 to sce_sys/trophy/trophy01-03.trp.
const UNCHARTED_GAMES = [
  { game: 'u1', title: "Uncharted: Drake's Fortune Remastered", slot: 1 },
  { game: 'u2', title: 'Uncharted 2: Among Thieves Remastered', slot: 2 },
  { game: 'u3', title: "Uncharted 3: Drake's Deception Remastered", slot: 3 },
];
const PROBE_SCRIPT = /^probe_([a-z0-9_]{1,40})\.py$/i;

// `env` is the prefix of the runner's <PREFIX>_GAME_DIR / _DATA_DIR / _USER_DIR variables.
const PORTS = [
  { port: 'bloodborne', launcher: 'Bloodborne.exe', settings: 'bbport-launcher', env: 'BB', marker: 'bloodborne' },
  { port: 'uncharted', launcher: 'Uncharted.exe', settings: 'uncharted-launcher', env: 'BB', marker: 'uncharted', games: UNCHARTED_GAMES },
  { port: 'gow3', launcher: 'God of War III.exe', settings: 'gow3-launcher', env: 'GOW3', marker: 'gow3' },
  // gow3 renamed (2.6): it keeps 'God of War III.exe' for old shortcuts, and an update can leave the old art.
  { port: 'spartanport', launcher: 'SpartanPort.exe', settings: 'spartanport-launcher', env: 'SPARTAN', marker: 'spartanport', supersedes: 'gow3' },
  { port: 'medievil', launcher: 'MediEvil.exe', settings: 'medievil-launcher', env: 'GOW3', marker: 'medievil' },
  // A fork that kept the God of War III launcher's art: only its exe tells it apart.
  { port: 'wipeout', launcher: 'WipEout.exe', settings: 'wipeout-launcher', env: 'GOW3', marker: 'gow3' },
];

let debug = { log() {}, warn() {}, error() {} };

module.exports.initDebug = ({ isDev, userDataPath }) => {
  debug = new (require(path.join(__dirname, '..', 'util', 'logger.js')))({
    console: isDev || false,
    file: path.join(userDataPath, 'logs/parser.log'),
  });
  schema.setLogger(debug);
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

// Where a launcher keeps its settings: under each host's APPDATA, and ~/.config for a native Linux build.
function hostSettingsFiles(root, folder, name = 'settings.json') {
  const files = [];
  for (const host of hostsFor(root)) {
    const file = hostPath(host, 'APPDATA', folder, name);
    if (file) files.push(file);
  }
  if (process.platform !== 'win32') files.push(path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), folder, name));
  return files;
}

/*
  Launcher folder names the runner, the launcher sources or a frozen (PyInstaller) launcher spell
  out literally ("bbport-launcher", "tlg-launcher").
*/
function launcherFolderHints(root, script) {
  let text = script;
  const sources = readDirectory(path.join(root, 'launcher')).filter((entry) => entry.isFile() && /\.py$/i.test(entry.name));
  for (const entry of sources.slice(0, MAX_LAUNCHER_SOURCES)) text += `\n${readText(path.join(root, 'launcher', entry.name), MAX_LAUNCHER_SOURCE_BYTES)}`;
  for (const value of compiledLauncherStrings(root)) text += `\n'${value}'`;
  return [...new Set([...text.matchAll(/['"]([a-z0-9][a-z0-9._-]{0,63}[-_]launcher)['"]/gi)].map((match) => match[1]))];
}

// A folder setting as a local path the port's own files may name (see allowedFromConfig).
function configResolver(root) {
  return (value) => {
    const dir = localDir(root, value);
    return dir && allowedFromConfig(dir, root) ? dir : '';
  };
}

// A port without run.py: a linked boot image, or runtime folders beside a setting naming the dump.
function nativePort(root) {
  return config.hasBootImage(root) || config.configuredGame(root, configResolver(root)) ? NATIVE_PORT : null;
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
  if (prefixes.length === 0 && hinted.length === 0 && config.localConfigFiles(root).length === 0 && !isRegularFile(path.join(root, 'sce_sys', 'param.sfo'))) return null;
  return { port: 'generic', launcher: '', settings: hinted.length === 1 ? hinted[0] : '', env: prefixes[0] || '', marker: '' };
}

/*
  A port on BilalReloaded's runtime, the Nathan Drake Collection's (#138), has no run.py:
  tools/probe_<name>.py starts the game and the runtime appends each trophy list's unlocks to
  analysis/<name>-user/trophy/trophyNN.txt. Any port laid out that way is read, not only Uncharted.
*/
function runtimePort(root) {
  for (const entry of readDirectory(path.join(root, 'tools'))) {
    const probe = entry.isFile() && PROBE_SCRIPT.exec(entry.name);
    if (!probe) continue;
    const name = probe[1].toLowerCase();
    if (!isRealDirectory(path.join(root, 'analysis', `${name}-user`)) && !isRegularFile(path.join(root, 'launcher', `${name}_launcher.pyw`))) continue;
    const launcher = readDirectory(root).find((item) => item.isFile() && / launcher\.exe$/i.test(item.name));
    const games = name === 'uncharted' ? UNCHARTED_GAMES : null;
    return { port: `probe-${name}`, launcher: launcher ? launcher.name : '', settings: '', env: '', marker: '', runtime: name, games };
  }
  return null;
}

// A renamed port found beside what its former name left behind is the renamed one.
function withoutSuperseded(ports) {
  return ports.filter((port) => !ports.some((other) => other.supersedes === port.port));
}

// The port a folder holding run.py is: by its own files, then its launcher's name, then the runner.
function identifyPort(root) {
  if (!isRealDirectory(root)) return null;
  const runtime = runtimePort(root);
  if (runtime) return runtime;
  if (!isRegularFile(path.join(root, RUNNER))) return nativePort(root);
  const script = readText(path.join(root, RUNNER), MAX_SCRIPT_BYTES);
  if (!script) return null;
  const collection = packages.identifyCollection(script);
  if (collection) return collection;
  const owned = withoutSuperseded(PORTS.filter((port) => ownsPortFiles(root, port)));
  if (owned.length === 1) return owned[0];
  const candidates = owned.length > 1 ? owned : PORTS;
  const launched = withoutSuperseded(candidates.filter((port) => hasFileNamed(root, port.launcher)));
  if (launched.length === 1) return launched[0];
  if (owned.length > 1 && owned.every((port) => port.marker === owned[0].marker)) return owned[0];
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

// The first launcher settings found, JSON or INI: the port's own, then its launcher folder's.
function launcherSettings(root, port) {
  const files = [...config.localConfigFiles(root), ...(port.settings ? hostSettingsFiles(root, port.settings, port.settingsName) : [])];
  for (const file of files) {
    const values = isRegularFile(file) ? config.readConfig(file) : {};
    if (Object.keys(values).length > 0) return { file, values };
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
  if (!expression || !Object.hasOwn(bases, expression[1]) || !bases[expression[1]]) return '';
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
  const logsInData = port.port === 'generic' && RUNNER_LOGS.some((name) => isRegularFile(path.join(dataDir, name)));
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

// <title id> folders holding a trophies.tsv, whether `dir` is the game, its user or trophies folder, or one title.
function titleFolders(dir) {
  const isTitleFolder = (folder) => TITLE_ID.test(path.basename(folder)) && isRegularFile(path.join(folder, TROPHY_LIST));
  if (isTitleFolder(dir)) return [dir];
  for (const parent of [path.join(dir, 'user', 'trophies'), path.join(dir, 'trophies'), dir]) {
    const found = readDirectory(parent)
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(parent, entry.name))
      .filter(isTitleFolder);
    if (found.length > 0) return found;
  }
  return [];
}

/*
  A frozen port whose launcher keeps its data out of the program folder: PortGaGotoku-data beside
  it (Fist of the North Star), or <LOCALAPPDATA>/inFAMOUS First Light PC when it cannot write next to
  itself. The folder name is a literal of the launcher, and the folder must be a port of its own.
*/
function externalDataPort(dir) {
  if (!isRealDirectory(path.join(dir, 'scripts')) && !isRegularFile(path.join(dir, 'port', RUNNER))) return null;
  const sourced = config.launcherSources(dir).flatMap((text) => [...text.matchAll(/['"]([^'"\r\n]{1,64})['"]/g)].map((match) => match[1]));
  const names = [...new Set([...compiledLauncherStrings(dir), ...sourced])].filter((name) => /^[A-Za-z0-9][\w .-]{0,63}$/.test(name));
  const local = hostsFor(dir).map((host) => hostPath(host, 'LOCALAPPDATA')).filter(Boolean);
  for (const name of names) {
    const candidates = /-data$/i.test(name) ? [path.join(path.dirname(dir), name)] : local.map((base) => path.join(base, name)).filter((data) => isRegularFile(path.join(data, 'launcher.json')));
    for (const data of candidates) {
      const port = isRealDirectory(data) && allowedFromConfig(data, dir) ? identifyPort(data) : null;
      if (port) return { root: data, port };
    }
  }
  return null;
}

/*
  The port installs at or below a folder the user added. A port is a game of its own, never a
  library: nothing below one is searched. A package gives each port it declares, wherever it is.
*/
function findInstallations(dir) {
  const installs = [];
  const roots = new Set();
  const add = (install) => {
    const key = path.resolve(install.root).toLowerCase();
    if (!roots.has(key)) installs.push(install);
    roots.add(key);
  };
  const queue = [{ dir: path.resolve(String(dir || '')), depth: 0 }];
  let visited = 0;
  while (queue.length && visited++ < MAX_INSTALL_DIRECTORIES) {
    const current = queue.shift();
    const packaged = packages.findPackage(current.dir);
    const port = packaged.length > 0 ? null : identifyPort(current.dir) || (titleFolders(current.dir).length > 0 ? LIST_PORT : null);
    packaged.forEach(add);
    if (port) add({ root: current.dir, port });
    const external = port || packaged.length > 0 ? null : externalDataPort(current.dir);
    if (external) add(external);
    if (port || packaged.length > 0 || external) continue;
    if (current.depth >= MAX_INSTALL_DEPTH) continue;
    for (const entry of readDirectory(current.dir)) {
      if (entry.isDirectory() && !SKIP_DIRECTORIES.test(entry.name)) queue.push({ dir: path.join(current.dir, entry.name), depth: current.depth + 1 });
    }
  }
  return installs;
}

function appidOf(identity) {
  return `ps4recomp-${identity}`;
}

function launcherExe(root, port) {
  return port.launcher && hasFileNamed(root, port.launcher) ? path.join(root, port.launcher) : '';
}

/*
  One game per trophy list of the dump. A list log holds that list's unlocks only and keeps them:
  no game tag, no journal. The NP id names the game the same way whether npbind.dat is readable or not.
*/
function runtimeTargets(install, dirs, identity, sets) {
  const { root, port } = install;
  const known = new Map((port.games || []).map((entry) => [entry.slot, entry.title]));
  const exe = launcherExe(root, port);
  const key = trophyKey(root);
  return [...sets.keys()]
    .sort((a, b) => a - b)
    .map((slot) => {
      const set = sets.get(slot);
      const npcommid = identity.bindings.get(slot) || (set.trp ? recoveredNpcommid(set.trp, key) : '');
      const fallbackId = `${port.runtime}-${identity.titleId || 'game'}-${String(slot).padStart(2, '0')}`;
      const title = known.get(slot) || identity.title;
      const base = { port: port.port, installRoot: root, dumpDir: dirs.gameDir, dataDir: dirs.dataDir, userDir: dirs.userDir };
      return { appid: appidOf(npcommid || fallbackId), ...base, game: '', title, slot, npcommid, exe, logs: [listLog(slot)] };
    });
}

// A collection's games and their sets: by slot, or by each set's list title (PROTOTYPE).
function collectionGames(install, identity, sets) {
  const games = install.port.games;
  if (games.every((entry) => Number.isInteger(entry.slot))) return games.filter((entry) => sets.has(entry.slot));
  const titled = [...sets.keys()].map((slot) => ({ slot, title: schema.setTitle(install.root, sets.get(slot), identity.bindings.get(slot) || '') }));
  return packages.assignByTitle(games, titled);
}

/*
  What a record reads besides its unlock logs: progress files in its user folders, the session logs
  its launcher rotates (in a package, any log of the data folder), the logs its sources declare and,
  for PROTOTYPE, the launcher setting naming the game a session starts in.
*/
function recordSources(install, dirs, identity) {
  const { root, port } = install;
  const declared = port.packaged ? { files: [], dirs: [] } : config.declaredLogs(root, config.launcherSources(root));
  const own = [path.join(root, 'logs'), path.join(root, 'out', 'logs'), path.join(root, 'data', 'logs'), dirs.userDir && path.join(dirs.userDir, 'logs'), ...declared.dirs];
  const packaged = [dirs.dataDir && path.join(dirs.dataDir, 'logs'), dirs.logDir].filter(Boolean).map((dir) => ({ dir, anyLog: true }));
  return {
    titleId: identity.titleId,
    progressDirs: [...new Set([dirs.userDir, path.join(root, 'bin', 'user')].filter(Boolean))],
    sessionDirs: port.packaged ? packaged : [...new Set(own.filter(Boolean))],
    logFiles: declared.files,
    logDir: port.logsInRoot ? root : '',
    initial: port.initialGameKey && dirs.settingsFile ? { file: dirs.settingsFile, key: port.initialGameKey } : null,
  };
}

function gameTargets(install, dirs, identity, sets) {
  if (install.port.runtime) return runtimeTargets(install, dirs, identity, sets);
  const { root, port } = install;
  const base = { port: port.port, installRoot: root, dumpDir: dirs.gameDir, dataDir: dirs.dataDir, userDir: dirs.userDir, ...recordSources(install, dirs, identity) };
  const exe = launcherExe(root, port);
  if (port.games) {
    return collectionGames(install, identity, sets).map((entry) => {
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
  return [{ appid: appidOf(id), ...base, game: '', title: identity.title, slot, npcommid, exe, logs: RUNNER_LOGS.slice() }];
}

// One game per trophies.tsv the port wrote: its title folder is the user folder watched.
function listTargets(install, dirs) {
  const { root, port } = install;
  const folders = titleFolders(port === LIST_PORT ? root : dirs.userDir);
  const exe = launcherExe(root, port);
  return folders.flatMap((folder) => {
    const file = path.join(folder, TROPHY_LIST);
    const list = schema.readTrophyList(file);
    if (!list) return [];
    const base = { port: port.port, installRoot: root, dumpDir: dirs.gameDir, dataDir: dirs.dataDir, userDir: folder };
    return [{ appid: appidOf(path.basename(folder)), ...base, game: '', title: list.title, slot: 0, npcommid: '', exe, logs: [UNLOCKED_LIST], trophyList: file }];
  });
}

/*
  Its launcher.json ("Uncharted Launcher" for probe_uncharted.py): the shared Linux one under Wine,
  else each host's %APPDATA%.
*/
function runtimeSettings(root, name) {
  const title = name.split('_').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  const files = hostsFor(root).map((host) => hostPath(host, 'APPDATA', `${title} Launcher`, 'launcher.json'));
  if (process.platform !== 'win32') files.unshift(path.join(process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share'), `${name}-launcher`, 'launcher.json'));
  for (const file of files) {
    const values = file && isRegularFile(file) ? readSettings(file) : null;
    if (values) return values;
  }
  return {};
}

// The game folder the launcher would start: its setting, else the port's own game/<title id>/uroot.
function runtimeDirs(root, name) {
  const settings = runtimeSettings(root, name);
  const isAllowedDump = (dir) => !!dir && allowedFromConfig(dir, root) && isRegularFile(path.join(dir, 'sce_sys', 'param.sfo'));
  const linuxDir = process.platform !== 'win32' && typeof settings.game_dir_unix === 'string' && path.isAbsolute(settings.game_dir_unix) ? settings.game_dir_unix : '';
  const bundled = readDirectory(path.join(root, 'game'))
    .filter((entry) => entry.isDirectory() && TITLE_ID.test(entry.name))
    .flatMap((entry) => [path.join(root, 'game', entry.name, 'uroot'), path.join(root, 'game', entry.name)]);
  const candidates = [linuxDir, localDir(root, settings.game_dir), ...bundled];
  const dataDir = path.join(root, 'analysis', `${name}-user`);
  return { gameDir: candidates.find(isAllowedDump) || findDump(root), dataDir, userDir: path.join(dataDir, 'trophy') };
}

// A native port's game: named by its own settings, then its launcher folder's, then prepared by it.
function nativeGameDir(root) {
  const resolve = configResolver(root);
  for (const file of config.localConfigFiles(root)) {
    const dir = config.gameDirFrom(config.readConfig(file), resolve);
    if (dir) return dir;
  }
  for (const folder of launcherFolderHints(root, '')) {
    for (const file of hostSettingsFiles(root, folder).filter(isRegularFile)) {
      const dir = config.gameDirFrom(config.readConfig(file), resolve);
      if (dir) return dir;
    }
  }
  return config.preparedDumps(root)[0] || findDump(root);
}

// A user folder a local launcher setting moves (user_dir), taken back above savedata as SotC's launcher does.
function configuredUserDir(root) {
  const resolve = configResolver(root);
  for (const file of config.localConfigFiles(root)) {
    const dir = resolve(config.readConfig(file).user_dir);
    const parts = dir.split(/[\\/]/);
    const at = parts.map((part) => part.toLowerCase()).lastIndexOf('savedata');
    const folder = at > 0 ? parts.slice(0, at).join(path.sep) : dir;
    if (folder && isRealDirectory(folder)) return folder;
  }
  return '';
}

function nativeDirs(root) {
  const userDir = configuredUserDir(root) || NATIVE_USER_DIRS.map((parts) => path.join(root, ...parts)).find(isRealDirectory) || path.join(root, 'user');
  return { gameDir: nativeGameDir(root), dataDir: root, userDir };
}

// A packaged port keeps everything in its data folder, its game in the settings file there.
function packagedDirs(install) {
  const { dataDir, settingsFile } = install.port.packaged;
  const values = settingsFile && isRegularFile(settingsFile) ? config.readConfig(settingsFile) : {};
  const resolve = configResolver(install.root);
  // log_dir= moves every log of a run (GNSB's launcher); <data>/logs stays the default.
  const logDir = resolve(values.log_dir);
  return { gameDir: config.gameDirFrom(values, resolve), dataDir, userDir: dataDir ? path.join(dataDir, 'user') : '', logDir: isRealDirectory(logDir) ? logDir : '' };
}

function installDirs(install) {
  if (install.port === LIST_PORT) return { gameDir: '', dataDir: install.root, userDir: '' };
  if (install.port.runtime) return runtimeDirs(install.root, install.port.runtime);
  if (install.port.packaged) return packagedDirs(install);
  if (install.port.native) return nativeDirs(install.root);
  const script = readText(path.join(install.root, RUNNER), MAX_SCRIPT_BYTES);
  const settings = launcherSettings(install.root, install.port);
  const dirs = resolveDirs(install.root, install.port, settings.values, script);
  const gameDir = dirs.gameDir || config.gameDirFrom(settings.values, configResolver(install.root)) || findDump(install.root);
  return { ...dirs, gameDir, settingsFile: settings.file };
}

// Every game of every port at or below `dir` whose trophy list can be read: its own, else its original dump's.
function discover(dir) {
  const games = [];
  for (const install of findInstallations(dir)) {
    try {
      const dirs = installDirs(install);
      const targets = listTargets(install, dirs);
      if (targets.length > 0) {
        games.push(...targets);
        continue;
      }
      const sets = trophySets(dirs.gameDir, install.root);
      if (sets.size === 0) {
        debug.log(`[ps4recomp] '${install.root}': no trophy data, the launcher must point at the original game`);
        continue;
      }
      games.push(...gameTargets(install, dirs, schema.dumpIdentity(dirs.gameDir), sets));
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

// The logs a record reads: the collection's only carries its game in last_run.log; a single game's last_run.log may be rotated.
function logNames(info) {
  const wanted = Array.isArray(info.logs) ? info.logs : info.game ? [LAST_RUN_LOG] : RUNNER_LOGS;
  const rotated = !info.game && wanted.includes(LAST_RUN_LOG) ? ROTATED_LOGS : [];
  return [...wanted, ...rotated].filter((name) => LOG_FILES.includes(name));
}

/*
  last_run.log is rewritten every session, launchers prune their session logs, and many ports keep
  no other record of their unlocks: what was once read is kept in a small journal of its own,
  merged into every read.
*/
function rememberUnlocks(appid, unlocked) {
  const file = journalFile(appid);
  let stored = {};
  try {
    const parsed = JSON.parse(readText(file, formats.MAX_SMALL_BYTES) || '{}');
    if (parsed && parsed.unlocked && typeof parsed.unlocked === 'object') stored = parsed.unlocked;
  } catch (err) {
    debug.warn(`[ps4recomp] unreadable unlock journal '${file}', starting it again: ${err}`);
    stored = {};
  }
  const merged = new Map(Object.entries(stored).filter(([id, time]) => /^\d{1,4}$/.test(id) && Number.isFinite(time)));
  const grew = [...unlocked.keys()].some((id) => !merged.has(id));
  for (const [id, time] of unlocked) if (!merged.has(id) || (time > 0 && !(merged.get(id) > 0))) merged.set(id, time);
  if (grew) {
    try {
      writeFileAtomicSync(file, JSON.stringify({ unlocked: Object.fromEntries(merged) }));
    } catch (err) {
      debug.warn(`[ps4recomp] could not keep the unlocks of ${appid}: ${err}`);
    }
  }
  return merged;
}

const toEntries = (map) => [...map].map(([id, time]) => ({ id, time }));
const listed = (value) => (Array.isArray(value) ? value : []);

// The game PROTOTYPE's launcher was told to start ("p1"), read when its log names none.
function initialGame(info) {
  const initial = info.initial;
  if (!initial || typeof initial.file !== 'string' || typeof initial.key !== 'string') return '';
  const value = String(config.readConfig(initial.file)[initial.key] || '').toLowerCase();
  return /^[a-z]{1,3}\d{1,2}$/.test(value) ? value : '';
}

// The unlocks of one log, of this record's game when the log is a collection's.
function logUnlocks(info, file, lines) {
  const name = path.basename(file).toLowerCase();
  const parsed = isRunLog(name) || !LOG_FILES.includes(name) ? logs.parseLastRunLog(lines, { port: info.port, initial: initialGame(info) }) : logs.parseLog(name, lines);
  return parsed.filter((unlock) => !info.game || unlock.game === info.game);
}

// { unlocked, unstable } of the given log files.
function readLogFiles(info, files) {
  const unlocked = new Map();
  let unstable = false;
  for (const file of new Set(files.map(String))) {
    const read = logs.readLog(file);
    if (read.unstable) unstable = true;
    progress.mergeInto(unlocked, logUnlocks(info, file, read.lines));
  }
  return { unlocked, unstable };
}

/*
  { unlocked: Map(id -> unix seconds, 0 when unknown), unstable }. `unstable` says a log was being
  rewritten: what it held is left out of this read and must be read again. last_run logs, rotated
  and declared logs go through the journal; a collection game's whole read does.
*/
function readUnlocks(data) {
  const info = data && typeof data === 'object' ? data : {};
  if (!info.userDir) return { unlocked: new Map(), unstable: false };
  const names = logNames(info);
  const inLogDir = (list) => list.map((name) => path.join(String(info.logDir || info.userDir), name));
  const own = readLogFiles(info, inLogDir(names.filter((name) => !isRunLog(name))));
  const runLogs = inLogDir(names.filter(isRunLog));
  const session = readLogFiles(info, [...runLogs, ...progress.sessionLogs(info), ...listed(info.logFiles)]);
  const unstable = own.unstable || session.unstable;
  if (info.game) {
    const read = progress.mergeInto(own.unlocked, toEntries(session.unlocked));
    return { unlocked: info.appid ? rememberUnlocks(info.appid, read) : read, unstable };
  }
  const saved = progress.readProgress(info);
  if (saved.rejected.length > 0) debug.log(`[ps4recomp] ${info.appid}: ignored progress files of another game: ${saved.rejected.join(', ')}`);
  progress.mergeInto(own.unlocked, toEntries(saved.unlocked));
  const journaled = info.appid && (runLogs.length > 0 || listed(info.sessionDirs).length > 0 || listed(info.logFiles).length > 0);
  progress.mergeInto(own.unlocked, toEntries(journaled ? rememberUnlocks(info.appid, session.unlocked) : session.unlocked));
  return { unlocked: own.unlocked, unstable: unstable || saved.unstable };
}

function getAchievements(data) {
  let read = readUnlocks(data);
  if (read.unstable) read = readUnlocks(data);
  return [...read.unlocked].map(([id, earned_time]) => ({ id, achieved: true, earned_time }));
}

// The trophy list and art of a record (ps4RecompSchema.js), its icons in this side's cache.
function getGameData(data, lang = 'english') {
  return schema.getGameData(data, lang, iconDirFor);
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
module.exports.isProgressName = progress.isProgressName;
module.exports._internal = { PORTS, identifyPort, resolveDirs, scriptDefault, parseExtraEnv, launcherSettings, trophySets, findDump, journalFile };
