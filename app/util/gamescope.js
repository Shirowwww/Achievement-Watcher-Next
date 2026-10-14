'use strict';

/*
  Steam's Game Mode (Steam Deck, SteamOS and similar sessions) is gamescope: it shows the game Steam
  focuses and nothing else, so AW's notification and overlay windows would stay hidden behind it.
  A window carrying GAMESCOPE_EXTERNAL_OVERLAY is composited above the game without taking focus or
  input, as MangoHud's mangoapp is; gamescope draws it from the top-left corner of the screen,
  whatever its position. gamescope is told apart by GAMESCOPE_FOCUSABLE_APPS, which it alone interns.
  libX11 comes through the Watchdog's koffi: the app has no native module of its own.
*/

const XA_CARDINAL = 6;
const PROP_MODE_REPLACE = 0;

function loadXlib(koffiPath) {
  const koffi = require(koffiPath);
  const lib = koffi.load('libX11.so.6');
  return {
    openDisplay: lib.func('void *XOpenDisplay(const char *name)'),
    internAtom: lib.func('unsigned long XInternAtom(void *display, const char *name, int onlyIfExists)'),
    // Format 32 data is an array of C longs, whatever the width of the values.
    changeProperty: lib.func(
      'int XChangeProperty(void *display, unsigned long window, unsigned long property, unsigned long type, int format, int mode, const unsigned long *data, int count)'
    ),
    flush: lib.func('int XFlush(void *display)'),
  };
}

// The X11 window id behind a BrowserWindow: Electron hands it over as a native-endian buffer.
function windowId(handle) {
  if (!Buffer.isBuffer(handle)) return 0;
  if (handle.length >= 8) return Number(handle.readBigUInt64LE(0));
  if (handle.length >= 4) return handle.readUInt32LE(0);
  return 0;
}

/*
  One connection for the life of the process, opened on first use. `available` is false off Linux,
  without an X display, or when that display is not gamescope's; nothing is marked then.
*/
function createGamescope({ platform = process.platform, env = process.env, koffiPath = 'koffi', load = loadXlib, log = () => {} } = {}) {
  let state = null;

  function connect() {
    if (state) return state;
    state = { available: false };
    if (platform !== 'linux' || !env.DISPLAY) return state;
    try {
      const x = load(koffiPath);
      const display = x.openDisplay(env.DISPLAY);
      if (!display) return state;
      if (!x.internAtom(display, 'GAMESCOPE_FOCUSABLE_APPS', 1)) return state;
      state = { available: true, x, display, overlayAtom: x.internAtom(display, 'GAMESCOPE_EXTERNAL_OVERLAY', 0) };
      log(`[gamescope] Game Mode compositor found on ${env.DISPLAY}`);
    } catch (err) {
      log(`[gamescope] X11 unavailable: ${err.message || err}`);
    }
    return state;
  }

  function isActive() {
    return connect().available;
  }

  // Marks a BrowserWindow so gamescope draws it above the game. Returns whether it was marked.
  function showAboveGame(win) {
    const { available, x, display, overlayAtom } = connect();
    if (!available || !win || win.isDestroyed()) return false;
    const id = windowId(win.getNativeWindowHandle());
    if (!id) return false;
    x.changeProperty(display, id, overlayAtom, XA_CARDINAL, 32, PROP_MODE_REPLACE, [1], 1);
    x.flush(display);
    return true;
  }

  return { isActive, showAboveGame };
}

module.exports = { createGamescope, windowId };
