'use strict';

/*
  More PS4 ports, each laid out as its own source writes it: DriveClub Recomp, Shadow of the
  Colossus, inFAMOUS First Light, Fist of the North Star, GNSB's standalone UFC 3, and the
  PROTOTYPE bundle's game told from its own log.
*/
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-ps4ports-'));
const saved = { APPDATA: process.env.APPDATA, LOCALAPPDATA: process.env.LOCALAPPDATA };
const appData = path.join(temp, 'AppData', 'Roaming');
const localAppData = path.join(temp, 'AppData', 'Local');
process.env.APPDATA = appData;
process.env.LOCALAPPDATA = localAppData;

const ps4Recomp = require(path.join(__dirname, '..', '..', 'app', 'parser', 'ps4Recomp.js'));
const logs = require(path.join(__dirname, '..', '..', 'app', 'parser', 'ps4RecompLogs.js'));
const fixture = require(path.join(__dirname, '..', 'helpers', 'ps4Recomp.js'));

ps4Recomp.setDataRoot(path.join(temp, 'userData'));
const { identifyPort } = ps4Recomp._internal;

test.after(() => {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  fs.rmSync(temp, { recursive: true, force: true });
});

const dir = (...parts) => path.join(temp, ...parts);
const unlocks = (record) => ps4Recomp.getAchievements(record.data).map((u) => [u.id, u.earned_time]);
const dump = (name, titleId, npcommid, title) => fixture.makeGameDump(dir(name, 'dumps', titleId), { titleId, title, sets: [{ slot: 0, npcommid, title }] });

// launcher/driveclub_launcher.cpp (LoadSettings, StartGame) and src/runtime_services.c of OverkillLabs3/driveclub-recomp.
test('DriveClub Recomp: launcher.ini names the base game, the dated game logs carry the unlocks', () => {
  const root = dir('dc', 'DriveClub');
  const base = dump('dc', 'CUSA00093', 'NPWR05523_00', 'DRIVECLUB');
  const update = fixture.makeGameDump(dir('dc', 'dumps', 'CUSA00093-patch'), { titleId: 'CUSA00093', title: 'DRIVECLUB', sets: [] });
  fixture.write(path.join(root, 'DriveClub.exe'), 'MZ');
  fixture.write(path.join(root, 'trophy.key'), fixture.TEST_KEY);
  fixture.write(path.join(root, 'launcher.ini'), `update=${update}\r\nbase=${base}\r\nfps=0\r\nname=Player\r\n`);
  fixture.write(path.join(root, 'data', 'user', 'patches_enabled.txt'), '');
  fixture.write(path.join(root, 'logs', 'launcher.log'), 'Runtime: trophy 1 unlocked\n');
  const first = fixture.write(path.join(root, 'logs', 'driveclub_20261021_101010.log'), 'boot\nRuntime: trophy 7 unlocked\n');

  assert.equal(identifyPort(root).port, 'native');
  const [record, ...others] = ps4Recomp.scan(root);
  assert.equal(others.length, 0);
  assert.equal(record.appid, 'ps4recomp-NPWR05523_00');
  assert.equal(record.data.dumpDir, base, 'the base game holds the trophy list, not the update');
  assert.deepEqual(unlocks(record), [['7', 0]], "the launcher's own log is no game log");
  fs.rmSync(first);
  fixture.write(path.join(root, 'logs', 'driveclub_20261022_101010.log'), 'Runtime: trophy 8 unlocked\n');
  assert.deepEqual(unlocks(record), [['7', 0], ['8', 0]], 'a log the launcher pruned keeps its unlocks');
});

