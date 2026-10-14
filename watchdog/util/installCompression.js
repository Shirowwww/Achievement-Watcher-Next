'use strict';

// Under Electron, `fs` lists app.asar as a folder and walks into the archive; this needs the file.
const fs = process.versions.electron ? require('original-fs') : require('fs');
const path = require('path');

/*
  Windows' executable compression (WOF, what CompactOS applies to the system files) on AW Next's own
  installation folder. Measured on 3.11.3: 426 MB on disk becomes 216 MB and reads back
  transparently; on an SSD an uncached read of the whole 235 MB executable went from 90 ms to about
  150 ms.

  Setup compresses what it installs (AwSetupUi::Compress, native/setup-ui/src/compress.rs). This is
  the same file system control for what setup never touches: the portable archive, extracted by
  hand, and any file that was busy during setup. It works on the running executable and its loaded
  DLLs. A file already compressed is recognised through its own handle and skipped, so on an
  installed copy a start costs one cheap query per file.
*/

const FSCTL_GET_EXTERNAL_BACKING = 0x90310;
const FSCTL_SET_EXTERNAL_BACKING = 0x9030c;
const ERROR_OBJECT_NOT_EXTERNALLY_BACKED = 342;
const GENERIC_READ = 0x80000000;
const FILE_SHARE_ALL = 0x7;
const OPEN_EXISTING = 3;
const INVALID_HANDLE = 0xffffffffffffffffn;
const INVALID_FILE_SIZE = 0xffffffff;
// XPRESS16K rather than LZX: LZX saves 44 MB more but takes seven times longer to compress.
const FILE_PROVIDER_COMPRESSION_XPRESS16K = 3;
// A file this small takes one cluster compressed or not.
const MIN_BYTES = 8192;
// The folders electron-builder lays out. A portable copy keeps its live data beside them, untouched.
const INSTALL_SUBDIRS = ['locales', 'resources', 'watchdog'];

let api = null;

function loadApi() {
  if (api) return api;
  const koffi = require('koffi');
  const kernel32 = koffi.load('kernel32.dll');
  api = {
    koffi,
    CreateFileW: kernel32.func(
      'void* __stdcall CreateFileW(str16 name, uint32 access, uint32 share, void* security, uint32 disposition, uint32 flags, void* template)'
    ),
    CloseHandle: kernel32.func('int __stdcall CloseHandle(void* handle)'),
    GetLastError: kernel32.func('uint32 __stdcall GetLastError()'),
    DeviceIoControl: kernel32.func(
      'int __stdcall DeviceIoControl(void* handle, uint32 code, void* input, uint32 inputSize, void* output, uint32 outputSize, _Out_ uint32* returned, void* overlapped)'
    ),
    GetCompressedFileSizeW: kernel32.func('uint32 __stdcall GetCompressedFileSizeW(str16 name, _Out_ uint32* high)'),
  };
  return api;
}

// WOF_EXTERNAL_INFO { Version 1, Provider WOF_PROVIDER_FILE } then FILE_PROVIDER_EXTERNAL_INFO_V1
// { Version 1, Algorithm, Flags 0 }.
function backingRequest() {
  const request = Buffer.alloc(20);
  request.writeUInt32LE(1, 0);
  request.writeUInt32LE(2, 4);
  request.writeUInt32LE(1, 8);
  request.writeUInt32LE(FILE_PROVIDER_COMPRESSION_XPRESS16K, 12);
  return request;
}

// Bytes the file occupies on disk, or null when Windows cannot say right now.
function sizeOnDisk(file) {
  const high = [0];
  const low = loadApi().GetCompressedFileSizeW(file, high);
  if (low === INVALID_FILE_SIZE && high[0] === 0) return null;
  return high[0] * 2 ** 32 + low;
}

function openFile(file) {
  const { koffi, CreateFileW } = loadApi();
  const handle = CreateFileW(file, GENERIC_READ, FILE_SHARE_ALL, null, OPEN_EXISTING, 0, null);
  return koffi.address(handle) === INVALID_HANDLE ? null : handle;
}

// 'compressed', 'plain', or 'unsupported' when the volume has no WOF (FAT32, exFAT, network shares).
function backingState(handle) {
  const { DeviceIoControl, GetLastError } = loadApi();
  if (DeviceIoControl(handle, FSCTL_GET_EXTERNAL_BACKING, null, 0, Buffer.alloc(64), 64, [0], null)) return 'compressed';
  return GetLastError() === ERROR_OBJECT_NOT_EXTERNALLY_BACKED ? 'plain' : 'unsupported';
}

// Off the event loop: compressing the 235 MB executable alone takes a few hundred milliseconds.
function compress(handle, request) {
  return new Promise((resolve) => {
    loadApi().DeviceIoControl.async(handle, FSCTL_SET_EXTERNAL_BACKING, request, request.length, null, 0, [0], null, (err, ok) => resolve(!err && !!ok));
  });
}

function collectFiles(dir, files) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collectFiles(full, files);
    else if (entry.isFile()) files.push(full);
  }
}

function installFiles(installDir) {
  const files = [];
  for (const entry of fs.readdirSync(installDir, { withFileTypes: true })) {
    if (entry.isFile()) files.push(path.join(installDir, entry.name));
  }
  for (const sub of INSTALL_SUBDIRS) collectFiles(path.join(installDir, sub), files);
  return files;
}

/*
  Compresses whatever is not compressed yet. Returns null for a development run, which has no
  app.asar beside its executable, otherwise what was done. `failed` counts files WOF refused, mostly
  ones that would not shrink (archives, already-compressed pictures).
*/
async function compressInstallation({ installDir }) {
  if (!fs.existsSync(path.join(installDir, 'resources', 'app.asar'))) return null;

  const request = backingRequest();
  const result = { files: 0, failed: 0, before: 0, after: 0 };
  for (const file of installFiles(installDir)) {
    let logical;
    try {
      logical = fs.statSync(file).size;
    } catch {
      continue;
    }
    if (logical < MIN_BYTES) continue;
    const handle = openFile(file);
    if (!handle) continue;
    try {
      const state = backingState(handle);
      if (state === 'unsupported') break;
      if (state === 'compressed') continue;
      if (await compress(handle, request)) {
        result.files++;
        result.before += logical;
        result.after += sizeOnDisk(file) ?? logical;
      } else {
        result.failed++;
      }
    } finally {
      loadApi().CloseHandle(handle);
    }
  }
  return result;
}

module.exports = { compressInstallation, sizeOnDisk };
