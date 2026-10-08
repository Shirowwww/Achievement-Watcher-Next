'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const { steamInstalledAppids, collectLaunchers, buildReport } = require(path.join(__dirname, '..', '..', 'app', 'util', 'onboardingDetect.js'));

test('Steam installs are counted from appmanifest files, shared redistributables excluded', () => {
  const listing = {
    A: ['appmanifest_10.acf', 'appmanifest_228980.acf', 'libraryfolders.vdf', 'appmanifest_X.acf'],
    B: ['appmanifest_10.acf', 'APPMANIFEST_440.ACF'],
  };
  const ids = steamInstalledAppids({
    libraryAppsDirs: () => ['A', 'B', 'missing'],
    readdir: (dir) => {
      if (!(dir in listing)) throw new Error('ENOENT');
      return listing[dir];
    },
  });
  assert.deepEqual(ids.sort(), ['10', '440']);
});

test('a launcher that throws costs its own row and nothing else', async () => {
  const found = await collectLaunchers({
    steam: () => ['1', '2'],
    gog: async () => {
      throw new Error('database locked');
    },
    epic: () => [{ appid: 'ns:item' }, { appid: 'ns:item' }],
    ubisoft: async () => [{ appid: 7 }, null, {}],
  });
  assert.deepEqual(found, { steam: ['1', '2'], gog: [], epic: ['ns:item'], ubisoft: ['7'] });
});

test('the report counts a game once, however many sources and folders show it', () => {
  const report = buildReport({
    launchers: { steam: ['730', '440'], gog: ['g1'], epic: [], ubisoft: ['u1'] },
    folders: [[{ appid: '730' }, { appid: '570' }], [{ appid: '570' }, { appid: '10' }], []],
  });
  assert.deepEqual(report.launchers, { steam: 2, gog: 1, epic: 0, ubisoft: 1 });
  assert.deepEqual(report.emulators, { games: 3, folders: 2 }, 'an empty folder is not counted as a folder with games');
  assert.equal(report.total, 6, '730 is both installed and saved, and 570 sits in two folders');
});

test('an empty PC reports zero without throwing', () => {
  assert.deepEqual(buildReport(), { launchers: { steam: 0, gog: 0, epic: 0, ubisoft: 0 }, emulators: { games: 0, folders: 0 }, total: 0 });
});

test('mapLimit keeps the order of the items and never exceeds its limit', async () => {
  const { mapLimit } = require(path.join(__dirname, '..', '..', 'app', 'util', 'onboardingDetect.js'));
  let running = 0;
  let peak = 0;
  const results = await mapLimit([30, 5, 20, 1, 10], 2, async (ms) => {
    running += 1;
    peak = Math.max(peak, running);
    await new Promise((resolve) => setTimeout(resolve, ms));
    running -= 1;
    return ms * 2;
  });
  assert.deepEqual(results, [60, 10, 40, 2, 20]);
  assert.equal(peak, 2);
  assert.deepEqual(await mapLimit([], 4, async () => 1), []);
});

test('mapLimit stops taking new items once told to', async () => {
  const { mapLimit } = require(path.join(__dirname, '..', '..', 'app', 'util', 'onboardingDetect.js'));
  let started = 0;
  await mapLimit([1, 2, 3, 4, 5, 6], 1, async () => (started += 1), () => started >= 2);
  assert.equal(started, 2);
});
