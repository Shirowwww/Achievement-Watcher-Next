'use strict';

/*
  Seven live watchers kept their own copy of the same three cache functions. The copies differed only
  in a filename prefix and a log tag, which is how a fix lands in one of them and not the other six.
  The filenames matter beyond tidiness: they name files already on every user's disk, so sharing the
  code must not rename a single one, or every game's baseline reads as "never seen" and re-announces
  everything already unlocked.
*/

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { createBaselineCache } = require('../util/baselineCache.js');

function withDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-baseline-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test('the file each watcher writes keeps the name it had before this was shared', (t) => {
  const dir = withDir(t);
  const named = (prefix, key) => path.basename(createBaselineCache({ prefix, dir }).file(key));

  // ShadPS4 wrote its files with no prefix at all and still has to read them.
  assert.equal(named('', 'CUSA12345'), 'CUSA12345.json');
  assert.equal(named('rpcs3', 'NPWR00123'), 'rpcs3-NPWR00123.json');
  assert.equal(named('gog', '1207658930'), 'gog-1207658930.json');
  assert.equal(named('xenia', '4D5307E6'), 'xenia-4D5307E6.json');
  assert.equal(named('xlln', '4D530910'), 'xlln-4D530910.json');
  assert.equal(named('ubisoft', '720'), 'ubisoft-720.json');
  assert.equal(named('ea', '12345-SET1'), 'ea-12345-SET1.json');
});

test('a key cannot escape the cache folder or name a file it should not', (t) => {
  const dir = withDir(t);
  const cache = createBaselineCache({ prefix: 'gog', dir });
  for (const key of ['../../evil', 'a/b', 'a\\b', 'x:y']) {
    const file = cache.file(key);
    assert.equal(path.dirname(file), dir, `${key} must stay inside the cache folder`);
  }
});

test('a baseline round-trips, and a game never seen reads as null', (t) => {
  const dir = withDir(t);
  const cache = createBaselineCache({ prefix: 'rpcs3', dir });

  assert.equal(cache.load('NPWR1'), null, 'never seen is not the same as nothing unlocked');
  cache.save('NPWR1', ['a', 'b']);
  assert.deepEqual(cache.load('NPWR1'), { unlocked: ['a', 'b'] });

  // EA hands its unlocks over as a Set.
  cache.save('NPWR2', new Set(['c']));
  assert.deepEqual(cache.load('NPWR2'), { unlocked: ['c'] });
});

// A truncated baseline reads back as "nothing unlocked yet", and every earned achievement is
// announced again. None of the seven copies wrote atomically.
test('the write leaves no half-written baseline behind', (t) => {
  const dir = withDir(t);
  const cache = createBaselineCache({ prefix: 'xenia', dir });
  cache.save('4D5307E6', ['one']);

  assert.deepEqual(
    fs.readdirSync(dir).filter((name) => name.endsWith('.tmp')),
    [],
    'the temporary file is renamed into place, never left'
  );
  assert.deepEqual(cache.load('4D5307E6'), { unlocked: ['one'] });
});

test('an unwritable folder is reported, not thrown', (t) => {
  const dir = withDir(t);
  const warnings = [];
  const cache = createBaselineCache({ prefix: 'gog', tag: 'gog', dir: path.join(dir, 'file.txt', 'nested'), debug: { warn: (m) => warnings.push(m) } });
  fs.writeFileSync(path.join(dir, 'file.txt'), 'not a folder');

  assert.doesNotThrow(() => cache.save('1', ['a']));
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /\[gog\] cache save failed for 1/);
});

test('no watcher keeps a cache triplet of its own any more', () => {
  const consoleDir = path.join(__dirname, '..', 'console');
  for (const name of fs.readdirSync(consoleDir)) {
    if (!name.endsWith('.js')) continue;
    const source = fs.readFileSync(path.join(consoleDir, name), 'utf8');
    assert.doesNotMatch(source, /function cacheSave\(/, `${name} must use the shared baseline cache`);
    assert.doesNotMatch(source, /function cacheLoad\(/, `${name} must use the shared baseline cache`);
  }
});
