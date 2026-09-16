'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const eligibility = require('../../app/util/emulatorFixEligibility.js');

const roots = [];
function gameDir(name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `aw-fix-eligibility-${name}-`));
  roots.push(dir);
  fs.writeFileSync(path.join(dir, 'game.exe'), 'stub');
  fs.writeFileSync(path.join(dir, 'steam_api64.dll'), 'stub');
  fs.writeFileSync(path.join(dir, 'steam_appid.txt'), '1234');
  return dir;
}

test.after(() => {
  for (const dir of roots) fs.rmSync(dir, { recursive: true, force: true });
});

test('a bare Steam API install with only an AppID is eligible for its initial GBE config', () => {
  assert.deepEqual(eligibility.inspect({ gameDir: gameDir('bare') }), { eligible: true, reason: 'unconfigured' });
});

test('existing emulator fixes are protected, including nested runtime folders', () => {
  const cases = [
    ['onlinefix', 'OnlineFix64.dll'],
    ['tenoke', 'tenoke.ini'],
    ['ali213', 'ALI213.ini'],
    ['scene', 'steam_emu.ini'],
    ['smartsteamemu', 'SmartSteamEmu.ini'],
  ];
  for (const [name, marker] of cases) {
    const dir = gameDir(name);
    const runtime = path.join(dir, 'Engine', 'Binaries', 'Win64');
    fs.mkdirSync(runtime, { recursive: true });
    fs.writeFileSync(path.join(runtime, marker), 'stub');
    const result = eligibility.inspect({ gameDir: dir });
    assert.equal(result.eligible, false, `${name} must not be replaced by an initial GBE config`);
    assert.equal(result.reason, 'existing-fix');
  }
});

test('an existing GBE/Goldberg steam_settings folder is a repair target, not an initial config target', () => {
  const dir = gameDir('gbe');
  fs.mkdirSync(path.join(dir, 'Binaries', 'steam_settings'), { recursive: true });
  const result = eligibility.inspect({ gameDir: dir });
  assert.equal(result.eligible, false);
  assert.equal(result.existingFix.name, 'GBE / Goldberg');
});

test('official launchers, Ubisoft, consoles and manual entries are excluded before disk mutation', () => {
  const epic = gameDir('epic');
  fs.mkdirSync(path.join(epic, '.egstore'));
  assert.equal(eligibility.inspect({ gameDir: epic }).reason, 'official-launcher');

  const uplay = gameDir('uplay');
  fs.writeFileSync(path.join(uplay, 'uplay_r2_loader64.dll'), 'stub');
  assert.equal(eligibility.inspect({ gameDir: uplay }).reason, 'uplay-r2');

  assert.equal(eligibility.inspect({ gameDir: gameDir('xbox'), system: 'xbox' }).reason, 'unsupported-platform');
  assert.equal(eligibility.inspect({ gameDir: gameDir('manual'), source: 'Manual', manual: true }).reason, 'unsupported-source');
  assert.equal(eligibility.inspect({ gameDir: gameDir('manual-source-only'), source: 'Manual' }).reason, 'unsupported-source');
});

test('a single manual PC entry can opt in without bypassing existing-fix guards', () => {
  const bare = gameDir('manual-opt-in');
  assert.deepEqual(eligibility.inspect({ gameDir: bare, source: 'Manual', manual: true, allowManual: true }), {
    eligible: true,
    reason: 'unconfigured',
  });

  const protectedDir = gameDir('manual-protected');
  fs.writeFileSync(path.join(protectedDir, 'OnlineFix64.dll'), 'stub');
  const protectedResult = eligibility.inspect({
    gameDir: protectedDir,
    source: 'Manual',
    manual: true,
    allowManual: true,
  });
  assert.equal(protectedResult.eligible, false);
  assert.equal(protectedResult.reason, 'existing-fix');
});

test('a manual program without a Steam API DLL never receives a GBE install action', () => {
  const dir = gameDir('manual-non-steam');
  fs.rmSync(path.join(dir, 'steam_api64.dll'));
  assert.equal(eligibility.hasSteamApiDll(dir), false);
  const result = eligibility.inspect({ gameDir: dir, source: 'Manual', manual: true, allowManual: true });
  assert.equal(result.eligible, false);
  assert.equal(result.reason, 'no-steam-api');
});

test('a game Steam publishes no achievements for is never offered a setup', () => {
  // The Sims 4: the fix was applied, wrote a full GBE runtime, and produced an achievements.json of
  // "[]". Nothing a setup can do records an unlock that does not exist.
  const dir = gameDir('no-achievements');
  const result = eligibility.inspect({ gameDir: dir, noAchievements: true });
  assert.equal(result.eligible, false);
  assert.equal(result.reason, 'no-achievements');
  // Same folder, no verdict: the ordinary answer is unchanged.
  assert.equal(eligibility.inspect({ gameDir: dir }).eligible, true);
});

test('an anadius EA crack is left alone like any other loader', () => {
  // Its unlocks go to %LOCALAPPDATA%\anadius\LSX emu, which the watchdog already watches. There is
  // no steam_api dll to swap, so a GBE install here is litter and nothing else.
  const dir = gameDir('anadius');
  const bin = path.join(dir, 'Game', 'Bin');
  fs.mkdirSync(bin, { recursive: true });
  fs.writeFileSync(path.join(bin, 'anadius.cfg'), 'stub');
  const result = eligibility.inspect({ gameDir: dir });
  assert.equal(result.eligible, false);
  assert.equal(result.reason, 'existing-fix');
  assert.equal(result.existingFix.name, 'anadius (EA)');
});

test('an ambiguous executable is not a folder to write dlls into', () => {
  // With no steam_api dll anywhere, the detected exe is the only thing deciding where the runtime
  // lands. An updater sitting at a folder root scored highest on The Sims 4 and took the install.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-fix-eligibility-ambiguous-'));
  roots.push(dir);
  for (const name of ['launcher.exe', 'updater.exe', 'unins000.exe', 'setup.exe']) {
    fs.writeFileSync(path.join(dir, name), 'stub');
  }
  const result = eligibility.inspect({ gameDir: dir, gameName: 'The Sims 4' });
  assert.equal(result.eligible, false);
  assert.equal(result.reason, 'no-executable');
});
