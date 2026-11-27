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

// Steam's Game Mode runs no XDG autostart: where it is installed, a systemd user unit starts AW.
function sessionsFixture(names) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-sessions-'));
  for (const name of names) fs.writeFileSync(path.join(dir, name), '[Desktop Entry]\n');
  return dir;
}

test('a gamescope session installed means a systemd user unit, otherwise none', () => {
  const steamos = sessionsFixture(['gamescope-wayland.desktop', 'plasma.desktop']);
  const desktop = sessionsFixture(['plasma.desktop', 'ubuntu.desktop']);
  try {
    const unit = autostart.gameModeUnit({ sessionDirs: [steamos], env: {}, home: '/home/deck' });
    assert.deepEqual(unit, {
      file: path.join('/home/deck', '.config', 'systemd', 'user', 'io.github.shirowwww.achievement.watcher.service'),
      link: path.join('/home/deck', '.config', 'systemd', 'user', 'default.target.wants', 'io.github.shirowwww.achievement.watcher.service'),
    });
    assert.equal(autostart.gameModeUnit({ sessionDirs: [desktop, '/does/not/exist'] }), null);
  } finally {
    fs.rmSync(steamos, { recursive: true, force: true });
    fs.rmSync(desktop, { recursive: true, force: true });
  }
});

test('the unit starts AW at login and again after a start without a display', () => {
  const text = autostart.serviceUnit('/home/deck/AW.AppImage --hidden');
  assert.match(text, /^ExecStart=\/home\/deck\/AW\.AppImage --hidden$/m);
  assert.match(text, /^Restart=on-failure$/m);
  assert.match(text, /^WantedBy=default\.target$/m);
});

test('a path is quoted for systemd, which expands $ and % even inside quotes', () => {
  assert.equal(autostart.quoteUnitArg('/home/deck/Applications/AW Next.AppImage'), '"/home/deck/Applications/AW Next.AppImage"');
  assert.equal(autostart.quoteUnitArg('/home/deck/100%/a$b'), '/home/deck/100%%/a$$b');
  assert.equal(autostart.quoteUnitArg('say "hi"'), '"say \\"hi\\""');
});

test('switching it on in Game Mode links the unit instead of the XDG entry', { skip: process.platform === 'win32' && 'Linux-only' }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-unit-'));
  const file = path.join(dir, 'autostart', 'aw.desktop');
  const unit = { file: path.join(dir, 'systemd', 'user', 'aw.service'), link: path.join(dir, 'systemd', 'user', 'default.target.wants', 'aw.service') };
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, autostart.desktopEntry('/old/aw --hidden'));
    autostart.setEnabled(true, { file, unit, unitCommand: '/home/deck/AW.AppImage --hidden' });
    assert.equal(fs.existsSync(file), false, 'the XDG entry would start a second copy in the desktop');
    assert.match(fs.readFileSync(unit.file, 'utf8'), /^ExecStart=\/home\/deck\/AW\.AppImage --hidden$/m);
    assert.equal(fs.readFileSync(unit.link, 'utf8'), fs.readFileSync(unit.file, 'utf8'));
    assert.equal(autostart.isEnabled({ file, unit }), true);

    autostart.setEnabled(true, { file, unit, unitCommand: '/home/deck/AW-2.AppImage --hidden' });
    assert.match(fs.readFileSync(unit.link, 'utf8'), /AW-2\.AppImage/);

    // A relaunch through XWayland would end the process systemd watches, so the unit asks for X11.
    autostart.setEnabled(true, { file, unit, args: ['--hidden'] });
    assert.match(fs.readFileSync(unit.file, 'utf8'), /^ExecStart=\S+ --hidden --ozone-platform=x11$/m);

    autostart.setEnabled(false, { file, unit });
    assert.equal(fs.existsSync(unit.file) || fs.existsSync(unit.link), false);
    assert.equal(autostart.isEnabled({ file, unit }), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function tempUnit() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-unit-'));
  const unit = { file: path.join(dir, 'systemd', 'user', 'aw.service'), link: path.join(dir, 'systemd', 'user', 'default.target.wants', 'aw.service') };
  return { dir, unit, file: path.join(dir, 'autostart', 'aw.desktop') };
}

