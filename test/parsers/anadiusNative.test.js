'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const anadius = require('../../app/parser/anadiusNative.js');
const { readSaveFile, normalizeSaveEntry } = require('../../app/parser/emuSave.js');

const SAMPLE = `<Achievements GameName="EA SPORTS FC 24" ContentId="198235">
    <Achievement Id="38" Count="1" Progress="1" Grant="2023-10-21T17:55:15" Name="European Legend"/>
</Achievements>
`;
// A real LSX file: written at 19:55:15 in Paris (UTC+2 that day), it says 17:55:15. Grant is UTC.
const SAMPLE_GRANT = Date.UTC(2023, 9, 21, 17, 55, 15) / 1000;
const FC24_NAMES = { 'European Legend': 'ACH_EUROPEAN_LEGEND', 'Hat-Trick Hero': 'ACH_HATTRICK' };

function tempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-anadius-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function seedNative(root, xmlName, text) {
  const nativeDir = path.join(root, 'anadius', 'LSX emu');
  fs.mkdirSync(nativeDir, { recursive: true });
  fs.writeFileSync(path.join(nativeDir, xmlName), text);
  return nativeDir;
}

// #229: read as local time, a player at UTC+5 saw every unlock 5 hours early and no popup at all.
test('the LSX sample is read with its game, id, name and Grant as UTC, whatever the time zone', (t) => {
  const zone = process.env.TZ;
  process.env.TZ = 'Asia/Karachi';
  t.after(() => {
    if (zone === undefined) delete process.env.TZ;
    else process.env.TZ = zone;
  });
  const parsed = anadius.parseNativeXml(`\uFEFF${SAMPLE}`);

  assert.equal(parsed.gameName, 'EA SPORTS FC 24');
  assert.equal(parsed.contentId, '198235');
  assert.deepEqual(parsed.achievements, [{ id: '38', name: 'European Legend', grant: SAMPLE_GRANT, count: 1, progress: 1 }]);
});

test('entities are decoded, attribute order is free and missing attributes default', () => {
  const xml = `<Achievements ContentId='1' GameName="Tom &amp; Jerry&#8482;"><Achievement Name="&quot;Rock&apos;n&#x27; Roll&quot; &lt;3&gt;" Id="7"/><Achievement Id="8"/></Achievements>`;

  const parsed = anadius.parseNativeXml(xml);

  assert.equal(parsed.gameName, 'Tom & Jerry\u2122');
  assert.deepEqual(parsed.achievements[0], { id: '7', name: '"Rock\'n\' Roll" <3>', grant: 0, count: 0, progress: 0 });
  assert.equal(parsed.achievements[1].name, '');
});

test('a name or entity spelled like an Object property is not taken for a match', () => {
  // "Constructor" normalizes to "constructor", which a plain object answers with a function.
  const { text, unmatched } = anadius.toExportIni([{ id: '1', name: 'Constructor', grant: 0 }], {}, 'achievement-1.xml');
  assert.equal(text.includes('['), false);
  assert.deepEqual(unmatched, ['Constructor']);
  const parsed = anadius.parseNativeXml('<Achievements GameName="G"><Achievement Id="1" Name="Save &constructor; x"/></Achievements>');
  assert.equal(parsed.achievements[0].name, 'Save &constructor; x');
});

test('a localized name falls back to the EA id when Steam names end in that id', () => {
  // EA SPORTS FC: Steam's names are Achievement_GOSCC_<EA id> (FC 24 "European Legend" is id 38).
  const names = { 'european legend': 'Achievement_GOSCC_38', 'treble glory': 'Achievement_GOSCC_1' };
  const { text, unmatched } = anadius.toExportIni(
    [
      { id: '38', name: 'European Legend', grant: 10 },
      { id: '1', name: 'Triple gloire', grant: 20 },
    ],
    names,
    'achievement-x.xml'
  );
  assert.ok(text.includes('[Achievement_GOSCC_1]'));
  assert.deepEqual(unmatched, []);
});

