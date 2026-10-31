'use strict';

/*
  What the Xbox 360 recomp modules share: the source's names, the logger, where the caches live, the
  directory reader and the port folders tests hand in. Every piece of the parser's mutable state is
  here, so a setter called on x360Recomp.js reaches all of its modules.
*/

const fs = require('fs');
const os = require('os');
const path = require('path');
const ports = require(path.join(__dirname, 'x360Ports.js'));

const SOURCE = 'Xbox 360 Recomp';
const TYPE = 'x360recomp';
const TITLE_ID_RE = /^[0-9A-F]{8}$/i;

let logger = { log() {}, warn() {}, error() {} };
// One object for every module to keep: initDebug() changes what it writes to, not the object.
const debug = {
  log: (message) => logger.log(message),
  warn: (message) => logger.warn(message),
  error: (message) => logger.error(message),
};

function initDebug({ isDev, userDataPath }) {
  logger = new (require(path.join(__dirname, '..', 'util', 'logger.js')))({
    console: isDev || false,
    file: path.join(userDataPath, 'logs/parser.log'),
  });
}

// Resolved on first use and overridable: the Watchdog loads this module and finds userData its own way.
let _dataRoot = '';
function dataRoot() {
  if (!_dataRoot) {
    const { userDataDir } = require(path.join(__dirname, '..', 'util', 'userDataPath.js'));
    _dataRoot = userDataDir();
  }
  return _dataRoot;
}

function setDataRoot(dir) {
  _dataRoot = dir ? path.resolve(String(dir)) : '';
}

const cacheFile = (name) => path.join(dataRoot(), 'steam_cache', TYPE, name);
const schemaCacheFile = (titleId) => cacheFile(`${titleId}.json`);
const spaCacheFile = (titleId) => cacheFile(`${titleId}.spa`);
const xexIndexFile = () => cacheFile('xex-index.json');
const titleCacheFile = (titleId) => cacheFile(`title-${titleId}.json`);
const identityCacheFile = (key) => cacheFile(`identity-${key}.json`);
const iconDirFor = (titleId) => path.join(dataRoot(), 'icon_cache', TYPE, titleId);

const readAll = (dir) => fs.readdirSync(dir, { withFileTypes: true });
let listDirectory = readAll;

function readDirectory(dir) {
  try {
    return listDirectory(dir) || [];
  } catch {
    return [];
  }
}

// The app passes its scan-scoped directory cache, so this walk is memoised and fingerprinted like the others.
function setDirectoryReader(reader) {
  listDirectory = typeof reader === 'function' ? reader : readAll;
}

function writeAtomic(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, content);
  fs.renameSync(temporary, file);
}

let portFolders = null;
/*
  Tests hand in their own Documents, APPDATA, LOCALAPPDATA, registry and, for the Linux builds, a
  platform and { home, env }; the app and the Watchdog ask the hosts.
*/
function setPortFolders(folders) {
  portFolders = folders || null;
}

const getPortFolders = () => portFolders;
const onLinux = () => ((portFolders && portFolders.platform) || process.platform) !== 'win32';

function linuxFolders() {
  const { home = os.homedir(), env = process.env } = (portFolders && portFolders.linux) || {};
  return ports.xdgFolders({ home, data: env.XDG_DATA_HOME, config: env.XDG_CONFIG_HOME });
}

function slug(text) {
  return String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'game';
}

const appidOf = (target) => `x360-${target.titleId || slug(target.folder)}`;

// For the life of the process: a default.xex's title id by path|size|mtime.
const titleIdCache = new Map();

module.exports = {
  SOURCE,
  TYPE,
  TITLE_ID_RE,
  debug,
  initDebug,
  dataRoot,
  setDataRoot,
  schemaCacheFile,
  spaCacheFile,
  xexIndexFile,
  titleCacheFile,
  identityCacheFile,
  iconDirFor,
  readDirectory,
  setDirectoryReader,
  writeAtomic,
  setPortFolders,
  getPortFolders,
  onLinux,
  linuxFolders,
  slug,
  appidOf,
  titleIdCache,
};
