'use strict';

/*
  Smart Find's expensive discovery and folder checks, kept separate from the renderer.
  This helper returns results in the original order; the caller still owns the UI
  and any saved configuration.
*/
async function discoverSmartFolders({ userDir, libraryDirs }) {
  const saveEntries = [];
  for (const entry of await userDir.findEntries()) {
    const dir = entry.path || entry;
    saveEntries.push({ entry, accepted: await userDir.check(dir) });
  }
  return { saveEntries, libraryEntries: await libraryDirs.findEntries() };
}

module.exports = { discoverSmartFolders };
