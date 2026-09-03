'use strict';

// Protects against deleting a userData folder that isn't a pure, re-fetchable cache: builds a real
// tree with both safe caches and known irreplaceable folders and asserts the latter survive.

const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { fileURLToPath, pathToFileURL } = require('url');
const test = require('node:test');
const { SAFE_CACHE_DIRS, PRESERVED_CACHE_CHILDREN, clearSafeCaches } = require('../../app/util/clearableCaches.js');
const coverStore = require('../../app/util/coverStore.js');

function makeUserDataDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'aw-userdata-'));
}

function seedFile(root, rel) {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, 'x');
}

test('clearSafeCaches removes every allowlisted folder that exists and reports which ones', async () => {
  const root = makeUserDataDir();
  try {
    for (const rel of SAFE_CACHE_DIRS) seedFile(root, path.join(rel, 'sentinel.txt'));

    const cleared = await clearSafeCaches(root);

    assert.deepEqual([...cleared].sort(), [...SAFE_CACHE_DIRS].sort());
    for (const rel of SAFE_CACHE_DIRS) {
      assert.equal(fs.existsSync(path.join(root, rel, 'sentinel.txt')), false, `${rel} should be emptied`);
      // A folder holding something the user seeded stays; only its downloaded children go.
      if (PRESERVED_CACHE_CHILDREN[rel]) continue;
      assert.equal(fs.existsSync(path.join(root, rel)), false, `${rel} should be gone`);
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('clearSafeCaches removes normal downloaded artwork from steam_cache', async () => {
  const root = makeUserDataDir();
  try {
    const normalArtwork = path.join(root, 'steam_cache', 'icon', '480', 'library_600x900.jpg');
    seedFile(root, path.relative(root, normalArtwork));

    await clearSafeCaches(root);

    assert.equal(fs.existsSync(normalArtwork), false, 'normal downloaded artwork must be re-fetchable');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('clearSafeCaches keeps the imported GBE dll and drops the downloaded builds around it', async () => {
  const root = makeUserDataDir();
  try {
    seedFile(root, path.join('cache', 'gse_fork', 'custom', 'steam_api64.dll'));
    seedFile(root, path.join('cache', 'gse_fork', 'release-2026_01_01', 'steam_api64.dll'));

    await clearSafeCaches(root);

    assert.ok(
      fs.existsSync(path.join(root, 'cache', 'gse_fork', 'custom', 'steam_api64.dll')),
      'an imported dll has no download source and must survive'
    );
    assert.equal(fs.existsSync(path.join(root, 'cache', 'gse_fork', 'release-2026_01_01')), false, 'the downloaded build is re-fetchable');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('clearSafeCaches never touches the user-seeded Uplay R2 loader cache', async () => {
  const root = makeUserDataDir();
  try {
    seedFile(root, path.join('cache', 'uplayR2', 'demde-loader64.dll'));
    seedFile(root, path.join('steam_cache', 'schema', 'irrelevant.db'));

    await clearSafeCaches(root);

    assert.ok(
      fs.existsSync(path.join(root, 'cache', 'uplayR2', 'demde-loader64.dll')),
      'cache/uplayR2 has no public download source and must survive'
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('clearSafeCaches never touches backups, settings, custom covers, presets or theme images', async () => {
  const root = makeUserDataDir();
  try {
    const guarded = [
      path.join('backups', 'gbe', 'somegame', 'achievements.json.bak'),
      path.join('cfg', 'options.ini'),
      path.join('cfg', 'gameIndex.json'),
      path.join('cfg', 'manual-unlocks.json'),
      path.join('covers', '480.jpg'),
      path.join('presets', 'Users Presets', 'mypreset.json'),
      path.join('theme-images', 'bg-my-custom-background.png'),
      'epic_tokens.enc',
      'lockfile',
    ];
    for (const rel of guarded) seedFile(root, rel);
    for (const rel of SAFE_CACHE_DIRS) seedFile(root, path.join(rel, 'sentinel.txt'));

    await clearSafeCaches(root);

    for (const rel of guarded) {
      assert.ok(fs.existsSync(path.join(root, rel)), `${rel} must survive a cache clear`);
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('clearSafeCaches promotes a custom cached cover before deleting steam_cache', async () => {
  const root = makeUserDataDir();
  try {
    const cached = path.join(root, 'steam_cache', 'icon', '480', 'header.jpg');
    seedFile(root, path.relative(root, cached));
    const database = path.join(root, 'cfg', 'covers.db');
    fs.mkdirSync(path.dirname(database), { recursive: true });
    fs.writeFileSync(database, JSON.stringify({ 480: pathToFileURL(cached).href }), 'utf8');
    // Reproduce the renderer having loaded covers.db before the main process clears caches.
    coverStore.setStoreFile(database);
    assert.equal(coverStore.get('480'), pathToFileURL(cached).href);

    await clearSafeCaches(root);

    // A refresh reloads the externally changed database and must see the promoted durable path,
    // not its stale in-memory cache reference.
    const durable = fileURLToPath(coverStore.get('480'));
    assert.equal(fs.existsSync(cached), false, 'the disposable cache should still be cleared');
    assert.equal(path.dirname(durable), path.join(root, 'covers'));
    assert.equal(fs.existsSync(durable), true, 'the selected cover must survive in durable storage');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('clearSafeCaches keeps a SteamGridDB selection as a URL and deletes its downloaded bytes', async () => {
  const root = makeUserDataDir();
  try {
    const hash = '06f867ad5a8dd38502b33ec03d5abc47';
    const cached = path.join(root, 'steam_cache', 'icon', '391540', `${hash}.png`);
    seedFile(root, path.relative(root, cached));
    const database = path.join(root, 'cfg', 'covers.db');
    fs.mkdirSync(path.dirname(database), { recursive: true });
    fs.writeFileSync(database, JSON.stringify({ 391540: pathToFileURL(cached).href }), 'utf8');
    coverStore.setStoreFile(database);

    await clearSafeCaches(root);

    assert.equal(coverStore.get('391540'), `https://cdn2.steamgriddb.com/grid/${hash}.png`);
    assert.equal(fs.existsSync(cached), false, 'the downloaded cache image must be deleted');
    assert.equal(fs.existsSync(path.join(root, 'covers')), false, 'no durable duplicate is needed');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('clearSafeCaches is a no-op-safe when userData has no caches at all yet', async () => {
  const root = makeUserDataDir();
  try {
    const cleared = await clearSafeCaches(root);
    assert.deepEqual(cleared, []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('clearing caches keeps the imported Xbox library, which nothing can fetch back', async () => {
  /*
    steam_cache/xbox is not a cache OF the Xbox library, it IS the Xbox library:
    xboxPc.listCachedTitles() builds the list of imported titles from the folders under it that hold
    a schema.json. Wiping it did not cost a re-download - it removed those games from the grid until
    the user signed in to Xbox and ran the import again by hand.
  */
  const root = makeUserDataDir();
  try {
    seedFile(root, path.join('steam_cache', 'xbox', '1234567890', 'schema.json'));
    seedFile(root, path.join('steam_cache', 'xbox', '1234567890', 'state.json'));
    // Everything else under steam_cache is genuinely re-fetchable and must still go.
    seedFile(root, path.join('steam_cache', 'schema', 'english', '480.db'));
    seedFile(root, path.join('steam_cache', 'icon', '480', 'header.jpg'));

    const cleared = await clearSafeCaches(root);

    assert.ok(cleared.includes('steam_cache'), 'steam_cache is still reported as cleared');
    assert.equal(fs.existsSync(path.join(root, 'steam_cache', 'xbox', '1234567890', 'schema.json')), true, 'the imported title must survive');
    assert.equal(fs.existsSync(path.join(root, 'steam_cache', 'xbox', '1234567890', 'state.json')), true, 'and its unlock state with it');
    assert.equal(fs.existsSync(path.join(root, 'steam_cache', 'schema', 'english', '480.db')), false, 'a Steam schema is re-fetchable and goes');
    assert.equal(fs.existsSync(path.join(root, 'steam_cache', 'icon', '480', 'header.jpg')), false, 'so is downloaded artwork');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('the folder the Xbox library is read from is the one that is preserved', () => {
  // A move of that folder in xboxPc.js would silently reopen the hole above.
  const xbox = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'parser', 'xboxPc.js'), 'utf8');
  assert.match(xbox, /function listCachedTitles\(\)[\s\S]*?path\.join\(getUserDataPath\(\), 'steam_cache', 'xbox'\)/);
  assert.ok(PRESERVED_CACHE_CHILDREN.steam_cache.includes('xbox'));
});

test('a preserved folder with nothing left to preserve does not linger as an empty shell', async () => {
  // The exception must not change what happens on a machine that never used the source it exists for.
  const root = makeUserDataDir();
  try {
    seedFile(root, path.join('steam_cache', 'schema', 'english', '480.db'));
    seedFile(root, path.join('cache', 'gse_fork', 'release-1', 'steam_api64.dll'));

    await clearSafeCaches(root);

    assert.equal(fs.existsSync(path.join(root, 'steam_cache')), false, 'no Xbox library here, so the folder goes');
    assert.equal(fs.existsSync(path.join(root, 'cache', 'gse_fork')), false, 'no imported dll here either');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
