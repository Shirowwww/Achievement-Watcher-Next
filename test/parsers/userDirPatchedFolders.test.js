'use strict';

/*
  MarkerPatch, MadnessPatch and the recompiled games keep their unlock lists in layouts no emulator
  config names. The scan could read them, but adding their folder in Settings was refused as "wrong
  folder", which made the whole feature unreachable. Picking a folder inside such a game (GearGame,
  SaveData, Binaries\Win32) must land on the game's own folder, never on a library around it.
*/

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-patched-'));

const originalLoad = Module._load;
Module._load = function patchedLoad(request) {
  if (request === 'electron') return { ipcRenderer: { sendSync: () => false, invoke: async () => null } };
  if (request === '@electron/remote' || request.startsWith('@electron/remote/')) return { app: { getPath: () => tmp } };
  return originalLoad.apply(this, arguments);
};
const userDir = require('../../app/parser/userDir.js');
Module._load = originalLoad;

function write(file, content = '') {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function markerPatchInstall(root) {
  write(path.join(root, 'deadspace2.exe'), 'MZ');
  write(path.join(root, 'MarkerPatch.ini'), '[General]\nAchievementSupport = 1\n');
  write(path.join(root, 'achievements', 'txt', 'en.txt'), 'Platinum|All of them\n');
  write(path.join(root, 'achievements', 'img', '0.png'), 'png');
  return root;
}

function madnessPatchInstall(root) {
  const bin = path.join(root, 'Binaries', 'Win32');
  write(path.join(bin, 'AliceMadnessReturns.exe'), 'MZ');
  write(path.join(bin, 'MadnessPatch.ini'), '[General]\n');
  write(path.join(bin, 'dinput8.dll'), 'MZ');
  write(path.join(bin, 'Achievements', 'txt', 'en.txt'), 'Platinum|All of them\n');
  write(path.join(bin, 'Achievements', 'img', '0.png'), 'png');
  fs.mkdirSync(path.join(root, 'AliceGame'), { recursive: true });
  return root;
}

// Gears of War 2 Hollow's shape: a launcher at the root, the list under SaveData, UE3 folders beside it.
function hollowInstall(root) {
  write(path.join(root, 'GoW2Hollow_Launcher.exe'), 'MZ');
  write(path.join(root, 'Binaries', 'GoW2Hollow.exe'), 'MZ');
  write(
    path.join(root, 'SaveData', 'Achievements.json'),
    JSON.stringify({ achievements: [{ id: 1, name: 'First', gamerscore: 10, unlocked: true }, { id: 2, name: 'Second', gamerscore: 10, unlocked: false }] })
  );
  fs.mkdirSync(path.join(root, 'GearGame', 'Config'), { recursive: true });
  return root;
}

test('a MarkerPatch install is accepted, and so is a folder inside it', async () => {
  const root = markerPatchInstall(path.join(tmp, 'Dead Space 2'));
  const direct = await userDir.diagnose(root);
  assert.equal(direct.accepted, true);
  assert.equal(direct.code, 'markerpatch');
  assert.equal(direct.canonicalPath, undefined, 'the picked folder is already the game');

  const inner = await userDir.diagnose(path.join(root, 'achievements', 'txt'));
  assert.equal(inner.accepted, true);
  assert.equal(path.resolve(inner.canonicalPath), path.resolve(root));
});

test('a MadnessPatch install is accepted from the game root or from inside it', async () => {
  const root = madnessPatchInstall(path.join(tmp, 'Alice Madness Returns'));
  const direct = await userDir.diagnose(root);
  assert.equal(direct.accepted, true);
  assert.equal(direct.code, 'madnesspatch');

  const sibling = await userDir.diagnose(path.join(root, 'AliceGame'));
  assert.equal(sibling.accepted, true, 'a sibling of Binaries still belongs to the game');
  assert.equal(path.resolve(sibling.canonicalPath), path.resolve(root));
});

test('Gears of War 2 Hollow is accepted from its root, GearGame or SaveData', async () => {
  const root = hollowInstall(path.join(tmp, 'GoW2 Hollow'));
  const direct = await userDir.diagnose(root);
  assert.equal(direct.accepted, true);
  assert.equal(direct.code, 'recompilation');

  for (const inner of ['GearGame', 'SaveData', path.join('GearGame', 'Config')]) {
    const diagnosis = await userDir.diagnose(path.join(root, inner));
    assert.equal(diagnosis.accepted, true, `${inner} is inside the game`);
    assert.equal(path.resolve(diagnosis.canonicalPath), path.resolve(root), `${inner} is kept as the game folder`);
  }
});

test('a folder beside a patched game in a library is still refused', async () => {
  const library = path.join(tmp, 'Library');
  markerPatchInstall(path.join(library, 'Dead Space 2'));
  write(path.join(library, 'Other Game', 'Binaries', 'Other.exe'), 'MZ');

  const unrelated = await userDir.diagnose(path.join(library, 'Other Game', 'Binaries'));
  assert.equal(unrelated.accepted, false, 'a neighbour of a patched game is not that game');
  assert.equal(unrelated.canonicalPath, undefined);

  const whole = await userDir.diagnose(library);
  assert.equal(whole.accepted, true, 'the library holding a patched game can be watched as a whole');
  assert.equal(whole.canonicalPath, undefined);
});
