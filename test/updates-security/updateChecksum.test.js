'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { isChecksumMismatchError, isMissingLinuxFeed, isOfflineError, summarizeUpdaterError } = require('../../app/util/updateChecksum.js');

// A check made while the PC has no network (asleep, Wi-Fi down) is no failure to report: the next
// automatic check retries. It raised an "Update check failed" balloon at night (24/11/2026).
test('isOfflineError spots a check that never reached the network, and only that', () => {
  for (const message of [
    'net::ERR_NAME_NOT_RESOLVED',
    'net::ERR_INTERNET_DISCONNECTED',
    'Error: net::ERR_NETWORK_CHANGED',
    'net::ERR_CONNECTION_TIMED_OUT',
    'getaddrinfo ENOTFOUND github.com',
    'getaddrinfo EAI_AGAIN github.com',
    'connect ETIMEDOUT 140.82.121.4:443',
  ]) {
    assert.equal(isOfflineError(new Error(message)), true, message);
    assert.equal(isOfflineError(message), true, `${message} (summary text)`);
  }
  assert.equal(isOfflineError({ code: 'ENOTFOUND', message: 'whatever' }), true);
  for (const message of ['HttpError: 404', 'sha512 checksum mismatch, expected A, got B', 'Cannot parse releases feed', '']) {
    assert.equal(isOfflineError(new Error(message)), false, message);
  }
  // Remote text after the first line never counts.
  assert.equal(isOfflineError(new Error('HttpError: 504\nbody mentions net::ERR_NAME_NOT_RESOLVED')), false);
});

test('only an automatic check with no network goes unreported, both times electron-updater reports it', () => {
  const { silencedOfflineFailure } = require('../../app/util/updateChecksum.js');
  const offline = 'net::ERR_NAME_NOT_RESOLVED';
  assert.equal(silencedOfflineFailure({ message: offline, phase: 'checking' }), true, 'the first report');
  assert.equal(silencedOfflineFailure({ message: offline, phase: 'idle', silencedMessage: offline }), true, 'the second report of the same check');
  assert.equal(silencedOfflineFailure({ message: offline, phase: 'checking', manual: true }), false, 'a check the user asked for still says why');
  assert.equal(silencedOfflineFailure({ message: `download failed: ${offline}`, phase: 'downloading' }), false, 'a download that drops is reported');
  assert.equal(silencedOfflineFailure({ message: offline, phase: 'ready' }), false, 'an update waiting to install keeps its state');
  assert.equal(silencedOfflineFailure({ message: 'HttpError: 404', phase: 'checking' }), false, 'a real failure is reported');
});

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

test('a release without latest-linux.yml means no Linux update, and only on Linux', () => {
  const missing = { code: 'ERR_UPDATER_CHANNEL_FILE_NOT_FOUND', message: 'Cannot find latest-linux.yml in the latest release artifacts' };
  assert.equal(isMissingLinuxFeed(missing, 'linux'), true);
  assert.equal(isMissingLinuxFeed({ ...missing, message: 'Cannot find latest.yml' }, 'win32'), false);
  assert.equal(isMissingLinuxFeed({ code: 'ERR_UPDATER_INVALID_UPDATE_INFO', message: 'x' }, 'linux'), false);
  assert.equal(isMissingLinuxFeed(null, 'linux'), false);
});
