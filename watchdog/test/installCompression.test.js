'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { compressInstallation, sizeOnDisk } = require('../util/installCompression.js');

// WOF compression is a Windows file system control reached through koffi and kernel32.
const WINDOWS_ONLY = process.platform !== 'win32' && 'Windows-only';

// Compressible content well past one cluster: text, like most of an installation's bytes.
const text = Buffer.from('Achievement Watcher Next '.repeat(8192));

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return file;
}

// An installation laid out like electron-builder's, plus a portable copy's live data folder.
function fakeInstall(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-install-wof-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return {
    dir,
    exe: write(path.join(dir, 'Achievement Watcher.exe'), text),
    asar: write(path.join(dir, 'resources', 'app.asar'), text),
    watchdog: write(path.join(dir, 'watchdog', 'node_modules', 'pkg', 'index.js'), text),
    data: write(path.join(dir, 'data', 'cfg', 'options.ini'), text),
  };
}

test('the installed files are compressed on disk and still read back byte for byte', { skip: WINDOWS_ONLY }, async (t) => {
  const install = fakeInstall(t);

  const result = await compressInstallation({ installDir: install.dir });

  if (result.files === 0) {
    t.skip('this volume has no WOF compression');
    return;
  }
  assert.equal(result.files, 3);
  for (const file of [install.exe, install.asar, install.watchdog]) {
    assert.ok(sizeOnDisk(file) < text.length, `${path.basename(file)} should take less room on disk`);
    assert.ok(fs.readFileSync(file).equals(text), `${path.basename(file)} must read back unchanged`);
  }
  // A portable copy writes its profile there all the time: it is not part of the installation.
  assert.equal(sizeOnDisk(install.data), fs.statSync(install.data).size);
});

test('a later start only compresses what an update put back', { skip: WINDOWS_ONLY }, async (t) => {
  const install = fakeInstall(t);
  const first = await compressInstallation({ installDir: install.dir });
  if (first.files === 0) {
    t.skip('this volume has no WOF compression');
    return;
  }

  assert.deepEqual(await compressInstallation({ installDir: install.dir }), { files: 0, failed: 0, before: 0, after: 0 });

  // An update writes a new, uncompressed app.asar.
  write(install.asar, Buffer.concat([text, Buffer.from('3.11.4')]));
  assert.equal((await compressInstallation({ installDir: install.dir })).files, 1);
});

// The Watchdog runs under Electron, whose fs reads a real archive as a folder: the first live run
// walked into app.asar and never compressed it. Only Electron itself can show that.
test('under Electron, app.asar is compressed as the file it is', async (t) => {
  const electron = path.join(__dirname, '..', '..', 'app', 'node_modules', 'electron', 'dist', 'electron.exe');
  const asar = path.join(__dirname, '..', '..', 'app', 'node_modules', '@electron', 'asar');
  if (!fs.existsSync(electron) || !fs.existsSync(asar)) {
    t.skip('no Electron binary in this checkout (CI installs without it)');
    return;
  }
  const install = fakeInstall(t);
  const source = path.join(install.dir, 'asar-source');
  write(path.join(source, 'package.json'), text);
  fs.rmSync(install.asar);
  await require(asar).createPackage(source, install.asar);
  fs.rmSync(source, { recursive: true });

  const out = path.join(install.dir, 'result.json');
  const script = [
    `const { compressInstallation } = require(${JSON.stringify(require.resolve('../util/installCompression.js'))});`,
    `compressInstallation({ installDir: ${JSON.stringify(install.dir)} })`,
    `  .then((r) => require('original-fs').writeFileSync(${JSON.stringify(out)}, JSON.stringify(r)));`,
  ].join('\n');
  const run = require('child_process').spawnSync(electron, ['-e', script], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, timeout: 60000 });
  assert.equal(run.status, 0, String(run.stderr));

  const result = JSON.parse(fs.readFileSync(out, 'utf8'));
  if (result.files === 0) {
    t.skip('this volume has no WOF compression');
    return;
  }
  assert.ok(sizeOnDisk(install.asar) < fs.statSync(install.asar).size, 'app.asar itself is compressed');
});

test('a folder without app.asar beside the executable is a development run and is left alone', { skip: WINDOWS_ONLY }, async (t) => {
  const install = fakeInstall(t);
  fs.rmSync(install.asar);

  assert.equal(await compressInstallation({ installDir: install.dir }), null);
  assert.equal(sizeOnDisk(install.exe), text.length);
});
