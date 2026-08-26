'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

/*
  The first scan after a launch used to cost roughly 26 seconds where every later scan in the same
  session cost about one. Nothing was cold on disk: two per-process memos simply started empty, and
  both of them front a synchronous or networked lookup that the whole game list waits on.

    - findFileByName() walks a game install to depth 6, synchronously, twice per game. On the
      renderer thread that also stalls makeList's worker pool, so 62 games could not overlap.
    - searchAppsByName() is the only way a title resolves to an AppID since GetAppList was retired,
      and discovery calls it once per candidate name of every unconfigured install.

  Both now survive a restart. These tests load the parser twice from two module registries, which is
  the only honest way to say "a second launch": a cleared in-memory map with the same cache folder.
*/

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'electron') return { ipcRenderer: { sendSync: () => false, invoke: async () => '' } };
  if (request === '@electron/remote' || request.startsWith('@electron/remote/')) return {};
  return originalLoad.call(this, request, parent, isMain);
};

const steamPath = path.join(__dirname, '..', '..', 'app', 'parser', 'steam.js');
const requestPath = path.join(__dirname, '..', '..', 'app', 'node_modules', 'request-zero');

// A fresh require of the parser, as a relaunch would get it: same disk, empty memos.
function launch(userData) {
  delete require.cache[require.resolve(steamPath)];
  const steam = require(steamPath);
  steam.initDebug({ isDev: false, userDataPath: userData });
  return steam;
}

function makeUserData(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  fs.mkdirSync(path.join(dir, 'logs'), { recursive: true });
  return dir;
}

// scheduleLocateFlush coalesces on a 1s timer, so the file only exists after it fires.
function flushed() {
  return new Promise((resolve) => setTimeout(resolve, 1300));
}

test('a schema location is walked once and remembered across a relaunch', async () => {
  const userData = makeUserData('aw-locate-');
  const gameDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-install-'));
  // The file sits deep enough that only the walk finds it, never the shallow probe.
  const deep = path.join(gameDir, 'data', 'nested', 'more');
  fs.mkdirSync(deep, { recursive: true });
  fs.writeFileSync(path.join(deep, 'achievements.json'), '[]');

  const first = launch(userData);
  const found = first._internal.findFileByName(gameDir, 'achievements.json');
  assert.equal(found, path.join(deep, 'achievements.json'), 'the walk has to find it at all');
  await flushed();

  const cacheFile = path.join(userData, 'steam_cache', 'schemaLocations.json');
  assert.ok(fs.existsSync(cacheFile), 'the answer must reach disk, or the next launch walks again');

  // Relaunch: the memo is empty, the install is gone. Only the persisted answer can survive that.
  fs.rmSync(gameDir, { recursive: true, force: true });
  fs.mkdirSync(deep, { recursive: true });
  fs.writeFileSync(path.join(deep, 'achievements.json'), '[]');
  const second = launch(userData);
  let walked = 0;
  const realReaddir = fs.readdirSync;
  fs.readdirSync = (...args) => {
    walked++;
    return realReaddir(...args);
  };
  try {
    assert.equal(second._internal.findFileByName(gameDir, 'achievements.json'), path.join(deep, 'achievements.json'));
    assert.equal(walked, 0, 'a remembered hit is revalidated by a stat, never by walking again');
  } finally {
    fs.readdirSync = realReaddir;
  }
});

test('an install with no schema is remembered as a miss, so the walk is not repeated every launch', async () => {
  const userData = makeUserData('aw-locate-miss-');
  const gameDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-empty-install-'));
  fs.mkdirSync(path.join(gameDir, 'bin', 'x64'), { recursive: true });

  const first = launch(userData);
  assert.equal(first._internal.findFileByName(gameDir, 'achievements.json'), null);
  await flushed();

  const second = launch(userData);
  let walked = 0;
  const realReaddir = fs.readdirSync;
  fs.readdirSync = (...args) => {
    walked++;
    return realReaddir(...args);
  };
  try {
    assert.equal(second._internal.findFileByName(gameDir, 'achievements.json'), null);
    // The miss is the expensive case and the common one: nearly every install has no local schema.
    assert.equal(walked, 0, 'a remembered miss must survive the relaunch too');
  } finally {
    fs.readdirSync = realReaddir;
  }
});

test('a title search is answered from disk on the next launch, network untouched', async () => {
  const userData = makeUserData('aw-appsearch-');
  const request = require(requestPath);
  const originalGetJson = request.getJson;
  let calls = 0;
  request.getJson = async (url) => {
    if (String(url).includes('SearchApps')) {
      calls++;
      return [{ appid: '620', name: 'Portal 2' }];
    }
    const err = new Error('Not Found');
    err.code = 404;
    throw err;
  };

  try {
    const first = launch(userData);
    assert.deepEqual((await first.searchAppsByName('Portal 2')).map((a) => a.appid), [620]);
    assert.equal(calls, 1);

    const second = launch(userData);
    assert.deepEqual((await second.searchAppsByName('Portal 2')).map((a) => a.appid), [620]);
    assert.equal(calls, 1, 'the second launch must read the stored answer, not search again');

    // "Steam knows no such title" is an answer too, and the one discovery hits most often.
    const empty = launch(userData);
    request.getJson = async (url) => {
      if (String(url).includes('SearchApps')) {
        calls++;
        return [];
      }
      throw new Error('unexpected');
    };
    assert.deepEqual(await empty.searchAppsByName('Some Repack Folder'), []);
    assert.equal(calls, 2);
    const relaunched = launch(userData);
    assert.deepEqual(await relaunched.searchAppsByName('Some Repack Folder'), []);
    assert.equal(calls, 2, 'an empty result is a real answer and must be remembered');
  } finally {
    request.getJson = originalGetJson;
  }
});

test('a failed search is never stored as an answer', async () => {
  const userData = makeUserData('aw-appsearch-fail-');
  const request = require(requestPath);
  const originalGetJson = request.getJson;
  let calls = 0;
  request.getJson = async (url) => {
    if (String(url).includes('SearchApps')) {
      calls++;
      throw new Error('ENOTFOUND');
    }
    throw new Error('unexpected');
  };

  try {
    const first = launch(userData);
    assert.deepEqual(await first.searchAppsByName('Half-Life'), []);
    const second = launch(userData);
    assert.deepEqual(await second.searchAppsByName('Half-Life'), []);
    // An outage looks exactly like "no such title" at the call site. Caching it would blank a whole
    // library for a week after one offline launch, which is the trap the appid negative cache hit.
    assert.equal(calls, 2, 'the second launch has to try again');
  } finally {
    request.getJson = originalGetJson;
  }
});
