'use strict';

/*
  Builders for XLiveLessNess test fixtures.

  The real inputs are Games for Windows LIVE game executables, which cannot be committed, so the
  suites build the binaries they read: an XDBF/SPAFILE container, a PE32 image carrying it as an
  RT_RCDATA resource, and an install folder around them with a profile's unlock records.
*/

const fs = require('node:fs');
const path = require('node:path');

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('fake image data')]);

function xach(records) {
  const body = Buffer.alloc(14 + records.length * 36);
  body.write('XACH', 0, 'ascii');
  body.writeUInt32BE(1, 4);
  body.writeUInt32BE(body.length, 8);
  body.writeUInt16BE(records.length, 12);
  records.forEach((record, index) => {
    const at = 14 + index * 36;
    body.writeUInt16BE(record.id, at);
    body.writeUInt16BE(record.titleStringId, at + 2);
    body.writeUInt16BE(record.unlockedDescriptionId, at + 4);
    body.writeUInt16BE(record.lockedDescriptionId, at + 6);
    body.writeUInt32BE(record.imageId, at + 8);
    body.writeUInt16BE(record.gamerscore, at + 12);
    body.writeUInt32BE(record.flags || 0, at + 16);
  });
  return body;
}

function xstr(strings) {
  const rows = [...strings.entries()].map(([id, text]) => ({ id, text: Buffer.from(text, 'utf8') }));
  const body = Buffer.alloc(14 + rows.reduce((total, row) => total + 4 + row.text.length, 0));
  body.write('XSTR', 0, 'ascii');
  body.writeUInt16BE(rows.length, 12);
  let at = 14;
  for (const row of rows) {
    body.writeUInt16BE(row.id, at);
    body.writeUInt16BE(row.text.length, at + 2);
    row.text.copy(body, at + 4);
    at += 4 + row.text.length;
  }
  return body;
}

function xthd(titleId) {
  const body = Buffer.alloc(16);
  body.write('XTHD', 0, 'ascii');
  body.writeUInt32BE(titleId, 12);
  return body;
}

// entries: [{ namespace, id, data }]
function xdbf(entries) {
  const header = Buffer.alloc(24);
  header.write('XDBF', 0, 'ascii');
  header.writeUInt32BE(0x00010000, 4);
  header.writeUInt32BE(entries.length, 8);
  header.writeUInt32BE(entries.length, 12);
  header.writeUInt32BE(0, 16);
  header.writeUInt32BE(0, 20);

  const table = Buffer.alloc(entries.length * 18);
  const blobs = [];
  let offset = 0;
  entries.forEach((entry, index) => {
    const at = index * 18;
    table.writeUInt16BE(entry.namespace, at);
    table.writeUInt32BE(0, at + 2); // high half of the 64-bit id
    table.writeUInt32BE(entry.id, at + 6);
    table.writeUInt32BE(offset, at + 10);
    table.writeUInt32BE(entry.data.length, at + 14);
    blobs.push(entry.data);
    offset += entry.data.length;
  });

  return Buffer.concat([header, table, ...blobs]);
}

const SAMPLE_TITLE_ID = 0x4d5307d3;
const SAMPLE_TITLE_ID_HEX = '4D5307D3';

// Two achievements, one of them secret, in English and French, with one icon.
function sampleSpa(titleId = SAMPLE_TITLE_ID) {
  return xdbf([
    { namespace: 1, id: 1, data: xthd(titleId) },
    {
      namespace: 1,
      id: 2,
      data: xach([
        { id: 1, titleStringId: 10, unlockedDescriptionId: 11, lockedDescriptionId: 12, imageId: 100, gamerscore: 20, flags: 0 },
        { id: 2, titleStringId: 20, unlockedDescriptionId: 21, lockedDescriptionId: 22, imageId: 101, gamerscore: 50, flags: 0x1 },
      ]),
    },
    {
      namespace: 3,
      id: 1, // english
      data: xstr(
        new Map([
          [0x8000, 'Sample GFWL Game'],
          [10, 'First Steps'],
          [11, 'You took the first steps.'],
          [12, 'Take the first steps.'],
          [20, 'Secret Ending'],
          [21, 'You found the secret ending.'],
          [22, 'Keep playing.'],
        ])
      ),
    },
    {
      namespace: 3,
      id: 4, // french
      data: xstr(
        new Map([
          [0x8000, 'Jeu GFWL exemple'],
          [10, 'Premiers pas'],
          [11, 'Vous avez fait vos premiers pas.'],
          [12, 'Faites vos premiers pas.'],
        ])
      ),
    },
    { namespace: 2, id: 100, data: PNG },
  ]);
}

