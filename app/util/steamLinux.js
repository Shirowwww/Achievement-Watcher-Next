'use strict';

/*
  The Linux Steam client, read from its own files: the install folder (native, Flatpak or Snap) and
  registry.vdf, where it keeps the tree the Windows client writes to HKCU\Software\Valve\Steam
  (Apps\<appid>\Installed, ActiveProcess\pid). Loaded by the Watchdog through steamLibrary.js, so it
  stays free of app code but util/winePrefixes.js (unpacked as well).
*/

const fs = require('fs');
const os = require('os');
const path = require('path');
const { steamRoots } = require(path.join(__dirname, 'winePrefixes.js'));

const FLATPAK_HOME = ['.var', 'app', 'com.valvesoftware.Steam'];

// Text KeyValues: quoted or bare tokens, braces, `//` comments. A repeated key keeps its last value.
function parseTextVdf(text) {
  const tokens = [];
  const re = /"((?:[^"\\]|\\.)*)"|(\{)|(\})|\/\/[^\n]*|([^\s"{}]+)/g;
  let m = null;
  while ((m = re.exec(String(text || '')))) {
    if (m[2] || m[3]) tokens.push({ brace: m[2] || m[3] });
    else if (m[1] !== undefined) tokens.push({ text: m[1].replace(/\\(.)/g, (_, c) => ({ n: '\n', t: '\t' })[c] || c) });
    else if (m[4] !== undefined) tokens.push({ text: m[4] });
  }
  let at = 0;
  const readMap = () => {
    const map = {};
    while (at < tokens.length) {
      const token = tokens[at++];
      if (token.brace === '}') return map;
      if (token.brace) continue;
      const next = tokens[at];
      if (!next) break;
      at++;
      if (next.brace === '{') map[token.text] = readMap();
      else if (next.text !== undefined && !/^\[.*\]$/.test(next.text)) map[token.text] = next.text;
      // `[$WIN32]`-style conditions follow a value; they do not start a key.
      if (tokens[at] && /^\[.*\]$/.test(tokens[at].text || '')) at++;
    }
    return map;
  };
  return readMap();
}

function child(node, name) {
  if (!node || typeof node !== 'object') return undefined;
  const key = Object.keys(node).find((candidate) => candidate.toLowerCase() === String(name).toLowerCase());
  return key === undefined ? undefined : node[key];
}

function isDir(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

// What the bootstrapper unpacks into every install, native, Flatpak or Snap alike.
function isSteamClientDir(dir) {
  return Boolean(dir) && (fs.existsSync(path.join(dir, 'steam.sh')) || isDir(path.join(dir, 'ubuntu12_32')));
}

function realDir(dir) {
  try {
    return fs.realpathSync(dir);
  } catch {
    return '';
  }
}

function context({ env = process.env, home = os.homedir() } = {}) {
  return { env, home };
}

function registryFile(root, { home }) {
  const flatpak = path.join(home, ...FLATPAK_HOME);
  const base = root && root.startsWith(flatpak + path.sep) ? flatpak : home;
  return path.join(base, '.steam', 'registry.vdf');
}

const registryCache = new Map();

// The HKCU\Software\Valve\Steam node of one registry.vdf, re-read only when the file changes.
function readSteamNode(file) {
  let stat;
  try {
    stat = fs.statSync(file);
  } catch {
    registryCache.delete(file);
    return null;
  }
  const cached = registryCache.get(file);
  if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) return cached.node;
  let node = null;
  try {
    const tree = parseTextVdf(fs.readFileSync(file, 'utf8'));
    node = ['Registry', 'HKCU', 'Software', 'Valve', 'Steam'].reduce(child, tree) || null;
  } catch {
    node = null;
  }
  registryCache.set(file, { mtimeMs: stat.mtimeMs, size: stat.size, node });
  return node;
}

/*
  The client's folder, or '' when none is installed. Steam keeps ~/.steam/root and ~/.steam/steam
  pointed at the install it last ran, so those win over the other places one can sit.
*/
function steamClientRoot(options) {
  const ctx = context(options);
  const candidates = [path.join(ctx.home, '.steam', 'root'), path.join(ctx.home, '.steam', 'steam'), ...steamRoots(ctx)];
  for (const candidate of candidates) {
    const dir = realDir(candidate);
    if (isSteamClientDir(dir)) return dir;
  }
  return '';
}

/*
  HKCU\Software\Valve\Steam with the reg.js answers: `sub` is a slash path under that key ('' for the
  key itself, 'Apps/730'), and every value is a string in the file, so integers are parsed here.
*/
function steamRegistry(options) {
  const ctx = context(options);
  const node = (sub) => {
    const root = readSteamNode(registryFile(steamClientRoot(ctx), ctx));
    return String(sub || '').split('/').filter(Boolean).reduce(child, root);
  };
  const isMap = (value) => Boolean(value) && typeof value === 'object';
  return {
    exists: (sub) => {
      const found = node(sub);
      return isMap(found) && Object.keys(found).length > 0;
    },
    subkeys: (sub) => {
      const found = node(sub);
      return isMap(found) ? Object.keys(found).filter((key) => isMap(found[key])) : [];
    },
    integer: (sub, name) => {
      const value = child(node(sub), name);
      return typeof value === 'string' && /^-?\d+$/.test(value.trim()) ? Number(value) : null;
    },
    string: (sub, name) => {
      const value = child(node(sub), name);
      return typeof value === 'string' ? value : null;
    },
  };
}

// The running client's pid, 0 when there is none. registry.vdf has no ActiveProcess on Linux and its
// HKLM SteamPID can name a process Steam already restarted from; steam.pid sits next to it.
function steamClientPid(options) {
  const ctx = context(options);
  const file = path.join(path.dirname(registryFile(steamClientRoot(ctx), ctx)), 'steam.pid');
  try {
    return Number(fs.readFileSync(file, 'utf8').trim()) || 0;
  } catch {
    return 0;
  }
}

module.exports = { parseTextVdf, isSteamClientDir, steamClientRoot, steamRegistry, steamClientPid, registryFile };
