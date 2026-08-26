'use strict';

// ensureEmulatorDlls(), the network half of the GBE Fork installer, isn't exercised here.

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const gbe = require(path.join(__dirname, '..', '..', 'app', 'parser', 'gbeInstaller.js'));

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-gbe-install-'));
try {
  const cacheTag = path.join(temp, 'cache', 'release-1.0');
  fs.mkdirSync(cacheTag, { recursive: true });
  fs.writeFileSync(path.join(cacheTag, 'steam_api64.dll'), 'GBE-x64');
  fs.writeFileSync(path.join(cacheTag, 'steam_api.dll'), 'GBE-x86');
  const dlls = { tag: 'release-1.0', dir: cacheTag, x64: path.join(cacheTag, 'steam_api64.dll'), x86: path.join(cacheTag, 'steam_api.dll') };

  const dir64 = path.join(temp, 'game64');
  const dir32 = path.join(temp, 'game32');
  const dirBoth = path.join(temp, 'gameBoth');
  const dirEmpty = path.join(temp, 'gameEmpty');
  for (const d of [dir64, dir32, dirBoth, dirEmpty]) fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(dir64, 'steam_api64.dll'), 'orig-x64');
  fs.writeFileSync(path.join(dir32, 'steam_api.dll'), 'orig-x86');
  fs.writeFileSync(path.join(dirBoth, 'steam_api64.dll'), 'orig-both-64');
  fs.writeFileSync(path.join(dirBoth, 'steam_api.dll'), 'orig-both-32');

  const res = gbe.installDlls({ dllDirs: [dir64, dir32, dirBoth, dirEmpty], dlls, writeIfMissing: 'x64' });

  assert.strictEqual(fs.readFileSync(path.join(dir64, 'steam_api64.dll'), 'utf8'), 'GBE-x64');
  assert.strictEqual(fs.readFileSync(path.join(dir64, 'steam_api64.dll.bak'), 'utf8'), 'orig-x64');
  assert.strictEqual(fs.readFileSync(path.join(dir32, 'steam_api.dll'), 'utf8'), 'GBE-x86');
  assert.strictEqual(fs.readFileSync(path.join(dir32, 'steam_api.dll.bak'), 'utf8'), 'orig-x86');
  assert.strictEqual(fs.readFileSync(path.join(dirBoth, 'steam_api64.dll'), 'utf8'), 'GBE-x64');
  assert.strictEqual(fs.readFileSync(path.join(dirBoth, 'steam_api.dll'), 'utf8'), 'GBE-x86');

  assert.strictEqual(fs.readFileSync(path.join(dirEmpty, 'steam_api64.dll'), 'utf8'), 'GBE-x64');
  assert.ok(!fs.existsSync(path.join(dirEmpty, 'steam_api.dll')), 'writeIfMissing should write one arch only');
  assert.ok(!fs.existsSync(path.join(dirEmpty, 'steam_api64.dll.bak')), 'a fresh write needs no backup');

  assert.strictEqual(res.installed, 5, 'should install x64+x86 in dirBoth and one each elsewhere');
  assert.strictEqual(res.backedUp, 4, 'should back up the 4 pre-existing DLLs');

  gbe.installDlls({ dllDirs: [dir64], dlls, writeIfMissing: 'x64' });
  assert.strictEqual(fs.readFileSync(path.join(dir64, 'steam_api64.dll.bak'), 'utf8'), 'orig-x64', '.bak must keep the genuine original');

  // Runtime repair can also add the arch the detected game exe needs when only the opposite DLL is
  // present (common after a manual file replacement or a wrong-arch setup).
  const dirWrongArch = path.join(temp, 'gameWrongArch');
  fs.mkdirSync(dirWrongArch, { recursive: true });
  fs.writeFileSync(path.join(dirWrongArch, 'steam_api.dll'), 'orig-x86-only');
  const archRes = gbe.installDlls({ dllDirs: [dirWrongArch], dlls, ensureArch: 'x64' });
  assert.strictEqual(fs.readFileSync(path.join(dirWrongArch, 'steam_api.dll'), 'utf8'), 'GBE-x86');
  assert.strictEqual(fs.readFileSync(path.join(dirWrongArch, 'steam_api.dll.bak'), 'utf8'), 'orig-x86-only');
  assert.strictEqual(fs.readFileSync(path.join(dirWrongArch, 'steam_api64.dll'), 'utf8'), 'GBE-x64');
  assert.ok(!fs.existsSync(path.join(dirWrongArch, 'steam_api64.dll.bak')), 'newly seeded required arch needs no backup');
  assert.strictEqual(archRes.installed, 2, 'ensureArch should replace present arch and seed the required arch');

  const gameDir = path.join(temp, 'It Takes Two');
  const exeDir = path.join(gameDir, 'Nuts', 'Binaries', 'Win64');
  const overlayDir = path.join(gameDir, '__overlay');
  fs.mkdirSync(exeDir, { recursive: true });
  fs.mkdirSync(overlayDir, { recursive: true });
  const runtimeDirs = gbe.runtimeDllDirs({
    gameDir,
    dllPaths: [path.join(exeDir, 'steam_api64.dll'), path.join(overlayDir, 'steam_api.dll')],
    exePath: path.join(exeDir, 'ItTakesTwo.exe'),
    fallbackDir: gameDir,
  });
  assert.deepStrictEqual(runtimeDirs, [exeDir], 'runtime selection should ignore auxiliary overlay DLL folders');

  console.log('PASS: GBE installer replaces both arches, preserves one-time .bak, and seeds missing exe arch');
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}

/*
  Steam emulators are flagged by most antivirus engines, so the package can be quarantined between
  being written to disk and being read back. node-7z reports the archive path as its error message
  and keeps 7za's own words in stderr, so what reached the user was a temp path and nothing else.
*/
{
  const source = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'parser', 'gbeInstaller.js'), 'utf8');
  assert.ok(/GBE_DOWNLOAD_BLOCKED/.test(source), 'the cause needs a code callers can branch on');
  assert.ok(/err && err\.stderr/.test(source), "7za's own words are the only place the cause appears");
  assert.ok(/quarantined by security software/.test(source), 'and the message has to say it in words');
  // The generic path must still surface untouched: not every extraction failure is an antivirus.
  assert.ok(/reject\(err\);/.test(source), 'any other failure is reported as itself');
  console.log('PASS: a package the antivirus quarantined says so, instead of naming a temp file');
}
