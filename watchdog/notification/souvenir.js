'use strict';

// Souvenir screenshot (simple): capture the desktop a moment after an achievement unlocks (so an
// on-screen toast or overlay popup is included), and save it under a per-game subfolder named after the
// achievement and time:  <dir>/<game>/<date> - <achievement>.png. Best-effort - any failure (no display,
// fullscreen-exclusive game, missing native helper) is swallowed so notifications never break.

const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFile } = require('child_process');
const debug = require('../util/log.js');

const HDR_HELPER_NAME = 'aw-next-hdr-screenshot.exe';
const HDR_TIMEOUT_MS = 5000;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

let screenshot = null; // null = not tried, false = unavailable, fn = loaded
function loadScreenshot() {
  if (screenshot === null) {
    try {
      screenshot = require('screenshot-desktop');
    } catch (err) {
      screenshot = false;
      debug.warn('[souvenir] screenshot-desktop unavailable: ' + (err.message || err));
    }
  }
  return screenshot;
}

// Names Windows refuses whatever the extension, so a game called "NUL" or "COM1" would lose its
// screenshots entirely.
const RESERVED_NAME = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;

/*
  Strip characters illegal in Windows file/folder names; keep spaces; cap the length.

  Trailing dots and spaces matter as much as the illegal characters: Windows silently drops them
  from the name it actually creates, so a title ending in one ("Mr. Do." or "Sam & Max ") would
  have the write land somewhere other than the path returned here - and the caller checks that
  path when picking a non-colliding name.
*/
function sanitize(s) {
  const cleaned = String(s || '')
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/\p{Cc}/gu, '') // control characters are illegal in a Windows name too
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100)
    .replace(/[. ]+$/, '');
  if (!cleaned) return 'Unknown';
  return RESERVED_NAME.test(cleaned) ? cleaned + '_' : cleaned;
}

// Never overwrite an earlier souvenir: several achievements can unlock within the same second, and
// the same one can be unlocked again after a reset.
function uniquePath(dir, base) {
  let file = path.join(dir, `${base}.png`);
  for (let n = 2; fs.existsSync(file) && n < 1000; n++) file = path.join(dir, `${base} (${n}).png`);
  return file;
}

// Kept in sync with souvenirDefaultDir() in app/ui/settings.js and SOUVENIR_DIR_NAME in
// app/util/migrateUserData.js, which links shots from the pre-rename folder into this one.
function defaultDir() {
  return path.join(os.homedir(), 'Pictures', 'Achievement Watcher Next');
}

function resolveHdrHelper() {
  const helper = path.join(__dirname, '..', 'native', HDR_HELPER_NAME);
  return fs.existsSync(helper) ? helper : '';
}

function isPng(file) {
  let handle;
  try {
    if (fs.statSync(file).size <= 64) return false;
    handle = fs.openSync(file, 'r');
    const signature = Buffer.alloc(PNG_SIGNATURE.length);
    return fs.readSync(handle, signature, 0, signature.length, 0) === signature.length && signature.equals(PNG_SIGNATURE);
  } catch {
    return false;
  } finally {
    if (handle != null) fs.closeSync(handle);
  }
}

function captureHdr(file, { helper = resolveHdrHelper(), run = execFile, timeoutMs = HDR_TIMEOUT_MS } = {}) {
  return new Promise((resolve, reject) => {
    if (!helper) {
      const error = new Error('HDR screenshot helper was not found');
      error.code = 'hdr-unavailable';
      reject(error);
      return;
    }

    run(
      helper,
      [file],
      {
        windowsHide: true,
        timeout: timeoutMs,
        killSignal: 'SIGKILL',
        maxBuffer: 64 * 1024,
      },
      (error, stdout, stderr) => {
        if (error) {
          const detail = String(stderr || stdout || error.message || '').trim();
          if (Number(error.code) === 2 && detail.includes('hdr-inactive')) {
            error.code = 'hdr-inactive';
          } else {
            error.code = error.killed ? 'hdr-timeout' : 'hdr-failed';
          }
          if (detail) error.message = detail.slice(0, 1000);
          reject(error);
          return;
        }
        if (!isPng(file)) {
          const invalid = new Error('HDR screenshot helper did not create a valid PNG');
          invalid.code = 'hdr-invalid-output';
          reject(invalid);
          return;
        }
        resolve(file);
      }
    );
  });
}

async function captureSdr(file) {
  const shot = loadScreenshot();
  if (!shot) throw new Error('screenshot-desktop is unavailable');
  const image = await shot({ format: 'png' });
  fs.writeFileSync(file, image);
  return file;
}

function removeHdrOutput(file) {
  for (const target of [file, file + '.tmp']) {
    try {
      fs.rmSync(target, { force: true });
    } catch {}
  }
}

async function captureImage(file, hdrMode, { platform = process.platform, hdr = captureHdr, sdr = captureSdr } = {}) {
  if (hdrMode === 'auto' && platform === 'win32') {
    try {
      await hdr(file);
      return 'hdr';
    } catch (error) {
      removeHdrOutput(file);
      const detail = error && error.message ? error.message : String(error);
      if (error && error.code === 'hdr-inactive') debug.log('[souvenir] Windows HDR is off; using standard capture');
      else debug.warn('[souvenir] HDR capture unavailable; using standard capture: ' + detail);
    }
  }

  await sdr(file);
  return 'sdr';
}

// Capture the full desktop and write it to <dir>/<game>/<date> - <achievement>.png. Returns the path or null.
module.exports.capture = async function ({ game, achievement, dir, hdr = 'auto' } = {}) {
  try {
    const baseDir = dir && String(dir).trim() ? String(dir).trim() : defaultDir();
    const gameDir = path.join(baseDir, sanitize(game));
    fs.mkdirSync(gameDir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-').replace('T', ' ').slice(0, 19); // e.g. 2026-06-23 23-10-05
    const file = uniquePath(gameDir, ts + ' - ' + sanitize(achievement));
    const mode = await captureImage(file, hdr);
    debug.log(`[souvenir] saved ${file} (${mode})`);
    return file;
  } catch (err) {
    debug.error('[souvenir] capture failed: ' + (err.message || err));
    return null;
  }
};

// Exported for the tests: both decide the path a screenshot is written to.
module.exports._sanitize = sanitize;
module.exports._uniquePath = uniquePath;
module.exports._captureHdr = captureHdr;
module.exports._captureImage = captureImage;
module.exports._isPng = isPng;
module.exports._resolveHdrHelper = resolveHdrHelper;
