'use strict';

const { mapLimit } = require('./onboardingDetect.js');

// Folder checks are a handful of directory listings each: a few at once, not one disk queue each.
const CHECK_CONCURRENCY = 6;

/*
  Smart Find's walks and folder checks, with nothing of the window in them, so the scan host can
  run them. Both searches run together; the save folders come back in the order they were found,
  each with the verdict of userDir.check(). A folder whose check fails is refused with the reason,
  so one unreadable folder does not cost the others. The caller owns the lists and what is saved.
*/
async function discoverSmartFolders({ userDir, libraryDirs }) {
  const [found, libraryEntries] = await Promise.all([userDir.findEntries(), libraryDirs.findEntries()]);
  const saveEntries = await mapLimit(found, CHECK_CONCURRENCY, async (entry) => {
    try {
      return { entry, accepted: await userDir.check(entry.path) };
    } catch (err) {
      return { entry, accepted: false, error: String((err && err.message) || err) };
    }
  });
  return { saveEntries, libraryEntries };
}

module.exports = { discoverSmartFolders };
