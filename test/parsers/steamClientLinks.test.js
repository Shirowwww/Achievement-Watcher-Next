'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const links = require('../../app/util/steamClientLinks.js');

test('with Steam running, the store page and the hub go through steam://', () => {
  assert.equal(links.steamStoreUrl('440', { clientRunning: true }), 'steam://store/440');
  assert.equal(links.steamGameHubUrl('440', { clientRunning: true }), 'steam://url/GameHub/440');
});

test('with Steam closed, the web URLs are kept rather than starting the client', () => {
  assert.equal(links.steamStoreUrl('440', { clientRunning: false }), 'https://store.steampowered.com/app/440/');
  assert.equal(links.steamGameHubUrl('440', { clientRunning: false }), 'https://steamcommunity.com/app/440/guides/');
});

test('a non-numeric appid never produces a steam:// URL', () => {
  assert.equal(links.steamStoreUrl('uplay-1234', { clientRunning: true }), '');
  assert.equal(links.steamGameHubUrl('', { clientRunning: true }), '');
  assert.equal(links.steamInstallUrl('uplay-1234'), '');
});

test('the install URL is built from the appid', () => {
  assert.equal(links.steamInstallUrl('440'), 'steam://install/440');
  assert.equal(links.steamInstallUrl(440), 'steam://install/440');
});

const { shouldOfferSteamInstall } = require('../../app/util/steamClientLinks.js');

test('install is only offered for a Steam game that is not installed', () => {
  assert.equal(shouldOfferSteamInstall({ steamOfficial: true, installed: false, appid: '440' }), true);
  assert.equal(shouldOfferSteamInstall({ steamOfficial: true, installed: true, appid: '440' }), false);
  assert.equal(shouldOfferSteamInstall({ steamOfficial: false, installed: false, appid: '440' }), false);
  assert.equal(shouldOfferSteamInstall({ steamOfficial: true, installed: false, appid: 'uplay-9' }), false);
  assert.equal(shouldOfferSteamInstall(null), false);
});

// Ownership does not gate the offer: an unowned game is still sent to the client, which shows its
// store page. That is a useful answer, not a dead end.
test('ownership does not change whether install is offered', () => {
  for (const ownership of ['stale', 'owned', 'family', '']) {
    assert.equal(shouldOfferSteamInstall({ steamOfficial: true, installed: false, appid: '440', ownership }), true);
  }
});
