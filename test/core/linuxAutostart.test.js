'use strict';

// "Start with the session" on Linux is an XDG autostart entry that relaunches AW hidden.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const autostart = require('../../app/util/linuxAutostart.js');

test('the entry lives in the XDG config folder', () => {
  assert.equal(
    autostart.autostartFile({ env: {}, home: '/home/p' }),
    path.join('/home/p', '.config', 'autostart', 'io.github.shirowwww.achievement.watcher.desktop')
  );
  assert.equal(
    autostart.autostartFile({ env: { XDG_CONFIG_HOME: '/cfg' }, home: '/home/p' }),
    path.join('/cfg', 'autostart', 'io.github.shirowwww.achievement.watcher.desktop')
  );
});

test('an AppImage is relaunched through its own file, with reserved characters quoted', () => {
  assert.equal(autostart.launchCommand({ env: { APPIMAGE: '/opt/Apps/AW Next.AppImage' }, execPath: '/tmp/.mount_x/aw', args: ['--hidden'] }), '"/opt/Apps/AW Next.AppImage" --hidden');
  assert.equal(autostart.launchCommand({ env: {}, execPath: '/usr/bin/aw', args: ['--hidden'] }), '/usr/bin/aw --hidden');
  assert.equal(autostart.quoteExecArg('a"b$c'), '"a\\"b\\$c"');
});

test('switching it on writes the entry, off removes it, and a desktop-side opt-out counts as off', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-autostart-'));
  const file = path.join(dir, 'autostart', 'aw.desktop');
  try {
    assert.equal(autostart.isEnabled({ file }), false);
    autostart.setEnabled(true, { file, command: '/usr/bin/aw --hidden' });
    assert.match(fs.readFileSync(file, 'utf8'), /^Exec=\/usr\/bin\/aw --hidden$/m);
    assert.equal(autostart.isEnabled({ file }), true);

    fs.appendFileSync(file, 'Hidden=true\n');
    assert.equal(autostart.isEnabled({ file }), false);

    autostart.setEnabled(false, { file });
    assert.equal(fs.existsSync(file), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