function recordingSystemctl(answer = true) {
  const calls = [];
  const systemctl = (args) => {
    calls.push(args.join(' '));
    return answer;
  };
  return { calls, systemctl };
}

// systemd keeps the unit it loaded, so a unit written with a new AppImage path is reloaded, once.
test('a changed unit is reloaded by systemd, an unchanged one is not', { skip: process.platform === 'win32' && 'Linux-only' }, () => {
  const { dir, unit, file } = tempUnit();
  const { calls, systemctl } = recordingSystemctl();
  try {
    autostart.setEnabled(true, { file, unit, unitCommand: '/home/deck/AW-20.AppImage --hidden', systemctl });
    autostart.setEnabled(true, { file, unit, unitCommand: '/home/deck/AW-20.AppImage --hidden', systemctl });
    autostart.setEnabled(true, { file, unit, unitCommand: '/home/deck/AW-25.AppImage --hidden', systemctl });
    assert.deepEqual(calls, ['daemon-reload', 'daemon-reload']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

/*
  An update under the unit (ROG Ally, 27/11/2026): AW's clean exit ended the unit and systemd killed the
  relaunch with it, and the unit still named the AppImage the update deleted. The unit now names the
  new file and systemd restarts it.
*/
test('after an update the unit names the new AppImage and is restarted by systemd', { skip: process.platform === 'win32' && 'Linux-only' }, () => {
  const { dir, unit } = tempUnit();
  const { calls, systemctl } = recordingSystemctl();
  try {
    assert.equal(autostart.restartUnitWith('/home/deck/Applications/AW-25.AppImage', { args: ['--hidden'], unit, systemctl }), true);
    assert.match(fs.readFileSync(unit.file, 'utf8'), /^ExecStart=\/home\/deck\/Applications\/AW-25\.AppImage --hidden --ozone-platform=x11$/m);
    assert.deepEqual(calls, ['daemon-reload', `--no-block restart ${autostart.UNIT_NAME}`]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('with no unit, or no systemd answer, the update falls back to its own relaunch', { skip: process.platform === 'win32' && 'Linux-only' }, () => {
  const none = recordingSystemctl();
  assert.equal(autostart.restartUnitWith('/home/deck/AW.AppImage', { unit: null, systemctl: none.systemctl }), false);
  assert.deepEqual(none.calls, []);

  const { dir, unit } = tempUnit();
  try {
    assert.equal(autostart.restartUnitWith('/home/deck/AW.AppImage', { unit, systemctl: recordingSystemctl(false).systemctl }), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('AW knows it runs as the unit from its own cgroup', () => {
  const ours = `0::/user.slice/user-1000.slice/user@1000.service/app.slice/${autostart.UNIT_NAME}`;
  assert.equal(autostart.runsAsUnit({ cgroup: () => `${ours}\n` }), true);
  assert.equal(autostart.runsAsUnit({ cgroup: () => '0::/user.slice/user-1000.slice/session-2.scope\n' }), false);
  assert.equal(autostart.runsAsUnit({ cgroup: () => '0::/user.slice/user-1000.slice/user@1000.service/app.slice/other.service' }), false);
  assert.equal(autostart.runsAsUnit({ cgroup: () => null }), false);
});

// init.js does not load outside Electron: the order of these steps is what keeps AW running.
test('an AppImage update asks the unit to restart before relaunching on its own', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'electron', 'init.js'), 'utf8');
  const start = src.indexOf('function installAppImageUpdate');
  const body = src.slice(start, src.indexOf('updater.quitAndInstall(true, false)', start));
  const unitAt = body.indexOf('autostart.runsAsUnit() && autostart.restartUnitWith(next');
  const relaunchAt = body.indexOf('launchAfterExit(next, { args })');
  assert.ok(start !== -1 && unitAt !== -1 && relaunchAt > unitAt);
});
