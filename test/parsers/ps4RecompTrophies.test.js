'use strict';

/*
  The trophy formats of an original PS4 dump, built synthetically: the TRP container, plain and
  encrypted trophy XML, npbind.dat and param.sfo. The encrypted files use a test key, never the
  retail one, so the decryption path is proved without shipping anything from a real game.
*/
const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');

const trophies = require(path.join(__dirname, '..', '..', 'app', 'parser', 'ps4RecompTrophies.js'));
const fixture = require(path.join(__dirname, '..', 'helpers', 'ps4Recomp.js'));

test('a TRP container yields its named entries and refuses one pointing outside it', () => {
  const buffer = fixture.buildTrp({ 'TROP.SFM': '<trophyconf/>', 'TROP000.PNG': fixture.png() });
  const files = trophies.readTrp(buffer);
  assert.deepEqual([...files.keys()].sort(), ['TROP.SFM', 'TROP000.PNG']);
  assert.equal(files.get('TROP.SFM').toString(), '<trophyconf/>');

  const broken = Buffer.from(buffer);
  broken.writeBigUInt64BE(BigInt(broken.length + 10), 0x60 + 32);
  assert.equal(trophies.readTrp(broken), null, 'an entry past the end voids the container');
  assert.equal(trophies.readTrp(Buffer.alloc(200)), null, 'no magic, no container');
});

test('an encrypted TROP.ESFM decrypts with the matching key and NP id only', () => {
  const xml = fixture.trophyXml();
  const esfm = fixture.encryptEsfm(xml, fixture.NPCOMMID, fixture.TEST_KEY);
  const plain = trophies.decryptEsfm(esfm, fixture.NPCOMMID, fixture.TEST_KEY);
  assert.match(plain, /<title-name>Bloodborne<\/title-name>/);
  assert.equal(trophies.decryptEsfm(esfm, 'NPWR00000_00', fixture.TEST_KEY), '', 'another NP id derives another key');
  assert.equal(trophies.decryptEsfm(esfm, fixture.NPCOMMID, trophies.RETAIL_TROPHY_KEY), '', 'the wrong key reads nothing');
  assert.equal(trophies.RETAIL_TROPHY_KEY, '21F41A6BAD8A1D3ECA7AD586C101B7A9');
});

test('trophy XML gives ids, native grades, hidden flags and texts, and refuses entities', () => {
  const parsed = trophies.parseTrophyXml(fixture.trophyXml());
  assert.equal(parsed.title, 'Bloodborne');
  assert.equal(parsed.npcommid, fixture.NPCOMMID);
  assert.deepEqual(
    parsed.trophies.map((t) => [t.id, t.grade, t.hidden]),
    [['0', 'P', false], ['1', 'B', false], ['2', 'G', true]]
  );
  assert.equal(parsed.trophies[1].name, 'Hunter');
  const french = trophies.parseTrophyXml(fixture.trophyXml({ language: 'fr' }));
  assert.equal(french.trophies[2].detail, "Voir l'aube", 'escaped text is decoded');

  const withEntity = `<!DOCTYPE x [<!ENTITY a "boom">]>${fixture.trophyXml()}`;
  assert.equal(trophies.parseTrophyXml(withEntity), null, 'a DTD is never expanded, the document is refused');
});

test('npbind.dat binds each trophy set slot to its NP communication id', () => {
  const bindings = trophies.readNpbind(
    fixture.buildNpbind([
      { npcommid: 'NPWR08661_00', label: 0 },
      { npcommid: 'NPWR08662_00', label: 1 },
    ])
  );
  assert.equal(bindings.get(0), 'NPWR08661_00');
  assert.equal(bindings.get(1), 'NPWR08662_00');
  assert.equal(trophies.readNpbind(Buffer.alloc(300)).size, 0, 'not an npbind.dat, no binding');
});

test('param.sfo gives the title and title id', () => {
  const sfo = trophies.readSfo(fixture.buildSfo({ TITLE: 'Bloodborne', TITLE_ID: 'CUSA00900' }));
  assert.equal(sfo.TITLE, 'Bloodborne');
  assert.equal(sfo.TITLE_ID, 'CUSA00900');
});

test('a trophies.tsv says its language with #lang, by the console code', () => {
  const french = trophies.parseTrophyTsv('#lang\t2\n#title\tJeu\n1\tB\t0\tChasseur\tVaincre une bête\n');
  assert.equal(french.language, 'french');
  assert.equal(french.trophies[0].name, 'Chasseur');
  assert.equal(trophies.parseTrophyTsv('#lang\t01\n1\tB\t0\tHunter\t\n').language, 'english', 'a zero-padded code');
  assert.equal(trophies.parseTrophyTsv('1\tB\t0\tHunter\t\n').language, '', 'no header: the default document');
  assert.equal(trophies.parseTrophyTsv('#lang\t99\n1\tB\t0\tHunter\t\n').language, '', 'an unknown code is no language');
});

test('a crafted trophy document costs linear time, not a stall per unclosed tag', () => {
  const unclosed = `<trophyconf><title-name>${'<trophy id="1" ttype="B">'.repeat(40000)}<name><![CDATA[`.repeat(2);
  const started = Date.now();
  assert.equal(trophies.parseTrophyXml(unclosed), null);
  const padded = fixture.trophyXml() + '<trophy id="9" ttype="B">'.repeat(40000);
  assert.equal(trophies.parseTrophyXml(padded).trophies.length, 3, 'the real trophies before the junk are still read');
  assert.ok(Date.now() - started < 1500, `two 2 MB documents took ${Date.now() - started} ms`);
});

test('an icon far larger than a trophy icon is dropped', () => {
  const huge = Buffer.concat([fixture.png(), Buffer.alloc(2 * 1024 * 1024)]);
  const read = trophies.readContainer(new Map([['TROP000.PNG', huge], ['TROP001.PNG', fixture.png()]]), '', '');
  assert.deepEqual([...read.icons.keys()], ['1']);
});

test('trophy icons must be PNGs of bounded size', () => {
  assert.equal(trophies.isTrophyPng(fixture.png(2, 2)), true);
  assert.equal(trophies.isTrophyPng(fixture.png(4096, 1)), false, 'wider than any trophy icon');
  assert.equal(trophies.isTrophyPng(Buffer.from('GIF89a................................')), false);
});

test('a container keeps one document per language, US English before UK English', () => {
  const files = new Map([
    ['TROP.SFM', Buffer.from(fixture.trophyXml())],
    ['TROP_18.SFM', Buffer.from(fixture.trophyXml({ title: 'UK title' }))],
    ['TROP_01.SFM', Buffer.from(fixture.trophyXml({ title: 'US title' }))],
    ['TROP_02.ESFM', fixture.encryptEsfm(fixture.trophyXml({ language: 'fr' }), fixture.NPCOMMID, fixture.TEST_KEY)],
    ['TROP001.PNG', fixture.png()],
    ['TROP002.PNG', Buffer.from('not a png')],
  ]);
  const read = trophies.readContainer(files, fixture.NPCOMMID, fixture.TEST_KEY);
  assert.equal(read.documents.get('').title, 'Bloodborne');
  assert.equal(read.documents.get('english').title, 'US title');
  assert.equal(read.documents.get('french').trophies[1].name, 'Chasseur');
  assert.deepEqual([...read.icons.keys()], ['1'], 'an invalid icon is dropped');
});
