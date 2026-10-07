'use strict';

/*
  Up to 3.11.0 screenshot-desktop left a C# grabber it compiled in %TEMP%\screenCapture, which
  antivirus engines flag. Only a real folder holding nothing but its files goes, file by file and
  never recursively; a file Windows refuses today is retried on the next start.
*/

const fs = require('fs');
const os = require('os');
const path = require('path');

const FOLDER = 'screenCapture';
const GRABBER = /^screenCapture_[\d.]+\.(bat|exe)$/i;
const MANIFEST = 'app.manifest';
const MAX_BAT_BYTES = 256 * 1024;
const BAT_MARKERS = ['@goto :batch', 'public class ScreenCapture'];

function isScreenshotDesktopBat(file) {
  const size = fs.statSync(file).size;
  if (size > MAX_BAT_BYTES) return false;
  const text = fs.readFileSync(file, 'latin1');
  return BAT_MARKERS.every((marker) => text.includes(marker));
}

// Returns the files to delete, or null when anything in the folder is not ours to remove.
function leftoverFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  let grabberFound = false;
  const files = [];
  for (const entry of entries) {
    const file = path.join(dir, entry.name);
    if (!fs.lstatSync(file).isFile()) return null;
    if (entry.name.toLowerCase() === MANIFEST) {
      files.push(file);
      continue;
    }
    if (!GRABBER.test(entry.name)) return null;
    if (/\.bat$/i.test(entry.name) && !isScreenshotDesktopBat(file)) return null;
    grabberFound = true;
    files.push(file);
  }
  return grabberFound ? files : null;
}

function removeLegacyScreenCapture(tempRoot = os.tmpdir()) {
  if (!tempRoot) return { removed: false, reason: 'no-temp' };
  const dir = path.join(tempRoot, FOLDER);
  try {
    let stat;
    try {
      stat = fs.lstatSync(dir);
    } catch {
      return { removed: false, reason: 'absent' };
    }
    if (stat.isSymbolicLink() || !stat.isDirectory()) return { removed: false, reason: 'not-a-folder' };

    const files = leftoverFiles(dir);
    if (!files) return { removed: false, reason: 'foreign-content' };
    for (const file of files) fs.unlinkSync(file);
    fs.rmdirSync(dir);
    return { removed: true, files: files.map((file) => path.basename(file)) };
  } catch (error) {
    return { removed: false, reason: error.code || 'error' };
  }
}

module.exports = { removeLegacyScreenCapture };
