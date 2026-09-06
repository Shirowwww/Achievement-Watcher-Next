'use strict';

const path = require('path');
const { userDataDir } = require('./userData.js');
const { createIndexedGameLookup } = require('./indexedGameLookup.js');

/*
  The executable the library resolved for a game (cfg/exeList.db), which is what points a card's
  Play button at the install folder. The game index only stores a binary NAME, so this is the one
  place a full path lives outside the renderer - and the way to tell two games apart when both
  ship an executable of the same name.
*/
const lookups = new Map();

function lookupFor(file) {
  let lookup = lookups.get(file);
  if (!lookup) {
    lookup = createIndexedGameLookup({ getFiles: () => [file] });
    lookups.set(file, lookup);
  }
  return lookup;
}

function defaultFile() {
  return path.join(userDataDir(), 'cfg', 'exeList.db');
}

function configuredExecutable(appid, { file = defaultFile() } = {}) {
  const id = String(appid == null ? '' : appid).trim();
  if (!id) return '';
  const entry = lookupFor(file)(id);
  return entry && entry.exe ? String(entry.exe) : '';
}

module.exports = { configuredExecutable };
