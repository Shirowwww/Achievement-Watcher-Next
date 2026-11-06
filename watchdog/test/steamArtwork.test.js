'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { steamHeaderImage, steamLibraryImage, steamSquareLogo } = require('../util/steamArtwork.js');

function fixture() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'aw-steam-artwork-'));
}

function writeJson(root, relativePath, value) {
  const file = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
}

function cleanup(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

test('resolved schema artwork wins over legacy Steam CDN URLs', () => {
  const root = fixture();
  try {
    writeJson(root, 'steam_cache/schema/english/3751950.db', {
      img: {
        header: 'https://cdn.example/3751950/hash/header.jpg',
        portrait: 'https://cdn.example/3751950/hash/library_capsule.jpg',
      },
    });

    assert.equal(
      steamHeaderImage('3751950', { userDataRoot: root }),
      'https://cdn.example/3751950/hash/header.jpg'
    );
    assert.equal(
      steamLibraryImage('3751950', { userDataRoot: root }),
      'https://cdn.example/3751950/hash/library_capsule.jpg'
    );
  } finally {
    cleanup(root);
  }
});

// The app's SteamDB fetch (init.js) writes { urls } for each appid; the portrait is picked from it.
test('the SteamDB covers the app cached supply a portrait when the schema has none', () => {
  const root = fixture();
  try {
    writeJson(root, 'steam_cache/steamdb_covers/3751950.json', {
      urls: [
        'https://cdn.example/3751950/hash/capsule_616x353.jpg',
        'https://cdn.example/3751950/hash/library_capsule.jpg',
        'https://cdn.example/3751950/hash/library_600x900.jpg',
      ],
    });

    assert.equal(
      steamLibraryImage('3751950', { userDataRoot: root }),
      'https://cdn.example/3751950/hash/library_600x900.jpg'
    );
  } finally {
    cleanup(root);
  }
});

test('a SteamDB portrait wins over a stale predictable URL in the schema', () => {
  const root = fixture();
  try {
    writeJson(root, 'steam_cache/schema/english/999999.db', {
      img: {
        header: 'https://cdn.akamai.steamstatic.com/steam/apps/999999/header.jpg',
        portrait: 'https://cdn.akamai.steamstatic.com/steam/apps/999999/library_600x900.jpg',
      },
    });
    writeJson(root, 'steam_cache/steamdb_covers/999999.json', {
      urls: ['https://cdn.example/999999/hash/library_capsule.jpg'],
    });

    assert.equal(
      steamHeaderImage('999999', { userDataRoot: root }),
      'https://cdn.akamai.steamstatic.com/steam/apps/999999/header.jpg'
    );
    assert.equal(
      steamLibraryImage('999999', { userDataRoot: root }),
      'https://cdn.example/999999/hash/library_capsule.jpg'
    );
  } finally {
    cleanup(root);
  }
});

test('a custom schema portrait is preserved even when SteamDB has a default', () => {
  const root = fixture();
  try {
    writeJson(root, 'steam_cache/schema/english/777777.db', {
      img: {
        header: 'https://cdn.akamai.steamstatic.com/steam/apps/777777/header.jpg',
        portrait: 'https://cdn2.steamgriddb.com/custom.jpg',
      },
    });
    writeJson(root, 'steam_cache/steamdb_covers/777777.json', {
      urls: ['https://cdn.example/777777/hash/library_capsule.jpg'],
    });

    assert.equal(steamLibraryImage('777777', { userDataRoot: root }), 'https://cdn2.steamgriddb.com/custom.jpg');
  } finally {
    cleanup(root);
  }
});

test('legacy URLs remain the fallback when no cache exists', () => {
  const root = fixture();
  try {
    assert.equal(
      steamHeaderImage('242050', { userDataRoot: root }),
      'https://cdn.cloudflare.steamstatic.com/steam/apps/242050/header.jpg'
    );
    assert.equal(
      steamLibraryImage('242050', { userDataRoot: root }),
      'https://cdn.cloudflare.steamstatic.com/steam/apps/242050/library_600x900.jpg'
    );
  } finally {
    cleanup(root);
  }
});

test('schema and SteamDB cover json are read from disk once per file, then served from cache', () => {
  const root = fixture();
  try {
    writeJson(root, 'steam_cache/schema/english/3751950.db', {
      img: { header: 'https://cdn.example/3751950/hash/capsule_616x353.jpg' },
    });
    writeJson(root, 'steam_cache/steamdb_covers/3751950.json', {
      urls: ['https://cdn.example/3751950/hash/library_600x900.jpg'],
    });

    const original = fs.readFileSync;
    let reads = 0;
    fs.readFileSync = (...args) => {
      if (String(args[0]).includes('3751950')) reads += 1;
      return original.apply(fs, args);
    };
    try {
      // Each call reads the schema, and the portrait the SteamDB covers too; a second unlock
      // notification for the same game must not re-parse either json file.
      steamHeaderImage('3751950', { userDataRoot: root });
      steamLibraryImage('3751950', { userDataRoot: root });
      const readsAfterFirstPass = reads;
      steamHeaderImage('3751950', { userDataRoot: root });
      steamLibraryImage('3751950', { userDataRoot: root });
      assert.equal(reads, readsAfterFirstPass, 'a repeated lookup must be served from cache, not re-read from disk');
      assert.ok(reads > 0, 'sanity: the spy actually observed the initial reads');
    } finally {
      fs.readFileSync = original;
    }
  } finally {
    cleanup(root);
  }
});

test('non-numeric appids never produce a broken Steam CDN URL', () => {
  assert.equal(steamHeaderImage('socialclub-smartsteamemu'), undefined);
  assert.equal(steamLibraryImage('socialclub-smartsteamemu'), undefined);
  assert.equal(steamHeaderImage(''), undefined);
  assert.equal(steamLibraryImage(null), undefined);
});

test('a community square logo is read from the cache the app writes', () => {
  const root = fixture();
  try {
    const key = require('node:crypto').createHash('sha1').update('292030\0the witcher 3: wild hunt').digest('hex');
    writeJson(root, `steam_cache/steamgriddb_icons/${key}.json`, {
      url: 'https://cdn2.steamgriddb.com/icon/abc.png',
      width: 512,
      height: 512,
    });

    assert.equal(
      steamSquareLogo('292030', 'The Witcher 3: Wild Hunt', { userDataRoot: root }),
      'https://cdn2.steamgriddb.com/icon/abc.png'
    );
    // A cached miss (the game has no community icon) must not be mistaken for one.
    assert.equal(steamSquareLogo('292030', 'Another Game', { userDataRoot: root }), null);
  } finally {
    cleanup(root);
  }
});

test('a cached icon miss stays a miss', () => {
  const root = fixture();
  try {
    const key = require('node:crypto').createHash('sha1').update('480\0spacewar').digest('hex');
    writeJson(root, `steam_cache/steamgriddb_icons/${key}.json`, {});
    assert.equal(steamSquareLogo('480', 'Spacewar', { userDataRoot: root }), null);
  } finally {
    cleanup(root);
  }
});
