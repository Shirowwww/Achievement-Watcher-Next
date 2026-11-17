'use strict';

/*
  Child process for test/util/steamAnonymousSession.test.js. Opens the session for real (steam-user is
  loaded, nothing connects), imports `debug` as an ES module the way puppeteer does after a scan,
  releases the session and prints how many steam-user modules are still alive.
*/
const v8 = require('v8');
const Module = require('module');
const path = require('path');
const { pathToFileURL } = require('url');

const sessionFile = path.join(__dirname, '..', '..', 'app', 'util', 'steamAnonymousSession.js');
const { createSteamAnonymousSession } = require(sessionFile);
const appRequire = Module.createRequire(sessionFile);

(async () => {
  const timers = [];
  const session = createSteamAnonymousSession({
    loginTimeoutMs: 1000,
    setTimer: (fn) => timers.push(fn),
    clearTimer: () => {},
  });
  await session.use(() => null);
  await import(pathToFileURL(appRequire.resolve('debug')).href);
  for (const fire of timers.splice(0)) fire();
  const alive = v8.queryObjects(Module, { format: 'summary' }).filter((summary) => summary.includes('steam-user')).length;
  // The packages loaded ahead of steam-user belong to the app: they stay in the cache.
  const debugCached = Boolean(require.cache[appRequire.resolve('debug')]);
  process.stdout.write(JSON.stringify({ alive, debugCached }));
})();
