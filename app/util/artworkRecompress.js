'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { replaceFileSync, unlinkForce } = require('./replaceFile.js');

/*
  Store artwork, the Epic and GOG wide banners above all, arrives as PNG: 920x430 photographs of
  about 740 KB each, 104 MB over 140 files on one profile. As JPEG they take a fifth of that with no
  visible loss. The file keeps its name, which comes from the download URL and is how the icon cache
  finds it again; every reader decodes by content, not by extension (Chromium, WIC behind the toast
  hero image, util/imageSize.js). A picture with any transparency stays a PNG.

  `nativeImage` is Electron's, so the main process gains no image library for this.
*/

const MIN_BYTES = 256 * 1024;
const JPEG_QUALITY = 92;
// Fidelity floor, measured on the decoded JPEG. Of 102 real banners, 83 passed at a median of 40 dB;
// the 19 below carry fine coloured text or line art that JPEG smears, so they stay PNG.
const MIN_PSNR_DB = 35;
// Not worth a lossy copy unless it is clearly smaller.
const MAX_RATIO = 0.6;
// A file this recent may still be downloading; a truncated PNG must never become a JPEG.
const SETTLE_MS = 10 * 60 * 1000;
const PNG_SIGNATURE = 0x89504e47;

function startsLikePng(file) {
  let fd;
  try {
    fd = fs.openSync(file, 'r');
    const head = Buffer.alloc(4);
    return fs.readSync(fd, head, 0, 4, 0) === 4 && head.readUInt32BE(0) === PNG_SIGNATURE;
  } catch {
    return false;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

function isOpaque(pixels) {
  for (let alpha = 3; alpha < pixels.length; alpha += 4) {
    if (pixels[alpha] !== 255) return false;
  }
  return true;
}

// Peak signal-to-noise ratio over the colour channels of two same-sized 32-bit bitmaps.
function psnr(a, b) {
  let squared = 0;
  let samples = 0;
  for (let i = 0; i < a.length; i++) {
    if (i % 4 === 3) continue;
    squared += (a[i] - b[i]) ** 2;
    samples++;
  }
  return squared === 0 ? Infinity : 10 * Math.log10((255 * 255 * samples) / squared);
}

// The window may be showing the picture: it reads either the old file or the new one, never half.
function replaceContent(file, data) {
  const temporary = `${file}.${process.pid}-${crypto.randomBytes(4).toString('hex')}.tmp`;
  fs.writeFileSync(temporary, data);
  try {
    replaceFileSync(temporary, file);
  } catch (err) {
    unlinkForce(temporary);
    throw err;
  }
}

function candidates(iconRoot, now) {
  const files = [];
  let dirs;
  try {
    dirs = fs.readdirSync(iconRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory());
  } catch {
    return files;
  }
  for (const dir of dirs) {
    let names;
    try {
      names = fs.readdirSync(path.join(iconRoot, dir.name)).filter((name) => /\.png$/i.test(name));
    } catch {
      continue;
    }
    for (const name of names) {
      const file = path.join(iconRoot, dir.name, name);
      try {
        const stat = fs.statSync(file);
        if (stat.size >= MIN_BYTES && now - stat.mtimeMs >= SETTLE_MS) files.push({ file, size: stat.size });
      } catch {
        /* removed meanwhile */
      }
    }
  }
  return files;
}

// One picture per turn of the event loop: decoding and encoding a banner takes ~10 ms of the main
// process, which also answers the window and the tray.
async function recompressArtwork(iconRoot, nativeImage, now = Date.now()) {
  const result = { files: 0, savedBytes: 0 };
  for (const { file, size } of candidates(iconRoot, now)) {
    await new Promise((resolve) => setImmediate(resolve));
    if (!startsLikePng(file)) continue;
    const image = nativeImage.createFromPath(file);
    if (image.isEmpty()) continue;
    const original = image.toBitmap();
    if (!isOpaque(original)) continue;
    const jpeg = image.toJPEG(JPEG_QUALITY);
    if (jpeg.length > size * MAX_RATIO) continue;
    const decoded = nativeImage.createFromBuffer(jpeg).toBitmap();
    if (decoded.length !== original.length || psnr(original, decoded) < MIN_PSNR_DB) continue;
    replaceContent(file, jpeg);
    result.files++;
    result.savedBytes += size - jpeg.length;
  }
  return result;
}

module.exports = { recompressArtwork };
