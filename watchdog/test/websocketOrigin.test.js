'use strict';

/*
  The feed carries every unlock and accepts commands, and any website can reach loopback. Only the
  OBS page served here, Decky (Steam's CEF), the app's file:// Settings and native programs (no
  Origin) may connect; a DNS-rebound Host is refused on the handshake and on /obs.
*/

const assert = require('node:assert/strict');
const test = require('node:test');

const websocket = require('../websocket.js');

const options = websocket.resolveOptions();

test('a foreign website cannot open the feed', () => {
  for (const origin of ['https://evil.example', 'http://attacker.test:8082', 'null', 'http://127.0.0.1.evil.example']) {
    const refusal = websocket.upgradeRefusal({ host: '127.0.0.1:8082', origin }, options);
    assert.ok(refusal, `origin ${origin} must be refused`);
    assert.equal(refusal.status, 403);
  }
});

test('Decky, OBS, the app and native clients keep their access', () => {
  const allowed = [
    // Decky runs in Steam's SharedJSContext; its own backend allows exactly this origin.
    { host: '127.0.0.1:8082', origin: 'https://steamloopback.host' },
    // The OBS page connects back to the host it was served from.
    { host: '127.0.0.1:8082', origin: 'http://127.0.0.1:8082' },
    { host: 'localhost:8082', origin: 'http://localhost:8082' },
    { host: '[::1]:8082', origin: 'http://[::1]:8082' },
    // Settings' test buttons: Electron sends this for a loadFile page (measured).
    { host: 'localhost:8082', origin: 'file://' },
    // A native client or script sends no Origin.
    { host: '127.0.0.1:8082' },
    { host: '127.0.0.1:8082', origin: '' },
  ];
  for (const headers of allowed) {
    assert.equal(websocket.upgradeRefusal(headers, options), null, JSON.stringify(headers));
  }
});

test('a rebound host name is refused by the handshake and the host check /obs uses', () => {
  const rebound = { host: 'attacker.test:8082', origin: 'http://attacker.test:8082' };
  assert.equal(websocket.upgradeRefusal(rebound, options).status, 403);
  // Same-origin from the rebound page: no Origin mismatch to catch, only the Host gives it away.
  assert.equal(websocket.upgradeRefusal({ host: 'attacker.test:8082' }, options).status, 403);
  assert.equal(websocket.isAllowedHost('attacker.test:8082', options.host), false);
  assert.equal(websocket.isAllowedHost('127.0.0.1.attacker.test', options.host), false);
  assert.equal(websocket.isAllowedHost('localhost.:8082', options.host), false);
});

test('loopback names and the configured host are accepted as Host', () => {
  for (const host of ['127.0.0.1:8082', '127.0.0.1', 'localhost:8082', 'LOCALHOST:8082', '[::1]:8082', undefined]) {
    assert.equal(websocket.isAllowedHost(host, options.host), true, String(host));
  }
  // A caller that deliberately binds another address is reached under that address.
  assert.equal(websocket.isAllowedHost('192.168.1.20:8082', '192.168.1.20'), true);
  assert.equal(websocket.isAllowedHost('192.168.1.20:8082', options.host), false);
});
