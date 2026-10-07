'use strict';

/*
  Up to 3.11.0 an SDR souvenir went through screenshot-desktop, which left a batch file, a manifest
  and a C# grabber it compiled in %TEMP%\screenCapture. Antivirus engines flag that grabber, so a
  start removes the folder, but only when it holds nothing else.
*/

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { removeLegacyScreenCapture } = require('../../app/util/legacyScreenCapture.js');

const BAT = '// 2>nul||@goto :batch\r\n/*\r\n:batch\r\ncall %csc% /nologo\r\n*/\r\npublic class ScreenCapture\r\n{\r\n}\r\n';

function tempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'aw-legacy-capture-'));
}

function leftover(root, { bat = BAT, exe = true, manifest = true } = {}) {
  const dir = path.join(root, 'screenCapture');
  fs.mkdirSync(dir);
  if (bat !== null) fs.writeFileSync(path.join(dir, 'screenCapture_1.3.2.bat'), bat);
  if (exe) fs.writeFileSync(path.join(dir, 'screenCapture_1.3.2.exe'), Buffer.from('MZ'));
  if (manifest) fs.writeFileSync(path.join(dir, 'app.manifest'), '<assembly/>');
  return dir;
}

function withRoot(fn) {
  const root = tempRoot();
  try {
    fn(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test('the folder screenshot-desktop left behind is removed', () => {
  withRoot((root) => {
    const dir = leftover(root);
    const result = removeLegacyScreenCapture(root);
    assert.equal(result.removed, true);
    assert.equal(fs.existsSync(dir), false);
  });
});

test('a failed compile, with no grabber built, is removed too', () => {
  withRoot((root) => {
    const dir = leftover(root, { exe: false });
    assert.equal(removeLegacyScreenCapture(root).removed, true);
    assert.equal(fs.existsSync(dir), false);
  });
});

test('nothing to do when the folder does not exist', () => {
  withRoot((root) => {
    assert.deepEqual(removeLegacyScreenCapture(root), { removed: false, reason: 'absent' });
  });
});

test('a folder holding anything else is left entirely alone', () => {
  withRoot((root) => {
    const dir = leftover(root);
    fs.writeFileSync(path.join(dir, 'notes.txt'), 'mine');
    assert.equal(removeLegacyScreenCapture(root).removed, false);
    assert.deepEqual(fs.readdirSync(dir).sort(), ['app.manifest', 'notes.txt', 'screenCapture_1.3.2.bat', 'screenCapture_1.3.2.exe']);
  });
});

test('a subfolder inside it blocks the removal', () => {
  withRoot((root) => {
    const dir = leftover(root);
    fs.mkdirSync(path.join(dir, 'screenCapture_1.3.2.exe.d'));
    assert.equal(removeLegacyScreenCapture(root).removed, false);
    assert.equal(fs.existsSync(path.join(dir, 'screenCapture_1.3.2.bat')), true);
  });
});

test('a batch file that is not the screenshot-desktop one blocks the removal', () => {
  withRoot((root) => {
    const dir = leftover(root, { bat: '@echo off\r\necho hello\r\n' });
    assert.equal(removeLegacyScreenCapture(root).removed, false);
    assert.equal(fs.existsSync(path.join(dir, 'screenCapture_1.3.2.bat')), true);
  });
});

test('a lone manifest with no batch file or grabber is not recognised', () => {
  withRoot((root) => {
    const dir = leftover(root, { bat: null, exe: false });
    assert.equal(removeLegacyScreenCapture(root).removed, false);
    assert.equal(fs.existsSync(path.join(dir, 'app.manifest')), true);
  });
});

test('a linked folder is never followed', () => {
  withRoot((root) => {
    const real = path.join(root, 'elsewhere');
    fs.mkdirSync(real);
    fs.writeFileSync(path.join(real, 'screenCapture_1.3.2.bat'), BAT);
    fs.symlinkSync(real, path.join(root, 'screenCapture'), 'junction');
    assert.equal(removeLegacyScreenCapture(root).removed, false);
    assert.equal(fs.existsSync(path.join(real, 'screenCapture_1.3.2.bat')), true);
  });
});

test('a file it cannot delete never throws and is retried on the next start', () => {
  withRoot((root) => {
    const dir = leftover(root);
    const exe = path.join(dir, 'screenCapture_1.3.2.exe');
    const unlink = fs.unlinkSync;
    fs.unlinkSync = (target) => {
      if (target === exe) throw Object.assign(new Error('busy'), { code: 'EBUSY' });
      return unlink(target);
    };
    try {
      assert.equal(removeLegacyScreenCapture(root).removed, false);
    } finally {
      fs.unlinkSync = unlink;
    }
    assert.equal(fs.existsSync(exe), true);
    assert.equal(removeLegacyScreenCapture(root).removed, true);
    assert.equal(fs.existsSync(dir), false);
  });
});

test('no root means nothing is touched', () => {
  assert.equal(removeLegacyScreenCapture('').removed, false);
});
