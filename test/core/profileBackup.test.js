'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const { test } = require('node:test');
const { pathToFileURL } = require('node:url');

const appUtil = path.join(__dirname, '..', '..', 'app', 'util');
const inventory = require(path.join(appUtil, 'profileInventory.js'));
const archive = require(path.join(appUtil, 'profileArchive.js'));
const { exportProfile, scrubOptionsIni } = require(path.join(appUtil, 'profileBackup.js'));
const restore = require(path.join(appUtil, 'profileRestore.js'));
const rebase = require(path.join(appUtil, 'profileRebase.js'));

const SECRET_TEXT = 'SECRET-MARKER-9f3a';

function temp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'aw-profile-backup-'));
}
function put(root, rel, content) {
  const file = path.join(root, ...rel.split('/'));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}
function read(root, rel) {
  return fs.readFileSync(path.join(root, ...rel.split('/')), 'utf8');
}
function tree(root, base = root, out = []) {
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) tree(full, base, out);
    else out.push(path.relative(base, full).split(path.sep).join('/'));
  }
  return out.sort();
}
function fakeRegistry(rows = []) {
  const state = { rows, merged: null };
  return { state, readPlaytime: () => state.rows, mergePlaytime: (r) => (state.merged = r) };
}

function fakeProfile(root, { home }) {
  put(root, 'cfg/options.ini', `[general]\ntheme=default\n[souvenir]\ndir=${home}\\Pictures\\Shots\n[emulator]\nloginPassword=${SECRET_TEXT}\nlogin=steam\n`);
  put(root, 'cfg/covers.db', JSON.stringify({ 10: pathToFileURL(path.join(root, 'covers', '10.png')).href, 11: 'https://cdn.example/x.png' }));
  put(root, 'cfg/librarydirs.db', JSON.stringify([{ path: `${home}\\Games`, origin: 'manual', enabled: true }, { path: 'D:\\Games', origin: 'manual', enabled: true }]));
  put(root, 'cfg/secret.key', SECRET_TEXT);
  put(root, 'cfg/xbox-auth.json', SECRET_TEXT);
  put(root, 'cfg/retroachievements-auth.json', SECRET_TEXT);
  put(root, 'cfg/mainWindowState.json', '{"x":1}');
  put(root, 'epic_tokens.enc', SECRET_TEXT);
  put(root, 'steam_session.enc', SECRET_TEXT);
  put(root, 'covers/10.png', Buffer.from([1, 2, 3, 4]));
  put(root, 'covers/empty.bin', '');
  put(root, 'presets/Users Presets/mine/preset.json', '{"a":1}');
  put(root, 'steam_cache/xbox/777/schema.json', '{"x":1}');
  put(root, 'steam_cache/schema/english/1.db', 'cache');
  put(root, 'logs/parser.log', 'log');
  put(root, 'Cache/Cache_Data/f_1', 'chromium');
  put(root, 'Local Storage/leveldb/000003.log', 'chromium');
  put(root, 'sounds/ding.wav', crypto.randomBytes(5000));
}

async function exportTo(profile, destination, extra = {}) {
  return exportProfile({ userDataDir: profile, destination, appVersion: '3.11.1', home: extra.home || 'C:\\Users\\old', registry: extra.registry || fakeRegistry(), onProgress: extra.onProgress });
}

// Builds an archive by hand so a hostile manifest can be tested without the honest writer.
function craft(file, files, { manifestExtra = {}, formatVersion = 1, payload = null } = {}) {
  const data = payload || Buffer.concat(files.map((f) => f.data || Buffer.alloc(0)));
  const body = zlib.zstdCompressSync(data);
  const manifest = Buffer.from(
    JSON.stringify({
      format: 'aw-profile-backup',
      formatVersion,
      appVersion: '3.11.1',
      createdAt: new Date().toISOString(),
      source: { userData: 'C:\\old\\ud', home: 'C:\\old' },
      files: files.map((f) => ({ path: f.path, size: f.size ?? (f.data || Buffer.alloc(0)).length, sha256: f.sha256 || crypto.createHash('sha256').update(f.data || Buffer.alloc(0)).digest('hex') })),
      ...manifestExtra,
    })
  );
  const header = Buffer.alloc(16);
  Buffer.from('AWBACKUP').copy(header, 0);
  header.writeUInt32LE(1, 8);
  const trailer = Buffer.alloc(44);
  trailer.writeUInt32LE(manifest.length, 0);
  crypto.createHash('sha256').update(manifest).digest().copy(trailer, 4);
  Buffer.from('AWBKEND1').copy(trailer, 36);
  fs.writeFileSync(file, Buffer.concat([header, body, manifest, trailer]));
}

