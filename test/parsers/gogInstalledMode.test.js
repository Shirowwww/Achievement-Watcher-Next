'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const gogOfficial = require('../../app/parser/gogOfficial.js');

// Galaxy keeps a game's gameplay.db after it is uninstalled, so the scan lists every game played
// through Galaxy. Under "installed" only the ones whose install folder is on disk stay.
test('under "installed", only GOG games with an install folder on disk stay', () => {
  const records = [
    { appid: '1', data: { type: 'gogOfficial', gameDir: 'D:\\GOG Games\\Present' } },
    { appid: '2', data: { type: 'gogOfficial', gameDir: null } },
    { appid: '3', data: { type: 'gogOfficial' } },
  ];

  assert.deepEqual(
    gogOfficial.keepInstalled(records).map((r) => r.appid),
    ['1']
  );
});
