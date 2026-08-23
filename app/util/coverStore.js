'use strict';

// Per-appid cover-art overrides: a JSON map { "<appid>": "<file:// or http(s) url>" } in
// cfg/covers.db, taking precedence over the normal Steam/emulator cover. Downloaded picks are
// stored as their remote URL (not copied), so steam_cache stays disposable.
//
// The storage itself is generic (see imageOverrideStore.js); this file only pins the cover
// instance's identity - its cfg file, its durable folder and the CDN a legacy cached pick can be
// rebuilt into. gameIconStore.js is the same machinery for the square game logo.

const { createImageOverrideStore } = require('./imageOverrideStore.js');

module.exports = createImageOverrideStore({
  fileName: 'covers.db',
  folder: 'covers',
  // SteamGridDB grid URLs use the content hash as their filename, so an old cached pick can be
  // turned back into the exact remote selection it came from.
  recoverPrefix: 'https://cdn2.steamgriddb.com/grid/',
});
