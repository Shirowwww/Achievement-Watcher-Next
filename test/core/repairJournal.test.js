'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const repairJournal = require(path.join(__dirname, '..', '..', 'app', 'util', 'repairJournal.js'));

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-repair-journal-'));
test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

let counter = 0;
function setup() {
  const base = path.join(tmp, String(counter++));
  const userDataPath = path.join(base, 'userData');
  const settings = path.join(base, 'Game', 'steam_settings');
  fs.mkdirSync(settings, { recursive: true });
  fs.writeFileSync(path.join(settings, 'configs.main.ini'), '[main::connectivity]\noffline=1\n');
  fs.writeFileSync(path.join(settings, 'steam_appid.txt'), '111');
  // A game's files were written long before a repair. Linux stamps writes within one timer tick
  // (up to 10 ms) with the same time, so a same-size rewrite right after setup would look untouched.
  const longAgo = new Date(Date.UTC(2025, 0, 1));
  for (const name of ['configs.main.ini', 'steam_appid.txt']) fs.utimesSync(path.join(settings, name), longAgo, longAgo);
  return { base, userDataPath, settings, gameDir: path.dirname(settings) };
}

const read = (file) => fs.readFileSync(file, 'utf8');
const options = (s, extra = {}) => ({ userDataPath: s.userDataPath, appid: '4115450', label: 'repair', roots: [{ path: s.settings, deep: true }], ...extra });

// A repair that edits one file, deletes another and creates a file in a new folder.
function typicalRepair(s) {
  fs.writeFileSync(path.join(s.settings, 'configs.main.ini'), '[main::connectivity]\noffline=0\n');
  fs.unlinkSync(path.join(s.settings, 'steam_appid.txt'));
  fs.mkdirSync(path.join(s.settings, 'images'));
  fs.writeFileSync(path.join(s.settings, 'images', 'a.png'), 'png');
  fs.writeFileSync(path.join(s.settings, 'achievements.json'), '[]');
}

test('undo puts changed and deleted files back and removes what the repair created', async () => {
  const s = setup();
  await repairJournal.record(options(s), () => typicalRepair(s));

  const result = repairJournal.undo({ userDataPath: s.userDataPath, appid: '4115450' });
  assert.equal(read(path.join(s.settings, 'configs.main.ini')), '[main::connectivity]\noffline=1\n');
  assert.equal(read(path.join(s.settings, 'steam_appid.txt')), '111');
  assert.ok(!fs.existsSync(path.join(s.settings, 'achievements.json')));
  assert.ok(!fs.existsSync(path.join(s.settings, 'images')), 'a folder the repair created goes once empty');
  assert.equal(result.restored.length, 2);
  assert.equal(result.removed.length, 2);
  assert.deepEqual(result.skipped, []);
  assert.equal(repairJournal.latest({ userDataPath: s.userDataPath, appid: '4115450' }), null, 'the entry is used up');
});

test('a whole folder the repair created is taken back out', async () => {
  const s = setup();
  const fresh = path.join(s.gameDir, 'Binaries', 'steam_settings');
  fs.mkdirSync(path.dirname(fresh));
  await repairJournal.record(options(s, { roots: [{ path: fresh, deep: true }] }), () => {
    fs.mkdirSync(path.join(fresh, 'images'), { recursive: true });
    fs.writeFileSync(path.join(fresh, 'achievements.json'), '[]');
    fs.writeFileSync(path.join(fresh, 'images', 'a.png'), 'png');
  });
  repairJournal.undo({ userDataPath: s.userDataPath, appid: '4115450' });
  assert.ok(!fs.existsSync(fresh));
  assert.ok(fs.existsSync(path.join(s.gameDir, 'Binaries')), 'the folder that was already there stays');
});

test('a file changed again after the repair is left alone and listed', async () => {
  const s = setup();
  await repairJournal.record(options(s), () => typicalRepair(s));
  const main = path.join(s.settings, 'configs.main.ini');
  const created = path.join(s.settings, 'achievements.json');
  fs.writeFileSync(main, '[main::connectivity]\noffline=0\n; edited by hand\n');
  fs.writeFileSync(created, '[{"name":"A"}]');

  const result = repairJournal.undo({ userDataPath: s.userDataPath, appid: '4115450' });
  assert.match(read(main), /edited by hand/);
  assert.equal(read(created), '[{"name":"A"}]');
  assert.deepEqual(result.skipped.map((entry) => [path.basename(entry.file), entry.reason]).sort(), [['achievements.json', 'changed'], ['configs.main.ini', 'changed']]);
  assert.equal(read(path.join(s.settings, 'steam_appid.txt')), '111', 'the rest is still undone');
});

