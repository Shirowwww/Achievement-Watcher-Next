'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const gog = require('../../app/parser/gog.js');
const request = require('../../app/node_modules/request-zero');

test('legacy GOG discovery tolerates a missing or corrupt cache and a non-Steam release', async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-gog-legacy-'));
  const previousAppData = process.env.APPDATA;
  const previousLocalAppData = process.env.LOCALAPPDATA;
  const realGetJson = request.getJson;

  try {
    process.env.APPDATA = temp;
    process.env.LOCALAPPDATA = temp;
    gog.setUserDataPath(temp);

    // The first-run cache is optional; callers must simply get no cached schema back.
    assert.equal(await gog.getCachedData({ appID: 'missing', lang: 'english' }), undefined);

    const cacheDir = path.join(temp, 'steam_cache');
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(path.join(cacheDir, 'gog.db'), '{not valid json');
    assert.equal(await gog.getCachedData({ appID: 'broken', lang: 'english' }), undefined);

    const root = path.join(temp, 'NemirtingasGalaxyEmu', 'account');
    fs.mkdirSync(path.join(root, 'only-gog'), { recursive: true });
    fs.mkdirSync(path.join(root, 'with-steam'), { recursive: true });
    request.getJson = async (url) => {
      if (String(url).endsWith('/only-gog')) return { game: { releases: [{ platform_id: 'gog', external_id: 'only-gog' }] } };
      if (String(url).endsWith('/with-steam')) return { game: { releases: [{ platform_id: 'steam', external_id: '4242' }] } };
      throw new Error(`unexpected URL: ${url}`);
    };

    const games = await gog.scan();
    assert.deepEqual(games.map((game) => game.appid), ['4242']);
    assert.equal(path.normalize(games[0].data.path), path.normalize(path.join(root, 'with-steam')));
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(cacheDir, 'gog.db'), 'utf8')), [{ gogid: 'with-steam', steamid: '4242' }]);
  } finally {
    request.getJson = realGetJson;
    process.env.APPDATA = previousAppData;
    if (previousLocalAppData === undefined) delete process.env.LOCALAPPDATA;
    else process.env.LOCALAPPDATA = previousLocalAppData;
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('UniverseLAN saves under LOCALAPPDATA are listed by their Steam appid, except installs AW repaired', async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-gog-universelan-'));
  const previous = { APPDATA: process.env.APPDATA, LOCALAPPDATA: process.env.LOCALAPPDATA };
  const realGetJson = request.getJson;

  try {
    process.env.APPDATA = path.join(temp, 'Roaming');
    process.env.LOCALAPPDATA = path.join(temp, 'Local');
    gog.setUserDataPath(temp);
    for (const id of ['1207658924', '1423049311']) fs.mkdirSync(path.join(temp, 'Local', 'UniverseLAN', id, 'UniverseLANData'), { recursive: true });
    request.getJson = async (url) => ({ game: { releases: [{ platform_id: 'steam', external_id: String(url).endsWith('/1207658924') ? '70' : '1091500' }] } });

    const games = await gog.scan({ skipUniverseLanIds: ['1423049311'] });
    assert.deepEqual(
      games.map((game) => [game.appid, game.source, path.normalize(game.data.path)]),
      [['70', 'UniverseLAN', path.normalize(path.join(temp, 'Local', 'UniverseLAN', '1207658924', 'UniverseLANData'))]]
    );
  } finally {
    request.getJson = realGetJson;
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
