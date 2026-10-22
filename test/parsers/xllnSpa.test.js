'use strict';

/*
  The SPAFILE reader: a Games for Windows LIVE executable carries its achievement list as an XDBF
  container in an RT_RCDATA resource. Both halves are exercised against binaries built in
  test/helpers/xlln.js, because the real inputs are game executables nobody can commit - and because
  what matters most is that a malformed one produces an error instead of a read past the buffer.
*/
const assert = require('assert');
const path = require('path');
const spa = require(path.join(__dirname, '..', '..', 'app', 'parser', 'xllnSpa.js'));
const { PNG, SAMPLE_TITLE_ID, sampleSpa, peWith, xach, xdbf, xthd } = require(path.join(__dirname, '..', 'helpers', 'xlln.js'));

const parsed = spa.parseSpa(sampleSpa());

assert.strictEqual(parsed.titleId, SAMPLE_TITLE_ID, 'the title header carries the title id');
assert.strictEqual(parsed.achievements.length, 2);
assert.strictEqual(parsed.achievements[0].gamerscore, 20);
assert.strictEqual(parsed.achievements[1].flags & 0x1, 0x1, 'the secret achievement keeps its hidden flag');
assert.strictEqual(parsed.images.size, 1, 'the PNG icon is kept, keyed by its image id');
assert.ok(parsed.images.get(100).equals(PNG));

assert.deepStrictEqual([...parsed.stringsByLanguage.keys()].sort((a, b) => a - b), [1, 4]);
assert.strictEqual(parsed.stringsByLanguage.get(1).get(10), 'First Steps');
assert.strictEqual(parsed.stringsByLanguage.get(4).get(10), 'Premiers pas');

assert.strictEqual(spa.languageName(1), 'english');
assert.strictEqual(spa.languageName(4), 'french');
assert.strictEqual(spa.languageName(99), 'xbox-language-99', 'an unmapped language keeps a stable name');

assert.strictEqual(spa.pickLanguage(parsed, 'french'), 4);
assert.strictEqual(spa.pickLanguage(parsed, 'english'), 1);
assert.strictEqual(spa.pickLanguage(parsed, 'thai'), 1, 'a language the game does not ship falls back to English');

assert.strictEqual(spa.titleName(parsed), 'Sample GFWL Game');
assert.strictEqual(spa.titleName(parsed, 'french'), 'Jeu GFWL exemple');

// A .spa file on its own is accepted; so is the same container inside an executable.
assert.ok(spa.extractSpa(sampleSpa()).equals(sampleSpa()), 'an XDBF buffer is passed through');
const extracted = spa.extractSpa(peWith(sampleSpa()));
assert.ok(extracted.equals(sampleSpa()), 'the SPAFILE resource is found inside a PE image');
assert.strictEqual(spa.parseSpa(extracted).achievements.length, 2);

// Refusals.
assert.throws(() => spa.extractSpa(Buffer.alloc(0x200)), /not a PE executable/);
assert.throws(() => spa.extractSpa(Buffer.alloc(16)), /too small/);
assert.throws(() => spa.extractSpa(peWith(sampleSpa(), { resourceType: 24 })), /no RT_RCDATA/, 'other resources but no RCDATA');
assert.throws(() => spa.extractSpa(peWith(sampleSpa(), { resourceName: 'OTHER' })), /no SPAFILE/, 'an unrelated RCDATA resource is not a SPAFILE');
assert.throws(() => spa.extractSpa(peWith(Buffer.from('not a container at all'))), /not an XDBF container/);

assert.throws(() => spa.parseSpa(Buffer.alloc(8)), /too small/);
assert.throws(() => spa.parseSpa(xdbf([{ namespace: 1, id: 1, data: xthd(1) }])), /no achievement table/);
assert.throws(
  () =>
    spa.parseSpa(
      xdbf([
        {
          namespace: 1,
          id: 2,
          data: xach([{ id: 1, titleStringId: 1, unlockedDescriptionId: 2, lockedDescriptionId: 3, imageId: 4, gamerscore: 5 }]),
        },
      ])
    ),
  /no string table/
);

