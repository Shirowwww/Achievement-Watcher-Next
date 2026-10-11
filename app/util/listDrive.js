'use strict';

const fs = require('fs');

/*
  List local fixed drive letters. WMIC is gone on Windows 11 24H2+, and the CIM query this replaced
  started a PowerShell for the same answer. Windows gives it directly: GetLogicalDrives says which
  letters are in use and GetDriveTypeW says which of them are fixed disks, the same set as CIM's
  Win32_LogicalDisk DriveType=3. A drive-letter probe stays as the fallback; the "C:" output format is
  unchanged.
*/
module.exports = async (option = {}) => {
  const ignoreSystemDrive = option.ignoreSystemDrive || false;
  const systemDrive = (process.env['SystemDrive'] || 'C:').toUpperCase();
  let list = (await queryFixedDrives()).filter((d) => /^[A-Za-z]:$/.test(d));
  if (ignoreSystemDrive) list = list.filter((d) => d.toUpperCase() !== systemDrive);
  return list;
};

/*
  One scan asks three times within a second. The answer only changes when a drive is plugged in or
  removed, so it is kept briefly: short enough that a drive plugged in before the next refresh is
  still seen.
*/
const DRIVE_ANSWER_TTL_MS = 30 * 1000;
const DRIVE_FIXED = 3;
let lastAnswer = { at: 0, drives: null };

async function queryFixedDrives() {
  if (lastAnswer.drives && Date.now() - lastAnswer.at < DRIVE_ANSWER_TTL_MS) return [...lastAnswer.drives];
  const drives = readFixedDrives();
  lastAnswer = { at: Date.now(), drives };
  return [...drives];
}

function readFixedDrives() {
  let drives = [];
  try {
    drives = nativeFixedDrives();
  } catch {
    drives = [];
  }
  // Not Windows, koffi unavailable or the call failed -> the letter probe still answers.
  if (drives.length === 0) drives = probeLetters();
  return drives;
}

/*
  Only Windows has these calls, so the binding is made on first use there and nowhere else. Tests
  replace the whole query through _setNativeReader.
*/
let nativeQuery = null;

function nativeFixedDrives() {
  if (!nativeQuery) {
    if (process.platform !== 'win32') throw new Error('not a Windows host');
    const kernel32 = require('koffi').load('kernel32.dll');
    const getLogicalDrives = kernel32.func('uint32 __stdcall GetLogicalDrives()');
    const getDriveType = kernel32.func('uint32 __stdcall GetDriveTypeW(str16 root)');
    nativeQuery = () => fixedDrivesFromMask(getLogicalDrives(), (letter) => getDriveType(`${letter}:\\`));
  }
  return nativeQuery();
}

/*
  The fixed drives in a GetLogicalDrives mask, in letter order. Bit 0 is A:. A zero mask is a failed
  call, which is an error rather than an answer of "no drives".
*/
function fixedDrivesFromMask(mask, driveTypeOf) {
  if (!mask) throw new Error('GetLogicalDrives failed');
  const drives = [];
  for (let bit = 0; bit < 26; bit += 1) {
    if (!(mask & (1 << bit))) continue;
    const letter = String.fromCharCode(65 + bit);
    if (driveTypeOf(letter) === DRIVE_FIXED) drives.push(`${letter}:`);
  }
  return drives;
}

function probeLetters() {
  const drives = [];
  for (let c = 'C'.charCodeAt(0); c <= 'Z'.charCodeAt(0); c++) {
    const letter = String.fromCharCode(c) + ':';
    try {
      if (fs.existsSync(letter + '\\')) drives.push(letter);
    } catch {
      /* drive not ready / inaccessible -> skip */
    }
  }
  return drives;
}

// Tests swap the native query for a scripted one and forget the answer kept from the last query.
module.exports._setNativeReader = (reader) => {
  nativeQuery = reader;
  lastAnswer = { at: 0, drives: null };
};
module.exports.fixedDrivesFromMask = fixedDrivesFromMask;
