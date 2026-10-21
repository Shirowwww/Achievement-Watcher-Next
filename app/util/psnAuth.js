'use strict';

/*
  PSN sign-in for the official trophy rates. Only the access and refresh tokens are kept, encrypted
  under the installation key (util/aes.js); the NPSSO cookie is traded once and never written. Sony
  rates only lists on the signed-in account: any other game keeps the Exophase figure.
*/

const fs = require('fs');
const path = require('path');

const AUTH_BASE_URL = 'https://ca.account.sony.com/api/authz/v3/oauth';
const SIGN_IN_URL = 'https://www.playstation.com/';
const TROPHY_API = 'https://m.np.playstation.com/api/trophy/v1';
const PROFILE_API = 'https://m.np.playstation.com/api/userProfile/v1/internal/users';
// The PlayStation App's own public client, which every PSN client signs in as: not a user secret.
const CLIENT_ID = '09515159-7237-4370-9b40-3806e67c0891';
const CLIENT_BASIC = 'MDk1MTUxNTktNzIzNy00MzcwLTliNDAtMzgwNmU2N2MwODkxOnVjUGprYTV0bnRCMktxc1A=';
const REDIRECT_URI = 'com.scee.psxandroid.scecompcall://redirect';
const SCOPE = 'psn:mobile.v2.core psn:clientapp';

const NPSSO_RE = /^[A-Za-z0-9]{64}$/;
const NPCOMMID_RE = /^NPWR\d{5}_\d{2}$/;
const ACCOUNT_ID_RE = /^\d{1,20}$/;
const ONLINE_ID_RE = /^[A-Za-z0-9_-]{3,16}$/;
const SERVICES = new Set(['trophy', 'trophy2']);
const TIMEOUT_MS = 15000;
// The account name is only a label, and the Settings card waits for it: it gets less patience.
const NAME_TIMEOUT_MS = 4000;
// Renewed this long before it runs out, so a request never leaves with a token about to expire.
const EXPIRY_MARGIN_MS = 60 * 1000;

const authFile = (userDataDir) => path.join(userDataDir, 'cfg', 'psn-auth.json');

function settings(options = {}) {
  return {
    file: authFile(options.userDataDir || require('./userDataPath.js').userDataDir()),
    cipher: options.cipher || require('./aes.js'),
    fetchImpl: options.fetchImpl || fetch,
    now: options.now || Date.now,
  };
}

function readTokens({ file, cipher }) {
  try {
    const tokens = JSON.parse(cipher.decrypt(fs.readFileSync(file, 'utf8')));
    return tokens && tokens.refresh_token ? tokens : null;
  } catch {
    return null;
  }
}

function writeTokens({ file, cipher }, tokens) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, cipher.encrypt(JSON.stringify(tokens)), 'utf8');
}

function withLifetimes(body, now) {
  if (!body || !body.access_token || !body.refresh_token) throw new Error('psn-token-refused');
  return {
    access_token: String(body.access_token),
    refresh_token: String(body.refresh_token),
    expires_at: now + Number(body.expires_in || 0) * 1000,
    refresh_expires_at: now + Number(body.refresh_token_expires_in || 0) * 1000,
  };
}

