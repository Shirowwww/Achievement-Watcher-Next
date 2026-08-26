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
