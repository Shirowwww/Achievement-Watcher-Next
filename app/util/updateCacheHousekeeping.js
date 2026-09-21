'use strict';

const fs = require('fs');
const path = require('path');
const { isNotAnUpgrade } = require('./updateGate.js');

/*
  electron-updater keeps the last downloaded installer in <cache>/pending/ and only empties that
  folder when the NEXT update is downloaded. Once the version in it has been installed it is dead
  weight: a full copy of the installer (127 MB for 3.10.9) that sits there until the following
  release, beside installer.exe, the copy the installer itself leaves as the base for the next
  differential download. Removing the stale one is safe - electron-updater treats a missing
  pending/ as "nothing downloaded yet" and re-creates it.

  update-info.json names the file, not the version, so the version comes from electron-builder's
  artifactName (`Achievement.Watcher.Setup.${version}.${ext}`). Anything that does not parse is left
  alone: it may be an update this build cannot read, and electron-updater validates it anyway.
*/
const INSTALLER_VERSION_RE = /\.Setup\.(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)\.exe$/i;

function pendingInstallerVersion(fileName) {
  const match = INSTALLER_VERSION_RE.exec(String(fileName || ''));
  return match ? match[1] : null;
}

async function pruneInstalledPendingUpdate(pendingDir, currentVersion, { fsp = fs.promises } = {}) {
  let info;
  try {
    info = JSON.parse(await fsp.readFile(path.join(pendingDir, 'update-info.json'), 'utf8'));
  } catch {
    return { removed: false, reason: 'no-pending' };
  }
  const version = pendingInstallerVersion(info && info.fileName);
  if (!version) return { removed: false, reason: 'unknown-version' };
  if (!isNotAnUpgrade(version, currentVersion)) return { removed: false, version, reason: 'not-installed-yet' };
  await fsp.rm(pendingDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  return { removed: true, version, reason: 'installed' };
}

module.exports = { pendingInstallerVersion, pruneInstalledPendingUpdate };