// sotc.py and launcher/sotc_launcher_win.py (open_session_log, CONFIG_FILE) of AjncSystem/ShadowOfTheColossus-PC.
test('Shadow of the Colossus: user/launcher_settings.json names the game, rotated last_run logs are read and kept', () => {
  const root = dir('sotc', 'SotC-PC');
  const game = dump('sotc', 'CUSA08809', 'NPWR13780_00', 'Shadow of the Colossus');
  fixture.write(path.join(root, 'SotC.exe'), 'MZ');
  fixture.write(path.join(root, 'sotc.py'), "PORT = Path(__file__).resolve().parent\nout = PORT / 'out'\n");
  fixture.write(path.join(root, 'bin', 'bb-probe.exe'), 'MZ');
  fixture.write(path.join(root, 'trophy.key'), fixture.TEST_KEY);
  fixture.write(path.join(root, 'user', 'launcher_settings.json'), JSON.stringify({ game_dir: game, user_dir: '' }));
  fixture.write(path.join(root, 'user', 'last_run.2.log'), 'Runtime: trophy 3 unlocked\n');
  const current = fixture.write(path.join(root, 'user', 'last_run.log'), 'Runtime: trophy 5 unlocked\n');

  assert.equal(identifyPort(root).port, 'native', 'found before its first start, from bin/ and the launcher setting');
  const [record] = ps4Recomp.scan(root);
  assert.equal(record.data.dumpDir, game);
  assert.deepEqual(unlocks(record).sort(), [['3', 0], ['5', 0]]);
  for (const name of ['last_run.2.log', 'last_run.log']) fs.rmSync(path.join(root, 'user', name));
  fixture.write(current, 'a new session, nothing unlocked yet\n');
  assert.deepEqual(unlocks(record).sort(), [['3', 0], ['5', 0]], 'what a rewritten session log held is kept');
});

// sotc_launcher_win.py user_dir(): a folder picked inside savedata is taken back up to the data folder.
test('Shadow of the Colossus: a user_dir moved by the launcher is where its logs are read', () => {
  const root = dir('sotc-moved', 'SotC-PC');
  const game = dump('sotc-moved', 'CUSA08809', 'NPWR13780_01', 'Shadow of the Colossus');
  const moved = dir('sotc-moved', 'Saves');
  fixture.write(path.join(root, 'bin', 'bb-probe.exe'), 'MZ');
  fixture.write(path.join(root, 'trophy.key'), fixture.TEST_KEY);
  fixture.write(path.join(root, 'user', 'launcher_settings.json'), JSON.stringify({ game_dir: game, user_dir: path.join(moved, 'savedata') }));
  fixture.write(path.join(moved, 'savedata', '1', 'CUSA08809', 'data.bin'), 'save');
  fixture.write(path.join(moved, 'last_run.log'), 'Runtime: trophy 9 unlocked\n');

  const [record] = ps4Recomp.scan(root);
  assert.equal(record.data.userDir, moved);
  assert.deepEqual(unlocks(record), [['9', 0]]);
});

// vw_launcher.py and run.py (RunLog) of hachi23/unicorn_overlord_pc; its runtime_online.c prints the unlocks.
test('Unicorn Overlord: data/launcher.json names the installed game, data/logs the unlocks', () => {
  const root = dir('uo', 'Unicorn Overlord');
  const data = path.join(root, 'data');
  fixture.write(path.join(root, 'Unicorn Overlord.exe'), 'MZ');
  fixture.write(path.join(root, 'trophy.key'), fixture.TEST_KEY);
  const game = fixture.makeGameDump(path.join(data, 'game'), { titleId: 'CUSA44250', title: 'Unicorn Overlord', sets: [{ slot: 0, npcommid: 'NPWR38160_00', title: 'Unicorn Overlord' }] });
  fixture.write(path.join(data, 'launcher.json'), JSON.stringify({ game_dir: game, source_dir: game }));
  fixture.write(path.join(data, 'logs', 'run-20261021-101010-123456-0a1b2c3d.log'), '[    1.000] Runtime: trophy 3 unlocked\n');

  const [record, ...others] = ps4Recomp.scan(root);
  assert.equal(others.length, 0);
  assert.equal(record.appid, 'ps4recomp-NPWR38160_00');
  assert.deepEqual(unlocks(record), [['3', 0]]);
});

