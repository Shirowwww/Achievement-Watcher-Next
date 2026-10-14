'use strict';

// The restore point taken before AW Next writes into a game folder. The manual fix always took one;
// the automatic pass took none, so there was nothing to put back after it. Both share this module
// now, which is only worth anything if the index entry the restore list reads is really written.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const gbeBackup = require('../../app/util/gbeBackup.js');

function tmpdir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

test('a backup is recorded in the index the restore list reads', () => {
  const userData = tmpdir('aw-backup-user-');
  const gameDir = tmpdir('aw-backup-game-');
  try {
    const goldberg = {
      backupSetup({ gameDir: dir, steamSettings, destinationRoot }) {
        assert.equal(dir, gameDir);
        assert.equal(steamSettings, path.join(gameDir, 'steam_settings'), 'a folder inside the game is passed through');
        assert.ok(destinationRoot.startsWith(userData), 'backups live under the user data folder');
        return { backupDir: path.join(destinationRoot, '2026-10-14'), manifest: { createdAt: '2026-10-14T00:00:00.000Z', files: [], gameDir: dir } };
      },
    };

    const result = gbeBackup.createBackup({
      goldberg,
      userDataPath: userData,
      appid: '480',
      gameDir,
      steamSettings: path.join(gameDir, 'steam_settings'),
    });

    assert.equal(result.skipped, false);
    const index = gbeBackup.readIndex(userData);
    assert.equal(index.length, 1);
    assert.equal(index[0].appid, '480');
    assert.equal(path.resolve(index[0].gameDir), path.resolve(gameDir));
    assert.equal(index[0].createdAt, '2026-10-14T00:00:00.000Z');
  } finally {
    fs.rmSync(userData, { recursive: true, force: true });
    fs.rmSync(gameDir, { recursive: true, force: true });
  }
});

test('a steam_settings folder outside the game folder is not backed up as part of it', () => {
  const userData = tmpdir('aw-backup-user-');
  const gameDir = tmpdir('aw-backup-game-');
  const elsewhere = tmpdir('aw-backup-shared-');
  try {
    let seen = 'unset';
    const goldberg = {
      backupSetup({ steamSettings, destinationRoot }) {
        seen = steamSettings;
        return { backupDir: path.join(destinationRoot, 'x'), manifest: { createdAt: 'now', files: [], gameDir } };
      },
    };
    gbeBackup.createBackup({ goldberg, userDataPath: userData, appid: '1', gameDir, steamSettings: elsewhere });
    assert.equal(seen, null, 'a central emulator config is not this game folder to restore');
  } finally {
    for (const dir of [userData, gameDir, elsewhere]) fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('nothing to save is reported as skipped, not as a failure', () => {
  const userData = tmpdir('aw-backup-user-');
  const gameDir = tmpdir('aw-backup-game-');
  try {
    const goldberg = {
      backupSetup() {
        throw new Error('no steam_settings or Steam API DLL was found in this folder');
      },
    };
    const result = gbeBackup.createBackup({ goldberg, userDataPath: userData, appid: '1', gameDir });
    assert.equal(result.skipped, true);
    assert.equal(gbeBackup.readIndex(userData).length, 0);
  } finally {
    fs.rmSync(userData, { recursive: true, force: true });
    fs.rmSync(gameDir, { recursive: true, force: true });
  }
});

test('any other backup failure is raised, so a caller decides whether to write anyway', () => {
  const userData = tmpdir('aw-backup-user-');
  try {
    const goldberg = {
      backupSetup() {
        throw new Error('EPERM: operation not permitted');
      },
    };
    assert.throws(
      () => gbeBackup.createBackup({ goldberg, userDataPath: userData, appid: '1', gameDir: userData }),
      /backup before emulator fix failed/
    );
  } finally {
    fs.rmSync(userData, { recursive: true, force: true });
  }
});

test('the index keeps one entry per backup folder and stays bounded', () => {
  const userData = tmpdir('aw-backup-user-');
  try {
    for (let i = 0; i < gbeBackup.MAX_INDEX_ENTRIES + 5; i++) {
      gbeBackup.rememberBackup({
        userDataPath: userData,
        appid: String(i),
        gameDir: path.join(userData, 'game', String(i)),
        backupDir: path.join(userData, 'backups', String(i)),
      });
    }
    // The same folder twice is one entry, so a repeated restore point never duplicates a row.
    gbeBackup.rememberBackup({ userDataPath: userData, appid: '7', gameDir: path.join(userData, 'game', '7'), backupDir: path.join(userData, 'backups', '7') });
    gbeBackup.rememberBackup({ userDataPath: userData, appid: '7', gameDir: path.join(userData, 'game', '7'), backupDir: path.join(userData, 'backups', '7') });

    const index = gbeBackup.readIndex(userData);
    assert.equal(index.length, gbeBackup.MAX_INDEX_ENTRIES);
    const keys = index.map((entry) => entry.backupDir.toLowerCase());
    assert.equal(new Set(keys).size, keys.length, 'no duplicate backup folder');
  } finally {
    fs.rmSync(userData, { recursive: true, force: true });
  }
});

test('restore points of an unchanged game end up sharing their files once the batch is over', async (t) => {
  const goldberg = require('../../app/parser/goldberg.js');
  const userData = tmpdir('aw-backup-user-');
  const gameDir = tmpdir('aw-backup-game-');
  t.after(() => {
    fs.rmSync(userData, { recursive: true, force: true });
    fs.rmSync(gameDir, { recursive: true, force: true });
  });
  fs.mkdirSync(path.join(gameDir, 'steam_settings'));
  fs.writeFileSync(path.join(gameDir, 'steam_settings', 'achievements.json'), JSON.stringify(Array(400).fill({ name: 'ACH' })));
  t.mock.timers.enable({ apis: ['setTimeout'] });

  const first = gbeBackup.createBackup({ goldberg, userDataPath: userData, appid: '480', gameDir });
  const second = gbeBackup.createBackup({ goldberg, userDataPath: userData, appid: '480', gameDir });
  const copies = [first, second].map((backup) => path.join(backup.backupDir, 'steam_settings', 'achievements.json'));
  const ino = (file) => fs.statSync(file, { bigint: true }).ino;
  assert.notEqual(ino(copies[0]), ino(copies[1]), 'nothing is linked while the batch may still be running');

  t.mock.timers.tick(15000);
  // The pass hashes files on the thread pool, which a busy suite can hold for a while.
  const deadline = Date.now() + 10000;
  while (ino(copies[0]) !== ino(copies[1]) && Date.now() < deadline) await new Promise((resolve) => setImmediate(resolve));

  assert.equal(ino(copies[0]), ino(copies[1]));
  assert.equal(fs.readFileSync(copies[1], 'utf8'), fs.readFileSync(path.join(gameDir, 'steam_settings', 'achievements.json'), 'utf8'));
});

test('a missing or unreadable index reads as empty rather than throwing', () => {
  const userData = tmpdir('aw-backup-user-');
  try {
    assert.deepEqual(gbeBackup.readIndex(userData), []);
    const file = gbeBackup.indexFile(userData);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, '{not json');
    assert.deepEqual(gbeBackup.readIndex(userData), []);
  } finally {
    fs.rmSync(userData, { recursive: true, force: true });
  }
});
