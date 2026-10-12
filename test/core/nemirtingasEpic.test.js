'use strict';

/*
  #112: a Nemirtingas Epic setup that never saves. The reporter's own config is the fixture; the
  arguments it builds are the ones that made their game save. Only a SavePath AW Next cannot read is
  a fault; the arguments are an offer, since only some EOS games need them.
*/

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');

const nemirtingas = require('../../app/util/nemirtingasEpic.js');
const { deriveHealth, LEVEL, ACTION } = require('../../app/util/gameHealth.js');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-nemirtingas-'));
test.after(() => fs.rmSync(root, { recursive: true, force: true }));

const NAMESPACE = 'c4763f236d08423eb47b4c3008779c84';
const EPIC_ID = 'dd23ecc164958c70215b3fce6f57ff7b';

function config({ savePath = 'appdata', appId = NAMESPACE, overlay = true } = {}) {
  return {
    EOSEmu: {
      Achievements: { OnlineDatabase: '' },
      Application: { AppId: appId, DisableCrashDump: false, DisableOnlineNetworking: false, LogLevel: 'off', SavePath: savePath },
      Ecom: { UnlockDlcs: true },
      Plugins: { Overlay: { DelayDetection: '5s', Enabled: overlay } },
      User: { EpicId: EPIC_ID, Language: 'en', ProductUserId: '0002a74db67cdac6a1a43612bb600e5b', UserName: 'User' },
    },
    Network: { IceServers: [] },
  };
}

// The emulator replaces the EOS library a few engine folders below the game folder, as in Unreal.
function gameWith(name, cfg, { library = true } = {}) {
  const gameDir = path.join(root, name);
  const eosDir = path.join(gameDir, 'Engine', 'Binaries', 'ThirdParty', 'EOSSDK', 'Win64');
  fs.mkdirSync(path.join(eosDir, 'nepice_settings'), { recursive: true });
  if (library) fs.writeFileSync(path.join(eosDir, 'EOSSDK-Win64-Shipping.dll'), '');
  fs.writeFileSync(path.join(eosDir, 'nepice_settings', 'NemirtingasEpicEmu.json'), typeof cfg === 'string' ? cfg : JSON.stringify(cfg));
  return gameDir;
}

const emptyAppData = path.join(root, 'AppData-empty');

test('the reporter’s setup is offered exactly the arguments that made it save, as a hint', () => {
  const report = nemirtingas.diagnose({ gameDir: gameWith('Alan Wake 2', config()), appData: emptyAppData });
  assert.equal(report.problem, '', 'missing arguments are not a fault: many games never need them');
  assert.equal(report.hint, 'launch-args');
  assert.equal(report.overlay, true);
  assert.equal(
    report.suggestedArgs,
    `-AUTH_LOGIN=unused -AUTH_PASSWORD=cdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcd -AUTH_TYPE=exchangecode -epicapp=${NAMESPACE} -epicenv=Prod -EpicPortal -epicusername="User" -epicuserid=${EPIC_ID} -epicsandboxid=${NAMESPACE} -epiclocale=en`
  );
});

test('the hint goes away once the arguments are set or the emulator has saved for the game', () => {
  const gameDir = gameWith('Set Up', config({ overlay: false }));
  const args = nemirtingas.diagnose({ gameDir, appData: emptyAppData }).suggestedArgs;
  assert.equal(nemirtingas.diagnose({ gameDir, launchArgs: args, appData: emptyAppData }).hint, '');

  const appData = path.join(root, 'AppData-saved');
  fs.mkdirSync(path.join(appData, 'NemirtingasEpicEmu', EPIC_ID, NAMESPACE.toUpperCase()), { recursive: true });
  assert.equal(nemirtingas.diagnose({ gameDir, appData }).hint, '', 'a .bat launcher that works needs no hint');
});

test('only a save path outside AppData is a fault', () => {
  const local = nemirtingas.diagnose({ gameDir: gameWith('Local Saves', config({ savePath: 'saves' })), appData: emptyAppData });
  assert.equal(local.problem, 'save-path');
  assert.equal(local.hint, '');
  const placeholder = nemirtingas.diagnose({ gameDir: gameWith('Placeholder', config({ appId: '<game-namespace>' })), appData: emptyAppData });
  assert.equal(placeholder.problem, '', 'an AppId is not what decides where saves go');
  assert.equal(placeholder.hint, '', 'no arguments can be built without a real namespace, so none are offered');
});

test('the older flat config is read too, and an unknown save path raises nothing', () => {
  const flat = nemirtingas.diagnose({ gameDir: gameWith('Flat', { appid: 'CrabTest', username: 'Shirow', savepath: 'appdata', enable_overlay: true }), appData: emptyAppData });
  assert.equal(flat.problem, '');
  assert.equal(flat.overlay, false, 'enable_overlay was documented as unused');
  assert.match(flat.suggestedArgs, /-epicapp=CrabTest .*-epicusername="Shirow"/);
  assert.doesNotMatch(flat.suggestedArgs, /-epicuserid=/, 'no user id to pass');
  const unknown = nemirtingas.diagnose({ gameDir: gameWith('No SavePath', { EOSEmu: { Application: { AppId: NAMESPACE } } }), launchArgs: '-epicapp=x' });
  assert.equal(unknown.problem, '');
});

test('without the EOS library beside it, or with a broken config, nothing is reported', () => {
  const plain = path.join(root, 'Plain Game');
  fs.mkdirSync(plain, { recursive: true });
  assert.equal(nemirtingas.diagnose({ gameDir: plain }), null);
  assert.equal(nemirtingas.diagnose({ gameDir: '' }), null);
  assert.equal(nemirtingas.diagnose({ gameDir: gameWith('Leftover', config(), { library: false }) }), null, 'a stale settings folder is not the emulator');
  assert.equal(nemirtingas.diagnose({ gameDir: gameWith('Broken', '{ not json') }), null);
});

test('Game Health: a wrong save path warns, the arguments are an informational offer', () => {
  const base = {
    appid: NAMESPACE,
    source: 'epic',
    gameDir: 'C:/Games/Alan Wake 2',
    gameDirExists: true,
    installed: true,
    achievements: { total: 88, unlocked: 0 },
    tracking: { indexed: true, binary: 'AlanWake2.exe' },
    notifications: { transport: 'auto' },
  };
  const wrongPath = deriveHealth({ ...base, nemirtingasEpic: { problem: 'save-path', hint: '', overlay: false } });
  assert.equal(wrongPath.checks.find((entry) => entry.id === 'nemirtingas').level, LEVEL.WARN);
  assert.equal(wrongPath.reason, 'nemirtingas-setup');

  const offer = deriveHealth({ ...base, nemirtingasEpic: { problem: '', hint: 'launch-args', overlay: true, suggestedArgs: '-epicapp=x' } });
  const row = offer.checks.find((entry) => entry.id === 'nemirtingas');
  assert.equal(row.level, LEVEL.INFO);
  assert.deepEqual(row.actions, [ACTION.SET_EPIC_ARGS]);
  assert.notEqual(offer.reason, 'nemirtingas-setup', 'an offer never becomes the headline');

  const ok = deriveHealth({ ...base, nemirtingasEpic: { problem: '', hint: '', overlay: false } });
  assert.equal(ok.checks.find((entry) => entry.id === 'nemirtingas').level, LEVEL.OK);
  assert.equal(deriveHealth(base).checks.find((entry) => entry.id === 'nemirtingas'), undefined, 'no row without the emulator');
});
