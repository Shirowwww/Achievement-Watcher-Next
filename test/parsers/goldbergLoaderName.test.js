'use strict';

/*
  "goldberg" is the name of a SHAPE here: a replaced steam_api dll with no steam_settings beside it.
  ALI213, OnlineFix, SmartSteamEmu and CODEX all produce that shape, so the app reported every one of
  them as Goldberg. ZOMBI was shown as "GBE Fork" while its own steam_api.dll says ALI213 in its
  strings.

  The shape still decides where saves are read from, so it must not change; the name is a separate
  field, and it is the one worth putting in front of somebody.
*/

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const goldberg = require('../../app/parser/goldberg.js');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-loader-'));
const game = (name, build) => {
  const dir = path.join(tmp, name);
  fs.mkdirSync(dir, { recursive: true });
  build(dir);
  return dir;
};

test('a folder served by a known crack loader is named after it, and keeps its shape', () => {
  const dir = game('ZOMBI', (d) => {
    fs.writeFileSync(path.join(d, 'steam_api.dll'), Buffer.alloc(2048, 1));
    fs.writeFileSync(path.join(d, 'ALI213.ini'), '[Settings]\nAppID = 339230\nPlayerName = Player\n');
  });

  const emu = goldberg.detectEmulator(dir);
  assert.equal(emu.loader, 'ALI213', 'the report has to name what is actually emulating the game');
  assert.equal(emu.type, 'goldberg', 'the shape decides where saves are read from and must not move');
  assert.ok(emu.dll.length > 0);
});

test('an ordinary unconfigured setup names no loader rather than guessing one', () => {
  const dir = game('Plain', (d) => {
    fs.writeFileSync(path.join(d, 'steam_api64.dll'), Buffer.alloc(2048, 1));
  });

  const emu = goldberg.detectEmulator(dir);
  assert.equal(emu.loader, null, 'no evidence means no name, not a wrong one');
  assert.equal(emu.type, 'goldberg');
});

test('a configured GBE setup is untouched by this', () => {
  const dir = game('Configured', (d) => {
    fs.mkdirSync(path.join(d, 'steam_settings'), { recursive: true });
    fs.writeFileSync(path.join(d, 'steam_api64.dll'), Buffer.alloc(2048, 1));
    fs.writeFileSync(path.join(d, 'steam_settings', 'configs.app.ini'), '[app::general]\n');
  });

  const emu = goldberg.detectEmulator(dir);
  assert.equal(emu.type, 'gbe');
  assert.equal(emu.loader, null, 'a folder AW Next configured itself is not somebody else s loader');
});

test('the scan and the diagnosis both carry the name', () => {
  const dir = game('ZOMBI2', (d) => {
    fs.writeFileSync(path.join(d, 'steam_api.dll'), Buffer.alloc(2048, 1));
    fs.writeFileSync(path.join(d, 'ALI213.ini'), '[Settings]\nAppID = 339230\n');
    fs.writeFileSync(path.join(d, 'ZOMBI2.exe'), Buffer.alloc(4 * 1024 * 1024, 1));
  });

  const report = goldberg.diagnose({ gameDir: dir, appid: 339230 });
  assert.equal(report.loader, 'ALI213', 'the panel reads the diagnosis, so it has to be there too');
  assert.equal(report.emulator, 'goldberg');

  const found = goldberg.findCompatibleGames([tmp]).find((g) => path.normalize(g.gameDir).toLowerCase() === path.normalize(dir).toLowerCase());
  if (found) assert.equal(found.loader, 'ALI213', 'a caller must not have to re-derive it');
});

test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
