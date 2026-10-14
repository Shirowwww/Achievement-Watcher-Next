'use strict';

// RUNE's steamclient builds (Dragon's Dogma 2, 2026) keep Valve's steam_api dll, load the emulator
// from Steam\steamclient64.dll through a version.dll proxy and keep steam_emu.ini beside it. AW
// read that folder as an unconfigured GBE game: Game Health went red and a scan wrote a GBE setup
// nothing ever loads.

const path = require('path');
const fs = require('fs');
const os = require('os');
const crackLoaderDetect = require(path.join(__dirname, '..', '..', 'app', 'util', 'crackLoaderDetect.js'));
const emulatorFixEligibility = require(path.join(__dirname, '..', '..', 'app', 'util', 'emulatorFixEligibility.js'));
const gameHealth = require(path.join(__dirname, '..', '..', 'app', 'util', 'gameHealth.js'));
const goldberg = require(path.join(__dirname, '..', '..', 'app', 'parser', 'goldberg.js'));
const userDir = require(path.join(__dirname, '..', '..', 'app', 'parser', 'userDir.js'));

let passed = 0;
const failures = [];
function ok(cond, msg) {
  if (cond) passed++;
  else failures.push(msg);
}
function eq(actual, expected, msg) {
  ok(actual === expected, `${msg} - got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`);
}

const tmpDirs = [];
function tmp(prefix) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tmpDirs.push(d);
  return d;
}

function runeRelease({ withSteamclient = true } = {}) {
  const dir = tmp('aw-rune-steamclient-');
  fs.writeFileSync(path.join(dir, 'DD2.exe'), 'stub');
  fs.writeFileSync(path.join(dir, 'DD2.rne'), 'stub');
  fs.writeFileSync(path.join(dir, 'steam_api64.dll'), 'MZ valve steam api');
  fs.writeFileSync(path.join(dir, 'version.dll'), 'MZ proxy');
  const steam = path.join(dir, 'Steam');
  fs.mkdirSync(steam);
  fs.writeFileSync(path.join(steam, 'steam_emu.ini'), '[Settings]\nAppId=2054970\n');
  if (withSteamclient) fs.writeFileSync(path.join(steam, 'steamclient64.dll'), 'MZ rune emulator');
  return dir;
}

{
  const dir = runeRelease();
  const hit = crackLoaderDetect.detectWorkingCrackLoader(dir);
  ok(hit && /RUNE/.test(hit.name), 'RUNE is recognised from its Steam folder');
  eq(hit && hit.replaceable, false, 'its runtime is steamclient, so swapping steam_api for GBE is never offered');
  ok(hit && path.basename(hit.dir) === 'Steam', 'the loader is located in the Steam folder');
  // The runtime switch sidelines markers in the game and dll folders; the Steam folder keeps its ini.
  eq(crackLoaderDetect.disableLoaderMarkers([dir]).length, 0, 'its ini is never sidelined');
  ok(fs.existsSync(path.join(dir, 'Steam', 'steam_emu.ini')), 'steam_emu.ini stays in place');

  const inspected = emulatorFixEligibility.inspect({ gameDir: dir });
  eq(inspected.reason, 'existing-fix', 'the automatic fix leaves the release alone');

  const stalled = gameHealth.deriveHealth({
    gameDir: dir,
    gameDirExists: true,
    crackLoader: { name: hit.name, replaceable: hit.replaceable },
    playtime: { total: 2 * 60 * 60 },
    achievements: { total: 54, unlocked: 0 },
  });
  ok(!stalled.actions.includes(gameHealth.ACTION.SWITCH_RUNTIME), 'a quiet RUNE steamclient game is never offered a runtime switch');

  // The scan reads the loader's saves for this shape instead of seeding a GSE save nothing writes.
  ok(/RUNE/.test(goldberg.detectEmulator(dir).loader || ''), 'the scan carries the loader name for Valve\'s dll + RUNE');
  const source = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'parser', 'achievements.js'), 'utf8');
  ok(source.includes("(g.emulator === 'none' || g.loader) && g.gameDir"), 'the goldberg scan looks up scene saves for a loader-served folder');

  // Issue #123: before the first save, the card points at where this build writes, not at GSE Saves.
  const savedPublic = process.env.PUBLIC;
  const fakePublic = tmp('aw-rune-public-');
  process.env.PUBLIC = fakePublic;
  try {
    const pending = userDir.sceneSaveFallback(hit.dir, '2054970');
    eq(pending && pending.path, path.join(fakePublic, 'Documents', 'Steam', 'RUNE', '2054970'), 'an unlaunched RUNE steamclient game points at Public Documents');
    eq(pending && pending.source, 'Rune', 'and is labelled RUNE');
  } finally {
    if (savedPublic === undefined) delete process.env.PUBLIC;
    else process.env.PUBLIC = savedPublic;
  }
}

{
  const dir = runeRelease({ withSteamclient: false });
  fs.rmSync(path.join(dir, 'DD2.rne'));
  eq(crackLoaderDetect.detectWorkingCrackLoader(dir), null, 'a stray ini in a Steam folder with no emulator is not a loader');
}

for (const d of tmpDirs) {
  try {
    fs.rmSync(d, { recursive: true, force: true });
  } catch {
    /* best-effort cleanup */
  }
}
if (failures.length) {
  console.error(`FAIL: ${failures.length} assertion(s) failed (of ${passed + failures.length}):`);
  for (const f of failures) console.error('  ✗ ' + f);
  process.exit(1);
}
console.log(`PASS: runeSteamclientLayout - ${passed} assertions`);
