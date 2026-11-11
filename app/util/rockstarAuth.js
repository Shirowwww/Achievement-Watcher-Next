'use strict';

/*
  Rockstar Games account, for the unlock state of the launcher's games. The website mints a bearer
  token that lives five minutes from the sign-in cookies, so those cookies are what is kept: only
  the rockstargames.com ones, encrypted under the installation key (util/aes.js). The main process
  turns them into a token (electron/rockstarAccount.js); nothing here touches Electron.
*/

const fs = require('fs');
const path = require('path');
const { writeFileAtomicSync } = require('./replaceFile.js');

// The Social Club entry point: the only one whose token can be renewed (refreshaccess).
const SIGN_IN_URL = 'https://signin.rockstargames.com/connect/authorize/socialclub?lang=en-US&returnUrl=%2F';
const REFRESH_URL = 'https://socialclub.rockstargames.com/connect/refreshaccess';
const SCAPI = 'https://scapi.rockstargames.com';
const BEARER_COOKIE = 'BearerToken';
const BEARER_HOST = 'socialclub.rockstargames.com';
const COOKIE_DOMAIN = 'rockstargames.com';

const JWT_RE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/;
const ROCKSTAR_ID_RE = /^\d{1,20}$/;
const MAX_COOKIES = 100;
const MAX_COOKIE_VALUE = 8192;
// The titles the achievements API knows, and the platforms they are kept under.
const TITLE_RE = /^[a-z0-9]{2,20}$/;
const PLATFORMS = new Set(['pc', 'pcalt']);
const MAX_AWARDED = 1000;

const authFile = (userDataDir) => path.join(userDataDir, 'cfg', 'rockstar-auth.json');

function settings(options = {}) {
  return {
    file: authFile(options.userDataDir || require('./userDataPath.js').userDataDir()),
    cipher: options.cipher || require('./aes.js'),
  };
}

function readState(options) {
  const { file, cipher } = settings(options);
  try {
    const state = JSON.parse(cipher.decrypt(fs.readFileSync(file, 'utf8')));
    return state && Array.isArray(state.cookies) && state.cookies.length ? state : null;
  } catch {
    return null;
  }
}

function writeState(options, state) {
  const { file, cipher } = settings(options);
  writeFileAtomicSync(file, cipher.encrypt(JSON.stringify(state)));
}

function clear(options) {
  fs.rmSync(settings(options).file, { force: true });
}

const bareDomain = (domain) => String(domain || '').replace(/^\./, '').toLowerCase();
const isRockstarDomain = (domain) => {
  const bare = bareDomain(domain);
  return bare === COOKIE_DOMAIN || bare.endsWith(`.${COOKIE_DOMAIN}`);
};

/*
  The cookies worth keeping, from an Electron cookie list: Rockstar's own, with only the fields
  needed to put them back. Anything else the sign-in pages set (analytics, captcha) is dropped.
*/
function keepCookies(cookies) {
  return (Array.isArray(cookies) ? cookies : [])
    .filter((c) => c && typeof c.name === 'string' && c.name && typeof c.value === 'string' && c.value.length <= MAX_COOKIE_VALUE && isRockstarDomain(c.domain))
    .slice(0, MAX_COOKIES)
    .map((c) => ({
      name: c.name,
      value: c.value,
      domain: String(c.domain),
      path: String(c.path || '/'),
      secure: c.secure !== false,
      httpOnly: !!c.httpOnly,
      ...(Number.isFinite(c.expirationDate) ? { expirationDate: c.expirationDate } : {}),
    }));
}

// The current bearer token among the cookies, or '' when the sign-in has not minted one.
function bearerFromCookies(cookies) {
  const cookie = (Array.isArray(cookies) ? cookies : []).find((c) => c && c.name === BEARER_COOKIE && bareDomain(c.domain) === BEARER_HOST);
  const value = String((cookie && cookie.value) || '');
  return JWT_RE.test(value) ? value : '';
}

function jwtClaims(token) {
  try {
    return JSON.parse(Buffer.from(String(token).split('.')[1], 'base64url').toString('utf8')) || {};
  } catch {
    return {};
  }
}

// When the token stops being accepted, in ms; 0 when it does not say.
function jwtExpiry(token) {
  const exp = Number(jwtClaims(token).exp);
  return Number.isFinite(exp) && exp > 0 ? exp * 1000 : 0;
}

// The account behind a getbasicprofile answer: { rockstarId, displayName } or null.
function profileFromBasic(body) {
  const account = body && Array.isArray(body.accounts) && body.accounts[0] && body.accounts[0].rockstarAccount;
  const rockstarId = String((account && account.rockstarId) || '');
  if (!ROCKSTAR_ID_RE.test(rockstarId)) return null;
  const displayName = String((account && account.displayName) || '').slice(0, 64);
  return { rockstarId, displayName };
}

// The query for one game's unlocks, or null when the request does not name a known title.
function awardedUrl({ title, platform } = {}, rockstarId) {
  if (!TITLE_RE.test(String(title || '')) || !PLATFORMS.has(platform) || !ROCKSTAR_ID_RE.test(String(rockstarId || ''))) return null;
  const query = new URLSearchParams({ title, platform, rockstarId: String(rockstarId) });
  return `${SCAPI}/achievements/awardedAchievements?${query}`;
}

/*
  { "<achievement number>": <unlock time in seconds> } from an awardedAchievements answer. The
  answer lists every achievement of the title, locked ones too: only `achieved` ones are kept.
*/
function parseAwarded(body) {
  const awarded = body && body.awardedAchievements;
  const out = {};
  if (!awarded || typeof awarded !== 'object') return out;
  for (const [id, entry] of Object.entries(awarded).slice(0, MAX_AWARDED)) {
    if (!/^\d{1,6}$/.test(id) || !entry || entry.achieved !== true) continue;
    const ms = Date.parse(String(entry.dateAchieved || ''));
    out[id] = Number.isFinite(ms) && ms > 0 ? Math.floor(ms / 1000) : 0;
  }
  return out;
}

function status(options) {
  const state = readState(options);
  if (!state) return { connected: false };
  return { connected: true, displayName: state.displayName || '', needsReconnect: !!state.needsReconnect };
}

module.exports = {
  SIGN_IN_URL,
  REFRESH_URL,
  SCAPI,
  authFile,
  readState,
  writeState,
  clear,
  keepCookies,
  bearerFromCookies,
  jwtExpiry,
  profileFromBasic,
  awardedUrl,
  parseAwarded,
  status,
};
