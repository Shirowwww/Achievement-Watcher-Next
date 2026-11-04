'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const AdmZip = require('../../app/node_modules/adm-zip');

const { updateExtensions, isNewer } = require('../../app/util/extensionUpdate.js');
const { makeTempDir } = require('../helpers/tempDir.js');
const { rawZip } = require('../helpers/rawZip.js');

const BASE = 'https://github.com/Shirowwww/Achievement-Watcher-Next/releases/download/v9/';
const PLAYNITE_ID = 'AwNextAchievements_4ae86d6e-6590-497f-adf9-0d373068627d';

function zipOf(files) {
  const zip = new AdmZip();
  for (const [name, text] of Object.entries(files)) zip.addFile(name, Buffer.from(text));
  return zip.toBuffer();
}

function millenniumZip(version) {
  return zipOf({
    'aw-next/plugin.json': JSON.stringify({ name: 'aw-next', version }),
    'aw-next/.millennium/Dist/index.js': `// ${version}`,
  });
}

function pext(version, id = PLAYNITE_ID) {
  return zipOf({ 'extension.yaml': `Id: ${id}\nVersion: ${version}\n`, 'AwNextAchievements.dll': `dll ${version}` });
}

function setup() {
  const root = makeTempDir('aw-ext-update-');
  const steamPath = path.join(root, 'Steam');
  const playniteExtensionsDir = path.join(root, 'Playnite', 'Extensions');
  const plugin = path.join(steamPath, 'millennium', 'plugins', 'aw-next');
  const extension = path.join(playniteExtensionsDir, PLAYNITE_ID);
  fs.mkdirSync(path.join(plugin, '.millennium', 'Dist'), { recursive: true });
  fs.writeFileSync(path.join(plugin, 'plugin.json'), JSON.stringify({ name: 'aw-next', version: '0.1.0' }));
  fs.writeFileSync(path.join(plugin, '.millennium', 'Dist', 'index.js'), '// 0.1.0');
  fs.mkdirSync(extension, { recursive: true });
  fs.writeFileSync(path.join(extension, 'extension.yaml'), `Id: ${PLAYNITE_ID}\nVersion: 1.0.0\n`);
  fs.writeFileSync(path.join(extension, 'AwNextAchievements.dll'), 'dll 1.0.0');
  return { env: { steamPath, playniteExtensionsDir }, plugin, extension };
}

function releaseOf(buffers, extra = {}) {
  const assets = Object.entries(buffers).map(([name, buffer]) => ({
    name,
    size: buffer.length,
    browser_download_url: BASE + name,
    digest: `sha256:${crypto.createHash('sha256').update(buffer).digest('hex')}`,
    ...extra,
  }));
  return { assets, served: buffers };
}

function run(env, release, options = {}) {
  const requested = [];
  return updateExtensions({
    env,
    fetchRelease: async () => release,
    fetchBuffer: async (url) => {
      requested.push(url);
      return release.served[url.slice(BASE.length)];
    },
    force: true,
    ...options,
  }).then((results) => ({ results, requested }));
}

test('both installed extensions are replaced by the newer release files', async () => {
  const { env, plugin, extension } = setup();
  const release = releaseOf({ 'aw-next-millennium.zip': millenniumZip('0.2.0'), [`${PLAYNITE_ID}_1_1_0.pext`]: pext('1.1.0') });
  const { results } = await run(env, release);
  assert.deepEqual(results.map((r) => [r.id, r.status, r.to]), [['millennium', 'updated', '0.2.0'], ['playnite', 'updated', '1.1.0']]);
  assert.equal(fs.readFileSync(path.join(plugin, '.millennium', 'Dist', 'index.js'), 'utf8'), '// 0.2.0');
  assert.equal(fs.readFileSync(path.join(extension, 'AwNextAchievements.dll'), 'utf8'), 'dll 1.1.0');
  assert.deepEqual(fs.readdirSync(path.dirname(plugin)), ['aw-next']);
  assert.deepEqual(fs.readdirSync(path.dirname(extension)), [PLAYNITE_ID]);
});

test('an extension switched off in the settings is left alone, the other still follows', async () => {
  const { env, plugin, extension } = setup();
  const release = releaseOf({ 'aw-next-millennium.zip': millenniumZip('0.2.0'), [`${PLAYNITE_ID}_1_1_0.pext`]: pext('1.1.0') });
  const { results } = await run(env, release, { enabled: { millennium: false } });
  assert.deepEqual(results.map((r) => r.id), ['playnite']);
  assert.equal(fs.readFileSync(path.join(plugin, '.millennium', 'Dist', 'index.js'), 'utf8'), '// 0.1.0');
  assert.equal(fs.readFileSync(path.join(extension, 'AwNextAchievements.dll'), 'utf8'), 'dll 1.1.0');
});

