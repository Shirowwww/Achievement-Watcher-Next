'use strict';

const path = require('path');
const fs = require('fs');
const coverStore = require('./coverStore.js');
const gameIconStore = require('./gameIconStore.js');

// userData folders holding only re-fetchable content (Steam/GOG/Epic/SteamDB/SteamGridDB APIs,
// GitHub downloads). Mirrors the disposable-cache classification in util/migrateUserData.js
// (MIGRATION_PLAN) - re-check that file before adding an entry here.
//
// Never add: cache/uplayR2 (user-seeded dll, no download source), backups (GBE restore points),
// or cfg/covers/gameIcons/presets/theme-images/epic_tokens.enc/lockfile (user settings/content).
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
  // Older builds cached custom covers under steam_cache while covers.db kept a permanent
  // reference; promote them to covers/ before this cache is wiped, so a failed copy aborts
  // before anything is deleted. A picked game icon can sit in that same cache (the picker's
  // SteamGridDB tiles download there), so it gets the same promotion.
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
    await fs.promises.rm(full, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
    cleared.push(rel);
  }
  return cleared;
}

module.exports = { SAFE_CACHE_DIRS, clearSafeCaches };
