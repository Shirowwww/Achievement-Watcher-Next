'use strict';

/*
  A game that sits directly in a library root, identified by an emulator config beside its steam_api
  dll rather than by a steam_settings folder, must be anchored on its OWN folder.

  It was anchored on the library root instead, because that path walked up unconditionally and
  exeDetect.detect() searches below the folder it is given: asked about the library root, it answers
  with the first SIBLING game's executable, so the root passes for a game folder. Everything
  downstream then resolved against the root, and the repair dialog offered to rewrite whichever
  game happened to come first in it. Seen on ZOMBI, which was offered a rewrite of another game's
  steam_settings and that game's Uplay fix.
*/

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const goldberg = require('../../app/parser/goldberg.js');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-anchor-'));
const library = path.join(tmp, 'Jeux');

// The game in question: emulator dll + a config naming its appid, nothing else to anchor on.
const zombi = path.join(library, 'ZOMBI');
fs.mkdirSync(zombi, { recursive: true });
fs.writeFileSync(path.join(zombi, 'steam_api.dll'), Buffer.alloc(2048, 1));
fs.writeFileSync(path.join(zombi, 'ZOMBI.exe'), Buffer.alloc(4 * 1024 * 1024, 1));
fs.writeFileSync(path.join(zombi, 'ALI213.ini'), '[Settings]\nAppID = 339230\nPlayerName = Player\nSaveType = 0\n');

// A sibling that gives the library root a plausible executable of its own.
const sibling = path.join(library, 'AC Black Flag Resynced');
fs.mkdirSync(path.join(sibling, 'steam_settings'), { recursive: true });
fs.writeFileSync(path.join(sibling, 'ACBlackFlag.exe'), Buffer.alloc(6 * 1024 * 1024, 1));
fs.writeFileSync(path.join(sibling, 'steam_api64.dll'), Buffer.alloc(2048, 1));
fs.writeFileSync(path.join(sibling, 'steam_settings', 'steam_appid.txt'), '3751950');

test('a game in a library root is anchored on its own folder, not on the root', () => {
  const found = goldberg.findCompatibleGames([library]);
  const dirs = found.map((entry) => path.normalize(entry.gameDir).toLowerCase());

  assert.ok(
    !dirs.includes(path.normalize(library).toLowerCase()),
    `no game may be anchored on the library root itself, got ${JSON.stringify(dirs)}`
  );

  const mine = found.find((entry) => String(entry.appid) === '339230');
  assert.ok(mine, `the emulator config states the appid, so the game must be found: ${JSON.stringify(found)}`);
  assert.equal(
    path.normalize(mine.gameDir).toLowerCase(),
    path.normalize(zombi).toLowerCase(),
    'anchoring it on the root makes every folder-based repair aim at a sibling game'
  );

  // And the sibling stays itself, so the two never collapse onto one folder.
  const other = found.find((entry) => String(entry.appid) === '3751950');
  if (other) {
    assert.equal(path.normalize(other.gameDir).toLowerCase(), path.normalize(sibling).toLowerCase());
  }
});

/*
  The other half of the same mistake, in the case the walk-up exists for: the emulator dll and the
  appid file sit in an engine folder with no executable of its own, so the game folder is further up.

  The walk asked "does this ancestor look like a game folder", of a search that looks BELOW it, so
  Binaries answered yes on the strength of the OTHER architecture's executable and the game was
  anchored on the engine folder. The game root here deliberately ships no executable of its own, or
  an earlier branch anchors the game before the walk is ever reached.
*/
test('an engine folder with no executable walks up to the game, not to the engine folder above it', () => {
  const unreal = path.join(library, 'My Unreal Game');
  const win64 = path.join(unreal, 'Binaries', 'Win64');
  const win32 = path.join(unreal, 'Binaries', 'Win32');
  fs.mkdirSync(win64, { recursive: true });
  fs.mkdirSync(win32, { recursive: true });
  // The emulator lives with the 64-bit build, which ships no exe of its own.
  fs.writeFileSync(path.join(win64, 'steam_api64.dll'), Buffer.alloc(2048, 1));
  fs.writeFileSync(path.join(win64, 'steam_appid.txt'), '480');
  // The 32-bit build does, and that is what made Binaries look like a game folder.
  fs.writeFileSync(path.join(win32, 'MyGame-Win32-Shipping.exe'), Buffer.alloc(6 * 1024 * 1024, 1));
  fs.writeFileSync(path.join(unreal, 'MyGame.ini'), 'nothing executable here\n');

  const found = goldberg.findCompatibleGames([library]);
  const mine = found.find((entry) => String(entry.appid) === '480');
  assert.ok(mine, `the appid file states which game it is: ${JSON.stringify(found.map((f) => f.gameDir))}`);
  assert.equal(
    path.normalize(mine.gameDir).toLowerCase(),
    path.normalize(unreal).toLowerCase(),
    'stopping at Binaries anchors the game on an engine folder'
  );
});

test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
