'use strict';

/*
  One file for the small guards that had no coverage and each cost something real when they were
  missing. Every case here is a bug that shipped, written as the shape it took.
*/

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { evaluateUpdateSignature } = require('../../app/util/updateSignature.js');
const snapshot = require('../../app/util/librarySnapshot.js');
const uninstall = require('../../app/util/uninstall.js');
const { lazyRequire } = require('../../app/util/lazyRequire.js');

test('an installer modified after signing is refused', () => {
  // HashMismatch is Authenticode saying the bytes no longer match the signature. Accepting it let
  // a repackaged installer through on the strength of a signature block it no longer covered.
  assert.match(
    evaluateUpdateSignature(['Shirow'], { Status: 'HashMismatch', SignerCertificate: { Subject: 'CN=Shirow' } }),
    /modified after it was signed/
  );
});

test('a locally untrusted but genuine signature is still accepted', () => {
  // The release certificate is self-signed on purpose, so trust status is not the test.
  for (const status of ['UnknownError', 'NotTrusted', 'Valid']) {
    assert.equal(evaluateUpdateSignature(['Shirow'], { Status: status, SignerCertificate: { Subject: 'CN=Shirow' } }), null, status);
  }
  assert.equal(evaluateUpdateSignature(['Shirow'], { Status: 'NotSigned' }), null);
});

test('the stored library is keyed to the Steam account it was scanned for', () => {
  // steam.main filters discovery, so a library built for one account must not be served to another
  // - the other account's stat files never moved, so the scan fingerprint still matched.
  const base = { achievement: { lang: 'english' }, achievement_source: { steamEmu: true } };
  const first = { ...base, steam: { main: '76561198000000001' } };
  const second = { ...base, steam: { main: '76561198000000002' } };
  assert.notEqual(snapshot.configKey(first), snapshot.configKey(second));

  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-snapshot-account-'));
  const game = {
    appid: '10',
    name: 'Game',
    img: { header: 'file:///c.jpg' },
    achievement: { list: [{ name: 'A', Achieved: 0 }] },
  };
  snapshot.write(userData, first, [game]);
  assert.deepEqual(snapshot.read(userData, second), []);
  assert.deepEqual(snapshot.read(userData, first), [game]);
});

test('a folder holding a whole library is never a removal target', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-uninstall-'));
  const make = (...segments) => {
    const dir = path.join(root, ...segments);
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  };
  // The permanent-delete path runs a recursive fs.rm behind this same gate.
  for (const name of ['Games', 'SteamLibrary', 'My Games', 'Epic Games']) {
    assert.equal(uninstall.isSafeTrashTarget(make(name)), false, name);
  }
  assert.equal(uninstall.isSafeTrashTarget(make('steamapps', 'common')), false);
  // A real game folder under one of them is still removable.
  assert.equal(uninstall.isSafeTrashTarget(make('steamapps', 'common', 'Some Game')), true);
});

test('a lazily required function keeps its identity', () => {
  // A fresh bound function per access is fine to call and useless to compare: `off(handler)` would
  // never remove anything, and a Set keyed on it would grow one entry per access.
  const lazyPath = lazyRequire('path');
  assert.equal(lazyPath.join, lazyPath.join);
  assert.equal(lazyPath.join('a', 'b'), path.join('a', 'b'));
});

test('scripts the overlay loads as classic <script> declare no global the preload owns', () => {
  /*
    view/overlay.html loads these with <script src>, in a page whose preload has already defined a
    non-configurable global `api` (contextBridge). A top-level `const api` there is a SyntaxError
    that stops the whole file - which is exactly what silently removed controller labels from the
    overlay.
  */
  const exposed = ['api', 'customApi'];
  const overlay = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'view', 'overlay.html'), 'utf8');
  const loaded = [...overlay.matchAll(/<script src="([^"]+)"><\/script>/g)].map((match) => match[1]);
  assert.ok(loaded.length > 0, 'expected overlay.html to load classic scripts');
  for (const relative of loaded) {
    const file = path.join(__dirname, '..', '..', 'app', 'view', relative);
    const source = fs.readFileSync(file, 'utf8');
    for (const name of exposed) {
      assert.doesNotMatch(source, new RegExp(`^\\s*(?:const|let|class|function)\\s+${name}\\b`, 'm'), `${relative} declares '${name}'`);
    }
  }
});
