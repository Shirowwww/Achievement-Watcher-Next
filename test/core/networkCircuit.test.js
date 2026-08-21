'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { createNetworkCircuit, isSteamTransportFailure } = require('../../app/util/networkCircuit.js');

test('an unreachable host is recognised from both fetch and Chromium spellings', () => {
  for (const err of [
    { code: 'ENOTFOUND' },
    new Error('fetch failed'),
    new Error('The operation was aborted due to timeout'),
    'Error: net::ERR_NAME_NOT_RESOLVED at https://steamhunters.com/apps/1/achievements',
    'net::ERR_INTERNET_DISCONNECTED',
    'net::ERR_CONNECTION_RESET',
    'net::ERR_ADDRESS_UNREACHABLE',
    'net::ERR_PROXY_CONNECTION_FAILED',
  ]) {
    assert.equal(isSteamTransportFailure(err), true, `${err} should count as a transport failure`);
  }
});

test('a real answer from a reachable host is not a transport failure', () => {
  for (const err of [new Error('HTTP 429'), new Error('Unsupported API language code'), 'not found', '']) {
    assert.equal(isSteamTransportFailure(err), false, `${err} must not open the breaker`);
  }
});

test('the breaker opens on the configured failure count and reports it once', () => {
  let clock = 1000;
  const circuit = createNetworkCircuit({ failureLimit: 2, cooldownMs: 5000, now: () => clock });

  assert.equal(circuit.unavailable(), false);
  assert.equal(circuit.recordFailure(), false, 'one failure is not enough');
  assert.equal(circuit.unavailable(), false);
  assert.equal(circuit.recordFailure(), true, 'the second failure opens it and says so');
  assert.equal(circuit.unavailable(), true);
  assert.equal(circuit.recordFailure(), false, 'an already-open breaker does not re-announce');

  clock += 4999;
  assert.equal(circuit.unavailable(), true);
  clock += 2;
  assert.equal(circuit.unavailable(), false, 'the cooldown expires on its own');
});

test('a success closes the breaker immediately and clears the failure run', () => {
  let clock = 0;
  const circuit = createNetworkCircuit({ failureLimit: 2, cooldownMs: 5000, now: () => clock });
  circuit.recordFailure();
  circuit.recordSuccess();
  assert.equal(circuit.recordFailure(), false, 'the earlier failure no longer counts');

  circuit.recordFailure();
  assert.equal(circuit.unavailable(), true);
  circuit.recordSuccess();
  assert.equal(circuit.unavailable(), false);
});

test('only counted failures move the breaker', () => {
  let clock = 0;
  const circuit = createNetworkCircuit({
    failureLimit: 2,
    cooldownMs: 5000,
    now: () => clock,
    shouldCount: isSteamTransportFailure,
  });
  for (let i = 0; i < 5; i += 1) circuit.recordFailure(new Error('HTTP 500'));
  assert.equal(circuit.unavailable(), false);
  circuit.recordFailure(new Error('fetch failed'));
  circuit.recordFailure('net::ERR_NAME_NOT_RESOLVED');
  assert.equal(circuit.unavailable(), true);
});
