'use strict';

/*
  The achievement list an Xbox 360 game carries in its own executable. A XEX2 file holds its title's
  SPA (the XDBF container with the achievements, their strings in every language and their icons) as
  a resource named after the title id. Reaching it means undoing what the toolchain did to the image:
  AES-128 with a per-file key (itself encrypted with the public retail or devkit key), then either
  "basic" compression (runs of data and zeros) or LZX.
*/

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { decompress } = require(path.join(__dirname, '..', 'util', 'lzx.js'));

const HEADER_BASE_FILE_FORMAT = 0x000003ff;
const HEADER_RESOURCE_INFO = 0x000002ff;
const HEADER_EXECUTION_INFO = 0x00040006;
const HEADER_IMAGE_BASE_ADDRESS = 0x00010201;
const SECURITY_IMAGE_SIZE = 0x04;
const SECURITY_LOAD_ADDRESS = 0x110;
const SECURITY_AES_KEY = 0x150;
const MAX_XEX_BYTES = 256 * 1024 * 1024;
const MAX_IMAGE_BYTES = 512 * 1024 * 1024;

// The two keys the console's loader knows; they are public and in every Xbox 360 tool.
const KEYS = [Buffer.from('20b185a59d28fdc340583fbb0896bf91', 'hex'), Buffer.alloc(16)];

function need(buffer, offset, length, what) {
  if (!Number.isSafeInteger(offset) || offset < 0 || offset + length > buffer.length) throw new Error(`XEX: ${what} is outside the file`);
}

// { key: value } of the optional headers; a value is either inline or an offset into the header.
function optionalHeaders(xex) {
  need(xex, 0, 0x18, 'header');
  if (xex.toString('ascii', 0, 4) !== 'XEX2') throw new Error('XEX: not a XEX2 file');
  const count = xex.readUInt32BE(0x14);
  need(xex, 0x18, count * 8, 'optional header table');
  const headers = new Map();
  for (let i = 0; i < count; i += 1) headers.set(xex.readUInt32BE(0x18 + i * 8), xex.readUInt32BE(0x1c + i * 8));
  return headers;
}

function titleIdOf(xex, headers = optionalHeaders(xex)) {
  const at = headers.get(HEADER_EXECUTION_INFO);
  if (at === undefined) return '';
  need(xex, at, 0x10, 'execution info');
  return xex.readUInt32BE(at + 0x0c).toString(16).toUpperCase().padStart(8, '0');
}

// Only the header is read: enough to know which title a default.xex belongs to.
function readTitleId(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const head = Buffer.alloc(0x18);
    fs.readSync(fd, head, 0, head.length, 0);
    if (head.toString('ascii', 0, 4) !== 'XEX2') return '';
    const headerSize = head.readUInt32BE(0x08);
    if (headerSize > 16 * 1024 * 1024) return '';
    const header = Buffer.alloc(headerSize);
    fs.readSync(fd, header, 0, headerSize, 0);
    return titleIdOf(header);
  } catch {
    return '';
  } finally {
    fs.closeSync(fd);
  }
}

function decrypt(data, sessionKey) {
  const decipher = crypto.createDecipheriv('aes-128-cbc', sessionKey, Buffer.alloc(16));
  decipher.setAutoPadding(false);
  const whole = data.subarray(0, data.length - (data.length % 16));
  return Buffer.concat([decipher.update(whole), decipher.final(), data.subarray(whole.length)]);
}

function sessionKeyFor(encryptedKey, masterKey) {
  const decipher = crypto.createDecipheriv('aes-128-ecb', masterKey, null);
  decipher.setAutoPadding(false);
  return Buffer.concat([decipher.update(encryptedKey), decipher.final()]);
}

// Normal compression: blocks of [next block size][SHA-1][chunks of u16 size + data], ending on size 0.
function deblock(data, firstBlockSize) {
  const parts = [];
  let at = 0;
  let blockSize = firstBlockSize;
  while (blockSize) {
    need(data, at, 24, 'compressed block');
    const next = at + blockSize;
    const nextSize = data.readUInt32BE(at);
    let p = at + 24;
    for (;;) {
      need(data, p, 2, 'compressed chunk');
      const chunk = data.readUInt16BE(p);
      p += 2;
      if (!chunk) break;
      need(data, p, chunk, 'compressed chunk');
      parts.push(data.subarray(p, p + chunk));
      p += chunk;
    }
    at = next;
    blockSize = nextSize;
  }
  return Buffer.concat(parts);
}

