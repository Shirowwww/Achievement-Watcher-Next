'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { normalizeChannel, channelOfVersion, updaterSettings, isReturnToStable } = require('../../app/util/updateChannel.js');
const { shouldSuppressUpdatePrompt } = require('../../app/util/updateGate.js');
const { evaluateUpdateSignature, pinnedForChannel, NIGHTLY_THUMBPRINTS, PINNED_THUMBPRINTS } = require('../../app/util/updateSignature.js');

const NIGHTLY_KEY = NIGHTLY_THUMBPRINTS[0];
const signedBy = (thumbprint) => ({
  Status: 'UnknownError',
  SignerCertificate: { Subject: 'CN=Shirow', Thumbprint: thumbprint },
  Cms: { Ok: true, Thumbprints: [thumbprint, thumbprint] },
});

test('a copy that never chose a channel follows the one it was built for', () => {
  assert.equal(normalizeChannel('', '3.12.7'), 'stable');
  assert.equal(normalizeChannel(undefined, '3.12.8-nightly.4'), 'nightly');
  assert.equal(normalizeChannel('stable', '3.12.8-nightly.4'), 'stable');
  assert.equal(normalizeChannel('nightly', '3.12.7'), 'nightly');
  assert.equal(normalizeChannel('beta', '3.12.7'), 'stable');
});

test('only a nightly pre-release tag counts as the nightly channel', () => {
  assert.equal(channelOfVersion('3.12.8-nightly.1'), 'nightly');
  assert.equal(channelOfVersion('3.13.0-beta.2'), 'stable');
  assert.equal(channelOfVersion('3.12.7'), 'stable');
  assert.equal(channelOfVersion('not a version'), 'stable');
});

test('the nightly channel reads the pre-releases and never offers an older build', () => {
  assert.deepEqual(updaterSettings('nightly', '3.12.7'), { channel: 'nightly', allowPrerelease: true, allowDowngrade: false });
});

test('the stable channel reads releases/latest, and allows the way back from a nightly only', () => {
  assert.deepEqual(updaterSettings('stable', '3.12.7'), { channel: 'latest', allowPrerelease: false, allowDowngrade: false });
  assert.deepEqual(updaterSettings('stable', '3.12.8-nightly.4'), { channel: 'latest', allowPrerelease: false, allowDowngrade: true });
});

test('a stable version offered to a nightly copy on the stable channel is the way back', () => {
  assert.equal(isReturnToStable('3.12.7', '3.12.8-nightly.4', 'stable'), true);
  assert.equal(isReturnToStable('3.12.7', '3.12.8-nightly.4', 'nightly'), false);
  assert.equal(isReturnToStable('3.12.6', '3.12.7', 'stable'), false);
  assert.equal(isReturnToStable('3.12.8-nightly.3', '3.12.8-nightly.4', 'stable'), false);
});

test('the update prompt lets the way back to stable through, and still drops an older nightly', () => {
  const stable = { updateChannel: 'stable' };
  assert.equal(shouldSuppressUpdatePrompt(stable, '3.12.7', { currentVersion: '3.12.8-nightly.4' }).suppress, false);
  assert.equal(shouldSuppressUpdatePrompt({ updateChannel: 'nightly' }, '3.12.8-nightly.3', { currentVersion: '3.12.8-nightly.4' }).reason, 'not-newer');
  assert.equal(shouldSuppressUpdatePrompt(stable, '3.12.6', { currentVersion: '3.12.7' }).reason, 'not-newer');
});

test('a newer nightly is offered to a nightly copy', () => {
  assert.equal(shouldSuppressUpdatePrompt({ updateChannel: 'nightly' }, '3.12.8-nightly.5', { currentVersion: '3.12.8-nightly.4' }).suppress, false);
});

test('the nightly key is refused on the stable channel and accepted on the nightly one', () => {
  assert.match(evaluateUpdateSignature(['Shirow'], signedBy(NIGHTLY_KEY), { pinned: pinnedForChannel('stable') }), /unknown certificate/);
  assert.equal(evaluateUpdateSignature(['Shirow'], signedBy(NIGHTLY_KEY), { pinned: pinnedForChannel('nightly') }), null);
});

test('the release keys still sign updates on both channels', () => {
  for (const channel of ['stable', 'nightly']) {
    assert.equal(evaluateUpdateSignature(['Shirow'], signedBy(PINNED_THUMBPRINTS[0]), { pinned: pinnedForChannel(channel) }), null);
  }
  assert.equal(PINNED_THUMBPRINTS.includes(NIGHTLY_KEY), false);
});
