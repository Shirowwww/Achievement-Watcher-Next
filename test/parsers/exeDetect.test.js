'use strict';

// Standalone validation of exeDetect against the real C:\Jeux install.
// Run: node test/parsers/exeDetect.test.js

const path = require('path');
const fs = require('fs');
const goldberg = require(path.join(__dirname, '..', '..', 'app', 'parser', 'goldberg.js'));
const exeDetect = require(path.join(__dirname, '..', '..', 'app', 'parser', 'exeDetect.js'));

const ROOT = process.argv[2] || 'C:\\Jeux';

// This is a standalone validation against a real game-install library. When that
// library isn't present (e.g. a clean CI runner), skip cleanly instead of failing.
if (!fs.existsSync(ROOT)) {
  console.log(`exeDetect.test.js: ${ROOT} not present - skipping standalone validation.`);
  process.exit(0);
}

const found = goldberg.findCompatibleGames([ROOT]);
console.log(`Found ${found.length} install(s) under ${ROOT}\n`);

const taken = new Set();
const rows = [];
for (const g of found) {
  const name = path.basename(g.gameDir);
  const emu = goldberg.detectEmulator(g.gameDir);
  const res = exeDetect.detect(g.gameDir, name, { dllPaths: emu.dll, taken });
  if (res) taken.add(res.full);
  rows.push({ appid: g.appid, name, exe: res ? res.name : '(none)', score: res ? res.score.toFixed(1) : '-', full: res ? res.full : '' });
}

for (const r of rows) {
  console.log(`${(r.appid || '?').padEnd(10)} ${r.name.padEnd(38)} -> ${String(r.exe).padEnd(34)} score=${r.score}`);
}

// Assertions
let fail = 0;
const exes = rows.map((r) => r.full).filter(Boolean);
const dupes = exes.filter((e, i) => exes.indexOf(e) !== i);
if (dupes.length) {
  console.log(`\nFAIL: collisions detected -> ${[...new Set(dupes)].join(', ')}`);
  fail++;
}
for (const r of rows) {
  if (/loader|selector|rapidcrc|redist|setup|unins/i.test(r.exe)) {
    console.log(`\nFAIL: parasite exe picked for ${r.name}: ${r.exe}`);
    fail++;
  }
}
console.log(fail === 0 ? '\nPASS: no collisions, no parasite exes.' : `\n${fail} failure(s).`);

// Collision tie-break: who keeps 007FirstLight.exe when several appids claim it?
const simFor007 = exeDetect.nameSimilarity('007 First Light', '007FirstLight');
const simForForza = exeDetect.nameSimilarity('Forza Horizon 6', '007FirstLight');
console.log(`\nTie-break for 007FirstLight.exe: 007=${simFor007.toFixed(2)} forza=${simForForza.toFixed(2)}`);
if (!(simFor007 > simForForza)) {
  console.log('FAIL: collision tie-break would keep the wrong game.');
  fail++;
}

// Anti-collision: if forzahorizon6.exe is already taken, Forza must not return it again.
const forza = found.find((g) => /forza/i.test(g.gameDir));
if (forza) {
  const emu = goldberg.detectEmulator(forza.gameDir);
  const first = exeDetect.detect(forza.gameDir, 'Forza Horizon 6', { dllPaths: emu.dll });
  const again = exeDetect.detect(forza.gameDir, 'Forza Horizon 6', {
    dllPaths: emu.dll,
    taken: new Set([first.full]),
  });
  const ok = !again || again.full.toLowerCase() !== first.full.toLowerCase();
  console.log(`Anti-collision: first=${first.name} taken-again=${again ? again.name : '(none)'} -> ${ok ? 'OK' : 'FAIL'}`);
  if (!ok) fail++;
}

// Name-based fallback for non-emulator installs excludes folders findCompatibleGames already
// claimed by appid, so a similarly-named game can't steal them (the Forza 5 -> Forza 6 bug).
const claimed = new Set(found.map((g) => g.gameDir.toLowerCase()));
const folders = fs
  .readdirSync(ROOT, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => ({ dir: path.join(ROOT, e.name), name: e.name }))
  .filter((f) => !claimed.has(f.dir.toLowerCase()));