test('the id fallback stays off when a name match contradicts the id', () => {
  const names = { 'first win': 'ACH_7', 'second win': 'ACH_8' };
  const { text, unmatched } = anadius.toExportIni(
    [
      { id: '1', name: 'First Win', grant: 10 },
      { id: '8', name: 'Zweiter Sieg', grant: 20 },
    ],
    names,
    'achievement-x.xml'
  );
  assert.equal(text.includes('[ACH_8]'), false);
  assert.deepEqual(unmatched, ['Zweiter Sieg']);
});

test('the id fallback needs one name match to confirm the numbering', () => {
  const names = { 'first win': 'ACH_1', 'second win': 'ACH_2' };
  const { unmatched } = anadius.toExportIni([{ id: '2', name: 'Zweiter Sieg', grant: 20 }], names, 'achievement-x.xml');
  assert.deepEqual(unmatched, ['Zweiter Sieg']);
});

test('an achievement still in progress is written as progress, not as an unlock', () => {
  const names = { 'score 100 goals': 'ACH_GOALS' };
  const { text } = anadius.toExportIni([{ id: '5', name: 'Score 100 Goals', grant: 0, count: 100, progress: 37 }], names, 'achievement-x.xml');
  assert.match(text, /Achieved=0/);
  assert.match(text, /CurProgress=37/);
  assert.match(text, /MaxProgress=100/);
});

test('malformed input reads as null instead of throwing', () => {
  for (const input of [undefined, null, 42, '', 'not xml', '<Achievement Id="1"/>', '<?xml version="1.0"?><Other/>']) {
    assert.equal(anadius.parseNativeXml(input), null, String(input));
  }
});

test('names match across case, spacing, trademark signs and punctuation; the rest are listed', () => {
  const map = anadius.buildNameMap({ 'Hat-Trick Hero\u2122': 'ACH_HAT', 'Champions!': 'ACH_CHAMP' });
  const achievements = [
    { name: '  hat trick   HERO ', grant: 10 },
    { name: 'Champions\u00ae', grant: 20 },
    { name: 'Unknown One', grant: 30 },
  ];

  const { text, unmatched } = anadius.toExportIni(achievements, map, 'C:\\x\\achievement-1_2_3.xml');

  assert.equal(text, '; written by AW Next from achievement-1_2_3.xml\n\n[ACH_HAT]\nAchieved=1\nUnlockTime=10\n\n[ACH_CHAMP]\nAchieved=1\nUnlockTime=20\n');
  assert.deepEqual(unmatched, ['Unknown One']);
});

test('a display name two achievements share maps to neither', () => {
  assert.deepEqual(anadius.buildNameMap({ Twin: 'A', 'twin ': 'B', Solo: 'C' }), { solo: 'C' });
});

test('an export the emulator wrote itself is recognised, ours and an empty one are not', () => {
  assert.equal(anadius.isOwnedByEmulator('[ACH]\nAchieved=1\n'), true);
  assert.equal(anadius.isOwnedByEmulator('\uFEFF; written by AW Next from a.xml\n'), false);
  assert.equal(anadius.isOwnedByEmulator('  \n'), false);
});

test('the bridge writes an export the save decoder reads as unlocked at the Grant time', async (t) => {
  const root = tempDir(t);
  const nativeDir = seedNative(root, 'achievement-50072_198235_50844.xml', SAMPLE);
  const mapFile = path.join(root, 'cfg', 'anadiusNames.json');
  const asked = [];

  const results = await anadius.bridge({
    nativeDirs: [nativeDir, path.join(root, 'missing')],
    resolveAppid: async (name) => (asked.push(name), '2195250'),
    namesFor: async () => FC24_NAMES,
    mapFile,
  });

  assert.deepEqual(asked, ['EA SPORTS FC 24']);
  assert.equal(results[0].status, 'written');
  const save = await readSaveFile(anadius.exportFile(nativeDir, '2195250'));
  const entry = normalizeSaveEntry(save.ACH_EUROPEAN_LEGEND);
  assert.equal(Boolean(entry.Achieved), true);
  assert.equal(Number(entry.UnlockTime), SAMPLE_GRANT);
  const stored = JSON.parse(fs.readFileSync(mapFile, 'utf8'))['achievement-50072_198235_50844.xml'];
  assert.equal(stored.appid, '2195250');
  assert.equal(stored.names['hat trick hero'], 'ACH_HATTRICK');
});

