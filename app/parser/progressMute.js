'use strict';

// Per-game progress-notification mute store. A small JSON array of appids living next to options.ini
// (<userData>/cfg/progressMute.json). The renderer toggles it from the game context menu; the Watchdog
// asks it on every progress event, so a read is reused for 2 s and a toggle shows within that.

const fs = require('fs');
const path = require('path');

const CACHE_MS = 2000;

let cfgDir = null;
let cache = { at: 0, set: new Set() };

module.exports.setUserDataPath = (p) => {
  if (!p) return;
  cfgDir = path.join(p, 'cfg');
  cache = { at: 0, set: new Set() };
};

function file() {
  return path.join(cfgDir || '', 'progressMute.json');
}

function read() {
  try {
    const a = JSON.parse(fs.readFileSync(file(), 'utf8'));
    return new Set((Array.isArray(a) ? a : []).map(String));
  } catch {
    return new Set();
  }
}

function muted() {
  const now = Date.now();
  if (now - cache.at > CACHE_MS) cache = { at: now, set: read() };
  return cache.set;
}

module.exports.isMuted = (appid) => Boolean(appid) && muted().has(String(appid));

module.exports.toggle = (appid) => {
  const set = read();
  const key = String(appid);
  if (set.has(key)) set.delete(key);
  else set.add(key);
  try {
    fs.mkdirSync(path.dirname(file()), { recursive: true });
    fs.writeFileSync(file(), JSON.stringify([...set]), 'utf8');
  } catch {
    /* best-effort: a failed write just leaves the previous state */
  }
  cache = { at: Date.now(), set: read() };
  return set.has(key);
};
