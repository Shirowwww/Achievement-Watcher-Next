'use strict';

// Native process enumeration through koffi, replacing a `tasklist.exe` spawn. The playtime monitor
// polls every 3s for the daemon's whole life, so each poll first asks K32EnumProcesses (~0.03 ms)
// whether the process table moved at all. On a busy desktop it moves between almost every poll, so
// a moved table is updated from the processes that started (~0.2 ms), and read in full in one
// NtQuerySystemInformation call (~5 ms) only as a periodic safety net. koffi is already the
// Watchdog's FFI backend, so this adds no dependency; a load failure just falls back to win-tasklist.

const MAX_PATH = 260;
const TH32CS_SNAPPROCESS = 0x00000002;
const PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;
const SYSTEM_PROCESS_INFORMATION = 5;
const SYSTEM_PROCESS_ID_INFORMATION = 88;
const STATUS_INFO_LENGTH_MISMATCH = -1073741820; // 0xC0000004
const STATUS_INVALID_CID = -1073741811; // 0xC000000B: no process has this id
const MAX_PIDS = 16384;
// What ToolHelp calls pid 0, which the system query leaves unnamed.
const IDLE_PROCESS_NAME = '[System Process]';
// A safety net on top of the change test below: an unchanged table is still read in full this often.
const MAX_LIST_AGE_MS = 30 * 1000;

// SYSTEM_PROCESS_INFORMATION on x64: the fields read here and where they sit in each entry.
const ENTRY = { next: 0x00, createTime: 0x20, nameLength: 0x38, nameBuffer: 0x40, pid: 0x50 };
// SYSTEM_PROCESS_ID_INFORMATION on x64: a pid, then a UNICODE_STRING pointing at the caller's buffer.
const ID_INFO = { pid: 0x00, length: 0x08, maximumLength: 0x0a, buffer: 0x10, size: 0x18 };
const ID_NAME_BYTES = 2048;

let api = null;
let apiFailed = false;

function loadApi() {
  if (api) return api;
  if (apiFailed) return null;
  try {
    const koffi = require('koffi');
    const kernel32 = koffi.load('kernel32.dll');

    const PROCESSENTRY32W = koffi.struct('AW_PROCESSENTRY32W', {
      dwSize: 'uint32',
      cntUsage: 'uint32',
      th32ProcessID: 'uint32',
      th32DefaultHeapID: 'uintptr_t',
      th32ModuleID: 'uint32',
      cntThreads: 'uint32',
      th32ParentProcessID: 'uint32',
      pcPriClassBase: 'int32',
      dwFlags: 'uint32',
      szExeFile: koffi.array('char16', MAX_PATH, 'String'),
    });

    api = {
      koffi,
      entrySize: koffi.sizeof(PROCESSENTRY32W),
      CreateToolhelp32Snapshot: kernel32.func('void* __stdcall CreateToolhelp32Snapshot(uint32 dwFlags, uint32 th32ProcessID)'),
      Process32FirstW: kernel32.func('int __stdcall Process32FirstW(void* hSnapshot, _Inout_ AW_PROCESSENTRY32W* lppe)'),
      Process32NextW: kernel32.func('int __stdcall Process32NextW(void* hSnapshot, _Inout_ AW_PROCESSENTRY32W* lppe)'),
      CloseHandle: kernel32.func('int __stdcall CloseHandle(void* hObject)'),
      OpenProcess: kernel32.func('void* __stdcall OpenProcess(uint32 dwDesiredAccess, int bInheritHandle, uint32 dwProcessId)'),
      QueryFullProcessImageNameW: kernel32.func(
        'int __stdcall QueryFullProcessImageNameW(void* hProcess, uint32 dwFlags, _Out_ char16* lpExeName, _Inout_ uint32* lpdwSize)'
      ),
    };
    api.fast = loadFastApi(koffi, kernel32);
    return api;
  } catch {
    apiFailed = true;
    api = null;
    return null;
  }
}

