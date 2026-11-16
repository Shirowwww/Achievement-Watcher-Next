'use strict';

/*
  #195: with Steamless off, the emulator fix still unpacked Dawnwalker.exe, then had its GBE archive
  blocked by Defender and stopped there, the exe rewritten. Every download now comes before the first
  write, and a setting that is off is never overridden without asking.
*/

const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { makeTempDir } = require('../helpers/tempDir');

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'electron') return { ipcRenderer: { sendSync: () => false, invoke: async () => null } };
  if (request === '@electron/remote' || request.startsWith('@electron/remote/')) return {};
  return originalLoad.call(this, request, parent, isMain);
};

const appDir = path.join(__dirname, '..', '..', 'app');
const achievements = require(path.join(appDir, 'parser', 'achievements.js'));
const gbeInstaller = require(path.join(appDir, 'parser', 'gbeInstaller.js'));
const steamless = require(path.join(appDir, 'parser', 'steamless.js'));
const goldberg = require(path.join(appDir, 'parser', 'goldberg.js'));

// A PE32+ whose section table names `.bind`: what pe.detectSteamStub reads as SteamStub.
function steamStubExe() {
  const buf = Buffer.alloc(0x400, 0);
  const peOff = 0x80;
  const sizeOpt = 0xe0;
  buf.write('MZ', 0, 'ascii');
  buf.writeUInt32LE(peOff, 0x3c);
  buf.writeUInt32LE(0x00004550, peOff);
  buf.writeUInt16LE(0x8664, peOff + 4);
  buf.writeUInt16LE(2, peOff + 6);
  buf.writeUInt16LE(sizeOpt, peOff + 20);
  const table = peOff + 24 + sizeOpt;
  buf.write('.text', table, 8, 'latin1');
  buf.write('.bind', table + 40, 8, 'latin1');
  return buf;
}

function tree(dir) {
  const out = {};
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else out[path.relative(dir, full)] = fs.readFileSync(full).toString('base64');
    }
  };
  walk(dir);
  return out;
}

function setupGame() {
  const userData = makeTempDir('aw-txn-user-');
  fs.mkdirSync(path.join(userData, 'logs'), { recursive: true });
  achievements.initDebug({ isDev: false, userDataPath: userData });
  const gameDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-txn-game-'));
  const exe = path.join(gameDir, 'Dawnwalker.exe');
  fs.writeFileSync(exe, steamStubExe());
  fs.writeFileSync(path.join(gameDir, 'steam_api64.dll'), 'valve original');
  return { gameDir, exe, detectedExe: { full: exe, name: 'Dawnwalker.exe' } };
}

// Swaps the network-facing helpers for counters for the length of one test.
function stubTools(t, { gbe = async () => ({ tag: 'test' }) } = {}) {
  const calls = { gbe: 0, steamlessDownload: 0, strip: 0 };
  const saved = { ensureEmulatorDlls: gbeInstaller.ensureEmulatorDlls, ensureSteamless: steamless.ensureSteamless, stripDrm: steamless.stripDrm };
  gbeInstaller.ensureEmulatorDlls = async (...args) => {
    calls.gbe++;
    return gbe(...args);
  };
  steamless.ensureSteamless = async () => {
    calls.steamlessDownload++;
    return { tag: 'test', cli: 'Steamless.CLI.exe' };
  };
  steamless.stripDrm = async ({ exePath }) => {
    calls.strip++;
    fs.copyFileSync(exePath, `${exePath}.steamstub.bak`);
    fs.writeFileSync(exePath, 'unpacked');
    return { stripped: true };
  };
  t.after(() => Object.assign(gbeInstaller, { ensureEmulatorDlls: saved.ensureEmulatorDlls }));
  t.after(() => Object.assign(steamless, { ensureSteamless: saved.ensureSteamless, stripDrm: saved.stripDrm }));
  return calls;
}

const optionWith = (emulator) => ({ emulator: { autoApplyCrackFix: false, apiCheckBypass: false, ...emulator }, achievement: {}, general: {} });