test('a second run reuses the stored map and leaves an unchanged export alone', async (t) => {
  const root = tempDir(t);
  const nativeDir = seedNative(root, 'achievement-1.xml', SAMPLE);
  const mapFile = path.join(root, 'cfg', 'anadiusNames.json');
  await anadius.bridge({ nativeDirs: [nativeDir], resolveAppid: async () => '2195250', namesFor: async () => FC24_NAMES, mapFile });
  const exportPath = anadius.exportFile(nativeDir, '2195250');
  const before = fs.statSync(exportPath).mtimeMs;
  fs.utimesSync(exportPath, new Date(1000), new Date(1000));

  const results = await anadius.bridge({
    nativeDirs: [nativeDir],
    resolveAppid: async () => assert.fail('the appid comes from the map'),
    namesFor: async () => assert.fail('the names come from the map'),
    mapFile,
  });

  assert.ok(before > 1000);
  assert.equal(results[0].status, 'unchanged');
  assert.equal(fs.statSync(exportPath).mtimeMs, 1000);
});

test('an export the emulator owns is never overwritten', async (t) => {
  const root = tempDir(t);
  const nativeDir = seedNative(root, 'achievement-1.xml', SAMPLE);
  const exportPath = anadius.exportFile(nativeDir, '2195250');
  fs.mkdirSync(path.dirname(exportPath), { recursive: true });
  fs.writeFileSync(exportPath, '[ACH_OTHER]\nAchieved=1\nUnlockTime=5\n');

  const results = await anadius.bridge({
    nativeDirs: [nativeDir],
    resolveAppid: async () => '2195250',
    namesFor: async () => FC24_NAMES,
    mapFile: path.join(root, 'cfg', 'anadiusNames.json'),
  });

  assert.equal(results[0].status, 'owned');
  assert.equal(fs.readFileSync(exportPath, 'utf8'), '[ACH_OTHER]\nAchieved=1\nUnlockTime=5\n');
});

test('a game with no Steam appid and an unreadable file are skipped and logged', async (t) => {
  const root = tempDir(t);
  const nativeDir = seedNative(root, 'achievement-1.xml', SAMPLE);
  fs.writeFileSync(path.join(nativeDir, 'achievement-2.xml'), 'garbage');
  const lines = [];

  const results = await anadius.bridge({
    nativeDirs: [nativeDir],
    resolveAppid: async () => null,
    namesFor: async () => ({}),
    mapFile: path.join(root, 'cfg', 'anadiusNames.json'),
    log: (line) => lines.push(line),
  });

  assert.deepEqual(results, []);
  assert.equal(lines.length, 2);
  assert.equal(fs.existsSync(path.join(nativeDir, 'achievement_watcher')), false);
});

test('the offline conversion writes a new unlock from the stored map', async (t) => {
  const root = tempDir(t);
  const nativeDir = seedNative(root, 'achievement-1.xml', SAMPLE);
  const mapFile = path.join(root, 'cfg', 'anadiusNames.json');
  await anadius.bridge({ nativeDirs: [nativeDir], resolveAppid: async () => '2195250', namesFor: async () => FC24_NAMES, mapFile });
  const xmlPath = path.join(nativeDir, 'achievement-1.xml');
  fs.writeFileSync(xmlPath, SAMPLE.replace('</Achievements>', '<Achievement Id="40" Grant="2024-01-02T03:04:05" Name="Hat-Trick Hero"/></Achievements>'));

  const result = anadius.convertFromMap({ xmlPath, mapFile });

  assert.equal(result.status, 'written');
  const save = await readSaveFile(anadius.exportFile(nativeDir, '2195250'));
  assert.equal(Number(normalizeSaveEntry(save.ACH_HATTRICK).UnlockTime), Date.UTC(2024, 0, 2, 3, 4, 5) / 1000);
  assert.equal(anadius.convertFromMap({ xmlPath: path.join(nativeDir, 'achievement-9.xml'), mapFile }).status, 'unmapped');
});
