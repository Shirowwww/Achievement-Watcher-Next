'use strict';

/*
  PS4 ports without run.py, on synthetic installs laid out as each port's own source describes:
  native launchers (Dragon's Crown Pro, inFAMOUS Second Son), the dated session logs of the
  HayatoG and Killzone launchers, a log declared by a launcher, the PROTOTYPE bundle and the
  PORTHEON package of UFC ports.
*/
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-ps4native-'));
const saved = { APPDATA: process.env.APPDATA, LOCALAPPDATA: process.env.LOCALAPPDATA };
const appData = path.join(temp, 'AppData', 'Roaming');
const localAppData = path.join(temp, 'AppData', 'Local');
process.env.APPDATA = appData;
process.env.LOCALAPPDATA = localAppData;

const ps4Recomp = require(path.join(__dirname, '..', '..', 'app', 'parser', 'ps4Recomp.js'));
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

function flags(ids) {
  const out = Buffer.alloc(16);
  for (const id of ids) out.writeUInt32LE((out.readUInt32LE(Math.floor(id / 32) * 4) | (1 << id % 32)) >>> 0, Math.floor(id / 32) * 4);
  return out;
}

// docs/LAUNCHER.md and docs/TROPHIES.md of saulob/dragons-crown-pro-pc.
test("Dragon's Crown Pro: game/image and game/prepared, progress_user snapshots of every profile", async () => {
  const root = dir('dcp', 'Dragons Crown Pro');
  fixture.write(path.join(root, 'dragons_crown_pro.exe'), 'MZ');
  fixture.write(path.join(root, 'game', 'image', 'CUSA10454-1.01', 'boot.bin'), 'boot');
  fixture.write(path.join(root, 'trophy.key'), fixture.TEST_KEY);
  fixture.makeGameDump(path.join(root, 'game', 'prepared', 'CUSA10454-1.01'), { titleId: 'CUSA10454', title: "Dragon's Crown Pro", sets: [{ slot: 0, npcommid: 'NPWR03852_00', title: "Dragon's Crown Pro" }] });
  const trophyDir = path.join(root, 'user', 'trophy', 'NPWR03852_00');
  fixture.write(path.join(trophyDir, 'progress_user1.txt'), 'DCP-TROPHIES 1\nnpcommid NPWR03852_00\nunlocked 1 1792512100\n');
  fixture.write(path.join(trophyDir, 'progress_user2.txt'), 'DCP-TROPHIES 1\nnpcommid NPWR03852_00\nunlocked 1 1792512000\nunlocked 2 1792512300\n');

  assert.equal(identifyPort(root).port, 'native');
  const [record, ...others] = ps4Recomp.scan(dir('dcp'));
  assert.equal(others.length, 0);
  assert.equal(record.appid, 'ps4recomp-NPWR03852_00');
  assert.equal(record.data.userDir, path.join(root, 'user'));
  assert.deepEqual(unlocks(record), [['1', 1792512000], ['2', 1792512300]], 'two profiles merged, earliest time kept');
  assert.equal((await ps4Recomp.getGameData(record.data)).name, "Dragon's Crown Pro");
});

// pc-port/launcher/launcher.cpp and pc-port/src/trophies.c of Castlesea/infamous-second-son-pc-port.
test('inFAMOUS Second Son: bin + user/launcher.ini, flags in bin/user/trophies named after another region', () => {
  const root = dir('iss', 'inFAMOUS Second Son');
  const dump = fixture.makeGameDump(dir('iss', 'Games', 'CUSA00223'), { titleId: 'CUSA00223', title: 'inFAMOUS Second Son', sets: [{ slot: 0, npcommid: 'NPWR05500_00', title: 'inFAMOUS Second Son' }] });
  fixture.write(path.join(root, 'trophy.key'), fixture.TEST_KEY);
  fixture.write(path.join(root, 'inFAMOUS Second Son Launcher.exe'), 'MZ');
  fixture.write(path.join(root, 'bin', 'iss-probe.exe'), 'MZ');
  fixture.write(path.join(root, 'user', 'launcher.ini'), `display=window\ngame_dir=${dump}\n`);
  fixture.write(path.join(root, 'bin', 'user', 'trophies', 'CUSA00004-user1.bin'), flags([3, 40]));

  const [record] = ps4Recomp.scan(root);
  assert.equal(record.appid, 'ps4recomp-NPWR05500_00');
  assert.equal(record.data.dumpDir, dump);
  assert.deepEqual(unlocks(record), [['3', 0], ['40', 0]], 'a flag file has no dates');
});

