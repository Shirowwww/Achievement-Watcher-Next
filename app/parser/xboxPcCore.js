'use strict';

// What the app parser (xboxPc.js) and the Watchdog's live polling both need: the session file and its
// refresh, the achievements call, the achievement and state-snapshot shapes, and the title cache
// files. No Electron, no scan and no network library at require time (xboxlive-auth loads on first
// use), so the Watchdog can load it at startup.

const fs = require('fs');
const path = require('path');
const { parseUnlockTimeSeconds } = require('../util/unlockTime.js');
const { writeFileAtomicSync } = require('../util/replaceFile.js');

const XBOX_PC_CLIENT_ID =
  String(process.env.XBOX_PC_CLIENT_ID || '').trim() || '388ea51c-0b25-4029-aae2-17df49d23905';
const XBOX_PC_OAUTH_SCOPE = 'Xboxlive.signin Xboxlive.offline_access';
const XBOX_PC_RELYING_PARTY = 'http://xboxlive.com';
const XBOX_ACHIEVEMENTS_URL = 'https://achievements.xboxlive.com';
const XBOX_ACHIEVEMENTS_CONTRACT_VERSION = '4';
// The Watchdog polls unattended, so it renews the session only when the token is about to lapse.
const WATCHDOG_SESSION_VALIDITY_MS = 60000;

let userDataPath = null;
function setUserDataPath(p) {
  userDataPath = p;
}

function getUserDataPath() {
  return userDataPath || require('../util/userDataPath.js').userDataDir();
}

function firstNonEmpty(...values) {
  for (const value of values) {
    const text = String(value || '').trim();
    if (text) return text;
  }
  return '';
}

function normalizeTitleId(value) {
  const raw = String(value ?? '').trim();
  if (/^0x[0-9a-f]{1,16}$/i.test(raw)) {
    try {
      return BigInt(raw).toString(10);
    } catch {
      return '';
    }
  }
  return /^\d{1,20}$/.test(raw) ? raw : '';
}

function normalizeXuid(value) {
  const raw = String(value ?? '').trim();
  return /^\d{8,20}$/.test(raw) ? raw : '';
}

function sanitizeSegment(value, fallback = 'xbox-pc') {
  const result = String(value || '')
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 160);
  return result || fallback;
}

function authFile() {
  return path.join(getUserDataPath(), 'cfg', 'xbox-auth.json');
}

function cacheDir(titleId) {
  return path.join(getUserDataPath(), 'steam_cache', 'xbox', sanitizeSegment(titleId));
}

function schemaCacheFile(titleId) {
  return path.join(cacheDir(titleId), 'schema.json');
}

function stateCacheFile(titleId) {
  return path.join(cacheDir(titleId), 'state.json');
}

