'use strict';

const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const appRoot = path.join(__dirname, '..', '..', 'app');
const links = require(path.join(appRoot, 'util', 'links.js'));
const { verifyPendingInstaller, sha512OfFile } = require(path.join(appRoot, 'util', 'pendingInstallerGuard.js'));

// updateSignature.js binds execFile when it loads, so it is loaded again against a stub.
function loadWithExecFile(fake) {
  const modulePath = path.join(appRoot, 'util', 'updateSignature.js');
  const original = childProcess.execFile;
  childProcess.execFile = fake;
  delete require.cache[modulePath];
  try {
    return require(modulePath);
  } finally {
    childProcess.execFile = original;
    delete require.cache[modulePath];
  }
}

test('a PowerShell that cannot run is a refusal that points to the manual download', async () => {
  const { verifyUpdateCodeSignature } = loadWithExecFile((_cmd, _args, _opts, done) => done(new Error('spawn powershell.exe ENOENT'), '', ''));
  const result = await verifyUpdateCodeSignature(['Shirow'], 'C:\\x\\setup.exe');
  assert.match(result, /could not be checked/);
  assert.ok(result.includes(links.releases), result);
});

test('a PowerShell that prints nothing is a refusal', async () => {
  const { verifyUpdateCodeSignature } = loadWithExecFile((_cmd, _args, _opts, done) => done(null, '  \n', ''));
  const result = await verifyUpdateCodeSignature(['Shirow'], 'C:\\x\\setup.exe');
  assert.match(result, /no answer from PowerShell/);
  assert.ok(result.includes(links.releases), result);
});

test('output that is not JSON is a refusal', async () => {
  const { verifyUpdateCodeSignature } = loadWithExecFile((_cmd, _args, _opts, done) => done(null, 'garbage', ''));
  assert.match(await verifyUpdateCodeSignature(['Shirow'], 'C:\\x\\setup.exe'), /failed to parse/);
});

test('an unsigned verdict from PowerShell is refused with the manual-download hint', async () => {
  const { verifyUpdateCodeSignature } = loadWithExecFile((_cmd, _args, _opts, done) => done(null, JSON.stringify({ Status: 'NotSigned' }), ''));
  const result = await verifyUpdateCodeSignature(['Shirow'], 'C:\\x\\setup.exe');
  assert.match(result, /^installer is not signed\./);
  assert.ok(result.includes(links.releases), result);
});

test('the pending-installer guard passes a file that verifies and keeps its digest', async () => {
  const hashes = ['aa', 'aa'];
  const result = await verifyPendingInstaller({
    file: 'setup.exe',
    publisherNames: ['Shirow'],
    verify: async () => null,
    hash: async () => hashes.shift(),
  });
  assert.deepEqual(result, { ok: true, digest: 'aa' });
});

test('the guard refuses when the signature check refuses, without hashing again', async () => {
  let hashed = 0;
  const result = await verifyPendingInstaller({
    file: 'setup.exe',
    publisherNames: ['Shirow'],
    verify: async () => 'installer is not signed. Download the release manually',
    hash: async () => ++hashed,
  });
  assert.equal(result.ok, false);
  assert.match(result.reason, /not signed/);
  assert.equal(hashed, 1);
});

test('the guard refuses a file swapped while it was being verified', async () => {
  const hashes = ['aa', 'bb'];
  const result = await verifyPendingInstaller({ file: 'setup.exe', publisherNames: ['Shirow'], verify: async () => null, hash: async () => hashes.shift() });
  assert.equal(result.ok, false);
  assert.match(result.reason, /changed while it was being verified/);
});

test('the guard refuses a file that no longer matches the digest recorded at download', async () => {
  let verified = false;
  const result = await verifyPendingInstaller({
    file: 'setup.exe',
    publisherNames: ['Shirow'],
    expectedDigest: 'aa',
    verify: async () => {
      verified = true;
      return null;
    },
    hash: async () => 'bb',
  });
  assert.equal(result.ok, false);
  assert.match(result.reason, /changed after it was verified/);
  assert.equal(verified, false);
});

test('the guard fails closed without a file, a publisher, or when verification throws', async () => {
  const verify = async () => null;
  const hash = async () => 'aa';
  assert.equal((await verifyPendingInstaller({ file: '', publisherNames: ['Shirow'], verify, hash })).ok, false);
  assert.equal((await verifyPendingInstaller({ file: 'x', publisherNames: [], verify, hash })).ok, false);
  const thrown = await verifyPendingInstaller({
    file: 'x',
    publisherNames: ['Shirow'],
    verify: async () => {
      throw new Error('boom');
    },
    hash,
  });
  assert.equal(thrown.ok, false);
  assert.ok(thrown.reason.includes(links.releases));
});

test('sha512OfFile hashes the real bytes', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-guard-'));
  try {
    const file = path.join(dir, 'a.bin');
    fs.writeFileSync(file, 'abc');
    assert.equal(
      await sha512OfFile(file),
      'ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f'
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('the updater checks the cached installer on download and again right before it runs', () => {
  const init = fs.readFileSync(path.join(appRoot, 'electron', 'init.js'), 'utf8');
  const downloaded = init.slice(init.indexOf("autoUpdater.on('update-downloaded'"));
  assert.match(downloaded.slice(0, 900), /checkPendingInstaller\(info\.downloadedFile, null\)[\s\S]*rejectPendingInstaller/);
  const install = init.slice(init.indexOf('async function startUpdateInstall('));
  const body = install.slice(0, install.indexOf('\n  }\n'));
  const recheck = body.indexOf('checkPendingInstaller(held.file, held.digest)');
  const quit = body.indexOf('quitAndInstall(');
  assert.ok(recheck > 0 && quit > recheck, 'the digest recorded at download must be re-checked before quitAndInstall');
  assert.match(init, /async function rejectPendingInstaller[\s\S]*helper\.clear\(\)[\s\S]*fs\.promises\.rm\(file[\s\S]*notifyUpdateError/);
});
