'use strict';

/*
  regodit wraps a Go DLL. When a process exits on its own (no process.exit), Windows unloads that
  DLL while the Go runtime's threads are still running, and the process dies with 0xC0000005 on its
  way out - measured at over half of all natural exits under load. Pinning the module keeps it
  mapped until the process is gone, which removes the crash entirely.

  regodit is ESM-only, so it is still loaded lazily through dynamic import().
*/

const path = require('path');

const GET_MODULE_HANDLE_EX_FLAG_PIN = 0x1;

let regoditPromise = null;

function regoditDllPath() {
  const entry = require.resolve('regodit');
  const arch = { ia32: 'x86' }[process.arch] || process.arch;
  return path.join(path.dirname(entry), '..', 'dist', `regodit.${arch}.dll`).replace('app.asar', 'app.asar.unpacked');
}

function pinModule(file) {
  const koffi = require('koffi');
  const kernel32 = koffi.load('kernel32.dll');
  const GetModuleHandleExW = kernel32.func('bool __stdcall GetModuleHandleExW(uint32 flags, str16 name, _Out_ void **handle)');
  return GetModuleHandleExW(GET_MODULE_HANDLE_EX_FLAG_PIN, file, [null]);
}

function loadRegodit() {
  if (!regoditPromise) {
    regoditPromise = import('regodit').then((regodit) => {
      try {
        pinModule(regoditDllPath());
      } catch {
        /* not pinned: the process may still crash on a natural exit, but the API works */
      }
      return regodit;
    });
  }
  return regoditPromise;
}

module.exports = { loadRegodit, regoditDllPath, pinModule };