// An entry pointing past the end of the file must be reported, never read.
const truncated = sampleSpa();
truncated.writeUInt32BE(0x7000000, 24 + 14); // the first entry's length
assert.throws(() => spa.parseSpa(truncated), /outside the buffer/);

console.log('PASS: the XLiveLessNess SPAFILE reader decodes a title and refuses malformed ones');

// Brazilian and Latin American players read the console's one Portuguese and one Spanish table.
{
  const table = (text) => new Map([[10, text]]);
  const regional = { stringsByLanguage: new Map([[1, table('en')], [5, table('es')], [9, table('pt')]]) };
  assert.strictEqual(spa.pickLanguage(regional, 'brazilian'), 9);
  assert.strictEqual(spa.pickLanguage(regional, 'latam'), 5);
  assert.strictEqual(spa.pickLanguage(regional, 'turkish'), 1, 'a language the game does not ship falls back to English');
  console.log('PASS: regional language variants read the table the console ships');
}

// The XLAST source (XSRC) and stats (XVC2) sections are optional: one that points past the end of the
// file is skipped and logged, while a bad achievement, string, title or image entry still rejects the SPA.
{
  const { xstr } = require(path.join(__dirname, '..', 'helpers', 'xlln.js'));
  const XSRC = 0x58535243;
  const XVC2 = 0x58564332;
  const base = [
    { namespace: 1, id: 1, data: xthd(SAMPLE_TITLE_ID) },
    { namespace: 1, id: 2, data: xach([{ id: 1, titleStringId: 10, unlockedDescriptionId: 11, lockedDescriptionId: 12, imageId: 100, gamerscore: 5, flags: 0x8 }]) },
    { namespace: 3, id: 1, data: xstr(new Map([[0x8000, 'Game'], [10, 'One']])) },
    { namespace: 2, id: 100, data: PNG },
  ];
  // The entry at `index` claims 0x7000000 bytes, far past the end of the buffer.
  const withBrokenEntry = (extra, index) => {
    const buffer = xdbf([...base, ...extra]);
    buffer.writeUInt32BE(0x7000000, 24 + index * 18 + 14);
    return buffer;
  };
  const optional = (id) => ({ namespace: 1, id, data: Buffer.from('optional data') });

  const skipped = [];
  const onSkip = (message) => skipped.push(message);
  const noXsrc = spa.parseSpa(withBrokenEntry([optional(XSRC), optional(XVC2)], base.length), { onSkip });
  assert.strictEqual(noXsrc.achievements.length, 1, 'the achievements survive a broken optional section');
  assert.strictEqual(skipped.length, 1, 'only the entry that is out of range is reported');
  assert.match(skipped[0], /XSRC/);

  const noXvc2 = spa.parseSpa(withBrokenEntry([optional(XSRC), optional(XVC2)], base.length + 1), { onSkip });
  assert.strictEqual(noXvc2.stringsByLanguage.size, 1);
  assert.match(skipped[1], /XVC2/);
  assert.doesNotThrow(() => spa.parseSpa(withBrokenEntry([optional(XVC2)], base.length)), 'logging is optional');

  // Every other section stays strict.
  assert.throws(() => spa.parseSpa(withBrokenEntry([], 1)), /outside the buffer/, 'the achievement table');
  assert.throws(() => spa.parseSpa(withBrokenEntry([], 2)), /outside the buffer/, 'a string table');
  assert.throws(() => spa.parseSpa(withBrokenEntry([], 0)), /outside the buffer/, 'the title header');
  assert.throws(() => spa.parseSpa(withBrokenEntry([], 3)), /outside the buffer/, 'an image');
  assert.throws(() => spa.parseSpa(withBrokenEntry([optional(0x1234)], base.length)), /outside the buffer/, 'an unknown metadata entry');
  assert.throws(() => spa.parseSpa(withBrokenEntry([{ namespace: 3, id: XSRC, data: Buffer.from('x') }], base.length)), /outside the buffer/, 'the id only counts in the metadata namespace');

  console.log('PASS: a broken optional XSRC or XVC2 section is skipped, any other broken section still rejects');
}
