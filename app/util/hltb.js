'use strict';

/*
  HowLongToBeat playtimes through the site's own unofficial search (no key). The search path moves
  with the site's builds, so it is read from the page scripts; the token comes from <path>/init.
  lookup() resolves to { id, name, main, extra, complete, url } (seconds), null when HLTB has no
  exact match, undefined when the site did not answer. It never throws.
*/

const BASE_URL = 'https://howlongtobeat.com';
// Last path known to work, used when the page layout no longer yields one.
const DEFAULT_SEARCH_PATH = '/api/search/site';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const TIMEOUT_MS = 10000;
const TOKEN_TTL_MS = 90000;
const AUTH_STATUSES = new Set([401, 403, 404]);
const MAX_SCRIPTS = 20;
const MAX_TITLE = 200;
const MAX_NAME_LENGTH = 200;
const MAX_WORDS = 20;
const MAX_TOKEN = 2000;
const MAX_SECONDS = 10000 * 3600;
const PAGE_SIZE = 20;
const EDITION_SUFFIX = /(?:\s*[-:]\s*|\s+)(?:definitive edition|remastered|goty|game of the year edition|enhanced edition|director['’]s cut|complete edition)$/i;
const SCRIPT_SRC = /<script[^>]+src="(\/_next\/static\/chunks\/[^"]+\.js)"/g;
const SEARCH_CALL = /fetch\(\s*["'`](\/api\/[A-Za-z0-9/_-]{1,80})["'`]\s*,\s*\{\s*method:\s*["']POST["']/;
const HEADER_SAFE = /^[\x20-\x7e]{1,200}$/;
const BODY_KEY_SAFE = /^[A-Za-z0-9_-]{1,64}$/;

const normalise = (text) =>
  String(text)
    .toLowerCase()
    .replace(/[™®©]/g, '')
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}]/gu, '');

// A time the site did not fill is 0; a present but hostile one rejects the whole game.
function seconds(value) {
  if (value === undefined || value === null) return 0;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > MAX_SECONDS) return NaN;
  return Math.round(value);
}

function parseGame(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = raw.game_id;
  const name = raw.game_name;
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  if (typeof name !== 'string' || !name || name.length > MAX_NAME_LENGTH) return null;
  const main = seconds(raw.comp_main);
  const extra = seconds(raw.comp_plus);
  const complete = seconds(raw.comp_100);
  if ([main, extra, complete].some(Number.isNaN)) return null;
  const completions = [raw.comp_all_count, raw.count_comp].find((value) => Number.isFinite(value) && value >= 0) || 0;
  const year = Number.isSafeInteger(raw.release_world) ? raw.release_world : 0;
  return { id, name, main, extra, complete, url: `${BASE_URL}/game/${id}`, key: normalise(name), completions, year };
}

function chooseGame(games, key, year) {
  const exact = games.filter((game) => game.key === key);
  if (!exact.length) return null;
  const rank = (game) => (year && game.year === year ? 1 : 0);
  exact.sort((a, b) => rank(b) - rank(a) || b.completions - a.completions);
  const { id, name, main, extra, complete, url } = exact[0];
  return { id, name, main, extra, complete, url };
}

function searchBody(words, hp) {
  const body = {
    searchType: 'games',
    searchTerms: words,
    searchPage: 1,
    size: PAGE_SIZE,
    searchOptions: {
      games: {
        userId: 0,
        platform: '',
        sortCategory: 'popular',
        rangeCategory: 'main',
        rangeTime: { min: 0, max: 0 },
        gameplay: { perspective: '', flow: '', genre: '', difficulty: '' },
        rangeYear: { min: '', max: '' },
        modifier: '',
      },
      users: { sortCategory: 'postcount' },
      lists: { sortCategory: 'follows' },
      filter: '',
      sort: 0,
      randomizer: 0,
    },
    useCache: true,
  };
  if (hp) body[hp.key] = hp.val;
  return body;
}

