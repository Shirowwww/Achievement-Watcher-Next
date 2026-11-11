'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const reference = require('../helpers/wineRegistryReference.js');
const candidate = require('../../app/util/wineRegistry.js');

function temporaryHive(t, content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-reg-differential-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'user.reg');
  fs.writeFileSync(file, content);
  return file;
}

function fixture() {
  return [
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
    '"HexIgnored"=hex:01,02,' + '\\',
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
}

function assertEquivalent(file, keys, values) {
  for (const key of keys) {
    assert.deepEqual(candidate.listSubkeys(file, key), reference.listSubkeys(file, key), 'subkeys: ' + key);
    assert.deepEqual(candidate.listValueNames(file, key), reference.listValueNames(file, key), 'value names: ' + key);
    for (const name of values) {
      assert.deepEqual(candidate.readValue(file, key, name), reference.readValue(file, key, name),
        'value: ' + key + '/' + name);
    }
  }
}

test('the public parseHive API preserves its complete Map representation', () => {
  for (const content of [fixture(), fixture().replace(/\n/g, '\r\n'), '', 'WINE REGISTRY Version 2\n']) {
    assert.deepEqual(candidate.parseHive(content), reference.parseHive(content));
  }
});

test('all file-backed queries agree with the original on positive and negative cases', (t) => {
  const file = temporaryHive(t, fixture());
  const keys = [
    '', 'software', 'Software/Alpha', 'SOFTWARE\\ALPHA', 'Software/Alpha/SubChild',
    'software/alpha/unicodeé', 'software/zeta', 'software/missing', 'Software/Malformed',
  ];
  const values = [
    '', 'displayname', 'DISPLAYNAME', 'Quoted', 'Unicode', 'NativeUtf8', 'Expandable',
    'Count', 'HexIgnored', 'Unsupported', 'Case', 'Empty', 'ThisShouldBeIgnored', 'missing',
  ];
  assertEquivalent(file, keys, values);
  assert.deepEqual(candidate.readValue(file, 'software/alpha', 'displayname'), { type: 'REG_SZ', value: 'last' });
  assert.deepEqual(candidate.readValue(file, 'software/alpha', 'Unicode'), { type: 'REG_SZ', value: 'café' });
  assert.deepEqual(candidate.readValue(file, 'software/alpha', 'Count'), { type: 'REG_DWORD', value: 42 });
  assert.equal(candidate.readValue(file, 'software/alpha', 'HexIgnored'), null);
  assert.deepEqual(candidate.listSubkeys(file, 'software/alpha'), ['subchild', 'unicodeé']);
  assert.deepEqual(candidate.listValueNames(file, 'software/alpha'),
    ['DISPLAYNAME', '', 'Quoted', 'Unicode', 'NativeUtf8', 'Expandable', 'Count']);
});

test('changed and removed files preserve the original missing-file and invalidation behavior', (t) => {
  const file = temporaryHive(t, fixture());
  assert.deepEqual(candidate.readValue(file, 'software/alpha', 'displayname'),
    reference.readValue(file, 'software/alpha', 'displayname'));

  const changed = fixture().replace('"DISPLAYNAME"="last"', '"DISPLAYNAME"="a new, longer value"');
  fs.writeFileSync(file, changed);
  assertEquivalent(file, ['software/alpha', 'software/alpha/subchild'], ['displayname', 'Case']);
  assert.deepEqual(candidate.readValue(file, 'software/alpha', 'displayname'),
    { type: 'REG_SZ', value: 'a new, longer value' });

  fs.unlinkSync(file);
  assertEquivalent(file, ['', 'software/alpha'], ['', 'displayname']);
  assert.equal(candidate.readValue(file, 'software/alpha', 'displayname'), null);
});

test('a large synthetic hive preserves enumeration order, aliases and non-ASCII values', (t) => {
  const sections = ['WINE REGISTRY Version 2', ''];
  for (let i = 0; i < 2400; i++) {
    sections.push('[Software\\\\Generated\\\\Item' + i + '] 1791978481');
    sections.push('"Name"="record-' + i + '-José"');
    sections.push('"Counter"=dword:' + i.toString(16).padStart(8, '0'));
    if (i % 31 === 0) sections.push('"Other"=hex:01,02,03');
  }
  const content = sections.join('\r\n') + '\r\n';
  const file = temporaryHive(t, content);
  const keys = ['', 'Software/Generated', 'Software/Generated/Item0',
    'Software/Generated/Item31', 'Software/Generated/Item2399', 'Software/Absent'];
  assert.deepEqual(candidate.parseHive(content), reference.parseHive(content));
  assertEquivalent(file, keys, ['', 'Name', 'Counter', 'Other']);
  const names = candidate.listSubkeys(file, 'Software/Generated');
  assert.equal(names.length, 2400);
  assert.equal(names[0], 'Item0');
  assert.equal(names[2399], 'Item2399');
});


test('repeated sections separated by other sections merge values and preserve latest spelling', (t) => {
  const file = temporaryHive(t, [
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
  ].join('\n'));
  assertEquivalent(file, ['Software', 'Software/A', 'Software/a/child', 'Software/A/next'],
    ['', 'Old', 'NEW', 'Here', 'Unrelated']);
  assert.deepEqual(candidate.listSubkeys(file, 'Software/A'), ['CHILD', 'next']);
});

test('value cache eviction does not change query results or ordering', (t) => {
  const rows = ['WINE REGISTRY Version 2'];
  for (let i = 0; i < 140; i++) {
    rows.push('[Software\\\\Eviction\\\\Item' + i + ']');
    rows.push('"Readable"="value-' + i + '"');
    rows.push('"Ordinal"=dword:' + i.toString(16).padStart(8, '0'));
  }
  const file = temporaryHive(t, rows.join('\n'));
  for (let round = 0; round < 2; round++) {
    for (let i = 139; i >= 0; i--) {
      const key = 'Software/Eviction/Item' + i;
      assert.deepEqual(candidate.readValue(file, key, 'Readable'), reference.readValue(file, key, 'Readable'));
      assert.deepEqual(candidate.listValueNames(file, key), reference.listValueNames(file, key));
    }
  }
  assert.deepEqual(candidate.listSubkeys(file, 'Software/Eviction'), reference.listSubkeys(file, 'Software/Eviction'));
});

test('a same-length replacement with a restored mtime invalidates the snapshot', (t) => {
  const file = temporaryHive(t, '[Software\\\\Change]\n"Value"="aaaa"\n');
  const initial = fs.statSync(file);
  assert.deepEqual(candidate.readValue(file, 'Software/Change', 'Value'), { type: 'REG_SZ', value: 'aaaa' });
  const moved = file + '.previous';
  fs.renameSync(file, moved);
  fs.writeFileSync(file, '[Software\\\\Change]\n"Value"="bbbb"\n');
  fs.utimesSync(file, initial.atime, initial.mtime);
  assert.deepEqual(candidate.readValue(file, 'Software/Change', 'Value'), { type: 'REG_SZ', value: 'bbbb' });
  assert.deepEqual(candidate.readValue(file, 'Software/Change', 'Value'), reference.readValue(file, 'Software/Change', 'Value'));
  fs.unlinkSync(moved);
});


test('whole-hive cache evicts least-recently-used files while retaining current results', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-reg-lru-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const files = [];
  const originalRead = fs.readFileSync;
  let descriptorReads = 0;

  fs.readFileSync = function (file, ...args) {
    if (typeof file === 'number') descriptorReads++;
    return originalRead.call(this, file, ...args);
  };

  try {
    for (let i = 0; i < 50; i++) {
      const file = path.join(directory, 'hive-' + i + '.reg');
      fs.writeFileSync(file, 'WINE REGISTRY Version 2\n[Software\\\\LRU]\n"Value"="' + i + '"\n');
      files.push(file);
      assert.deepEqual(candidate.readValue(file, 'Software/LRU', 'Value'),
        { type: 'REG_SZ', value: String(i) });
    }

    const beforeEvictedRead = descriptorReads;
    assert.deepEqual(candidate.readValue(files[0], 'Software/LRU', 'Value'),
      reference.readValue(files[0], 'Software/LRU', 'Value'));
    assert.equal(descriptorReads, beforeEvictedRead + 1,
      'oldest hive must be re-read when the global limit is exceeded');

    const beforeRecentRead = descriptorReads;
    assert.deepEqual(candidate.readValue(files[49], 'Software/LRU', 'Value'),
      reference.readValue(files[49], 'Software/LRU', 'Value'));
    assert.equal(descriptorReads, beforeRecentRead,
      'recently accessed hive should still be cached');
  } finally {
    fs.readFileSync = originalRead;
  }
});


