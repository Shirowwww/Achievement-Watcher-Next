'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const appRoot = path.join(__dirname, '..', '..', 'app');
const { normalizePe, normalizedPeSha256 } = require(path.join(appRoot, 'util', 'peNormalize.js'));
const { REQUIRED, verifyPackagedExecutables } = require(path.join(appRoot, 'build', 'packagedExecutables.js'));

// A small PE with one section of code; `plus` picks PE32+ over PE32.
function makePe({ plus = true, body = 'code-code-code-code-code!' } = {}) {
  const optionalSize = plus ? 240 : 224;
  const headers = 0x80 + 24 + optionalSize;
  const buffer = Buffer.alloc(headers + 8 + Buffer.byteLength(body));
  buffer.write('MZ', 0, 'latin1');
  buffer.writeUInt32LE(0x80, 0x3c);
  buffer.write('PE\0\0', 0x80, 'latin1');
  buffer.writeUInt16LE(plus ? 0x20b : 0x10b, 0x80 + 24);
  buffer.write(body, headers + 8, 'latin1');
  return buffer;
}

function sign(pe, { plus = true, table = Buffer.from('CERTIFICATE-TABLE!!') } = {}) {
  const optional = 0x80 + 24;
  const entry = optional + (plus ? 112 : 96) + 4 * 8;
  const padded = Buffer.concat([pe, Buffer.alloc((8 - (pe.length % 8)) % 8)]);
  const out = Buffer.concat([padded, table]);
  out.writeUInt32LE(0xdeadbeef, optional + 64);
  out.writeUInt32LE(padded.length, entry);
  out.writeUInt32LE(table.length, entry + 4);
  return out;
}

test('a signed PE normalises to the same bytes as its unsigned original', () => {
  for (const plus of [true, false]) {
    const original = makePe({ plus });
    const signed = sign(original, { plus });
    assert.notDeepEqual(signed, original);
    assert.equal(normalizedPeSha256(signed), normalizedPeSha256(original));
  }
});

test('a change outside the signature changes the normalised hash', () => {
  const original = makePe();
  const tampered = sign(makePe({ body: 'code-code-code-CODE-code!' }));
  assert.notEqual(normalizedPeSha256(tampered), normalizedPeSha256(original));
  const patched = Buffer.from(sign(original));
  patched[0x80 + 24 + 100] ^= 0xff; // a header byte
  assert.notEqual(normalizedPeSha256(patched), normalizedPeSha256(original));
});

test('the certificate fields are zeroed and nothing is left after the code', () => {
  const normalised = normalizePe(sign(makePe()));
  assert.equal(normalised.readUInt32LE(0x80 + 24 + 64), 0);
  assert.equal(normalised.readUInt32LE(0x80 + 24 + 112 + 32), 0);
  assert.equal(normalised.readUInt32LE(0x80 + 24 + 112 + 36), 0);
  assert.equal(normalised.subarray(-5).toString('latin1'), 'code!');
});

test('malformed or ambiguous input is rejected instead of hashed', () => {
  assert.throws(() => normalizePe(Buffer.from('not a pe file at all, just text, long enough to pass the size check')), /MZ/);
  const noPe = makePe();
  noPe.write('XX', 0x80, 'latin1');
  assert.throws(() => normalizePe(noPe), /PE signature/);
  const odd = makePe();
  odd.writeUInt16LE(0x107, 0x80 + 24);
  assert.throws(() => normalizePe(odd), /optional header/);
  const middle = sign(makePe());
  const content = Buffer.concat([middle, Buffer.from('tail')]);
  assert.throws(() => normalizePe(content), /not at the end/);
  const past = Buffer.from(sign(makePe()));
  past.writeUInt32LE(9999, 0x80 + 24 + 112 + 36);
  assert.throws(() => normalizePe(past), /past the end/);
});

function stage() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-packaged-'));
  const unpacked = path.join(root, 'unpacked');
  const source = path.join(root, 'native');
  fs.mkdirSync(source);
  const helpers = { 'aw-next-clip.exe': makePe({ body: 'clip-clip-clip-clip-clip' }), 'aw-next-hdr-screenshot.exe': makePe({ body: 'hdr-hdr-hdr-hdr-hdr-hdr' }) };
  for (const [name, pe] of Object.entries(helpers)) fs.writeFileSync(path.join(source, name), pe);
  for (const name of REQUIRED) {
    const target = path.join(unpacked, ...name.split('/'));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, helpers[path.basename(name)] ? sign(helpers[path.basename(name)]) : sign(makePe()));
  }
  return { root, unpacked, source };
}

test('a fully signed package whose helpers match the repository passes', async () => {
  const { root, unpacked, source } = stage();
  try {
    const seen = [];
    const count = await verifyPackagedExecutables(unpacked, { nativeSourceDir: source, verifySignature: async (file) => (seen.push(file), null) });
    assert.equal(count, REQUIRED.length);
    assert.equal(seen.length, REQUIRED.length);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('an extra, unsigned or swapped executable fails the package', async () => {
  const { root, unpacked, source } = stage();
  try {
    const extra = path.join(unpacked, 'resources', 'tool', 'extra.EXE');
    fs.mkdirSync(path.dirname(extra), { recursive: true });
    fs.writeFileSync(extra, makePe());
    await assert.rejects(
      verifyPackagedExecutables(unpacked, {
        nativeSourceDir: source,
        verifySignature: async (file) => (file.endsWith('extra.EXE') ? 'installer is not signed' : null),
      }),
      /extra\.EXE: installer is not signed/
    );
    fs.rmSync(extra);

    fs.writeFileSync(path.join(unpacked, 'watchdog', 'native', 'aw-next-clip.exe'), sign(makePe({ body: 'swapped-swapped-swapped!' })));
    await assert.rejects(
      verifyPackagedExecutables(unpacked, { nativeSourceDir: source, verifySignature: async () => null }),
      /aw-next-clip\.exe: differs from the repository copy/
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('a package missing a required executable is refused', async () => {
  const { root, unpacked, source } = stage();
  try {
    fs.rmSync(path.join(unpacked, 'Achievement Watcher.exe'));
    await assert.rejects(verifyPackagedExecutables(unpacked, { nativeSourceDir: source, verifySignature: async () => null }), /missing executable/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('the build runs the check before the portable pass overwrites win-unpacked', () => {
  const build = fs.readFileSync(path.join(appRoot, 'build', 'build.js'), 'utf8');
  const check = build.indexOf('verifyPackagedExecutables(');
  const portable = build.indexOf('runBuilder("electron-builder-portable.yml"');
  assert.ok(check > 0 && portable > check, 'verifyPackagedExecutables must run inside the installer-pass check');
  assert.match(build, /verifyUpdateCodeSignature\(\["Shirow"\], file, \(\) => \{\}, \{ raw: true \}\)/);
});
