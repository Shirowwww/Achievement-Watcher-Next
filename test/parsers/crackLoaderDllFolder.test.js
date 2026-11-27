'use strict';

/*
  D4: Dark Dreams Don't Die (358090), RELOADED, on a player's machine (27/11/2026): a 32-bit launcher
  alone at the root, the game and RELOADED's steam_api64.dll in Binaries/Win64. The crack was looked
  for at the root and in the engine folders only, so the folder read as a broken GBE setup: Game
  Health showed a red X and offered to install the emulator, which stopped the game from starting.
*/

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const crackLoaderDetect = require('../../app/util/crackLoaderDetect.js');
const gameHealth = require('../../app/util/gameHealth.js');
const { peWithSections } = require('../helpers/fakePe.js');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-crack-dll-folder-'));
test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const COMPILER = ['.text', '.rdata', '.data', '.pdata', '.rsrc', '.reloc'];
let count = 0;

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return file;
}

// A UE3 layout: the launcher at the root, the game and its Steam dll two levels down.
function ue3Install(dll) {
  const root = path.join(tmp, `game-${++count}`);
  const win64 = path.join(root, 'Binaries', 'Win64');
  write(path.join(root, 'D4.exe'), 'launcher');
  write(path.join(win64, 'D4Game.exe'), 'game');
  write(path.join(win64, 'steam_api64.dll'), dll);
  return { root, win64 };
}

test('a crack ini beside a steam_api dll in Binaries/Win64 serves the game', () => {
  const { root, win64 } = ue3Install(peWithSections(COMPILER));
  write(path.join(win64, 'steam_api.ini'), '[Settings]\r\nAppId=0000358090\r\n');
  const loader = crackLoaderDetect.detectWorkingCrackLoader(root);
  assert.equal(loader && loader.name, 'CODEX / RUNE / scene emulator');
  assert.equal(loader.replaceable, true);
  assert.equal(loader.dir, win64);
});

test('RELOADED built into the steam_api dll is a crack even with no ini beside it', () => {
  const { root, win64 } = ue3Install(peWithSections([...COMPILER, '.RLD0', '.RLD1', '.RLD2']));
  const loader = crackLoaderDetect.detectWorkingCrackLoader(root);
  assert.equal(loader && loader.name, 'RELOADED');
  assert.equal(loader.replaceable, true);
  assert.equal(loader.dir, win64);
  // Its runtime is the dll itself: the switch replaces it with a .bak, nothing is set aside.
  assert.deepEqual(crackLoaderDetect.disableLoaderMarkers([win64]), []);
  assert.ok(fs.existsSync(path.join(win64, 'steam_api64.dll')));
});

test("Valve's dll down in Binaries/Win64 is no crack", () => {
  const { root } = ue3Install(peWithSections(COMPILER));
  assert.equal(crackLoaderDetect.detectWorkingCrackLoader(root), null);
});

test('a GBE dll in a subfolder over a leftover crack ini is not the crack', () => {
  const { root, win64 } = ue3Install(Buffer.concat([peWithSections(COMPILER), Buffer.from('steam_settings')]));
  write(path.join(win64, 'steam_api.ini'), '[Settings]\r\nAppId=358090\r\n');
  assert.equal(crackLoaderDetect.detectWorkingCrackLoader(root), null);
});

test('Game Health leaves a RELOADED game that records alone: no install, no switch', () => {
  const report = gameHealth.deriveHealth({
    appid: '358090',
    name: "D4: Dark Dreams Don't Die",
    source: 'Reloaded - 3DM',
    system: 'steam',
    installed: true,
    gameDir: 'E:\\Games\\D4',
    gameDirExists: true,
    emulated: false,
    goldberg: null,
    achievements: { total: 57, unlocked: 4 },
    playtime: { total: 2 * 3600 },
    saveSources: [{ source: 'Reloaded - 3DM', path: 'C:\\ProgramData\\Steam\\Player\\358090', exists: true }],
    crackLoader: { name: 'RELOADED', replaceable: true },
  });
  const row = report.checks.find((check) => check.id === 'emulator');
  assert.equal(row.params.servedBy, 'RELOADED');
  assert.ok(!row.actions.includes(gameHealth.ACTION.SWITCH_RUNTIME));
  assert.ok(!report.actions.includes(gameHealth.ACTION.INSTALL_RUNTIME));
});
