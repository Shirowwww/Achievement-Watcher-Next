'use strict';

/*
  The GOG/Epic -> Steam appid maps the Watchdog reads on an unlock (steam_cache/gog.db, epic.db)
  go through the parsers that write them, so a format change cannot leave one side behind.
*/

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const gog = require('../../app/parser/gog.js');
const epic = require('../../app/parser/epic.js');
const request = require('../../app/node_modules/request-zero');

function tempData(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-store-mapping-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  gog.setUserDataPath(dir);
  epic.setUserDataPath(dir);
  return dir;
}

test('a GOG id is answered from the map, asked once, then remembered beside the scan entries', async (t) => {
  const dir = tempData(t);
  const cacheFile = path.join(dir, 'steam_cache', 'gog.db');
  fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
  fs.writeFileSync(cacheFile, JSON.stringify([{ gogid: '1', steamid: '10' }]));
  const realGetJson = request.getJson;
  const asked = [];
  request.getJson = async (url) => {
    asked.push(String(url));
    if (String(url).endsWith('/2')) return { game: { releases: [{ platform_id: 'steam', external_id: '20' }] } };
    return { game: {} };
  };
  t.after(() => (request.getJson = realGetJson));

  assert.equal(await gog.steamIdForGogId('1'), '10');
  assert.equal(await gog.steamIdForGogId(2), '20');
  assert.equal(await gog.steamIdForGogId('2'), '20');
  assert.equal(await gog.steamIdForGogId('3'), undefined, 'a GOG-only title has no Steam appid');
  assert.equal(asked.length, 2, 'a known id never reaches gamesdb');
  assert.deepEqual(JSON.parse(fs.readFileSync(cacheFile, 'utf8')), [
    { gogid: '1', steamid: '10' },
    { gogid: '2', steamid: '20' },
  ]);
  assert.deepEqual(fs.readdirSync(path.dirname(cacheFile)), ['gog.db'], 'no temporary file left behind');
});

test('a corrupt GOG map is "no mapping known", and the lookup still answers', async (t) => {
  const dir = tempData(t);
  const cacheFile = path.join(dir, 'steam_cache', 'gog.db');
  fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
  fs.writeFileSync(cacheFile, '{not json');
  const realGetJson = request.getJson;
  request.getJson = async () => ({ game: { releases: [{ platform_id: 'Steam', external_id: '30' }] } });
  t.after(() => (request.getJson = realGetJson));
  assert.equal(await gog.steamIdForGogId('3'), '30');
});

test('an Epic id maps to its Steam appid, and an Epic-only or unknown one to nothing', (t) => {
  const dir = tempData(t);
  const cacheFile = path.join(dir, 'steam_cache', 'epic.db');
  assert.equal(epic.steamIdForEpicId('a'), undefined, 'no map yet');
  fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
  fs.writeFileSync(cacheFile, JSON.stringify([{ epicid: 'a', steamid: '100' }, { epicid: 'b' }, null]));
  assert.equal(epic.steamIdForEpicId('a'), '100');
  assert.equal(epic.steamIdForEpicId('b'), undefined);
  assert.equal(epic.steamIdForEpicId('c'), undefined);
});
