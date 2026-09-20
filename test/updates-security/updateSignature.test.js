'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { evaluateUpdateSignature, isPinnedThumbprint, PINNED_THUMBPRINTS } = require('../../app/util/updateSignature.js');

const RELEASE = '2E581B204231D7EED9E33E798B5E0C503AD8FEDC';
const STANDBY = 'F64838216091CCC975320E8A2D50F4F403837667';
// The CN rules below are about the name alone, so they run without a pin list.
const byName = { pinned: [] };

test('a Shirow self-signed update is accepted even when Windows does not trust its root', () => {
  assert.equal(
    evaluateUpdateSignature(['Shirow'], {
      Status: 'UnknownError',
      SignerCertificate: { Subject: 'CN=Shirow', Thumbprint: RELEASE },
    }),
    null
  );
});

test('an installer signed by another publisher is rejected', () => {
  assert.match(
    evaluateUpdateSignature(['Shirow'], {
      Status: 'Valid',
      SignerCertificate: { Subject: 'CN=Someone Else' },
    }),
    /not signed by Shirow/
  );
});

test('the publisher common name must match exactly', () => {
  assert.equal(
    evaluateUpdateSignature(['Shirow'], {
      Status: 'Valid',
      SignerCertificate: { Subject: 'CN=Shirow Evil, O=Someone Else' },
    }, byName),
    'installer is not signed by Shirow (subject: CN=Shirow Evil, O=Someone Else)'
  );
  assert.equal(
    evaluateUpdateSignature(['Shirow'], {
      Status: 'NotTrusted',
      SignerCertificate: { Subject: 'CN=Shirow, O=Achievement Watcher' },
    }, byName),
    null
  );
});

test('an unsigned installer is refused: its SHA-512 comes from the same feed as the file', () => {
  assert.equal(evaluateUpdateSignature(['Shirow'], { Status: 'NotSigned' }), 'installer is not signed');
  assert.equal(evaluateUpdateSignature(['Shirow'], { Status: 'NotSigned' }, byName), 'installer is not signed');
});

test('a CN=Shirow certificate that is not pinned is refused', () => {
  assert.match(
    evaluateUpdateSignature(['Shirow'], {
      Status: 'Valid',
      SignerCertificate: { Subject: 'CN=Shirow', Thumbprint: 'AB'.repeat(20) },
    }),
    /unknown certificate \(thumbprint: (?:AB){20}\)/
  );
});

test('both the release and the standby certificate are pinned, whatever the thumbprint spelling', () => {
  assert.deepEqual([...PINNED_THUMBPRINTS], [RELEASE, STANDBY]);
  assert.ok(Object.isFrozen(PINNED_THUMBPRINTS));
  for (const thumbprint of [RELEASE, STANDBY, STANDBY.toLowerCase(), STANDBY.replace(/(..)/g, '$1 ')]) {
    assert.equal(
      evaluateUpdateSignature(['Shirow'], { Status: 'NotTrusted', SignerCertificate: { Subject: 'CN=Shirow', Thumbprint: thumbprint } }),
      null,
      thumbprint
    );
  }
  assert.equal(isPinnedThumbprint(''), false);
  assert.equal(isPinnedThumbprint(undefined), false);
});

test('a pinned certificate cannot rescue a file modified after signing', () => {
  assert.match(
    evaluateUpdateSignature(['Shirow'], { Status: 'HashMismatch', SignerCertificate: { Subject: 'CN=Shirow', Thumbprint: RELEASE } }),
    /does not match its signature/
  );
});
