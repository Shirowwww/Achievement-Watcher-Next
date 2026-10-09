'use strict';

/*
  The console emulators describe their artwork with file URLs. fetchIcon used to recognise only bare
  paths as local, so a file URL went down the download branch, never resolved, and the game page
  painted no background behind a PS5 game. A folder name with brackets, as release folders often
  have, is the shape that was seen.
*/
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const steam = require(path.join(__dirname, '..', '..', 'app', 'parser', 'steam.js'));

test('a file URL to an existing picture resolves to that file, and a missing one to nothing', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-fetchicon-[GAME.COM]-'));
  try {
    const picture = path.join(dir, 'pic0.png');
    fs.writeFileSync(picture, 'png');
    assert.equal(await steam.fetchIcon(pathToFileURL(picture).href, 'PPSA01325'), picture);
    assert.equal(await steam.fetchIcon((process.platform === 'win32' ? 'file:///' : 'file://') + picture.replace(/\\/g, '/'), 'PPSA01325'), picture, 'an unencoded URL too');
    assert.equal(await steam.fetchIcon(pathToFileURL(path.join(dir, 'gone.png')).href, 'PPSA01325'), null);
    assert.equal(await steam.fetchIcon(picture, 'PPSA01325'), picture, 'a bare path is unchanged');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
