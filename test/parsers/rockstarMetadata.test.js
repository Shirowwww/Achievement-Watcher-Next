'use strict';

/*
  Social Club's metadata.dat: the achievement tables are read in Rockstar's order, which is what
  numbers the unlocks the achievements API returns. The buffers are built here in the same layout
  as the real file (checked against GTA V and GTA IV), so no game data ships with the tests.
*/

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const metadata = require('../../app/parser/rockstarMetadata.js');

// One string table: magic, eight big-endian u32s, u16 end offsets, UTF-8 pool.
function table(strings, { flag = 1, extraOffset = false } = {}) {
  const pool = Buffer.concat(strings.map((s) => Buffer.from(s, 'utf8')));
  const ends = [];
  let end = 0;
  for (const s of strings) ends.push((end += Buffer.byteLength(s, 'utf8')));
  if (extraOffset) ends.push(end);
  const header = Buffer.alloc(36);
  Buffer.from([1, 0, 2, 0]).copy(header, 0);
  [7, 99, flag, strings.length, ends.length, 0, ends.length * 2, pool.length].forEach((v, i) => header.writeUInt32BE(v, 4 + i * 4));
  const offsets = Buffer.alloc(ends.length * 2);
  ends.forEach((v, i) => offsets.writeUInt16BE(v, i * 2));
  return Buffer.concat([header, offsets, pool]);
}

const triples = (names) => names.flatMap((name) => [name, `${name} earned`, `${name} locked`]);

const ENGLISH = ['Welcome to Los Santos', 'Blitzed', 'Wanted: Alive Or Alive'];
const FRENCH = ['Bienvenue à Los Santos', 'Éclair', 'Recherché mort ou vif'];

function file() {
  return Buffer.concat([
    Buffer.from('\x00\x00\x00\x01META2024-02-01T15:54:51', 'latin1'),
    // A table of another kind, one offset more than strings, comes first in the real file too.
    table(['Base Jumping', 'Darts'], { flag: 0, extraOffset: true }),
    table(triples(FRENCH)),
    table(triples(ENGLISH)),
  ]);
}

test('every language table is read, names only, in Rockstar order', () => {
  assert.deepEqual(metadata.parseMetadata(file()), [FRENCH, ENGLISH]);
});

test('a truncated or foreign buffer gives no tables rather than garbage', () => {
  const whole = file();
  assert.deepEqual(metadata.parseMetadata(whole.subarray(0, whole.length - 5)), [FRENCH]);
  assert.deepEqual(metadata.parseMetadata(Buffer.from('not a metadata file')), []);
  assert.deepEqual(metadata.parseMetadata(null), []);
});

test('the schema is numbered by the table its names match, whatever its own order', () => {
  // The Steam release lists GTA V Enhanced by api name: not Rockstar's order.
  const schema = [
    { name: 'ACH00', displayName: 'Welcome to Los Santos' },
    { name: 'ACH27', displayName: 'Wanted: Alive or Alive' },
    { name: 'ACH42', displayName: 'Blitzed ' },
  ];
  assert.deepEqual(metadata.numbersForSchema(metadata.parseMetadata(file()), schema), { ACH00: 1, ACH42: 2, ACH27: 3 });
});

test('a schema that matches too little of any table is not numbered at all', () => {
  const schema = [
    { name: 'ACH00', displayName: 'Welcome to Los Santos' },
    { name: 'ACH01', displayName: 'Something else' },
    { name: 'ACH02', displayName: 'And another' },
  ];
  assert.equal(metadata.numbersForSchema(metadata.parseMetadata(file()), schema), null);
  assert.equal(metadata.numbersForSchema([], schema), null);
  assert.equal(metadata.numbersForSchema(metadata.parseMetadata(file()), []), null);
});

test('a name used twice in a table numbers neither achievement', () => {
  const tables = [['Twin', 'Twin', 'Solo', 'Other', 'More', 'Last', 'Six', 'Seven', 'Eight', 'Nine', 'Ten']];
  const schema = tables[0].map((displayName, i) => ({ name: `A${i}`, displayName }));
  assert.equal(metadata.numbersForSchema(tables, schema), null);
});

test('the files are found under Documents, and a later list fills what the first missed', (t) => {
  const documents = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-rockstar-meta-'));
  t.after(() => fs.rmSync(documents, { recursive: true, force: true }));
  const titles = path.join(documents, 'Rockstar Games', 'Social Club', 'Titles');
  fs.mkdirSync(path.join(titles, 'GTAV Enhanced'), { recursive: true });
  fs.mkdirSync(path.join(titles, 'Empty'), { recursive: true });
  fs.writeFileSync(path.join(titles, 'GTAV Enhanced', 'metadata.dat'), file());

  const files = metadata.metadataFiles([documents, path.join(documents, 'missing')]);
  assert.deepEqual(files, [path.join(titles, 'GTAV Enhanced', 'metadata.dat')]);

  // Ten achievements so one miss stays above the match threshold.
  const names = Array.from({ length: 10 }, (_, i) => `Achievement ${i + 1}`);
  fs.writeFileSync(files[0], table(triples(names)));
  const english = names.map((displayName, i) => ({ name: `A${i}`, displayName: i === 4 ? 'Renamed on Steam' : displayName }));
  const localized = names.map((displayName, i) => ({ name: `A${i}`, displayName }));
  const numbers = metadata.numbersFromFiles(files, [english, localized]);
  assert.equal(Object.keys(numbers).length, 10);
  assert.equal(numbers.A4, 5);
  assert.equal(metadata.numbersFromFiles([path.join(documents, 'nope.dat')], [english]), null);
});
