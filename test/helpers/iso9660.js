'use strict';

/*
  A small ISO 9660 image built from { 'DIR/FILE.EXT': body }: the 16 empty system sectors, a
  primary volume descriptor, the terminator, then every directory (records packed so none crosses a
  sector) and every file. Enough for the reader to walk; nothing from a real disc.
*/
const SECTOR = 2048;

function node() {
  return { dirs: new Map(), files: new Map() };
}

function treeOf(files) {
  const root = node();
  for (const [inner, body] of Object.entries(files)) {
    const parts = inner.split('/');
    let dir = root;
    for (const part of parts.slice(0, -1)) {
      if (!dir.dirs.has(part)) dir.dirs.set(part, node());
      dir = dir.dirs.get(part);
    }
    dir.files.set(parts[parts.length - 1], Buffer.isBuffer(body) ? body : Buffer.from(body, 'utf8'));
  }
  return root;
}

const recordLength = (name) => {
  const length = 33 + Buffer.byteLength(name, 'latin1');
  return length + (length % 2);
};

// The records of a directory in order, each { name, target } with '.' and '..' first.
function recordsOf(dir, parent) {
  const children = [...[...dir.dirs].map(([name, child]) => ({ name, target: child })), ...[...dir.files].map(([name, body]) => ({ name: `${name};1`, target: { body } }))];
  children.sort((a, b) => a.name.localeCompare(b.name, 'en'));
  return [{ name: '\0', target: dir }, { name: '\x01', target: parent }, ...children];
}

// The bytes a directory takes once its records are packed into whole sectors.
function directoryBytes(records) {
  let at = 0;
  for (const record of records) {
    const length = recordLength(record.name);
    if ((at % SECTOR) + length > SECTOR) at = (Math.floor(at / SECTOR) + 1) * SECTOR;
    at += length;
  }
  return Math.ceil(at / SECTOR) * SECTOR;
}

function writeRecord(out, at, name, target) {
  const length = recordLength(name);
  const isDirectory = !target.body;
  const bytes = isDirectory ? target.bytes : target.body.length;
  out[at] = length;
  out.writeUInt32LE(target.lba, at + 2);
  out.writeUInt32BE(target.lba, at + 6);
  out.writeUInt32LE(bytes, at + 10);
  out.writeUInt32BE(bytes, at + 14);
  out[at + 25] = isDirectory ? 2 : 0;
  out.writeUInt16LE(1, at + 28);
  out.writeUInt16BE(1, at + 30);
  out[at + 32] = Buffer.byteLength(name, 'latin1');
  out.write(name, at + 33, 'latin1');
  return length;
}

function buildIso(files) {
  const root = treeOf(files);
  const directories = [];
  const blobs = [];
  const queue = [{ dir: root, parent: root }];
  while (queue.length) {
    const { dir, parent } = queue.shift();
    dir.records = recordsOf(dir, parent);
    dir.bytes = directoryBytes(dir.records);
    directories.push(dir);
    for (const record of dir.records.slice(2)) {
      if (record.target.body) blobs.push(record.target);
      else queue.push({ dir: record.target, parent: dir });
    }
  }
  let next = 18;
  for (const dir of directories) {
    dir.lba = next;
    next += dir.bytes / SECTOR;
  }
  for (const blob of blobs) {
    blob.lba = next;
    next += Math.max(1, Math.ceil(blob.body.length / SECTOR));
  }
  const out = Buffer.alloc(next * SECTOR);
  const pvd = 16 * SECTOR;
  out[pvd] = 1;
  out.write('CD001', pvd + 1, 'latin1');
  out[pvd + 6] = 1;
  out.writeUInt32LE(next, pvd + 80);
  out.writeUInt32BE(next, pvd + 84);
  out.writeUInt16LE(SECTOR, pvd + 128);
  out.writeUInt16BE(SECTOR, pvd + 130);
  writeRecord(out, pvd + 156, '\0', root);
  out[17 * SECTOR] = 255;
  out.write('CD001', 17 * SECTOR + 1, 'latin1');
  out[17 * SECTOR + 6] = 1;
  for (const dir of directories) {
    let at = 0;
    for (const record of dir.records) {
      if ((at % SECTOR) + recordLength(record.name) > SECTOR) at = (Math.floor(at / SECTOR) + 1) * SECTOR;
      at += writeRecord(out, dir.lba * SECTOR + at, record.name, record.target);
    }
  }
  for (const blob of blobs) blob.body.copy(out, blob.lba * SECTOR);
  return out;
}

module.exports = { buildIso, SECTOR };
