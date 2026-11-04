'use strict';

/*
  What a preset folder holds, as one hash of its files' names and contents. Dates are left out: an
  update or a copy rewrites every file's date without changing the preset, and a picture drawn for
  the same files must still match, the pictures shipped with the app included.
*/

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// A file is hashed again only once its size or date moves.
const fileHashes = new Map();

function fileHash(file, stat) {
  const known = fileHashes.get(file);
  if (known && known.size === stat.size && known.mtimeMs === stat.mtimeMs) return known.hash;
  const hash = crypto.createHash('sha1').update(fs.readFileSync(file)).digest('hex');
  fileHashes.set(file, { size: stat.size, mtimeMs: stat.mtimeMs, hash });
  return hash;
}

function listFiles(dir, prefix, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) listFiles(full, relative, out);
    else if (entry.isFile()) out.push({ relative, full });
  }
  return out;
}

function contentSignature(dirs) {
  const hash = crypto.createHash('sha1');
  dirs.filter(Boolean).forEach((dir, index) => {
    let files;
    try {
      files = listFiles(dir, '', []).sort((a, b) => (a.relative < b.relative ? -1 : a.relative > b.relative ? 1 : 0));
    } catch {
      hash.update(`${index}:missing\n`);
      return;
    }
    for (const { relative, full } of files) {
      try {
        hash.update(`${index}:${relative}:${fileHash(full, fs.statSync(full))}\n`);
      } catch {
        hash.update(`${index}:${relative}:unreadable\n`);
      }
    }
  });
  return hash.digest('hex');
}

module.exports = { contentSignature };
