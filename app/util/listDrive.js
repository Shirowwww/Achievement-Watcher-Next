'use strict';

const { execFile } = require('child_process');
const fs = require('fs');

/*
  List local fixed drive letters. WMIC is gone on Windows 11 24H2+, so query CIM via PowerShell and
  fall back to a drive-letter probe; the "C:" output format is unchanged.
*/
module.exports = (option = {}) => {
  const ignoreSystemDrive = option.ignoreSystemDrive || false;
  const systemDrive = (process.env['SystemDrive'] || 'C:').toUpperCase();
  const finalize = (drives) => {
    let list = drives.filter((d) => /^[A-Za-z]:$/.test(d));
    if (ignoreSystemDrive) list = list.filter((d) => d.toUpperCase() !== systemDrive);
    return list;
  };
  return queryFixedDrives().then(finalize);
};

/*
  One scan asks three times within a second, and each answer cost a PowerShell start, which
  antivirus behaviour engines weigh. Short enough that a drive plugged in before the next refresh
  is still seen.
*/
const DRIVE_ANSWER_TTL_MS = 30 * 1000;
let lastAnswer = { at: 0, drives: null };
let inFlight = null;

function queryFixedDrives() {
  if (lastAnswer.drives && Date.now() - lastAnswer.at < DRIVE_ANSWER_TTL_MS) return Promise.resolve([...lastAnswer.drives]);
  if (!inFlight) {
    inFlight = runDriveQuery().then((drives) => {
      lastAnswer = { at: Date.now(), drives };
      inFlight = null;
      return drives;
    });
  }
  return inFlight.then((drives) => [...drives]);
}

function runDriveQuery() {
  const probeLetters = () => {
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
  };

  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        "Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=3' | Select-Object -ExpandProperty DeviceID",
      ],
      { windowsHide: true, timeout: 8000 },
      (err, stdout) => {
        let drives = [];
        if (!err && stdout) {
          drives = String(stdout)
            .split(/\r?\n/)
            .map((s) => s.trim())
            .filter((s) => s !== '');
        }
        if (drives.length === 0) drives = probeLetters(); //PowerShell missing/blocked -> native fallback
        resolve(drives);
      }
    );
  });
}
