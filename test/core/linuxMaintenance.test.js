'use strict';

/*
  Small Linux pieces of the maintenance tools: the account picture used as the default avatar, and
  the playtime counters merged into cfg/playtime.json when a backup is restored.
*/

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { linuxAccountPicture, candidates, imageType } = require('../../app/util/linuxAccountPicture.js');
const playtimeFile = require('../../app/util/playtimeFile.js');

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);

test('the account picture type comes from its first bytes', () => {
  assert.equal(imageType(PNG), 'png');
  assert.equal(imageType(JPEG), 'jpeg');
  assert.equal(imageType(Buffer.from('RIFF0000WEBPVP8 ')), 'webp');
  assert.equal(imageType(Buffer.from('<svg/>')), null);
  assert.equal(imageType(Buffer.alloc(0)), null);
});

test('the AccountsService picture wins over ~/.face, and a home without one has no picture', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-face-'));
  try {
    assert.equal(candidates({ user: 'aw', home })[0], path.join('/var/lib/AccountsService/icons', 'aw'));
    await assert.rejects(linuxAccountPicture({ user: 'nobody-aw-test', home }));

    fs.writeFileSync(path.join(home, '.face'), Buffer.from('not a picture'));
    fs.writeFileSync(path.join(home, '.face.icon'), JPEG);
    assert.equal(await linuxAccountPicture({ user: 'nobody-aw-test', home }), `data:image/jpeg;base64,${JPEG.toString('base64')}`);

    fs.writeFileSync(path.join(home, '.face'), PNG);
    assert.equal(await linuxAccountPicture({ user: 'nobody-aw-test', home }), `data:image/png;base64,${PNG.toString('base64')}`);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('restored playtime keeps the larger counter of each appid and adds the missing ones', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-playtime-merge-'));
  const file = playtimeFile.playtimeFile(dir);
  try {
    playtimeFile.write(file, '400', { total: 900, last: 1_500_000_000 });
    assert.equal(playtimeFile.mergeMax(file, [{ appid: '400', total: 600, last: 1_700_000_000 }, { appid: 220, total: 30, last: 1_600_000_000 }]), 2);
    assert.deepEqual(playtimeFile.list(file), [
      { appid: '220', total: 30, last: 1_600_000_000 },
      { appid: '400', total: 900, last: 1_700_000_000 },
    ]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
