'use strict';

// Hands the daemon's resident memory back to Windows when it goes idle in the tray.
// SetProcessWorkingSetSizeEx(-1, -1) empties a process's working set on the spot (211 MB -> 6 MB
// measured on this app): clean pages go to the standby list for instant reuse, dirty ones flush out.
// A scalpel, not a habit - called once per idle transition (window/overlay released, game started),
// never on a timer, since repeated calls thrash a machine; the caller also enforces a floor between
// calls. Best effort throughout: any failure here just leaves the memory where it was.

const PROCESS_SET_QUOTA = 0x0100;
// -1 for both bounds is the documented "remove as many pages as possible" request.
const EMPTY = 0xffffffffffffffffn;

let api = null;
let apiFailed = false;

function loadApi() {
  if (api) return api;
  if (apiFailed) return null;
  try {
    const koffi = require('koffi');
    const kernel32 = koffi.load('kernel32.dll');
    api = {
      OpenProcess: kernel32.func('void* __stdcall OpenProcess(uint32 dwDesiredAccess, int bInheritHandle, uint32 dwProcessId)'),
      CloseHandle: kernel32.func('int __stdcall CloseHandle(void* hObject)'),
      SetProcessWorkingSetSizeEx: kernel32.func(
        'int __stdcall SetProcessWorkingSetSizeEx(void* hProcess, size_t dwMinimumWorkingSetSize, size_t dwMaximumWorkingSetSize, uint32 Flags)'
      ),
      GetCurrentProcess: kernel32.func('void* __stdcall GetCurrentProcess()'),
    };
    return api;
  } catch {
    apiFailed = true;
    api = null;
    return null;
  }
}

function trimHandle(fn, handle) {
  try {
    return fn(handle, EMPTY, EMPTY, 0) !== 0;
  } catch {
    return false;
  }
}

// Empties this process's working set plus every given pid (the app's own children: browser, GPU,
// network), openable because they share this session's user; anything else just fails and is skipped.
function trim(pids = []) {
  const win32 = loadApi();
  if (!win32) return 0;
  let trimmed = 0;

  // The pseudo-handle needs no OpenProcess and is always allowed on self.
  if (trimHandle(win32.SetProcessWorkingSetSizeEx, win32.GetCurrentProcess())) trimmed += 1;

  for (const value of pids) {
    const pid = Number(value);
    if (!Number.isInteger(pid) || pid <= 0 || pid === process.pid) continue;
    let handle = null;
    try {
      handle = win32.OpenProcess(PROCESS_SET_QUOTA, 0, pid);
      if (!handle) continue;
      if (trimHandle(win32.SetProcessWorkingSetSizeEx, handle)) trimmed += 1;
    } catch {
      /* the process exited between the caller's list and this call */
    } finally {
      if (handle) {
        try {
          win32.CloseHandle(handle);
        } catch {}
      }
    }
  }
  return trimmed;
}

function isAvailable() {
  return loadApi() !== null;
}

module.exports = { trim, isAvailable };
