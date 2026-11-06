'use strict';

// Playtime adds a game it saw running to cfg/gameIndex.json, the file that also holds the app's
// entries: a write may only add to it, never rebuild it from a read that failed.

const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-wd-playtime-gameindex-'));
process.env.AW_USER_DATA = temp;
after(() => fs.rmSync(temp, { recursive: true, force: true }));
require('../util/userData.js').resetCache();

const { addToGameIndex } = require('../playtime/monitor.js');
const { gameIndexFile } = require('../../app/util/dataLayout.js');

const file = gameIndexFile(temp);
const game = (appid) => ({ appid, name: `Game ${appid}`, binary: 'game.exe' });
const read = () => JSON.parse(fs.readFileSync(file, 'utf8'));
function write(text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}

test('a game seen running is added after the entries already in the index', async () => {
  write(JSON.stringify([game('1091500')]));
  await addToGameIndex(game('1245620'));
  assert.deepEqual(
    read().map((g) => g.appid),
    ['1091500', '1245620']
  );
});

test('a game the index already holds is not added a second time', async () => {
  write(JSON.stringify([game('1091500')]));
  await addToGameIndex({ ...game(1091500), name: 'Another name' });
  assert.deepEqual(read(), [game('1091500')]);
});

test('an index that cannot be parsed is left exactly as it was', async () => {
  const halfWritten = '[{"appid":"1091500","name":"Game';
  write(halfWritten);
  await addToGameIndex(game('1245620'));
  assert.equal(fs.readFileSync(file, 'utf8'), halfWritten);
});

test('with no index yet, the file is created holding the game', async () => {
  fs.rmSync(file, { force: true });
  await addToGameIndex(game('1245620'));
  assert.deepEqual(
    read().map((g) => g.appid),
    ['1245620']
  );
});
