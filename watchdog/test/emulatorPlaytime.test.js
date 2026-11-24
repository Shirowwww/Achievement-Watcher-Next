'use strict';

/*
  Play time for console games (Discord help forum, 24/11/2026): Xenia, RPCS3 and shadPS4 run every
  game inside one process, so the game is read from the emulator's own log. The log lines follow
  each emulator's source: Xenia's UserModule::Dump and Emulator::LaunchPath, shadPS4's
  Emulator::Run, RPCS3's System.cpp.
*/

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const current = require('../console/emulatorCurrent.js');
const { createEmulatorSessions } = require('../playtime/emulatorSessions.js');

function tmp(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-emu-playtime-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function write(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
  return file;
}

const xeniaBoot = (verb, titleId, name) =>
  [
    `i> 00001FAC ${verb} module game:\\default.xex`,
    'i> 00001FAC Module \\Device\\Cdrom0\\default.xex:',
    '    XEX_HEADER_EXECUTION_INFO:',
    '         Media ID: 0EBB7675',
    `         Title ID: ${titleId}`,
    `      Savegame ID: ${titleId}`,
    name ? `i> 00001FAC Title name: ${name}` : '',
    'i> 00001FAC KernelState: Launching module...',
  ].join('\n');

test('Xenia: the last booted title id, upstream or canary wording, and its name when logged', () => {
  assert.equal(current.xeniaFromLog('i> 00000F10 Xenia started\n'), null, 'the menu alone boots nothing');
  assert.deepEqual(current.xeniaFromLog(xeniaBoot('Launching', '5345881E', '')), { titleId: '5345881E', name: '' });
  const twice = `${xeniaBoot('Loading', '555307E5', 'Naruto: Rise of a Ninja')}\n${xeniaBoot('Loading', '55530825', 'Naruto: The Broken Bond')}`;
  assert.deepEqual(current.xeniaFromLog(twice), { titleId: '55530825', name: 'Naruto: The Broken Bond' });
});

test('shadPS4: the last "Game id ... Title" line', () => {
  const log = '[Loader] <Info> (main) emulator.cpp:538 Run: Game id: CUSA00062 Title: inFAMOUS First Light\n';
  assert.deepEqual(current.shadps4FromLog(log), { serial: 'CUSA00062', title: 'inFAMOUS First Light' });
  assert.equal(current.shadps4FromLog('Starting shadps4 emulator v0.12.0\n'), null);
});

test('Xenia game: its xenia.log beside the exe, matched to a title AW Next reads', (t) => {
  const dir = tmp(t);
  const exePath = write(path.join(dir, 'xenia_canary.exe'), '');
  write(path.join(dir, 'xenia.log'), xeniaBoot('Loading', '555307E5', 'Naruto: Rise of a Ninja'));
  const targets = () => [{ titleId: '555307E5' }];
  assert.deepEqual(current.xeniaGame({ exePath, targets }), { appid: '555307E5', name: 'Naruto: Rise of a Ninja' });
  assert.equal(current.xeniaGame({ exePath, targets: () => [{ titleId: '4D5307E6' }] }), null, 'a title with no achievements read is not tracked');
});

test('shadPS4 game: by serial, else by the one trophy set with the booted title, newest log first', (t) => {
  const dir = tmp(t);
  const exePath = write(path.join(dir, 'shadps4.exe'), '');
  const logDir = path.join(dir, 'user', 'log');
  write(path.join(logDir, 'shad_log.txt'), 'Run: Game id: CUSA99999 Title: Older Game\n');
  const newer = write(path.join(logDir, 'CUSA00062.log'), 'Run: Game id: CUSA00062 Title: inFAMOUS First Light\n');
  const later = new Date(Date.now() + 5000);
  fs.utimesSync(newer, later, later);
  const xmlDir = path.join(dir, 'trophy', 'NPWR06685_00', 'Xml');
  write(path.join(xmlDir, 'TROP.XML'), '<trophyconf><title-name>inFAMOUS&#8482; First Light</title-name></trophyconf>');
  const env = { APPDATA: path.join(dir, 'none') };

  assert.deepEqual(current.shadps4Game({ exePath, env, platform: 'win32', targets: () => [{ appid: 'CUSA00062', xmlDir }] }), { appid: 'CUSA00062', name: 'inFAMOUS First Light' });
  const readTitle = () => 'inFAMOUS First Light';
  assert.deepEqual(current.shadps4Game({ exePath, env, platform: 'win32', readTitle, targets: () => [{ appid: 'NPWR06685_00', xmlDir }] }), { appid: 'NPWR06685_00', name: 'inFAMOUS First Light' });
});

test('RPCS3 game: RPCS3.log beside the exe, matched to the trophy set of the booted title', (t) => {
  const dir = tmp(t);
  const exePath = write(path.join(dir, 'rpcs3.exe'), '');
  write(path.join(dir, 'log', 'RPCS3.log'), '·! 0:00:01.000 SYS: Title: ASURA\'S WRATH\n·! 0:00:01.001 SYS: Serial: BLUS30721\n');
  const trophyDir = path.join(dir, 'dev_hdd0', 'home', '00000001', 'trophy', 'NPWR02376_00');
  write(path.join(trophyDir, 'TROPCONF.SFM'), "<trophyconf><title-name>ASURA'S WRATH</title-name></trophyconf>");
  const game = current.rpcs3Game({ exePath, emulatorDirs: () => [], targets: () => [{ appid: 'NPWR02376_00', trophyDir }], platform: 'win32', env: {} });
  assert.deepEqual(game, { appid: 'NPWR02376_00', name: "ASURA'S WRATH" });
});

// A scripted emulator: what runs and what its log names change from one check to the next.
function harness() {
  const state = { rows: [], game: null, reads: 0 };
  const events = [];
  const emulator = {
    id: 'xenia',
    source: 'Xenia Emulator',
    process: /^xenia_canary\.exe$/i,
    current: () => {
      state.reads += 1;
      return state.game;
    },
  };
  const sessions = createEmulatorSessions({
    listProcesses: async () => state.rows,
    processPath: () => 'C:/Emu/xenia_canary.exe',
    targets: { xenia: () => [] },
    emulatorDirs: () => [],
    emulators: [emulator],
    start: (game) => events.push(['start', game.appid, game.name, game.source]),
    stop: (appid) => events.push(['stop', appid]),
  });
  return { state, events, sessions };
}

test('a session opens when a game boots, holds, moves to the next game and closes on exit', async () => {
  const { state, events, sessions } = harness();
  await sessions.tick();
  assert.equal(state.reads, 0, 'no emulator running: no log is read');

  state.rows = [{ process: 'xenia_canary.exe', pid: 42 }];
  await sessions.tick();
  assert.deepEqual(events, [], 'the emulator menu is not a game');

  state.game = { appid: '555307E5', name: 'Naruto: Rise of a Ninja' };
  await sessions.tick();
  await sessions.tick();
  state.game = { appid: '55530825', name: 'Naruto: The Broken Bond' };
  await sessions.tick();
  state.rows = [];
  await sessions.tick();

  assert.deepEqual(events, [
    ['start', '555307E5', 'Naruto: Rise of a Ninja', 'Xenia Emulator'],
    ['stop', '555307E5'],
    ['start', '55530825', 'Naruto: The Broken Bond', 'Xenia Emulator'],
    ['stop', '55530825'],
  ]);
});

test('a read that cannot tell keeps the running session; only another game or a stop ends it', async () => {
  const { state, events, sessions } = harness();
  state.rows = [{ process: 'xenia_canary.exe', pid: 42 }];
  state.game = { appid: '555307E5', name: 'Naruto' };
  await sessions.tick();
  state.game = undefined; // the boot line scrolled out of the log tail, or the titles failed to load
  await sessions.tick();
  assert.deepEqual(events, [['start', '555307E5', 'Naruto', 'Xenia Emulator']], 'still one session');
  state.game = null; // RPCS3 logged "Stopping emulator"
  await sessions.tick();
  assert.deepEqual(events.at(-1), ['stop', '555307E5']);
});

test('titles that fail to load are not remembered as none, and keep the session', async () => {
  let calls = 0;
  let clock = 0;
  const events = [];
  const sessions = createEmulatorSessions({
    listProcesses: async () => [{ process: 'xenia_canary.exe', pid: 7 }],
    processPath: () => '',
    targets: {
      xenia: () => {
        calls += 1;
        if (calls === 2) throw new Error('disk busy');
        return [{ titleId: '555307E5' }];
      },
    },
    emulatorDirs: () => [],
    now: () => clock,
    emulators: [{ id: 'xenia', source: 'Xenia Emulator', process: /^xenia_canary\.exe$/i, current: ({ targets }) => (targets().length ? { appid: '555307E5', name: 'N' } : null) }],
    start: (game) => events.push(['start', game.appid]),
    stop: (appid) => events.push(['stop', appid]),
  });
  for (let i = 0; i < 3; i += 1) {
    clock += 120_000; // past the titles' cache each time
    await sessions.tick();
  }
  assert.deepEqual(events, [['start', '555307E5']], 'the failed read neither closed nor reopened the session');
  assert.equal(calls, 3, 'the failure was not cached');
});

test('a shadPS4 trophy set title is read with its XML entities decoded', (t) => {
  const dir = tmp(t);
  const exePath = write(path.join(dir, 'shadps4.exe'), '');
  write(path.join(dir, 'user', 'log', 'shad_log.txt'), 'Run: Game id: CUSA00001 Title: Ratchet & Clank\n');
  const xmlDir = path.join(dir, 'trophy', 'NPWR10000_00', 'Xml');
  write(path.join(xmlDir, 'TROP.XML'), '<trophyconf><title-name>Ratchet &amp; Clank</title-name></trophyconf>');
  const game = current.shadps4Game({ exePath, env: {}, platform: 'win32', targets: () => [{ appid: 'NPWR10000_00', xmlDir }] });
  assert.deepEqual(game, { appid: 'NPWR10000_00', name: 'Ratchet & Clank' });
});

test('a log that no longer shows the boot cannot tell, it does not mean the game stopped', (t) => {
  const dir = tmp(t);
  const exePath = write(path.join(dir, 'xenia_canary.exe'), '');
  write(path.join(dir, 'xenia.log'), 'i> 00001FAC some later line\n');
  assert.equal(current.xeniaGame({ exePath, targets: () => [{ titleId: '555307E5' }] }), undefined);
});

test('an unreadable log or process list never throws out of the check', async () => {
  const { state, events, sessions } = harness();
  state.rows = [{ process: 'xenia_canary.exe', pid: 42 }];
  state.game = { appid: '555307E5', name: '' };
  await sessions.tick();
  assert.deepEqual(events, [['start', '555307E5', '555307E5', 'Xenia Emulator']], 'no name logged: the id stands in');
});
