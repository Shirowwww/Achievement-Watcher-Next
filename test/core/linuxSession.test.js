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

test('an AppImage restarts through its own file, not the mount it runs from', () => {
  const result = run({ env: { ...wayland, APPIMAGE: '/home/p/AW.AppImage' }, execPath: '/tmp/.mount_aw/aw' });
  assert.equal(result.execPath, '/home/p/AW.AppImage');
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
