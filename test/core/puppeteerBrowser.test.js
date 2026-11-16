'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');

const pb = require('../../app/util/puppeteerBrowser.js');

const APP = path.join(__dirname, '../../app');
const noWait = async () => {};
const busy = () => Object.assign(new Error('EBUSY: resource busy or locked'), { code: 'EBUSY' });

function fakeBrowser() {
  const browser = new EventEmitter();
  const proc = new EventEmitter();
  proc.exitCode = null;
  proc.signalCode = null;
  browser.process = () => proc;
  return { browser, proc };
}

test('a profile that stays locked costs a fixed number of passes, whatever its depth (#191)', async () => {
  let passes = 0;
  const options = [];
  const gone = await pb.removeProfileDir(path.join(os.tmpdir(), `${pb.PROFILE_PREFIX}locked`), {
    rm: async (dir, opts) => {
      passes += 1;
      options.push(opts);
      throw busy();
    },
    wait: noWait,
  });
  assert.equal(gone, false);
  assert.equal(passes, pb.REMOVE_ATTEMPTS);
  // Node's own rm retries per folder level when maxRetries > 0: the same storm as rimraf 3.
  assert.ok(options.every((o) => o.recursive === true && o.maxRetries === 0));
});

test('removeProfileDir never touches a folder that is not one of its profiles', async () => {
  let called = false;
  const rm = async () => {
    called = true;
  };
  assert.equal(await pb.removeProfileDir(os.tmpdir(), { rm, wait: noWait }), false);
  assert.equal(await pb.removeProfileDir(path.join(os.tmpdir(), 'puppeteer_dev_profile-abc'), { rm, wait: noWait }), false);
  assert.equal(await pb.removeProfileDir(undefined, { rm, wait: noWait }), false);
  assert.equal(called, false);
});

test('a real deep profile is removed in one pass', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), pb.PROFILE_PREFIX));
  const deep = path.join(dir, 'Default', 'Storage', 'ext', 'id', 'def', 'Local Storage', 'leveldb');
  fs.mkdirSync(deep, { recursive: true });
  for (const name of ['000003.log', 'LOG', 'MANIFEST-000001', 'LOCK']) fs.writeFileSync(path.join(deep, name), 'x');
  assert.equal(await pb.removeProfileDir(dir), true);
  assert.equal(fs.existsSync(dir), false);
});

test('launchWithProfile gives the browser its own profile and removes it after the process exits', async () => {
  const { browser, proc } = fakeBrowser();
  let launchedWith = null;
  const removed = [];
  const remove = async (dir) => {
    removed.push(dir);
    return true;
  };
  const result = await pb.launchWithProfile(
    {
      launch: async (options) => {
        launchedWith = options;
        return browser;
      },
    },
    { headless: true },
    { root: 'T', mkdtemp: async (prefix) => `${prefix}X1`, remove }
  );
  assert.equal(result, browser);
  assert.equal(launchedWith.headless, true);
  assert.equal(launchedWith.userDataDir, path.join('T', `${pb.PROFILE_PREFIX}X1`));

  browser.emit('disconnected');
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(removed, [], 'nothing is removed while the browser process still runs');
  proc.exitCode = 0;
  proc.emit('exit', 0);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(removed, [launchedWith.userDataDir]);

  browser.emit('disconnected');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(removed.length, 1, 'a profile is cleaned once, never polled');
});

test('a failed launch removes its profile and rethrows', async () => {
  const removed = [];
  await assert.rejects(
    pb.launchWithProfile(
      {
        launch: async () => {
          throw new Error('Failed to launch the browser process');
        },
      },
      {},
      {
        root: 'T',
        mkdtemp: async (prefix) => `${prefix}X2`,
        remove: async (dir) => {
          removed.push(dir);
          return true;
        },
      }
    ),
    /Failed to launch/
  );
  assert.deepEqual(removed, [path.join('T', `${pb.PROFILE_PREFIX}X2`)]);
});

test('waitForExit gives up after its timeout', async () => {
  const { proc } = fakeBrowser();
  const started = Date.now();
  await pb.waitForExit(proc, 20);
  assert.ok(Date.now() - started < 1000);
  assert.equal(proc.listenerCount('exit'), 0);
});

test('sweepStaleProfiles removes only old folders of its own, one pass each', async () => {
  const now = Date.now();
  const ages = {
    [`${pb.PROFILE_PREFIX}old`]: pb.STALE_PROFILE_MS + 1000,
    [`${pb.PROFILE_PREFIX}fresh`]: 1000,
    'puppeteer_dev_profile-old': pb.STALE_PROFILE_MS * 10,
    'other-old': pb.STALE_PROFILE_MS * 10,
  };
  const calls = [];
  const removed = await pb.sweepStaleProfiles({
    root: 'T',
    now,
    readdir: async () => Object.keys(ages),
    stat: async (dir) => ({ isDirectory: () => true, mtimeMs: now - ages[path.basename(dir)] }),
    remove: async (dir, opts) => {
      calls.push([dir, opts]);
      return true;
    },
  });
  assert.equal(removed, 1);
  assert.deepEqual(calls, [[path.join('T', `${pb.PROFILE_PREFIX}old`), { attempts: 1 }]]);
});

