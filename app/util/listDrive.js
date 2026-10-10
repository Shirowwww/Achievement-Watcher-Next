'use strict';

const { execFile } = require('child_process');
const fs = require('fs');

/*
  List local fixed drive letters. WMIC is gone on Windows 11 24H2+, so query CIM via PowerShell and
  fall back to a drive-letter probe; the "C:" output format is unchanged.

  On Linux the answer is the mount points of real disks instead ("/", "/home", "/mnt/games", ...).
*/
module.exports = (option = {}) => {
  const ignoreSystemDrive = option.ignoreSystemDrive || false;
  if (process.platform !== 'win32') return Promise.resolve(linuxMountRoots(readMountInfo(), { ignoreSystemDrive }));
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

// Filesystems a game library can live on. Network shares, FUSE mounts (except fuseblk, which is how
// ntfs-3g and exfat-fuse appear), virtual filesystems and WSL's 9p view of the Windows drives are not.
const DISK_FILESYSTEMS = new Set([
  'ext2', 'ext3', 'ext4', 'btrfs', 'xfs', 'f2fs', 'jfs', 'reiserfs', 'zfs', 'bcachefs', 'nilfs2',
  'ntfs', 'ntfs3', 'fuseblk', 'exfat', 'vfat',
]);

// The system's own mounts (EFI partition, /var on its own volume, snaps) never hold a game library.
const SYSTEM_MOUNT_PREFIXES = ['/boot', '/efi', '/proc', '/sys', '/dev', '/run', '/snap', '/var', '/usr', '/tmp', '/opt', '/srv', '/etc', '/root', '/nix', '/gnu'];
// Removable disks, mounted by udisks as /run/media/<user>/<label>.
const REMOVABLE_MOUNT_PREFIX = '/run/media/';

function readMountInfo() {
  try {
    return fs.readFileSync('/proc/self/mountinfo', 'utf8');
  } catch {
    return '';
  }
}

// mountinfo writes a space, tab, newline or backslash inside a path as an octal escape ("\040").
function unescapeMountPath(value) {
  return value.replace(/\\([0-7]{3})/g, (whole, octal) => String.fromCharCode(parseInt(octal, 8)));
}

function isSystemMount(mountPoint) {
  if (mountPoint.startsWith(REMOVABLE_MOUNT_PREFIX)) return false;
  if (mountPoint.split('/').some((segment) => segment.startsWith('.'))) return true; // /.snapshots
  return SYSTEM_MOUNT_PREFIXES.some((prefix) => mountPoint === prefix || mountPoint.startsWith(prefix + '/'));
}

/*
  Mount points of real disks, in mountinfo order. A line reads "<id> <parent> <dev> <root> <mount
  point> <options> [optional fields] - <fstype> <source> <super options>".
*/
function linuxMountRoots(mountInfo, { ignoreSystemDrive = false } = {}) {
  const roots = [];
  for (const line of String(mountInfo || '').split('\n')) {
    const [left, right] = line.split(' - ');
    if (!right) continue;
    const mountPoint = unescapeMountPath(left.split(' ')[4] || '');
    const fsType = right.split(' ')[0];
    if (!mountPoint.startsWith('/') || !DISK_FILESYSTEMS.has(fsType)) continue;
    if (mountPoint === '/' ? ignoreSystemDrive : isSystemMount(mountPoint)) continue;
    if (!roots.includes(mountPoint)) roots.push(mountPoint);
  }
  return roots;
}

module.exports.linuxMountRoots = linuxMountRoots;
