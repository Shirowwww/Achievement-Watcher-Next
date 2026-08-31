'use strict';

/*
  Steam retired ISteamApps/GetAppList, so the app-list map is empty on every machine that has no
  stale dump left on disk. loadAppListBestEffort() only ever wanted that map warmed, but it went
  through findInAppList(753), whose miss path reads the local Steam catalogue and then asks the main
  process for appid 753's store data - a network round trip whose answer was thrown away, paid once
  per name candidate resolved. On a cold library that was the single biggest item in discovery.
*/

const assert = require('node:assert/strict');
const Module = require('node:module');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const steamDataCalls = [];

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'electron') {
    return {
      ipcRenderer: {
        sendSync: () => false,
        invoke: async (channel, payload) => {
          if (channel === 'get-steam-data') steamDataCalls.push(payload);
          return null;
        },
      },
    };
  }
  if (request === '@electron/remote' || request.startsWith('@electron/remote/')) return {};
  return originalLoad.call(this, request, parent, isMain);
};

const steam = require('../../app/parser/steam.js');

// No appList.json: exactly the state a real install is in now that the endpoint is gone.
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-applist-warmup-'));
fs.mkdirSync(path.join(userData, 'steam_cache'), { recursive: true });
// A completed search, so the name below resolves from disk and never touches the network.
fs.writeFileSync(
  path.join(userData, 'steam_cache', 'appsearch.json'),
  JSON.stringify({ 'some unconfigured install': { at: Date.now(), apps: [] } })
);
steam.initDebug({ isDev: false, userDataPath: userData });

test('warming the app-list map does not resolve an appid nobody asked about', async () => {
  const answer = await steam.findAppidByName('some unconfigured install');

  assert.equal(answer, null, 'a cached empty search is still a miss');
  assert.deepEqual(steamDataCalls, [], 'no store lookup may be made just to warm the map');
});