test('global byte budget evicts earlier snapshots without changing reads', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-reg-byte-budget-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const files = [];
  const largeChunk = Buffer.alloc(1024 * 1024, 65);
  const originalRead = fs.readFileSync;
  let descriptorReads = 0;

  // Each file occupies 21 MiB of raw snapshot space, so five exceed the 96 MiB
  // global cache limit while each file individually remains cacheable.
  for (let i = 0; i < 5; i++) {
    const file = path.join(dir, 'large-' + i + '.reg');
    const fd = fs.openSync(file, 'w');
    try {
      fs.writeSync(fd, 'WINE REGISTRY Version 2\n[Software\\\\Large]\n"Index"="' + i + '"\n#');
      for (let chunk = 0; chunk < 21; chunk++) fs.writeSync(fd, largeChunk);
    } finally {
      fs.closeSync(fd);
    }
    files.push(file);
  }

  fs.readFileSync = function (file, ...args) {
    if (typeof file === 'number') descriptorReads++;
    return originalRead.call(this, file, ...args);
  };
  try {
    for (let i = 0; i < files.length; i++) {
      assert.deepEqual(candidate.readValue(files[i], 'Software/Large', 'Index'),
        { type: 'REG_SZ', value: String(i) });
    }
    const afterCold = descriptorReads;
    assert.deepEqual(candidate.readValue(files[4], 'Software/Large', 'Index'),
      { type: 'REG_SZ', value: '4' });
    assert.equal(descriptorReads, afterCold, 'newest snapshot should remain cached');

    assert.deepEqual(candidate.readValue(files[0], 'Software/Large', 'Index'),
      reference.readValue(files[0], 'Software/Large', 'Index'));
    assert.equal(descriptorReads, afterCold + 1, 'oldest snapshot must be evicted by byte budget');
  } finally {
    fs.readFileSync = originalRead;
  }
});

test('atomic replacement during snapshot reading cannot mix file generations', (t) => {
  const file = temporaryHive(t, '[Software\\\\Atomic]\n"Value"="old"\n');
  const replacement = file + '.next';
  const originalRead = fs.readFileSync;
  let switched = false;
  fs.readFileSync = function (source, ...args) {
    if (!switched && typeof source === 'number') {
      const bytes = originalRead.call(this, source, ...args);
      fs.writeFileSync(replacement, '[Software\\\\Atomic]\n"Value"="new"\n');
      fs.renameSync(replacement, file);
      switched = true;
      return bytes;
    }
    return originalRead.call(this, source, ...args);
  };
  try {
    assert.deepEqual(candidate.readValue(file, 'Software/Atomic', 'Value'),
      { type: 'REG_SZ', value: 'new' });
    assert.equal(switched, true, 'a replacement was simulated during the read');
    assert.deepEqual(candidate.readValue(file, 'Software/Atomic', 'Value'),
      reference.readValue(file, 'Software/Atomic', 'Value'));
  } finally {
    fs.readFileSync = originalRead;
  }
});