test('a preview changes nothing', async () => {
  const s = setup();
  await repairJournal.record(options(s), () => typicalRepair(s));
  const preview = repairJournal.undo({ userDataPath: s.userDataPath, appid: '4115450', dryRun: true });
  assert.equal(preview.restored.length + preview.removed.length, 4);
  assert.equal(read(path.join(s.settings, 'configs.main.ini')), '[main::connectivity]\noffline=0\n');
  assert.ok(repairJournal.latest({ userDataPath: s.userDataPath, appid: '4115450' }));
});

test('a repair that changed nothing leaves no entry', async () => {
  const s = setup();
  const value = await repairJournal.record(options(s), () => 'done');
  assert.equal(value, 'done');
  assert.equal(repairJournal.latest({ userDataPath: s.userDataPath, appid: '4115450' }), null);
});

// Every file under a folder, with its exact bytes, for "left as it was" comparisons.
function tree(dir) {
  const out = {};
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else out[path.relative(dir, full)] = fs.readFileSync(full).toString('base64');
    }
  };
  walk(dir);
  return out;
}

test('a repair that fails half way is rolled back before its error reaches the caller', async () => {
  const s = setup();
  const before = tree(s.gameDir);
  const failure = await repairJournal
    .record(options(s), () => {
      typicalRepair(s);
      throw new Error('network down');
    })
    .then(
      () => null,
      (err) => err
    );
  assert.match(String(failure && failure.message), /network down/);
  assert.deepEqual(tree(s.gameDir), before, 'the game folder is byte-identical to before the repair');
  assert.ok(failure.rollback && failure.rollback.skipped.length === 0, 'the error says what was put back');
  assert.equal(repairJournal.latest({ userDataPath: s.userDataPath, appid: '4115450' }), null, 'nothing is left to undo');
});

test('an undo that cannot write one file changes nothing and keeps its record for a retry', async (t) => {
  const s = setup();
  await repairJournal.record(options(s), () => typicalRepair(s));
  const afterRepair = tree(s.gameDir);
  // One file locked by the running game: its put-back fails half way through the undo.
  const locked = path.join(s.settings, 'configs.main.ini');
  const realCopy = fs.copyFileSync;
  fs.copyFileSync = (from, to, ...rest) => {
    if (String(to).startsWith(`${locked}.aw-undo-`)) throw Object.assign(new Error('EBUSY: resource busy or locked'), { code: 'EBUSY' });
    return realCopy(from, to, ...rest);
  };
  t.after(() => {
    fs.copyFileSync = realCopy;
  });
  const result = repairJournal.undo({ userDataPath: s.userDataPath, appid: '4115450' });
  fs.copyFileSync = realCopy;
  assert.equal(result.failed.length, 1);
  assert.equal(result.rolledBack, true);
  assert.deepEqual(tree(s.gameDir), afterRepair, 'the game is left as the repair made it');
  assert.ok(repairJournal.latest({ userDataPath: s.userDataPath, appid: '4115450' }), 'the record stays for a retry');
  repairJournal.undo({ userDataPath: s.userDataPath, appid: '4115450' });
  assert.equal(read(locked), '[main::connectivity]\noffline=1\n', 'the retry works once the file is free');
});

test('a rolled-back failure leaves the previous repair as the one Undo takes back', async () => {
  const s = setup();
  const main = path.join(s.settings, 'configs.main.ini');
  await repairJournal.record(options(s), () => fs.writeFileSync(main, 'first repair'));
  await assert.rejects(
    repairJournal.record(options(s), () => {
      fs.writeFileSync(main, 'second repair, half done');
      throw new Error('blocked by the antivirus');
    })
  );
  assert.equal(read(main), 'first repair');
  repairJournal.undo({ userDataPath: s.userDataPath, appid: '4115450' });
  assert.equal(read(main), '[main::connectivity]\noffline=1\n');
});

