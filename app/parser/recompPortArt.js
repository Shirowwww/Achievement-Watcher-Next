'use strict';

/*
  The achievement pictures of the recompiled ports in recompPortTable.js, kept in the app's cache:
  copied from the launcher's own folder (SMS Launcher unpacks its set beside its saves), or fetched
  once from the port's public repository at a pinned commit, one file per achievement (Ghostship) or
  one sheet of cells (Super Mario Bros. Remastered) cut into small SVG files that each show a cell.
  Nothing is bundled with the app. Dusklight and DKR-R draw theirs in code: they have none.
*/

const fs = require('fs');
const path = require('path');

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 8000;
const FETCHES_AT_ONCE = 6;
// After a failed download (offline, say) a port waits this long before asking again.
const RETRY_AFTER_MS = 10 * 60 * 1000;
const SAFE_NAME = /^[\w.-]{1,80}$/;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const failedAt = new Map();

const isPng = (bytes) => bytes.length > 24 && bytes.length <= MAX_IMAGE_BYTES && bytes.subarray(0, 8).equals(PNG_SIGNATURE);
const fileUrl = (file) => 'file:///' + file.replace(/\\/g, '/');

function isPlainFile(file) {
  try {
    const stat = fs.lstatSync(file);
    return stat.isFile() && !stat.isSymbolicLink();
  } catch {
    return false;
  }
}

function readPng(file) {
  try {
    if (!isPlainFile(file) || fs.statSync(file).size > MAX_IMAGE_BYTES) return null;
    const bytes = fs.readFileSync(file);
    return isPng(bytes) ? bytes : null;
  } catch {
    return null;
  }
}

function writeFile(file, data) {
  const temporary = `${file}.${process.pid}.tmp`;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(temporary, data);
  try {
    fs.renameSync(temporary, file);
  } catch (err) {
    fs.rmSync(temporary, { force: true });
    throw err;
  }
}

// The file an achievement's picture is cached as, or '' when the port has none.
function cachedFile(port, entry, dataRoot) {
  const from = port.icons && port.icons.from;
  const key = from === 'files' ? entry.icon : entry.name;
  if (!from || !dataRoot || !SAFE_NAME.test(String(key || ''))) return '';
  return path.join(dataRoot, 'steam_cache', 'recompports', port.id, `${key}.${from === 'sheet' ? 'svg' : 'png'}`);
}

// One cell of a sheet, as an SVG showing only that cell, its pixels kept square.
function cellSvg(sheet, [column, row], size) {
  const width = sheet.readUInt32BE(16);
  const height = sheet.readUInt32BE(20);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${column * size} ${row * size} ${size} ${size}" width="128" height="128">` +
    `<image href="data:image/png;base64,${sheet.toString('base64')}" width="${width}" height="${height}" style="image-rendering:pixelated"/></svg>`
  );
}

async function download(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!isPng(bytes)) throw new Error(`not a PNG: ${url}`);
  return bytes;
}

function copyFromLauncher(port, info, missing) {
  if (!info.saveFile) return;
  const folder = path.join(path.dirname(String(info.saveFile)), ...port.icons.folder);
  for (const [file, entry] of missing) {
    const bytes = readPng(path.join(folder, `${entry.name}.png`));
    if (bytes) writeFile(file, bytes);
  }
}

async function fetchFromRepository(port, missing) {
  const { from, url, cell } = port.icons;
  if (from === 'sheet') {
    const sheet = await download(url);
    for (const [file, entry] of missing) if (Array.isArray(entry.icon) && entry.icon.length === 2) writeFile(file, cellSvg(sheet, entry.icon.map(Number), cell));
    return;
  }
  for (let index = 0; index < missing.length; index += FETCHES_AT_ONCE) {
    const batch = missing.slice(index, index + FETCHES_AT_ONCE);
    const pictures = await Promise.all(batch.map(([, entry]) => download(`${url}${entry.icon}.png`)));
    batch.forEach(([file], position) => writeFile(file, pictures[position]));
  }
}

// Brings the cache up to date for the pictures not in it yet; throws when a download fails.
async function ensurePictures(port, info, schema, dataRoot) {
  if (!port.icons) return;
  const missing = new Map();
  for (const entry of schema.achievements) {
    const file = cachedFile(port, entry, dataRoot);
    if (file && !missing.has(file) && !isPlainFile(file)) missing.set(file, entry);
  }
  if (missing.size === 0) return;
  if (port.icons.from === 'launcher') return copyFromLauncher(port, info, [...missing]);
  if (Date.now() - (failedAt.get(port.id) || 0) < RETRY_AFTER_MS) return;
  try {
    await fetchFromRepository(port, [...missing]);
  } catch (err) {
    failedAt.set(port.id, Date.now());
    throw err;
  }
}

// The cached picture of an achievement as a file:/// url, or ''.
function pictureOf(port, entry, dataRoot) {
  const file = cachedFile(port, entry, dataRoot);
  return file && isPlainFile(file) ? fileUrl(file) : '';
}

module.exports = { ensurePictures, pictureOf };
