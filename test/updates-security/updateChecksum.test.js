'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { isChecksumMismatchError, summarizeUpdaterError } = require('../../app/util/updateChecksum.js');

test('isChecksumMismatchError recognizes electron-updater checksum failures', () => {
  assert.equal(isChecksumMismatchError({ code: 'ERR_CHECKSUM_MISMATCH', message: 'anything' }), true);
  assert.equal(
    isChecksumMismatchError(new Error('sha512 checksum mismatch, expected AAA, got BBB')),
    true
  );
  assert.equal(
    isChecksumMismatchError(new Error('checksum mismatch: expected AAA but got BBB (X-Checksum-Sha2 header)')),
    true
  );
});

test('isChecksumMismatchError rejects unrelated failures', () => {
  assert.equal(isChecksumMismatchError(new Error('network timeout')), false);
  assert.equal(isChecksumMismatchError({ code: 'ENOTFOUND', message: 'getaddrinfo ENOTFOUND' }), false);
  assert.equal(isChecksumMismatchError(null), false);
  assert.equal(isChecksumMismatchError(undefined), false);
});

// The bug behind the "update still failed after clearing the cache" dialog on 3.10.3: GitHub
// answered the releases feed with a 504, electron-updater appended the whole Atom document to the
// error, and our own 3.8.6 release notes inside it contain the words "a checksum mismatch". A
// failed check was therefore treated as a corrupted download.
test('isChecksumMismatchError ignores the phrase inside an embedded release feed', () => {
  const feedError = Object.assign(
    new Error(
      'Cannot parse releases feed: Error: Unable to find latest version on GitHub, please ensure a production release exists: HttpError: 504\n' +
        'XML:\n<feed><entry><content>Safer updates. Differential downloads are disabled; a checksum mismatch clears the poisoned updater cache and retries a complete download once.</content></entry></feed>'
    ),
    { code: 'ERR_UPDATER_INVALID_RELEASE_FEED' }
  );
  assert.equal(isChecksumMismatchError(feedError), false);
  // Same payload with the code stripped, in case a future provider throws a bare Error.
  assert.equal(isChecksumMismatchError(new Error(feedError.message)), false);
});

test('isChecksumMismatchError handles a plain string/object without a message', () => {
  assert.equal(isChecksumMismatchError('checksum mismatch'), true);
  assert.equal(isChecksumMismatchError({}), false);
});

test('summarizeUpdaterError keeps the reason and drops the embedded payload', () => {
  const err = Object.assign(new Error(`Cannot parse releases feed: HttpError: 504\nXML:\n${'x'.repeat(5000)}`), {
    code: 'ERR_UPDATER_INVALID_RELEASE_FEED',
  });
  const summary = summarizeUpdaterError(err);
  assert.ok(summary.length < 200, `summary should stay short, got ${summary.length} characters`);
  assert.match(summary, /ERR_UPDATER_INVALID_RELEASE_FEED/);
  assert.match(summary, /HttpError: 504/);
  assert.ok(!summary.includes('xxxx'), 'the embedded feed must not survive');
  assert.match(summary, /more characters omitted/);
});

test('summarizeUpdaterError truncates a single very long line', () => {
  const summary = summarizeUpdaterError(new Error('y'.repeat(4000)));
  assert.ok(summary.length <= 320, `expected a truncated summary, got ${summary.length} characters`);
  assert.ok(summary.endsWith('...'));
});

test('summarizeUpdaterError copes with empty and non-Error inputs', () => {
  assert.equal(summarizeUpdaterError(null), 'unknown error');
  assert.equal(summarizeUpdaterError({ code: 'ERR_X', message: '' }), 'ERR_X');
  assert.equal(summarizeUpdaterError('plain string failure'), 'plain string failure');
});