test('Steamless off: a SteamStub game is left exactly as it was, and nothing is downloaded', async (t) => {
  const { gameDir, detectedExe } = setupGame();
  t.after(() => fs.rmSync(gameDir, { recursive: true, force: true }));
  const calls = stubTools(t);
  const before = tree(gameDir);
  let backups = 0;
  const result = await achievements.autoApplyEmulatorFix({
    gameDir,
    gameName: 'Dawnwalker',
    appid: '3751260',
    option: optionWith({ steamlessAutoUnpack: false }),
    detectedEmu: goldberg.detectEmulator(gameDir),
    detectedExe,
    beforeWrite: () => backups++,
  });
  assert.equal(result.skipped, true);
  assert.equal(result.reason, 'steamstub-needs-steamless');
  assert.deepEqual(calls, { gbe: 0, steamlessDownload: 0, strip: 0 });
  assert.equal(backups, 0);
  assert.deepEqual(tree(gameDir), before);
});

test('a blocked GBE download stops the fix before Steamless touches the exe', async (t) => {
  const { gameDir, detectedExe } = setupGame();
  t.after(() => fs.rmSync(gameDir, { recursive: true, force: true }));
  const calls = stubTools(t, {
    gbe: async () => {
      throw Object.assign(new Error('Operation did not complete successfully because the file contains a virus'), { code: 'EPERM' });
    },
  });
  const before = tree(gameDir);
  let backups = 0;
  await assert.rejects(
    achievements.autoApplyEmulatorFix({
      gameDir,
      gameName: 'Dawnwalker',
      appid: '3751260',
      option: optionWith({ steamlessAutoUnpack: true }),
      detectedEmu: goldberg.detectEmulator(gameDir),
      detectedExe,
      beforeWrite: () => backups++,
    }),
    /virus/
  );
  assert.equal(calls.strip, 0, 'Steamless never ran');
  assert.equal(backups, 0, 'nothing reached the write stage');
  assert.deepEqual(tree(gameDir), before, 'the folder is byte-identical');
});

test('the right-click fix downloads everything before its undo record starts, and asks before Steamless', () => {
  const src = fs.readFileSync(path.join(appDir, 'app.js'), 'utf8');
  const start = src.indexOf("startRepairRecord(appid, 'emulator-fix'");
  assert.ok(start > 0);
  const handler = src.slice(src.lastIndexOf('async click(menuItem)', start), src.indexOf('endRepairRecord(fixRecord)', start));
  const at = (needle) => handler.indexOf(needle);
  const record = at("startRepairRecord(appid, 'emulator-fix'");
  for (const download of ['gbeInstaller.ensureEmulatorDlls(', '.ensureSteamless(', 'apiCheckBypass.ensureBypassDlls(']) {
    assert.ok(at(download) > 0 && at(download) < record, `${download} must run before the first write`);
    assert.equal(handler.indexOf(download, record), -1, `${download} must not run again after writes began`);
  }
  assert.ok(at('chooseManualSteamless(') > 0 && at('chooseManualSteamless(') < record, 'Steamless is settled before anything is written');
  assert.match(handler, /failRepairRecord\(fixRecord, err\)/, 'a failure rolls the fix back');
  assert.match(src, /async function chooseManualSteamless[\s\S]*?steamlessAutoUnpack === true[\s\S]*?showMessageBox/, 'Steamless off is asked about, never overridden');
});

test('a failed Game Health runtime install is rolled back, and its download comes first', () => {
  const src = fs.readFileSync(path.join(appDir, 'ui', 'gameHealthPanel.js'), 'utf8');
  const block = src.slice(src.indexOf('if (action === gameHealth.ACTION.INSTALL_RUNTIME'), src.indexOf("t('gh-runtime-done'"));
  assert.ok(block.indexOf('ensureEmulatorDlls(') < block.indexOf('journaledRepair('), 'the build is downloaded before the first rename');
  assert.match(block, /let sidelined = \[\];[\s\S]*journaledRepair/, 'sidelined is declared where the result dialog can read it');
});
