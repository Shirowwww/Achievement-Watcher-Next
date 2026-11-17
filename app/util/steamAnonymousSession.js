'use strict';

/*
  The anonymous Steam session behind product info, in the main process. steam-user is about 550
  modules (the protocol definitions alone are ~30 MB of heap) and keeps a connection to Steam with
  heartbeats and automatic reconnects, while only a library scan ever asks it anything. It used to
  stay open for the life of the tray daemon after the first scan. It is now opened on first use and
  closed once nothing has asked for a while, its modules dropped from the require cache so the heap
  can shrink back; the next scan opens it again.
*/
const diagnosticsChannel = require('diagnostics_channel');
const http = require('http');
const https = require('https');

const IDLE_RELEASE_MS = 3 * 60 * 1000;
// Callers give up on Steam after a few seconds, while steam-user keeps a request open for an hour: a
// call stops holding the session open after this long.
const REQUEST_HOLD_MS = 60 * 1000;
/*
  Packages steam-user shares with code that imports them as ES modules (puppeteer imports `debug`).
  The ESM loader keeps such a module for good, and Node's private parent links lead from it to the
  module that loaded it first: if that was steam-user, the whole graph stayed. Loaded here first,
  they belong to the app. test/util/steamAnonymousSession.test.js checks the list is complete.
*/
const SHARED_PACKAGES = ['debug'];
const HTTP_REQUEST_CHANNEL = 'http.client.request.start';
const STEAM_WEB_API_HOST = /(^|\.)steampowered\.com$/i;

// Out of the require cache is not enough: the module that required one lists it in `children`,
// which keeps the whole graph reachable.
function forgetModules(moduleCache, keys) {
  const gone = new Set(keys.map((key) => moduleCache[key]).filter(Boolean));
  for (const key of keys) delete moduleCache[key];
  for (const mod of Object.values(moduleCache)) {
    if (mod && Array.isArray(mod.children) && mod.children.some((child) => gone.has(child))) {
      mod.children = mod.children.filter((child) => !gone.has(child));
    }
  }
}

function loadSharedPackages() {
  for (const name of SHARED_PACKAGES) {
    try {
      require(name);
    } catch {
      // Not installed where the app can reach it: then nothing is shared with it either.
    }
  }
}

function createSteamAnonymousSession({
  loadSteamUser = () => require('steam-user'),
  moduleCache = require.cache,
  loginTimeoutMs,
  idleMs = IDLE_RELEASE_MS,
  holdMs = REQUEST_HOLD_MS,
  onLoginFailure = () => {},
  log = () => {},
  setTimer = setTimeout,
  clearTimer = clearTimeout,
} = {}) {
  let client = null;
  let loginPromise = null;
  let busy = 0;
  let idleTimer = null;
  let ownModules = [];
  /*
    steam-user asks the Steam Web API for its server list through a keep-alive agent of its own. That
    socket never closed (still open 4 minutes after the log-off) and kept the whole module graph
    reachable, so the agents seen talking to Steam while the session is open are closed with it.
  */
  const steamAgents = new Set();
  const noteSteamRequest = (message) => {
    const request = message && message.request;
    const agent = request && request.agent;
    if (!agent || agent === https.globalAgent || agent === http.globalAgent) return;
    if (STEAM_WEB_API_HOST.test(String(request.host || ''))) steamAgents.add(agent);
  };

  function open() {
    if (client) return client;
    loadSharedPackages();
    const before = new Set(Object.keys(moduleCache));
    const SteamUser = loadSteamUser();
    // What this require added is steam-user's alone: what was loaded before it stays.
    ownModules = Object.keys(moduleCache).filter((key) => !before.has(key));
    client = new SteamUser();
    // Only once it loaded: a load that throws would leave a listener nothing ever removes.
    diagnosticsChannel.subscribe(HTTP_REQUEST_CHANNEL, noteSteamRequest);
    return client;
  }

  function scheduleRelease() {
    clearTimer(idleTimer);
    idleTimer = setTimer(release, idleMs);
    if (idleTimer && typeof idleTimer.unref === 'function') idleTimer.unref();
  }

  function release() {
    clearTimer(idleTimer);
    idleTimer = null;
    if (!client) return false;
    if (busy > 0 || loginPromise) {
      scheduleRelease();
      return false;
    }
    const closing = client;
    client = null;
    closing.removeAllListeners();
    // A socket error after the log-off would otherwise have no listener and throw.
    closing.on('error', () => {});
    try {
      closing.logOff();
    } catch {}
    diagnosticsChannel.unsubscribe(HTTP_REQUEST_CHANNEL, noteSteamRequest);
    for (const agent of steamAgents) {
      try {
        agent.destroy();
      } catch {}
    }
    steamAgents.clear();
    forgetModules(moduleCache, ownModules);
    log(`[steam] anonymous session closed after ${Math.round(idleMs / 1000)} s without a request (${ownModules.length} module(s) released)`);
    ownModules = [];
    return true;
  }

  // Resolves once logged on. Rejects on an error or after loginTimeoutMs; callers decide whether that
  // is fatal. Concurrent callers share one attempt.
  function logOn() {
    const steam = open();
    scheduleRelease();
    if (steam.steamID) return Promise.resolve();
    if (loginPromise) return loginPromise;
    const pending = new Promise((resolve, reject) => {
      let timer;
      let settled = false;
      const finish = (err) => {
        if (settled) return;
        settled = true;
        clearTimer(timer);
        steam.removeListener('loggedOn', onLoggedOn);
        steam.removeListener('error', onError);
        if (err) reject(err);
        else resolve();
      };
      const onLoggedOn = () => finish();
      const onError = (err) => finish(err || new Error('Steam anonymous login failed'));
      steam.once('loggedOn', onLoggedOn);
      steam.once('error', onError);
      timer = setTimer(() => finish(new Error('Steam anonymous login timed out')), loginTimeoutMs);
      try {
        steam.logOn({ anonymous: true });
      } catch (err) {
        finish(err);
      }
    });
    loginPromise = pending
      .catch((err) => {
        onLoginFailure(err);
        throw err;
      })
      .finally(() => {
        loginPromise = null;
        scheduleRelease();
      });
    return loginPromise;
  }

  // Runs fn(client); the session is not closed while a call is still waiting for its answer.
  async function use(fn) {
    busy += 1;
    let holding = true;
    const letGo = () => {
      if (!holding) return;
      holding = false;
      busy -= 1;
      scheduleRelease();
    };
    const holdTimer = setTimer(letGo, holdMs);
    if (holdTimer && typeof holdTimer.unref === 'function') holdTimer.unref();
    try {
      return await fn(open());
    } finally {
      clearTimer(holdTimer);
      letGo();
    }
  }

  return {
    logOn,
    use,
    release,
    isOpen: () => client !== null,
  };
}

module.exports = { createSteamAnonymousSession, IDLE_RELEASE_MS, REQUEST_HOLD_MS, SHARED_PACKAGES };
