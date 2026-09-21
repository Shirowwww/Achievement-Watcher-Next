'use strict';

/*
  Issue #78. The automatic emulator fix pre-creates both Goldberg save roots for an appid, so the
  same game can end up with an achievements.json under each. %APPDATA%\Goldberg SteamEmu Saves is
  globbed before %APPDATA%\GSE Saves, and the duplicate check kept whichever came first as long as
  it had a file at all - an abandoned, empty save then shadowed the one the emulator really writes
  to, and the game showed 0% (Mewgenics, 2/281 unlocked in GSE Saves, reported on 3.10.9).

  What decides the winner has to be what the file says, not that it exists.
*/

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const steam = require(path.join(__dirname, '..', '..', 'app', 'parser', 'steam.js'));

const APPID = '686060';
const NAMES = ['FIRST', 'SECOND', 'THIRD'];

function withEnv(values, fn) {
  const previous = {};
  for (const key of Object.keys(values)) {
    previous[key] = process.env[key];
    process.env[key] = values[key];
  }
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      for (const key of Object.keys(values)) {
        if (previous[key] === undefined) delete process.env[key];
        else process.env[key] = previous[key];
      }
    });
}

function writeSave(dir, earned) {
  const state = {};
  NAMES.forEach((name, index) => {
    state[name] = index < earned ? { earned: true, earned_time: 1789000000 } : { earned: false, earned_time: 0 };
  });
  fs.writeFileSync(path.join(dir, 'achievements.json'), JSON.stringify(state, null, 4));
}

// Both %APPDATA% Goldberg roots holding the same appid, which is what the automatic fix leaves behind.
async function scanWithBothRoots(build) {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'aw-gb-collision-')));
  const appdata = path.join(tmp, 'AppData');
  const classic = path.join(appdata, 'Goldberg SteamEmu Saves', APPID);
  const gbe = path.join(appdata, 'GSE Saves', APPID);
  fs.mkdirSync(classic, { recursive: true });
  fs.mkdirSync(gbe, { recursive: true });
  build({ classic, gbe });

  const found = await withEnv(
    {
      APPDATA: appdata,
      LOCALAPPDATA: path.join(tmp, 'LocalAppData'),
      PUBLIC: path.join(tmp, 'Public'),
      PROGRAMDATA: path.join(tmp, 'ProgramData'),
    },
    () => steam.scan()
  );

  const entries = found.filter((g) => String(g.appid) === APPID);
  fs.rmSync(tmp, { recursive: true, force: true });
  return { entries, classic, gbe };
}

test('an empty save under the first root does not shadow the one holding the unlocks', async () => {
  const { entries, gbe } = await scanWithBothRoots(({ classic, gbe: gbeDir }) => {
    writeSave(classic, 0);
    writeSave(gbeDir, 2);
  });

  assert.equal(entries.length, 1, 'the appid stays a single entry');
  assert.equal(path.resolve(entries[0].data.path), gbe);
});

// The collision is symmetric: whichever root is globbed first, the unlocks decide.
test('the first root discovered keeps the entry when it is the one holding the unlocks', async () => {
  const { entries, classic } = await scanWithBothRoots(({ classic: classicDir, gbe: gbeDir }) => {
    writeSave(classicDir, 3);
    writeSave(gbeDir, 0);
  });

  assert.equal(entries.length, 1);
  assert.equal(path.resolve(entries[0].data.path), classic);
});

test('a folder with no save at all never shadows one that has a save', async () => {
  const { entries, gbe } = await scanWithBothRoots(({ gbe: gbeDir }) => {
    writeSave(gbeDir, 1);
  });

  assert.equal(entries.length, 1);
  assert.equal(path.resolve(entries[0].data.path), gbe);
});

// An unreadable save says nothing about progress, so it must not win over one that can be counted.
test('an unreadable save loses to a readable one with unlocks', async () => {
  const { entries, gbe } = await scanWithBothRoots(({ classic, gbe: gbeDir }) => {
    fs.writeFileSync(path.join(classic, 'achievements.json'), '{ truncated');
    writeSave(gbeDir, 1);
  });

  assert.equal(entries.length, 1);
  assert.equal(path.resolve(entries[0].data.path), gbe);
});
