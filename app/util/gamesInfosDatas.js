'use strict';

/*
  Nemirtingas' games-infos-datas: what his Steam and Epic retrievers pulled with a signed-in account,
  published as plain JSON. It is the one place the stat behind a progress achievement can be read
  without an account, and it holds Epic schemas Epic's public API does not give out. The repository
  has no licence, so files are read on demand, never bundled.

  Fetched through Node rather than the window's fetch: the page's connect-src does not list GitHub,
  and a blocked request looks exactly like a game the repository does not have.
*/

const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://raw.githubusercontent.com/Nemirtingas/games-infos-datas/main';
// Same as steam.js's negative cache.
const TTL_MS = 3 * 24 * 60 * 60 * 1000;
const TIMEOUT_MS = 10000;

// The raw body, not request-zero's getJson: GitHub serves some of these files with a byte-order
// mark, and getJson's JSON.parse chokes on it.
async function defaultGetJson(url) {
  const { body } = await require('request-zero')(url, null, { method: 'GET', timeout: TIMEOUT_MS });
  return String(body);
}

/*
  One file of the repository, parsed, or null. A 404 is remembered for TTL_MS so a game the
  repository lacks is not asked for on every scan; any other failure says nothing about the game
  and is retried next time.
*/
async function readJson(relPath, { cacheDir, getJson = defaultGetJson } = {}) {
  const miss = cacheDir ? path.join(cacheDir, 'steam_cache', 'games-infos-datas', ...relPath.split('/')) + '.miss' : null;
  try {
    if (miss && Date.now() - fs.statSync(miss).mtimeMs < TTL_MS) return null;
  } catch {
    /* never missed */
  }
  let data;
  try {
    data = await getJson(`${BASE_URL}/${relPath}`);
  } catch (err) {
    if (miss && err && err.code === 404) {
      try {
        fs.mkdirSync(path.dirname(miss), { recursive: true });
        fs.writeFileSync(miss, '');
      } catch {
        /* the cache is a convenience */
      }
    }
    return null;
  }
  if (typeof data !== 'string') return data;
  try {
    return JSON.parse(data.charCodeAt(0) === 0xfeff ? data.slice(1) : data);
  } catch {
    return null;
  }
}

// Whether a file is published there. Not every Epic entry ships its achievement images.
async function exists(relPath, { head = defaultHead } = {}) {
  try {
    return await head(`${BASE_URL}/${relPath}`);
  } catch {
    return false;
  }
}

// request-zero resolves a HEAD whatever the status, so the code has to be read.
async function defaultHead(url) {
  const { code } = await require('request-zero')(url, null, { method: 'HEAD', timeout: TIMEOUT_MS });
  return code >= 200 && code < 300;
}

module.exports = { readJson, exists, BASE_URL, TTL_MS };