/*
  fl_launcher/settings.py data_dir() of VantageEX/infamous-first-light-pc: a frozen launcher that
  cannot write beside itself (Program Files) keeps its data in %LOCALAPPDATA%\inFAMOUS First Light PC.
*/
test('inFAMOUS First Light under Program Files: the data folder its launcher names under LOCALAPPDATA', () => {
  const { buildLauncher } = require(path.join(__dirname, '..', 'helpers', 'pyinstallerArchive.js'));
  const root = dir('fl-pf', 'Program Files', 'inFAMOUS First Light PC');
  const data = path.join(localAppData, 'inFAMOUS First Light PC');
  const game = dump('fl-pf', 'CUSA00897', 'NPWR06985_00', 'inFAMOUS First Light');
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(root, 'inFAMOUS First Light.exe'), buildLauncher({ script: ['fl_launcher.settings', 'main'], modules: { 'fl_launcher.settings': ['FL_DATA_DIR', 'data', 'LOCALAPPDATA', 'inFAMOUS First Light PC', 'launcher.json'] } }));
  fixture.write(path.join(root, 'port', 'run.py'), "game = env['TLG_GAME_DIR']\ncmd = [probe, 'boot-linked.bin', '--app0', game]\n");
  fixture.write(path.join(data, 'launcher.json'), JSON.stringify({ game_dir: game }));
  fixture.write(path.join(data, 'trophy.key'), fixture.TEST_KEY);
  fixture.write(path.join(data, 'logs', 'run-20261021-101010.log'), 'Runtime: trophy 2 unlocked\n');

  const records = ps4Recomp.scan(root);
  assert.deepEqual(records.map((r) => [r.appid, r.data.installRoot]), [['ps4recomp-NPWR06985_00', data]]);
  assert.deepEqual(unlocks(records[0]), [['2', 0]]);
});

// launcher/fl_launcher/settings.py (data_dir) and runner.py of VantageEX/infamous-first-light-pc.
test('inFAMOUS First Light: data/launcher.json names the game, data/logs/run-<date>.log the unlocks', () => {
  const root = dir('fl', 'inFAMOUS First Light PC');
  const game = dump('fl', 'CUSA00897', 'NPWR06985_00', 'inFAMOUS First Light');
  fixture.write(path.join(root, 'inFAMOUS First Light PC.exe'), 'MZ');
  fixture.write(path.join(root, 'trophy.key'), fixture.TEST_KEY);
  fixture.write(path.join(root, 'data', 'launcher.json'), JSON.stringify({ game_dir: game, game_language: 'auto' }));
  fixture.write(path.join(root, 'data', 'logs', 'run-20261021-101010.log'), 'Runtime: trophy 2 unlocked\n');

  const [record] = ps4Recomp.scan(root);
  assert.equal(record.appid, 'ps4recomp-NPWR06985_00');
  assert.deepEqual(unlocks(record), [['2', 0]]);
});

// launcher/pgg_game.py of ItalianKuze/port-ga-gotoku: everything but the program is in a sibling PortGaGotoku-data.
test('Fist of the North Star: its data folder, added with the port beside it, is the port', () => {
  const data = dir('pgg', 'PortGaGotoku-data');
  const game = dump('pgg', 'CUSA12781', 'NPWR15600_00', 'Fist of the North Star: Lost Paradise');
  fixture.write(path.join(dir('pgg', 'PortGaGotoku'), 'PortGaGotoku.exe'), 'MZ');
  fixture.write(path.join(data, 'trophy.key'), fixture.TEST_KEY);
  fixture.write(path.join(data, 'launcher.json'), JSON.stringify({ game_dir: game }));
  fixture.write(path.join(data, 'out', 'boot-linked.bin'), 'linked');
  fixture.write(path.join(data, 'user', 'savedata', '1', 'CUSA12776', 'sce_sdmemory'), 'save');
  fixture.write(path.join(data, 'logs', 'hokuto-20261021-101010.log'), 'Runtime: trophy 12 unlocked\n');

  const [record, ...others] = ps4Recomp.scan(dir('pgg'));
  assert.equal(others.length, 0);
  assert.equal(record.data.installRoot, data);
  assert.deepEqual(unlocks(record), [['12', 0]]);
});

