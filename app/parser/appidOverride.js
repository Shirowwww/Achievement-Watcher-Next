'use strict';

// Per-install manual override for the Steam appid an unconfigured Goldberg/GBE install resolves to,
// for a game folder whose name matches more than one Steam release (fuzzyAppid.js only sees the
// folder name and cannot tell them apart). Stored in a small JSON next to options.ini, keyed by the
// game's install folder rather than by appid - the whole point is to skip the guess before one exists.

const fs = require('fs');
const path = require('path');

let cfgDir = null;
module.exports.setUserDataPath = (p) => {
  if (p) cfgDir = path.join(p, 'cfg');
};

function file() {
  return path.join(cfgDir || '', 'appidOverride.json');
}

function key(gameDir) {
  return path.resolve(String(gameDir || '')).toLowerCase();
}

// `strict` is for a read followed by a write: a store that exists but cannot be read (locked,
// EPERM) must not be replaced by a map holding a single entry.
function read({ strict = false } = {}) {
  let text;
  try {
    text = fs.readFileSync(file(), 'utf8');
  } catch (err) {
    if (strict && err.code !== 'ENOENT') throw err;
    return {};
  }
  try {
    const obj = JSON.parse(text);
    return obj && typeof obj === 'object' && !Array.isArray(obj) ? obj : {};
  } catch {
    return {};
  }
}

function write(map) {
  fs.mkdirSync(path.dirname(file()), { recursive: true });
  fs.writeFileSync(file(), JSON.stringify(map), 'utf8');
}

// Returns the overridden appid (string) for this game folder, or null when there is none.
module.exports.get = (gameDir) => {
  const value = read()[key(gameDir)];
  return /^[0-9]+$/.test(String(value)) ? String(value) : null;
};

// appid: a numeric Steam appid forces that value; anything else (e.g. null for "Automatic") clears it.
module.exports.set = (gameDir, appid) => {
  const map = read({ strict: true });
  const mapKey = key(gameDir);
  if (/^[0-9]+$/.test(String(appid))) map[mapKey] = String(appid);
  else delete map[mapKey];
  write(map);
};
