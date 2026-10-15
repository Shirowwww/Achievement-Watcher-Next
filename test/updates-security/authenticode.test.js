'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const appRoot = path.join(__dirname, '..', '..', 'app');
const { inspectSignature, readSignature } = require(path.join(appRoot, 'util', 'authenticode.js'));
const { evaluateUpdateSignature, verifyUpdateCodeSignature } = require(path.join(appRoot, 'util', 'updateSignature.js'));
const links = require(path.join(appRoot, 'util', 'links.js'));

/*
  A 4 KB PE32+ image signed the way releases are: a SHA-1 signature, then a nested SHA-256 one
  (signtool /fd sha1, then /as /fd sha256), by a throwaway self-signed "AW Next test signer" key that
  signs nothing else.
*/
const FIXTURE = path.join(__dirname, '..', 'fixtures', 'authenticode', 'dual-signed.bin');
const TEST_SIGNER = 'E5BFFA1120784B5545EEA884B278F48364D6238F';
const PUBLISHER = ['AW Next test signer'];
const pinned = [TEST_SIGNER];

function layout(bytes) {
  const optional = bytes.readUInt32LE(60) + 24;
  const securityEntry = optional + 112 + 32;
  return { checksum: optional + 64, securityEntry, table: bytes.readUInt32LE(securityEntry) };
}

function verdict(bytes) {
  return evaluateUpdateSignature(PUBLISHER, inspectSignature(bytes), { pinned });
}

test('both signature layers verify against their own certificate', async () => {
  const signature = await readSignature(FIXTURE);
  assert.equal(signature.Status, 'Valid');
  assert.deepEqual(signature.SignerCertificate, { Subject: 'CN=AW Next test signer', Thumbprint: TEST_SIGNER });
  assert.deepEqual(signature.Cms, { Ok: true, Thumbprints: [TEST_SIGNER, TEST_SIGNER] });
  assert.equal(evaluateUpdateSignature(PUBLISHER, signature, { pinned }), null);
});

test('a changed byte anywhere in the signed image is refused', () => {
  const bytes = fs.readFileSync(FIXTURE);
  const { checksum, securityEntry, table } = layout(bytes);
  const excluded = (at) => (at >= checksum && at < checksum + 4) || (at >= securityEntry && at < securityEntry + 8);
  for (let at = 0; at < table; at++) {
    if (excluded(at)) continue;
    bytes[at] ^= 0x01;
    let result;
    try {
      result = verdict(bytes);
    } catch (err) {
      result = err.message;
    }
    bytes[at] ^= 0x01;
    assert.notEqual(result, null, `byte 0x${at.toString(16)} changed and the file was still accepted`);
  }
  bytes[0x200] ^= 0x01;
  assert.equal(inspectSignature(bytes).Status, 'HashMismatch');
});

test('a changed signature is refused in either layer', () => {
  const original = fs.readFileSync(FIXTURE);
  // Each RSA-2048 signature is the only OCTET STRING of exactly 256 bytes: 04 82 01 00.
  const marker = Buffer.from([0x04, 0x82, 0x01, 0x00]);
  const first = original.indexOf(marker, layout(original).table);
  const second = original.indexOf(marker, first + 1);
  assert.ok(first > 0 && second > first, 'both signature values were found');
  for (const at of [first, second]) {
    const bytes = Buffer.from(original);
    bytes[at + 4 + 128] ^= 0x01;
    assert.deepEqual(inspectSignature(bytes).Cms, { Ok: false, Error: 'Invalid signature.' });
  }
});

test('a certificate that is not pinned is refused even when its signature verifies', () => {
  assert.match(
    evaluateUpdateSignature(PUBLISHER, inspectSignature(fs.readFileSync(FIXTURE))),
    new RegExp(`unknown certificate \\(thumbprint: ${TEST_SIGNER}\\)`)
  );
});

test('an executable without a certificate table is not signed', () => {
  const bytes = Buffer.from(fs.readFileSync(FIXTURE));
  const { securityEntry, table } = layout(bytes);
  bytes.fill(0, securityEntry, securityEntry + 8);
  assert.deepEqual(inspectSignature(bytes.subarray(0, table)), { Status: 'NotSigned' });
});

test('data appended after the certificate table is refused', () => {
  const bytes = Buffer.concat([fs.readFileSync(FIXTURE), Buffer.alloc(16)]);
  assert.match(verdict(bytes), /not signed/);
});

test('a file that cannot be checked is refused with the manual download', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-authenticode-'));
  try {
    const text = path.join(dir, 'setup.exe');
    fs.writeFileSync(text, 'not an executable');
    for (const file of [text, path.join(dir, 'missing.exe')]) {
      const result = await verifyUpdateCodeSignature(['Shirow'], file);
      assert.match(result, /could not be checked/);
      assert.ok(result.includes(links.releases), result);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('an unpinned signer is refused through the updater entry point', async () => {
  const result = await verifyUpdateCodeSignature(['AW Next test signer'], FIXTURE);
  assert.match(result, /^installer is signed by an unknown certificate/);
  assert.ok(result.includes(links.releases), result);
});

// #128: Bitdefender quarantined the app for running this check through PowerShell.
test('the update signature check starts no other process', () => {
  for (const name of ['updateSignature.js', 'authenticode.js']) {
    const source = fs.readFileSync(path.join(appRoot, 'util', name), 'utf8');
    assert.doesNotMatch(source, /child_process|powershell\.exe/i, name);
  }
});
