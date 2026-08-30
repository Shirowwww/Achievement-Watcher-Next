'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const steamAuth = require('../../app/util/steamAuth.js');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-steam-auth-'));

// Synthetic JWT: header and signature are never verified, only the payload is read.
function fakeJwt(payload) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ typ: 'JWT', alg: 'none' })}.${b64(payload)}.signature`;
}

test('the expiry is read from the JWT payload', () => {
  const token = fakeJwt({ exp: 1800000000, sub: '76561198235048344' });
  assert.equal(steamAuth.parseJwtExpiry(token), 1800000000 * 1000);
  assert.equal(steamAuth.parseJwtExpiry('pas-un-jwt'), 0);
  assert.equal(steamAuth.parseJwtExpiry(''), 0);
});

test('the steamid is extracted from the login cookie', () => {
  assert.equal(steamAuth.steamIdFromLoginCookie('76561198235048344%7C%7Cabcdef'), '76561198235048344');
  assert.equal(steamAuth.steamIdFromLoginCookie('76561198235048344||abcdef'), '76561198235048344');
  assert.equal(steamAuth.steamIdFromLoginCookie('nawak'), '');
  assert.equal(steamAuth.steamIdFromLoginCookie(''), '');
});

test('encryption round-trips and fails with the wrong secret', () => {
  const payload = { webapi_token: 'TOKEN', steamid: '76561198235048344', persona: 'Shirow', expiresAt: 1800000000000 };
  const blob = steamAuth.encryptSession(payload, 'passphrase');
  assert.notEqual(String(blob), '');
  assert.ok(!String(blob).includes('TOKEN'));
  const back = steamAuth.decryptSession(blob, 'passphrase');
  assert.equal(back.webapi_token, 'TOKEN');
  assert.equal(back.persona, 'Shirow');
  assert.throws(() => steamAuth.decryptSession(blob, 'mauvais'));
});

test('the status reflects whether a token is there and still fresh', async () => {
  const sessionFile = path.join(tmp, 'steam_session.enc');
  const opts = { sessionFile, tokenSecret: 'passphrase' };

  assert.equal((await steamAuth.getSteamAuthStatus(opts)).connected, false);

  await steamAuth.saveSessionEncrypted(
    sessionFile,
    {
      webapi_token: 'TOKEN',
      steamid: '76561198235048344',
      persona: 'Shirow',
      expiresAt: Date.now() + 3600 * 1000,
    },
    'passphrase'
  );

  const fresh = await steamAuth.getSteamAuthStatus(opts);
  assert.equal(fresh.connected, true);
  assert.equal(fresh.steamid, '76561198235048344');
  assert.equal(fresh.persona, 'Shirow');
  assert.equal(fresh.needsReconnect, false);

  await steamAuth.saveSessionEncrypted(
    sessionFile,
    {
      webapi_token: 'TOKEN',
      steamid: '76561198235048344',
      persona: 'Shirow',
      expiresAt: Date.now() - 1000,
    },
    'passphrase'
  );

  const stale = await steamAuth.getSteamAuthStatus(opts);
  assert.equal(stale.needsReconnect, true);

  await steamAuth.clearSteamSession({ sessionFile });
  assert.equal((await steamAuth.getSteamAuthStatus(opts)).connected, false);
});

/*
  The points-summary page returns {"success":1,"data":{"webapi_token":"..."}}. Reading
  body.webapi_token at the root always came back empty, so every connection failed on
  steam-token-missing.
*/
test('the token is read under data, the shape Steam actually returns', async () => {
  const session = { fetch: async () => ({ ok: true, json: async () => ({ success: 1, data: { webapi_token: 'NESTED' } }) }) };
  assert.equal(await steamAuth.fetchWebApiToken(session), 'NESTED');
});

test('a token at the root is still accepted', async () => {
  const session = { fetch: async () => ({ ok: true, json: async () => ({ webapi_token: 'ROOT' }) }) };
  assert.equal(await steamAuth.fetchWebApiToken(session), 'ROOT');
});

test('a response with no token is an unauthenticated session, not an empty token', async () => {
  const session = { fetch: async () => ({ ok: true, json: async () => ({ success: 1, data: {} }) }) };
  await assert.rejects(() => steamAuth.fetchWebApiToken(session), /steam-token-missing/);
});

test('the persona is extracted from the profile, with or without CDATA', () => {
  assert.equal(steamAuth.personaFromProfileXml('<profile><steamID><![CDATA[Shirow]]></steamID></profile>'), 'Shirow');
  assert.equal(steamAuth.personaFromProfileXml('<profile><steamID>Shirow</steamID></profile>'), 'Shirow');
  assert.equal(steamAuth.personaFromProfileXml('<profile></profile>'), '');
  assert.equal(steamAuth.personaFromProfileXml(''), '');
});

/*
  The public API does not always answer a webapi_token, and the steamid shown in place of the
  persona name is a meaningless string of digits. The profile read by the logged-in session takes
  over.
*/
test('the persona falls back to the profile when the public API does not answer', async () => {
  const fetchImpl = async () => ({ ok: false, status: 403, json: async () => ({}) });
  const session = { fetch: async () => ({ ok: true, text: async () => '<profile><steamID><![CDATA[Shirow]]></steamID></profile>' }) };
  assert.equal(await steamAuth.fetchPersona('T', '76561198235048344', { fetchImpl, session }), 'Shirow');
});

test('the public API persona is preferred when there is one', async () => {
  const fetchImpl = async () => ({ ok: true, json: async () => ({ response: { players: [{ personaname: 'DepuisAPI' }] } }) });
  let usedSession = false;
  const session = {
    fetch: async () => {
      usedSession = true;
      return { ok: true, text: async () => '<steamID>DepuisProfil</steamID>' };
    },
  };
  assert.equal(await steamAuth.fetchPersona('T', '76561198235048344', { fetchImpl, session }), 'DepuisAPI');
  assert.equal(usedSession, false);
});

test('both sources going quiet yields an empty string, never an error', async () => {
  const fetchImpl = async () => {
    throw new Error('offline');
  };
  assert.equal(await steamAuth.fetchPersona('T', '76561198235048344', { fetchImpl, session: null }), '');
});

test('ensureSteamToken returns the cached token with no network call', async () => {
  const sessionFile = path.join(tmp, 'cached.enc');
  await steamAuth.saveSessionEncrypted(
    sessionFile,
    {
      webapi_token: 'CACHED',
      steamid: '76561198235048344',
      expiresAt: Date.now() + 3600 * 1000,
    },
    'passphrase'
  );

  let called = false;
  const session = {
    fetch: async () => {
      called = true;
      throw new Error('ne doit pas etre appele');
    },
  };
  const token = await steamAuth.ensureSteamToken({ sessionFile, tokenSecret: 'passphrase', session });
  assert.equal(token, 'CACHED');
  assert.equal(called, false);
});

test('ensureSteamToken re-reads the token once the cache has expired', async () => {
  const sessionFile = path.join(tmp, 'expired.enc');
  await steamAuth.saveSessionEncrypted(
    sessionFile,
    {
      webapi_token: 'OLD',
      steamid: '76561198235048344',
      expiresAt: Date.now() - 1000,
    },
    'passphrase'
  );

  const fresh = fakeJwt({ exp: Math.floor(Date.now() / 1000) + 3600 });
  const session = { fetch: async () => ({ ok: true, json: async () => ({ webapi_token: fresh }) }) };
  const token = await steamAuth.ensureSteamToken({ sessionFile, tokenSecret: 'passphrase', session });
  assert.equal(token, fresh);

  const status = await steamAuth.getSteamAuthStatus({ sessionFile, tokenSecret: 'passphrase' });
  assert.equal(status.needsReconnect, false);
});

test('ensureSteamToken returns an empty string when the session is dead', async () => {
  const sessionFile = path.join(tmp, 'dead.enc');
  await steamAuth.saveSessionEncrypted(
    sessionFile,
    {
      webapi_token: 'OLD',
      steamid: '76561198235048344',
      expiresAt: Date.now() - 1000,
    },
    'passphrase'
  );

  const session = { fetch: async () => ({ ok: false, status: 401, json: async () => ({}) }) };
  assert.equal(await steamAuth.ensureSteamToken({ sessionFile, tokenSecret: 'passphrase', session }), '');
});

/*
  Steam does not always name the account while the sign-in window is still open, and the card then
  reads "Connected: 76561198…", which names nobody. The name is asked for again later and kept.
*/
test('a persona missing from the session is resolved once and written back', async () => {
  const sessionFile = path.join(tmp, 'persona-refresh.enc');
  const token = fakeJwt({ exp: 1800000000 });
  await steamAuth.saveSessionEncrypted(sessionFile, { webapi_token: token, steamid: '76561198235048344', persona: '', expiresAt: 1800000000000 }, 'secret');

  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return { ok: true, json: async () => ({ response: { players: [{ personaname: 'Shirow' }] } }) };
  };

  assert.equal(await steamAuth.refreshPersona({ sessionFile, tokenSecret: 'secret', fetchImpl }), 'Shirow');
  assert.equal(calls, 1);

  const status = await steamAuth.getSteamAuthStatus({ sessionFile, tokenSecret: 'secret' });
  assert.equal(status.persona, 'Shirow', 'the name has to survive a restart');

  // A name already known is never asked for again.
  assert.equal(await steamAuth.refreshPersona({ sessionFile, tokenSecret: 'secret', fetchImpl }), 'Shirow');
  assert.equal(calls, 1);
});

test('a persona Steam will not give is not an error, and writes nothing', async () => {
  const sessionFile = path.join(tmp, 'persona-quiet.enc');
  const token = fakeJwt({ exp: 1800000000 });
  await steamAuth.saveSessionEncrypted(sessionFile, { webapi_token: token, steamid: '76561198235048344', persona: '', expiresAt: 1800000000000 }, 'secret');

  const fetchImpl = async () => ({ ok: false, status: 401, json: async () => ({}) });
  assert.equal(await steamAuth.refreshPersona({ sessionFile, tokenSecret: 'secret', fetchImpl }), '');
  const status = await steamAuth.getSteamAuthStatus({ sessionFile, tokenSecret: 'secret' });
  assert.equal(status.connected, true, 'a nameless account is still a connected one');
});

/*
  The owned-games call is refused without a steamid, so a session file that lost it leaves ownership
  and playtime silently dead for an account that looks perfectly connected. The sign-in cookie is
  still there and still says who it is.
*/
test('a steamid missing from the session is recovered from the login cookie', async () => {
  const sessionFile = path.join(tmp, 'steamid-recover.enc');
  const token = fakeJwt({ exp: 1800000000 });
  await steamAuth.saveSessionEncrypted(sessionFile, { webapi_token: token, steamid: '', persona: '', expiresAt: 1800000000000 }, 'secret');

  const session = { cookies: { get: async () => [{ value: '76561198235048344%7C%7Cabcdef' }] } };
  assert.equal(await steamAuth.recoverSteamId({ sessionFile, tokenSecret: 'secret', session }), '76561198235048344');

  const status = await steamAuth.getSteamAuthStatus({ sessionFile, tokenSecret: 'secret' });
  assert.equal(status.steamid, '76561198235048344', 'the id has to survive a restart');
});

test('no cookie means a real disconnection, and nothing is invented', async () => {
  const sessionFile = path.join(tmp, 'steamid-none.enc');
  const token = fakeJwt({ exp: 1800000000 });
  await steamAuth.saveSessionEncrypted(sessionFile, { webapi_token: token, steamid: '', persona: '', expiresAt: 1800000000000 }, 'secret');

  assert.equal(await steamAuth.recoverSteamId({ sessionFile, tokenSecret: 'secret', session: { cookies: { get: async () => [] } } }), '');
  assert.equal(await steamAuth.recoverSteamId({ sessionFile, tokenSecret: 'secret', session: null }), '');
});

/*
  The sign-in cookie is only valid for a day, so a token read from the page dies overnight. Steam
  keeps a separate refresh cookie for months, and this is the whole reason AW no longer asks for a
  sign-in every morning.
*/
test('the refresh cookie yields both the refresh token and the steamid', () => {
  assert.deepEqual(steamAuth.refreshSessionFromCookie('76561198235048344%7C%7CREFRESH'), {
    refreshToken: 'REFRESH',
    steamid: '76561198235048344',
  });
  assert.deepEqual(steamAuth.refreshSessionFromCookie('76561198235048344||REFRESH'), {
    refreshToken: 'REFRESH',
    steamid: '76561198235048344',
  });
  assert.deepEqual(steamAuth.refreshSessionFromCookie(''), { refreshToken: '', steamid: '' });
});

test('the renewal reads access_token under response, the shape Steam returns', async () => {
  let seen = null;
  const fetchImpl = async (url, init) => {
    seen = { url, body: String(init.body) };
    return { ok: true, json: async () => ({ response: { access_token: 'RENEWED' } }) };
  };
  assert.equal(await steamAuth.renewWebApiToken('REFRESH', '76561198235048344', fetchImpl), 'RENEWED');
  assert.equal(seen.url, steamAuth.STEAM_RENEW_URL);
  assert.ok(seen.body.includes('refresh_token=REFRESH'));
  assert.ok(seen.body.includes('steamid=76561198235048344'));
});

test('a renewal Steam refuses is an error, never an empty token', async () => {
  const refused = async () => ({ ok: false, status: 401, json: async () => ({}) });
  await assert.rejects(() => steamAuth.renewWebApiToken('REFRESH', '765', refused), /steam-renew-http-401/);

  const blank = async () => ({ ok: true, json: async () => ({ response: {} }) });
  await assert.rejects(() => steamAuth.renewWebApiToken('REFRESH', '765', blank), /steam-renew-missing/);

  await assert.rejects(() => steamAuth.renewWebApiToken('', '765', blank), /steam-renew-no-refresh-token/);
});

test('an expired sign-in cookie is renewed from the stored refresh token', async () => {
  const sessionFile = path.join(tmp, 'renew-stored.enc');
  await steamAuth.saveSessionEncrypted(
    sessionFile,
    {
      webapi_token: 'OLD',
      steamid: '76561198235048344',
      refresh_token: 'REFRESH',
      expiresAt: Date.now() - 1000,
    },
    'passphrase'
  );

  const fresh = fakeJwt({ exp: Math.floor(Date.now() / 1000) + 3600 });
  // The page read is what fails after a day; the refresh token is the way back in.
  const session = { fetch: async () => ({ ok: false, status: 401, json: async () => ({}) }) };
  const fetchImpl = async () => ({ ok: true, json: async () => ({ response: { access_token: fresh } }) });

  assert.equal(await steamAuth.ensureSteamToken({ sessionFile, tokenSecret: 'passphrase', session, fetchImpl }), fresh);

  const status = await steamAuth.getSteamAuthStatus({ sessionFile, tokenSecret: 'passphrase' });
  assert.equal(status.needsReconnect, false);
  assert.equal(status.steamid, '76561198235048344');
});

/*
  An account connected before AW stored refresh tokens has none in its session file. The cookie jar
  still holds one, so those sessions heal on their own instead of asking for a sign-in.
*/
test('a session file with no refresh token falls back to the cookie jar, then stores it', async () => {
  const sessionFile = path.join(tmp, 'renew-cookie.enc');
  await steamAuth.saveSessionEncrypted(
    sessionFile,
    { webapi_token: 'OLD', steamid: '', expiresAt: Date.now() - 1000 },
    'passphrase'
  );

  const fresh = fakeJwt({ exp: Math.floor(Date.now() / 1000) + 3600 });
  const session = {
    fetch: async () => ({ ok: false, status: 401, json: async () => ({}) }),
    cookies: { get: async () => [{ value: '76561198235048344%7C%7CDEPUISCOOKIE' }] },
  };
  let sentRefresh = '';
  const fetchImpl = async (url, init) => {
    sentRefresh = new URLSearchParams(String(init.body)).get('refresh_token');
    return { ok: true, json: async () => ({ response: { access_token: fresh } }) };
  };

  assert.equal(await steamAuth.ensureSteamToken({ sessionFile, tokenSecret: 'passphrase', session, fetchImpl }), fresh);
  assert.equal(sentRefresh, 'DEPUISCOOKIE');

  const stored = await steamAuth.loadSession({ sessionFile, tokenSecret: 'passphrase' });
  assert.equal(stored.refresh_token, 'DEPUISCOOKIE', 'the next renewal must not depend on the cookie jar again');
  assert.equal(stored.steamid, '76561198235048344');
});

test('a refresh token Steam no longer accepts leaves the account needing a real sign-in', async () => {
  const sessionFile = path.join(tmp, 'renew-refused.enc');
  await steamAuth.saveSessionEncrypted(
    sessionFile,
    { webapi_token: 'OLD', steamid: '76561198235048344', refresh_token: 'PERIME', expiresAt: Date.now() - 1000 },
    'passphrase'
  );

  const session = { fetch: async () => ({ ok: false, status: 401, json: async () => ({}) }) };
  const fetchImpl = async () => ({ ok: false, status: 401, json: async () => ({}) });

  assert.equal(await steamAuth.ensureSteamToken({ sessionFile, tokenSecret: 'passphrase', session, fetchImpl }), '');
  const status = await steamAuth.getSteamAuthStatus({ sessionFile, tokenSecret: 'passphrase' });
  assert.equal(status.needsReconnect, true);
});

/*
  The webapi_token and the sign-in cookie both die after a day, while the refresh token lives for
  months. Steam only answers GenerateAccessTokenForApp for mobile and client tokens, so a session
  opened in the sign-in window has to be signed back in through finalizelogin, exactly as the
  website does for itself. Without it the account read as expired every single morning.
*/
test('an expired session is signed back in with the refresh token', async () => {
  const sessionFile = path.join(tmp, 'web-refresh.enc');
  await steamAuth.saveSessionEncrypted(
    sessionFile,
    { webapi_token: 'OLD', steamid: '76561198235048344', refresh_token: 'REFRESH-OLD', expiresAt: Date.now() - 1000 },
    'passphrase'
  );

  const fresh = fakeJwt({ exp: Math.floor(Date.now() / 1000) + 3600 });
  const posted = [];
  let signedIn = false;
  const session = {
    cookies: {
      get: async () => [{ value: `76561198235048344||${signedIn ? 'REFRESH-NEW' : 'REFRESH-OLD'}` }],
    },
    fetch: async (url, init = {}) => {
      if (url === steamAuth.STEAM_TOKEN_URL) {
        // The sign-in cookie is dead until finalizelogin puts a new one back.
        if (!signedIn) return { ok: false, status: 401, json: async () => ({}) };
        return { ok: true, json: async () => ({ success: 1, data: { webapi_token: fresh } }) };
      }
      posted.push({ url, body: String(init.body || ''), type: String((init.headers || {})['content-type'] || '') });
      if (url === steamAuth.STEAM_FINALIZE_URL) {
        return {
          ok: true,
          json: async () => ({
            steamID: '76561198235048344',
            transfer_info: [
              { url: 'https://store.steampowered.com/login/settoken', params: { nonce: 'N1', auth: 'A1' } },
              { url: 'https://steamcommunity.com/login/settoken', params: { nonce: 'N2', auth: 'A2' } },
            ],
          }),
        };
      }
      signedIn = true;
      return { ok: true, json: async () => ({ result: 1 }) };
    },
  };

  assert.equal(await steamAuth.ensureSteamToken({ sessionFile, tokenSecret: 'passphrase', session }), fresh);

  const finalize = posted.find((call) => call.url === steamAuth.STEAM_FINALIZE_URL);
  assert.ok(finalize.type.startsWith('multipart/form-data; boundary='), 'Steam only reads a multipart form here');
  assert.ok(finalize.body.includes('REFRESH-OLD'), 'the refresh token is the nonce');
  assert.equal(posted.filter((call) => call.url.endsWith('/login/settoken')).length, 2, 'every domain gets its cookie back');

  const status = await steamAuth.getSteamAuthStatus({ sessionFile, tokenSecret: 'passphrase' });
  assert.equal(status.needsReconnect, false);
  // Signing back in retires the old refresh token, so keeping it would break the next renewal.
  const stored = steamAuth.decryptSession(fs.readFileSync(sessionFile, 'utf8'), 'passphrase');
  assert.equal(stored.refresh_token, 'REFRESH-NEW');
});

test('a refresh token Steam refuses falls through instead of throwing', async () => {
  const sessionFile = path.join(tmp, 'web-refresh-refused.enc');
  await steamAuth.saveSessionEncrypted(
    sessionFile,
    { webapi_token: 'OLD', steamid: '76561198235048344', refresh_token: 'DEAD', expiresAt: Date.now() - 1000 },
    'passphrase'
  );

  const session = {
    cookies: { get: async () => [] },
    fetch: async (url) => {
      if (url === steamAuth.STEAM_TOKEN_URL) return { ok: false, status: 401, json: async () => ({}) };
      // Steam reports a dead refresh token as an eresult in a 200 body.
      return { ok: true, json: async () => ({ error: 15 }) };
    },
  };
  const fetchImpl = async () => ({ ok: false, status: 401, json: async () => ({}) });
  assert.equal(await steamAuth.ensureSteamToken({ sessionFile, tokenSecret: 'passphrase', session, fetchImpl }), '');
});

test('finalizelogin answering with no usable transfer is a failure, not a signed-in session', async () => {
  const session = {
    fetch: async () => ({ ok: true, json: async () => ({ steamID: '76561198235048344', transfer_info: [] }) }),
  };
  await assert.rejects(() => steamAuth.refreshWebSession(session, 'REFRESH', '76561198235048344'), /steam-finalize-no-transfer/);
});

test('a transfer no domain accepts leaves no cookie, and says so', async () => {
  const session = {
    fetch: async (url) => {
      if (url === steamAuth.STEAM_FINALIZE_URL) {
        return { ok: true, json: async () => ({ steamID: '7656119', transfer_info: [{ url: 'https://store.steampowered.com/login/settoken', params: {} }] }) };
      }
      return { ok: false, status: 503, json: async () => ({}) };
    },
  };
  await assert.rejects(() => steamAuth.refreshWebSession(session, 'REFRESH', '7656119'), /steam-finalize-no-cookie/);
});