test('a big file replaced in place comes back from the original kept beside it', async () => {
  const s = setup();
  const exe = path.join(s.gameDir, 'Game.exe');
  // Over the copy limit, like a real game exe: the journal keeps no copy of its own.
  const original = Buffer.alloc(repairJournal.COPY_LIMIT + 1, 1);
  fs.writeFileSync(exe, original);
  const before = tree(s.gameDir);
  const roots = [...repairJournal.gbeRoots({ runtimeDirs: [s.gameDir] }), { path: s.settings, deep: true }];
  await assert.rejects(
    repairJournal.record(options(s, { roots }), () => {
      // What Steamless does: the original kept as .steamstub.bak, the exe rewritten unpacked.
      fs.copyFileSync(exe, `${exe}.steamstub.bak`);
      const unpacked = Buffer.from(original);
      unpacked[0] = 2;
      fs.writeFileSync(exe, unpacked);
      throw new Error('GBE download blocked');
    })
  );
  assert.deepEqual(tree(s.gameDir), before);
});

test('repairs are undone newest first, and only a few are kept per game', async () => {
  const s = setup();
  const main = path.join(s.settings, 'configs.main.ini');
  for (let i = 1; i <= repairJournal.MAX_PER_GAME + 2; i++) {
    // Each step its own time, as repairs made apart would have (see setup).
    await repairJournal.record(options(s), () => {
      fs.writeFileSync(main, `step ${i}`);
      const when = new Date(Date.UTC(2026, 0, 1) + i * 1000);
      fs.utimesSync(main, when, when);
    });
  }
  repairJournal.undo({ userDataPath: s.userDataPath, appid: '4115450' });
  assert.equal(read(main), `step ${repairJournal.MAX_PER_GAME + 1}`);
  // The file the first undo restored is not mistaken for one changed since the repair before it.
  repairJournal.undo({ userDataPath: s.userDataPath, appid: '4115450' });
  assert.equal(read(main), `step ${repairJournal.MAX_PER_GAME}`);
  const left = fs.readdirSync(path.join(s.userDataPath, 'repair-undo', '4115450')).length;
  assert.equal(left, repairJournal.MAX_PER_GAME - 2);
});

test('folders that cannot be worked out never stop the repair', async () => {
  const s = setup();
  const roots = () => {
    throw new Error('unreadable game folder');
  };
  const value = await repairJournal.record(options(s, { roots }), () => 'repaired');
  assert.equal(value, 'repaired');
  assert.equal(repairJournal.latest({ userDataPath: s.userDataPath, appid: '4115450' }), null);
});

test('a dated backup the repair made stays when a file could not be put back', async () => {
  const s = setup();
  const backup = path.join(s.settings, '.aw-backups', '2026-11-06');
  await repairJournal.record(options(s), () => {
    fs.mkdirSync(backup, { recursive: true });
    fs.writeFileSync(path.join(backup, 'configs.main.ini'), '[main::connectivity]\noffline=1\n');
    typicalRepair(s);
  });
  fs.writeFileSync(path.join(s.settings, 'configs.main.ini'), '; edited by hand\n');
  const result = repairJournal.undo({ userDataPath: s.userDataPath, appid: '4115450' });
  assert.equal(result.skipped.length, 1);
  assert.ok(fs.existsSync(path.join(backup, 'configs.main.ini')), 'it may hold the only original left');
});

test("AW Next's own backup folder is never part of what a repair changed", async () => {
  const s = setup();
  await repairJournal.record(options(s), () => {
    fs.mkdirSync(path.join(s.settings, '.aw-backups', 'x'), { recursive: true });
    fs.writeFileSync(path.join(s.settings, '.aw-backups', 'x', 'configs.main.ini'), 'copy');
  });
  assert.equal(repairJournal.latest({ userDataPath: s.userDataPath, appid: '4115450' }), null, 'only the backup changed, so nothing is recorded');
});

test('a folder listed one level deep ignores what lies below it', async () => {
  const s = setup();
  await repairJournal.record(options(s, { roots: [{ path: s.gameDir, deep: false }] }), () => {
    fs.writeFileSync(path.join(s.gameDir, 'steam_api64.dll'), 'gbe');
    fs.writeFileSync(path.join(s.settings, 'configs.main.ini'), 'changed below');
  });
  const entry = repairJournal.latest({ userDataPath: s.userDataPath, appid: '4115450' }).entry;
  assert.deepEqual(entry.changes.map((change) => path.basename(change.file)), ['steam_api64.dll']);
});

