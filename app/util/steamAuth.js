'use strict';

/*
  Optional Steam web session. AW never opens the login page on its own and never reads the
  installed Steam client's session: it has its own Electron partition. Only the webapi_token is
  cached, encrypted, following the same pattern as epicAuth.js.
*/

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const DEFAULT_TOKEN_SECRET = 'steam_default_passphrase';
const STEAM_LOGIN_URL = 'https://store.steampowered.com/login/';
const STEAM_TOKEN_URL = 'https://store.steampowered.com/pointssummary/ajaxgetasyncconfig';
const STEAM_SESSION_PARTITION = 'persist:aw-steam';
const STEAM_LOGIN_COOKIE = 'steamLoginSecure';
const STEAM_REFRESH_COOKIE = 'steamRefresh_steam';
const STEAM_LOGIN_DOMAIN = 'https://login.steampowered.com';
const STEAM_RENEW_URL = 'https://api.steampowered.com/IAuthenticationService/GenerateAccessTokenForApp/v1/';
const STEAM_FINALIZE_URL = 'https://login.steampowered.com/jwt/finalizelogin';
const STEAM_FINALIZE_REDIR = 'https://steamcommunity.com/login/home/?goto=';

function resolveSteamSessionFile(userDataDir = '', explicitPath = '') {
  const fromFlag = String(explicitPath || '').trim();
  if (fromFlag) return path.resolve(fromFlag);
  const base = String(userDataDir || '').trim();
  if (base) return path.join(path.resolve(base), 'steam_session.enc');
  return path.join(process.cwd(), 'steam_session.enc');
}

// The cookie value is "<steamid64>||<secret>", sometimes percent-encoded.
function steamIdFromLoginCookie(value) {
  const raw = decodeURIComponent(String(value || ''));
  const match = raw.match(/^(7656119[0-9]{10})/);
  return match ? match[1] : '';
}

// Expiry in milliseconds, read from the payload. The signature is never verified: this token
// comes from Steam via a session we just opened, it isn't external input.
function parseJwtExpiry(token) {
  try {
    const parts = String(token || '').split('.');
    if (parts.length < 2) return 0;
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    const exp = Number(payload && payload.exp);
    return Number.isFinite(exp) && exp > 0 ? exp * 1000 : 0;
  } catch {
    return 0;
  }
}

function encryptSession(payload, tokenSecret) {
  const secret = String(tokenSecret || DEFAULT_TOKEN_SECRET);
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = crypto.scryptSync(secret, salt, 32);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const raw = Buffer.from(JSON.stringify(payload || {}), 'utf8');
  const encrypted = Buffer.concat([cipher.update(raw), cipher.final()]);
  return Buffer.from(
    JSON.stringify({
      v: 1,
      salt: salt.toString('base64'),
      iv: iv.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'),
      data: encrypted.toString('base64'),
    }),
    'utf8'
  ).toString('base64');
}

function decryptWith(envelope, secret) {
  const key = crypto.scryptSync(secret, Buffer.from(envelope.salt, 'base64'), 32);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
  const raw = Buffer.concat([decipher.update(Buffer.from(envelope.data, 'base64')), decipher.final()]);
  return JSON.parse(raw.toString('utf8'));
}

function decryptSession(blob, tokenSecret) {
  const secret = String(tokenSecret || DEFAULT_TOKEN_SECRET);
  const envelope = JSON.parse(Buffer.from(String(blob || ''), 'base64').toString('utf8'));
  try {
    return decryptWith(envelope, secret);
  } catch (err) {
    // A session written before the installation key existed is still encrypted under the constant
    // below. Read it once with that, so moving to a per-machine key does not sign the user out;
    // the next save rewrites it under the real secret. GCM authenticates, so a wrong key throws
    // rather than returning something plausible.
    if (secret === DEFAULT_TOKEN_SECRET) throw err;
    return decryptWith(envelope, DEFAULT_TOKEN_SECRET);
  }
}

async function saveSessionEncrypted(sessionFile, payload, tokenSecret) {
  await fsp.mkdir(path.dirname(sessionFile), { recursive: true });
  await fsp.writeFile(sessionFile, encryptSession(payload, tokenSecret), 'utf8');
}

async function loadSession({ sessionFile, tokenSecret } = {}) {
  try {
    if (!sessionFile || !fs.existsSync(sessionFile)) return null;
    return decryptSession(await fsp.readFile(sessionFile, 'utf8'), tokenSecret);
  } catch {
    // Corrupted file or changed secret: behave as if there's no session, never return
    // questionable data.
    return null;
  }
}

