'use strict';

/*
  The websocket broadcast must stay on the loopback interface.

  `server.listen({ host: null })` is the same as omitting the host, so the feed used to be reachable
  from the whole network with no authentication - while the Settings row is labelled
  "Websocket @localhost:8082" and the documentation promised the local machine. Two halves are
  checked here: the default the module resolves, and what Node actually binds when given it.
*/

const assert = require('node:assert/strict');
const http = require('node:http');
const test = require('node:test');

const websocket = require('../websocket.js');

test('the broadcast defaults to loopback, and an explicit host still wins', () => {
  assert.equal(websocket.LOOPBACK, '127.0.0.1');
  assert.equal(websocket.resolveOptions().host, '127.0.0.1');
  assert.equal(websocket.resolveOptions({}).host, '127.0.0.1');
  assert.equal(websocket.resolveOptions({ host: '' }).host, '127.0.0.1', 'an empty host is not a request to serve the network');
  assert.equal(websocket.resolveOptions({ host: null }).host, '127.0.0.1');
  // Deliberately serving the network stays possible for a caller that asks for it.
  assert.equal(websocket.resolveOptions({ host: '0.0.0.0' }).host, '0.0.0.0');

  // The rest of the defaults are the contract the Watchdog relies on.
  assert.equal(websocket.resolveOptions().port, 8082);
  assert.equal(websocket.resolveOptions({ port: 9000 }).port, 9000);
  assert.equal(websocket.resolveOptions({ port: 'nope' }).port, 8082);
  assert.equal(websocket.resolveOptions().auth, null);
});

test('listening with the resolved default binds the loopback address, not the unspecified one', async () => {
  const options = websocket.resolveOptions();
  const server = http.createServer();
  try {
    // Port 0 so the test never fights the running app for 8082; the host is what is under test.
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen({ port: 0, host: options.host, ipv6Only: options.ipv6Only }, resolve);
    });
    const address = server.address();
    assert.equal(address.address, '127.0.0.1', 'binding must not fall through to 0.0.0.0 or ::');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
