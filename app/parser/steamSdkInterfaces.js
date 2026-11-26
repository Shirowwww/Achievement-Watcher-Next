'use strict';

/*
  The interface versions of a game built against Steamworks SDK 1.32 to 1.36, named by its steam_api
  dll's flat API. A crack's runtime replaces Valve's dll but has to export what the game links to, so
  its flat API is the one of the SDK the game was built with (RELOADED's on D4: Dark Dreams Don't Die
  exports 1.33's exactly, while its version strings are encrypted). Only an exact match counts: a
  dll whose flat API is no release's, or several releases' with different versions, names nothing.
  The table comes from tools/steam/sdk-interfaces.js.
*/

const crypto = require('crypto');
const path = require('path');
const pe = require(path.join(__dirname, '..', 'util', 'pe.js'));

// Loaded on first use: tools/steam/sdk-interfaces.js shares flatApiHash before the table exists.
let bundledTable = null;
const loadTable = () => bundledTable || (bundledTable = require(path.join(__dirname, '..', 'assets', 'steam-sdk-interfaces.json')));

// One hash for the set of flat-API calls a dll exports; the table and the lookup must agree on it.
function flatApiHash(names) {
  const flat = [...new Set(names.filter((name) => name.startsWith('SteamAPI_I')))].sort();
  return flat.length > 0 ? crypto.createHash('sha256').update(flat.join('\n')).digest('hex') : '';
}

// { sdk, interfaces } for the SDK release whose flat API `file` exports, or null.
function identify(file, table = loadTable()) {
  const hash = flatApiHash(pe.readExportNames(file));
  if (!hash) return null;
  const entry = table.sdks.find((sdk) => sdk.flatApi === hash);
  return entry ? { sdk: entry.sdk.join('/'), interfaces: [...entry.interfaces] } : null;
}

module.exports = { identify, flatApiHash };