async function getSteamAuthStatus({ sessionFile, tokenSecret } = {}) {
  const session = await loadSession({ sessionFile, tokenSecret });
  if (!session || !session.webapi_token) {
    return { connected: false, steamid: '', persona: '', expiresAt: 0, needsReconnect: false };
  }
  const expiresAt = Number(session.expiresAt) || 0;
  return {
    connected: true,
    steamid: String(session.steamid || ''),
    persona: String(session.persona || ''),
    expiresAt,
    needsReconnect: expiresAt > 0 && expiresAt <= Date.now(),
  };
}

/*
  Fill in a persona the sign-in never managed to read, and write it back so the next start does not
  ask again. Returns the name in use, so a caller can answer with it straight away. Never throws and
  never touches the token: a cosmetic label is not worth risking the session over.
*/
/*
  Put back a steamid the session file is missing, from the sign-in cookie that carries it. Returns
  the id in use, or '' when the cookie is gone too - which is a real disconnection, not this.
*/
async function recoverSteamId({ sessionFile, tokenSecret, session } = {}) {
  const stored = await loadSession({ sessionFile, tokenSecret });
  if (!stored || !stored.webapi_token) return '';
  const known = String(stored.steamid || '').trim();
  if (known) return known;
  if (!session || !session.cookies || typeof session.cookies.get !== 'function') return '';

  try {
    const cookies = await session.cookies.get({ name: STEAM_LOGIN_COOKIE });
    const steamid = steamIdFromLoginCookie(cookies && cookies[0] && cookies[0].value);
    if (!steamid) return '';
    await saveSessionEncrypted(sessionFile, { ...stored, steamid }, tokenSecret);
    return steamid;
  } catch {
    return '';
  }
}

async function refreshPersona({ sessionFile, tokenSecret, session = null, fetchImpl = globalThis.fetch } = {}) {
  const stored = await loadSession({ sessionFile, tokenSecret });
  if (!stored || !stored.webapi_token || !stored.steamid) return '';
  if (String(stored.persona || '').trim()) return String(stored.persona).trim();

  const persona = await fetchPersona(stored.webapi_token, stored.steamid, { fetchImpl, session });
  if (!persona) return '';
  try {
    await saveSessionEncrypted(sessionFile, { ...stored, persona }, tokenSecret);
  } catch {
    // The name is worth showing even when it could not be written back.
  }
  return persona;
}

async function clearSteamSession({ sessionFile } = {}) {
  try {
    if (sessionFile) await fsp.rm(sessionFile, { force: true });
  } catch {
    /* nothing to clear */
  }
}

/*
  The webapi_token is published by the Steam points-summary page for the current session. It's
  valid for about 24 hours and can be re-read with no interaction as long as the session cookie
  lives. `session` is an Electron Session; the call is made with its cookies, never ours.
*/
async function fetchWebApiToken(session) {
  const response = await session.fetch(STEAM_TOKEN_URL, { method: 'GET' });
  if (!response.ok) throw new Error(`steam-token-http-${response.status}`);
  const body = await response.json();
  const token = webApiTokenFromBody(body);
  // A well-formed response with no token means the session isn't authenticated on this domain
  // yet, not that the token is empty: the caller should retry, not conclude it failed.
  if (!token) throw new Error('steam-token-missing');
  return token;
}

/*
  The page renders {"success":1,"data":{"webapi_token":"..."}}. A root-level token was never the
  real shape; it's still accepted in case Valve moves the field up a level.
*/
function webApiTokenFromBody(body) {
  const candidates = [body && body.data && body.data.webapi_token, body && body.webapi_token, body && body.response && body.response.webapi_token];
  for (const candidate of candidates) {
    const token = String(candidate || '').trim();
    if (token) return token;
  }
  return '';
}

/*
  Steam issues the refresh cookie in the same "<steamid64>||<jwt>" shape as the login cookie. It is
  the only long-lived part of a web session: the login cookie dies after a day, this one lasts
  months, which is why the Steam website itself never asks for a password every morning.
*/
function refreshSessionFromCookie(value) {
  const raw = decodeURIComponent(String(value || ''));
  const parts = raw.split('||');
  return { refreshToken: parts.length > 1 ? parts[1].trim() : '', steamid: steamIdFromLoginCookie(value) };
}

