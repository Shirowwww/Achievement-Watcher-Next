'use strict';

/*
  The Watchdog reads options.ini through the app's schema (app/settings.js), so both processes fill
  in the same defaults. It writes the file back only to repair it: when there is none, or when the
  schema completed or cleaned it (a missing key, a legacy flag, the removed Steam API key).
*/

const { sharedAppModulePath } = require('./util/sharedAppModule.js');
const ini = require(sharedAppModulePath('util/ini.js'));
const fs = require(sharedAppModulePath('util/fsAsync.js'));
const replaceFile = require(sharedAppModulePath('util/replaceFile.js'));
const schema = require(sharedAppModulePath('settings.js'));
const debug = require('./util/log.js');

function errorText(err) {
  return err && err.message ? err.message : String(err);
}

// A settings file that cannot be written stays as it was; the session goes on with what was read.
function writeOptions(cfg_file, options) {
  try {
    replaceFile.writeFileAtomicSync(cfg_file, ini.stringify(options));
  } catch (err) {
    debug.error(`[settings] could not write ${cfg_file}: ${errorText(err)}`);
  }
}

module.exports.load = async (cfg_file) => {
  let text;
  try {
    text = await fs.readFile(cfg_file, 'utf8');
  } catch (err) {
    // Rewriting a file that exists but could not be read (EBUSY, EPERM during an app save) would
    // erase every setting the user had, so only a missing one receives the defaults on disk.
    const options = schema.defaults();
    if (err && err.code === 'ENOENT') writeOptions(cfg_file, options);
    else debug.error(`[settings] could not load ${cfg_file}, using defaults for now: ${errorText(err)}`);
    return options;
  }
  try {
    const parsed = ini.parse(text);
    const before = ini.stringify(parsed);
    const options = schema.normalize(parsed);
    if (ini.stringify(options) !== before) writeOptions(cfg_file, options);
    return options;
  } catch (err) {
    debug.error(`[settings] could not load ${cfg_file}, using defaults for now: ${errorText(err)}`);
    return schema.defaults();
  }
};
