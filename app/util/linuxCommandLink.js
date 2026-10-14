'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

/*
  A command that survives updates, for desktop shortcuts such as `--toggle-overlay`: the AppImage's
  file name carries its version and changes with each update, so ~/.local/bin/achievement-watcher
  points at the current file and is refreshed on each start. A file there that is not a link
  belongs to someone else and stays.
*/

const LINK_NAME = 'achievement-watcher';

function linkFile({ home = os.homedir() } = {}) {
  return path.join(home, '.local', 'bin', LINK_NAME);
}

function currentTarget(file) {
  try {
    return { target: fs.readlinkSync(file) };
  } catch (err) {
    if (err.code === 'ENOENT') return { target: null };
    if (err.code === 'EINVAL') return { foreign: true };
    throw err;
  }
}

function refresh({ env = process.env, home } = {}) {
  const appImage = env.APPIMAGE;
  if (!appImage) return { file: null, changed: false };
  const file = linkFile({ home });
  const { target, foreign } = currentTarget(file);
  if (foreign || target === appImage) return { file, changed: false, foreign: !!foreign };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  // Built aside then renamed over the old link, so the command never goes missing.
  const temp = `${file}.${process.pid}.tmp`;
  fs.rmSync(temp, { force: true });
  fs.symlinkSync(appImage, temp);
  fs.renameSync(temp, file);
  return { file, changed: true, foreign: false };
}

module.exports = { linkFile, refresh };
