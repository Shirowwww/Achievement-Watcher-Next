'use strict';

const fs = require('fs');

/*
  Whether bytes are a picture, from their signature. A CDN error page or a captive portal answers
  200 with HTML, and a dropped connection leaves half a file; cached under an icon's name, either
  would be served instead of the icon for as long as the file exists.
*/
const SIGNATURES = [
  [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], // PNG
  [0xff, 0xd8, 0xff], // JPEG
  [0x47, 0x49, 0x46, 0x38], // GIF
  [0x00, 0x00, 0x01, 0x00], // ICO
  [0x42, 0x4d], // BMP
];

function isImageBuffer(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return false;
  if (buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') return true;
  return SIGNATURES.some((signature) => signature.every((byte, i) => buf[i] === byte));
}

function isImageFile(file) {
  let handle;
  try {
    handle = fs.openSync(file, 'r');
    const head = Buffer.alloc(12);
    const read = fs.readSync(handle, head, 0, head.length, 0);
    return isImageBuffer(head.subarray(0, read));
  } catch {
    return false;
  } finally {
    if (handle !== undefined) fs.closeSync(handle);
  }
}

// A cached file that is not a picture is removed, so the caller downloads it again.
function usableCachedImage(file) {
  if (!fs.existsSync(file)) return false;
  if (isImageFile(file)) return true;
  try {
    fs.rmSync(file, { force: true });
  } catch {
    /* a folder in the icon's place: not a picture either, and the download reports what it finds */
  }
  return false;
}

module.exports = { isImageBuffer, isImageFile, usableCachedImage };