// Atomic: a torn state.json reads as "no unlocks yet" and every earned achievement is announced again.
function writeJson(file, value) {
  writeFileAtomicSync(file, JSON.stringify(value, null, 2));
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function xboxAuthExpiry(expiresIn) {
  return Date.now() + Math.max(0, Number(expiresIn) || 0) * 1000;
}

async function exchangeLiveTokenForXboxSession(liveTokens, clientId) {
  const { xnet } = require('@xboxreplay/xboxlive-auth');
  const accessToken = String(liveTokens?.access_token || '').trim();
  const refreshToken = String(liveTokens?.refresh_token || '').trim();
  if (!accessToken || !refreshToken) throw new Error('xbox-pc-oauth-token-invalid');

  let userToken = null;
  let userTokenError = null;
  for (const preamble of ['d', 't']) {
    try {
      userToken = await xnet.exchangeRpsTicketForUserToken(accessToken, preamble);
      break;
    } catch (error) {
      userTokenError = error;
    }
  }
  if (!userToken?.Token) throw userTokenError || new Error('xbox-pc-user-token-invalid');

  const xsts = await xnet.exchangeTokenForXSTSToken(userToken.Token, {
    XSTSRelyingParty: XBOX_PC_RELYING_PARTY,
    sandboxId: 'RETAIL',
  });
  const claims = xsts?.DisplayClaims?.xui?.[0] || {};
  const session = {
    clientId,
    refreshToken,
    accessToken,
    accessExpiresAt: xboxAuthExpiry(liveTokens.expires_in),
    xstsToken: xsts?.Token,
    xstsExpiresAt: Date.parse(xsts?.NotAfter) || 0,
    xuid: claims.xid,
    uhs: claims.uhs,
    gamertag: claims.gtg,
  };
  if (!session.xstsToken || !session.xuid || !session.uhs) throw new Error('xbox-pc-xsts-claims-invalid');
  return session;
}

function saveAuth(auth) {
  if (!auth || !auth.xuid) return;
  try {
    const payload = JSON.stringify(auth);
    writeFileAtomicSync(authFile(), require('../util/aes.js').encrypt(payload));
  } catch (err) {
    // Swallowed, this must never break a sign-in that otherwise worked - but not silently: an
    // unwritable token file signs the user out again at the next launch with nothing to explain it.
    console.warn(`[xbox-pc] could not store the Xbox session (${err.message || err}); it will not survive a restart`);
  }
}

function loadAuth() {
  try {
    const raw = fs.readFileSync(authFile(), 'utf8');
    const payload = raw.includes(':') ? require('../util/aes.js').decrypt(raw) : raw;
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

function clearAuth() {
  try {
    fs.unlinkSync(authFile());
  } catch {}
}

// options.keepAuthOnFailure: leave the stored session in place when the refresh fails (the Watchdog
// retries on its next poll; the app signs the user out, since it can ask for a new login).
async function ensureXboxDirectSession(options = {}) {
  let auth = options.auth || loadAuth();
  if (!auth) throw new Error('xbox-pc-microsoft-login-required');
  const { live } = require('@xboxreplay/xboxlive-auth');
  const minimumValidityMs = Math.max(60000, Number(options.minimumValidityMs) || 300000);
  if (auth.xstsToken && auth.xuid && auth.uhs && auth.xstsExpiresAt > Date.now() + minimumValidityMs) {
    return auth;
  }
  const clientId = auth.clientId || XBOX_PC_CLIENT_ID;
  let refreshed;
  try {
    refreshed = await live.refreshAccessToken(auth.refreshToken, clientId, XBOX_PC_OAUTH_SCOPE);
  } catch (error) {
    if (!options.keepAuthOnFailure) clearAuth();
    throw error;
  }
  if (!refreshed.refresh_token) refreshed.refresh_token = auth.refreshToken;
  auth = await exchangeLiveTokenForXboxSession(refreshed, clientId);
  saveAuth(auth);
  return auth;
}

function buildXboxAuthorizationHeader(auth) {
  const uhs = String(auth.uhs || '').trim();
  const token = String(auth.xstsToken || '').trim();
  if (!uhs || !token) throw new Error('xbox-pc-xsts-required');
  return `XBL3.0 x=${uhs};${token}`;
}

async function xboxServiceGet(baseUrl, endpoint, options = {}) {
  const auth = options.auth || (await ensureXboxDirectSession(options));
  const url = `${baseUrl}/${String(endpoint || '').replace(/^\/+/, '')}`;
  // Xbox Live rejects a request whose contract version it cannot read, so the fallback has to be
  // applied to the value that is sent, not only to the one that is tested.
  const requestedContractVersion = String(options.contractVersion ?? '').trim();
  const contractVersion = /^\d+$/.test(requestedContractVersion) ? requestedContractVersion : '2';
  const res = await fetch(url, {
    signal: AbortSignal.timeout(Math.max(3000, Number(options.timeoutMs) || 15000)),
    headers: {
      Authorization: buildXboxAuthorizationHeader(auth),
      'x-xbl-contract-version': contractVersion,
      Accept: 'application/json',
      'Accept-Language': options.locale || 'en-US,en',
    },
  });
  if (!res.ok) {
    const error = new Error(`xbox-network-http-${res.status}`);
    error.status = res.status;
    throw error;
  }
  return res.json();
}

function extractArray(payload, keys) {
  for (const key of keys) {
    if (Array.isArray(payload?.[key])) return payload[key];
  }
  if (Array.isArray(payload)) return payload;
  return [];
}

async function xboxServiceGetAll(baseUrl, endpoint, keys, options = {}) {
  const rows = [];
  const seenTokens = new Set();
  let continuationToken = '';
  for (let page = 0; page < 20; page += 1) {
    const url = new URL(endpoint, `${baseUrl}/`);
    if (continuationToken) url.searchParams.set('continuationToken', continuationToken);
    const payload = await xboxServiceGet(baseUrl, `${url.pathname.replace(/^\/+/, '')}${url.search}`, options);
    rows.push(...extractArray(payload, keys));
    continuationToken = String(payload?.pagingInfo?.continuationToken || '').trim();
    if (!continuationToken || seenTokens.has(continuationToken)) break;
    seenTokens.add(continuationToken);
  }
  return rows;
}

async function fetchXboxTitleAchievements(xuid, titleId, options = {}) {
  const safeXuid = normalizeXuid(xuid);
  const safeTitleId = normalizeTitleId(titleId);
  if (!safeXuid) throw new Error('xbox-xuid-required');
  if (!safeTitleId) throw new Error('xbox-title-id-required');
  const auth = options.auth || (await ensureXboxDirectSession(options));
  const unlockedFilter = options.unlockedOnly ? '&unlockedOnly=true' : '';
  return xboxServiceGetAll(
    XBOX_ACHIEVEMENTS_URL,
    `users/xuid(${safeXuid})/achievements?titleId=${encodeURIComponent(safeTitleId)}&maxItems=1000${unlockedFilter}`,
    ['achievements', 'items'],
    { ...options, auth, contractVersion: XBOX_ACHIEVEMENTS_CONTRACT_VERSION }
  );
}

/*
  Xbox serves achievement art at 1920x1080 by default - 2.5 MB per achievement, so a single game
  such as Sea of Thieves cached 800 MB of pictures for a 64px slot. Its image service resizes on
  request, and 128px wide is the size the interface actually paints.
*/
const XBOX_ICON_SIZE = 128;
function achievementIconUrl(url) {
  const raw = String(url || '').trim();
  if (!raw.startsWith('http') || /[?&]w=\d/.test(raw)) return raw;
  return `${raw}${raw.includes('?') ? '&' : '?'}w=${XBOX_ICON_SIZE}&h=${XBOX_ICON_SIZE}`;
}

function normalizeXboxAchievement(raw = {}) {
  const id = firstNonEmpty(raw?.id, raw?.name, raw?.scid);
  if (!id) return null;
  const progressState = raw?.progressState || raw?.progression?.state || '';
  const earned = /achieved/i.test(String(progressState));
  const earnedTime = parseUnlockTimeSeconds(raw?.progression?.timeUnlocked || raw?.unlockTime || raw?.timeUnlocked);
  const progressCurrent = Number(raw?.progression?.current || raw?.progress || 0);
  const progressMax = Number(raw?.progression?.target || raw?.maxProgress || 0);
  const rarity = Number(raw?.rarity?.currentPercentage ?? raw?.rarityPercentage ?? raw?.rarity?.percentage);
  const media = raw?.mediaAssets || raw?.media || [];
  const icon = achievementIconUrl(
    firstNonEmpty(
      raw?.icon,
      media.find((m) => /icon/i.test(String(m?.mediaType || m?.type || '')))?.url,
      media[0]?.url
    )
  );
  const hidden = [raw?.isSecret, raw?.hidden].some((value) => value === true || value === 1 || /secret/i.test(String(value || '')));
  return {
    id: String(id),
    displayName: firstNonEmpty(raw?.name, raw?.displayName, id),
    description: firstNonEmpty(raw?.description, raw?.blurb, ''),
    hidden,
    icon,
    gamerscore: Number(raw?.rewards?.[0]?.value ?? raw?.gamerscore) || 0,
    rarity: Number.isFinite(rarity) ? Math.min(100, Math.max(0, rarity)) : null,
    snapshot: {
      earned,
      earned_time: earnedTime > 0 ? earnedTime : undefined,
      progress: Number.isFinite(progressCurrent) ? progressCurrent : undefined,
      max_progress: Number.isFinite(progressMax) ? progressMax : undefined,
    },
  };
}

function finiteSnapshotNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function normalizedXboxSnapshot(value = {}) {
  const snapshot = value && typeof value === 'object' ? value : {};
  const result = { earned: snapshot.earned === true };
  const earnedTime = finiteSnapshotNumber(snapshot.earned_time);
  if (earnedTime && earnedTime > 0) result.earned_time = Math.floor(earnedTime);
  for (const field of ['progress', 'max_progress']) {
    const number = finiteSnapshotNumber(snapshot[field]);
    if (number !== undefined) result[field] = number;
  }
  return result;
}

// Convert the normalized achievement rows returned by Xbox Network into the cache shape used by
// both the library parser and the Watchdog. Keeping this separate from importLibrary makes the
// state write deterministic and prevents the schema-only import from silently displaying 0%.
function buildXboxStateSnapshot(achievements = []) {
  const snapshot = {};
  for (const achievement of Array.isArray(achievements) ? achievements : []) {
    const id = String(achievement?.id || '').trim();
    if (!id) continue;
    snapshot[id] = normalizedXboxSnapshot(achievement.snapshot);
  }
  return snapshot;
}

// Xbox's API can briefly return stale/partial state while a title is synchronizing. Merge fresh
// imports monotonically with the existing local snapshot: an already observed unlock is never
// cleared, its earliest known unlock time is retained, and numeric progress never moves backwards.
// Unknown old ids stay in the cache too, so a schema refresh cannot erase a live Watchdog update.
function mergeXboxStateSnapshots(previous = {}, fresh = {}) {
  const before = previous && typeof previous === 'object' && !Array.isArray(previous) ? previous : {};
  const incoming = fresh && typeof fresh === 'object' && !Array.isArray(fresh) ? fresh : {};
  const merged = {};
  for (const id of new Set([...Object.keys(before), ...Object.keys(incoming)])) {
    const oldValue = normalizedXboxSnapshot(before[id]);
    const newValue = normalizedXboxSnapshot(incoming[id]);
    const entry = { earned: oldValue.earned || newValue.earned };

    const times = [oldValue.earned_time, newValue.earned_time].filter((value) => value && value > 0);
    if (times.length) entry.earned_time = Math.min(...times);

    for (const field of ['progress', 'max_progress']) {
      const values = [oldValue[field], newValue[field]].filter((value) => value !== undefined);
      if (values.length) entry[field] = Math.max(...values);
    }
    merged[id] = entry;
  }
  return merged;
}

// ---- Watchdog polling: the loop itself lives in watchdog/watchdog.js and watchdog/util/xboxPolling.js

const ensureSession = (auth) =>
  ensureXboxDirectSession({ auth, minimumValidityMs: WATCHDOG_SESSION_VALIDITY_MS, keepAuthOnFailure: true });

function buildSnapshot(rows) {
  return buildXboxStateSnapshot((Array.isArray(rows) ? rows : []).map(normalizeXboxAchievement));
}

function diffSnapshots(previous = {}, next = {}) {
  const newUnlocked = [];
  let changed = false;
  const allKeys = new Set([...Object.keys(previous || {}), ...Object.keys(next || {})]);
  for (const key of allKeys) {
    const prev = previous[key] || {};
    const nxt = next[key] || {};
    if (Boolean(prev.earned) !== Boolean(nxt.earned) || Number(prev.earned_time || 0) !== Number(nxt.earned_time || 0)) changed = true;
    if (nxt.earned && !prev.earned) newUnlocked.push(key);
  }
  return { changed, newUnlocked };
}

// Merged like the library import: a stale reply while a title syncs must not drop an unlock seen
// before, or the next poll would announce it a second time.
function nextSnapshot(previousSnapshot, rows) {
  const snapshot = mergeXboxStateSnapshots(previousSnapshot, buildSnapshot(rows));
  return { snapshot, ...diffSnapshots(previousSnapshot, snapshot) };
}

async function pollOnce({ auth, titleId, previousSnapshot = {} }) {
  return nextSnapshot(previousSnapshot, await fetchXboxTitleAchievements(auth.xuid, titleId, { auth }));
}

function readState(titleId) {
  const parsed = readJson(stateCacheFile(titleId));
  return parsed && typeof parsed === 'object' ? parsed : {};
}

// The library import writes this file too; merging keeps what either side has seen.
function writeState(titleId, snapshot) {
  try {
    writeJson(stateCacheFile(titleId), mergeXboxStateSnapshots(readState(titleId), snapshot));
  } catch (err) {
    // A snapshot that is not written makes the next start announce these unlocks again.
    console.warn(`[xbox-pc] could not store the unlock snapshot of ${titleId} (${err.message || err})`);
  }
}

const readSchema = (titleId) => readJson(schemaCacheFile(titleId));

module.exports = {
  XBOX_PC_CLIENT_ID,
  XBOX_PC_OAUTH_SCOPE,
  XBOX_ACHIEVEMENTS_URL,
  setUserDataPath,
  getUserDataPath,
  firstNonEmpty,
  normalizeTitleId,
  normalizeXuid,
  authFile,
  cacheDir,
  schemaCacheFile,
  stateCacheFile,
  readJson,
  writeJson,
  exchangeLiveTokenForXboxSession,
  saveAuth,
  loadAuth,
  clearAuth,
  ensureXboxDirectSession,
  xboxServiceGetAll,
  fetchXboxTitleAchievements,
  normalizeXboxAchievement,
  buildXboxStateSnapshot,
  mergeXboxStateSnapshots,
  ensureSession,
  buildSnapshot,
  diffSnapshots,
  nextSnapshot,
  pollOnce,
  readState,
  writeState,
  readSchema,
};
