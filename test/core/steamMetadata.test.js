'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { resolveSteamMetadata } = require('../../app/util/steamMetadata.js');

test('Steam product metadata uses appdetails when product info has no common block', () => {
  const metadata = resolveSteamMetadata({
    appInfo: undefined,
    storeData: {
      name: 'Coffee Talk Tokyo',
      type: 'game',
      header_image: 'https://cdn.example/header.jpg',
      background: 'https://cdn.example/background.jpg?t=123',
    },
  });

  assert.equal(metadata.name, 'Coffee Talk Tokyo');
  assert.equal(metadata.isGame, true);
  assert.equal(metadata.header, 'https://cdn.example/header.jpg');
  assert.equal(metadata.background, 'https://cdn.example/background.jpg');
});

test('Steam product info remains preferred over a stale appdetails title', () => {
  const metadata = resolveSteamMetadata({
    appInfo: { common: { name: 'Portal with RTX (2024)', type: 'game' } },
    storeData: { name: 'Portal with RTX', type: 'game' },
  });

  assert.equal(metadata.name, 'Portal with RTX (2024)');
});
