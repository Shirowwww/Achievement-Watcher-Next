'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const steam = require('../../app/parser/steam.js');

const { libraryBadgeOf } = require('../../app/util/sourceIdentity.js');

// #160: anadius' LSX emulator writes %LOCALAPPDATA%\anadius\LSX emu\achievement_watcher\<id>, which
// fell through to the generic label and so to the Steam badge for what are EA games.
test('an anadius LSX save is labelled as the EA crack it is, and gets the EA badge', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-anadius-scan-'));
  const previous = { APPDATA: process.env.APPDATA, LOCALAPPDATA: process.env.LOCALAPPDATA };
  process.env.APPDATA = path.join(tmp, 'AppData');
  process.env.LOCALAPPDATA = path.join(tmp, 'LocalAppData');
  try {
    fs.mkdirSync(path.join(tmp, 'LocalAppData', 'anadius', 'LSX emu', 'achievement_watcher', '1774580'), { recursive: true });

    const entry = (await steam.scan()).find((g) => g.appid === '1774580');

    assert.ok(entry, 'the anadius appid folder must be discovered');
    assert.equal(entry.source, 'anadius (EA)');
    assert.equal(libraryBadgeOf(entry.source), 'ea');
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
