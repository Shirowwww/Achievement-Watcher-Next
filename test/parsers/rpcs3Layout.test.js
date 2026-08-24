'use strict';

/*
  RPCS3 lets the virtual PS3 disk live anywhere. Every case below is a supported emulator setting,
  not a workaround: before this, all of them read as "this folder has no trophies".
*/

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const layout = require('../../app/parser/rpcs3Layout.js');
const rpcs3 = require('../../app/parser/rpcs3.js');

function tmpdir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function makeTrophies(devHdd0, user, games) {
  for (const game of games) fs.mkdirSync(path.join(devHdd0, 'home', user, 'trophy', game), { recursive: true });
}

test('the default layout is used when nothing relocates it', () => {
  const emulator = tmpdir('aw-rpcs3-default-');
  makeTrophies(path.join(emulator, 'dev_hdd0'), '00000001', ['NPWR12345_00']);

  assert.equal(layout.resolveConfigRoot(emulator, { env: {} }), emulator);
  assert.equal(layout.resolveDevHdd0Root(emulator, { env: {} }), path.join(emulator, 'dev_hdd0'));
  assert.deepEqual(layout.trophyRoots(emulator, { env: {} }).map((root) => root.user), ['00000001']);
});

test('portable mode moves the configuration root, and with it the default virtual disk', () => {
  const emulator = tmpdir('aw-rpcs3-portable-');
  const portable = path.join(emulator, 'portable');
  makeTrophies(path.join(portable, 'dev_hdd0'), '00000002', ['NPWR00001_00']);
  // The non-portable location exists too: portable mode must win, exactly as it does in RPCS3.
  fs.mkdirSync(path.join(emulator, 'dev_hdd0', 'home', '00000001', 'trophy'), { recursive: true });

  assert.equal(layout.resolveConfigRoot(emulator, { env: {} }), portable);
  assert.deepEqual(layout.trophyRoots(emulator, { env: {} }).map((root) => root.user), ['00000002']);
});

test('RPCS3_CONFIG_DIR overrides the emulator folder entirely', () => {
  const emulator = tmpdir('aw-rpcs3-env-emulator-');
  const config = tmpdir('aw-rpcs3-env-config-');
  makeTrophies(path.join(config, 'dev_hdd0'), '00000001', ['NPWR55555_00']);

  const env = { RPCS3_CONFIG_DIR: config };
  assert.equal(layout.resolveConfigRoot(emulator, { env }), config);
  assert.deepEqual(layout.trophyRoots(emulator, { env }).map((root) => root.path), [
    path.join(config, 'dev_hdd0', 'home', '00000001', 'trophy'),
  ]);
});

test('vfs.yml relocates dev_hdd0 to another drive or folder', () => {
  const emulator = tmpdir('aw-rpcs3-vfs-');
  const disk = tmpdir('aw-rpcs3-disk-');
  fs.mkdirSync(path.join(emulator, 'config'), { recursive: true });
  fs.writeFileSync(
    path.join(emulator, 'config', 'vfs.yml'),
    ['$(EmulatorDir): ""', `/dev_hdd0/: ${disk}/`, '/dev_flash/: ""', 'Devices:', `  /dev_bdvd/: ""`].join('\n'),
    'utf8'
  );
  makeTrophies(disk, '00000001', ['NPWR99999_00']);

  assert.equal(layout.resolveDevHdd0Root(emulator, { env: {} }), path.resolve(disk));
  assert.deepEqual(layout.trophyRoots(emulator, { env: {} }).map((root) => root.path), [
    path.join(path.resolve(disk), 'home', '00000001', 'trophy'),
  ]);
});

test('a $(EmulatorDir)-relative mapping follows a redefined $(EmulatorDir)', () => {
  const base = tmpdir('aw-rpcs3-emudir-');
  const emulator = path.join(base, 'emulator');
  const elsewhere = path.join(base, 'elsewhere');
  fs.mkdirSync(emulator, { recursive: true });
  fs.mkdirSync(elsewhere, { recursive: true });
  fs.writeFileSync(
    path.join(emulator, 'vfs.yml'),
    [`$(EmulatorDir): ${elsewhere}/`, '/dev_hdd0/: $(EmulatorDir)ps3disk/'].join('\n'),
    'utf8'
  );

  assert.equal(layout.resolveDevHdd0Root(emulator, { env: {} }), path.join(path.resolve(elsewhere), 'ps3disk'));
});

test('config/vfs.yml wins over a stale vfs.yml beside the executable', () => {
  const emulator = tmpdir('aw-rpcs3-vfs-precedence-');
  fs.mkdirSync(path.join(emulator, 'config'), { recursive: true });
  fs.writeFileSync(path.join(emulator, 'config', 'vfs.yml'), '/dev_hdd0/: $(EmulatorDir)current/', 'utf8');
  fs.writeFileSync(path.join(emulator, 'vfs.yml'), '/dev_hdd0/: $(EmulatorDir)stale/', 'utf8');

  assert.equal(layout.resolveDevHdd0Root(emulator, { env: {} }), path.join(emulator, 'current'));
});

test('comments, quoting and a !!str tag are all read the way RPCS3 writes them', () => {
  const map = layout.parseVfsMap(
    ['# a comment line', '/dev_hdd0/: !!str "D:/PS3/dev_hdd0/" # trailing note', "$(EmulatorDir): 'E:/RPCS3/'", '  /dev_bdvd/: ignored'].join('\n')
  );
  assert.equal(map.get('/dev_hdd0/'), 'D:/PS3/dev_hdd0/');
  assert.equal(map.get('$(EmulatorDir)'), 'E:/RPCS3/');
  assert.equal(map.has('/dev_bdvd/'), false, 'the indented Devices section maps discs, not the internal drives');
});

test('a vfs.yml that declares no dev_hdd0 mapping is honoured as "no mapping", not ignored', () => {
  const emulator = tmpdir('aw-rpcs3-vfs-empty-');
  fs.mkdirSync(path.join(emulator, 'config'), { recursive: true });
  fs.writeFileSync(path.join(emulator, 'config', 'vfs.yml'), '/dev_flash/: ""', 'utf8');

  assert.equal(layout.readVfsDevHdd0Root(emulator), '');
  assert.equal(layout.resolveDevHdd0Root(emulator, { env: {} }), path.join(emulator, 'dev_hdd0'));
});

test('the RPCS3 scan reads a relocated disk and refuses folders that are neither', async () => {
  const emulator = tmpdir('aw-rpcs3-scan-');
  const disk = tmpdir('aw-rpcs3-scan-disk-');
  fs.writeFileSync(path.join(emulator, 'rpcs3.exe'), '', 'utf8');
  fs.mkdirSync(path.join(emulator, 'config'), { recursive: true });
  fs.writeFileSync(path.join(emulator, 'config', 'vfs.yml'), `/dev_hdd0/: ${disk}/`, 'utf8');
  makeTrophies(disk, '00000001', ['NPWR11111_00', 'NPWR22222_00']);

  const found = await rpcs3.scan(emulator);
  assert.deepEqual(
    found.map((entry) => entry.appid).sort(),
    ['NPWR11111_00', 'NPWR22222_00']
  );
  assert.equal(found[0].source, 'RPCS3 Emulator');
  assert.equal(found[0].data.type, 'rpcs3');

  // The virtual disk added directly, with no emulator binary anywhere near it.
  const fromDisk = await rpcs3.scan(disk);
  assert.equal(fromDisk.length, 2);

  assert.deepEqual(await rpcs3.scan(tmpdir('aw-rpcs3-unrelated-')), []);
});
