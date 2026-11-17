'use strict';

/*
  Converts anadius' native achievement-<set>.xml into the achievement_watcher export when it
  changes, from the name map the last library scan stored. It never notifies: the save root watch on
  achievement_watcher sees the export change and notifies as for any emulator save.
*/

const fs = require('fs');
const path = require('path');
const debug = require('../util/log.js');
const kit = require('./watcherKit.js');
const waitForFileStable = require('../util/waitForFileStable.js');
const { createChangeCoalescer } = require('../util/changeCoalescer.js');
const { userDataDir } = require('../util/userData.js');
const { sharedAppModulePath } = require('../util/sharedAppModule.js');
const anadiusNative = require(sharedAppModulePath('parser/anadiusNative.js'));
const { hostPaths } = require(sharedAppModulePath('util/winHosts.js'));

const watchers = kit.createWatcherList('anadius', debug);
const changes = createChangeCoalescer();

async function handleChange(xmlPath, mapFile) {
  try {
    await waitForFileStable(xmlPath);
    const result = anadiusNative.convertFromMap({ xmlPath, mapFile });
    if (result.status === 'unmapped') debug.log(`[anadius] ${xmlPath} has no name map yet; the next library scan makes it`);
    else if (result.status !== 'unchanged') debug.log(`[anadius] ${xmlPath} -> ${result.appid || '?'}: ${result.status}`);
    if (result.unmatched.length) debug.log(`[anadius] unmatched: ${result.unmatched.join(', ')}`);
  } catch (err) {
    debug.warn(`[anadius] conversion failed for ${xmlPath}: ${err}`);
  }
}

module.exports.start = async (ctx, { nativeDirs = hostPaths('LOCALAPPDATA', 'anadius', 'LSX emu'), mapFile = anadiusNative.mapFileIn(userDataDir()) } = {}) => {
  module.exports.stop();
  if (!kit.canStart(ctx, 'steamEmu')) return;
  for (const dir of nativeDirs.filter((candidate) => fs.existsSync(candidate))) {
    const isNativeFile = (name) => anadiusNative.NATIVE_FILE.test(path.basename(name));
    const w = watchers.open(dir, { recursive: false, filter: isNativeFile }, (evt, name) => {
      if (evt !== 'update') return;
      changes.run(`anadius:${name}`, () => handleChange(name, mapFile));
    });
    if (w) debug.log(`[anadius] watching ${dir}`);
  }
};

module.exports.stop = () => {
  changes.clear();
  watchers.closeAll();
};

module.exports._internal = { handleChange };
