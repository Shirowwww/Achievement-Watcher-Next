'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { binaryMatchesProcess, buildBinaryIndex, buildSeededSessions, describeActiveGames } = require('../playtime/seed.js');

const gameIndex = [
  { appid: '100', name: 'Alpha', binary: 'alpha.exe', icon: 'a', source: 'GBE Fork' },
  { appid: '200', name: 'Unreal Game', binary: 'unrealgame.exe', icon: 'u', source: 'Xbox PC' },
  { appid: '300', name: 'Beta', binary: 'beta.exe', icon: 'b' },
];

test('binary match tolerates UE shipping variant', () => {
  assert.equal(binaryMatchesProcess('unrealgame.exe', 'unrealgame-Win64-Shipping.exe'), true);
  assert.equal(binaryMatchesProcess('alpha.exe', 'alpha.exe'), true);
  assert.equal(binaryMatchesProcess('alpha.exe', 'beta.exe'), false);
  assert.equal(binaryMatchesProcess('', 'alpha.exe'), false);
});

test('binary index treats an unavailable game index as an empty index', () => {
  assert.deepEqual([...buildBinaryIndex(null)], []);
});

test('seeds one session per running known game and groups multi-process games', () => {
  const now = 1000;
  const sessions = buildSeededSessions({
    gameIndex,
    processes: [
      { pid: 11, name: 'alpha.exe' },
      { pid: 12, name: 'alpha.exe' },
      { pid: 21, name: 'unrealgame-Win64-Shipping.exe' },
      { pid: 99, name: 'unknown.exe' },
    ],
    now,
    createTimer: () => ({ fake: true }),
  });
  assert.equal(sessions.length, 2);
  const alpha = sessions.find((s) => s.appid === '100');
  assert.deepEqual([...alpha.pids], [11, 12]);
  assert.equal(alpha.seeded, true);
  assert.equal(alpha.timer.fake, true);
  assert.equal(alpha.source, 'GBE Fork');
  const unreal = sessions.find((s) => s.appid === '200');
  assert.deepEqual([...unreal.pids], [21]);
  assert.equal(unreal.source, 'Xbox PC');
  assert.equal(sessions.find((s) => s.appid === '300'), undefined);
});

test('seeds task-list snapshots that expose process instead of name', () => {
  const artworkGame = {
    ...gameIndex[0],
    steamappid: '123',
    iconUrl: 'https://cdn2.steamgriddb.com/icon/custom.png',
    headerUrl: 'https://cdn2.steamgriddb.com/hero/custom.jpg',
    portraitUrl: 'https://cdn2.steamgriddb.com/grid/custom.jpg',
  };
  const sessions = buildSeededSessions({
    gameIndex: [artworkGame],
    processes: [{ pid: 11, process: 'alpha.exe' }],
    createTimer: () => ({ fake: true }),
  });

  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].appid, '100');
  assert.deepEqual([...sessions[0].pids], [11]);
  assert.equal(sessions[0].steamappid, '123');
  assert.equal(sessions[0].iconUrl, artworkGame.iconUrl);
  assert.equal(sessions[0].headerUrl, artworkGame.headerUrl);
  assert.equal(sessions[0].portraitUrl, artworkGame.portraitUrl);
});

test('ambiguous binary matches are skipped (delegated to the live watcher)', () => {
  const sessions = buildSeededSessions({
    gameIndex: [
      { appid: '1', binary: 'game.exe' },
      { appid: '2', binary: 'game.exe' },
    ],
    processes: [{ pid: 1, name: 'game.exe' }],
  });
  assert.equal(sessions.length, 0);
});

test('Unreal aliases preserve ambiguity and binaries without .exe stay uniquely matchable', () => {
  const sessions = buildSeededSessions({
    gameIndex: [
      { appid: '1', binary: 'game.exe' },
      { appid: '2', binary: 'game-Win64-Shipping.exe' },
      { appid: '3', binary: 'portable-game' },
    ],
    processes: [
      { pid: 1, name: 'game-Win64-Shipping.exe' },
      { pid: 2, name: 'portable-game' },
    ],
  });

  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].appid, '3');
});

test('process-trail activity projects sessions without replaying private timer or PID state', () => {
  const timer = { started: true };
  const sessions = [
    {
      appid: '100',
      name: 'Older game',
      source: 'Steam',
      pids: new Set([11]),
      timer,
      seeded: true,
    },
    {
      appid: '200',
      name: 'Xbox game',
      source: 'Xbox PC',
      pids: new Set([22]),
      timer,
      seeded: true,
    },
    {
      appid: '300',
      name: 'Most recent game',
      source: 'Steam',
      pids: new Set([33]),
      timer,
      seeded: true,
    },
  ];

  const activity = describeActiveGames(sessions);

  assert.deepEqual(activity.games.map((game) => game.appid), ['100', '200', '300']);
  assert.equal(activity.overlayGame.appid, '300', 'matches the last live launch as overlay target');
  assert.equal(activity.xboxGame.appid, '200', 'starts the single Xbox polling slot for the active Xbox title');
  assert.equal('pids' in activity.games[0], false);
  assert.equal('timer' in activity.games[0], false);
  assert.notEqual(activity.games[0], sessions[0]);

  activity.games[0].name = 'mutated projection';
  assert.equal(sessions[0].name, 'Older game', 'the monitor session remains private');
});

