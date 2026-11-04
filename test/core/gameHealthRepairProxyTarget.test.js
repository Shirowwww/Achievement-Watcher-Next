'use strict';

/*
  A release can run GBE from a steamclient64.dll that a proxy dll (version.dll, winmm.dll) loads
  beside the exe, with Valve's steam_api64.dll left untouched elsewhere (#169). The steam_settings
  that works sits beside that proxy; the repair must write there, not make a new folder beside
  Valve's dll, which nothing reads.
*/

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { planAchievementDataRepair } = require(path.join(__dirname, '..', '..', 'app', 'util', 'gameHealthRepair.js'));

const VALVE_DLL = Buffer.from('MZ valve steam api, no emulator marker');
const GBE_DLL = Buffer.from('MZ gbe build ... steam_settings ... GSE Saves');

function put(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function withTmp(fn) {
  return () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-proxy-target-'));
    try {
      fn(dir);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  };
}

test(
  'a Unity game with GBE loaded by version.dll is repaired where it runs, not beside Valve\'s dll',
  withTmp((root) => {
    const valveDir = path.join(root, 'Game_Data', 'Plugins', 'x86_64');
    put(path.join(root, 'Game.exe'), 'stub');
    put(path.join(root, 'version.dll'), 'MZ proxy');
    put(path.join(root, 'steamclient64.dll'), GBE_DLL);
    put(path.join(root, 'steam_settings', 'achievements.json'), '[]');
    put(path.join(valveDir, 'steam_api64.dll'), VALVE_DLL);

    const plan = planAchievementDataRepair({
      steamSettings: path.join(root, 'steam_settings'),
      gameDir: root,
      dllDirs: [valveDir],
      exePath: path.join(root, 'Game.exe'),
    });

    assert.equal(plan.target, path.join(root, 'steam_settings'));
    assert.equal(plan.relocatedFrom, '');
  })
);

test(
  'an Unreal game with GBE loaded by winmm.dll keeps its settings beside the proxy, not in the engine folder',
  withTmp((root) => {
    const binDir = path.join(root, 'Union', 'Binaries', 'Win64');
    const engineDir = path.join(root, 'Engine', 'Binaries', 'ThirdParty', 'Steamworks', 'Steamv157', 'Win64');
    put(path.join(binDir, 'Game-Win64-Shipping.exe'), 'stub');
    put(path.join(binDir, 'winmm.dll'), 'MZ proxy');
    put(path.join(binDir, 'steamclient64.dll'), GBE_DLL);
    put(path.join(binDir, 'steam_settings', 'achievements.json'), '[]');
    put(path.join(engineDir, 'steam_api64.dll'), VALVE_DLL);

    const plan = planAchievementDataRepair({
      steamSettings: path.join(binDir, 'steam_settings'),
      gameDir: root,
      dllDirs: [engineDir],
      exePath: path.join(binDir, 'Game-Win64-Shipping.exe'),
    });

    assert.equal(plan.target, path.join(binDir, 'steam_settings'));
  })
);

test(
  'a steam_settings with no emulator beside it still moves to the folder of the dll the game loads',
  withTmp((root) => {
    const dllDir = path.join(root, 'bin');
    put(path.join(root, 'steam_settings', 'achievements.json'), '[]');
    put(path.join(dllDir, 'steam_api64.dll'), GBE_DLL);

    const plan = planAchievementDataRepair({
      steamSettings: path.join(root, 'steam_settings'),
      gameDir: root,
      dllDirs: [dllDir],
      exePath: path.join(dllDir, 'Game.exe'),
    });

    assert.equal(plan.target, path.join(dllDir, 'steam_settings'));
  })
);
