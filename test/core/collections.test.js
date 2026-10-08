'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const appDir = path.join(__dirname, '..', '..', 'app');
const collections = require(path.join(appDir, 'util', 'collections.js'));
const { createCollectionStore, detectImageType, MAX_IMAGE_BYTES } = require(path.join(appDir, 'util', 'collectionStore.js'));

const ID = '11111111-2222-3333-4444-555555555555';
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32, 1)]);

function tempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-collections-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test('names lose control characters, are trimmed and capped', () => {
  assert.equal(collections.normalizeName('  Co\u0000op\n  '), 'Coop');
  assert.equal(collections.normalizeName('x'.repeat(500)).length, collections.MAX_NAME_LENGTH);
  assert.equal(collections.normalizeName(null), '');
});

test('colour and icon fall back to the defaults', () => {
  assert.equal(collections.normalizeColor('#ABCDEF'), '#abcdef');
  assert.equal(collections.normalizeColor('red; background:url(x)'), collections.DEFAULT_COLOR);
  assert.equal(collections.normalizeIcon('trophy'), 'trophy');
  assert.equal(collections.normalizeIcon('<script>'), collections.DEFAULT_ICON);
});

test('game keys keep the namespaced library id and reject anything odd', () => {
  assert.equal(collections.normalizeGameKey(480), '480');
  assert.equal(collections.normalizeGameKey('gog-480'), 'gog-480');
  assert.notEqual(collections.normalizeGameKey('gog-480'), collections.normalizeGameKey(480));
  for (const bad of ['', '  ', '../x', 'a b', '-1', null, undefined, {}, ['1'], 'x'.repeat(200)]) {
    assert.equal(collections.normalizeGameKey(bad), '', JSON.stringify(bad));
  }
});

test('two platforms sharing a numeric id stay distinct members', () => {
  let state = collections.createCollection(collections.emptyState(), { id: ID, name: 'Mine' }).state;
  state = collections.addGames(state, ID, ['480', 'gog-480', 'uplay-480', '480']);
  assert.deepEqual(state.collections[0].games, ['480', 'gog-480', 'uplay-480']);
  state = collections.removeGames(state, ID, 'gog-480');
  assert.deepEqual(state.collections[0].games, ['480', 'uplay-480']);
});

test('normalizeState drops corrupted entries and keeps good ones', () => {
  const state = collections.normalizeState({
    collections: [
      null,
      'text',
      { id: 'nope', name: 'bad id' },
      { id: ID, name: '   ' },
      { id: ID, name: 'Good', color: 'zzz', icon: 'zzz', image: '../../evil.png', games: ['1', 'a b', 7, {}, '1'] },
      { id: ID, name: 'Duplicate id' },
    ],
  });
  assert.equal(state.collections.length, 1);
  assert.deepEqual(state.collections[0], {
    id: ID,
    name: 'Good',
    color: collections.DEFAULT_COLOR,
    icon: collections.DEFAULT_ICON,
    image: '',
    games: ['1', '7'],
  });
  assert.deepEqual(collections.normalizeState('garbage'), collections.emptyState());
});

test('counts are capped on read and on create', () => {
  const many = Array.from({ length: collections.MAX_COLLECTIONS + 10 }, (_, i) => ({
    id: `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`,
    name: `C${i}`,
  }));
  assert.equal(collections.normalizeState({ collections: many }).collections.length, collections.MAX_COLLECTIONS);

  const full = collections.normalizeState({ collections: many });
  const refused = collections.createCollection(full, { id: ID, name: 'one more' });
  assert.equal(refused.error, 'limit');
  assert.equal(refused.state, full);

  const games = Array.from({ length: collections.MAX_GAMES_PER_COLLECTION + 50 }, (_, i) => `g${i}`);
  const state = collections.normalizeState({ collections: [{ id: ID, name: 'Big', games }] });
  assert.equal(state.collections[0].games.length, collections.MAX_GAMES_PER_COLLECTION);
  assert.equal(collections.addGames(state, ID, 'extra').collections[0].games.length, collections.MAX_GAMES_PER_COLLECTION);
});

test('updates are immutable and a blank rename is ignored', () => {
  const created = collections.createCollection(collections.emptyState(), { id: ID, name: 'Old' }).state;
  const renamed = collections.updateCollection(created, ID, { name: 'New', color: '#50fa7b' });
  assert.equal(created.collections[0].name, 'Old');
  assert.equal(renamed.collections[0].name, 'New');
  assert.equal(collections.updateCollection(renamed, ID, { name: '  ' }).collections[0].name, 'New');
  assert.equal(collections.updateCollection(renamed, ID, { image: 'other.png' }).collections[0].image, '');
});

