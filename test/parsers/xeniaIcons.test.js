'use strict';

// Locked Xenia achievements have no picture in the profile GPD; getGameData fetches them from the
// Xbox Live image host into the icon cache. The host is replaced by a stub here.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-xenia-icons-'));
process.env.AW_USER_DATA = userData;
const xenia = require('../../app/parser/xenia.js');

const { xboxLiveIconUrl } = xenia._internal;
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const TITLE = '41560855';

function utf16be(text) {
  const body = Buffer.from(String(text), 'utf16le');
  for (let i = 0; i + 1 < body.length; i += 2) [body[i], body[i + 1]] = [body[i + 1], body[i]];
  return Buffer.concat([body, Buffer.from([0, 0])]);
}

function achievement(id, imageId, flags) {
  const head = Buffer.alloc(0x1c);
  head.writeUInt32BE(0x1c, 0x00);
  head.writeUInt32BE(id, 0x04);
  head.writeUInt32BE(imageId, 0x08);
  head.writeUInt32BE(10, 0x0c);
  head.writeUInt32BE(flags, 0x10);
  return { namespace: 1, id, payload: Buffer.concat([head, utf16be(`Ach ${id}`), utf16be('Done'), utf16be('Do it')]) };
}

function buildGpd(entries) {
  const header = Buffer.alloc(0x18);
  header.write('XDBF', 0, 'ascii');
  header.writeUInt32BE(0x00010000, 0x04);
  header.writeUInt32BE(entries.length, 0x08);
  header.writeUInt32BE(entries.length, 0x0c);
  const table = Buffer.alloc(entries.length * 0x12);
  let offset = 0;
  entries.forEach((entry, index) => {
    const base = index * 0x12;
    table.writeUInt16BE(entry.namespace, base);
    table.writeBigUInt64BE(BigInt(entry.id), base + 2);
    table.writeUInt32BE(offset, base + 10);
    table.writeUInt32BE(entry.payload.length, base + 14);
    offset += entry.payload.length;
  });
  return Buffer.concat([header, table, ...entries.map((entry) => entry.payload)]);
}

function writeGpd(dir) {
  const gpd = path.join(dir, `${TITLE}.gpd`);
  // Achievement 1 is unlocked and carries its picture; 2 and 3 are locked and do not.
  fs.writeFileSync(
    gpd,
    buildGpd([
      achievement(1, 1, 0x20008),
      achievement(2, 0x1c, 0x8),
      achievement(3, 0x1d, 0x8),
      { namespace: 2, id: 1, payload: PNG },
    ])
  );
  return gpd;
}

function stubHost(responses) {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    const status = responses[url] ?? 404;
    return { status, ok: status === 200, arrayBuffer: async () => PNG };
  };
  return { calls, fetchImpl };
}

test('the image id is written in hex, the way the host names its files', () => {
  assert.equal(xboxLiveIconUrl('41560855', 0x1c), 'http://image.xboxlive.com/global/t.41560855/ach/0/1c');
  assert.equal(xboxLiveIconUrl('not-a-title', 1), null);
  assert.equal(xboxLiveIconUrl('41560855', 0), null);
});

test('locked achievements get their picture from the host, unlocked ones keep the embedded one', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-xenia-gpd-'));
  const host = stubHost({
    'http://image.xboxlive.com/global/t.41560855/ach/0/1c': 200,
  });
  const game = await xenia.getGameData(writeGpd(dir), { fetchImpl: host.fetchImpl });
  const byName = Object.fromEntries(game.achievement.list.map((a) => [a.name, a]));

  assert.match(byName['1'].icon, /xenia\/41560855\/1\.png$/);
  assert.match(byName['2'].icon, /xenia\/41560855\/28\.png$/);
  assert.equal(byName['2'].icongray, byName['2'].icon);
  assert.equal(byName['3'].icon, '');
  assert.deepEqual(host.calls.sort(), [
    'http://image.xboxlive.com/global/t.41560855/ach/0/1c',
    'http://image.xboxlive.com/global/t.41560855/ach/0/1d',
  ]);

  // Second scan: the downloaded file is reused and the 404 is remembered, so nothing is asked again.
  const again = stubHost({});
  await xenia.getGameData(writeGpd(dir), { fetchImpl: again.fetchImpl });
  assert.deepEqual(again.calls, []);
});

test('a network failure leaves the row without a picture and is retried on the next scan', async () => {
  fs.rmSync(path.join(userData, 'icon_cache'), { recursive: true, force: true });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-xenia-gpd-'));
  const offline = async () => {
    throw new Error('getaddrinfo ENOTFOUND');
  };
  const game = await xenia.getGameData(writeGpd(dir), { fetchImpl: offline });
  assert.equal(game.achievement.list.find((a) => a.name === '2').icon, '');

  const host = stubHost({});
  await xenia.getGameData(writeGpd(dir), { fetchImpl: host.fetchImpl });
  assert.equal(host.calls.length, 2);
});