test('nothing is fetched when neither extension is installed', async () => {
  const root = makeTempDir('aw-ext-update-none-');
  let asked = false;
  const results = await updateExtensions({
    env: { steamPath: root, playniteExtensionsDir: path.join(root, 'none') },
    fetchRelease: async () => {
      asked = true;
      return {};
    },
    fetchBuffer: async () => Buffer.alloc(0),
    force: true,
  });
  assert.deepEqual(results, []);
  assert.equal(asked, false);
});

test('an equal or older package changes nothing', async () => {
  const { env, plugin } = setup();
  const release = releaseOf({ 'aw-next-millennium.zip': millenniumZip('0.1.0') });
  const { results } = await run(env, release);
  assert.equal(results.find((r) => r.id === 'millennium').status, 'current');
  assert.equal(fs.readFileSync(path.join(plugin, '.millennium', 'Dist', 'index.js'), 'utf8'), '// 0.1.0');
});

test('a package whose digest does not match is refused', async () => {
  const { env, plugin } = setup();
  const release = releaseOf({ 'aw-next-millennium.zip': millenniumZip('0.2.0') });
  release.assets[0].digest = `sha256:${'0'.repeat(64)}`;
  const { results } = await run(env, release);
  assert.equal(results[0].status, 'bad-digest');
  assert.equal(fs.readFileSync(path.join(plugin, 'plugin.json'), 'utf8').includes('0.1.0'), true);
});

test('an asset served from another host is never downloaded', async () => {
  const { env } = setup();
  const release = releaseOf({ 'aw-next-millennium.zip': millenniumZip('0.2.0') });
  release.assets[0].browser_download_url = 'https://evil.example/aw-next-millennium.zip';
  const { results, requested } = await run(env, release);
  assert.equal(results[0].status, 'refused-url');
  assert.deepEqual(requested, []);
});

test('an archive entry that escapes the folder is refused', async () => {
  const { env, plugin } = setup();
  const bad = rawZip([
    { name: 'aw-next/plugin.json', data: Buffer.from(JSON.stringify({ name: 'aw-next', version: '0.2.0' })) },
    { name: 'aw-next/../../escape.txt', data: Buffer.from('x') },
  ]);
  const { results } = await run(env, releaseOf({ 'aw-next-millennium.zip': bad }));
  assert.equal(results[0].status, 'unsafe-entry');
  assert.equal(fs.existsSync(path.join(path.dirname(plugin), 'escape.txt')), false);
});

test('a package for another extension id is refused', async () => {
  const { env, extension } = setup();
  const release = releaseOf({ 'AwNextAchievements_other.pext': pext('2.0.0', 'AwNextAchievements_00000000-0000-0000-0000-000000000000') });
  const { results } = await run(env, release);
  assert.equal(results.find((r) => r.id === 'playnite').status, 'wrong-package');
  assert.equal(fs.readFileSync(path.join(extension, 'AwNextAchievements.dll'), 'utf8'), 'dll 1.0.0');
});

test('a folder that cannot be moved is left as it was and retried at the next start', async () => {
  const { env, plugin } = setup();
  const realRename = fs.renameSync;
  fs.renameSync = (from, to) => {
    if (from === plugin) throw Object.assign(new Error('busy'), { code: 'EBUSY' });
    return realRename(from, to);
  };
  let checkedAt = 0;
  try {
    const release = releaseOf({ 'aw-next-millennium.zip': millenniumZip('0.2.0') });
    const { results } = await run(env, release, { force: false, writeCheckedAt: (time) => (checkedAt = time) });
    assert.equal(results[0].status, 'busy');
  } finally {
    fs.renameSync = realRename;
  }
  assert.equal(checkedAt, 0);
  assert.equal(fs.readFileSync(path.join(plugin, '.millennium', 'Dist', 'index.js'), 'utf8'), '// 0.1.0');
  assert.deepEqual(fs.readdirSync(path.dirname(plugin)), ['aw-next']);
});

test('the release is read once a day at most', async () => {
  const { env } = setup();
  let asked = 0;
  const options = { env, fetchRelease: async () => (asked += 1, { assets: [] }), fetchBuffer: async () => Buffer.alloc(0) };
  const stamp = { value: 0 };
  const shared = { ...options, now: () => 1_000_000_000, readCheckedAt: () => stamp.value, writeCheckedAt: (time) => (stamp.value = time) };
  await updateExtensions(shared);
  await updateExtensions(shared);
  assert.equal(asked, 1);
});

test('versions compare as numbers, not text', () => {
  assert.equal(isNewer('0.10.0', '0.9.0'), true);
  assert.equal(isNewer('1.0', '1.0.0'), false);
  assert.equal(isNewer('junk', '1.0.0'), false);
});
