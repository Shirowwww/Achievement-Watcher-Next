'use strict';

/*
  What a Ubisoft product id is called, kept current instead of frozen.

  app/assets/uplay-steam.json is a snapshot: it cannot name a game released after it was written, and
  a wrong row in it stays wrong until someone edits the file. This module adds two LIVE sources for
  the same question and caches their answer on disk:

    - Ubisoft's own public catalogue. No authentication, no headers, no account:
      GET /v1/applications/global/webservices/ubisoftplus/vault/products?storefront=<cc>
      It carries `ubisoftConnectGameId` (the product id every emulator save folder is named after),
      the official product name, a `spaceId`, and official cover artwork. It only covers the
      Ubisoft+ catalogue (~150 products), so it is authoritative but far from complete.
    - Haoose/UPLAY_GAME_ID and its maintained fork, the community lists the scene has used for years
      (~310 ids between them). Wider than Ubisoft's, but hand-maintained, so a spelling can be wrong
      ("Avatar: Frontier of Pandora").

  Ubisoft's own name wins wherever both answer. Nothing here decides which Steam game a product is -
  that is uplayR2.resolveSteamMapping's job, and it is deliberately much stricter than a name match.

  Everything is best effort. No network, a rate limit, a changed response shape: the cached copy is
  used, and failing that the shipped asset alone, exactly as before this module existed.
*/

const fs = require('fs');
const path = require('path');
const { lazyRequire } = require('../util/lazyRequire.js');
const request = lazyRequire('request-zero');
const { createNetworkCircuit, isSteamTransportFailure } = require(path.join(__dirname, '..', 'util', 'networkCircuit.js'));

let cacheRoot = null;
let debug = { log() {}, warn() {}, error() {} };

module.exports.initDebug = ({ isDev, userDataPath }) => {
  module.exports.setUserDataPath(userDataPath);
  debug = new (require(path.join(__dirname, '..', 'util', 'logger.js')))({
    console: isDev || false,
    file: path.join(userDataPath, 'logs/parser.log'),
  });
};

module.exports.setUserDataPath = (value) => {
  if (value === cacheRoot) return;
  cacheRoot = value;
  memory = null;
};

const VAULT_URL = 'https://public-ubiservices.ubi.com/v1/applications/global/webservices/ubisoftplus/vault/products?storefront=';
// The storefront only changes prices and availability, never the ids. One is enough; the second is
// there so a region that returns an error does not cost a whole refresh.
const VAULT_STOREFRONTS = ['ie', 'us'];
/*
  The community id lists, least authoritative first: a maintained fork carries ids the upstream has
  not picked up yet, while the upstream is the canonical spelling for anything both know. Read in
  this order so a later source overwrites an earlier one, and Ubisoft's own catalogue overwrites both.
*/
const COMMUNITY_URLS = [
  'https://raw.githubusercontent.com/PSerban93/UPLAY_GAME_ID/master/README.md',
  'https://raw.githubusercontent.com/Haoose/UPLAY_GAME_ID/master/README.md',
];

const CACHE_FILE = 'uplay-catalogue.json';
const REFRESH_AFTER_MS = 7 * 24 * 60 * 60 * 1000;
// A product id is a small positive integer. Anything else in a hand-edited README is a typo, and a
// name long enough to be a paragraph is a parse that went wrong.
const MAX_PRODUCT_ID = 10_000_000;
const MAX_NAME_LENGTH = 200;
const REQUEST_TIMEOUT_MS = 20000;

// One breaker for both hosts: they are asked together and a machine that cannot reach one is almost
// always offline for the other too.
const circuit = createNetworkCircuit({ failureLimit: 2, cooldownMs: 30 * 60 * 1000, shouldCount: isSteamTransportFailure });

let memory = null;
let inFlight = null;

function cacheFile() {
  return cacheRoot ? path.join(cacheRoot, 'cache', CACHE_FILE) : '';
}

function emptyStore() {
  return { format: 1, fetchedAt: 0, products: {} };
}

function readCache() {
  const file = cacheFile();
  if (!file) return emptyStore();
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!parsed || parsed.format !== 1 || !parsed.products || typeof parsed.products !== 'object') return emptyStore();
    return { format: 1, fetchedAt: Number(parsed.fetchedAt) || 0, products: parsed.products };
  } catch {
    return emptyStore(); // absent or unreadable: the shipped asset still answers
  }
}

function writeCache(store) {
  const file = cacheFile();
  if (!file) return;
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(store));
  } catch (err) {
    debug.log(`[uplay-catalogue] could not write the cache => ${err}`);
  }
}

function load() {
  if (!memory) memory = readCache();
  return memory;
}

function validId(value) {
  const id = String(value == null ? '' : value).trim();
  return /^[0-9]+$/.test(id) && Number(id) > 0 && Number(id) <= MAX_PRODUCT_ID ? id : '';
}

function cleanName(value) {
  const name = String(value == null ? '' : value)
    .replace(/\s+/g, ' ')
    .trim();
  return name && name.length <= MAX_NAME_LENGTH ? name : '';
}

