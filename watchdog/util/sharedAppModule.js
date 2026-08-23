'use strict';

/*
  Modules the Watchdog shares with the app rather than duplicating.

  The Watchdog runs from the install directory as its own process, so it cannot reach app code by a
  package name. In a packaged build the app lives inside resources/app.asar and the shared files are
  unpacked beside it at resources/app.asar.unpacked (see the `asarUnpack` list in
  electron-builder.yml - a module required through here MUST be in it); in a dev checkout the plain
  app folder simply sits next to the watchdog folder.
*/

const fs = require('fs');
const path = require('path');

function sharedAppModulePath(rel) {
  const resources = process.resourcesPath;
  const unpacked = resources ? path.join(resources, 'app.asar.unpacked', rel) : '';
  if (unpacked && fs.existsSync(unpacked)) return unpacked;
  return path.join(__dirname, '..', '..', 'app', rel);
}

module.exports = { sharedAppModulePath };
