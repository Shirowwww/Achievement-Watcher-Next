'use strict';

// Per-game manual override for which emulator family the context menu offers ('steam' or 'ubisoft'),
// for Ubisoft repacks where the on-disk heuristic guesses wrong. Stored in a small JSON next to
// options.ini and read/written only by the renderer's context menu.

const fs = require('fs');
const path = require('path');

let cfgDir = null;
module.exports.setUserDataPath = (p) => {
  if (p) cfgDir = path.join(p, 'cfg');
};

function file() {
  return path.join(cfgDir || '', 'emulatorSourceOverride.json');
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

// Returns 'steam' | 'ubisoft' | null (null = no override, fall back to auto-detection).
module.exports.get = (appid) => {
  const value = read()[String(appid)];
  return value === 'steam' || value === 'ubisoft' ? value : null;
};

// value: 'steam' | 'ubisoft' forces that source; anything else (e.g. null for "Automatic") clears it.
module.exports.set = (appid, value) => {
  const map = read({ strict: true });
  const key = String(appid);
  if (value === 'steam' || value === 'ubisoft') map[key] = value;
  else delete map[key];
  write(map);
};
