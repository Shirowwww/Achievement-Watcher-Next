'use strict';

const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const psnAuth = require('../../app/util/psnAuth.js');

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-psn-auth-'));
after(() => fs.rmSync(temp, { recursive: true, force: true }));

// A reversible stand-in for util/aes.js, so a test can tell what reached the disk.
const cipher = {
  encrypt: (text) => 'enc:' + Buffer.from(text, 'utf8').toString('base64'),
  decrypt: (text) => Buffer.from(String(text).slice(4), 'base64').toString('utf8'),
};

const NPSSO = 'a'.repeat(64);
const NOW = Date.UTC(2026, 9, 21, 12);

function profile(name) {
  const userDataDir = path.join(temp, name);
  fs.mkdirSync(path.join(userDataDir, 'cfg'), { recursive: true });
  return { userDataDir, cipher, now: () => NOW };
}

function response(status, body, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Map(Object.entries(headers)),
    json: async () => body,
  };
}

const tokenBody = (access, refresh) => ({ access_token: access, refresh_token: refresh, expires_in: 3600, refresh_token_expires_in: 5184000, token_type: 'bearer' });

test('signing in trades the NPSSO for a code, then for tokens kept encrypted, and keeps no NPSSO', async () => {
  const options = profile('sign-in');
  const calls = [];
  options.fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url).includes('/authorize?')) return response(302, null, { location: 'com.scee.psxandroid.scecompcall://redirect/?code=v3.CODE&cid=x' });
    return response(200, tokenBody('ACCESS-1', 'REFRESH-1'));
  };

  assert.deepEqual(await psnAuth.signIn(NPSSO, options), { ok: true });

  assert.equal(calls[0].init.headers.Cookie, `npsso=${NPSSO}`);
  assert.equal(calls[0].init.redirect, 'manual');
  assert.match(calls[1].url, /\/oauth\/token$/);
  assert.equal(new URLSearchParams(calls[1].init.body).get('code'), 'v3.CODE');
  const stored = fs.readFileSync(psnAuth.authFile(options.userDataDir), 'utf8');
  assert.ok(!stored.includes('ACCESS-1') && !stored.includes('REFRESH-1') && !stored.includes(NPSSO), 'nothing readable on disk');
  assert.deepEqual(await psnAuth.status(options), { connected: true });
});

test('a malformed NPSSO or a refused code stops before anything is stored', async () => {
  const options = profile('refused');
  let asked = 0;
  options.fetchImpl = async () => {
    asked += 1;
    return response(302, null, { location: 'com.scee.psxandroid.scecompcall://redirect/?error=login_required' });
  };
  assert.deepEqual(await psnAuth.signIn('not-a-token', options), { ok: false, error: 'psn-npsso-invalid' });
  assert.equal(asked, 0);
  assert.deepEqual(await psnAuth.signIn(NPSSO, options), { ok: false, error: 'psn-code-refused' });
  assert.equal(fs.existsSync(psnAuth.authFile(options.userDataDir)), false);
});

test('an expired access token is renewed with the refresh token, and the new pair replaces it', async () => {
  const options = profile('refresh');
  options.fetchImpl = async (url) => (String(url).includes('/authorize?') ? response(302, null, { location: 'x://redirect/?code=v3.A' }) : response(200, tokenBody('OLD', 'REFRESH-OLD')));
  await psnAuth.signIn(NPSSO, options);

  const later = { ...options, now: () => NOW + 2 * 3600 * 1000 };
  const bodies = [];
  later.fetchImpl = async (url, init) => {
    bodies.push(new URLSearchParams(init.body));
    return response(200, tokenBody('NEW', 'REFRESH-NEW'));
  };
  assert.equal(await psnAuth.accessToken(later), 'NEW');
  assert.equal(bodies[0].get('grant_type'), 'refresh_token');
  assert.equal(bodies[0].get('refresh_token'), 'REFRESH-OLD');
  later.fetchImpl = async () => assert.fail('a fresh token is not renewed again');
  assert.equal(await psnAuth.accessToken(later), 'NEW');
});

test('trophy rates come back by trophy id, for a valid list id only', async () => {
  const options = profile('rates');
  options.fetchImpl = async (url) => (String(url).includes('/authorize?') ? response(302, null, { location: 'x://redirect/?code=v3.A' }) : response(200, tokenBody('ACCESS', 'REFRESH')));
  await psnAuth.signIn(NPSSO, options);

  const seen = [];
  options.fetchImpl = async (url, init) => {
    seen.push({ url: String(url), auth: init.headers.Authorization });
    return response(200, { trophies: [{ trophyId: 0, trophyEarnedRate: '36.1', trophyRare: 2 }, { trophyId: 1, trophyEarnedRate: '4.5' }, { trophyId: 2 }] });
  };
  assert.deepEqual(await psnAuth.trophyRates({ npCommId: 'NPWR05818_00', service: 'trophy' }, options), {
    ok: true,
    entries: [
      { name: '0', percent: 36.1 },
      { name: '1', percent: 4.5 },
    ],
  });
  assert.equal(seen[0].url, 'https://m.np.playstation.com/api/trophy/v1/users/me/npCommunicationIds/NPWR05818_00/trophyGroups/all/trophies?npServiceName=trophy');
  assert.equal(seen[0].auth, 'Bearer ACCESS');

  assert.deepEqual(await psnAuth.trophyRates({ npCommId: '../users/me', service: 'trophy' }, options), { ok: false, error: 'psn-list-invalid' });
  assert.deepEqual(await psnAuth.trophyRates({ npCommId: 'NPWR05818_00', service: 'other' }, options), { ok: false, error: 'psn-list-invalid' });
  assert.equal(seen.length, 1, 'an invalid request never leaves the app');

  options.fetchImpl = async () => response(404, { error: { message: 'Resource not found' } });
  assert.deepEqual(await psnAuth.trophyRates({ npCommId: 'NPWR99999_00', service: 'trophy2' }, options), { ok: false, error: 'psn-not-on-account' });
});

test('without an account, or once it is disconnected, nothing is asked', async () => {
  const options = profile('none');
  options.fetchImpl = async () => assert.fail('no request without an account');
  assert.deepEqual(await psnAuth.status(options), { connected: false });
  assert.deepEqual(await psnAuth.trophyRates({ npCommId: 'NPWR05818_00', service: 'trophy' }, options), { ok: false, error: 'psn-not-connected' });

  options.fetchImpl = async (url) => (String(url).includes('/authorize?') ? response(302, null, { location: 'x://redirect/?code=v3.A' }) : response(200, tokenBody('A', 'R')));
  await psnAuth.signIn(NPSSO, options);
  await psnAuth.clear(options);
  assert.deepEqual(await psnAuth.status(options), { connected: false });
  assert.equal(fs.existsSync(psnAuth.authFile(options.userDataDir)), false);
});

test('the NPSSO is read from the sign-in session cookies, nothing else', () => {
  assert.equal(psnAuth.npssoFromCookies([{ name: 'other', value: 'x' }, { name: 'npsso', value: NPSSO }]), NPSSO);
  assert.equal(psnAuth.npssoFromCookies([{ name: 'npsso', value: 'short' }]), '');
  assert.equal(psnAuth.npssoFromCookies(null), '');
});
