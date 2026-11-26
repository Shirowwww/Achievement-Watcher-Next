'use strict';

const path = require('path');

/*
  What sits above the overlay window on Windows, for the log line written when it is shown. A report
  of "the overlay opens behind the game" cannot be told apart from "it never appeared" or "it was
  closed" without it. Window classes only, never titles: a title can carry a chat or a page name.
  koffi comes through the Watchdog, as in keyboardLayout.js. Null off Windows or on any failure.
*/
const GW_HWNDPREV = 3;
const GWL_EXSTYLE = -20;
const WS_EX_TOPMOST = 0x8;
const CLASS_CHARS = 128;
const MAX_LISTED = 4;
// A broken window chain must not spin the main process.
const MAX_WALK = 512;

const DWMWA_CLOAKED = 14;

function loadUser32(koffiPath) {
  const koffi = require(koffiPath);
  const lib = koffi.load('user32.dll');
  const dwm = koffi.load('dwmapi.dll');
  koffi.struct('AW_ZORDER_RECT', { left: 'long', top: 'long', right: 'long', bottom: 'long' });
  return {
    koffi,
    GetWindow: lib.func('void* __stdcall GetWindow(void* h, uint32_t cmd)'),
    IsWindowVisible: lib.func('bool __stdcall IsWindowVisible(void* h)'),
    GetClassNameW: lib.func('int __stdcall GetClassNameW(void* h, _Out_ uint16_t* buf, int max)'),
    GetWindowLongPtrW: lib.func('intptr_t __stdcall GetWindowLongPtrW(void* h, int idx)'),
    GetForegroundWindow: lib.func('void* __stdcall GetForegroundWindow()'),
    GetWindowRect: lib.func('bool __stdcall GetWindowRect(void* h, _Out_ AW_ZORDER_RECT* rect)'),
    DwmGetWindowAttribute: dwm.func('long __stdcall DwmGetWindowAttribute(void* h, uint32_t attribute, _Out_ int32_t* value, uint32_t size)'),
  };
}

function rectOf(api, hwnd) {
  if (!api.GetWindowRect) return null;
  const rect = {};
  return api.GetWindowRect(hwnd, rect) ? rect : null;
}

// Whether a visible window can hide the overlay: Windows keeps cloaked shell windows (CoreWindow,
// ImmersiveShell) high in the order without drawing them, and a window beside it hides nothing.
function canCover(api, hwnd, overlay) {
  if (api.DwmGetWindowAttribute) {
    const cloaked = [0];
    if (api.DwmGetWindowAttribute(hwnd, DWMWA_CLOAKED, cloaked, 4) === 0 && cloaked[0] !== 0) return false;
  }
  const rect = overlay && rectOf(api, hwnd);
  if (!rect) return true;
  return rect.right > rect.left && rect.bottom > rect.top && rect.left < overlay.right && rect.right > overlay.left && rect.top < overlay.bottom && rect.bottom > overlay.top;
}

function className(api, hwnd) {
  const buf = new Uint16Array(CLASS_CHARS);
  const n = api.GetClassNameW(hwnd, buf, CLASS_CHARS);
  return n > 0 ? Buffer.from(buf.buffer).toString('utf16le', 0, n * 2) : '?';
}

function isTopmost(api, hwnd) {
  return (Number(api.GetWindowLongPtrW(hwnd, GWL_EXSTYLE)) & WS_EX_TOPMOST) !== 0;
}

function label(api, hwnd) {
  return `${className(api, hwnd)}${isTopmost(api, hwnd) ? ' [topmost]' : ''}`;
}

/*
  `api` is the user32 surface above, injectable for tests. The returned function takes the overlay's
  getNativeWindowHandle() buffer and answers with one short text, or null when it cannot tell.
*/
function createZOrderProbe({ koffiPath = path.join(__dirname, '..', '..', 'watchdog', 'node_modules', 'koffi'), api = null } = {}) {
  let user32 = api;
  return (handleBuffer) => {
    if (process.platform !== 'win32' && !api) return null;
    try {
      if (!user32) user32 = loadUser32(koffiPath);
      const me = user32.koffi ? user32.koffi.decode(handleBuffer, 'void*') : handleBuffer;
      const foreground = user32.GetForegroundWindow();
      const above = [];
      let foregroundAbove = false;
      const overlay = rectOf(user32, me);
      let h = user32.GetWindow(me, GW_HWNDPREV);
      for (let i = 0; h && i < MAX_WALK; i += 1, h = user32.GetWindow(h, GW_HWNDPREV)) {
        if (!user32.IsWindowVisible(h) || !canCover(user32, h, overlay)) continue;
        if (foreground && sameWindow(user32, h, foreground)) foregroundAbove = true;
        above.push(label(user32, h));
      }
      const listed = above.slice(0, MAX_LISTED).join(' | ') || 'none';
      const more = above.length > MAX_LISTED ? ` (+${above.length - MAX_LISTED})` : '';
      const fg = foreground ? (sameWindow(user32, foreground, me) ? 'the overlay' : label(user32, foreground)) : 'none';
      return `overlay ${isTopmost(user32, me) ? 'topmost' : 'NOT topmost'}; above it: ${listed}${more}; foreground: ${fg}${foregroundAbove ? ' (ABOVE the overlay)' : ''}`;
    } catch {
      return null;
    }
  };
}

// koffi hands back a fresh pointer object per call, so two handles compare by address.
function sameWindow(api, a, b) {
  if (a === b) return true;
  if (!api.koffi) return false;
  return api.koffi.address(a) === api.koffi.address(b);
}

module.exports = { createZOrderProbe };