async function requestTokens(config, fields) {
  const res = await config.fetchImpl(`${AUTH_BASE_URL}/token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${CLIENT_BASIC}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ ...fields, token_format: 'jwt' }).toString(),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error('psn-token-refused');
  return withLifetimes(await res.json(), config.now());
}

// The code Sony hands back in the redirect to the PlayStation App, read without following it.
async function codeFromNpsso(config, npsso) {
  const query = new URLSearchParams({ access_type: 'offline', client_id: CLIENT_ID, redirect_uri: REDIRECT_URI, response_type: 'code', scope: SCOPE });
  const res = await config.fetchImpl(`${AUTH_BASE_URL}/authorize?${query}`, {
    headers: { Cookie: `npsso=${npsso}` },
    redirect: 'manual',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const location = String((res.headers && res.headers.get('location')) || '');
  const at = location.indexOf('?');
  return at >= 0 ? new URLSearchParams(location.slice(at + 1)).get('code') || '' : '';
}

function npssoFromCookies(cookies) {
  const cookie = (Array.isArray(cookies) ? cookies : []).find((entry) => entry && entry.name === 'npsso');
  const value = String((cookie && cookie.value) || '');
  return NPSSO_RE.test(value) ? value : '';
}

async function signIn(npsso, options = {}) {
  if (!NPSSO_RE.test(String(npsso || ''))) return { ok: false, error: 'psn-npsso-invalid' };
  const config = settings(options);
  try {
    const code = await codeFromNpsso(config, npsso);
    if (!code) return { ok: false, error: 'psn-code-refused' };
    const tokens = await requestTokens(config, { code, redirect_uri: REDIRECT_URI, grant_type: 'authorization_code' });
    const onlineId = await fetchOnlineId(config, tokens.access_token);
    writeTokens(config, onlineId ? { ...tokens, online_id: onlineId } : tokens);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err && String(err.message).startsWith('psn-') ? err.message : 'psn-unreachable' };
  }
}

// A usable access token, renewed first when it has run out; '' once the account must sign in again.
async function accessToken(options = {}) {
  const config = settings(options);
  const tokens = readTokens(config);
  if (!tokens) return '';
  const now = config.now();
  if (tokens.expires_at - EXPIRY_MARGIN_MS > now) return tokens.access_token;
  if (tokens.refresh_expires_at <= now) return '';
  const renewed = await requestTokens(config, { refresh_token: tokens.refresh_token, grant_type: 'refresh_token', scope: SCOPE });
  writeTokens(config, { ...renewed, online_id: tokens.online_id });
  return renewed.access_token;
}

// The account's online id, for the "Connected: <name>" line: two requests, so it is kept with the tokens.
async function fetchOnlineId(config, token) {
  const get = async (url) => {
    const res = await config.fetchImpl(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }, signal: AbortSignal.timeout(NAME_TIMEOUT_MS) });
    return res.ok ? res.json() : null;
  };
  try {
    const summary = await get(`${TROPHY_API}/users/me/trophySummary`);
    const accountId = String((summary && summary.accountId) || '');
    if (!ACCOUNT_ID_RE.test(accountId)) return '';
    const profile = await get(`${PROFILE_API}/${accountId}/profiles`);
    const onlineId = String((profile && profile.onlineId) || '');
    return ONLINE_ID_RE.test(onlineId) ? onlineId : '';
  } catch {
    return '';
  }
}

// Accounts connected before the name was kept are asked once per run, so a failing lookup is not retried on every repaint.
const onlineIdLookedUp = new Set();

async function status(options = {}) {
  const config = settings(options);
  const tokens = readTokens(config);
  const connected = !!tokens && tokens.refresh_expires_at > config.now();
  if (!connected) return { connected };
  let onlineId = tokens.online_id || '';
  if (!onlineId && !onlineIdLookedUp.has(config.file)) {
    onlineIdLookedUp.add(config.file);
    const token = await accessToken(options).catch(() => '');
    onlineId = token ? await fetchOnlineId(config, token) : '';
    if (onlineId) writeTokens(config, { ...readTokens(config), online_id: onlineId });
  }
  return onlineId ? { connected, onlineId } : { connected };
}

async function clear(options = {}) {
  fs.rmSync(settings(options).file, { force: true });
}

// [{ name, percent }] keyed by trophy id, for one trophy list of the signed-in account.
async function trophyRates({ npCommId, service } = {}, options = {}) {
  if (!NPCOMMID_RE.test(String(npCommId || '')) || !SERVICES.has(service)) return { ok: false, error: 'psn-list-invalid' };
  const config = settings(options);
  let token = '';
  try {
    token = await accessToken(options);
  } catch {
    return { ok: false, error: 'psn-unreachable' };
  }
  if (!token) return { ok: false, error: 'psn-not-connected' };
  try {
    const res = await config.fetchImpl(`${TROPHY_API}/users/me/npCommunicationIds/${npCommId}/trophyGroups/all/trophies?npServiceName=${service}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.status === 404) return { ok: false, error: 'psn-not-on-account' };
    if (!res.ok) return { ok: false, error: `psn-http-${res.status}` };
    const body = await res.json();
    const entries = (Array.isArray(body && body.trophies) ? body.trophies : [])
      .map((trophy) => ({ name: String(trophy.trophyId), percent: Number.parseFloat(trophy.trophyEarnedRate) }))
      .filter((entry) => /^\d+$/.test(entry.name) && Number.isFinite(entry.percent) && entry.percent >= 0 && entry.percent <= 100);
    return { ok: true, entries };
  } catch {
    return { ok: false, error: 'psn-unreachable' };
  }
}

module.exports = { SIGN_IN_URL, authFile, npssoFromCookies, signIn, accessToken, status, clear, trophyRates };
