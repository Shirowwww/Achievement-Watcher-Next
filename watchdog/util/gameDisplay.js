'use strict';

/*
  Which display the game in front is on, so its popup appears there rather than wherever the cursor
  was left. The point is read in physical pixels (the calling thread is switched to per-monitor DPI
  awareness for the call), which the app turns into its own DIP coordinates.
*/

const SM_CMONITORS = 80;
const MONITOR_DEFAULTTONEAREST = 2;
const DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2 = -4;

let api = null;
let apiFailed = false;

function loadApi() {
  if (api) return api;
  if (apiFailed) return null;
  try {
    const koffi = require('koffi');
    const user32 = koffi.load('user32.dll');
    koffi.struct('AW_DISPLAY_RECT', { left: 'int32', top: 'int32', right: 'int32', bottom: 'int32' });
    const MONITORINFO = koffi.struct('AW_DISPLAY_MONITORINFO', {
      cbSize: 'uint32',
      rcMonitor: 'AW_DISPLAY_RECT',
      rcWork: 'AW_DISPLAY_RECT',
      dwFlags: 'uint32',
    });
    api = {
      infoSize: koffi.sizeof(MONITORINFO),
      GetSystemMetrics: user32.func('int __stdcall GetSystemMetrics(int index)'),
      GetForegroundWindow: user32.func('void* __stdcall GetForegroundWindow()'),
      MonitorFromWindow: user32.func('void* __stdcall MonitorFromWindow(void* hwnd, uint32 flags)'),
      GetMonitorInfoW: user32.func('int __stdcall GetMonitorInfoW(void* monitor, _Inout_ AW_DISPLAY_MONITORINFO* info)'),
      SetThreadDpiAwarenessContext: user32.func('intptr_t __stdcall SetThreadDpiAwarenessContext(intptr_t context)'),
    };
    return api;
  } catch {
    apiFailed = true;
    return null;
  }
}

function emptyRect() {
  return { left: 0, top: 0, right: 0, bottom: 0 };
}

function readForegroundCenter(native) {
  const window = native.GetForegroundWindow();
  if (!window) return null;
  const info = { cbSize: native.infoSize, rcMonitor: emptyRect(), rcWork: emptyRect(), dwFlags: 0 };
  if (!native.GetMonitorInfoW(native.MonitorFromWindow(window, MONITOR_DEFAULTTONEAREST), info)) return null;
  const rect = info.rcMonitor;
  return { x: Math.round((rect.left + rect.right) / 2), y: Math.round((rect.top + rect.bottom) / 2) };
}

// The centre of the display holding the foreground window, or null with a single display (nothing
// to choose) or when it cannot be read.
function gameDisplayCenter(native = loadApi()) {
  if (process.platform !== 'win32' || !native) return null;
  try {
    if (native.GetSystemMetrics(SM_CMONITORS) < 2) return null;
    const previous = native.SetThreadDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
    // Windows 10 before 1703 refuses this context, and a point read without it is in scaled pixels.
    if (!previous) return null;
    try {
      return readForegroundCenter(native);
    } finally {
      native.SetThreadDpiAwarenessContext(previous);
    }
  } catch {
    return null;
  }
}

module.exports = { gameDisplayCenter };
