'use strict';

/*
  The .awbackup container, built on node:zlib alone (zstd ships with the Node 24 that Electron 43
  carries), so no archive dependency is added and nothing is held whole in memory.

    "AWBACKUP" u32 version u32 reserved          16 bytes
    zstd( file 1 bytes, file 2 bytes, ... )      in manifest order, no per-file headers
    manifest JSON, u32 length, sha256(manifest), "AWBKEND1"

  The manifest sits at the end so a writer needs one pass (sizes and hashes are taken from the bytes
  it actually streamed), and a reader finds it first by seeking, validates every entry, and only
  then touches the payload. A truncated file has no trailer and is refused before anything else.
*/

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { once } = require('events');
const { finished } = require('stream/promises');
const { replaceFileSync, unlinkForce } = require('./replaceFile.js');
const inventory = require('./profileInventory.js');

const FORMAT = 'aw-profile-backup';
const FORMAT_VERSION = 1;
const MAGIC = Buffer.from('AWBACKUP', 'ascii');
const END_MAGIC = Buffer.from('AWBKEND1', 'ascii');
const HEADER_BYTES = 16;
const TRAILER_BYTES = 4 + 32 + END_MAGIC.length;
const MAX_MANIFEST_BYTES = 64 * 1024 * 1024;
const SHA256 = /^[0-9a-f]{64}$/;
const ACCOUNT_KEYS = new Set(['epic', 'steam', 'xbox', 'retroachievements', 'emulator']);

class BackupError extends Error {
  constructor(code, message, detail) {
    super(message || code);
    this.code = code;
    if (detail !== undefined) this.detail = detail;
  }
}

function zstdParams() {
  const params = { [zlib.constants.ZSTD_c_compressionLevel]: 3 };
  if (Number.isInteger(zlib.constants.ZSTD_c_checksumFlag)) params[zlib.constants.ZSTD_c_checksumFlag] = 1;
  return params;
}

function isCount(value, max) {
  return Number.isSafeInteger(value) && value >= 0 && value <= max;
}

function validatePlaytime(list) {
  if (list === undefined) return [];
  if (!Array.isArray(list) || list.length > 100000) throw new BackupError('corrupt', 'bad playtime list');
  return list.map((row) => {
    const ok = row && /^[A-Za-z0-9._-]{1,80}$/.test(String(row.appid)) && isCount(row.total, 0xffffffff) && isCount(row.last, 0xffffffff);
    if (!ok) throw new BackupError('corrupt', 'bad playtime entry');
    return { appid: String(row.appid), total: row.total, last: row.last };
  });
}

// Throws BackupError for anything the restore would not do with confidence; returns a clean copy.
function validateManifest(raw) {
  if (!raw || typeof raw !== 'object' || raw.format !== FORMAT) throw new BackupError('not-a-backup');
  if (!Number.isInteger(raw.formatVersion) || raw.formatVersion < 1) throw new BackupError('not-a-backup');
  if (raw.formatVersion > FORMAT_VERSION) throw new BackupError('format-too-new', undefined, { formatVersion: raw.formatVersion });
  const list = raw.files;
  if (!Array.isArray(list)) throw new BackupError('corrupt', 'files missing');
  if (list.length > inventory.MAX_ENTRIES) throw new BackupError('too-large', 'too many files');

  const seen = new Set();
  let total = 0;
  const files = list.map((entry) => {
    if (!entry || typeof entry.path !== 'string' || !inventory.isSafeRelativePath(entry.path)) {
      throw new BackupError('unsafe-entry', 'unsafe path', String(entry && entry.path).slice(0, 120));
    }
    if (!inventory.classify(entry.path).include) throw new BackupError('unsafe-entry', 'path outside the backup roots', entry.path);
    if (!isCount(entry.size, inventory.MAX_FILE_BYTES)) throw new BackupError('too-large', 'file too large', entry.path);
    if (typeof entry.sha256 !== 'string' || !SHA256.test(entry.sha256)) throw new BackupError('corrupt', 'bad hash', entry.path);
    const lower = entry.path.toLowerCase();
    if (seen.has(lower)) throw new BackupError('unsafe-entry', 'duplicate path', entry.path);
    seen.add(lower);
    total += entry.size;
    if (total > inventory.MAX_TOTAL_BYTES) throw new BackupError('too-large', 'backup too large');
    return { path: entry.path, size: entry.size, sha256: entry.sha256 };
  });

  const source = raw.source && typeof raw.source === 'object' ? raw.source : {};
  const text = (value) => (typeof value === 'string' && value.length < 600 && !value.includes('\0') ? value : '');
  const playtime = validatePlaytime(raw.registry && raw.registry.playtime);
  if (!files.length && !playtime.length) throw new BackupError('empty');
  return {
    formatVersion: raw.formatVersion,
    appVersion: text(raw.appVersion).slice(0, 40),
    createdAt: text(raw.createdAt).slice(0, 40),
    source: { userData: text(source.userData), home: text(source.home) },
    signedOut: (Array.isArray(raw.signedOut) ? raw.signedOut : []).filter((k) => ACCOUNT_KEYS.has(k)),
    registry: { playtime },
    files,
    totalBytes: total,
  };
}

