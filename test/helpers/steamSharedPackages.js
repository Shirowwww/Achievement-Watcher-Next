'use strict';

/*
  Child process for test/util/steamAnonymousSession.test.js: prints the packages a fresh process loads
  for argv[2] ('steam-user', 'puppeteer' the way util/puppeteerBrowser.js loads it, or 'shared' for
  SHARED_PACKAGES alone), as JSON.
*/
const Module = require('module');
const path = require('path');

const sessionFile = path.join(__dirname, '..', '..', 'app', 'util', 'steamAnonymousSession.js');
const appRequire = Module.createRequire(sessionFile);

function packageOf(file) {
  const parts = file.split(/[\\/]node_modules[\\/]/);
  if (parts.length < 2) return null;
  const [scope, name] = parts[parts.length - 1].split(/[\\/]/);
  return scope.startsWith('@') ? `${scope}/${name}` : scope;
}

const before = new Set(Object.keys(require.cache));
if (process.argv[2] === 'steam-user') appRequire('steam-user');
else if (process.argv[2] === 'puppeteer') {
  appRequire('puppeteer-extra');
  appRequire('puppeteer-extra-plugin-stealth');
  appRequire('puppeteer-core');
} else {
  // Read before the session module itself loads anything.
  const { SHARED_PACKAGES } = require(sessionFile);
  for (const name of SHARED_PACKAGES) appRequire(name);
}
const loaded = Object.keys(require.cache)
  .filter((file) => !before.has(file))
  .map(packageOf)
  .filter(Boolean);
process.stdout.write(JSON.stringify([...new Set(loaded)].sort()));