function createHltbClient({ fetchImpl = fetch, now = Date.now, log = () => {} } = {}) {
  let searchPath = null;
  let auth = null;
  let pending = null;

  // Network errors and unreadable bodies come back as null, never as an exception.
  async function request(url, init, wantJson = true) {
    try {
      const response = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (response.status !== 200) return { status: response.status, body: null };
      return { status: 200, body: wantJson ? await response.json() : await response.text() };
    } catch (err) {
      log(`hltb: ${url} failed: ${err && err.message}`);
      return null;
    }
  }

  // The init endpoint answers 403 without a Referer and an Origin of the site.
  const page = (path, wantJson) => request(BASE_URL + path, { headers: { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/`, Origin: BASE_URL } }, wantJson);

  async function findSearchPath() {
    const home = await page('/', false);
    const html = home && typeof home.body === 'string' ? home.body : '';
    const scripts = [...html.matchAll(SCRIPT_SRC)].map((match) => match[1]);
    // The app chunk holds the search call; try it first.
    scripts.sort((a, b) => Number(b.includes('_app-')) - Number(a.includes('_app-')));
    const bodies = await Promise.all(scripts.slice(0, MAX_SCRIPTS).map((src) => page(src, false)));
    for (const script of bodies) {
      const found = script && typeof script.body === 'string' ? SEARCH_CALL.exec(script.body) : null;
      // /api/find is the legacy lookup, not the search.
      if (found && !/^\/api\/find(\/|$)/.test(found[1])) return found[1];
    }
    log('hltb: no search path in the page scripts, using the default');
    return DEFAULT_SEARCH_PATH;
  }

  async function fetchAuth() {
    if (!searchPath) searchPath = await findSearchPath();
    const answer = await page(`${searchPath}/init?t=${now()}`, true);
    const init = answer && answer.body;
    if (!init || typeof init !== 'object' || typeof init.token !== 'string' || !init.token || init.token.length > MAX_TOKEN) return null;
    const hpKey = typeof init.hpKey === 'string' && BODY_KEY_SAFE.test(init.hpKey) && init.hpKey !== '__proto__' ? init.hpKey : null;
    const hpVal = typeof init.hpVal === 'string' && HEADER_SAFE.test(init.hpVal) ? init.hpVal : null;
    return { token: init.token, hp: hpKey && hpVal ? { key: hpKey, val: hpVal } : null, at: now() };
  }

  // One discovery at a time: concurrent lookups share its promise.
  function ensureAuth() {
    if (auth && now() - auth.at < TOKEN_TTL_MS) return Promise.resolve(auth);
    if (!pending) {
      pending = fetchAuth()
        .catch(() => null)
        .then((fresh) => {
          auth = fresh;
          pending = null;
          return fresh;
        });
    }
    return pending;
  }

  function forget() {
    searchPath = null;
    auth = null;
  }

  // Returns the parsed answer, or undefined. A 401/403/404 (or a failed init) throws the path and
  // token away, and the single retry rediscovers them.
  async function search(words) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const credentials = await ensureAuth();
      if (!credentials) {
        forget();
        continue;
      }
      const headers = {
        'content-type': 'application/json',
        accept: '*/*',
        'User-Agent': USER_AGENT,
        Referer: `${BASE_URL}/`,
        Origin: BASE_URL,
        'x-auth-token': credentials.token,
      };
      if (credentials.hp) {
        headers['x-hp-key'] = credentials.hp.key;
        headers['x-hp-val'] = credentials.hp.val;
      }
      const answer = await request(BASE_URL + searchPath, { method: 'POST', headers, body: JSON.stringify(searchBody(words, credentials.hp)) });
      if (answer && answer.status === 200) return answer.body && Array.isArray(answer.body.data) ? answer.body.data : undefined;
      if (!answer || AUTH_STATUSES.has(answer.status)) forget();
    }
    return undefined;
  }

  async function findExact(title, year) {
    const key = normalise(title);
    const words = title.replace(/[™®©]/g, '').split(/\s+/).filter(Boolean).slice(0, MAX_WORDS);
    if (!key || !words.length) return null;
    const data = await search(words);
    if (!data) return undefined;
    return chooseGame(data.map(parseGame).filter(Boolean), key, year);
  }

  async function lookup(title, { year } = {}) {
    try {
      const clean = String(title || '').trim().slice(0, MAX_TITLE);
      const first = await findExact(clean, year);
      if (first !== null) return first;
      const stripped = clean.replace(EDITION_SUFFIX, '').trim();
      return stripped === clean ? null : await findExact(stripped, year);
    } catch (err) {
      log(`hltb: lookup failed: ${err && err.message}`);
      return undefined;
    }
  }

  return { lookup };
}

module.exports = { createHltbClient };
