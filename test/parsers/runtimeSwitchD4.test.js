'use strict';

/*
  D4: Dark Dreams Don't Die (358090), RELOADED, on the player's machine (26/11/2026): a 32-bit
  launcher D4.exe alone at the root, the game and RELOADED's steam_api64.dll with its steam_api.ini in
  Binaries/Win64, and a steam_settings an earlier repair made there. Three faults kept the switch to
  GBE crashing the game: a steam_interfaces.txt holding only a macro name, left by a failed try, was
  taken as good; the switch seeded x86 and x64 dlls where the release had none; and its Undo left
  both behind. Built from the AW backups and the game_health.json the player exported.
*/

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-d4-switch-'));
test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
process.env.APPDATA = path.join(tmp, 'AppData');

const gbe = require('../../app/parser/gbeInstaller.js');
const goldberg = require('../../app/parser/goldberg.js');
const gameHealthRepair = require('../../app/util/gameHealthRepair.js');
const runtimeSwitchUndo = require('../../app/util/runtimeSwitchUndo.js');
const crackLoaderDetect = require('../../app/util/crackLoaderDetect.js');

// The RELOADED runtime: no GBE marker, and not Valve-signed.
const RLD_RUNTIME = Buffer.from('reloaded runtime with .RLD0 sections');
const AW_X64 = Buffer.from('aw gbe x64 build reading steam_settings');
const AW_X86 = Buffer.from('aw gbe x86 build reading steam_settings');
const MACRO_ONLY = 'STEAMCONTROLLER_INTERFACE_VERSION\n';
const INTERFACES = 'SteamClient017\nSteamUser017\nSTEAMUSERSTATS_INTERFACE_VERSION011\n';
const SCHEMA = { achievement: { list: [{ name: 'ACH_01', displayName: 'First', description: 'first', hidden: 0, icon: '', icongray: '' }] } };
const isAwBuild = (file) => {
  try {
    const bytes = fs.readFileSync(file);
    return bytes.equals(AW_X64) || bytes.equals(AW_X86);
  } catch {
    return false;
  }
};

let count = 0;
function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return file;
}

function d4Install() {
  const root = path.join(tmp, `D4 - Dark Dreams Don't Die ${++count}`);
  const win64 = path.join(root, 'Binaries', 'Win64');
  const settings = path.join(win64, 'steam_settings');
  write(path.join(root, 'D4.exe'), 'launcher');
  write(path.join(win64, 'D4-Win64-Shipping.exe'), 'game');
  write(path.join(win64, 'steam_api64.dll'), RLD_RUNTIME);
  write(path.join(win64, 'steam_api.ini'), '[Settings]\r\nAppId=0000358090\r\n');
  write(path.join(settings, 'achievements.json'), '[{"name":"ACH_01","displayName":"Old","description":"","hidden":"0","icon":"","icongray":""}]');
  write(path.join(settings, 'configs.main.ini'), '[main::general]\nnew_app_ticket=1\n');
  write(path.join(settings, 'steam_appid.txt'), '358090');
  write(path.join(settings, '.aw-next-created'), 'Created by AW Next.\n');
  return { root, win64, settings };
}

// Every file and folder under `root`, with a digest of its bytes.
function tree(root) {
  const out = {};
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      const rel = path.relative(root, full).split(path.sep).join('/');
      if (entry.isDirectory()) {
        out[`${rel}/`] = 'dir';
        walk(full);
      } else out[rel] = crypto.createHash('sha1').update(fs.readFileSync(full)).digest('hex');
    }
  };
  walk(root);
  return out;
}

function cachedBuild() {
  const dir = path.join(tmp, `cache-${++count}`);
  return {
    tag: 'release-test',
    x64: write(path.join(dir, 'steam_api64.dll'), AW_X64),
    x86: write(path.join(dir, 'steam_api.dll'), AW_X86),
    interfaces: {},
  };
}

// The plan Game Health makes: D4.exe is 32-bit, so the install plan wants steam_api.dll everywhere.
function d4Plans({ root, settings }) {
  const installPlan = gameHealthRepair.planRuntimeInstall({ gbeInstaller: gbe, gameDir: root, exePath: path.join(root, 'D4.exe'), steamSettings: settings, arch: 'x86' });
  const plan = gameHealthRepair.planRuntimeSwitch({ gbeInstaller: gbe, plan: installPlan, dllPaths: goldberg.detectEmulator(root).dll, isAwBuild });
  return { installPlan, plan };
}

