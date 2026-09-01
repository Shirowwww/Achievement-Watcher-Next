'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const yaml = require('../../app/node_modules/js-yaml');
const { DebugLogger } = require('../../app/node_modules/builder-util');
const { getConfig, validateConfiguration } = require('../../app/node_modules/app-builder-lib/out/util/config/config');
const { PORTABLE_MARKER, PORTABLE_DATA_DIR, portableUserDataDir } = require('../../app/util/portableMode.js');

const root = path.join(__dirname, '..', '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

test('a packaged copy opts into a profile beside the executable only with the build marker', (t) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-portable-'));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const exe = path.join(temp, 'Achievement Watcher.exe');

  assert.equal(portableUserDataDir({ execPath: exe, isPackaged: true }), '');
  fs.writeFileSync(path.join(temp, PORTABLE_MARKER), '{"portable":false}\n');
  assert.equal(portableUserDataDir({ execPath: exe, isPackaged: true }), '');
  fs.writeFileSync(path.join(temp, PORTABLE_MARKER), '{"portable":true}\n');
  assert.equal(portableUserDataDir({ execPath: exe, isPackaged: false }), '', 'development runs ignore build artifacts');
  assert.equal(portableUserDataDir({ execPath: exe, isPackaged: true }), path.join(temp, PORTABLE_DATA_DIR));
});

test('the portable package is a ZIP with its own artifact name and marker pass', () => {
  const config = yaml.load(read('app', 'electron-builder-portable.yml'));
  assert.equal(config.extends, './electron-builder.yml');
  assert.equal(config.win.target, 'zip');
  assert.equal(config.win.artifactName, 'Achievement.Watcher.Portable.${version}.${ext}');

  const build = read('app', 'build', 'build.js');
  assert.ok(build.indexOf('runBuilder("electron-builder.yml"') < build.indexOf('runBuilder("electron-builder-portable.yml"'));
  assert.match(build, /AW_BUILD_PORTABLE: "1"/);
  assert.match(build, /verifyPortableArtifact\(version\)/);

  const afterPack = read('app', 'build', 'afterPack.js');
  assert.match(afterPack, /process\.env\.AW_BUILD_PORTABLE === '1'/);
  assert.match(afterPack, /path\.join\(appOutDir, PORTABLE_MARKER\)/);
});

test('electron-builder accepts the installed and inherited portable configurations', async () => {
  const appDir = path.join(root, 'app');
  const installed = await getConfig(appDir, 'electron-builder.yml', {});
  const portable = await getConfig(appDir, 'electron-builder-portable.yml', {});
  await validateConfiguration(installed, new DebugLogger());
  await validateConfiguration(portable, new DebugLogger());

  assert.equal(installed.win.target, 'nsis');
  assert.equal(portable.win.target, 'zip');
  assert.equal(portable.executableName, installed.executableName);
  assert.deepEqual(portable.files, installed.files);
});

test('portable data wins over roaming data but an explicit command-line profile wins over both', () => {
  const init = read('app', 'electron', 'init.js');
  assert.match(init, /cliUserDataDir \|\| packagedPortableUserDataDir \|\| path\.join\(app\.getPath\('appData'\), APP_DATA_DIR_NAME\)/);
  assert.match(init, /const isPortableBuild = !!packagedPortableUserDataDir/);
  assert.match(init, /if \(!isPortableBuild\) \{\s*migrateAw3UserData/);
  assert.match(init, /isPortableBuild \? 'portable' : 'packaged'/);
});
