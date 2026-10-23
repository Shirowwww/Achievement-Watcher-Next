'use strict';

/*
  How a game's cover sits in its library tile when the picture does not have the tile's shape:
  'fill' covers the tile and crops the edges (the default, never stored), 'contain' shows the whole
  picture over a blurred copy of itself, 'stretch' squeezes it to the tile. One choice per
  orientation, like the covers themselves: cfg/coverFit.json { "<appid>": { portrait, landscape } }.
*/

const fs = require('fs');
const path = require('path');
const { userDataDir } = require('./userDataPath.js');
const { writeFileAtomicSync } = require('./replaceFile.js');

const FITS = Object.freeze(['fill', 'contain', 'stretch']);
const DEFAULT_FIT = 'fill';
const ORIENTATIONS = new Set(['portrait', 'landscape']);

let storeFile = null;

function file() {
  return storeFile || path.join(userDataDir(), 'cfg', 'coverFit.json');
}

function setStoreFile(target) {
  storeFile = target || null;
}

// Anything unreadable or out of range is "no choice": a damaged file must never hide a cover.
function readAll() {
  try {
    const map = JSON.parse(fs.readFileSync(file(), 'utf8'));
    return map && typeof map === 'object' && !Array.isArray(map) ? map : {};
  } catch {
    return {};
  }
}

function get(appid, orientation) {
  const entry = readAll()[String(appid)];
  const fit = entry && typeof entry === 'object' ? entry[orientation] : null;
  return FITS.includes(fit) ? fit : DEFAULT_FIT;
}

// False when the request is not one this store can hold; nothing is written then.
function set(appid, orientation, fit) {
  const id = String(appid || '').trim();
  if (!id || !ORIENTATIONS.has(orientation) || !FITS.includes(fit)) return false;
  const map = readAll();
  const entry = { ...(map[id] && typeof map[id] === 'object' ? map[id] : {}) };
  if (fit === DEFAULT_FIT) delete entry[orientation];
  else entry[orientation] = fit;
  const next = { ...map };
  if (Object.keys(entry).length) next[id] = entry;
  else delete next[id];
  fs.mkdirSync(path.dirname(file()), { recursive: true });
  writeFileAtomicSync(file(), JSON.stringify(next, null, 2));
  return true;
}

module.exports = { FITS, DEFAULT_FIT, get, set, readAll, setStoreFile };