function limitedProgress(callback) {
  let last = -1;
  return (payload, force) => {
    if (typeof callback !== 'function') return;
    const percent = Math.max(0, Math.min(100, Math.round(payload.percent)));
    if (!force && percent === last) return;
    last = percent;
    try {
      callback({ ...payload, percent });
    } catch {
      /* a broken progress listener must not fail the backup */
    }
  };
}

/*
  entries: [{ rel, abs } | { rel, buffer }]. Writes to a sibling .partial file and swaps it in only
  once the trailer is down, so a failed export leaves nothing behind at the destination.
  Returns { files, totalBytes, archiveBytes }; `describe(files)` supplies the rest of the manifest.
*/
async function writeArchive({ destination, entries, describe, onProgress, expectedBytes = 0 }) {
  const temporary = `${destination}.${process.pid}.partial`;
  const report = limitedProgress(onProgress);
  const out = fs.createWriteStream(temporary, { flags: 'w' });
  const compressor = zlib.createZstdCompress({ params: zstdParams() });
  let failure = null;
  const failed = new Promise((_, reject) => {
    for (const stream of [out, compressor]) {
      stream.once('error', (err) => {
        failure = err;
        reject(err);
      });
    }
  });
  failed.catch(() => {});

  try {
    const header = Buffer.alloc(HEADER_BYTES);
    MAGIC.copy(header, 0);
    header.writeUInt32LE(FORMAT_VERSION, 8);
    out.write(header);
    compressor.pipe(out, { end: false });

    const files = [];
    let total = 0;
    for (const entry of entries) {
      const hash = crypto.createHash('sha256');
      let size = 0;
      const source = entry.buffer ? [entry.buffer] : fs.createReadStream(entry.abs);
      for await (const chunk of source) {
        size += chunk.length;
        total += chunk.length;
        if (size > inventory.MAX_FILE_BYTES) throw new BackupError('too-large', 'file too large', entry.rel);
        if (total > inventory.MAX_TOTAL_BYTES) throw new BackupError('too-large', 'profile too large');
        hash.update(chunk);
        if (failure) throw failure;
        if (!compressor.write(chunk)) await Promise.race([once(compressor, 'drain'), failed]);
        report({ phase: 'writing', percent: expectedBytes ? (total / expectedBytes) * 100 : 0, itemName: entry.rel });
      }
      files.push({ path: entry.rel, size, sha256: hash.digest('hex') });
    }

    compressor.end();
    await Promise.race([once(compressor, 'end'), failed]);
    const manifest = Buffer.from(JSON.stringify({ format: FORMAT, formatVersion: FORMAT_VERSION, ...describe(files), files }), 'utf8');
    if (manifest.length > MAX_MANIFEST_BYTES) throw new BackupError('too-large', 'manifest too large');
    const trailer = Buffer.alloc(TRAILER_BYTES);
    trailer.writeUInt32LE(manifest.length, 0);
    crypto.createHash('sha256').update(manifest).digest().copy(trailer, 4);
    END_MAGIC.copy(trailer, 36);
    out.write(manifest);
    out.end(trailer);
    await Promise.race([finished(out), failed]);

    replaceFileSync(temporary, destination);
    report({ phase: 'writing', percent: 100 }, true);
    return { files, totalBytes: total, archiveBytes: fs.statSync(destination).size };
  } catch (err) {
    out.destroy();
    compressor.destroy();
    unlinkForce(temporary);
    throw err;
  }
}