test('the sweep also clears dead stealth-plugin profiles, never a live or unmarked one', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-sweep-'));
  const old = (Date.now() - pb.STALE_PROFILE_MS - 60000) / 1000;
  const make = (name, files, ageSeconds = old) => {
    const dir = path.join(root, name);
    fs.mkdirSync(path.join(dir, 'Default'), { recursive: true });
    for (const file of files) fs.writeFileSync(path.join(dir, file), 'x');
    fs.utimesSync(dir, ageSeconds, ageSeconds);
    return dir;
  };
  try {
    const dead = make('puppeteer_dev_profile-Jhn6ns', ['DevToolsActivePort', 'Local State']);
    const live = make('puppeteer_dev_profile-XoVC1f', ['DevToolsActivePort', 'lockfile']);
    const liveLinux = make('puppeteer_dev_profile-Ab12Cd', ['DevToolsActivePort', 'SingletonLock']);
    const unmarked = make('puppeteer_dev_profile-9R1Lbr', ['Local State']);
    const fresh = make('puppeteer_dev_profile-NewOne', ['DevToolsActivePort'], Date.now() / 1000);
    const otherName = make('puppeteer_dev_profile-longer-name', ['DevToolsActivePort']);
    const ownLive = make(`${pb.PROFILE_PREFIX}Live01`, ['lockfile']);
    const removed = await pb.sweepStaleProfiles({ root });
    assert.equal(removed, 1);
    assert.equal(fs.existsSync(dead), false);
    for (const kept of [live, liveLinux, unmarked, fresh, otherName, ownLive]) assert.ok(fs.existsSync(kept), `${path.basename(kept)} must stay`);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('a close waits for the scrapes handed a slot while it drains, within its deadline', async () => {
  const leases = new Set();
  const lease = (ms, then) => {
    const p = new Promise((resolve) => setTimeout(resolve, ms)).then(() => {
      leases.delete(p);
      if (then) then();
    });
    leases.add(p);
    return p;
  };
  // The first scrape hands its slot to a queued one as it ends, as acquirePuppeteerSlot does.
  let handedOver = null;
  lease(20, () => {
    handedOver = lease(30);
  });
  const started = Date.now();
  await pb.waitForLeases(leases, 5000);
  assert.ok(handedOver, 'the queued scrape got its slot');
  assert.equal(leases.size, 0, 'and the close waited for it too');
  assert.ok(Date.now() - started < 1000);

  lease(10000);
  const bounded = Date.now();
  await pb.waitForLeases(leases, 50);
  assert.ok(Date.now() - bounded < 1000, 'a wedged scrape never holds the close past its deadline');
});

test('three scrapes asking together share one launch (#191)', async () => {
  let opens = 0;
  const single = pb.createSingleBrowser(async () => {
    opens += 1;
    await new Promise((resolve) => setTimeout(resolve, 10));
    return { id: opens };
  });
  const sessions = await Promise.all([single.get(), single.get(), single.get()]);
  assert.equal(opens, 1);
  assert.ok(sessions.every((s) => s === sessions[0]));
});

test('a close during a launch closes the browser that launch produces', async () => {
  let release;
  const single = pb.createSingleBrowser(() => new Promise((resolve) => (release = resolve)));
  const pending = single.get();
  const shut = [];
  const closing = single.close(async (session) => shut.push(session));
  assert.equal(single.isOpen(), false);
  release({ id: 'late' });
  await closing;
  await pending;
  assert.deepEqual(shut, [{ id: 'late' }]);
});

test('after a close or a failed launch the next request launches again', async () => {
  let opens = 0;
  const single = pb.createSingleBrowser(async () => {
    opens += 1;
    if (opens === 1) throw new Error('launch failed');
    return { id: opens };
  });
  await assert.rejects(single.get(), /launch failed/);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(single.isOpen(), false);
  assert.deepEqual(await single.get(), { id: 2 });
  await single.close(async () => {});
  assert.deepEqual(await single.get(), { id: 3 });
});

test('every Puppeteer browser in the app is launched through launchWithProfile', () => {
  const sources = ['electron/init.js', 'parser/exophase.js'].map((file) => [file, fs.readFileSync(path.join(APP, file), 'utf8')]);
  for (const [file, text] of sources) {
    assert.ok(!/puppeteer\.launch\(/.test(text), `${file} launches a browser without its own profile`);
    assert.ok(!/puppeteer\.use\(/.test(text), `${file} registers the stealth plugin again`);
    assert.ok(!/require\('puppeteer-extra'\)/.test(text), `${file} reaches puppeteer-extra around getPuppeteer`);
  }
});