// packaging/windows/package.sh: PortGaGotoku.exe (PyInstaller), bin/ and scripts/; the data folder name is a literal of pgg_game.py.
test('Fist of the North Star: the program folder added alone finds the data folder beside it', () => {
  const { buildLauncher } = require(path.join(__dirname, '..', 'helpers', 'pyinstallerArchive.js'));
  const program = dir('pgg-alone', 'PortGaGotoku');
  const data = dir('pgg-alone', 'PortGaGotoku-data');
  const game = dump('pgg-alone', 'CUSA12781', 'NPWR15600_00', 'Fist of the North Star: Lost Paradise');
  fs.mkdirSync(program, { recursive: true });
  fs.writeFileSync(path.join(program, 'PortGaGotoku.exe'), buildLauncher({ script: ['pgg_game', 'main'], modules: { pgg_game: ['BB_DATA_DIR', 'PortGaGotoku-data', 'launcher.json'] } }));
  fixture.write(path.join(program, 'bin', 'bb-probe.exe'), 'MZ');
  fixture.write(path.join(program, 'scripts', 'prepare.py'), '');
  fixture.write(path.join(data, 'trophy.key'), fixture.TEST_KEY);
  fixture.write(path.join(data, 'launcher.json'), JSON.stringify({ game_dir: game }));
  fixture.write(path.join(data, 'out', 'boot-linked.bin'), 'linked');
  fixture.write(path.join(data, 'logs', 'hokuto-20261021-101010.log'), 'Runtime: trophy 12 unlocked\n');

  const records = ps4Recomp.scan(program);
  assert.deepEqual(records.map((r) => r.data.installRoot), [data]);
  assert.deepEqual(unlocks(records[0]), [['12', 0]]);
});

/*
  scripts/package-windows.sh, packaging/windows/sacredfire_launcher.c, packaging/linux/ufc3.sh and
  src/runtime_trophy.c of GNSB/UFC-3-PS4-PORT-LINUX-WINDOWS: the data folder is <LOCALAPPDATA>\UFC3Native
  on Windows, ~/.local/share/UFC3Native on Linux, or the install itself with BB_DATA_DIR=.
*/
function sacredfireData(data, game, settingsName) {
  const settings = settingsName === 'sacredfire.ini' ? `game=${game}\nlog_dir=\n` : JSON.stringify({ game });
  fixture.write(path.join(data, settingsName), settings);
  fixture.write(path.join(data, 'user', 'trophies.json'), JSON.stringify({ version: 1, unlocked: [{ id: 4, date: '2026-10-21T10:10:10Z', unix: 1792577410 }] }));
  fixture.write(path.join(data, 'logs', '20261021-101010.log'), 'Runtime: trophy 6 unlocked (saved to x)\n');
}

test("GNSB's standalone UFC 3: <name>.exe beside bin/sacredfire-game.exe reads <LOCALAPPDATA>/<name>Native", () => {
  const root = dir('gnsb', 'UFC3Native');
  const game = dump('gnsb', 'CUSA06534', 'NPWR13331_00', 'EA SPORTS UFC 3');
  fixture.write(path.join(root, 'UFC3.exe'), 'MZ');
  fixture.write(path.join(root, 'bin', 'sacredfire-game.exe'), 'MZ');
  fixture.write(path.join(root, 'trophy.key'), fixture.TEST_KEY);
  sacredfireData(path.join(localAppData, 'UFC3Native'), game, 'sacredfire.ini');

  const [record, ...others] = ps4Recomp.scan(dir('gnsb'));
  assert.equal(others.length, 0);
  assert.equal(record.appid, 'ps4recomp-NPWR13331_00');
  assert.equal(record.data.installRoot, root);
  assert.equal(record.data.dataDir, path.join(localAppData, 'UFC3Native'));
  assert.deepEqual(unlocks(record), [['4', 1792577410], ['6', 0]]);
});

