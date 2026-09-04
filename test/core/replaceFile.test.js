'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { replaceFileSync, clearReadOnly, unlinkForce, sweepSidecars } = require('../../app/util/replaceFile.js');

const windows = process.platform === 'win32';

function scratch() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-replace-file-'));
  test.after(() => {
    for (const entry of fs.readdirSync(dir)) {
      try {
        fs.chmodSync(path.join(dir, entry), 0o666);
      } catch {
        /* already writable */
      }
    }
    fs.rmSync(dir, { recursive: true, force: true });
  });
  return dir;
}

// The two files every case needs: a destination holding OLD, a validated temporary holding NEW.
function pair(dir, name) {
  const destination = path.join(dir, `${name}.dll`);
  const temporary = path.join(dir, `.${name}.dll.tmp`);
  fs.writeFileSync(destination, 'OLD');
  fs.writeFileSync(temporary, 'NEW');
  return { destination, temporary };
}

test('replaceFileSync renames when nothing is in the way', () => {
  const dir = scratch();
  const { destination, temporary } = pair(dir, 'plain');
  assert.equal(replaceFileSync(temporary, destination), 'rename');
  assert.equal(fs.readFileSync(destination, 'utf8'), 'NEW');
  assert.equal(fs.existsSync(temporary), false);
});

/*
  Issue #60. A repack ships its loader read-only, every copy AW Next makes of it inherits the
  attribute, and the rename that installs the next one is then refused with EPERM - which is why the
  same failure showed up in the game folder and in AW Next's own cache alike.
*/
test('replaceFileSync replaces a read-only destination', { skip: !windows && 'read-only replace is a Windows failure mode' }, () => {
  const dir = scratch();
  const { destination, temporary } = pair(dir, 'readonly');
  fs.chmodSync(destination, 0o444);
  assert.throws(() => fs.renameSync(temporary, destination), { code: 'EPERM' }, 'the plain rename must still fail, or this test proves nothing');
  assert.equal(replaceFileSync(temporary, destination), 'rename-after-readonly');
  assert.equal(fs.readFileSync(destination, 'utf8'), 'NEW');
});

test('replaceFileSync does not pass a read-only attribute on to the file it installs', { skip: !windows && 'Windows attribute' }, () => {
  const dir = scratch();
  const { destination, temporary } = pair(dir, 'noinherit');
  fs.chmodSync(temporary, 0o444);
  replaceFileSync(temporary, destination);
  assert.equal(fs.statSync(destination).mode & 0o200, 0o200, 'the installed file must stay writable');
  // Proof the propagation is broken for good: the next replace goes through the plain rename.
  const next = path.join(dir, '.noinherit.next.tmp');
  fs.writeFileSync(next, 'NEXT');
  assert.equal(replaceFileSync(next, destination), 'rename');
});

test('replaceFileSync swaps past a destination somebody holds open', { skip: !windows && 'sharing violations are a Windows failure mode' }, () => {
  const dir = scratch();
  const { destination, temporary } = pair(dir, 'locked');
  const handle = fs.openSync(destination, 'r');
  try {
    assert.throws(() => fs.renameSync(temporary, destination), { code: 'EPERM' });
    const how = replaceFileSync(temporary, destination);
    assert.ok(how === 'swap' || how === 'overwrite', `expected a fallback, got ${how}`);
    assert.equal(fs.readFileSync(destination, 'utf8'), 'NEW');
  } finally {
    fs.closeSync(handle);
  }
  // Whatever the fallback was, the folder is left with the loader and nothing a scan would mistake
  // for one.
  const strays = fs.readdirSync(dir).filter((entry) => entry.startsWith('locked.dll') && entry !== 'locked.dll');
  assert.deepEqual(strays, []);
});

test('replaceFileSync keeps the old file when the destination cannot be written at all', () => {
  const dir = scratch();
  const { destination, temporary } = pair(dir, 'hopeless');
  const blocked = path.join(destination, 'inside-a-file');
  assert.throws(() => replaceFileSync(temporary, blocked), (err) => err.code === 'ENOTDIR' || err.code === 'ENOENT');
  assert.equal(fs.readFileSync(destination, 'utf8'), 'OLD');
});

// Unlike a rename, a plain unlink already clears the attribute itself; what unlinkForce adds is a
// false return instead of a throw, so a caller can say what could not be removed.
test('unlinkForce removes a read-only file and reports a failure rather than throwing', () => {
  const dir = scratch();
  const file = path.join(dir, 'readonly.ini');
  fs.writeFileSync(file, 'x');
  fs.chmodSync(file, 0o444);
  assert.equal(unlinkForce(file), true);
  assert.equal(fs.existsSync(file), false);
  assert.equal(unlinkForce(path.join(dir, 'absent.ini')), false);
});

test('clearReadOnly reports nothing to do on an already writable file', () => {
  const dir = scratch();
  const file = path.join(dir, 'writable.txt');
  fs.writeFileSync(file, 'x');
  assert.equal(clearReadOnly(file), false);
  assert.equal(clearReadOnly(path.join(dir, 'absent.txt')), false);
});

test('sweepSidecars clears only the stale leftovers of an earlier swap', () => {
  const dir = scratch();
  const stale = path.join(dir, 'upc_r2_loader64.dll.aw-replaced-111.222');
  const fresh = path.join(dir, 'upc_r2_loader64.dll.aw-replaced-333.444');
  const unrelated = path.join(dir, 'upc_r2_loader64.dll');
  for (const file of [stale, fresh, unrelated]) fs.writeFileSync(file, 'x');
  const old = Date.now() / 1000 - 7200;
  fs.utimesSync(stale, old, old);
  sweepSidecars(dir);
  assert.equal(fs.existsSync(stale), false);
  assert.equal(fs.existsSync(fresh), true);
  assert.equal(fs.existsSync(unrelated), true);
});
