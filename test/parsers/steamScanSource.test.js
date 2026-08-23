'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const steam = require('../../app/parser/steam.js');

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

// Regression (issue #12): a manually added custom folder whose name doesn't match any known
// emulator/scene layout (SmartSteamEmu, CODEX, RUNE, Goldberg, ...) still holds a real numeric-AppID
// save folder. It must be discovered with a readable source label, not `undefined` - an unset source
// downstream left the game with no consistent attribution.
test('steam.scan() attributes a readable source to an unrecognized custom folder', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-custom-scan-src-'));
  await withEnv(
    {
      APPDATA: path.join(tmp, 'AppData'),
      LOCALAPPDATA: path.join(tmp, 'LocalAppData'),
      PUBLIC: path.join(tmp, 'Public'),
      PROGRAMDATA: path.join(tmp, 'ProgramData'),
    },
    async () => {
      const customRoot = path.join(tmp, 'DOGE');
      fs.mkdirSync(path.join(customRoot, '2067050'), { recursive: true });
      fs.writeFileSync(path.join(customRoot, 'steam_id.txt'), '123', 'utf8');

      const found = await steam.scan([customRoot]);
      const entry = found.find((g) => g.appid === '2067050');
      assert.ok(entry, 'the numeric AppID subfolder must be discovered');
      assert.equal(entry.source, 'Steam-emulator');
      assert.notEqual(entry.source, undefined);
    }
  );

  fs.rmSync(tmp, { recursive: true, force: true });
});

// RAZOR1911 writes %APPDATA%\.1911\<appid>\achievement as plain text lines.
test('steam.scan() finds RAZOR1911 saves and getAchievementsFromFile reads them', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-razor-scan-'));
  await withEnv(
    {
      APPDATA: path.join(tmp, 'AppData'),
      LOCALAPPDATA: path.join(tmp, 'LocalAppData'),
      PUBLIC: path.join(tmp, 'Public'),
      PROGRAMDATA: path.join(tmp, 'ProgramData'),
    },
    async () => {
      const saveDir = path.join(tmp, 'AppData', '.1911', '1091500');
      fs.mkdirSync(saveDir, { recursive: true });
      fs.writeFileSync(path.join(saveDir, 'achievement'), 'ACH_FIRST 1 1712253396\nACH_SECOND 0 0\nnot a valid line\n', 'utf8');

      const found = await steam.scan();
      const entry = found.find((g) => g.appid === '1091500');
      assert.ok(entry, 'the RAZOR1911 appid folder must be discovered');
      assert.equal(entry.source, 'Razor1911');

      const unlocks = await steam.getAchievementsFromFile(entry.data.path);
      assert.equal(unlocks.ACH_FIRST.Achieved, '1');
      assert.equal(unlocks.ACH_FIRST.UnlockTime, 1712253396);
      assert.equal(unlocks.ACH_SECOND.Achieved, '0');
      assert.equal('not' in unlocks, false, 'malformed lines are ignored');
    }
  );

  fs.rmSync(tmp, { recursive: true, force: true });
});

// EMPRESS has two on-disk shapes; the flat %APPDATA%\EMPRESS\remote\<appid> one has no appid level
// above `remote`, so the save folder is the matched folder itself.
test('steam.scan() reads both EMPRESS layouts', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-empress-scan-'));
  await withEnv(
    {
      APPDATA: path.join(tmp, 'AppData'),
      LOCALAPPDATA: path.join(tmp, 'LocalAppData'),
      PUBLIC: path.join(tmp, 'Public'),
      PROGRAMDATA: path.join(tmp, 'ProgramData'),
    },
    async () => {
      const nested = path.join(tmp, 'Public', 'Documents', 'EMPRESS', '1245620', 'remote', '1245620');
      const flat = path.join(tmp, 'AppData', 'EMPRESS', 'remote', '1888930');
      fs.mkdirSync(nested, { recursive: true });
      fs.mkdirSync(flat, { recursive: true });

      const found = await steam.scan();
      const nestedEntry = found.find((g) => g.appid === '1245620');
      const flatEntry = found.find((g) => g.appid === '1888930');
      assert.ok(nestedEntry && flatEntry, 'both EMPRESS layouts must be discovered');
      assert.equal(nestedEntry.source, 'Goldberg (EMPRESS)');
      assert.equal(flatEntry.source, 'Goldberg (EMPRESS)');
      // The scan hands back glob-style separators for a matched folder; only resolve() matters.
      assert.equal(path.resolve(nestedEntry.data.path), nested);
      assert.equal(path.resolve(flatEntry.data.path), flat);
    }
  );

  fs.rmSync(tmp, { recursive: true, force: true });
});