test('process-trail activity has no overlay or Xbox target when no session is active', () => {
  const activity = describeActiveGames(null);
  assert.deepEqual(activity.games, []);
  assert.equal(activity.overlayGame, null);
  assert.equal(activity.xboxGame, null);
});

test('a shared executable name is settled by the install folder of the process', () => {
  const { pickGameForProcess } = require('../playtime/seed.js');
  const lostCrown = { appid: '291710', name: 'The Lost Crown', binary: 'TheLostCrown.exe' };
  const princeOfPersia = {
    appid: '2751000',
    name: 'Prince of Persia The Lost Crown',
    binary: 'TheLostCrown.exe',
    exePath: 'D:\\Games\\PoP\\TheLostCrown.exe',
  };
  const exePathFor = (appid) => (appid === '291710' ? 'C:\\Games\\The Lost Crown\\TheLostCrown.exe' : '');

  assert.equal(pickGameForProcess([lostCrown, princeOfPersia], 'd:/games/pop/TheLostCrown.exe', exePathFor), princeOfPersia, 'the exact path wins');
  assert.equal(
    pickGameForProcess([lostCrown, princeOfPersia], 'C:\\Games\\The Lost Crown\\TheLostCrown.exe', exePathFor),
    lostCrown,
    'the configured launch exe counts too'
  );
  assert.equal(
    pickGameForProcess([lostCrown, princeOfPersia], 'D:\\Games\\PoP\\bin\\TheLostCrown.exe', exePathFor),
    princeOfPersia,
    'a process below the install folder still belongs to it'
  );
  assert.equal(pickGameForProcess([lostCrown, princeOfPersia], 'E:\\Elsewhere\\TheLostCrown.exe', exePathFor), null, 'a path nobody owns settles nothing');
  assert.equal(pickGameForProcess([lostCrown, princeOfPersia], '', exePathFor), null, 'no path, no answer');
  assert.equal(pickGameForProcess([lostCrown], '', exePathFor), lostCrown, 'a single match needs no path');
});

test('an already-running game behind a shared executable name is seeded once its path is known', () => {
  const sessions = buildSeededSessions({
    gameIndex: [
      { appid: '291710', name: 'The Lost Crown', binary: 'TheLostCrown.exe' },
      { appid: '2751000', name: 'Prince of Persia The Lost Crown', binary: 'TheLostCrown.exe', exePath: 'D:\\Games\\PoP\\TheLostCrown.exe' },
    ],
    processes: [{ pid: 7, process: 'TheLostCrown.exe' }],
    resolvePath: (pid) => (pid === 7 ? 'D:\\Games\\PoP\\TheLostCrown.exe' : ''),
    exePathFor: () => '',
  });
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].appid, '2751000');
  assert.equal(sessions[0].gameDir, require('node:path').dirname('D:\\Games\\PoP\\TheLostCrown.exe'));
});

test('the library index outranks the old downloaded catalogue on a shared executable name', () => {
  const { mergeGameIndexes } = require('../playtime/seed.js');
  const catalogue = [
    { appid: 291710, name: 'The Lost Crown', binary: 'TheLostCrown.exe', icon: '7f84' },
    { appid: 480, name: 'Spacewar', binary: 'spacewar.exe' },
    { appid: 2751000, name: 'stale copy', binary: 'other.exe' },
  ];
  const user = [{ appid: '2751000', name: 'Prince of Persia The Lost Crown', binary: 'TheLostCrown.exe', source: 'Goldberg Uplay' }];

  const { list, yielded } = mergeGameIndexes(catalogue, user);
  assert.deepEqual(yielded, [{ appid: '291710', name: 'The Lost Crown', binary: 'TheLostCrown.exe' }]);
  assert.deepEqual(
    list.map((game) => [game.appid, game.binary]),
    [
      ['291710', ''],
      ['480', 'spacewar.exe'],
      ['2751000', 'TheLostCrown.exe'],
    ],
    'appids are strings, the catalogue claim is cleared and the numeric duplicate is dropped'
  );
  const index = buildBinaryIndex(list);
  assert.deepEqual(index.get('thelostcrown.exe').map((game) => game.appid), ['2751000']);
  assert.deepEqual(mergeGameIndexes(null, undefined), { list: [], yielded: [] });
});
