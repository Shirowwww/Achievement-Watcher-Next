'use strict';

const fs = require('fs');

// Whether bytes are a whole picture: a portal page or half a file cached under an icon's name
// would be served in its place for as long as the file exists.
const SIGNATURES = [
  [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], // PNG
  [0xff, 0xd8, 0xff], // JPEG
  [0x47, 0x49, 0x46, 0x38], // GIF
  [0x00, 0x00, 0x01, 0x00], // ICO
  [0x42, 0x4d], // BMP
];
// The head holds an icon file's directory (6 bytes, then 16 per picture).
const HEAD_BYTES = 6 + 16 * 32;
// How far before the end an end marker is looked for: some encoders write metadata after it.
const TAIL_BYTES = 4096;
const PNG_END = Buffer.from('IEND', 'latin1');
const JPEG_END = Buffer.from([0xff, 0xd9]);

function formatOf(head) {
  if (head.length < 12) return null;
  if (head.toString('latin1', 0, 4) === 'RIFF' && head.toString('latin1', 8, 12) === 'WEBP') return 'webp';
  const index = SIGNATURES.findIndex((signature) => signature.every((byte, i) => head[i] === byte));
  return ['png', 'jpeg', 'gif', 'ico', 'bmp'][index] || null;
}

function lastMeaningfulByte(tail) {
  let end = tail.length - 1;
  while (end >= 0 && tail[end] === 0) end--;
  return end >= 0 ? tail[end] : undefined;
}

// Every picture an icon file lists must end inside the file. A directory longer than the head read
// is not checked further.
function icoFitsIn(head, size) {
  const count = head.readUInt16LE(4);
  if (count === 0) return false;
  for (let i = 0; i < count && 6 + 16 * (i + 1) <= head.length; i++) {
    const entry = 6 + 16 * i;
    if (head.readUInt32LE(entry + 12) + head.readUInt32LE(entry + 8) > size) return false;
  }
  return true;
}

// `head` is the start of the file, `tail` its last bytes and `size` its length.
function isWholeImage(head, tail, size) {
  switch (formatOf(head)) {
    case 'png': {
      // The IEND chunk is followed by its 4-byte CRC.
      const at = tail.lastIndexOf(PNG_END);
      return at >= 0 && at + PNG_END.length + 4 <= tail.length;
    }
    case 'jpeg':
      return size > 4 && tail.lastIndexOf(JPEG_END) >= 0;
    case 'gif':
      return lastMeaningfulByte(tail) === 0x3b;
    case 'webp':
      return head.readUInt32LE(4) + 8 <= size;
    case 'bmp': {
      const declared = size >= 6 ? head.readUInt32LE(2) : 0;
      return declared === 0 || declared <= size;
    }
    case 'ico':
      return icoFitsIn(head, size);
    default:
      return false;
  }
}

function isImageBuffer(buf) {
  if (!Buffer.isBuffer(buf)) return false;
  return isWholeImage(buf.subarray(0, HEAD_BYTES), buf.subarray(Math.max(0, buf.length - TAIL_BYTES)), buf.length);
}

function isImageFile(file) {
  let handle;
  try {
    handle = fs.openSync(file, 'r');
    const size = fs.fstatSync(handle).size;
    const head = Buffer.alloc(HEAD_BYTES);
    const headRead = fs.readSync(handle, head, 0, head.length, 0);
    const tail = Buffer.alloc(Math.min(TAIL_BYTES, size));
    const tailRead = fs.readSync(handle, tail, 0, tail.length, size - tail.length);
    return isWholeImage(head.subarray(0, headRead), tail.subarray(0, tailRead), size);
  } catch {
    return false;
  } finally {
    if (handle !== undefined) fs.closeSync(handle);
  }
}

// A cached file that is not a whole picture is removed, so the caller downloads it again.
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