test('a read-only file the repair replaced is put back', async () => {
  const s = setup();
  const dll = path.join(s.gameDir, 'steam_api64.dll');
  fs.writeFileSync(dll, 'valve');
  fs.chmodSync(dll, 0o444);
  await repairJournal.record(options(s, { roots: [{ path: s.gameDir, deep: false }] }), () => {
    fs.chmodSync(dll, 0o644);
    fs.renameSync(dll, `${dll}.bak`);
    fs.writeFileSync(dll, 'gbe');
    fs.chmodSync(dll, 0o444);
  });
  const result = repairJournal.undo({ userDataPath: s.userDataPath, appid: '4115450' });
  assert.equal(read(dll), 'valve');
  assert.ok(!fs.existsSync(`${dll}.bak`));
  assert.deepEqual(result.skipped, []);
});

test('a big file the repair replaced comes back from the original it kept beside it', () => {
  const s = setup();
  const exe = path.join(s.gameDir, 'Game.exe');
  fs.writeFileSync(exe, 'drm');
  const handle = repairJournal.begin(options(s, { roots: [{ path: s.gameDir, deep: false }] }));
  // As if the exe were over the copy limit: the journal kept no copy of it.
  handle.kept.delete(path.resolve(exe));
  fs.copyFileSync(exe, `${exe}.steamstub.bak`);
  fs.writeFileSync(exe, 'unpacked');
  repairJournal.commit(handle);

  const result = repairJournal.undo({ userDataPath: s.userDataPath, appid: '4115450' });
  assert.equal(read(exe), 'drm', 'the original is read back before its copy goes');
  assert.ok(!fs.existsSync(`${exe}.steamstub.bak`));
  assert.deepEqual(result.skipped, []);
});

test('files a step reports after the fact are undone with the copies it kept', () => {
  const s = setup();
  const overwritten = path.join(s.gameDir, 'Engine', 'x.dll');
  const added = path.join(s.gameDir, 'Engine', 'crack.ini');
  const kept = path.join(s.gameDir, '.aw-crackfix-backups', 'x.dll');
  fs.mkdirSync(path.dirname(overwritten), { recursive: true });
  fs.mkdirSync(path.dirname(kept), { recursive: true });
  fs.writeFileSync(overwritten, 'original');

  // The crack fix keeps its own copy of what it overwrites; the journal is told afterwards.
  const handle = repairJournal.begin(options(s, { roots: [] }));
  fs.copyFileSync(overwritten, kept);
  fs.writeFileSync(overwritten, 'cracked');
  fs.writeFileSync(added, '[crack]');
  repairJournal.note(handle, [
    { file: overwritten, original: kept },
    { file: added, original: null },
  ]);
  repairJournal.commit(handle);

  repairJournal.undo({ userDataPath: s.userDataPath, appid: '4115450' });
  assert.equal(read(overwritten), 'original');
  assert.ok(!fs.existsSync(added));
});

test('a save folder only ever loses the placeholder the repair created in it', async () => {
  const s = setup();
  const saves = path.join(s.base, 'GSE Saves', '4115450');
  fs.mkdirSync(saves, { recursive: true });
  fs.writeFileSync(path.join(saves, 'achievements.json'), '{"A":{"earned":true}}');
  const roots = repairJournal.gbeRoots({ saveFolders: [saves] });
  await repairJournal.record(options(s, { roots }), () => {
    // The game writes an unlock while the repair runs, and the repair seeds a stats file.
    fs.writeFileSync(path.join(saves, 'achievements.json'), '{"A":{"earned":true},"B":{"earned":true}}');
    fs.mkdirSync(path.join(saves, 'stats'));
    fs.writeFileSync(path.join(saves, 'stats', 'kills'), '1');
  });
  repairJournal.undo({ userDataPath: s.userDataPath, appid: '4115450' });
  assert.match(read(path.join(saves, 'achievements.json')), /"B"/, 'an unlock is never rolled back');
  assert.ok(!fs.existsSync(path.join(saves, 'stats')));
});
