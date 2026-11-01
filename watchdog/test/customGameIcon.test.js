'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { applyCustomGameIcon } = require('../util/steamArtwork.js');

// A data folder holding cfg/gameIcons.db the way app/util/gameIconStore.js writes it.
function profileWith(icons) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-custom-icon-'));
  fs.mkdirSync(path.join(root, 'cfg'));
  const picture = path.join(root, 'picked.png');
  fs.writeFileSync(picture, 'png');
  const map = {};
  for (const appid of icons) map[appid] = pathToFileURL(picture).href;
  fs.writeFileSync(path.join(root, 'cfg', 'gameIcons.db'), JSON.stringify(map));
  return { root, picture };
}

test('a playtime card takes the icon the user picked for the game (#159)', () => {
  const { root, picture } = profileWith(['3486530']);
  const message = { notificationType: 'playtime', appid: '3486530', icon: 'https://cdn/logo.png', gameIcon: 'https://cdn/logo.png' };

  applyCustomGameIcon(message, { userDataRoot: root });

  assert.equal(message.gameIcon, picture);
  assert.equal(message.icon, picture);
});

test('an unlock keeps its achievement icon and only its game slot changes', () => {
  const { root, picture } = profileWith(['CUSA00001']);
  const message = { appid: 'CUSA00001', icon: 'C:/trophy.png', gameIcon: 'C:/schema-icon.png' };

  applyCustomGameIcon(message, { userDataRoot: root });

  assert.equal(message.icon, 'C:/trophy.png');
  assert.equal(message.gameIcon, picture);
});

test('a game with no picked icon keeps the artwork its source resolved', () => {
  const { root } = profileWith(['480']);
  const message = { notificationType: 'playtime', appid: '220', icon: 'a', gameIcon: 'b' };

  applyCustomGameIcon(message, { userDataRoot: root });

  assert.deepEqual(message, { notificationType: 'playtime', appid: '220', icon: 'a', gameIcon: 'b' });
});

test('the Steam id of a manual entry finds an icon picked under it', () => {
  const { root, picture } = profileWith(['3486530']);
  const message = { appid: 'manual-abc', steamappid: '3486530', icon: 'a', gameIcon: 'b' };

  applyCustomGameIcon(message, { userDataRoot: root });

  assert.equal(message.gameIcon, picture);
});
