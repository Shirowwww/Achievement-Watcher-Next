'use strict';

const path = require('path');

/*
  Where each downloaded or user-seeded emulator tool is kept under the user data folder. The
  installers, the cache cleaner, the profile backup and the data migration all name these folders,
  so they read them here.
*/
const TOOL_CACHE_DIRS = Object.freeze({
  gbeFork: 'cache/gse_fork',
  emuConfig: 'cache/gse_emu_config',
  steamless: 'cache/steamless',
  crackfiles: 'cache/crackfiles',
  apiCheckBypass: 'cache/api_check_bypass',
  uplayR2: 'cache/uplayR2',
  gogUniverseLan: 'cache/gog_universelan',
});

function toolCacheDir(userData, tool) {
  const rel = TOOL_CACHE_DIRS[tool];
  if (!rel) throw new Error(`unknown tool cache: ${tool}`);
  return path.join(userData, rel);
}

module.exports = { TOOL_CACHE_DIRS, toolCacheDir };
