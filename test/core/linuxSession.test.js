'use strict';

// On a Wayland session AW restarts through XWayland so its popups can stay above X11 games.

const assert = require('node:assert/strict');
const test = require('node:test');

const { xwaylandRelaunch, xServerListening, X11_SWITCH } = require('../../app/util/linuxSession.js');

const wayland = { XDG_SESSION_TYPE: 'wayland', WAYLAND_DISPLAY: 'wayland-0', DISPLAY: ':0' };
const run = (overrides) =>
  xwaylandRelaunch({ platform: 'linux', env: wayland, argv: ['/opt/aw/aw', '--hidden'], execPath: '/opt/aw/aw', xServerUp: () => true, ...overrides });

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

test('a DISPLAY left behind by a session whose XWayland is gone keeps native Wayland', () => {
  assert.equal(run({ xServerUp: () => false }), null);
});

// /proc/net/unix as XWayland leaves it: a bound socket ends its line with the path, an abstract one with @path.
const bound = (...paths) => () => paths.map((p, i) => `000000000000000${i}: 00000002 00000000 00010000 0001 01 ${4000 + i} ${p}`).join('\n') + '\n';

test('an X display is up when a socket is bound in /tmp/.X11-unix or in the abstract namespace', () => {
  assert.equal(xServerListening(':0', { netUnix: bound('/tmp/.X11-unix/X0') }), true);
  assert.equal(xServerListening(':1.0', { netUnix: bound('@/tmp/.X11-unix/X1') }), true);
  assert.equal(xServerListening('unix:2', { netUnix: bound('/run/user/1000/bus', '/tmp/.X11-unix/X2') }), true);
  assert.equal(xServerListening(':1', { netUnix: bound('@/tmp/.X11-unix/X10', '/tmp/.X11-unix/X10') }), false);
});

test('a socket file left behind by a killed XWayland is not a server', () => {
  // Hyprland killed with its session leaves /tmp/.X11-unix/X0 on disk, but nothing has it bound.
  assert.equal(xServerListening(':0', { netUnix: bound('/run/user/1000/bus') }), false);
});

test('a display AW cannot check, remote or unreadable, is trusted as before', () => {
  assert.equal(xServerListening('localhost:10.0', { netUnix: bound() }), true);
  assert.equal(xServerListening(':0', { netUnix: () => null }), true);
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
