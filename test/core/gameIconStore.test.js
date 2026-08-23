'use strict';

/*
  The square-logo override store. It is the cover store's machinery with a different identity (see
  imageOverrideStore.js), so what is checked here is exactly what differs: its own cfg file, its own
  durable folder, and the deliberate absence of a SteamGridDB recovery prefix - guessing a grid URL
  from an icon's cached filename would silently select somebody else's artwork.
*/

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { pathToFileURL } = require('node:url');

const appUtil = path.join(__dirname, '..', '..', 'app', 'util');
const gameIconStore = require(path.join(appUtil, 'gameIconStore.js'));
const coverStore = require(path.join(appUtil, 'coverStore.js'));

const PNG = Buffer.from('89504e470d0a1a0a', 'hex');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-gameicon-'));
gameIconStore.setStoreFile(path.join(root, 'cfg', 'gameIcons.db'));

function sourceImage(name, bytes = PNG) {
  const file = path.join(root, name);
  fs.writeFileSync(file, bytes);
  return file;
}

test('the icon store writes cfg/gameIcons.db, not the cover store file', () => {
  assert.equal(path.basename(gameIconStore.defaultFile()), 'gameIcons.db');
  assert.equal(path.basename(coverStore.defaultFile()), 'covers.db');
});

test('a picked local image is copied into gameIcons/ and read back for that appid', () => {
  const stored = gameIconStore.persist('480', pathToFileURL(sourceImage('picked.png')).href, root);
  assert.ok(stored.startsWith('file:'));
  assert.ok(stored.includes('/gameIcons/'), `expected a durable gameIcons/ copy, got ${stored}`);
  assert.equal(gameIconStore.get('480'), stored);
  assert.equal(gameIconStore.get(480), stored, 'the appid is coerced to a string');
});

test('replacing a pick removes the copy it replaced instead of piling files up', () => {
  const first = gameIconStore.get('480');
  const second = gameIconStore.persist('480', pathToFileURL(sourceImage('other.png', Buffer.concat([PNG, Buffer.from('x')]))).href, root);
  assert.notEqual(second, first);
  assert.deepEqual(fs.readdirSync(path.join(root, 'gameIcons')).filter((name) => name.startsWith('480')), [path.basename(new URL(second).pathname)]);
});

test('a remote pick is stored as its source URL, so the bytes stay disposable cache', () => {
  const url = 'https://cdn2.steamgriddb.com/icon/aabbccddeeff00112233445566778899.png';
  assert.equal(gameIconStore.persist('730', url, root), url);
  assert.equal(gameIconStore.get('730'), url);
});

test('an icon cached under steam_cache is copied, never guessed back into a grid URL', () => {
  // The cover store rebuilds a SteamGridDB *grid* link from this filename shape. An icon is not a
  // grid: doing the same here would point the game at a different picture.
  const cached = path.join(root, 'steam_cache', 'icon', '570', 'aabbccddeeff00112233445566778899.png');
  fs.mkdirSync(path.dirname(cached), { recursive: true });
  fs.writeFileSync(cached, PNG);
  assert.equal(gameIconStore.recoverRemote(pathToFileURL(cached).href), null);
  const stored = gameIconStore.persist('570', pathToFileURL(cached).href, root);
  assert.ok(stored.includes('/gameIcons/'), `expected a durable copy, got ${stored}`);
});

test('a deleted pick is reported unusable, so the caller can fall back instead of painting a hole', () => {
  const stored = gameIconStore.persist('999', pathToFileURL(sourceImage('gone.png', Buffer.concat([PNG, Buffer.from('gone')]))).href, root);
  assert.equal(gameIconStore.isUsable(stored), true);
  fs.rmSync(new URL(stored).pathname.replace(/^\//, ''), { force: true });
  assert.equal(gameIconStore.isUsable(stored), false);
  gameIconStore.remove('999');
  assert.equal(gameIconStore.get('999'), null);
});