/*
  Ubisoft's catalogue. Returns a map of productId -> { name, spaceId, cover, official: true }, or an
  empty map. `official` is what lets the merge prefer these over a hand-maintained spelling.
*/
async function fetchVault() {
  const out = new Map();
  for (const storefront of VAULT_STOREFRONTS) {
    let rows;
    try {
      rows = await request.getJson(`${VAULT_URL}${storefront}`, { timeout: REQUEST_TIMEOUT_MS });
    } catch (err) {
      circuit.recordFailure(err);
      debug.log(`[uplay-catalogue] Ubisoft catalogue (${storefront}) unavailable => ${err.code || err}`);
      continue;
    }
    circuit.recordSuccess();
    if (!Array.isArray(rows)) continue;
    for (const row of rows) {
      const id = validId(row && row.ubisoftConnectGameId);
      const name = cleanName(row && row.name);
      if (!id || !name || out.has(id)) continue;
      out.set(id, {
        name,
        spaceId: typeof row.spaceId === 'string' && /^[0-9a-f-]{36}$/i.test(row.spaceId) ? row.spaceId : '',
        // Two artwork fields, both official CDN paths. The boxart is the portrait a tile wants.
        cover: typeof row.image === 'string' && /^https:\/\//i.test(row.image) ? row.image : '',
        background: typeof row.coverImage === 'string' && /^https:\/\//i.test(row.coverImage) ? row.coverImage : '',
        official: true,
      });
    }
    if (out.size > 0) break; // one storefront answered; the others would repeat it
  }
  return out;
}

/*
  The community list, one "<id> - <name>" per line under franchise headings. Anything that is not
  that shape (headings, blank lines, the title) is skipped rather than guessed at.
*/
function parseCommunityList(markdown) {
  const out = new Map();
  for (const line of String(markdown || '').split(/\r?\n/)) {
    const match = line.match(/^\s*(\d+)\s*-\s*(\S.*?)\s*$/);
    if (!match) continue;
    const id = validId(match[1]);
    const name = cleanName(match[2]);
    if (!id || !name || out.has(id)) continue;
    out.set(id, { name, official: false });
  }
  return out;
}

async function fetchCommunity() {
  const merged = new Map();
  for (const url of COMMUNITY_URLS) {
    try {
      const res = await request(url, { timeout: REQUEST_TIMEOUT_MS });
      circuit.recordSuccess();
      for (const [id, entry] of parseCommunityList(res && res.body)) merged.set(id, entry);
    } catch (err) {
      circuit.recordFailure(err);
      debug.log(`[uplay-catalogue] ${url} unavailable => ${err.code || err}`);
    }
  }
  return merged;
}

/*
  Refresh both sources and persist. Concurrent callers share one refresh. Returns the store, which is
  the previous one untouched when nothing could be fetched - a failed refresh must never empty a
  catalogue that was working.
*/
async function refresh({ force = false } = {}) {
  if (inFlight) return inFlight;
  const store = load();
  if (!force && store.fetchedAt && Date.now() - store.fetchedAt < REFRESH_AFTER_MS) return store;
  if (!force && circuit.unavailable()) return store;

  inFlight = (async () => {
    const [vault, community] = await Promise.all([fetchVault(), fetchCommunity()]);
    if (vault.size === 0 && community.size === 0) {
      debug.log('[uplay-catalogue] refresh reached neither source - keeping the cached catalogue');
      return store;
    }
    // Community first so Ubisoft's own spelling overwrites it where both know the product.
    const products = {};
    for (const [id, entry] of community) products[id] = entry;
    for (const [id, entry] of vault) products[id] = { ...products[id], ...entry };
    memory = { format: 1, fetchedAt: Date.now(), products };
    writeCache(memory);
    debug.log(`[uplay-catalogue] refreshed: ${Object.keys(products).length} product(s) (${vault.size} from Ubisoft, ${community.size} community)`);
    return memory;
  })().finally(() => {
    inFlight = null;
  });

  return inFlight;
}

// Synchronous readers. They answer from whatever is cached and never reach the network, so any code
// path can call them; refresh() is what keeps the cache current.
function entryFor(uplayId) {
  const id = validId(uplayId);
  if (!id) return null;
  const entry = load().products[id];
  return entry && entry.name ? entry : null;
}

module.exports.refresh = refresh;
module.exports.nameFor = (uplayId) => {
  const entry = entryFor(uplayId);
  return entry ? entry.name : '';
};
module.exports.artworkFor = (uplayId) => {
  const entry = entryFor(uplayId);
  if (!entry) return null;
  return entry.cover || entry.background ? { cover: entry.cover || '', background: entry.background || '' } : null;
};
module.exports.spaceIdFor = (uplayId) => {
  const entry = entryFor(uplayId);
  return entry && entry.spaceId ? entry.spaceId : '';
};
module.exports.size = () => Object.keys(load().products).length;
module.exports.fetchedAt = () => load().fetchedAt;

module.exports._internal = { parseCommunityList, validId, cleanName, emptyStore, VAULT_URL, COMMUNITY_URLS, REFRESH_AFTER_MS };
