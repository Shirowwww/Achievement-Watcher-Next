'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const retroArch = require('../../app/parser/retroArchLibrary.js');

// A portable RetroArch install with a history and one scanned playlist, the shape RetroArch writes.
function fakeInstall({ playlistSetting = ':\\playlists' } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-retroarch-'));
  const roms = path.join(root, 'roms');
  fs.mkdirSync(roms);
  for (const name of ['Super Mario Bros. (World).zip', 'Sonic The Hedgehog (USA, Europe).md', 'Sonic The Hedgehog (Europe).sms']) fs.writeFileSync(path.join(roms, name), 'rom');
  fs.writeFileSync(path.join(root, 'retroarch.cfg'), `playlist_directory = "${playlistSetting}"\n`);
  const playlists = path.join(root, 'playlists');
  fs.mkdirSync(path.join(playlists, 'builtin'), { recursive: true });
  const history = { items: [{ path: path.join(roms, 'Super Mario Bros. (World).zip'), label: '', core_name: 'Nintendo - NES / Famicom (FCEUmm)', db_name: '' }] };
  fs.writeFileSync(path.join(playlists, 'builtin', 'content_history.lpl'), JSON.stringify(history));
  const sega = {
    items: [
      { path: path.join(roms, 'Sonic The Hedgehog (Europe).sms'), label: 'Sonic The Hedgehog (Europe)', db_name: 'Sega - Master System - Mark III.lpl' },
      { path: path.join(roms, 'Sonic The Hedgehog (USA, Europe).md'), label: 'Sonic The Hedgehog (USA, Europe)', db_name: 'Sega - Mega Drive - Genesis.lpl' },
    ],
  };
  fs.writeFileSync(path.join(playlists, 'Sega.lpl'), JSON.stringify(sega));
  return { root, roms };
}

test('a played ROM is found from the history under the RetroAchievements title', () => {
  const { root, roms } = fakeInstall();
  const entries = retroArch.readEntries([root]);
  const rom = retroArch.findRom(entries, { title: 'Super Mario Bros. (NES/Famicom)', console: 'NES/Famicom' });
  assert.equal(rom.romPath, path.join(roms, 'Super Mario Bros. (World).zip'));
});

test('a scanned playlist of another console is never taken for the game', () => {
  const { root, roms } = fakeInstall();
  const entries = retroArch.readEntries([root]);
  assert.equal(retroArch.findRom(entries, { title: 'Sonic the Hedgehog', console: 'Genesis/Mega Drive' }).romPath, path.join(roms, 'Sonic The Hedgehog (USA, Europe).md'));
  assert.equal(retroArch.findRom(entries, { title: 'Sonic the Hedgehog', console: 'Master System' }).romPath, path.join(roms, 'Sonic The Hedgehog (Europe).sms'));
});

test('a ROM that is no longer on disk is not an install', () => {
  const { root, roms } = fakeInstall();
  fs.rmSync(path.join(roms, 'Super Mario Bros. (World).zip'));
  assert.equal(retroArch.findRom(retroArch.readEntries([root]), { title: 'Super Mario Bros.', console: 'NES/Famicom' }), null);
});

test('titles compare without region tags, extensions or a trailing article', () => {
  assert.equal(retroArch.normalizeTitle('Legend of Zelda, The (USA) (Rev 1).nes'), retroArch.normalizeTitle('The Legend of Zelda'));
  assert.equal(retroArch.normalizeTitle('Mario & Luigi [!]'), retroArch.normalizeTitle('Mario and Luigi'));
  assert.notEqual(retroArch.normalizeTitle('Super Mario Bros. 2'), retroArch.normalizeTitle('Super Mario Bros.'));
});

test('an archive member resolves to the archive on disk', () => {
  const { root, roms } = fakeInstall();
  const file = path.join(root, 'playlists', 'builtin', 'content_history.lpl');
  fs.writeFileSync(file, JSON.stringify({ items: [{ path: `${path.join(roms, 'Super Mario Bros. (World).zip')}#Super Mario Bros. (World).nes`, label: '' }] }));
  assert.equal(retroArch.findRom(retroArch.readEntries([root]), { title: 'Super Mario Bros.' }).romPath, path.join(roms, 'Super Mario Bros. (World).zip'));
});

test('an absolute playlist folder in retroarch.cfg is honoured', () => {
  const elsewhere = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-retroarch-pl-'));
  const { root } = fakeInstall({ playlistSetting: elsewhere });
  assert.equal(retroArch.playlistDirectory(root), elsewhere);
  assert.equal(retroArch.readEntries([root]).length, 0);
});
