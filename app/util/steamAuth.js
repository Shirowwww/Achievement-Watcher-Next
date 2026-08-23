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

function decryptSession(blob, tokenSecret) {
  const secret = String(tokenSecret || DEFAULT_TOKEN_SECRET);
  const envelope = JSON.parse(Buffer.from(String(blob || ''), 'base64').toString('utf8'));
  const key = crypto.scryptSync(secret, Buffer.from(envelope.salt, 'base64'), 32);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
  const raw = Buffer.concat([decipher.update(Buffer.from(envelope.data, 'base64')), decipher.final()]);
  return JSON.parse(raw.toString('utf8'));
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
  A valid token, or an empty string. Never triggers any UI: if the session is dead, the caller
  shows a state and waits for a click.
*/
async function ensureSteamToken({ sessionFile, tokenSecret, session } = {}) {
  const cached = await loadSession({ sessionFile, tokenSecret });
  if (cached && cached.webapi_token && Number(cached.expiresAt) > Date.now() + 60 * 1000) {
    return cached.webapi_token;
  }
  if (!session) return '';
  try {
    const token = await fetchWebApiToken(session);
    await saveSessionEncrypted(
      sessionFile,
      { ...(cached || {}), webapi_token: token, expiresAt: parseJwtExpiry(token) },
      tokenSecret
    );
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
  ensureSteamToken,
  fetchPersona,
  refreshPersona,
  recoverSteamId,
  personaFromProfileXml,
};
