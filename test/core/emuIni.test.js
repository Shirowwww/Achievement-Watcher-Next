'use strict';

/*
  This editor writes into files that belong to a game's emulator setup, so what it must never do is
  lose a line it did not understand or change the spelling of a key. The Uplay R2 loader compares key
  names case-sensitively: a key appended in the wrong case is read as absent, which is how a repaired
  game could still report no achievements. It had real callers and no test of its own.
*/

const assert = require('node:assert/strict');
const test = require('node:test');
const { parseIni, stringifyIni, getIniSection, readIniSectionValues, upsertIniSection, upsertIniKeys, sanitizeIniValue } = require('../../app/util/emuIni.js');

const SAMPLE = `; written by the repack
[Settings]
AppId = 480
  PlayerName = Player

; a section AW knows nothing about
[Custom]
Whatever = keep me
`;

test('a round trip keeps comments, blank lines, indentation and unknown sections', () => {
  const doc = parseIni(SAMPLE);
  const out = stringifyIni(doc);
  assert.match(out, /; written by the repack/);
  assert.match(out, /\[Custom\]/);
  assert.match(out, /Whatever = keep me/);
  assert.match(out, /^ {2}PlayerName = Player$/m, 'the original indentation survives');
});

test('a section is found however it is spelled', () => {
  const doc = parseIni(SAMPLE);
  assert.ok(getIniSection(doc, 'settings'));
  assert.ok(getIniSection(doc, 'SETTINGS'));
  assert.equal(getIniSection(doc, 'absent'), undefined);
});

test('values are read back, and a commented-out key is not a live setting', () => {
  const doc = parseIni('[Settings]\nAppId = 480\n;Ticket = fake\n#Other = fake\n');
  const values = readIniSectionValues(doc, 'Settings');
  assert.equal(values.appid, '480');
  assert.equal(values.ticket, undefined, 'a documented-but-disabled key must not read as set');
  assert.equal(values.other, undefined);
});

test('an existing key is updated in place, keeping its own spelling and spacing', () => {
  const doc = parseIni(SAMPLE);
  const section = getIniSection(doc, 'Settings');
  section.body = upsertIniKeys(section.body, { appid: '730' });
  const out = stringifyIni(doc);
  assert.match(out, /^AppId = 730$/m, 'the file keeps the key exactly as it was written');
  assert.doesNotMatch(out, /appid/, 'the lookup casing must never reach the file');
});

test("a new key is appended in the caller's casing, inside its own section", () => {
  const doc = parseIni('[Settings]\nAppId=480\n');
  const section = getIniSection(doc, 'Settings');
  section.body = upsertIniKeys(section.body, { AchKeyPrefix: 'ACH_' });
  const out = stringifyIni(doc);
  assert.match(out, /^AchKeyPrefix=ACH_$/m, 'the loader compares key names case-sensitively');
  assert.ok(out.indexOf('AchKeyPrefix') > out.indexOf('[Settings]'));
});

test('a section that does not exist yet is created', () => {
  const doc = upsertIniSection(parseIni(''), 'Achievements', ['Enabled=1']);
  const out = stringifyIni(doc);
  assert.match(out, /\[Achievements\]/);
  assert.match(out, /^Enabled=1$/m);
});

test('a value cannot smuggle a newline or a section header into the file', () => {
  const doc = parseIni('[Settings]\nAppId=480\n');
  const section = getIniSection(doc, 'Settings');
  section.body = upsertIniKeys(section.body, { AppId: sanitizeIniValue('480\n[Injected]\nEvil=1') });
  const out = stringifyIni(doc);
  // A section header only counts when it is alone on its line, so folding the newlines away is what
  // makes the payload inert: it stays part of the value it was smuggled into.
  assert.doesNotMatch(out, /^\s*\[Injected\]\s*$/m, 'a value may not open a section of its own');
  assert.deepEqual(readIniSectionValues(parseIni(out), 'Injected'), {}, 'no section by that name exists to read');
});