test('a folder with runtime folders but no launcher setting naming a game, or only a dump, is not a port', () => {
  const loose = dir('loose', 'Tools');
  fixture.write(path.join(loose, 'bin', 'tool.exe'), 'MZ');
  fixture.write(path.join(loose, 'settings.json'), JSON.stringify({ game_dir: dir('loose', 'nowhere') }));
  assert.equal(identifyPort(loose), null);
  const dumpOnly = fixture.makeGameDump(dir('loose', 'CUSA00900'));
  assert.equal(identifyPort(dumpOnly), null, 'a bare game dump is not a port');
  assert.deepEqual(ps4Recomp.scan(dir('loose')), []);
});

// port/launcher/tlg_run.py of HayatoG/tlg_pc: out/logs/run-<date>.log, %APPDATA%/tlg-launcher/settings.json.
test('The Last Guardian: a native port found by out/boot-linked.bin, unlocks kept from rotated session logs', () => {
  const root = dir('tlg', 'port');
  const dump = fixture.makeGameDump(dir('tlg', 'game', 'CUSA03627'), { titleId: 'CUSA03627', title: 'The Last Guardian', sets: [{ slot: 0, npcommid: 'NPWR10227_00', title: 'The Last Guardian' }] });
  fixture.write(path.join(root, 'trophy.key'), fixture.TEST_KEY);
  fixture.write(path.join(root, 'launcher', 'tlg_run.py'), "OUT_DIR = PORT_DIR / 'out'\nLOG_DIR = OUT_DIR / 'logs'\ndef config_path():\n    return base / 'tlg-launcher' / 'settings.json'\n");
  fixture.write(path.join(root, 'out', 'boot-linked.bin'), 'linked');
  fixture.write(path.join(appData, 'tlg-launcher', 'settings.json'), JSON.stringify({ game_dir: dump }));
  const first = fixture.write(path.join(root, 'out', 'logs', 'run-20261020-101010.log'), 'boot\nRuntime: trophy 4 unlocked\n');

  const [record] = ps4Recomp.scan(root);
  assert.equal(record.data.dumpDir, dump, "the launcher's own settings name the game");
  assert.deepEqual(unlocks(record), [['4', 0]]);
  fs.rmSync(first);
  fixture.write(path.join(root, 'out', 'logs', 'run-20261021-101010.log'), 'Trophies: trophy 5 unlocked\n');
  assert.deepEqual(unlocks(record), [['4', 0], ['5', 0]], 'a log the launcher pruned keeps its unlocks');
});

// The release builds of HayatoG's ports ship the launcher frozen by PyInstaller, without its sources.
test('a frozen launcher names its settings folder from inside the executable', () => {
  const { buildLauncher } = require(path.join(__dirname, '..', 'helpers', 'pyinstallerArchive.js'));
  const root = dir('gr2', 'port');
  const dump = fixture.makeGameDump(dir('gr2', 'game', 'CUSA03694'), { titleId: 'CUSA03694', title: 'Gravity Rush 2', sets: [{ slot: 0, npcommid: 'NPWR10838_00', title: 'Gravity Rush 2' }] });
  fixture.write(path.join(root, 'trophy.key'), fixture.TEST_KEY);
  fixture.write(path.join(root, 'out', 'boot-linked.bin'), 'linked');
  fs.writeFileSync(path.join(root, 'GR2 Launcher.exe'), buildLauncher({ script: ['gr2_config', 'main'], modules: { gr2_config: ['gr2-launcher', 'settings.json'] } }));
  fixture.write(path.join(appData, 'gr2-launcher', 'settings.json'), JSON.stringify({ game_dir: dump }));
  const [record] = ps4Recomp.scan(root);
  assert.equal(record.data.dumpDir, dump);
  assert.equal(record.appid, 'ps4recomp-NPWR10838_00');
});

