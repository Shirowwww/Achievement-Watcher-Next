'use strict';

const fs = require('fs');
const path = require('path');

const PORTABLE_MARKER = 'AchievementWatcherPortable.json';
const PORTABLE_DATA_DIR = 'data';

function portableUserDataDir({ execPath = process.execPath, isPackaged = false } = {}) {
  if (!isPackaged || !execPath) return '';

  try {
    const appDir = path.dirname(execPath);
    const marker = JSON.parse(fs.readFileSync(path.join(appDir, PORTABLE_MARKER), 'utf8'));
    if (!marker || marker.portable !== true) return '';
    return path.join(appDir, PORTABLE_DATA_DIR);
  } catch {
    return '';
  }
}

module.exports = {
  PORTABLE_MARKER,
  PORTABLE_DATA_DIR,
  portableUserDataDir,
};