test("GNSB's UFC 3 on Linux: the data folder ufc3.sh names, and the data kept beside the launcher", () => {
  const linux = dir('gnsb-linux', 'UFC3Native');
  const game = dump('gnsb-linux', 'CUSA06534', 'NPWR13331_00', 'EA SPORTS UFC 3');
  fixture.write(path.join(linux, 'bin', 'sacredfire'), 'ELF');
  fixture.write(path.join(linux, 'trophy.key'), fixture.TEST_KEY);
  fixture.write(path.join(linux, 'ufc3.sh'), '#!/bin/bash\ndata=${BB_DATA_DIR:-${XDG_DATA_HOME:-$HOME/.local/share}/UFC3Linux}\nmkdir -p "$data"\n');
  sacredfireData(path.join(localAppData, 'UFC3Linux'), game, 'launcher.json');
  const [record] = ps4Recomp.scan(linux);
  assert.equal(record.data.dataDir, path.join(localAppData, 'UFC3Linux'));
  assert.deepEqual(unlocks(record), [['4', 1792577410], ['6', 0]]);

  const portable = dir('gnsb-portable', 'UFC3');
  fixture.write(path.join(portable, 'UFC3.exe'), 'MZ');
  fixture.write(path.join(portable, 'bin', 'sacredfire-game.exe'), 'MZ');
  fixture.write(path.join(portable, 'trophy.key'), fixture.TEST_KEY);
  sacredfireData(portable, dump('gnsb-portable', 'CUSA06534', 'NPWR13331_00', 'EA SPORTS UFC 3'), 'sacredfire.ini');
  assert.equal(ps4Recomp.scan(portable)[0].data.dataDir, portable, 'BB_DATA_DIR=. keeps the data beside the launcher');
});

// sacredfire_launcher.c effective_log_dir(): log_dir= in sacredfire.ini moves every log of a run.
test("GNSB's UFC 3: the log folder sacredfire.ini names is read", () => {
  const root = dir('gnsb-logdir', 'UFC3Native');
  const logFolder = dir('gnsb-logdir', 'shared logs');
  fixture.write(path.join(root, 'UFC3.exe'), 'MZ');
  fixture.write(path.join(root, 'bin', 'sacredfire-game.exe'), 'MZ');
  fixture.write(path.join(root, 'trophy.key'), fixture.TEST_KEY);
  fixture.write(path.join(root, 'sacredfire.ini'), `game=${dump('gnsb-logdir', 'CUSA06534', 'NPWR13331_01', 'EA SPORTS UFC 3')}\nlog_dir=${logFolder}\n`);
  fixture.write(path.join(logFolder, '20261021-101010.log'), 'Runtime: trophy 7 unlocked (saved to x)\n');
  assert.deepEqual(unlocks(ps4Recomp.scan(root)[0]), [['7', 0]]);
});

// run.py (run_script) and scripts/prepare.py of petrishevgeorgii-debug/prototype-pc-slop.
test("PROTOTYPE: the image folder prepare.py prints names a session's game, whatever the launcher says now", () => {
  const lines = [
    'Output: C:\\Games\\prototype-pc\\out\\prototype2_ps4f',
    'Runtime: trophy 4 unlocked',
    'The game started eboot.bin',
    'Output: /home/user/prototype-pc/out',
    'Runtime: trophy 6 unlocked',
  ];
  const file = fixture.write(dir('proto-output', 'last_run.log'), `${lines.join('\n')}\n`);
  const read = logs.readLog(file).lines;
  assert.ok(read.includes(lines[0]) && read.includes(lines[3]), 'the reader keeps both lines');
  const split = logs.parseLastRunLog(read, { port: 'prototype', initial: 'p1' }).map((unlock) => `${unlock.game}:${unlock.id}`);
  assert.deepEqual(split, ['p2:4', 'p1:6']);
  assert.equal(logs.gameFromText('Output: C:\\uncharted\\out', 'uncharted'), '', 'only the PROTOTYPE bundle reads it');
});