async function rejects(promise, code) {
  await assert.rejects(promise, (err) => {
    assert.equal(err.code, code, `expected ${code}, got ${err.code}: ${err.message}`);
    return true;
  });
}

test('the inventory never includes a secret, a cache or an unlisted path', () => {
  for (const rel of [
    'epic_tokens.enc', 'steam_session.enc', 'cfg/secret.key', 'cfg/xbox-auth.json', 'cfg/retroachievements-auth.json',
    'cfg/anything-token.json', 'covers/x.enc', 'steam_cache/schema/a.db', 'Cache/Cache_Data/f', 'Local Storage/x', 'logs/a.log',
    'cache/gse_fork/x.dll', 'somethingNew/file.json', 'cfg/options.ini.bak', 'cfg/notificationHealth.json',
  ]) {
    assert.equal(inventory.classify(rel).include, false, rel);
  }
  for (const rel of ['cfg/options.ini', 'cfg/gameIndex.json', 'covers/1.png', 'steam_cache/xbox/1/schema.json', 'cache/uplayR2/loader.dll', 'cache/gse_fork/custom/x.dll', 'presets/Users Presets/a/preset.json']) {
    assert.equal(inventory.classify(rel).include, true, rel);
  }
});

test('unsafe relative paths are refused', () => {
  for (const rel of ['../x', 'cfg/../x', '/cfg/a.json', 'C:/x', 'cfg\\a.json', 'cfg/a.json:stream', 'cfg//a.json', 'cfg/CON', 'cfg/a.json ', 'cfg/./a.json', '']) {
    assert.equal(inventory.isSafeRelativePath(rel), false, JSON.stringify(rel));
  }
});

test('scrubbing blanks only the emulator password', () => {
  const out = scrubOptionsIni('[emulator]\r\nloginPassword=abc:def\r\nlogin=steam\r\n[other]\r\nloginPassword=keep\r\n');
  assert.equal(out.hadPassword, true);
  assert.match(out.text, /\[emulator\]\r\nloginPassword=\r\nlogin=steam/);
  assert.match(out.text, /\[other\]\r\nloginPassword=keep/);
});

