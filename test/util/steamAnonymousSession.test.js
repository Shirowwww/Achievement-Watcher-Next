'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createSteamAnonymousSession } = require('../../app/util/steamAnonymousSession.js');

// A steam-user stand-in that records what the session asks of it.
function fakeSteam() {
  const made = [];
  class FakeSteamUser extends EventEmitter {
    constructor() {
      super();
      this.steamID = null;
      this.logOns = 0;
      this.loggedOff = false;
      made.push(this);
    }
    logOn() {
      this.logOns += 1;
    }
    logOff() {
      this.loggedOff = true;
    }
    getProductInfo(ids) {
      return new Promise((resolve) => {
        this.answer = () => resolve({ apps: Object.fromEntries(ids.map((id) => [id, { appinfo: { id } }])) });
      });
    }
  }
  return { FakeSteamUser, made };
}

// Timers the test fires by hand, so an idle release happens exactly when the test says.
function manualTimers() {
  const pending = new Map();
  let next = 0;
  return {
    setTimer: (fn, ms) => {
      next += 1;
      pending.set(next, { fn, ms });
      return next;
    },
    clearTimer: (id) => pending.delete(id),
    fire(ms) {
      // A snapshot: a timer a callback schedules again must wait for the next fire, not run now.
      for (const [id, timer] of Array.from(pending)) {
        if (timer.ms !== ms) continue;
        pending.delete(id);
        timer.fn();
      }
    },
  };
}

function setup({ idleMs = 1000, loginTimeoutMs = 5000, holdMs = 2000, loadFails = () => false } = {}) {
  const { FakeSteamUser, made } = fakeSteam();
  const moduleCache = { 'app/init.js': {}, 'node_modules/semver/index.js': {} };
  const timers = manualTimers();
  const failures = [];
  const logs = [];
  const session = createSteamAnonymousSession({
    loadSteamUser: () => {
      if (loadFails()) throw new Error('Cannot find module steam-user');
      moduleCache['node_modules/steam-user/index.js'] = {};
      moduleCache['node_modules/protobufjs/index.js'] = {};
      return FakeSteamUser;
    },
    moduleCache,
    loginTimeoutMs,
    idleMs,
    holdMs,
    onLoginFailure: (err) => failures.push(err.message),
    log: (line) => logs.push(line),
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer,
  });
  return { session, made, moduleCache, timers, failures, logs };
}

test('nothing is loaded or connected until a scan asks', () => {
  const { session, made, moduleCache } = setup();
  assert.equal(session.isOpen(), false);
  assert.equal(made.length, 0);
  assert.equal('node_modules/steam-user/index.js' in moduleCache, false);
});

test('concurrent logins share one attempt that resolves on loggedOn', async () => {
  const { session, made } = setup();
  const first = session.logOn();
  const second = session.logOn();
  assert.equal(made.length, 1);
  assert.equal(made[0].logOns, 1, 'one connection for every caller');
  made[0].steamID = 'anon';
  made[0].emit('loggedOn');
  await Promise.all([first, second]);
  await session.logOn();
  assert.equal(made[0].logOns, 1, 'a logged-on session is reused');
});

test('an idle session logs off and lets go of the modules it loaded, and only those', async () => {
  const { session, made, moduleCache, timers, logs } = setup();
  const login = session.logOn();
  made[0].steamID = 'anon';
  made[0].emit('loggedOn');
  await login;
  timers.fire(1000);
  assert.equal(session.isOpen(), false);
  assert.equal(made[0].loggedOff, true);
  assert.deepEqual(Object.keys(moduleCache).sort(), ['app/init.js', 'node_modules/semver/index.js'], 'modules loaded before steam-user stay');
  assert.equal(made[0].listenerCount('error'), 1, 'a late socket error after the log-off must not throw');
  assert.match(logs.join('\n'), /anonymous session closed/);

  // The next scan opens a fresh session.
  session.logOn();
  assert.equal(made.length, 2);
  assert.equal(session.isOpen(), true);
});

