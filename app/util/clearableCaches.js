'use strict';

const path = require('path');
const fs = require('fs');
const coverStore = require('./coverStore.js');
const gameIconStore = require('./gameIconStore.js');

// Re-fetchable content only; mirrors the disposable-cache list in migrateUserData.js
// (MIGRATION_PLAN), check there before adding an entry. Never add user-owned content
// (uplayR2, backups, cfg/covers/gameIcons/presets/theme-images/epic_tokens.enc/lockfile).
// cache/gse_fork/custom is a user-imported dll with no download source, kept out below.
const PRESERVED_CACHE_CHILDREN = { 'cache/gse_fork': ['custom'] };

const SAFE_CACHE_DIRS = [
  'steam_cache', // Steam/GOG/Epic/SteamDB/SteamGridDB schema, icon, cover and rarity cache
  'uplay_cache', // Ubisoft Connect schema + icon cache
  'cache/gse_fork', // downloaded GBE Fork (Detanup01/gbe_fork) steam_api dlls
  'cache/gse_emu_config', // downloaded generate_emu_config tool (alex47exe/gse_fork_tools)
  'cache/steamless', // downloaded Steamless (atom0s/Steamless)
  'cache/crackfiles', // downloaded crackfiles.json (KoriaPolis/CrakFiles)
  'cache/api_check_bypass', // downloaded Steam-API-Check-Bypass proxy dlls
  'cache/library_snapshot', // derived last-complete library used only for fast first paint
  'cache/discovery', // memoized install-folder walks; rebuilt by the next scan
];

// A missing folder isn't an error - most users have touched only some of these sources.
async function clearSafeCaches(userDataDir) {
  // Promote any custom cover/icon still cached under steam_cache into its durable store before
  // wiping it, so a failed copy aborts before deletion (game icons land there too, via the picker).
  coverStore.preserveCachedOverrides(userDataDir);
  gameIconStore.preserveCachedOverrides(userDataDir);
  const cleared = [];
  for (const rel of SAFE_CACHE_DIRS) {
    const full = path.join(userDataDir, rel);
    let existed = false;
    try {
      await fs.promises.access(full);
      existed = true;
    } catch {
      existed = false;
    }
    if (!existed) continue;
    const preserved = PRESERVED_CACHE_CHILDREN[rel];
    if (preserved) {
      for (const child of await fs.promises.readdir(full)) {
        if (preserved.includes(child.toLowerCase())) continue;
        await fs.promises.rm(path.join(full, child), { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
      }
    } else {
      await fs.promises.rm(full, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
    }
    cleared.push(rel);
  }
  return cleared;
}

module.exports = { SAFE_CACHE_DIRS, PRESERVED_CACHE_CHILDREN, clearSafeCaches };
