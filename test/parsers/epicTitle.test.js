'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');

const { resolveEpicTitle, MISS_TTL_MS } = require('../../app/util/epicTitle.js');

function tempCacheFile(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-epic-title-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return path.join(dir, 'steam_cache', 'epic_titles.json');
}

function fakeIdentity({ artifact = null, namespaces = {}, calls = [] } = {}) {
  return {
    resolveEpicArtifactIdentity: async (id) => {
      calls.push(`artifact:${id}`);
      return typeof artifact === 'function' ? artifact(id) : artifact;
    },
    resolveEpicNamespaceName: async (ns) => {
      calls.push(`namespace:${ns}`);
      if (namespaces[ns] instanceof Error) throw namespaces[ns];
      return namespaces[ns] || '';
    },
  };
}

test('a name found once is served from disk afterwards, with no network call', async (t) => {
  const cacheFile = tempCacheFile(t);
  const calls = [];
  const identity = fakeIdentity({ artifact: { displayName: 'Civilization VI', namespace: 'ns' }, calls });

  assert.equal(await resolveEpicTitle('Kinglet', { cacheFile, identity }), 'Civilization VI');
  assert.equal(await resolveEpicTitle('Kinglet', { cacheFile, identity }), 'Civilization VI');

  assert.deepEqual(calls, ['artifact:Kinglet']);
});

test('an id that is a namespace is named from its sandbox', async (t) => {
  const cacheFile = tempCacheFile(t);
  const identity = fakeIdentity({ namespaces: { cd14dcaa: 'Civilization VI' } });

  assert.equal(await resolveEpicTitle('cd14dcaa', { cacheFile, identity }), 'Civilization VI');
});

test('an artifact without a catalog item is named from its namespace', async (t) => {
  const cacheFile = tempCacheFile(t);
  const identity = fakeIdentity({ artifact: { displayName: '', namespace: 'ns-1' }, namespaces: { 'ns-1': 'Some Game' } });

  assert.equal(await resolveEpicTitle('abc123', { cacheFile, identity }), 'Some Game');
});

test('a miss is not asked again before its delay, then is', async (t) => {
  const cacheFile = tempCacheFile(t);
  const calls = [];
  const identity = fakeIdentity({ calls });
  let clock = 1_000_000;
  const now = () => clock;

  assert.equal(await resolveEpicTitle('unknown', { cacheFile, identity, now }), '');
  clock += MISS_TTL_MS - 1;
  assert.equal(await resolveEpicTitle('unknown', { cacheFile, identity, now }), '');
  assert.equal(calls.length, 2, 'one artifact and one namespace lookup for the first miss only');

  clock += 2;
  await resolveEpicTitle('unknown', { cacheFile, identity, now });
  assert.equal(calls.length, 4);
});

test('a network failure is not remembered as a miss', async (t) => {
  const cacheFile = tempCacheFile(t);
  const identity = fakeIdentity({ namespaces: { flaky: new Error('EGData sandbox lookup 503') } });

  await assert.rejects(resolveEpicTitle('flaky', { cacheFile, identity }), /503/);
  assert.equal(fs.existsSync(cacheFile), false);
});

test('a corrupt cache file is read as empty rather than failing the scan', async (t) => {
  const cacheFile = tempCacheFile(t);
  fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
  fs.writeFileSync(cacheFile, '{not json');
  const identity = fakeIdentity({ artifact: { displayName: 'Game', namespace: '' } });

  assert.equal(await resolveEpicTitle('abc', { cacheFile, identity }), 'Game');
  assert.equal(JSON.parse(fs.readFileSync(cacheFile, 'utf8')).abc.title, 'Game');
});