test('filtering lists only members and keeps references to games that are gone', () => {
  let state = collections.createCollection(collections.emptyState(), { id: ID, name: 'Mine' }).state;
  state = collections.addGames(state, ID, ['1', '2', 'removed-from-disk']);
  const library = [{ appid: 1 }, { appid: '2' }, { appid: 3 }, null];
  assert.deepEqual(collections.filterGames(library, state, ID).map((game) => game.appid), [1, '2']);
  assert.equal(collections.filterGames(library, state, '').length, 4);
  assert.equal(state.collections[0].games.includes('removed-from-disk'), true);
  assert.equal(collections.filterGames([{ appid: 'removed-from-disk' }], state, ID).length, 1);
});

test('the store round-trips through an atomic write and leaves no temporary file', (t) => {
  const dir = tempDir(t);
  const store = createCollectionStore(dir);
  assert.deepEqual(store.read(), collections.emptyState());
  const { collection } = store.create({ name: 'Backlog', color: '#ff79c6', icon: 'star' });
  store.addGames(collection.id, ['10', 'gog-10']);
  const reread = createCollectionStore(dir).read();
  assert.equal(reread.collections[0].name, 'Backlog');
  assert.deepEqual(reread.collections[0].games, ['10', 'gog-10']);
  assert.deepEqual(
    fs.readdirSync(path.join(dir, 'cfg')).filter((name) => name.endsWith('.tmp')),
    []
  );
  assert.equal(path.basename(store.stateFile), 'collections.json');
});

test('a corrupted file reads as empty, is kept aside and never throws', (t) => {
  const dir = tempDir(t);
  fs.mkdirSync(path.join(dir, 'cfg'));
  fs.writeFileSync(path.join(dir, 'cfg', 'collections.json'), '{"collections": [ {"id"');
  const store = createCollectionStore(dir);
  assert.deepEqual(store.read(), collections.emptyState());
  assert.equal(fs.existsSync(path.join(dir, 'cfg', 'collections.json.corrupt')), true);
  assert.equal(store.create({ name: 'Fresh' }).collection.name, 'Fresh');
});

test('a read-only collections file is still replaced', (t) => {
  const dir = tempDir(t);
  const store = createCollectionStore(dir);
  store.create({ name: 'First' });
  fs.chmodSync(store.stateFile, 0o444);
  assert.equal(store.create({ name: 'Second' }).state.collections.length, 2);
});

test('image type comes from magic bytes only', () => {
  assert.equal(detectImageType(PNG), 'png');
  assert.equal(detectImageType(Buffer.from([0xff, 0xd8, 0xff, 0xe0, ...Array.from({ length: 20 }, () => 0)])), 'jpg');
  assert.equal(detectImageType(Buffer.from('GIF89a' + 'x'.repeat(20), 'latin1')), 'gif');
  assert.equal(detectImageType(Buffer.from('RIFF\u0001\u0000\u0000\u0000WEBPVP8 ', 'latin1')), 'webp');
  assert.equal(detectImageType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')), null);
  assert.equal(detectImageType(Buffer.alloc(4)), null);
});

test('a custom image is validated, copied into cfg, and removed with its collection', (t) => {
  const dir = tempDir(t);
  const store = createCollectionStore(dir);
  const { collection } = store.create({ name: 'Pics' });

  const disguised = path.join(dir, 'fake.png');
  fs.writeFileSync(disguised, '<svg xmlns="http://www.w3.org/2000/svg"></svg>');
  assert.throws(() => store.setImage(collection.id, disguised));

  const oversized = path.join(dir, 'huge.png');
  fs.writeFileSync(oversized, Buffer.concat([PNG, Buffer.alloc(MAX_IMAGE_BYTES)]));
  assert.throws(() => store.setImage(collection.id, oversized));
  assert.equal(fs.existsSync(store.imageDir) ? fs.readdirSync(store.imageDir).length : 0, 0);

  const good = path.join(dir, 'cover.bin');
  fs.writeFileSync(good, PNG);
  const state = store.setImage(collection.id, good);
  const file = state.collections[0].image;
  assert.match(file, /\.png$/);
  assert.equal(fs.existsSync(store.imagePath(file)), true);
  assert.equal(store.imagePath('../../cfg/options.ini'), '');

  const other = path.join(dir, 'other.png');
  fs.writeFileSync(other, Buffer.concat([PNG, Buffer.from('different')]));
  const replaced = store.setImage(collection.id, other).collections[0].image;
  assert.notEqual(replaced, file);
  assert.equal(fs.existsSync(store.imagePath(file)), false);

  store.remove(collection.id);
  assert.deepEqual(fs.readdirSync(store.imageDir), []);
});