test('a steam_interfaces.txt with no version line does not make the switch look safe', async () => {
  const { win64, settings } = d4Install();
  write(path.join(settings, 'steam_interfaces.txt'), MACRO_ONLY);
  const ready = await gameHealthRepair.switchInterfacesReady({
    gbeInstaller: { ensureEmulatorDlls: async () => ({ tag: 'test', interfaces: {} }), tryGenerateInterfaces: gbe.tryGenerateInterfaces },
    plan: { dirs: [win64], file: 'steam_api64.dll', arch: 'x64' },
    steamSettings: settings,
    appid: '358090',
    log: { log() {} },
  });
  assert.deepEqual(ready, { ready: false, reason: 'unsigned-dll' }, 'nothing can name the versions here, so the switch is refused');

  write(path.join(win64, 'steam_emu.ini'), '[Interfaces]\r\nSteamUser=SteamUser017\r\n');
  const withScene = await gameHealthRepair.switchInterfacesReady({
    gbeInstaller: { ensureEmulatorDlls: async () => ({ tag: 'test', interfaces: {} }), tryGenerateInterfaces: gbe.tryGenerateInterfaces },
    plan: { dirs: [win64], file: 'steam_api64.dll', arch: 'x64' },
    steamSettings: settings,
    appid: '358090',
    log: { log() {} },
  });
  assert.deepEqual(withScene, { ready: true, reason: '' }, 'the normal path is taken instead of the leftover file');
});

test('generation replaces a macro-only steam_interfaces.txt, or takes it out when it cannot', async () => {
  const { win64, settings } = d4Install();
  const file = write(path.join(settings, 'steam_interfaces.txt'), MACRO_ONLY);
  const dllPath = path.join(win64, 'steam_api64.dll');
  const failed = await gbe.generateInterfaces({ dllPath, steamSettings: settings, dlls: { tag: 'test', interfaces: {} } });
  assert.equal(failed.generated, false);
  assert.equal(fs.existsSync(file), false, 'GBE then answers from its own versions instead of a list of none');

  write(file, MACRO_ONLY);
  write(path.join(win64, 'steam_emu.ini'), '[Interfaces]\r\nSteamUser=SteamUser017\r\nSteamClient=SteamClient017\r\n');
  const made = await gbe.generateInterfaces({ dllPath, steamSettings: settings, dlls: { tag: 'test', interfaces: {} } });
  assert.equal(made.generated, true);
  assert.equal(fs.readFileSync(file, 'utf8'), 'SteamUser017\nSteamClient017\n');
});

test('the switch plan keeps to the dll the release ships: Binaries/Win64, x64', () => {
  const install = d4Install();
  const { installPlan, plan } = d4Plans(install);
  assert.equal(installPlan.file, 'steam_api.dll', "the launcher's architecture, which is not the game's");
  assert.deepEqual(plan.dirs, [install.win64]);
  assert.equal(plan.file, 'steam_api64.dll');
  assert.equal(plan.arch, 'x64');
  assert.deepEqual(plan.replace, [path.join(install.win64, 'steam_api64.dll')]);

  // The dlls the nightly.21 and .22 switches left: AW's own builds, so never the release's.
  write(path.join(install.root, 'steam_api64.dll'), AW_X64);
  write(path.join(install.root, 'steam_api64.dll.bak'), AW_X64);
  write(path.join(install.root, 'steam_api.dll'), AW_X86);
  write(path.join(install.win64, 'steam_api.dll'), AW_X86);
  const again = d4Plans(install).plan;
  assert.deepEqual(again.replace, [path.join(install.win64, 'steam_api64.dll')]);
});

test('a release with no Steam dll of its own keeps the install plan', () => {
  const root = path.join(tmp, `gta-${++count}`);
  write(path.join(root, 'gtaiv.exe'), 'game');
  const installPlan = gameHealthRepair.planRuntimeInstall({ gbeInstaller: gbe, gameDir: root, exePath: path.join(root, 'gtaiv.exe'), arch: 'x86' });
  assert.equal(gameHealthRepair.planRuntimeSwitch({ gbeInstaller: gbe, plan: installPlan, isAwBuild }), installPlan);
});