// The refresh cookie is HttpOnly, which only hides it from page scripts: the main-process cookie
// store hands it over. `session` is an Electron Session.
async function readRefreshSession(session) {
  try {
    if (!session || !session.cookies || typeof session.cookies.get !== 'function') return { refreshToken: '', steamid: '' };
    const cookies = await session.cookies.get({ url: STEAM_LOGIN_DOMAIN, name: STEAM_REFRESH_COOKIE });
    return refreshSessionFromCookie(cookies && cookies[0] && cookies[0].value);
  } catch {
    return { refreshToken: '', steamid: '' };
  }
}

/*
  Steam's sign-in endpoints only read multipart forms, and Electron's fetch does not serialize a
  FormData body, so the parts are written out by hand. The values here are hex nonces and steamids,
  never free text, so no part ever has to be escaped.
*/
function multipartForm(fields) {
  const boundary = `----AchievementWatcher${crypto.randomBytes(16).toString('hex')}`;
  const parts = Object.entries(fields)
    .map(([name, value]) => `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${String(value)}\r\n`)
    .join('');
  return { body: `${parts}--${boundary}--\r\n`, contentType: `multipart/form-data; boundary=${boundary}` };
}

function postForm(session, url, fields) {
  const { body, contentType } = multipartForm(fields);
  return session.fetch(url, { method: 'POST', headers: { 'content-type': contentType }, body, credentials: 'include' });
}

/*
  Reopens the web session from the refresh token, exactly as the Steam website does for itself:
  finalizelogin trades the refresh token for one short-lived grant per Steam domain, then each
  settoken call puts a fresh sign-in cookie back in our partition. This is the only renewal path
  that works for a session opened in a browser window; GenerateAccessTokenForApp below has been
  answering AccessDenied to browser tokens since 2025, which is why the account looked expired
  every single day even though Steam still trusted it for months.
*/
async function refreshWebSession(session, refreshToken, steamid) {
  if (!session || typeof session.fetch !== 'function') throw new Error('steam-finalize-no-session');
  const nonce = String(refreshToken || '').trim();
  if (!nonce) throw new Error('steam-finalize-no-refresh-token');

  const response = await postForm(session, STEAM_FINALIZE_URL, {
    nonce,
    sessionid: crypto.randomBytes(12).toString('hex'),
    redir: STEAM_FINALIZE_REDIR,
  });
  if (!response || !response.ok) throw new Error(`steam-finalize-http-${response ? response.status : 'no-response'}`);
  const payload = await response.json();
  // Steam reports a refused refresh token as an eresult in the body, with a 200 status.
  if (payload && payload.error) throw new Error(`steam-finalize-eresult-${payload.error}`);
  const transfers = Array.isArray(payload && payload.transfer_info) ? payload.transfer_info : [];
  if (!transfers.length) throw new Error('steam-finalize-no-transfer');

  const id = String((payload && payload.steamID) || steamid || '');
  let accepted = 0;
  for (const transfer of transfers) {
    const url = String((transfer && transfer.url) || '');
    if (!url) continue;
    try {
      const result = await postForm(session, url, { steamID: id, ...transfer.params });
      if (result && result.ok) accepted += 1;
    } catch {
      // help.steampowered.com being unreachable does not make the store session any less valid.
    }
  }
  // Not one domain took the cookie: nothing was signed back in, so say so rather than let the
  // caller read a token that cannot exist yet.
  if (!accepted) throw new Error('steam-finalize-no-cookie');
  return id;
}

/*
  Mints a fresh access token from the refresh token, with no cookies and no window. Kept as a last
  resort behind refreshWebSession: Steam only answers this one for tokens issued to the mobile app
  and to the client, so a session opened in the sign-in window is refused here.
*/
async function renewWebApiToken(refreshToken, steamid, fetchImpl = globalThis.fetch) {
  const refresh = String(refreshToken || '').trim();
  if (!refresh) throw new Error('steam-renew-no-refresh-token');
  const body = new URLSearchParams({ refresh_token: refresh, steamid: String(steamid || '') });
  const response = await fetchImpl(STEAM_RENEW_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!response || !response.ok) throw new Error(`steam-renew-http-${response ? response.status : 'no-response'}`);
  const payload = await response.json();
  const access = String((payload && payload.response && payload.response.access_token) || '').trim();
  // An empty access_token means Steam refused the refresh token, not that it handed out a blank
  // one: the caller must fall back to a real sign-in rather than cache nothing.
  if (!access) throw new Error('steam-renew-missing');
  return access;
}

