'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { test } = require('node:test');

const { encodeMessage, decodeMessage, messageLength, splitTypes } = require(path.join(__dirname, '..', '..', 'app', 'util', 'dbusWire.js'));
const { socketPath } = require(path.join(__dirname, '..', '..', 'app', 'util', 'dbusSession.js'));

test('signatures split into complete types', () => {
  assert.deepEqual(splitTypes('sa{sv}'), ['s', 'a{sv}']);
  assert.deepEqual(splitTypes('ua{sv}(ii)as'), ['u', 'a{sv}', '(ii)', 'as']);
});

test('the Screenshot call is encoded the way the bus expects', () => {
  const message = encodeMessage({
    type: 'call',
    serial: 7,
    path: '/org/freedesktop/portal/desktop',
    interface: 'org.freedesktop.portal.Screenshot',
    member: 'Screenshot',
    destination: 'org.freedesktop.portal.Desktop',
    signature: 'sa{sv}',
    body: ['', { handle_token: ['s', 'aw_1'], interactive: ['b', false] }],
  });
  assert.equal(message[0], 0x6c, 'little-endian');
  assert.equal(message[1], 1, 'a method call');
  assert.equal(messageLength(message), message.length);
  assert.equal(messageLength(message.subarray(0, 10)), 0, 'not enough to know yet');

  const decoded = decodeMessage(message);
  assert.equal(decoded.serial, 7);
  assert.equal(decoded.member, 'Screenshot');
  assert.equal(decoded.signature, 'sa{sv}');
  assert.deepEqual(decoded.body, ['', { handle_token: ['s', 'aw_1'], interactive: ['b', false] }]);
});

test("a portal's Response signal is read back with its results", () => {
  const signal = encodeMessage({
    type: 'signal',
    serial: 3,
    path: '/org/freedesktop/portal/desktop/request/1_42/aw_1',
    interface: 'org.freedesktop.portal.Request',
    member: 'Response',
    signature: 'ua{sv}',
    body: [0, { uri: ['s', 'file:///home/me/Pictures/Screenshot.png'] }],
  });
  const decoded = decodeMessage(signal);
  assert.equal(decoded.type, 'signal');
  assert.deepEqual(decoded.body, [0, { uri: ['s', 'file:///home/me/Pictures/Screenshot.png'] }]);
});

test('the session bus address is read in both socket forms', () => {
  assert.equal(socketPath('unix:path=/run/user/1000/bus'), '/run/user/1000/bus');
  assert.equal(socketPath('unix:abstract=/tmp/dbus-x,guid=abc'), '\0/tmp/dbus-x');
  assert.equal(socketPath(''), '');
});