// The switch as the panel runs it, with a stand-in only for the interface list.
async function switchD4(install) {
  const { plan } = d4Plans(install);
  const gbeInstaller = {
    ...gbe,
    generateInterfaces: async ({ steamSettings }) => {
      write(path.join(steamSettings, 'steam_interfaces.txt'), INTERFACES);
      return { generated: true };
    },
  };
  return gameHealthRepair.switchToSupportedRuntime({
    gbeInstaller,
    goldberg,
    plan,
    steamSettings: install.settings,
    appid: '358090',
    schema: SCHEMA,
    dlls: cachedBuild(),
    log: { log() {}, error() {} },
    sideline: () => crackLoaderDetect.disableLoaderMarkers([install.root, ...plan.dirs]),
  });
}

test('the switch replaces only the release dll, and its Undo puts the folder back exactly', async () => {
  const install = d4Install();
  const before = tree(install.root);

  await switchD4(install);
  assert.deepEqual(fs.readdirSync(install.root).sort(), ['Binaries', 'D4.exe'], 'nothing seeded beside the launcher');
  assert.ok(fs.readFileSync(path.join(install.win64, 'steam_api64.dll')).equals(AW_X64));
  assert.ok(fs.readFileSync(path.join(install.win64, 'steam_api64.dll.bak')).equals(RLD_RUNTIME));
  assert.equal(fs.existsSync(path.join(install.win64, 'steam_api.dll')), false, 'no x86 dll beside the x64 game');
  assert.equal(fs.readFileSync(path.join(install.settings, 'steam_interfaces.txt'), 'utf8'), INTERFACES);

  const dirs = [install.root, install.win64];
  const undone = runtimeSwitchUndo.undoRuntimeSwitch({ dirs, isAwBuild });
  assert.ok(undone.removed.includes(path.join(install.settings, 'steam_interfaces.txt')), 'what the switch made goes with it');
  assert.deepEqual(tree(install.root), before);
  assert.equal(crackLoaderDetect.detectWorkingCrackLoader(install.win64).name, 'CODEX / RUNE / scene emulator', 'RELOADED serves the game again');
});

test('switching twice and undoing once still ends on the release', async () => {
  const install = d4Install();
  const before = tree(install.root);
  await switchD4(install);
  await switchD4(install);
  runtimeSwitchUndo.undoRuntimeSwitch({ dirs: [install.root, install.win64], isAwBuild });
  assert.deepEqual(tree(install.root), before);
});

test("the Undo takes out the dlls earlier switches left, which no record names", () => {
  // The player's install after the nightly.22 Undo (game_health.json, technical.goldberg.runtimeDlls).
  const install = d4Install();
  const before = tree(install.root);
  write(path.join(install.root, 'steam_api64.dll'), AW_X64);
  write(path.join(install.root, 'steam_api64.dll.bak'), AW_X64);
  write(path.join(install.root, 'steam_api.dll'), AW_X86);
  write(path.join(install.win64, 'steam_api.dll'), AW_X86);

  const leftovers = runtimeSwitchUndo.leftoverDlls({ dirs: [install.root, install.win64], isAwBuild });
  assert.equal(leftovers.length, 3, 'and so the panel offers the Undo again');
  runtimeSwitchUndo.undoRuntimeSwitch({ dirs: [install.root, install.win64], isAwBuild });
  assert.deepEqual(tree(install.root), before);
});

test('an emulator AW installed into a game with no crack is never taken for a leftover', () => {
  const root = path.join(tmp, `plain-${++count}`);
  write(path.join(root, 'steam_api64.dll'), AW_X64);
  write(path.join(root, 'steam_settings', 'steam_appid.txt'), '480');
  assert.deepEqual(runtimeSwitchUndo.leftoverDlls({ dirs: [root], isAwBuild }), []);
  runtimeSwitchUndo.undoRuntimeSwitch({ dirs: [root], isAwBuild });
  assert.ok(fs.existsSync(path.join(root, 'steam_api64.dll')));
});
