'use strict';

/*
  app/util/wineRegistry.js answers lookups from an index of a hive's sections and decodes a key
  only when it is asked for. parseHive, in the same file, decodes a hive whole: it is what the
  lookups are checked against here, with the spellings and orders written out where it has none.
*/

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const registry = require('../../app/util/wineRegistry.js');

function tempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-reg-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function hiveFile(t, content, name = 'user.reg') {
  const file = path.join(tempDir(t), name);
  fs.writeFileSync(file, content);
  return file;
}

// The cache limits are the module's own: a test lowers them and they come back after it.
function withLimits(t, limits) {
  const saved = { ...registry.cacheLimits };
  Object.assign(registry.cacheLimits, limits);
  t.after(() => Object.assign(registry.cacheLimits, saved));
}

// Counts the times a hive's bytes are read, which is what a cached hive spares.
function countReads(t) {
  const original = fs.readFileSync;
  const counter = { reads: 0 };
  fs.readFileSync = function (source, ...args) {
    if (typeof source === 'number') counter.reads += 1;
    return original.call(this, source, ...args);
  };
  t.after(() => (fs.readFileSync = original));
  return counter;
}

const oracleKey = (key) => key.replace(/\//g, '\\').toLowerCase();

function assertMatchesParseHive(file, content, keys, names) {
  const parsed = registry.parseHive(content);
  for (const key of keys) {
    const values = parsed.get(oracleKey(key));
    for (const name of names) {
      assert.deepEqual(registry.readValue(file, key, name), (values && values.get(name.toLowerCase())) || null, `value ${key} / ${name}`);
    }
    assert.deepEqual(
      registry.listValueNames(file, key).map((name) => name.toLowerCase()),
      values ? [...values.keys()] : [],
      `value names of ${key}`
    );
  }
}

const FIXTURE = [
  'WINE REGISTRY Version 2',
  '',
  '[Software\\\\Alpha] 1791978481',
  '#time=01f0000000000000',
  '"DisplayName"="first"',
  '"DISPLAYNAME"="last"',
  '@="default"',
  '"Quoted"="say \\"hello\\""',
  '"Unicode"="caf\\x00e9"',
  '"NativeUtf8"="José"',
  '"Expandable"=str(2):"%USERPROFILE%\\\\Mes documents"',
  '"Count"=dword:0000002a',
  '"HexIgnored"=hex:01,02,\\',
  ' 03,04',
  '"Unsupported"=str(7):"a\\0b"',
  '',
  '[Software\\\\Alpha\\\\SubChild] 1791978482',
  '"Case"="one"',
  '[software\\\\ALPHA\\\\subchild] 1791978483',
  '"case"="two"',
  '[Software\\\\Alpha\\\\unicode\\x00e9]',
  '@="unicode child"',
  '[Software\\\\Zeta]',
  '"Empty"=""',
  '',
  '[Software\\\\Malformed',
  '"ThisShouldBeIgnored"="yes"',
  '',
].join('\n');
const FIXTURE_KEYS = ['Software/Alpha', 'SOFTWARE\\ALPHA', 'Software/Alpha/SubChild', 'software/alpha/unicodeé', 'software/zeta', 'software/missing', 'Software/Malformed'];
const FIXTURE_NAMES = ['', 'displayname', 'Quoted', 'Unicode', 'NativeUtf8', 'Expandable', 'Count', 'HexIgnored', 'Unsupported', 'Case', 'Empty', 'ThisShouldBeIgnored', 'missing'];

for (const [label, content] of [
  ['LF', FIXTURE],
  ['CRLF', FIXTURE.replace(/\n/g, '\r\n')],
]) {
  test(`a hive with ${label} line ends is read like parseHive reads it, spellings and order kept`, (t) => {
    const file = hiveFile(t, content);
    assertMatchesParseHive(file, content, FIXTURE_KEYS, FIXTURE_NAMES);
    assert.deepEqual(registry.readValue(file, 'software/alpha', 'displayname'), { type: 'REG_SZ', value: 'last' });
    assert.deepEqual(registry.readValue(file, 'software/alpha', 'Unicode'), { type: 'REG_SZ', value: 'café' });
    assert.deepEqual(registry.readValue(file, 'software/alpha', 'Count'), { type: 'REG_DWORD', value: 42 });
    assert.equal(registry.readValue(file, 'software/alpha', 'HexIgnored'), null);
    assert.equal(registry.readValue(file, 'Software/Malformed', 'ThisShouldBeIgnored'), null);
    assert.deepEqual(registry.listSubkeys(file, ''), ['Software']);
    assert.deepEqual(registry.listSubkeys(file, 'software'), ['Alpha', 'Zeta']);
    // A key written twice keeps its last spelling, at the place of its first.
    assert.deepEqual(registry.listSubkeys(file, 'software/alpha'), ['subchild', 'unicodeé']);
    assert.deepEqual(registry.listSubkeys(file, 'software/missing'), []);
    assert.deepEqual(registry.listValueNames(file, 'software/alpha'), ['DISPLAYNAME', '', 'Quoted', 'Unicode', 'NativeUtf8', 'Expandable', 'Count']);
  });
}

test('an empty hive and a hive with no section answer nothing', (t) => {
  for (const content of ['', 'WINE REGISTRY Version 2\n']) {
    const file = hiveFile(t, content);
    assert.equal(registry.readValue(file, 'software/alpha', 'x'), null);
    assert.deepEqual(registry.listSubkeys(file, ''), []);
    assert.deepEqual(registry.listValueNames(file, 'software'), []);
  }
});

test('a key split over sections apart from each other merges its values in file order', (t) => {
  const content = [
    'WINE REGISTRY Version 2',
    '[Software\\\\A\\\\child]',
    '"Old"="first"',
    '[Software\\\\other]',
    '"Unrelated"=dword:00000001',
    '[SOFTWARE\\\\a\\\\CHILD]',
    '"NEW"="second"',
    '"old"="third"',
    '[Software\\\\A\\\\next]',
    '"Here"="yes"',
    '[SOFTWARE\\\\A\\\\CHILD]',
    '@="default"',
  ].join('\n');
  const file = hiveFile(t, content);
  assertMatchesParseHive(file, content, ['Software/A/child', 'Software/A/next', 'Software/other'], ['', 'Old', 'NEW', 'Here', 'Unrelated']);
  assert.deepEqual(registry.readValue(file, 'software/a/child', 'old'), { type: 'REG_SZ', value: 'third' });
  assert.deepEqual(registry.listValueNames(file, 'software/a/child'), ['old', 'NEW', '']);
  assert.deepEqual(registry.listSubkeys(file, 'Software/A'), ['CHILD', 'next']);
});

test('a hive of thousands of keys keeps their order, and more keys than are kept decoded read the same twice', (t) => {
  const lines = ['WINE REGISTRY Version 2', ''];
  for (let i = 0; i < 2400; i++) {
    lines.push(`[Software\\\\Generated\\\\Item${i}] 1791978481`, `"Name"="record-${i}-José"`, `"Counter"=dword:${i.toString(16).padStart(8, '0')}`);
    if (i % 31 === 0) lines.push('"Other"=hex:01,02,03');
  }
  const content = `${lines.join('\r\n')}\r\n`;
  const file = hiveFile(t, content);
  const keys = Array.from({ length: 140 }, (unused, i) => `Software/Generated/Item${i * 17}`);
  for (let round = 0; round < 2; round++) assertMatchesParseHive(file, content, keys.toReversed(), ['Name', 'Counter', 'Other']);
  const names = registry.listSubkeys(file, 'Software/Generated');
  assert.equal(names.length, 2400);
  assert.equal(names[0], 'Item0');
  assert.equal(names[2399], 'Item2399');
  names.length = 0;
  assert.equal(registry.listSubkeys(file, 'Software/Generated').length, 2400, 'a caller cannot empty the kept listing');
});

test('a rewritten hive is read again, and a removed one answers nothing', (t) => {
  const file = hiveFile(t, FIXTURE);
  assert.equal(registry.readValue(file, 'software/alpha', 'displayname').value, 'last');

  const changed = FIXTURE.replace('"DISPLAYNAME"="last"', '"DISPLAYNAME"="a new, longer value"');
  fs.writeFileSync(file, changed);
  assertMatchesParseHive(file, changed, FIXTURE_KEYS, FIXTURE_NAMES);
  assert.equal(registry.readValue(file, 'software/alpha', 'displayname').value, 'a new, longer value');

  fs.unlinkSync(file);
  assert.equal(registry.readValue(file, 'software/alpha', 'displayname'), null);
  assert.deepEqual(registry.listSubkeys(file, ''), []);
  assert.deepEqual(registry.listValueNames(file, 'software/alpha'), []);
});

test('a hive replaced by one of the same size and date is read again', (t) => {
  const file = hiveFile(t, '[Software\\\\Change]\n"Value"="aaaa"\n');
  const initial = fs.statSync(file);
  assert.equal(registry.readValue(file, 'Software/Change', 'Value').value, 'aaaa');
  // What wineserver does: the new hive is another file, renamed into place.
  fs.renameSync(file, `${file}.previous`);
  fs.writeFileSync(file, '[Software\\\\Change]\n"Value"="bbbb"\n');
  fs.utimesSync(file, initial.atime, initial.mtime);
  assert.equal(registry.readValue(file, 'Software/Change', 'Value').value, 'bbbb');
});

test('only the most recently used hives are kept, by count', (t) => {
  withLimits(t, { hives: 3 });
  const dir = tempDir(t);
  const files = [0, 1, 2, 3].map((i) => {
    const file = path.join(dir, `hive-${i}.reg`);
    fs.writeFileSync(file, `[Software\\\\LRU]\n"Value"="${i}"\n`);
    return file;
  });
  const counter = countReads(t);
  const value = (i) => registry.readValue(files[i], 'Software/LRU', 'Value').value;

  for (const i of [0, 1, 2]) assert.equal(value(i), String(i));
  assert.equal(value(0), '0');
  assert.equal(counter.reads, 3, 'a kept hive is not read again');
  assert.equal(value(3), '3');
  assert.equal(value(0), '0');
  assert.equal(counter.reads, 4, 'the hive just used outlived the fourth one');
  assert.equal(value(1), '1');
  assert.equal(counter.reads, 5, 'the least recently used hive was dropped');
});

test('the kept hives stay under the byte budget, and a hive larger than it is read without being kept', (t) => {
  const hive = (i, padding) => `[Software\\\\Budget]\n"Value"="${i}"\n#${'A'.repeat(padding)}\n`;
  const size = Buffer.byteLength(hive(0, 400));
  withLimits(t, { bytes: size * 2 });
  const dir = tempDir(t);
  const files = [0, 1, 2].map((i) => {
    const file = path.join(dir, `hive-${i}.reg`);
    fs.writeFileSync(file, hive(i, 400));
    return file;
  });
  const large = path.join(dir, 'large.reg');
  fs.writeFileSync(large, hive(9, size * 3));
  const counter = countReads(t);
  const value = (file) => registry.readValue(file, 'Software/Budget', 'Value').value;

  for (const [i, file] of files.entries()) assert.equal(value(file), String(i));
  assert.equal(value(files[2]), '2');
  assert.equal(counter.reads, 3, 'the newest hive is kept');
  assert.equal(value(files[0]), '0');
  assert.equal(counter.reads, 4, 'the oldest one went to make room');

  assert.equal(value(large), '9');
  assert.equal(value(large), '9');
  assert.equal(counter.reads, 6, 'a hive over the budget is read each time');
  assert.equal(value(files[0]), '0');
  assert.equal(counter.reads, 6, 'and it pushed nothing out');
});

// Rewrites the hive from inside the read of its bytes, as a running prefix can.
function rewriteDuringReads(t, file, times) {
  const original = fs.readFileSync;
  const state = { left: times, generation: 0 };
  fs.readFileSync = function (source, ...args) {
    const bytes = original.call(this, source, ...args);
    if (typeof source === 'number' && state.left > 0) {
      state.left -= 1;
      state.generation += 1;
      fs.writeFileSync(file, `[Software\\\\Moving]\n"Value"="generation ${state.generation}${'.'.repeat(state.generation)}"\n`);
    }
    return bytes;
  };
  t.after(() => (fs.readFileSync = original));
  return state;
}

test('a hive rewritten while it is read is read again, and the new content is what is answered', (t) => {
  const file = hiveFile(t, '[Software\\\\Moving]\n"Value"="generation 0"\n');
  rewriteDuringReads(t, file, 1);
  assert.equal(registry.readValue(file, 'Software/Moving', 'Value').value, 'generation 1.');
});

test('a hive that never settles is still answered, and is not kept', (t) => {
  const file = hiveFile(t, '[Software\\\\Moving]\n"Value"="generation 0"\n');
  const state = rewriteDuringReads(t, file, 2);
  // Two reads, both overtaken: the second one's bytes are answered rather than nothing.
  assert.equal(registry.readValue(file, 'Software/Moving', 'Value').value, 'generation 1.');
  assert.equal(state.left, 0);
  assert.equal(registry.readValue(file, 'Software/Moving', 'Value').value, 'generation 2..', 'the next lookup reads the file again');
});
