'use strict';

/*
  app/parser/steam.js keeps its logger in a module-level `debug`, installed by initDebug(). The main
  process reaches getSteamUsersList() and fetchIcon() through electron/ipc.js, and when that file
  stopped calling initDebug() nothing else did: the first `debug.log(...)` inside getSteamUsers()
  threw a TypeError, getSteamUsersList()'s catch turned it into `[]`, and Settings > Steam account
  listed no accounts at all. Nothing failed loudly.

  The two halves of the fix. The first is a contract check rather than a call: the failing path
  needs a Steam install, a public profile and the network, so what is asserted instead is that the
  logger the file starts with answers every call the file actually makes - derived from the file, so
  a `debug.warn()` added later fails here rather than at run time inside a catch that hides it.
*/

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const steamFile = path.join(__dirname, '..', '..', 'app', 'parser', 'steam.js');
const ipcFile = path.join(__dirname, '..', '..', 'app', 'electron', 'ipc.js');

function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
}

test('the Steam parser can log before initDebug installs the real logger', () => {
  // Fresh require, in a process that never calls initDebug - the main process's situation.
  delete require.cache[require.resolve(steamFile)];
  const steam = require(steamFile);
  assert.equal(typeof steam.initDebug, 'function', 'requiring the parser must not throw');

  const source = stripComments(fs.readFileSync(steamFile, 'utf8'));
  const used = new Set([...source.matchAll(/debug\.([a-zA-Z]+)\(/g)].map((match) => match[1]));
  assert.ok(used.size > 0, 'expected the parser to log something');

  const declaration = /^let debug = (\{.*\});$/m.exec(source);
  assert.ok(declaration, 'debug must start as a usable object, not undefined');
  // Rebuild the declared default and call each method, so this fails on a stub that is not callable
  // rather than only on a missing name.
  const fallback = new Function(`return ${declaration[1]};`)();
  for (const method of used) {
    assert.equal(typeof fallback[method], 'function', `the default logger has no ${method}()`);
    assert.doesNotThrow(() => fallback[method]('probe'), `default ${method}() must be safe to call`);
  }
});

test('the main process installs the Steam parser logger before it uses the parser', () => {
  const source = stripComments(fs.readFileSync(ipcFile, 'utf8'));
  // initDebug also sets the parser's cache root, which is where the "confirmed public earlier"
  // Steam account cache is read from - so this is not only about log lines.
  assert.match(source, /steamJS\.initDebug\(\{[^}]*userDataPath: app\.getPath\('userData'\)/);
  const direct = [...source.matchAll(/steamJS\.(getSteamUsersList|fetchIcon)\b/g)];
  assert.deepEqual(direct, [], 'reach the parser through the helper that initialises it, not directly');
});