// Games with steam markers (Liar's Bar, DELTARUNE, Fast Food Simulator) are already claimed by
// findCompatibleGames and excluded here; only true GOG/standalone installs rely on this name pool.
const nameCases = [{ game: 'LEGO Batman - Legacy of the Dark Knight', expectExe: /legobatman/i }];
console.log('\nName-based folder resolution (claimed folders excluded):');
for (const c of nameCases) {
  const onDisk = fs.existsSync(path.join(ROOT, c.game));
  const isClaimed = claimed.has(path.join(ROOT, c.game).toLowerCase());
  // Not installed, or already claimed via steam markers: SKIP, not FAIL.
  if (!onDisk) {
    console.log(`  ${c.game.padEnd(42)} -> not installed -> SKIP`);
    continue;
  }
  if (isClaimed) {
    console.log(`  ${c.game.padEnd(42)} -> claimed by appid (steam markers) -> SKIP (name fallback N/A)`);
    continue;
  }
  const dir = exeDetect.bestFolderMatch(c.game, folders);
  let exe = null;
  if (dir) {
    const res = exeDetect.detect(dir, c.game, {});
    exe = res ? res.name : null;
  }
  const ok = dir && exe && c.expectExe.test(exe);
  console.log(`  ${c.game.padEnd(42)} -> ${dir ? path.basename(dir) : '(no folder)'} / ${exe || '(no exe)'} ${ok ? 'OK' : 'FAIL'}`);
  if (!ok) fail++;
}

// --- Games identified by a root steam_appid.txt (no steam_settings) are now found by appid ---
for (const want of [
  { appid: '1671210', exe: /deltarune/i },
  { appid: '480', exe: /liar/i },
]) {
  const r = rows.find((x) => String(x.appid) === want.appid);
  if (!r) {
    console.log(`appid ${want.appid} not installed in ${ROOT} -> SKIP`);
    continue;
  }
  const ok = r && want.exe.test(r.exe);
  console.log(`appid ${want.appid} found via steam_appid.txt -> ${r.exe} ${ok ? 'OK' : 'FAIL'}`);
  if (!ok) fail++;
}

// Forza 5 must not grab the claimed Forza 6 folder.
const f5 = exeDetect.bestFolderMatch('Forza Horizon 5', folders);
const f5ok = !f5 || !/forza horizon 6/i.test(path.basename(f5));
console.log(`Forza 5 does not steal Forza 6 folder -> ${f5 ? path.basename(f5) : '(none)'} ${f5ok ? 'OK' : 'FAIL'}`);
if (!f5ok) fail++;

const bogus = exeDetect.bestFolderMatch('Totally Unrelated Game 9000', folders);
console.log(`No-false-match for bogus name -> ${bogus || '(none)'} ${bogus ? 'FAIL' : 'OK'}`);
if (bogus) fail++;

for (const name of ['firefox.exe', 'chrome.exe', 'msedge.exe', 'notepad.exe', 'winword.exe', 'Docker Desktop.exe', 'Cheat Engine.exe', 'epicgameslauncher.exe', 'R.exe', 'streaming_client.exe', 'DiskSpd64.exe', 'dolphin.exe']) {
  const ok = exeDetect.isKnownNonGameExe(name);
  console.log(`known non-game exe ${name} -> ${ok ? 'OK' : 'FAIL'}`);
  if (!ok) fail++;
}
for (const name of ['Game.exe', 'ACBlackFlag.exe', 'portal2.exe']) {
  const ok = !exeDetect.isKnownNonGameExe(name);
  console.log(`real game exe ${name} not blocked -> ${ok ? 'OK' : 'FAIL'}`);
  if (!ok) fail++;
}

console.log(fail === 0 ? '\nALL CHECKS PASS.' : `\n${fail} failure(s).`);
process.exit(fail === 0 ? 0 : 1);