// launcher/kzsf_launcher.py of lesca-191204/killzone-shadowfall-pc: user/launcher.json, user/logs/<date>/game.log.
test('Killzone Shadow Fall: user/launcher.json names the game, dated folders hold game.log', () => {
  const root = fixture.makePort(dir('kz', 'killzone'), 'generic', { script: "game = Path(env.get('GOW3_GAME_DIR', PORT.parent / 'CUSA01623'))\nrun(['--app0', game])\n" });
  const dump = fixture.makeGameDump(dir('kz', 'dumps', 'CUSA00190'), { titleId: 'CUSA00190', title: 'Killzone Shadow Fall', sets: [{ slot: 0, npcommid: 'NPWR05028_00', title: 'Killzone Shadow Fall' }] });
  fixture.write(path.join(root, 'user', 'launcher.json'), JSON.stringify({ game_dir: dump, update_dir: '' }));
  fixture.write(path.join(root, 'user', 'logs', '2026-10-20_10-10-10', 'game.log'), 'Runtime: trophy 9 unlocked\n');
  const [record] = ps4Recomp.scan(root);
  assert.equal(record.data.dumpDir, dump);
  assert.deepEqual(unlocks(record), [['9', 0]]);
});

test('a log file a launcher source declares is read', () => {
  const root = dir('declared', 'Port');
  const dump = fixture.makeGameDump(dir('declared', 'Dump'), { title: 'Declared', sets: [{ slot: 0, npcommid: 'NPWR22222_00', title: 'Declared' }] });
  fixture.write(path.join(root, 'trophy.key'), fixture.TEST_KEY);
  fixture.write(path.join(root, 'launcher', 'port_launcher.py'), "LOG_FILE = PORT_DIR / 'data' / 'session.log'\nLAST_LOG = PORT_DIR.parent / 'elsewhere.log'\n");
  fixture.write(path.join(root, 'launcher.json'), JSON.stringify({ game_dir: dump }));
  fixture.write(path.join(root, 'data', 'session.log'), 'Runtime: trophy 2 unlocked\n');
  fixture.write(path.join(dir('declared'), 'elsewhere.log'), 'Runtime: trophy 7 unlocked\n');
  const [record] = ps4Recomp.scan(root);
  assert.deepEqual(unlocks(record), [['2', 0]], 'only a log inside the port');
});

// run.py and launcher/prototype_launcher.py of petrishevgeorgii-debug/prototype-pc-slop.
test('the PROTOTYPE bundle: one entry per game matched by its trophy title, unlocks split from the launcher choice', () => {
  const root = fixture.makePort(dir('proto', 'prototype-pc'), 'generic', {
    script: "game = Path(get_env(env, 'GAME_DIR'))\nexe = get_env(env, 'EBOOT', 'eboot.bin')  # THEORDER_EBOOT: prototype2_ps4f.elf\nTHEORDER_GAME_DIR = 1\ncmd = [probe, 'boot-linked.bin', '--app0', game]\n",
  });
  // Slot 0 is PROTOTYPE 2 on purpose: the game is told by the list's own title.
  const sets = [
    { slot: 0, npcommid: 'NPWR11002_00', title: 'PROTOTYPE 2' },
    { slot: 1, npcommid: 'NPWR11001_00', title: 'PROTOTYPE®' },
  ];
  const dump = fixture.makeGameDump(dir('proto', 'CUSA06545'), { titleId: 'CUSA06545', title: 'PROTOTYPE Biohazard Bundle', sets });
  const config = fixture.write(path.join(appData, 'prototype-port', 'launcher.json'), JSON.stringify({ game_dir: dump, game: 'p2' }));

  assert.equal(identifyPort(root).port, 'prototype');
  const records = ps4Recomp.scan(root);
  assert.deepEqual(records.map((r) => [r.data.game, r.data.slot, r.appid]), [
    ['p1', 1, 'ps4recomp-NPWR11001_00'],
    ['p2', 0, 'ps4recomp-NPWR11002_00'],
  ]);
  fixture.write(path.join(root, 'last_run.log'), 'Runtime: trophy 3 unlocked\nThe game started eboot.bin\nRuntime: trophy 5 unlocked\n');
  const byGame = () => records.map((r) => ps4Recomp.getAchievements(r.data).map((u) => u.id));
  assert.deepEqual(byGame(), [['5'], ['3']], 'the session started in PROTOTYPE 2, then the bundle menu');

  fixture.write(config, JSON.stringify({ game_dir: dump, game: 'p1' }));
  fixture.write(path.join(root, 'last_run.log'), 'Runtime: trophy 8 unlocked\n');
  assert.deepEqual(byGame(), [['5', '8'], ['3']], 'a new session rewrites the log, what was read is kept');
});