/*
  A valid token, or an empty string. Never triggers any UI: if the session is dead, the caller
  shows a state and waits for a click. Three ways back from an expired token, tried in that order:
  re-read it from the page while the login cookie is alive, sign the session back in with the
  refresh token, which outlives that cookie by months, then the mobile-style renewal for the rare
  session whose token came from somewhere else.
*/
async function ensureSteamToken({ sessionFile, tokenSecret, session, fetchImpl = globalThis.fetch } = {}) {
  const cached = await loadSession({ sessionFile, tokenSecret });
  if (cached && cached.webapi_token && Number(cached.expiresAt) > Date.now() + 60 * 1000) {
    return cached.webapi_token;
  }

  const store = async (token, extra) =>
    saveSessionEncrypted(
      sessionFile,
      { ...cached, ...extra, webapi_token: token, expiresAt: parseJwtExpiry(token) },
      tokenSecret
    );

  if (session) {
    try {
      const token = await fetchWebApiToken(session);
      await store(token);
      return token;
    } catch {
      // The login cookie has expired; the refresh token below is the way back in.
    }
  }

  // A session connected before AW knew about refresh tokens has none stored, so the cookie jar is
  // read as well: it usually still holds one.
  const fromCookie = await readRefreshSession(session);
  const refreshToken = String((cached && cached.refresh_token) || '') || fromCookie.refreshToken;
  const steamid = String((cached && cached.steamid) || '') || fromCookie.steamid;

  if (session && refreshToken) {
    try {
      const id = await refreshWebSession(session, refreshToken, steamid);
      const token = await fetchWebApiToken(session);
      // The sign-in hands out a new refresh cookie on the way through, and the old one dies with
      // it, so what is stored has to be what the jar now holds.
      const renewed = await readRefreshSession(session);
      await store(token, { refresh_token: renewed.refreshToken || refreshToken, steamid: steamid || id });
      return token;
    } catch {
      // Steam refused the refresh token, or handed back no cookie: the last resort below.
    }
  }

  try {
    const token = await renewWebApiToken(refreshToken, steamid, fetchImpl);
    await store(token, { refresh_token: refreshToken, steamid });
    return token;
  } catch {
    return '';
  }
}

// The persona name as rendered by the profile page: <steamID>Name</steamID>, sometimes in CDATA.
function personaFromProfileXml(xml) {
  const match = String(xml || '').match(/<steamID>\s*(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?\s*<\/steamID>/i);
  return match ? match[1].trim() : '';
}

async function personaFromWebApi(token, steamid, fetchImpl) {
  try {
    const url = `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?access_token=${encodeURIComponent(
      token
    )}&steamids=${encodeURIComponent(steamid)}`;
    const response = await fetchImpl(url);
    if (!response || !response.ok) return '';
    const body = await response.json();
    const player = body && body.response && body.response.players && body.response.players[0];
    return String((player && player.personaname) || '').trim();
  } catch {
    return '';
  }
}

// The profile rendered by the logged-in session. Unlike the public API, it responds even for a
// private profile, since it's our own we're requesting.
async function personaFromCommunity(steamid, session) {
  try {
    if (!session || typeof session.fetch !== 'function') return '';
    const response = await session.fetch(`https://steamcommunity.com/profiles/${encodeURIComponent(steamid)}/?xml=1`);
    if (!response || !response.ok) return '';
    return personaFromProfileXml(await response.text());
  } catch {
    return '';
  }
}

/*
  The persona name is purely cosmetic: its absence blocks nothing, the UI falls back to the
  steamid, which is just a string of digits and means nothing to anyone. The public API doesn't
  always respond to a webapi_token, hence the fallback to the profile read by the session itself.
*/
async function fetchPersona(token, steamid, { fetchImpl = globalThis.fetch, session = null } = {}) {
  return (await personaFromWebApi(token, steamid, fetchImpl)) || (await personaFromCommunity(steamid, session));
}

module.exports = {
  DEFAULT_TOKEN_SECRET,
  STEAM_LOGIN_URL,
  STEAM_TOKEN_URL,
  STEAM_SESSION_PARTITION,
  STEAM_LOGIN_COOKIE,
  STEAM_REFRESH_COOKIE,
  STEAM_RENEW_URL,
  STEAM_FINALIZE_URL,
  resolveSteamSessionFile,
  steamIdFromLoginCookie,
  parseJwtExpiry,
  encryptSession,
  decryptSession,
  saveSessionEncrypted,
  loadSession,
  getSteamAuthStatus,
  clearSteamSession,
  fetchWebApiToken,
  webApiTokenFromBody,
  refreshSessionFromCookie,
  readRefreshSession,
  refreshWebSession,
  renewWebApiToken,
  ensureSteamToken,
  fetchPersona,
  refreshPersona,
  recoverSteamId,
  personaFromProfileXml,
};