// The one-call list and its change test. Optional: without them every poll reads through ToolHelp.
function loadFastApi(koffi, kernel32) {
  try {
    const ntdll = koffi.load('ntdll.dll');
    return {
      GetProcessTimes: kernel32.func(
        'int __stdcall GetProcessTimes(void* hProcess, _Out_ uint64_t* creation, _Out_ uint64_t* exit, _Out_ uint64_t* kernel, _Out_ uint64_t* user)'
      ),
      K32EnumProcesses: kernel32.func('int __stdcall K32EnumProcesses(_Out_ uint32_t* pids, uint32 cb, _Out_ uint32* bytesReturned)'),
      // The buffer is passed as a raw pointer so the kernel writes the names into it, not into a copy.
      NtQuerySystemInformation: ntdll.func('int32 __stdcall NtQuerySystemInformation(int32 infoClass, void* info, uint32 length, _Out_ uint32* returned)'),
    };
  } catch {
    return null;
  }
}

function isAvailable() {
  return loadApi() !== null;
}

// Reused across polls: the struct is written by the kernel on every Process32NextW call, so a single
// object is enough and keeps the poll allocation-free apart from the returned rows.
function newEntry(size) {
  return {
    dwSize: size,
    cntUsage: 0,
    th32ProcessID: 0,
    th32DefaultHeapID: 0,
    th32ModuleID: 0,
    cntThreads: 0,
    th32ParentProcessID: 0,
    pcPriClassBase: 0,
    dwFlags: 0,
    szExeFile: '',
  };
}

// Snapshot of every process as `{ process, pid }`, one koffi call per row. Kept as the fallback for
// the system query below and as the reference its test compares against.
function listToolHelpSync() {
  const win32 = loadApi();
  if (!win32) throw new Error('koffi process snapshot unavailable');

  const handle = win32.CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
  // INVALID_HANDLE_VALUE comes back as a null-ish pointer through koffi.
  if (!handle) throw new Error('CreateToolhelp32Snapshot failed');

  const processes = [];
  try {
    const entry = newEntry(win32.entrySize);
    let ok = win32.Process32FirstW(handle, entry);
    while (ok) {
      const name = entry.szExeFile;
      if (name) processes.push({ process: name, pid: entry.th32ProcessID });
      ok = win32.Process32NextW(handle, entry);
    }
  } finally {
    win32.CloseHandle(handle);
  }
  return processes;
}

let queryBuffer = null;

// Every process from one system call, with the pid list in kernel order and the newest process's
// creation time; null when the call is refused.
function querySystemProcesses(win32) {
  const { NtQuerySystemInformation } = win32.fast;
  if (!queryBuffer) queryBuffer = Buffer.alloc(1024 * 1024);
  const returned = [0];
  let status = NtQuerySystemInformation(SYSTEM_PROCESS_INFORMATION, queryBuffer, queryBuffer.length, returned);
  for (let tries = 0; status === STATUS_INFO_LENGTH_MISMATCH && tries < 4; tries++) {
    queryBuffer = Buffer.alloc(Math.max(queryBuffer.length * 2, returned[0] + 64 * 1024));
    status = NtQuerySystemInformation(SYSTEM_PROCESS_INFORMATION, queryBuffer, queryBuffer.length, returned);
  }
  if (status !== 0) return null;

  const buffer = queryBuffer;
  const base = win32.koffi.address(buffer);
  const rows = [];
  const pids = [];
  let newestCreated = null;
  let offset = 0;
  for (;;) {
    const pid = Number(buffer.readBigUInt64LE(offset + ENTRY.pid));
    const nameLength = buffer.readUInt16LE(offset + ENTRY.nameLength);
    let name = pid === 0 ? IDLE_PROCESS_NAME : '';
    if (nameLength > 0) {
      const start = Number(buffer.readBigUInt64LE(offset + ENTRY.nameBuffer) - base);
      if (start < 0 || start + nameLength > buffer.length) return null;
      name = buffer.toString('utf16le', start, start + nameLength);
    }
    if (name) rows.push({ process: name, pid });
    pids.push(pid);
    newestCreated = buffer.readBigUInt64LE(offset + ENTRY.createTime);
    const next = buffer.readUInt32LE(offset + ENTRY.next);
    if (!next) break;
    offset += next;
  }
  return { rows, pids, newestCreated };
}

