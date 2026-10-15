'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const websocket = require('../websocket.js');

const OPEN = 1;
const CLOSED = 3;

test('the Decky plugin is told apart by the client named in its connection URL', () => {
  assert.equal(websocket.isDeckyRequest('/?client=decky'), true);
  assert.equal(websocket.isDeckyRequest('/'), false);
  assert.equal(websocket.isDeckyRequest('/?client=obs'), false);
  assert.equal(websocket.isDeckyRequest(undefined), false);
});

test('the plugin counts as listening only while its connection is open', () => {
  assert.equal(websocket.isDeckyListening([{ decky: true, readyState: OPEN }]), true);
  assert.equal(websocket.isDeckyListening([{ decky: true, readyState: CLOSED }]), false);
  assert.equal(websocket.isDeckyListening([{ decky: false, readyState: OPEN }]), false);
  assert.equal(websocket.isDeckyListening(), false, 'no server started yet');
});