// Reads and validates the header and trailer; the payload is not touched.
async function readManifest(file) {
  let handle;
  try {
    handle = await fs.promises.open(file, 'r');
  } catch (err) {
    throw new BackupError('unreadable', err.message);
  }
  try {
    const { size } = await handle.stat();
    if (size < HEADER_BYTES + TRAILER_BYTES) throw new BackupError('not-a-backup');
    const header = Buffer.alloc(HEADER_BYTES);
    await handle.read(header, 0, HEADER_BYTES, 0);
    if (!header.subarray(0, 8).equals(MAGIC)) throw new BackupError('not-a-backup');
    const version = header.readUInt32LE(8);
    if (version > FORMAT_VERSION) throw new BackupError('format-too-new', undefined, { formatVersion: version });
    const trailer = Buffer.alloc(TRAILER_BYTES);
    await handle.read(trailer, 0, TRAILER_BYTES, size - TRAILER_BYTES);
    if (!trailer.subarray(36).equals(END_MAGIC)) throw new BackupError('corrupt', 'truncated');
    const length = trailer.readUInt32LE(0);
    if (length > MAX_MANIFEST_BYTES || length > size - HEADER_BYTES - TRAILER_BYTES) throw new BackupError('corrupt', 'bad manifest length');
    const bytes = Buffer.alloc(length);
    await handle.read(bytes, 0, length, size - TRAILER_BYTES - length);
    if (!crypto.createHash('sha256').update(bytes).digest().equals(trailer.subarray(4, 36))) {
      throw new BackupError('corrupt', 'manifest hash mismatch');
    }
    let raw;
    try {
      raw = JSON.parse(bytes.toString('utf8'));
    } catch {
      throw new BackupError('corrupt', 'manifest unreadable');
    }
    return { manifest: validateManifest(raw), payloadEnd: size - TRAILER_BYTES - length };
  } finally {
    await handle.close();
  }
}

/*
  Streams the payload into `destDir`, one new file per manifest entry (opened 'wx', so nothing that
  already exists there, links included, is written through), checking each hash and the exact total.
*/
async function extractPayload(file, { manifest, payloadEnd }, destDir, onProgress) {
  const report = limitedProgress(onProgress);
  const root = path.resolve(destDir);
  const source = fs.createReadStream(file, { start: HEADER_BYTES, end: payloadEnd - 1 });
  const decoder = zlib.createZstdDecompress();
  source.once('error', (err) => decoder.destroy(err));
  source.pipe(decoder);

  const { files, totalBytes } = manifest;
  let index = 0;
  let current = null;
  let done = 0;

  const closeCurrent = async () => {
    await current.handle.close();
    if (current.hash.digest('hex') !== current.entry.sha256) {
      throw new BackupError('hash-mismatch', 'file does not match its hash', current.entry.path);
    }
    current = null;
  };
  const openNext = async () => {
    const entry = files[index++];
    const target = path.resolve(root, ...entry.path.split('/'));
    if (!target.startsWith(root + path.sep)) throw new BackupError('unsafe-entry', 'escapes the folder', entry.path);
    await fs.promises.mkdir(path.dirname(target), { recursive: true });
    current = { entry, written: 0, hash: crypto.createHash('sha256'), handle: await fs.promises.open(target, 'wx') };
    if (entry.size === 0) await closeCurrent();
  };

  try {
    for await (const chunk of decoder) {
      let offset = 0;
      while (offset < chunk.length) {
        if (!current) {
          if (index >= files.length) throw new BackupError('corrupt', 'data after the last file');
          await openNext();
          continue;
        }
        const take = Math.min(chunk.length - offset, current.entry.size - current.written);
        const part = chunk.subarray(offset, offset + take);
        await current.handle.write(part);
        current.hash.update(part);
        current.written += take;
        offset += take;
        done += take;
        if (current.written === current.entry.size) await closeCurrent();
        report({ phase: 'extracting', percent: totalBytes ? (done / totalBytes) * 100 : 100, itemName: files[index - 1].path });
      }
    }
    while (!current && index < files.length && files[index].size === 0) await openNext();
    if (current || index < files.length) throw new BackupError('corrupt', 'payload is shorter than the manifest');
  } catch (err) {
    if (current) await current.handle.close().catch(() => {});
    source.destroy();
    decoder.destroy();
    if (err instanceof BackupError) throw err;
    throw new BackupError('corrupt', err && err.message ? err.message : String(err));
  }
  report({ phase: 'extracting', percent: 100 }, true);
}

module.exports = {
  FORMAT,
  FORMAT_VERSION,
  BackupError,
  validateManifest,
  writeArchive,
  readManifest,
  extractPayload,
};