const pidBuffer = new Uint32Array(MAX_PIDS);

// The pids in the kernel's process list order, which is creation order; null when it cannot be read.
function enumeratePids(win32) {
  const returned = [0];
  if (!win32.fast.K32EnumProcesses(pidBuffer, pidBuffer.byteLength, returned)) return null;
  if (returned[0] >= pidBuffer.byteLength) return null; // possibly truncated
  return pidBuffer.subarray(0, returned[0] / 4);
}

function creationTimeOf(win32, pid) {
  if (!pid) return null;
  let handle;
  try {
    handle = win32.OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
  } catch {
    return null;
  }
  if (!handle) return null;
  try {
    const creation = [0];
    if (!win32.fast.GetProcessTimes(handle, creation, [0], [0], [0])) return null;
    return BigInt(creation[0]);
  } catch {
    return null;
  } finally {
    try {
      win32.CloseHandle(handle);
    } catch {}
  }
}

/*
  A new process is appended to the kernel's list, so if any process ended or started, either the
  pid list changes or its last entry is a new process that took the last pid back: its creation
  time then differs. An identical list with the same newest process means nothing changed.
*/
function canReuseList(previous, pids, newestCreated, now) {
  if (!previous || !pids || newestCreated === null || newestCreated === undefined) return false;
  if (now - previous.at > MAX_LIST_AGE_MS) return false;
  if (previous.newestCreated !== newestCreated || previous.pids.length !== pids.length) return false;
  for (let i = 0; i < pids.length; i++) if (previous.pids[i] !== pids[i]) return false;
  return true;
}

let idInfo = null;
let idName = null;

// The image name of one process, read without opening it: '' when the system does not say, null
// when the process no longer exists.
function imageNameOf(win32, pid) {
  if (!idInfo) {
    idInfo = Buffer.alloc(ID_INFO.size);
    idName = Buffer.alloc(ID_NAME_BYTES);
  }
  idInfo.fill(0);
  idInfo.writeBigUInt64LE(BigInt(pid), ID_INFO.pid);
  idInfo.writeUInt16LE(idName.length, ID_INFO.maximumLength);
  idInfo.writeBigUInt64LE(BigInt(win32.koffi.address(idName)), ID_INFO.buffer);
  const status = win32.fast.NtQuerySystemInformation(SYSTEM_PROCESS_ID_INFORMATION, idInfo, idInfo.length, [0]);
  if (status === STATUS_INVALID_CID) return null;
  if (status !== 0) return '';
  const image = idName.toString('utf16le', 0, idInfo.readUInt16LE(ID_INFO.length));
  return image.slice(image.lastIndexOf('\\') + 1);
}

/*
  The kernel keeps processes in creation order, so the ones started since the last read are the tail
  of the pid list. A binary search on creation time finds where that tail starts (about ten queries
  for 500 processes) and only those processes are named, one query each. A process whose creation
  time cannot be read counts as new: near the tail it is one that just ended, and a new process is
  named anyway, so the worst case is naming a few more. Every pid before the tail must be one the last
  read listed, in the same order; anything else (a name refused, a race with a process being created)
  returns null and the caller reads the whole table instead.
*/
function updateList(previous, pids, newestCreated, { createdAt, nameOf }) {
  const threshold = previous && previous.newestCreated;
  if (newestCreated === null || newestCreated === undefined || threshold === null || threshold === undefined) return null;
  const isNew = (index) => {
    const created = createdAt(pids[index]);
    return created === null || created === undefined || created > threshold;
  };
  let first = pids.length;
  if (newestCreated > threshold) {
    // A poll usually finds one to three new processes: gallop back from the end, then bisect.
    let hi = pids.length - 1;
    let lo = 0;
    for (let step = 1; hi - step >= 0; step *= 2) {
      if (!isNew(hi - step)) {
        lo = hi - step + 1;
        break;
      }
      hi -= step;
    }
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (isNew(mid)) hi = mid;
      else lo = mid + 1;
    }
    first = hi;
  }
  if (!previous.rowByPid) previous.rowByPid = new Map(previous.rows.map((row) => [row.pid, row]));
  const rows = [];
  let seen = 0;
  for (let i = 0; i < first; i++) {
    while (seen < previous.pids.length && previous.pids[seen] !== pids[i]) seen++;
    if (seen === previous.pids.length) return null;
    seen++;
    const row = previous.rowByPid.get(pids[i]);
    if (row) rows.push(row);
  }
  for (let i = first; i < pids.length; i++) {
    const name = nameOf(pids[i]);
    if (name === null) continue; // ended since the pid list was read
    if (!name) return null;
    rows.push({ process: name, pid: pids[i] });
  }
  return { pids: Array.from(pids), newestCreated, rows, at: previous.at };
}

