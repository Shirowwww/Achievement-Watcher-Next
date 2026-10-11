'use strict';

// The Linux AppImage: its electron-builder target, what afterPack keeps in it, and the update path
// that trusts latest-linux.yml instead of an Authenticode signature.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { DebugLogger, log } = require('../../app/node_modules/builder-util');
const { getConfig, validateConfiguration } = require('../../app/node_modules/app-builder-lib/out/util/config/config');

// getConfig writes to stdout, the test runner's channel (see portableBuild.test.js).
log.stream = { write() {} };
const { pruneForLinux } = require('../../app/build/afterPack.js');

const root = path.join(__dirname, '..', '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

test('the Linux target is an AppImage published to the same release feed as Windows', async () => {
  const appDir = path.join(root, 'app');
  const config = await getConfig(appDir, 'electron-builder.yml', {});
  await validateConfiguration(config, new DebugLogger());

  assert.equal(config.linux.target, 'AppImage');
  // The site's download instructions name this file.
  assert.equal(config.linux.artifactName, 'Achievement.Watcher.${version}.${ext}');
  assert.equal(config.linux.executableName, 'achievement-watcher');
  assert.equal(config.linux.publish, undefined, 'Linux inherits the one publish feed');
  // Otherwise the NSIS license page becomes an "Agree" dialog in front of every first start.
  assert.equal(config.appImage.license, null);
  assert.deepEqual(config.publish, { provider: 'github', owner: 'Shirowwww', repo: 'Achievement-Watcher-Next' });
  // Windows keeps its installer name: latest.yml and every existing install depend on it.
  assert.equal(config.win.artifactName, 'Achievement.Watcher.Setup.${version}.${ext}');
  assert.equal(config.executableName, 'Achievement Watcher');

  const build = read('app', 'build', 'build-linux.js');
  assert.match(build, /`Achievement\.Watcher\.\$\{version\}\.AppImage`/);
  assert.match(build, /latest-linux\.yml/);
  assert.match(read('watchdog', 'watchdog.js'), /'achievement-watcher'/, 'the Watchdog fallback spawn names the Linux executable');
});

test('afterPack strips Windows helpers from the Linux package and keeps what loads there', (t) => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-linux-pack-'));
  t.after(() => fs.rmSync(out, { recursive: true, force: true }));
  const put = (rel) => {
    const file = path.join(out, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, 'x', { mode: 0o644 });
    return file;
  };
  const modules = path.join(out, 'watchdog', 'node_modules');
  const sevenZip = 'resources/app.asar.unpacked/node_modules/7zip-bin';
  const gone = [
    put('watchdog/native/aw-next-clip.exe'),
    put('watchdog/node_modules/regodit/dist/regodit.x64.dll'),
    put(`${sevenZip}/mac/x64/7za`),
    put(`${sevenZip}/linux/arm64/7za`),
    put('watchdog/node_modules/some-lib/README.md'),
  ];
  const kept = [
    put('watchdog/node_modules/koffi/src/koffi/index.cjs'),
    put('watchdog/node_modules/@koromix/koffi-linux-x64/linux_x64/koffi.node'),
    put('watchdog/node_modules/some-lib/LICENSE.md'),
    put(`${sevenZip}/linux/x64/7za`),
  ];

  pruneForLinux(out, modules);

  for (const file of gone) assert.equal(fs.existsSync(file), false, `${file} should be pruned`);
  for (const file of kept) assert.equal(fs.existsSync(file), true, `${file} should stay`);
  if (process.platform !== 'win32') assert.equal(fs.statSync(kept[3]).mode & 0o777, 0o755);
});

test('afterPack refuses a Linux package without the koffi binary the Watchdog loads', (t) => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-linux-pack-'));
  t.after(() => fs.rmSync(out, { recursive: true, force: true }));
  fs.mkdirSync(path.join(out, 'watchdog', 'node_modules'), { recursive: true });
  assert.throws(() => pruneForLinux(out, path.join(out, 'watchdog', 'node_modules')), /koffi-linux-x64/);
});

test('only the Windows installer goes through the Authenticode check', () => {
  const init = read('app', 'electron', 'init.js');
  assert.match(init, /const updateIsSignedInstaller = process\.platform === 'win32' && !isPortableBuild;/);
  const downloaded = init.slice(init.indexOf("autoUpdater.on('update-downloaded'"));
  assert.match(downloaded.slice(0, 400), /if \(updateIsSignedInstaller\) \{\s*\/\/[^\n]*\n\s*const checked = await checkPendingInstaller/);
  const install = init.slice(init.indexOf('async function startUpdateInstall('));
  assert.match(install, /if \(updateIsSignedInstaller\) \{\s*\/\/[^\n]*\n\s*const held = verifiedInstaller/);
});