/*
  A PE32 image holding one resource section, laid out the way the reader walks it: the root
  directory, RT_RCDATA (id 10), the resource name, one language, then the data entry.
*/
function peWith(payload, { resourceType = 10, resourceName = 'SPAFILE' } = {}) {
  const nameBytes = Buffer.alloc(2 + resourceName.length * 2);
  nameBytes.writeUInt16LE(resourceName.length, 0);
  nameBytes.write(resourceName, 2, 'utf16le');

  const dirSize = 16 + 8; // a directory header plus its single entry
  const rootAt = 0;
  const typeAt = rootAt + dirSize;
  const nameDirAt = typeAt + dirSize;
  const nameStringAt = nameDirAt + dirSize;
  const dataEntryAt = nameStringAt + nameBytes.length;
  const payloadAt = dataEntryAt + 16;

  const resources = Buffer.alloc(payloadAt + payload.length);
  const directory = (at, namedCount, idCount) => {
    resources.writeUInt16LE(namedCount, at + 12);
    resources.writeUInt16LE(idCount, at + 14);
  };
  const entry = (at, nameValue, dataValue) => {
    resources.writeUInt32LE(nameValue >>> 0, at);
    resources.writeUInt32LE(dataValue >>> 0, at + 4);
  };

  directory(rootAt, 0, 1);
  entry(rootAt + 16, resourceType, 0x80000000 | typeAt);
  directory(typeAt, 1, 0);
  entry(typeAt + 16, 0x80000000 | nameStringAt, 0x80000000 | nameDirAt);
  directory(nameDirAt, 0, 1);
  entry(nameDirAt + 16, 1033, dataEntryAt);
  nameBytes.copy(resources, nameStringAt);

  const sectionRva = 0x1000;
  const sectionRaw = 0x400;
  resources.writeUInt32LE(sectionRva + payloadAt, dataEntryAt);
  resources.writeUInt32LE(payload.length, dataEntryAt + 4);
  payload.copy(resources, payloadAt);

  const image = Buffer.alloc(sectionRaw + resources.length);
  image.write('MZ', 0, 'ascii');
  const peAt = 0x80;
  image.writeUInt32LE(peAt, 0x3c);
  image.write('PE', peAt, 'ascii');
  image.writeUInt16LE(0x014c, peAt + 4); // i386
  image.writeUInt16LE(1, peAt + 6); // one section
  const optionalSize = 224; // the PE32 header plus its 16 data directories
  image.writeUInt16LE(optionalSize, peAt + 20);
  const optionalAt = peAt + 24;
  image.writeUInt16LE(0x10b, optionalAt); // PE32
  const directoriesAt = optionalAt + 96;
  image.writeUInt32LE(sectionRva, directoriesAt + 16); // the resource directory
  image.writeUInt32LE(resources.length, directoriesAt + 20);

  const sectionAt = optionalAt + optionalSize;
  image.write('.rsrc', sectionAt, 'ascii');
  image.writeUInt32LE(resources.length, sectionAt + 8);
  image.writeUInt32LE(sectionRva, sectionAt + 12);
  image.writeUInt32LE(resources.length, sectionAt + 16);
  image.writeUInt32LE(sectionRaw, sectionAt + 20);
  resources.copy(image, sectionRaw);
  return image;
}

// One 16-byte unlock record: id, the FILETIME halves, then the flags.
function unlockRecord(id, unixSeconds = 0, flags = 1) {
  const record = Buffer.alloc(16);
  record.writeUInt32LE(id, 0);
  if (unixSeconds > 0) {
    const ticks = (BigInt(unixSeconds) * 1000n + 11644473600000n) * 10000n;
    record.writeUInt32LE(Number(ticks & 0xffffffffn), 4);
    record.writeUInt32LE(Number(ticks >> 32n), 8);
  }
  record.writeUInt32LE(flags, 12);
  return record;
}

/*
  A complete install: the replacement runtime, the executable with its SPAFILE, the title config,
  and optionally a profile holding unlock records.
*/
function makeGameFolder(parent, name, { titleId = SAMPLE_TITLE_ID_HEX, runtime = true, config = true, spaBuffer = null, unlocks = null, profile = '0009000000000000' } = {}) {
  const dir = path.join(parent, name);
  fs.mkdirSync(dir, { recursive: true });
  if (runtime) fs.writeFileSync(path.join(dir, 'xlive.dll'), 'MZ');
  fs.writeFileSync(path.join(dir, 'game.exe'), peWith(spaBuffer || sampleSpa(parseInt(titleId, 16))));
  if (config) {
    fs.writeFileSync(
      path.join(dir, 'game.exe.cfg'),
      `<?xml version="1.0"?>\n<xlivelessness>\n  <titleid>${titleId.toLowerCase()}</titleid>\n  <titleversion>1.0.0.0</titleversion>\n</xlivelessness>\n`
    );
  }
  if (unlocks) {
    const profileDir = path.join(dir, 'XLiveLessNess', 'profile', 'title', titleId.toUpperCase(), profile);
    fs.mkdirSync(profileDir, { recursive: true });
    fs.writeFileSync(path.join(profileDir, 'achievements.dat'), Buffer.concat(unlocks));
  }
  return dir;
}

module.exports = {
  PNG,
  SAMPLE_TITLE_ID,
  SAMPLE_TITLE_ID_HEX,
  xach,
  xstr,
  xthd,
  xdbf,
  sampleSpa,
  peWith,
  unlockRecord,
  makeGameFolder,
};
