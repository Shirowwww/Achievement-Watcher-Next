'use strict';

const fs = require('fs');
const path = require('path');
const { userDataDir } = require('./userData.js');
const { sharedAppModulePath } = require('./sharedAppModule.js');
const { writeFileAtomicSync } = require(sharedAppModulePath('util/replaceFile.js'));
const { consoleBaselineDir, baselineFileName } = require(sharedAppModulePath('util/dataLayout.js'));

/*
  The unlock baseline each live watcher diffs against, in one place.

  Seven watchers - ShadPS4, RPCS3, Xenia, XLiveLessNess, EA, GOG and Ubisoft - each carried their own
  copy of the same three functions: name a file after the game, read the list of ids already seen,
  write it back. The copies were identical apart from a filename prefix and a log tag, which is how
  the same fix ends up in one of them and not the other six.

  The write is atomic here, which none of the copies were: a baseline truncated by a crash or a full
  disk reads back as "this game has nothing unlocked yet", and every achievement already earned is
  then announced again.
*/
const CACHE_DIR = consoleBaselineDir(userDataDir());

/*
  `prefix` keeps one watcher's files apart from another's in the shared folder. ShadPS4 passes none,
  because its files were written without one before this existed and are still read.
*/
function createBaselineCache({ prefix = '', tag = prefix || 'watch', dir = CACHE_DIR, debug } = {}) {
  const fileFor = (key) => path.join(dir, baselineFileName(prefix, key));

  return {
    file: fileFor,

    // null means "never seen", which is what tells a first sight from a game with nothing unlocked.
    load(key) {
      try {
        return JSON.parse(fs.readFileSync(fileFor(key), 'utf8'));
      } catch {
        return null;
      }
    },

    save(key, unlocked) {
      try {
        writeFileAtomicSync(fileFor(key), JSON.stringify({ unlocked: Array.from(unlocked || []) }));
      } catch (err) {
        debug?.warn?.(`[${tag}] cache save failed for ${key}: ${err}`);
      }
    },
  };
}

module.exports = { createBaselineCache, CACHE_DIR };
