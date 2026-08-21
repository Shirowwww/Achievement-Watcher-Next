'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

let steamDataCalls = 0;
const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'electron') {
    return {
      ipcRenderer: {
        sendSync: () => false,
        invoke: async () => {
          steamDataCalls++;
          return 'A Game';
        },
      },
    };
  }
  if (request === '@electron/remote' || request.startsWith('@electron/remote/')) return {};
  return originalLoad.call(this, request, parent, isMain);
};

const steam = require('../../app/parser/steam.js');
// node_modules live in app/, so resolve the HTTP client the parser itself uses.
const request = require(path.join(__dirname, '..', '..', 'app', 'node_modules', 'request-zero'));

/*
  These tests must describe the code, not the machine they run on: a developer box with Steam
  installed answers every one of these appids from the real local catalogue, a CI runner answers
  none of them. Drive that lookup explicitly instead.
*/
const appInfo = require('../../app/parser/steamAppInfo.js');
const realNameOf = appInfo.nameOf;
function withLocalCatalogue(names) {
  appInfo.nameOf = (steamPath, appid) => names[String(appid)] || '';
  return () => {
    appInfo.nameOf = realNameOf;
  };
}

/*
  Steam retired ISteamApps/GetAppList - it answers 404 ("Method 'GetAppList' not found in interface
  'ISteamApps'") and no longer appears in GetSupportedAPIList. With no cached copy on disk the map
  therefore stays empty, which used to send every single appid back to the same dead endpoint: one
  wasted round trip per game on every scan, and the reason the first scan after clearing the cache
  dragged.
*/
test('a retired app-list endpoint is called once per session, not once per appid', async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-applist-'));
  fs.mkdirSync(path.join(userData, 'logs'), { recursive: true });
  steam.initDebug({ isDev: false, userDataPath: userData });

  const originalGetJson = request.getJson;
  let attempts = 0;
  request.getJson = async (url) => {
    if (String(url).includes('GetAppList')) {
      attempts++;
      const err = new Error('Not Found');
      err.code = 404;
      throw err;
    }
    return originalGetJson(url);
  };

  const restoreCatalogue = withLocalCatalogue({}); // nothing known locally: exercise the network path
  const before = steamDataCalls;
  try {
    const names = [];
    for (const appid of [4000, 391540, 1426210]) names.push(await steam.getAppNameByAppid(appid));

    assert.equal(attempts, 1, 'the dead endpoint must be tried once, not once per appid');
    assert.equal(steamDataCalls - before, 3, 'every appid still resolves through the store-data fallback');
    assert.deepEqual(names, ['A Game', 'A Game', 'A Game']);
  } finally {
    restoreCatalogue();
    // The log stream stays open for the rest of the run, so the temp folder is left to the OS
    // rather than deleted out from under a pending write.
    request.getJson = originalGetJson;
  }
});

/*
  With GetAppList retired, the name of a game depended entirely on a network round trip - the same
  one that is rate-limited or unreachable exactly when a cleared cache needs it for every game at
  once. That is what put bare numeric appids in the library as titles. The Steam client's own
  appinfo cache answers from disk, so it is asked first and the request is not made at all.
*/
test('a name the local Steam catalogue knows costs no request', async () => {
  const restoreCatalogue = withLocalCatalogue({ 4000: "Garry's Mod", 391540: 'Undertale' });
  const before = steamDataCalls;
  try {
    assert.equal(await steam.getAppNameByAppid(4000), "Garry's Mod");
    assert.equal(await steam.getAppNameByAppid(391540), 'Undertale');
    assert.equal(steamDataCalls - before, 0, 'the local catalogue must be consulted before the network, not after it');

    assert.equal(await steam.getAppNameByAppid(1426210), 'A Game', 'an appid it does not know still falls through');
    assert.equal(steamDataCalls - before, 1);
  } finally {
    restoreCatalogue();
  }
});
