'use strict';

/*
  Installing or switching the emulator runtime is undone like any other repair: the dll the game
  shipped comes back, the .bak goes, and a dll installed where there was none is removed.
*/

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const gbeInstaller = require(path.join(__dirname, '..', '..', 'app', 'parser', 'gbeInstaller.js'));
const repairJournal = require(path.join(__dirname, '..', '..', 'app', 'util', 'repairJournal.js'));

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-undo-runtime-'));
test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

function treeOf(dir) {
  return Object.fromEntries(
    fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => [entry.name, fs.readFileSync(path.join(dir, entry.name), 'utf8')])
  );
}

function fixture(name, files) {
  const gameDir = path.join(tmp, name);
  fs.mkdirSync(gameDir, { recursive: true });
  for (const [file, text] of Object.entries(files)) fs.writeFileSync(path.join(gameDir, file), text);
  const cache = path.join(tmp, `${name}-cache`);
  fs.mkdirSync(cache, { recursive: true });
  fs.writeFileSync(path.join(cache, 'steam_api64.dll'), 'gbe-x64');
  return { gameDir, dlls: { tag: 'test-build', x64: path.join(cache, 'steam_api64.dll'), x86: null }, userDataPath: path.join(tmp, `${name}-userdata`) };
}

async function installAndUndo({ gameDir, dlls, userDataPath }, options) {
  const roots = repairJournal.gbeRoots({ runtimeDirs: [gameDir] });
  await repairJournal.record({ userDataPath, appid: '400', label: 'install-runtime', roots }, () => gbeInstaller.installDlls({ dllDirs: [gameDir], dlls, ...options }));
  return repairJournal.undo({ userDataPath, appid: '400' });
}

test("the game's own dll comes back after the emulator replaced it", async () => {
  const setup = fixture('replaced', { 'game.exe': 'exe', 'steam_api64.dll': 'valve-original' });
  const before = treeOf(setup.gameDir);
  const result = await installAndUndo(setup, {});
  assert.deepEqual(result.skipped, []);
  assert.deepEqual(treeOf(setup.gameDir), before);
});

test('a dll installed where there was none is taken back out', async () => {
  const setup = fixture('missing', { 'game.exe': 'exe' });
  const before = treeOf(setup.gameDir);
  await installAndUndo(setup, { writeIfMissing: 'x64' });
  assert.deepEqual(treeOf(setup.gameDir), before);
});
