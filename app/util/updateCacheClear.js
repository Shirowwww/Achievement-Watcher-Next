'use strict';

const fs = require('fs');

// Wipes an electron-updater download-cache directory: `.clear()` resets the helper's in-memory
// record (and empties pending/), then this removes everything else under `.cacheDir` too -
// including the differential-download base file and current.blockmap that `.clear()` alone
// doesn't touch. Takes the helper instance rather than recomputing the path, so this stays
// correct if electron-updater ever changes its cache layout.
async function clearUpdaterCacheDir(helper, { onHelperClearError } = {}) {
  const cacheDir = helper.cacheDir;
  try {
    await helper.clear();
  } catch (err) {
    if (onHelperClearError) onHelperClearError(err);
  }
  await fs.promises.rm(cacheDir, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
  return cacheDir;
}

module.exports = { clearUpdaterCacheDir };
