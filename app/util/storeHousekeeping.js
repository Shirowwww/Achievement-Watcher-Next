'use strict';

const path = require('path');
const { dedupeTree } = require('./dedupeStore.js');
const { backupRoot } = require('./gbeBackup.js');
const { DERIVED_NAME } = require('./themeImages.js');
const { themeImagesDir } = require('./themeLayers.js');
const { recompressArtwork } = require('./artworkRecompress.js');
const { pruneGeneratedOutputs } = require('../parser/genEmuConfig.js');

/*
  Once per start, off the startup path: give back the space the write-once stores waste.

  Measured on one profile: the GBE restore points held 514 MB for 49 MB of distinct content, the
  theme pictures 204 MB for 41 MB, the generator outputs 109 MB of emulator copies nothing reads, and
  140 store banners 104 MB as PNG. New restore points and generator runs clean up after themselves;
  this covers what older versions left behind, artwork downloaded since the last start, and anything
  an interrupted run did not get to.
*/
async function tidyUserDataStores(userDataPath, { log, nativeImage }) {
  const backups = await dedupeTree(backupRoot(userDataPath), { log });
  // Only the imported pictures: the blur and veil copies are regenerated in place.
  const themes = await dedupeTree(themeImagesDir(userDataPath), { accept: (file) => !DERIVED_NAME.test(file), log });
  const outputs = pruneGeneratedOutputs(path.join(userDataPath, 'cache', 'gse_emu_config'));
  const artwork = await recompressArtwork(path.join(userDataPath, 'steam_cache', 'icon'), nativeImage);

  const freedMb = Math.round((backups.savedBytes + themes.savedBytes + artwork.savedBytes) / 1048576);
  if (backups.linked + themes.linked + outputs + artwork.files > 0) {
    log.log(
      `[housekeeping] ${backups.linked + themes.linked} identical file(s) now share one copy, ` +
        `${artwork.files} banner(s) re-encoded, ${outputs} generator output(s) trimmed: ${freedMb} MB freed`
    );
  }
  return { backups, themes, outputs, artwork };
}

module.exports = { tidyUserDataStores };
