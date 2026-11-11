'use strict';

const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const rockstarAuth = require('../../app/util/rockstarAuth.js');

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-rockstar-auth-'));
after(() => fs.rmSync(temp, { recursive: true, force: true }));

// A reversible stand-in for util/aes.js, so a test can tell what reached the disk.
const cipher = {
  encrypt: (text) => 'enc:' + Buffer.from(text, 'utf8').toString('base64'),
  decrypt: (text) => Buffer.from(String(text).slice(4), 'base64').toString('utf8'),
};

function profile(name) {
  const userDataDir = path.join(temp, name);
  fs.mkdirSync(path.join(userDataDir, 'cfg'), { recursive: true });
  return { userDataDir, cipher };
}

const b64url = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
const jwt = (claims) => `${b64url({ alg: 'RS256' })}.${b64url(claims)}.sig`;

test('only the Rockstar cookies are kept, with the fields needed to put them back', () => {
  const kept = rockstarAuth.keepCookies([
    { name: 'rsso-abc', value: 'session', domain: 'signin.rockstargames.com', path: '/', secure: true, httpOnly: true, expirationDate: 2e9, sameSite: 'lax' },
    { name: 'BearerToken', value: 'x.y.z', domain: '.rockstargames.com', path: '/' },
    { name: '_ga', value: 'tracker', domain: '.google.com', path: '/' },
    { name: 'evil', value: 'x', domain: 'rockstargames.com.attacker.net', path: '/' },
    { name: 'huge', value: 'a'.repeat(9000), domain: 'socialclub.rockstargames.com', path: '/' },
    null,
  ]);
  assert.deepEqual(
    kept.map((c) => c.name),
    ['rsso-abc', 'BearerToken']
  );
  assert.deepEqual(kept[0], { name: 'rsso-abc', value: 'session', domain: 'signin.rockstargames.com', path: '/', secure: true, httpOnly: true, expirationDate: 2e9 });
});

test('the bearer token is the Social Club one, and only when it looks like a token', () => {
  const token = jwt({ exp: 2000000000 });
  assert.equal(rockstarAuth.bearerFromCookies([{ name: 'BearerToken', value: token, domain: 'socialclub.rockstargames.com' }]), token);
  assert.equal(rockstarAuth.bearerFromCookies([{ name: 'BearerToken', value: token, domain: 'www.rockstargames.com' }]), '');
  assert.equal(rockstarAuth.bearerFromCookies([{ name: 'BearerToken', value: 'not a jwt', domain: 'socialclub.rockstargames.com' }]), '');
  assert.equal(rockstarAuth.bearerFromCookies(undefined), '');
  assert.equal(rockstarAuth.jwtExpiry(token), 2000000000 * 1000);
  assert.equal(rockstarAuth.jwtExpiry('garbage'), 0);
});

test('the profile answer gives the account id and name, and nothing for a malformed id', () => {
  const body = { accounts: [{ rockstarAccount: { rockstarId: 123456789, displayName: 'Player' } }] };
  assert.deepEqual(rockstarAuth.profileFromBasic(body), { rockstarId: '123456789', displayName: 'Player' });
  assert.equal(rockstarAuth.profileFromBasic({ accounts: [{ rockstarAccount: { rockstarId: '12; drop' } }] }), null);
  assert.equal(rockstarAuth.profileFromBasic(null), null);
});

test('an unlocks query is only built for a known title, platform and account id', () => {
  const url = rockstarAuth.awardedUrl({ title: 'gtav', platform: 'pcalt' }, '123');
  assert.equal(url, 'https://scapi.rockstargames.com/achievements/awardedAchievements?title=gtav&platform=pcalt&rockstarId=123');
  assert.equal(rockstarAuth.awardedUrl({ title: 'gtav&x=1', platform: 'pc' }, '123'), null);
  assert.equal(rockstarAuth.awardedUrl({ title: 'gtav', platform: 'ps5' }, '123'), null);
  assert.equal(rockstarAuth.awardedUrl({ title: 'gtav', platform: 'pc' }, 'abc'), null);
});

test('the unlock answer keeps the achieved entries only, as unlock times in seconds', () => {
  // The shape scapi answers: every achievement of the title, locked ones with achieved false.
  const awarded = rockstarAuth.parseAwarded({
    awardedAchievements: {
      1: { id: 1, progress: 100, achieved: true, dateAchieved: '2026-11-09T22:30:30.200Z' },
      2: { id: 2, progress: 40, achieved: false, dateAchieved: '0001-01-01T00:00:00.000Z' },
      12: { id: 12, achieved: true, dateAchieved: 'not a date' },
      __proto__x: { achieved: true, dateAchieved: '2025-03-11T20:15:00Z' },
      13: null,
    },
  });
  assert.deepEqual(Object.keys(awarded).sort(), ['1', '12']);
  assert.equal(awarded['1'], Math.floor(Date.parse('2026-11-09T22:30:30.200Z') / 1000));
  assert.equal(awarded['12'], 0);
  assert.deepEqual(rockstarAuth.parseAwarded({}), {});
});

test('the session is written encrypted, read back, reported and cleared', () => {
  const options = profile('state');
  assert.deepEqual(rockstarAuth.status(options), { connected: false });
  const cookies = [{ name: 'rsso-abc', value: 'secret-session', domain: 'signin.rockstargames.com', path: '/' }];
  rockstarAuth.writeState(options, { cookies, rockstarId: '42', displayName: 'Player' });
  const onDisk = fs.readFileSync(rockstarAuth.authFile(options.userDataDir), 'utf8');
  assert.ok(onDisk.startsWith('enc:'));
  assert.ok(!onDisk.includes('secret-session'));
  assert.equal(rockstarAuth.readState(options).rockstarId, '42');
  assert.deepEqual(rockstarAuth.status(options), { connected: true, displayName: 'Player', needsReconnect: false });
  rockstarAuth.writeState(options, { ...rockstarAuth.readState(options), needsReconnect: true });
  assert.equal(rockstarAuth.status(options).needsReconnect, true);
  rockstarAuth.clear(options);
  assert.deepEqual(rockstarAuth.status(options), { connected: false });
});

test('a file that cannot be decrypted reads as not connected', () => {
  const options = profile('broken');
  fs.writeFileSync(rockstarAuth.authFile(options.userDataDir), 'enc:%%%');
  assert.equal(rockstarAuth.readState(options), null);
  assert.deepEqual(rockstarAuth.status(options), { connected: false });
});