test('the keep-alive agents steam-user used for the Steam Web API are closed with the session', async () => {
  const diagnostics = require('node:diagnostics_channel');
  const https = require('node:https');
  const { session, made, timers } = setup();
  const destroyed = [];
  const agent = (name) => ({ destroy: () => destroyed.push(name) });
  const login = session.logOn();
  const publish = (host, which) => diagnostics.channel('http.client.request.start').publish({ request: { host, agent: which } });
  publish('api.steampowered.com', agent('steam-user'));
  publish('store.steampowered.com', agent('steam-store'));
  publish('example.com', agent('someone else'));
  publish('api.steampowered.com', https.globalAgent);
  made[0].steamID = 'anon';
  made[0].emit('loggedOn');
  await login;
  timers.fire(1000);
  assert.deepEqual(destroyed.sort(), ['steam-store', 'steam-user'], 'only agents seen talking to Steam, never the shared global one');
  // Not watched while closed: a later session does not close what it never used.
  publish('api.steampowered.com', agent('while closed'));
  const again = session.logOn();
  made[1].steamID = 'anon';
  made[1].emit('loggedOn');
  await again;
  timers.fire(1000);
  assert.equal(destroyed.includes('while closed'), false);
});

test('a request still waiting for Steam keeps the session open', async () => {
  const { session, made, timers } = setup();
  const login = session.logOn();
  made[0].steamID = 'anon';
  made[0].emit('loggedOn');
  await login;
  const answer = session.use((steam) => steam.getProductInfo([400]));
  await Promise.resolve();
  timers.fire(1000);
  assert.equal(session.isOpen(), true, 'closing it would orphan the request in flight');
  made[0].answer();
  assert.deepEqual(await answer, { apps: { 400: { appinfo: { id: 400 } } } });
  timers.fire(1000);
  assert.equal(session.isOpen(), false, 'and it closes once the answer is in');
});

test('a request Steam never answers stops holding the session open after a while', async () => {
  const { session, made, timers } = setup({ holdMs: 2000 });
  const login = session.logOn();
  made[0].steamID = 'anon';
  made[0].emit('loggedOn');
  await login;
  // steam-user keeps a product-info request open for an hour; its caller gave up long before.
  session.use((steam) => steam.getProductInfo([400]));
  await Promise.resolve();
  timers.fire(1000);
  assert.equal(session.isOpen(), true, 'still within the hold');
  timers.fire(2000);
  timers.fire(1000);
  assert.equal(session.isOpen(), false);
});

test('a steam-user that fails to load leaves nothing listening for requests', async () => {
  const diagnostics = require('node:diagnostics_channel');
  let failing = true;
  const { session, made, timers } = setup({ loadFails: () => failing });
  assert.throws(() => session.logOn(), /Cannot find module/);
  failing = false;

  const destroyed = [];
  const login = session.logOn();
  made[0].steamID = 'anon';
  made[0].emit('loggedOn');
  await login;
  timers.fire(1000);
  diagnostics.channel('http.client.request.start').publish({ request: { host: 'api.steampowered.com', agent: { destroy: () => destroyed.push('while closed') } } });
  const again = session.logOn();
  made[1].steamID = 'anon';
  made[1].emit('loggedOn');
  await again;
  timers.fire(1000);
  assert.deepEqual(destroyed, [], 'the failed load must not have left a listener behind');
});

// Real steam-user in a child process: the ESM loader keeps a module for good, so it must not belong to
// steam-user's graph, or the whole graph (about 30 MB of protocol definitions) never goes.
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const helper = (name, ...args) => {
  const run = spawnSync(process.execPath, ['--no-warnings', path.join(__dirname, '..', 'helpers', name), ...args], { encoding: 'utf8', timeout: 60000 });
  assert.equal(run.status, 0, run.stderr);
  return run.stdout;
};

test('a released session leaves no steam-user module alive, even after an ES module imported one it shares', () => {
  assert.deepEqual(JSON.parse(helper('steamSessionRelease.js')), { alive: 0, debugCached: true });
});

test('every package steam-user shares with puppeteer is loaded ahead of it', () => {
  const steam = JSON.parse(helper('steamSharedPackages.js', 'steam-user'));
  const puppeteer = new Set(JSON.parse(helper('steamSharedPackages.js', 'puppeteer')));
  const preloaded = new Set(JSON.parse(helper('steamSharedPackages.js', 'shared')));
  const missing = steam.filter((name) => puppeteer.has(name) && !preloaded.has(name));
  assert.deepEqual(missing, [], 'add the package that brings these to SHARED_PACKAGES');
});

test('a login that never answers times out once, for every caller', async () => {
  const { session, timers, failures } = setup({ loginTimeoutMs: 5000 });
  const first = session.logOn();
  const second = session.logOn();
  timers.fire(5000);
  await assert.rejects(first, /timed out/);
  await assert.rejects(second, /timed out/);
  assert.deepEqual(failures, ['Steam anonymous login timed out'], 'one failure recorded, not one per caller');
});
