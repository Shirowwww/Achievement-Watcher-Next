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
  let fd;
  try {
    // Inside the try: a locked or vanished xex must not abort the whole folder scan.
    fd = fs.openSync(file, 'r');
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
    if (fd !== undefined) fs.closeSync(fd);
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

/*
  Normal compression: blocks of [next block size][SHA-1 of the next block][chunks of u16 size + data,
  ending on size 0]. The first block's size and hash come from the file format header, so every
  block is checked before a byte of it reaches the LZX decoder; a wrong key fails here at once.
*/
function deblock(data, firstBlockSize, firstBlockHash) {
  const parts = [];
  let at = 0;
  let blockSize = firstBlockSize;
  let expected = firstBlockHash;
  let total = 0;
  while (blockSize) {
    // A block smaller than its own header would re-read overlapping bytes: quadratic on a crafted file.
    if (blockSize < 26) throw new Error(`XEX: implausible compressed block size ${blockSize}`);
    need(data, at, blockSize, 'compressed block');
    const block = data.subarray(at, at + blockSize);
    if (!crypto.createHash('sha1').update(block).digest().equals(expected)) throw new Error(`XEX: compressed block at ${at} fails its SHA-1 check`);
    total = readChunks(block, parts, total);
    at += blockSize;
    blockSize = block.readUInt32BE(0);
    expected = block.subarray(4, 24);
  }
  return Buffer.concat(parts);
}

function readChunks(block, parts, total) {
  let p = 24;
  for (;;) {
    need(block, p, 2, 'compressed chunk');
    const chunk = block.readUInt16BE(p);
    p += 2;
    if (!chunk) return total;
    need(block, p, chunk, 'compressed chunk');
    total += chunk;
    if (total > MAX_IMAGE_BYTES) throw new Error('XEX: compressed stream larger than any image');
    parts.push(block.subarray(p, p + chunk));
    p += chunk;
  }
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
    if (infoSize < 36) throw new Error('XEX: truncated LZX compression info');
    need(xex, formatAt + 8, 28, 'compression info');
    const windowSize = xex.readUInt32BE(formatAt + 8);
    const firstBlockSize = xex.readUInt32BE(formatAt + 12);
    const firstBlockHash = xex.subarray(formatAt + 16, formatAt + 36);
    return decompress(deblock(data, firstBlockSize, firstBlockHash), imageSize, windowSize);
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

const ISOLATED_TIMEOUT_MS = 30000;
// JS heap only: the Buffers holding the file and the image are capped by the size checks above.
const ISOLATED_HEAP_MB = 128;
// The worker is unpacked from the asar: neither a thread nor a forked process can start inside it.
const WORKER_FILE = path.join(__dirname, 'xexWorker.js').replace(`${path.sep}app.asar${path.sep}`, `${path.sep}app.asar.unpacked${path.sep}`);

function settleOnce(resolve, reject, kill, timeoutMs) {
  let done = false;
  const timer = setTimeout(() => finish(new Error(`XEX: extraction timed out after ${timeoutMs} ms`)), timeoutMs);
  function finish(err, value) {
    if (done) return;
    done = true;
    clearTimeout(timer);
    Promise.resolve(kill()).catch(() => {}).then(() => (err ? reject(err) : resolve(value)));
  }
  return finish;
}

// `answered`: the file itself was read and refused, unlike a timeout or a worker that never ran.
function answer(message, finish) {
  if (!message || !message.ok) finish(Object.assign(new Error(String((message && message.error) || 'XEX: the extraction worker failed')), { answered: true }));
  else finish(null, message.none ? null : { titleId: message.titleId, spa: Buffer.from(message.spa) });
}

function inThread(file, { workerFile, timeoutMs }) {
  const { Worker } = require('worker_threads');
  return new Promise((resolve, reject) => {
    let worker;
    try {
      worker = new Worker(workerFile, {
        workerData: { file },
        resourceLimits: { maxOldGenerationSizeMb: ISOLATED_HEAP_MB, maxYoungGenerationSizeMb: 16, stackSizeMb: 4 },
      });
    } catch (err) {
      // Electron's renderer cannot start a Node worker thread: the caller falls back to a process.
      reject(Object.assign(err, { code: 'XEX_NO_THREADS' }));
      return;
    }
    const finish = settleOnce(resolve, reject, () => worker.terminate(), timeoutMs);
    worker.once('message', (message) => answer(message, finish));
    worker.once('error', (err) => finish(err));
    worker.once('exit', (code) => finish(new Error(`XEX: the extraction worker exited (${code})`)));
  });
}

// The app's own executable run as Node, the way the Watchdog is started.
function inProcess(file, { workerFile, timeoutMs }) {
  return new Promise((resolve, reject) => {
    let child;
    try {
      // Required here, not at the top: xexWorker.js loads this file from outside the asar too.
      const { forkNode } = require(path.join(__dirname, '..', 'util', 'nodeProcess.js'));
      child = forkNode(workerFile, { heapMb: ISOLATED_HEAP_MB });
    } catch (err) {
      reject(err);
      return;
    }
    const finish = settleOnce(resolve, reject, () => child.exitCode === null && child.kill(), timeoutMs);
    child.once('message', (message) => answer(message, finish));
    child.once('error', (err) => finish(err));
    child.once('exit', (code) => finish(new Error(`XEX: the extraction process exited (${code})`)));
    child.send({ file });
  });
}

async function isolate(file, options) {
  if (options.mode === 'process') return inProcess(file, options);
  try {
    return await inThread(file, options);
  } catch (err) {
    if (err && err.code === 'XEX_NO_THREADS' && options.mode !== 'thread') return inProcess(file, options);
    throw err;
  }
}

let isolatedQueue = Promise.resolve();

/*
  readSpa away from the caller: a crafted or damaged executable can cost a lot of CPU and memory,
  and the app must stay responsive. One extraction at a time, killed after `timeoutMs`.
*/
function readSpaIsolated(file, { mode = 'auto', timeoutMs = ISOLATED_TIMEOUT_MS, workerFile = WORKER_FILE } = {}) {
  const run = isolatedQueue.then(() => isolate(path.resolve(String(file)), { mode, timeoutMs, workerFile }));
  isolatedQueue = run.catch(() => {});
  return run;
}

module.exports = { readSpa, readSpaIsolated, readTitleId };
module.exports._internal = { optionalHeaders, unpackImage, sessionKeyFor, KEYS };
