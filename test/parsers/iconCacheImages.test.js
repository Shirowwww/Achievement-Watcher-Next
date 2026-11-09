'use strict';

/*
  The icon cache keeps a file under the icon's name and serves it for as long as it exists. A CDN
  error page or a captive portal answers 200 with HTML, and a dropped connection leaves half a file,
  so whatever lands there must be a picture, and a bad file already there is fetched again.
*/
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const USER_DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-icon-cache-'));
process.env.AW_USER_DATA = USER_DATA;

const { serveOnOpenPort } = require('../helpers/openPort');
const { isImageBuffer, isImageFile, usableCachedImage } = require('../../app/util/imageSniff.js');
const steam = require('../../app/parser/steam.js');

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);
const PORTAL = Buffer.from('<!doctype html><title>Sign in to the network</title>');

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const body = req.url.startsWith('/good') ? PNG : PORTAL;
      res.writeHead(200, { 'content-type': req.url.startsWith('/good') ? 'image/png' : 'image/jpeg', 'content-length': body.length });
      res.end(req.method === 'HEAD' ? undefined : body);
    });
    server.listen(0, '127.0.0.1', () =>
      resolve({ url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((done) => server.close(done)) })
    );
  });
}

let server;
test.before(async () => {
  server = await serveOnOpenPort(startServer);
});
test.after(async () => {
  await server.close();
  fs.rmSync(USER_DATA, { recursive: true, force: true });
});

const cached = (appid, name) => path.join(USER_DATA, 'steam_cache', 'icon', appid, name);

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 0x11, 0x22, 0xff, 0xd9]);
const WEBP = Buffer.concat([Buffer.from('RIFF\x0c\x00\x00\x00WEBPVP8 ', 'latin1'), Buffer.alloc(4)]);
const GIF = Buffer.from('GIF89a\x01\x00\x01\x00\x00\x00\x00\x3b', 'latin1');

test('every picture format the caches hold is recognised, and text is not', () => {
  assert.equal(isImageBuffer(PNG), true);
  assert.equal(isImageBuffer(JPEG), true);
  assert.equal(isImageBuffer(WEBP), true);
  assert.equal(isImageBuffer(GIF), true);
  assert.equal(isImageBuffer(PORTAL), false);
  assert.equal(isImageBuffer(Buffer.alloc(0)), false);
});

// A dropped connection leaves the start of a picture: the header alone must not pass.
test('a picture cut short is refused, in memory and on disk', () => {
  for (const [name, whole] of Object.entries({ PNG, JPEG, WEBP, GIF })) {
    assert.equal(isImageBuffer(whole.subarray(0, whole.length - 2)), false, `${name} cut short`);
  }
  assert.equal(isImageBuffer(Buffer.concat([JPEG, Buffer.alloc(8)])), true, 'padding after the end marker is kept');
  assert.equal(isImageBuffer(Buffer.concat([JPEG, Buffer.alloc(300, 0x41)])), true, 'metadata after the end marker is kept');

  // One 4-byte picture listed at offset 22, right after the directory.
  const ico = Buffer.alloc(26);
  ico.writeUInt16LE(1, 2);
  ico.writeUInt16LE(1, 4);
  ico.writeUInt32LE(4, 6 + 8);
  ico.writeUInt32LE(22, 6 + 12);
  assert.equal(isImageBuffer(ico), true, 'a whole icon file');
  assert.equal(isImageBuffer(ico.subarray(0, 24)), false, 'an icon file cut inside its picture');

  const file = cached('9005', 'icon.png');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, PNG.subarray(0, PNG.length - 6));
  assert.equal(isImageFile(file), false);
  assert.equal(usableCachedImage(file), false);
  assert.equal(fs.existsSync(file), false, 'the half file is removed so it is fetched again');
});

test('a page answered in place of an icon is not cached, and the address is handed back', async () => {
  const url = `${server.url}/portal/icon.jpg`;
  assert.equal(await steam.fetchIcon(url, '9001'), url);
  assert.equal(fs.existsSync(cached('9001', 'icon.jpg')), false);
});

test('a real icon is cached and served from the cache', async () => {
  const url = `${server.url}/good/icon.png`;
  const file = await steam.fetchIcon(url, '9002');
  assert.equal(file, cached('9002', 'icon.png'));
  assert.equal(isImageFile(file), true);
});

test('a folder in the place of a cached icon is not a picture, and does not throw', () => {
  const folder = cached('9004', 'icon.png');
  fs.mkdirSync(folder, { recursive: true });
  assert.equal(usableCachedImage(folder), false);
});

test('a broken file left in the cache by an older version is fetched again', async () => {
  const file = cached('9003', 'icon.png');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, PORTAL);
  assert.equal(await steam.fetchIcon(`${server.url}/good/icon.png`, '9003'), file);
  assert.deepEqual(fs.readFileSync(file), PNG);
});