let lastList = null;
// How the last listSync() answered: 'reused', 'updated', 'full' or 'toolhelp'. A quiet slide back
// to full reads on every poll is a 25x cost nothing else would show.
let lastRead = '';

// Every process as `{ process, pid }`. `filepath` is deliberately NOT resolved here: it needs one
// OpenProcess per row, and the only caller that wants it (the playtime monitor) wants it for newly
// created processes only - a handful per poll instead of ~460.
function listSync() {
  const win32 = loadApi();
  if (!win32) throw new Error('koffi process snapshot unavailable');
  if (!win32.fast) {
    lastRead = 'toolhelp';
    return listToolHelpSync();
  }

  const now = Date.now();
  let read;
  try {
    const pids = enumeratePids(win32);
    if (pids && lastList && pids.length > 0) {
      const newestCreated = creationTimeOf(win32, pids[pids.length - 1]);
      if (canReuseList(lastList, pids, newestCreated, now)) {
        lastRead = 'reused';
        return lastList.rows.slice();
      }
      const updated = now - lastList.at <= MAX_LIST_AGE_MS ? updateFromSystem(win32, lastList, pids, newestCreated) : null;
      if (updated) {
        lastList = updated;
        lastRead = 'updated';
        return updated.rows.slice();
      }
    }
    read = querySystemProcesses(win32);
  } catch {
    // A call the system refuses outright will not start working later: ToolHelp from now on.
    win32.fast = null;
    read = null;
  }
  if (!read) {
    lastList = null;
    lastRead = 'toolhelp';
    return listToolHelpSync();
  }
  lastList = { pids: read.pids, newestCreated: read.newestCreated, rows: read.rows, at: now };
  lastRead = 'full';
  return read.rows.slice();
}

// An update that cannot be trusted is not a reason to give up the system query: read it in full.
function updateFromSystem(win32, previous, pids, newestCreated) {
  try {
    return updateList(previous, pids, newestCreated, {
      createdAt: (pid) => creationTimeOf(win32, pid),
      nameOf: (pid) => imageNameOf(win32, pid),
    });
  } catch {
    return null;
  }
}

function lastReadKind() {
  return lastRead;
}

// Full image path of a live process, or '' when it exited or is not readable (protected/system
// processes deny even PROCESS_QUERY_LIMITED_INFORMATION). Never throws: an unresolved path is a
// normal outcome the monitor already handles.
function getProcessPath(pid) {
  const win32 = loadApi();
  if (!win32 || !Number.isInteger(pid) || pid <= 0) return '';

  let handle;
  try {
    handle = win32.OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
  } catch {
    return '';
  }
  if (!handle) return '';

  try {
    // 32767 wide chars covers the extended-length path limit.
    const buffer = Buffer.alloc(32768 * 2);
    const size = [32768];
    if (!win32.QueryFullProcessImageNameW(handle, 0, buffer, size)) return '';
    return win32.koffi.decode(buffer, 'char16', -1);
  } catch {
    return '';
  } finally {
    try {
      win32.CloseHandle(handle);
    } catch {}
  }
}

module.exports = { isAvailable, listSync, listToolHelpSync, canReuseList, updateList, lastReadKind, getProcessPath };
