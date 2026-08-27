'use strict';

/*
  Some Steam emulators keep a game's unlocks INSIDE the game folder rather than under %APPDATA%
  (ALI213 with SaveType=0, the ColdClient/SteamConfig builds, the Hoodlum family). The %APPDATA%
  roots are watched out of the box; these are not, because the data lives wherever the game was
  installed. So unless the game's own folder is a watched folder, the Watchdog never looks at it and
  the unlocks only surface on the next library refresh.

  The detection has to find those folders on its own, and it has to stay bounded: this is a walk over
  the user's game libraries, not a whole-drive search.
*/

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-infolder-'));
const library = path.join(tmp, 'Games');
fs.mkdirSync(library, { recursive: true });

const originalLoad = Module._load;
Module._load = function patchedLoad(request) {
  if (request === 'electron') return { ipcRenderer: { sendSync: () => false, invoke: async () => null } };
  if (request === '@electron/remote' || request.startsWith('@electron/remote/')) return { app: { getPath: () => tmp } };
  // Only the game libraries are searched, and this test supplies them.
  if (request.endsWith('saveRoots.js')) {
    const real = originalLoad.apply(this, arguments);
    return { ...real, defaultSteamEmuSaveRoots: () => [], discoverEmulatorRoots: async () => [], discoverLibraryRoots: async () => [library] };
  }
  return originalLoad.apply(this, arguments);
};
const userDir = require('../../app/parser/userDir.js');
Module._load = originalLoad;

function game(name, files) {
  const dir = path.join(library, name);
  fs.mkdirSync(dir, { recursive: true });
  for (const [file, lines] of Object.entries(files)) fs.writeFileSync(path.join(dir, file), lines.join('\n') + '\n');
  return dir;
}

test('a game whose emulator saves beside it becomes a watched folder', async () => {
  const ali213 = game('ZOMBI', { 'ALI213.ini': ['[Settings]', 'AppID = 339230', 'PlayerName = Player', 'SaveType = 0'] });
  const coldClient = game('Jackbox 2', { 'SteamConfig.ini': ['[Settings]', 'AppId=397460'] });
  // No AppID: nothing here can say which game it is, so it is not a folder to follow.
  game('Nameless', { 'ALI213.ini': ['[Settings]', 'PlayerName = Player'] });
  // An ordinary game with no emulator config at all.
  game('Plain Game', { 'readme.txt': ['nothing to see'] });

  const found = await userDir.findEntries();
  const paths = new Set(found.map((entry) => path.normalize(entry.path).toLowerCase()));
  const has = (dir) => paths.has(path.normalize(dir).toLowerCase());

  assert.equal(has(ali213), true, 'an ALI213 game keeps its unlocks in its own folder');
  assert.equal(has(coldClient), true, 'so does a ColdClient/SteamConfig one');
  assert.equal(has(path.join(library, 'Nameless')), false, 'a config naming no AppID identifies nothing');
  assert.equal(has(path.join(library, 'Plain Game')), false, 'a folder with no emulator config is not achievement data');

  const detected = found.find((entry) => path.normalize(entry.path).toLowerCase() === path.normalize(ali213).toLowerCase());
  assert.equal(detected.origin, 'auto', 'the user did not add it by hand');
  assert.match(detected.detector, /game folder/i, 'the reason is shown in Settings and has to name itself');
});

test('such a folder passes the check that gates adding it', async () => {
  // findEntries only proposes; Settings and the first-run setup both call check() before adding.
  const dir = game('ZOMBI2', { 'ALI213.ini': ['[Settings]', 'AppID = 339230', 'PlayerName = Player', 'SaveType = 0'] });
  const diagnosis = await userDir.diagnose(dir);
  assert.equal(diagnosis.accepted, true, `a folder that is proposed must also be accepted (got ${diagnosis.code})`);
});

test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