function unpackImage(xex, headers, sessionKey) {
  const formatAt = headers.get(HEADER_BASE_FILE_FORMAT);
  if (formatAt === undefined) throw new Error('XEX: no file format header');
  need(xex, formatAt, 8, 'file format');
  const infoSize = xex.readUInt32BE(formatAt);
  const encryption = xex.readUInt16BE(formatAt + 4);
  const compression = xex.readUInt16BE(formatAt + 6);
  const securityAt = xex.readUInt32BE(0x10);
  need(xex, securityAt, SECURITY_AES_KEY + 16, 'security info');
  const imageSize = xex.readUInt32BE(securityAt + SECURITY_IMAGE_SIZE);
  if (imageSize > MAX_IMAGE_BYTES) throw new Error(`XEX: implausible image size ${imageSize}`);

  const payload = xex.subarray(xex.readUInt32BE(0x08));
  const data = encryption === 1 ? decrypt(payload, sessionKey) : payload;

  if (compression === 0) return Buffer.from(data.subarray(0, imageSize));
  if (compression === 1) {
    const image = Buffer.alloc(imageSize);
    let src = 0;
    let dst = 0;
    for (let at = formatAt + 8; at + 8 <= formatAt + infoSize; at += 8) {
      const dataSize = xex.readUInt32BE(at);
      const zeroSize = xex.readUInt32BE(at + 4);
      need(data, src, dataSize, 'basic block');
      if (dst + dataSize + zeroSize > imageSize) throw new Error('XEX: basic blocks overrun the image');
      data.copy(image, dst, src, src + dataSize);
      src += dataSize;
      dst += dataSize + zeroSize;
    }
    return image;
  }
  if (compression === 2) {
    need(xex, formatAt + 8, 8, 'compression info');
    const windowSize = xex.readUInt32BE(formatAt + 8);
    const firstBlockSize = xex.readUInt32BE(formatAt + 12);
    return decompress(deblock(data, firstBlockSize), imageSize, windowSize);
  }
  throw new Error(`XEX: compression type ${compression} is not supported`);
}

/*
  The SPA resource, or null when the executable carries none. Both keys are tried: a wrong key does
  not fail loudly, it yields noise, so the resource's own XDBF magic is what says which one was right.
*/
function readSpa(file) {
  const size = fs.statSync(file).size;
  if (size > MAX_XEX_BYTES) throw new Error(`XEX: '${file}' is ${size} bytes`);
  const xex = fs.readFileSync(file);
  const headers = optionalHeaders(xex);
  const titleId = titleIdOf(xex, headers);
  const resourcesAt = headers.get(HEADER_RESOURCE_INFO);
  if (!titleId || resourcesAt === undefined) return null;

  need(xex, resourcesAt, 4, 'resource info');
  const count = Math.floor((xex.readUInt32BE(resourcesAt) - 4) / 16);
  let resource = null;
  for (let i = 0; i < count; i += 1) {
    const at = resourcesAt + 4 + i * 16;
    need(xex, at, 16, 'resource entry');
    if (xex.toString('latin1', at, at + 8).replace(/\0+$/, '').toUpperCase() !== titleId) continue;
    resource = { address: xex.readUInt32BE(at + 8), size: xex.readUInt32BE(at + 12) };
  }
  if (!resource) return null;

  const securityAt = xex.readUInt32BE(0x10);
  need(xex, securityAt, SECURITY_AES_KEY + 16, 'security info');
  const base = headers.get(HEADER_IMAGE_BASE_ADDRESS) ?? xex.readUInt32BE(securityAt + SECURITY_LOAD_ADDRESS);
  const encryptedKey = xex.subarray(securityAt + SECURITY_AES_KEY, securityAt + SECURITY_AES_KEY + 16);
  let lastError = null;
  for (const masterKey of KEYS) {
    try {
      const image = unpackImage(xex, headers, sessionKeyFor(encryptedKey, masterKey));
      const start = resource.address - base;
      if (start < 0 || start + resource.size > image.length) continue;
      const spa = image.subarray(start, start + resource.size);
      if (spa.toString('ascii', 0, 4) === 'XDBF') return { titleId, spa: Buffer.from(spa) };
    } catch (err) {
      lastError = err;
    }
  }
  if (lastError) throw lastError;
  return null;
}

module.exports = { readSpa, readTitleId };
module.exports._internal = { optionalHeaders, unpackImage, sessionKeyFor, KEYS };