// src/portheon.c of the PORTHEON 3.4.3 release (XAndromedaXR/PORTHEON), trimmed to what is read.
const PORTHEON_SOURCE = [
  'typedef struct { const wchar_t *id, *name, *exe, *data; BOOL ps5, x360; const wchar_t *card; BOOL ps3; } Game;',
  'static const Game G[NGAMES] = {',
  '    {L"UFC3", L"UFC 3", L"UFC3.exe", L"UFC3Native", FALSE},',
  '    {L"UFC4", L"UFC 4", L"UFC4.exe", L"UFC4Native", FALSE},',
  '    {L"UFC5", L"UFC 5", L"UFC5.exe", NULL, TRUE},',
  '};',
  'static void PortDir(int g, wchar_t *out)',
  '{',
  '    wchar_t k[32]; _snwprintf(k, 32, L"port_%s", G[g].id);',
  '    GetPrivateProfileStringW(L"PORTHEON", k, L"", out, MAX_PATH, g_pIni);',
  '    if (out[0] && DirExists(out)) return;',
  '    wchar_t t[MAX_PATH]; Join(t, g_exeDir, L"games"); Join(out, t, G[g].id);',
  '}',
  'static void SfPath(int g, wchar_t *out) { wchar_t la[MAX_PATH] = L""; GetEnvironmentVariableW(L"LOCALAPPDATA", la, MAX_PATH); wchar_t d[MAX_PATH]; Join(d, la, G[g].data); Join(out, d, L"sacredfire.ini"); }',
  '    { wchar_t la[MAX_PATH] = L"", d[MAX_PATH]; GetEnvironmentVariableW(L"LOCALAPPDATA", la, MAX_PATH); Join(d, la, L"PORTHEON"); CreateDirectoryW(d, NULL); Join(g_pIni, d, L"portheon.ini"); }',
  '',
].join('\n');

function ufcGame(id, npcommid) {
  const dump = fixture.makeGameDump(dir('portheon', 'dumps', id), { titleId: 'CUSA06534', title: `EA SPORTS ${id}`, sets: [{ slot: 0, npcommid, title: `EA SPORTS ${id}` }] });
  fixture.write(path.join(localAppData, `${id}Native`, 'sacredfire.ini'), `\uFEFFfullscreen=1\r\ngame=${dump}\r\n`);
  return dump;
}

test('a PORTHEON package gives each UFC port it declares, the moved one included', () => {
  const pkg = dir('portheon', 'PORTHEON-3.4.3');
  fixture.write(path.join(pkg, 'src', 'portheon.c'), PORTHEON_SOURCE);
  fixture.write(path.join(pkg, 'PORTHEON.exe'), 'MZ');
  fixture.write(path.join(pkg, 'games', 'UFC3', 'UFC3.exe'), 'MZ');
  fixture.write(path.join(pkg, 'games', 'UFC3', 'trophy.key'), fixture.TEST_KEY);
  const moved = dir('portheon', 'moved', 'UFC4');
  fixture.write(path.join(moved, 'UFC4.exe'), 'MZ');
  fixture.write(path.join(moved, 'trophy.key'), fixture.TEST_KEY);
  fixture.write(path.join(localAppData, 'PORTHEON', 'portheon.ini'), `[PORTHEON]\r\nport_UFC4=${moved}\r\n`);
  ufcGame('UFC3', 'NPWR13331_00');
  ufcGame('UFC4', 'NPWR17171_00');
  fixture.write(path.join(localAppData, 'UFC3Native', 'user', 'trophies.json'), JSON.stringify({ version: 1, unlocked: [{ id: 2, date: '2026-10-20T16:00:20Z', unix: 1792512020 }] }));
  fixture.write(path.join(localAppData, 'UFC4Native', 'logs', 'ufc4-2026-10-21_101010.log'), 'Runtime: trophy 1 unlocked (saved to x)\n');

  const records = ps4Recomp.scan(dir('portheon'));
  assert.deepEqual(records.map((r) => [r.appid, r.data.installRoot]).sort(), [
    ['ps4recomp-NPWR13331_00', path.join(pkg, 'games', 'UFC3')],
    ['ps4recomp-NPWR17171_00', moved],
  ]);
  const byId = new Map(records.map((r) => [r.appid, r]));
  assert.deepEqual(unlocks(byId.get('ps4recomp-NPWR13331_00')), [['2', 1792512020]], 'trophies.json in the data folder');
  assert.deepEqual(unlocks(byId.get('ps4recomp-NPWR17171_00')), [['1', 0]], 'the data folder logs');
  assert.equal(ps4Recomp.scan(path.join(pkg, 'games', 'UFC3')).length, 1, 'one port of the package added alone');
});
