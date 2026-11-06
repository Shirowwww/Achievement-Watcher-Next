'use strict';

// The app's resolver, so both sides name one folder and one cache: the Electron main process passes
// its user-data root through AW_USER_DATA when spawning the monitor, and a standalone run (dev,
// tests) falls back to the same AW Next directory. The main process owns the migration.
const { sharedAppModulePath } = require('./sharedAppModule.js');
const { APP_DATA_DIR_NAME, userDataDir, resetCache } = require(sharedAppModulePath('util/userDataPath.js'));

module.exports = { APP_DATA_DIR_NAME, userDataDir, resetCache };
