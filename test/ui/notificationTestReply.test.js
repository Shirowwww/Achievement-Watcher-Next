'use strict';

/*
  #126: the Settings test buttons reported "Unexpected response" and the toast still arrived. The
  test socket is also a client of the notification feed, and the Watchdog broadcasts the test sample
  on that feed before it answers the command, so the sample was read as a malformed reply.
*/

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'ui', 'settings.js'), 'utf8');

function extractNested(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} is defined in settings.js`);
  return source.slice(start, source.indexOf('\n    }\n', start) + 6);
}

// A socket that answers each request with the given messages, in order.
function runTest(cmd, replies) {
  const dialogs = [];
  class FakeSocket {
    constructor() {
      setImmediate(() => this.onopen());
    }
    send(raw) {
      const request = JSON.parse(raw);
      setImmediate(() => {
        for (const message of replies(request)) this.onmessage({ data: JSON.stringify(message) });
      });
    }
    close() {}
  }
  const remote = { dialog: { showMessageBoxSync: (options) => dialogs.push(options) } };
  const t = (_key, english) => english;
  const run = new Function('WebSocket', 'remote', 't', `${extractNested('runNotificationTest')}\nreturn runNotificationTest;`)(FakeSocket, remote, t);
  return { done: run(cmd), dialogs };
}

const SAMPLE = { appID: 480, game: 'Spacewar', displayName: 'Winner', test: true };

test('the feed sample that arrives before the reply does not fail the test', async () => {
  const { done, dialogs } = runTest('toast-test', (request) => [SAMPLE, { cmd: request.cmd, success: true }]);
  await done;
  assert.deepEqual(dialogs, []);
});

test('a reply that reports a failure still fails the test', async () => {
  const { done, dialogs } = runTest('toast-test', (request) => [SAMPLE, { cmd: request.cmd, success: false, error: 'toast refused' }]);
  await assert.rejects(done, (err) => err === 'toast refused');
  assert.equal(dialogs.length, 1);
  assert.equal(dialogs[0].detail, 'toast refused');
});
