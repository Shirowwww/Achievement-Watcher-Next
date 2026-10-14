'use strict';

// On a Wayland session AW restarts through XWayland so its popups can stay above X11 games.

const assert = require('node:assert/strict');
const test = require('node:test');

const { xwaylandRelaunch, X11_SWITCH } = require('../../app/util/linuxSession.js');

const wayland = { XDG_SESSION_TYPE: 'wayland', WAYLAND_DISPLAY: 'wayland-0', DISPLAY: ':0' };
const run = (overrides) => xwaylandRelaunch({ platform: 'linux', env: wayland, argv: ['/opt/aw/aw', '--hidden'], execPath: '/opt/aw/aw', ...overrides });

test('a Wayland session restarts with the same arguments plus the X11 switch', () => {
  assert.deepEqual(run(), { execPath: '/opt/aw/aw', args: ['--hidden', X11_SWITCH] });
});

test('an AppImage restarts the binary of its current mount, not the file that would mount it again', () => {
  const result = run({ env: { ...wayland, APPIMAGE: '/home/p/AW.AppImage' }, execPath: '/tmp/.mount_aw/aw' });
  assert.equal(result.execPath, '/tmp/.mount_aw/aw');
});

test('nothing restarts on Windows, on an X11 session or without XWayland', () => {
  assert.equal(run({ platform: 'win32' }), null);
  assert.equal(run({ env: { ...wayland, XDG_SESSION_TYPE: 'x11' } }), null);
  assert.equal(run({ env: { XDG_SESSION_TYPE: 'wayland', WAYLAND_DISPLAY: 'wayland-0' } }), null);
});

test('a platform chosen on the command line is kept, which also stops a restart loop', () => {
  assert.equal(run({ argv: ['/opt/aw/aw', X11_SWITCH] }), null);
  assert.equal(run({ argv: ['/opt/aw/aw', '--ozone-platform=wayland'] }), null);
  assert.equal(run({ argv: ['/opt/aw/aw', '--ozone-platform-hint=auto'] }), null);
});

test('a shortcut press forwarded to the running copy is not restarted first', () => {
  assert.equal(run({ argv: ['/opt/aw/aw', '--toggle-overlay'] }), null);
});

// Started by its systemd unit in Steam's Game Mode, AW takes the display the Steam client runs on.
const { adoptSteamDisplay } = require('../../app/util/linuxSession.js');

const steamEnviron = ['HOME=/home/deck', 'DISPLAY=:0', 'XAUTHORITY=/run/user/1000/xauth_x', 'SteamAppId=769'].join('\0');
const adopt = (env, overrides) =>
  adoptSteamDisplay({ platform: 'linux', env, steamPid: () => 4242, environOf: () => steamEnviron, exists: () => true, ...overrides });

test("without a display AW takes the Steam client's X display and its authority file", () => {
  const env = {};
  assert.equal(adopt(env), true);
  assert.deepEqual(env, { DISPLAY: ':0', XAUTHORITY: '/run/user/1000/xauth_x' });
});

test('an authority file that only exists in a Flatpak sandbox is left out', () => {
  const env = {};
  adopt(env, { exists: () => false });
  assert.deepEqual(env, { DISPLAY: ':0' });
});

test('a session that has a display keeps it, and Windows is left alone', () => {
  const x11 = { DISPLAY: ':1' };
  assert.equal(adopt(x11), true);
  assert.deepEqual(x11, { DISPLAY: ':1' });
  const wayland = { WAYLAND_DISPLAY: 'wayland-0' };
  assert.equal(adopt(wayland), true);
  assert.deepEqual(wayland, { WAYLAND_DISPLAY: 'wayland-0' });
  const windows = {};
  assert.equal(adopt(windows, { platform: 'win32' }), true);
  assert.deepEqual(windows, {});
});

test('without Steam running, or a Steam without a display, there is nothing to run on', () => {
  assert.equal(adopt({}, { steamPid: () => 0 }), false);
  assert.equal(adopt({}, { environOf: () => 'HOME=/home/deck' }), false);
});
