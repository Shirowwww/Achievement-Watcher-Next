'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { resolveToastIdentity, requiresLocalImages, ACHIEVEMENT_WATCHER_AUMID } = require('../util/toastIdentity.js');

// Off Windows there is no AppUserModelID to look up: the desktop notification service needs none,
// so nothing is enumerated and nothing warns that toasts will be discarded.
test('off Windows the identity needs no registry and still prefetches artwork', { skip: process.platform === 'win32' && 'Linux-only' }, async () => {
  const lines = [];
  const log = { log: (m) => lines.push(m), warn: (m) => lines.push(m), error: (m) => lines.push(m) };
  const identity = await resolveToastIdentity({}, { log });
  assert.deepEqual(identity, { id: ACHIEVEMENT_WATCHER_AUMID, why: 'desktop notification', registered: true });
  assert.deepEqual(lines, []);
  assert.equal(requiresLocalImages(identity.id), true);
});
