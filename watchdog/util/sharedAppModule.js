'use strict';

/*
  Where the Watchdog finds app code. The Watchdog runs from the install directory as its own process,
  so it cannot reach app code by a package name. It runs under Electron's Node like the scan host
  (app/parser/scanWorker.js), which reads modules straight from resources/app.asar, siblings and
  app/node_modules included; in a dev checkout the app folder sits next to the watchdog folder.
*/

const fs = require('fs');
const path = require('path');

function sharedAppModulePath(rel) {
  const resources = process.resourcesPath;
  const archive = resources ? path.join(resources, 'app.asar') : '';
  if (archive && fs.existsSync(archive)) return path.join(archive, rel);
  return path.join(__dirname, '..', '..', 'app', rel);
}

module.exports = { sharedAppModulePath };
