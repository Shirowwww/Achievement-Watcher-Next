'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const builder = require('../../tools/psn/build-index.js');
const exophase = require('../../app/parser/exophase.js');

const list = (id, name, platform, platinum = 1, service = 'trophy') => ({ npCommunicationId: id, npServiceName: service, trophyTitleName: name, trophyTitlePlatform: platform, definedTrophies: { bronze: 10, silver: 2, gold: 1, platinum } });

test('the index keeps lists with a platinum by name, newest console first, and leaves Vita-only lists out', () => {
  const index = builder.buildIndex([
    list('NPWR00002_00', 'Sniper Story™ Trophies', 'PS3'),
    list('NPWR00001_00', 'Sniper Story', 'PS4'),
    list('NPWR00003_00', 'Sniper Story', 'PSVITA'),
    list('NPWR00004_00', 'Small Game', 'PS4', 0),
    list('NPWR00005_00', 'Cross Buy', 'PS3,PSVITA'),
    list('NPWR00006_00', 'New Game', 'PS5', 1, 'trophy2'),
    list('bad', 'Bad', 'PS4'),
    null,
  ]);
  assert.equal(index.version, builder.INDEX_VERSION);
  assert.deepEqual(index.names, {
    'cross buy': [{ id: 'NPWR00005_00', platform: 'PS3', service: 'trophy' }],
    'new game': [{ id: 'NPWR00006_00', platform: 'PS5', service: 'trophy2' }],
    'sniper story': [
      { id: 'NPWR00001_00', platform: 'PS4', service: 'trophy' },
      { id: 'NPWR00002_00', platform: 'PS3', service: 'trophy' },
    ],
  });
});

test('the shipped index has the shape the app reads', () => {
  const index = JSON.parse(fs.readFileSync(builder.OUT, 'utf8'));
  assert.equal(index.version, builder.INDEX_VERSION);
  const entries = Object.values(index.names).flat();
  assert.ok(entries.length > 5000, `only ${entries.length} lists`);
  assert.ok(entries.every((entry) => /^NPWR\d{5}_\d{2}$/.test(entry.id) && ['PS3', 'PS4', 'PS5'].includes(entry.platform) && ['trophy', 'trophy2'].includes(entry.service)));
  assert.ok(fs.statSync(builder.OUT).size < 1024 * 1024, 'the index stays small');
  assert.equal(path.basename(builder.OUT), 'psn-index.json');
});

test('the Exophase PlayStation search returns trophy pages with their console', async () => {
  const asked = [];
  const requestImpl = async (url) => {
    asked.push(url);
    return {
      body: JSON.stringify({
        games: {
          list: [
            { title: 'ELDEN RING', endpoint_awards: 'https://www.exophase.com/game/elden-ring-psn/trophies/', platforms: [{ slug: 'ps5' }] },
            { title: 'ELDEN RING', endpoint_awards: 'https://www.exophase.com/game/elden-ring-psn-2/trophies/', platforms: [{ slug: 'ps4' }] },
            { title: 'Vita', endpoint_awards: 'https://www.exophase.com/game/vita-psn/trophies/', platforms: [{ slug: 'vita' }] },
            { title: 'Elsewhere', endpoint_awards: 'https://evil.example/game/x/trophies/', platforms: [{ slug: 'ps5' }] },
          ],
        },
      }),
    };
  };
  const hits = await exophase.searchExophaseTrophyLists('Elden Ring', { requestImpl });
  assert.equal(asked[0], 'https://api.exophase.com/public/archive/platform/psn?q=Elden%20Ring');
  assert.deepEqual(hits, [
    { title: 'ELDEN RING', slug: 'elden-ring-psn', platform: 'ps5', baseUrl: 'https://www.exophase.com/game/elden-ring-psn/trophies/' },
    { title: 'ELDEN RING', slug: 'elden-ring-psn-2', platform: 'ps4', baseUrl: 'https://www.exophase.com/game/elden-ring-psn-2/trophies/' },
  ]);
});