test('round trip restores the saved profile, keeps secrets out and merges cfg', async () => {
  const sandbox = temp();
  try {
    const old = path.join(sandbox, 'old', 'AppData', 'Roaming', 'Achievement Watcher Next');
    const oldHome = path.join(sandbox, 'old');
    fakeProfile(old, { home: oldHome });
    const file = path.join(sandbox, 'save.awbackup');
    const progress = [];
    const registry = fakeRegistry([{ appid: '440', total: 600, last: 1700000000 }]);
    const summary = await exportTo(old, file, { home: oldHome, registry, onProgress: (p) => progress.push(p.percent) });

    assert.equal(progress.at(-1), 100);
    assert.deepEqual(summary.signedOut.sort(), ['emulator', 'epic', 'retroachievements', 'steam', 'xbox']);
    const { manifest } = await archive.readManifest(file);
    const paths = manifest.files.map((f) => f.path);
    assert.ok(paths.includes('cfg/options.ini') && paths.includes('covers/10.png') && paths.includes('covers/empty.bin'));
    for (const p of paths) assert.equal(inventory.classify(p).include, true, p);
    assert.ok(!paths.some((p) => /secret|auth|tokens|session|logs|Cache|Local Storage|schema\/english/.test(p)));
    assert.deepEqual(manifest.registry.playtime, [{ appid: '440', total: 600, last: 1700000000 }]);

    // New machine: different profile name, and files that must survive or be replaced.
    const newHome = path.join(sandbox, 'new');
    const fresh = path.join(newHome, 'AppData', 'Roaming', 'Achievement Watcher Next');
    put(fresh, 'cfg/secret.key', 'KEEP-LOCAL-KEY');
    put(fresh, 'cfg/extra.json', '{"keep":true}');
    put(fresh, 'cfg/options.ini', '[general]\ntheme=old\n');
    put(fresh, 'covers/stale.png', 'stale');

    const staged = await restore.stageRestore(file, { userDataDir: fresh, home: newHome });
    assert.equal(staged.fileCount, manifest.files.length);
    // Staging alone changes nothing live.
    assert.equal(read(fresh, 'cfg/options.ini'), '[general]\ntheme=old\n');

    const result = restore.applyPendingRestore(fresh, { registry });
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.deepEqual(registry.state.merged, [{ appid: '440', total: 600, last: 1700000000 }]);

    assert.match(read(fresh, 'cfg/options.ini'), /theme=default/);
    assert.doesNotMatch(read(fresh, 'cfg/options.ini'), new RegExp(SECRET_TEXT));
    assert.match(read(fresh, 'cfg/options.ini'), new RegExp(`dir= ${newHome.replace(/\\/g, '\\\\')}\\\\Pictures\\\\Shots`));
    assert.equal(read(fresh, 'cfg/secret.key'), 'KEEP-LOCAL-KEY');
    assert.equal(read(fresh, 'cfg/extra.json'), '{"keep":true}');
    assert.equal(fs.existsSync(path.join(fresh, 'covers', 'stale.png')), false);
    assert.deepEqual([...fs.readFileSync(path.join(fresh, 'covers', '10.png'))], [1, 2, 3, 4]);
    assert.equal(fs.statSync(path.join(fresh, 'covers', 'empty.bin')).size, 0);
    assert.deepEqual(fs.readFileSync(path.join(fresh, 'sounds', 'ding.wav')), fs.readFileSync(path.join(old, 'sounds', 'ding.wav')));
    assert.equal(fs.existsSync(path.join(fresh, 'epic_tokens.enc')), false);

    // The previous files are kept for the way back.
    assert.ok(tree(path.join(fresh, '.profile-restore', 'previous')).some((p) => p.endsWith('covers/stale.png')));
    assert.equal(fs.existsSync(path.join(fresh, '.profile-restore', 'staging')), false);
    assert.equal(restore.takeRestoreResult(fresh).ok, true);
    assert.equal(restore.takeRestoreResult(fresh), null);

    // Nothing in the whole export mentions the secret.
    const everything = tree(fresh).filter((p) => !p.startsWith('.profile-restore'));
    for (const rel of everything) if (rel !== 'cfg/secret.key') assert.doesNotMatch(read(fresh, rel).toString(), new RegExp(SECRET_TEXT), rel);
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test('collections and their pictures survive a round trip', async () => {
  const sandbox = temp();
  try {
    const old = path.join(sandbox, 'old', 'ud');
    const image = 'b3c1e2a4-0000-4000-8000-000000000001-0123456789ab.png';
    put(old, 'cfg/collections.json', JSON.stringify({ version: 1, collections: [{ id: 'c1', name: 'RPG', image }] }));
    put(old, `cfg/collection-images/${image}`, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    const file = path.join(sandbox, 'save.awbackup');
    await exportTo(old, file, { home: path.join(sandbox, 'old') });

    const fresh = path.join(sandbox, 'new', 'ud');
    put(fresh, 'cfg/collection-images/stale.png', 'stale');
    await restore.stageRestore(file, { userDataDir: fresh, home: path.join(sandbox, 'new') });
    assert.equal(restore.applyPendingRestore(fresh, { registry: fakeRegistry() }).ok, true);

    assert.equal(JSON.parse(read(fresh, 'cfg/collections.json')).collections[0].image, image);
    assert.deepEqual([...fs.readFileSync(path.join(fresh, 'cfg', 'collection-images', image))], [0x89, 0x50, 0x4e, 0x47]);
    assert.equal(fs.existsSync(path.join(fresh, 'cfg', 'collection-images', 'stale.png')), false);
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test('absolute paths into the old profile are rebased, others are left alone', async () => {
  const sandbox = temp();
  try {
    const oldHome = path.join(sandbox, 'old');
    const old = path.join(oldHome, 'AppData', 'Roaming', 'Achievement Watcher Next');
    const newHome = path.join(sandbox, 'new');
    const fresh = path.join(newHome, 'AppData', 'Roaming', 'Achievement Watcher Next');
    fakeProfile(old, { home: oldHome });
    const file = path.join(sandbox, 'r.awbackup');
    await exportTo(old, file, { home: oldHome });
    await restore.stageRestore(file, { userDataDir: fresh, home: newHome });
    assert.equal(restore.applyPendingRestore(fresh, { registry: fakeRegistry() }).ok, true);

    const covers = JSON.parse(read(fresh, 'cfg/covers.db'));
    assert.equal(covers['10'], pathToFileURL(path.join(fresh, 'covers', '10.png')).href);
    assert.equal(covers['11'], 'https://cdn.example/x.png');
    const dirs = JSON.parse(read(fresh, 'cfg/librarydirs.db'));
    assert.equal(dirs[0].path, `${newHome}\\Games`);
    assert.equal(dirs[1].path, 'D:\\Games');
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test('rebasePath respects folder boundaries and slash style', () => {
  const maps = rebase.buildMappings([{ from: 'C:\\Users\\old', to: 'D:\\Users\\new' }]);
  assert.equal(rebase.rebaseString('C:\\Users\\old\\a\\b.png', maps), 'D:\\Users\\new\\a\\b.png');
  assert.equal(rebase.rebaseString('c:/users/OLD/a.png', maps), 'D:/Users/new/a.png');
  assert.equal(rebase.rebaseString('C:\\Users\\older\\a.png', maps), 'C:\\Users\\older\\a.png');
  assert.equal(rebase.rebaseString('C:\\Users\\old', maps), 'D:\\Users\\new');
  assert.equal(rebase.buildMappings([{ from: 'C:\\x', to: 'c:\\X\\' }]).length, 0);
});

test('hostile manifests are rejected before anything is written', async () => {
  const sandbox = temp();
  try {
    const fresh = path.join(sandbox, 'ud');
    const attempts = [
      ['traversal', [{ path: '../evil.json', data: Buffer.from('x') }], 'unsafe-entry'],
      ['nested traversal', [{ path: 'cfg/../../evil.json', data: Buffer.from('x') }], 'unsafe-entry'],
      ['absolute', [{ path: '/cfg/a.json', data: Buffer.from('x') }], 'unsafe-entry'],
      ['drive', [{ path: 'C:/Windows/a.json', data: Buffer.from('x') }], 'unsafe-entry'],
      ['backslash', [{ path: 'cfg\\a.json', data: Buffer.from('x') }], 'unsafe-entry'],
      ['secret', [{ path: 'cfg/secret.key', data: Buffer.from('x') }], 'unsafe-entry'],
      ['token file', [{ path: 'epic_tokens.enc', data: Buffer.from('x') }], 'unsafe-entry'],
      ['unlisted root', [{ path: 'Source/x.json', data: Buffer.from('x') }], 'unsafe-entry'],
      ['duplicate', [{ path: 'cfg/a.json', data: Buffer.from('x') }, { path: 'CFG/A.json', data: Buffer.from('y') }], 'unsafe-entry'],
      ['oversize entry', [{ path: 'covers/a.png', size: inventory.MAX_FILE_BYTES + 1, sha256: 'a'.repeat(64) }], 'too-large'],
      ['oversize total', Array.from({ length: 9 }, (_, i) => ({ path: `covers/${i}.png`, size: inventory.MAX_FILE_BYTES, sha256: 'a'.repeat(64) })), 'too-large'],
      ['bad hash field', [{ path: 'cfg/a.json', data: Buffer.from('x'), sha256: 'nothex' }], 'corrupt'],
    ];
    for (const [name, files, code] of attempts) {
      const file = path.join(sandbox, `${name.replace(/ /g, '-')}.awbackup`);
      craft(file, files);
      await rejects(restore.stageRestore(file, { userDataDir: fresh }), code);
    }
    assert.equal(fs.existsSync(path.join(fresh, 'evil.json')), false);
    assert.equal(fs.existsSync(path.join(sandbox, 'evil.json')), false);
    assert.equal(fs.existsSync(path.join(fresh, '.profile-restore', 'pending.json')), false);
    assert.equal(fs.existsSync(path.join(fresh, '.profile-restore', 'staging')), false);
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test('tampered, truncated and foreign files are rejected and leave nothing staged', async () => {
  const sandbox = temp();
  try {
    const old = path.join(sandbox, 'old');
    fakeProfile(old, { home: sandbox });
    const good = path.join(sandbox, 'good.awbackup');
    await exportTo(old, good);
    const bytes = fs.readFileSync(good);
    const fresh = path.join(sandbox, 'ud');

    const flipped = Buffer.from(bytes);
    flipped[40] ^= 0xff;
    fs.writeFileSync(path.join(sandbox, 'flipped.awbackup'), flipped);
    await assert.rejects(restore.stageRestore(path.join(sandbox, 'flipped.awbackup'), { userDataDir: fresh }), (e) => ['corrupt', 'hash-mismatch'].includes(e.code));

    // Manifest says the file hashes to something else: the payload check catches it.
    const lie = path.join(sandbox, 'lie.awbackup');
    craft(lie, [{ path: 'cfg/a.json', data: Buffer.from('{"a":1}'), sha256: 'b'.repeat(64) }]);
    await rejects(restore.stageRestore(lie, { userDataDir: fresh }), 'hash-mismatch');

    // Payload longer or shorter than the manifest says.
    const longer = path.join(sandbox, 'longer.awbackup');
    craft(longer, [{ path: 'cfg/a.json', size: 3, data: Buffer.from('abc') }], { payload: Buffer.from('abcdef') });
    await rejects(restore.stageRestore(longer, { userDataDir: fresh }), 'corrupt');
    const shorter = path.join(sandbox, 'shorter.awbackup');
    craft(shorter, [{ path: 'cfg/a.json', size: 9, sha256: 'c'.repeat(64) }], { payload: Buffer.from('abc') });
    await rejects(restore.stageRestore(shorter, { userDataDir: fresh }), 'corrupt');

    fs.writeFileSync(path.join(sandbox, 'cut.awbackup'), bytes.subarray(0, bytes.length - 10));
    await rejects(restore.stageRestore(path.join(sandbox, 'cut.awbackup'), { userDataDir: fresh }), 'corrupt');
    fs.writeFileSync(path.join(sandbox, 'text.awbackup'), 'just some text, not a backup at all, long enough to pass the size check');
    await rejects(restore.stageRestore(path.join(sandbox, 'text.awbackup'), { userDataDir: fresh }), 'not-a-backup');
    craft(path.join(sandbox, 'new.awbackup'), [{ path: 'cfg/a.json', data: Buffer.from('{}') }], { formatVersion: 99 });
    await rejects(restore.stageRestore(path.join(sandbox, 'new.awbackup'), { userDataDir: fresh }), 'format-too-new');
    craft(path.join(sandbox, 'none.awbackup'), []);
    await rejects(restore.stageRestore(path.join(sandbox, 'none.awbackup'), { userDataDir: fresh }), 'empty');

    assert.equal(fs.existsSync(path.join(fresh, '.profile-restore', 'staging')), false);
    assert.equal(fs.existsSync(path.join(fresh, '.profile-restore', 'pending.json')), false);
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test('a failure while applying puts every previous file back', async () => {
  const sandbox = temp();
  try {
    const old = path.join(sandbox, 'old');
    fakeProfile(old, { home: sandbox });
    const file = path.join(sandbox, 'save.awbackup');
    await exportTo(old, file);

    const live = path.join(sandbox, 'live');
    put(live, 'cfg/options.ini', '[general]\ntheme=mine\n');
    put(live, 'cfg/gameIndex.json', '{"mine":1}');
    put(live, 'covers/mine.png', 'mine');
    put(live, 'sounds/mine.wav', 'mine');
    const before = tree(live);

    const staged = await restore.stageRestore(file, { userDataDir: live });
    assert.ok(staged.fileCount > 3);
    const result = restore.applyPendingRestore(live, {
      registry: fakeRegistry(),
      hooks: { beforePlace: (unit, index) => { if (index === 3) throw new Error('forced failure'); } },
    });
    assert.equal(result.ok, false);
    assert.equal(result.rolledBack, true);
    assert.match(result.error, /forced failure/);

    const after = tree(live).filter((p) => !p.startsWith('.profile-restore/result'));
    assert.deepEqual(after, before);
    assert.equal(read(live, 'cfg/options.ini'), '[general]\ntheme=mine\n');
    assert.equal(read(live, 'covers/mine.png'), 'mine');
    assert.equal(fs.existsSync(path.join(live, '.profile-restore', 'pending.json')), false);
    assert.equal(restore.takeRestoreResult(live).rolledBack, true);
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test('an apply interrupted by a crash is undone at the next start', async () => {
  const sandbox = temp();
  try {
    const old = path.join(sandbox, 'old');
    fakeProfile(old, { home: sandbox });
    const file = path.join(sandbox, 'save.awbackup');
    await exportTo(old, file);
    const live = path.join(sandbox, 'live');
    put(live, 'covers/mine.png', 'mine');
    put(live, 'cfg/options.ini', 'mine');

    await restore.stageRestore(file, { userDataDir: live });
    // Simulate the crash: one folder moved aside and its replacement in place, marker still "applying".
    const markerFile = path.join(live, '.profile-restore', 'pending.json');
    const pending = JSON.parse(fs.readFileSync(markerFile, 'utf8'));
    const held = path.join(live, '.profile-restore', 'previous', pending.id);
    fs.mkdirSync(held, { recursive: true });
    fs.renameSync(path.join(live, 'covers'), path.join(held, 'covers'));
    fs.renameSync(path.join(live, '.profile-restore', 'staging', 'covers'), path.join(live, 'covers'));
    fs.writeFileSync(markerFile, JSON.stringify({ ...pending, state: 'applying' }));

    const result = restore.applyPendingRestore(live, { registry: fakeRegistry() });
    assert.equal(result.ok, false);
    assert.equal(result.rolledBack, true);
    assert.equal(read(live, 'covers/mine.png'), 'mine');
    assert.equal(fs.existsSync(path.join(live, 'covers', '10.png')), false);
    assert.equal(read(live, 'cfg/options.ini'), 'mine');
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test('a live lock from another process stops a second apply', async () => {
  const sandbox = temp();
  try {
    const old = path.join(sandbox, 'old');
    fakeProfile(old, { home: sandbox });
    const file = path.join(sandbox, 'save.awbackup');
    await exportTo(old, file);
    const live = path.join(sandbox, 'live');
    await restore.stageRestore(file, { userDataDir: live });
    fs.writeFileSync(path.join(live, '.profile-restore', 'apply.lock'), String(process.ppid));
    assert.equal(restore.applyPendingRestore(live, { registry: fakeRegistry() }), null);
    assert.equal(fs.existsSync(path.join(live, 'covers')), false);
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test('a failed export leaves no file at the destination', async () => {
  const sandbox = temp();
  try {
    const old = path.join(sandbox, 'old');
    fakeProfile(old, { home: sandbox });
    const destination = path.join(sandbox, 'missing-folder', 'save.awbackup');
    await assert.rejects(exportTo(old, destination));
    assert.equal(fs.existsSync(destination), false);

    const inside = path.join(old, 'save.awbackup');
    await rejects(exportTo(old, inside), 'destination-inside-profile');

    // A file that vanishes mid-export aborts the whole thing and removes the partial file.
    const dest = path.join(sandbox, 'vanish.awbackup');
    const progressFiles = [];
    await assert.rejects(
      exportTo(old, dest, {
        onProgress: (p) => {
          if (p.itemName && !progressFiles.length) {
            progressFiles.push(p.itemName);
            fs.rmSync(path.join(old, 'sounds'), { recursive: true, force: true });
          }
        },
      })
    );
    assert.equal(fs.existsSync(dest), false);
    assert.deepEqual(fs.readdirSync(sandbox).filter((n) => n.endsWith('.partial')), []);
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test('an empty profile has nothing to export', async () => {
  const sandbox = temp();
  try {
    fs.mkdirSync(path.join(sandbox, 'ud'));
    await rejects(exportTo(path.join(sandbox, 'ud'), path.join(sandbox, 'x.awbackup')), 'empty');
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});
