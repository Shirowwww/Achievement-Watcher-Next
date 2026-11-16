'use strict';

/*
  Every Puppeteer browser starts here, on a profile folder this module owns. The stealth plugin's
  own cleanup (rimraf 3) restarted its retries at every folder level: a lock 8 levels down cost 5^8
  attempts over days, the main process at 30-40% CPU (#191). Here: a few passes after exit, then a sweep.
*/
const fs = require('fs');
const os = require('os');
const path = require('path');

const PROFILE_PREFIX = 'aw-next-browser-';
const REMOVE_ATTEMPTS = 4;
const REMOVE_RETRY_MS = 500;
const EXIT_WAIT_MS = 10000;
// A browser closes after a minute idle, so a profile this old belongs to no live browser, even one
// of a second instance (a dev build next to the installed app).
const STALE_PROFILE_MS = 24 * 60 * 60 * 1000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let puppeteerExtra = null;

// puppeteer-extra is a module singleton and use() has no dedupe: register the stealth plugin once.
function getPuppeteer() {
  if (!puppeteerExtra) {
    const puppeteer = require('puppeteer-extra');
    puppeteer.use(require('puppeteer-extra-plugin-stealth')());
    puppeteerExtra = puppeteer;
  }
  return puppeteerExtra;
}

// What the stealth plugin (puppeteer-extra-plugin-user-data-dir) named its temporary profiles before
// 3.12.8: mkdtemp adds six characters. Another tool built on that plugin makes the same names.
const LEGACY_PROFILE_NAME = /^puppeteer_dev_profile-[A-Za-z0-9]{6}$/;

function isProfileDir(dir) {
  return typeof dir === 'string' && path.basename(dir).startsWith(PROFILE_PREFIX);
}

/**
 * Removes a profile folder in at most `attempts` whole passes. Never throws. `legacy` also accepts a
 * stealth-plugin name, for the sweep only.
 * @returns {Promise<boolean>} true once the folder is gone
 */
async function removeProfileDir(dir, { attempts = REMOVE_ATTEMPTS, retryMs = REMOVE_RETRY_MS, rm = fs.promises.rm, wait = sleep, legacy = false } = {}) {
  const named = isProfileDir(dir) || (legacy && typeof dir === 'string' && LEGACY_PROFILE_NAME.test(path.basename(dir)));
  if (!named) return false;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      // maxRetries 0: Node retries nothing inside a pass, so the loop here is the only retry.
      await rm(dir, { recursive: true, force: true, maxRetries: 0 });
      return true;
    } catch {
      if (attempt < attempts) await wait(retryMs * attempt);
    }
  }
  return false;
}

// Resolves when the process has exited, or after `ms`: a pass on a profile still held can only fail.
function waitForExit(proc, ms = EXIT_WAIT_MS) {
  if (!proc || proc.exitCode !== null || proc.signalCode !== null) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(done, ms);
    function done() {
      clearTimeout(timer);
      proc.removeListener('exit', done);
      resolve();
    }
    proc.once('exit', done);
  });
}

/**
 * Launches a browser on a profile folder of its own, removed after the browser goes away (closed
 * or crashed). `launch` is puppeteer.launch; the plugin then never creates or deletes a profile.
 */
async function launchWithProfile(puppeteer, options, { root = os.tmpdir(), mkdtemp = fs.promises.mkdtemp, remove = removeProfileDir, log = () => {} } = {}) {
  sweepOnce(root, log);
  const dir = await mkdtemp(path.join(root, PROFILE_PREFIX));
  let browser;
  try {
    browser = await puppeteer.launch({ ...options, userDataDir: dir });
  } catch (err) {
    await remove(dir);
    throw err;
  }
  browser.once('disconnected', async () => {
    await waitForExit(browser.process());
    if (!(await remove(dir))) log(`browser profile left behind, removed at a later start: ${dir}`);
  });
  return browser;
}

const exists = (file) =>
  fs.promises.access(file).then(
    () => true,
    () => false
  );

// Chrome holds `lockfile` (Windows) or `SingletonLock` (Linux) while it runs; one left by a crash
// keeps the folder too, which errs on the safe side.
async function heldByBrowser(dir) {
  return (await exists(path.join(dir, 'lockfile'))) || (await exists(path.join(dir, 'SingletonLock')));
}

/**
 * Removes the profile folders an earlier session could not (one pass each), older than a day and
 * held by no browser. A stealth-plugin name also needs DevToolsActivePort, which only a browser
 * started for automation writes: a folder without it is left alone.
 * @returns {Promise<number>} how many were removed
 */
async function sweepStaleProfiles({ root = os.tmpdir(), now = Date.now(), readdir = fs.promises.readdir, stat = fs.promises.stat, remove = removeProfileDir } = {}) {
  let names;
  try {
    names = await readdir(root);
  } catch {
    return 0;
  }
  let removed = 0;
  for (const name of names) {
    const legacy = LEGACY_PROFILE_NAME.test(name);
    if (!legacy && !name.startsWith(PROFILE_PREFIX)) continue;
    const dir = path.join(root, name);
    try {
      const info = await stat(dir);
      if (!info.isDirectory() || now - info.mtimeMs < STALE_PROFILE_MS) continue;
      if (await heldByBrowser(dir)) continue;
      if (legacy && !(await exists(path.join(dir, 'DevToolsActivePort')))) continue;
    } catch {
      continue;
    }
    if (await remove(dir, legacy ? { attempts: 1, legacy: true } : { attempts: 1 })) removed += 1;
  }
  return removed;
}

// The first launch of a session sweeps, in the background: nothing is added to the app's start.
let swept = false;
function sweepOnce(root, log) {
  if (swept) return;
  swept = true;
  sweepStaleProfiles({ root })
    .then((count) => count && log(`removed ${count} browser profile(s) left by an earlier session`))
    .catch(() => {});
}

/*
  One browser at a time, whoever asks. Three scrapes starting together each saw "no browser yet"
  and launched one: the last stayed referenced, the others ran on unseen with their profiles locked.
  A close also waits for a launch in flight, so a browser started under it is closed too.
*/
function createSingleBrowser(open) {
  let current = null;
  return {
    get(...args) {
      if (!current) {
        const opening = (async () => open(...args))();
        current = opening;
        opening.catch(() => {
          if (current === opening) current = null;
        });
      }
      return current;
    },
    isOpen() {
      return current !== null;
    },
    async close(shut) {
      const opening = current;
      current = null;
      if (!opening) return;
      let session;
      try {
        session = await opening;
      } catch {
        return;
      }
      await shut(session);
    },
  };
}

/*
  Waits for every scrape holding a page, including the ones handed a slot while it waits: a queued
  scrape starting on a browser being closed failed with "Requesting main frame too early!" and was
  cached as a miss. Bounded, so a wedged page never holds the browser open.
*/
async function waitForLeases(leases, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (leases.size > 0) {
    const left = deadline - Date.now();
    if (left <= 0) return;
    let timer;
    await Promise.race([Promise.all(leases),new Promise((resolve) => (timer = setTimeout(resolve, left)))]);
    clearTimeout(timer);
  }
}

module.exports = {
  PROFILE_PREFIX,
  waitForLeases,
  createSingleBrowser,
  REMOVE_ATTEMPTS,
  STALE_PROFILE_MS,
  getPuppeteer,
  isProfileDir,
  removeProfileDir,
  waitForExit,
  launchWithProfile,
  sweepStaleProfiles,
};
