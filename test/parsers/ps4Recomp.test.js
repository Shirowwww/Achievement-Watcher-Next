'use strict';

/*
  PS4 Recomp ports, on synthetic installs: which folders are ports (and which port), where the
  original game and the user folder are, the trophy list read from the dump (plain and encrypted),
  and the two unlock logs, the Uncharted collection's split by game included.
*/
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-ps4recomp-'));
const realAppData = process.env.APPDATA;
const appData = path.join(temp, 'AppData');
process.env.APPDATA = appData;

const ps4Recomp = require(path.join(__dirname, '..', '..', 'app', 'parser', 'ps4Recomp.js'));
const logs = require(path.join(__dirname, '..', '..', 'app', 'parser', 'ps4RecompLogs.js'));
const fixture = require(path.join(__dirname, '..', 'helpers', 'ps4Recomp.js'));

ps4Recomp.setDataRoot(path.join(temp, 'userData'));
const { identifyPort, scriptDefault, parseExtraEnv } = ps4Recomp._internal;

test.after(() => {
  if (realAppData === undefined) delete process.env.APPDATA;
  else process.env.APPDATA = realAppData;
  fs.rmSync(temp, { recursive: true, force: true });
});

function dir(...parts) {
  return path.join(temp, ...parts);
}

test('each named port is told apart by its own files, then by its launcher', () => {
  for (const port of ['bloodborne', 'uncharted', 'gow3', 'medievil']) {
    const byFiles = fixture.makePort(dir('ident', `${port}-files`), port, { withExe: false });
    assert.equal(identifyPort(byFiles).port, port, `${port} from its launcher art`);
    const byExe = fixture.makePort(dir('ident', `${port}-exe`), port, { withMarker: false });
    assert.equal(identifyPort(byExe).port, port, `${port} from its launcher's name`);
  }
});

test('a folder that is not a port is refused', () => {
  const game = dir('refused', 'SomeGame');
  fixture.write(path.join(game, 'Bloodborne.exe'), 'MZ');
  assert.equal(identifyPort(game), null, 'a launcher name without run.py is not a port');
  fixture.write(path.join(dir('refused', 'Script'), 'run.py'), 'print("hello")\n');
  assert.equal(identifyPort(dir('refused', 'Script')), null, 'a run.py that boots no PS4 executable is not a port');
  assert.deepEqual(ps4Recomp.scan(dir('refused')), []);
});

test('Bloodborne is found from its launcher settings, user folder defaulting to <data>/user', async () => {
  const root = fixture.makePort(dir('bb', 'Bloodborne Port'), 'bloodborne');
  const dump = fixture.makeGameDump(dir('bb', 'Dumps', 'CUSA00900'));
  fixture.settingsFile(appData, 'bbport-launcher', { game_dir: dump });

  const [record] = ps4Recomp.scan(dir('bb'));
  assert.equal(record.appid, `ps4recomp-${fixture.NPCOMMID}`, 'a namespaced id, never a bare one');
  assert.equal(record.source, 'PS4 Recomp');
  assert.equal(record.data.type, 'ps4recomp');
  assert.equal(record.data.dumpDir, dump);
  assert.equal(record.data.userDir, path.join(root, 'user'));
  assert.equal(record.data.exe, path.join(root, 'Bloodborne.exe'));
  assert.deepEqual(record.data.logs, ['trophies.log', 'last_run.log']);

  const game = await ps4Recomp.getGameData(record.data, 'french');
  assert.equal(game.name, 'Bloodborne');
  assert.equal(game.system, 'playstation');
  assert.equal(game.achievement.total, 3);
  const [platinum, bronze, hidden] = game.achievement.list;
  assert.deepEqual([platinum.type, bronze.type, hidden.type], ['P', 'B', 'G'], 'native grades');
  assert.equal(bronze.displayName, 'Chasseur', 'the French list is used');
  assert.equal(bronze.rarityName, 'Hunter', 'with its English text kept for rarity lookups');
  assert.equal(hidden.hidden, 1);
  const iconFile = decodeURI(bronze.icon.replace(/^file:\/\/\//, ''));
  assert.ok(fs.existsSync(iconFile), 'the trophy icon is cached as a local file');
  assert.ok(game.img.icon, "the dump's icon is the game's icon");
});

test('the retail key is used unless trophy.key overrides it', async () => {
  const root = fixture.makePort(dir('key', 'MediEvil'), 'medievil', { key: '' });
  const dump = fixture.makeGameDump(path.join(root, 'Game'), { title: 'MediEvil' });
  const [record] = ps4Recomp.scan(root);
  assert.equal(record.data.dumpDir, dump, 'the only dump below the port is the game');
  await assert.rejects(ps4Recomp.getGameData(record.data), /no readable trophy list/, 'test-key data does not open with the retail key');
  fixture.write(path.join(root, 'trophy.key'), fixture.TEST_KEY);
  assert.equal((await ps4Recomp.getGameData(record.data)).name, 'MediEvil');
});

test('plain trophy data needs no key', async () => {
  const root = fixture.makePort(dir('plain', 'GOW3'), 'gow3', { key: '' });
  const dump = fixture.makeGameDump(dir('plain', 'Dump'), { title: 'God of War III Remastered', encrypted: false });
  fixture.settingsFile(appData, 'gow3-launcher', { game_dir: dump, data_dir: 'Data' });
  const [record] = ps4Recomp.scan(root);
  assert.equal(record.data.userDir, path.join(root, 'Data', 'user'), 'a relative data_dir is the port folder');
  const game = await ps4Recomp.getGameData(record.data);
  assert.equal(game.achievement.list[1].displayName, 'Hunter');
});

test('extra_env variables win over the launcher settings', () => {
  const root = fixture.makePort(dir('env', 'GOW3'), 'gow3');
  const dump = fixture.makeGameDump(dir('env', 'Dump'));
  const user = dir('env', 'Saves');
  fixture.write(path.join(root, 'settings.json'), JSON.stringify({ game_dir: dir('env', 'nowhere'), extra_env: `GOW3_GAME_DIR="${dump}" GOW3_USER_DIR=${user} OTHER=1` }));
  const [record] = ps4Recomp.scan(root);
  assert.equal(record.data.dumpDir, dump);
  assert.equal(record.data.userDir, user);
  assert.deepEqual(parseExtraEnv("A=1 B='two words' C=\"x y\""), { A: '1', B: 'two words', C: 'x y' });
});

test('a generic run.py port is read from literal defaults only', () => {
  const script = [
    'import os',
    'env = os.environ',
    "GAME = env.get('FOO_GAME_DIR', PORT.parent / 'FooDump')",
    "USER = env.get('FOO_USER_DIR', make_user_dir(PORT))",
    "subprocess.run([runtime, '--app0', GAME, 'boot-linked.bin'])",
    '',
  ].join('\n');
  const root = fixture.makePort(dir('generic', 'ports', 'FooPort'), 'generic', { script });
  const dump = fixture.makeGameDump(dir('generic', 'ports', 'FooDump'), { title: 'Foo', sets: [{ slot: 3, npcommid: 'NPWR11111_00', title: 'Foo' }] });
  assert.equal(identifyPort(root).port, 'generic');
  assert.equal(identifyPort(root).env, 'FOO');
  const [record] = ps4Recomp.scan(dir('generic'));
  assert.equal(record.data.dumpDir, dump, 'PORT.parent / literal is resolved');
  assert.equal(record.data.userDir, path.join(root, 'user'), 'a computed default is ignored');
  assert.equal(record.data.slot, 3);
  assert.equal(record.appid, 'ps4recomp-NPWR11111_00');

  assert.equal(scriptDefault("x = env.get('FOO_DATA_DIR', Path(os.getcwd()))", 'FOO_DATA_DIR', { PORT: root }), '', 'a call is never evaluated');
  const twoPrefixes = `${script}\nBAR_GAME_DIR = 1\n`;
  fixture.write(path.join(dir('generic', 'two'), 'run.py'), twoPrefixes);
  assert.equal(identifyPort(dir('generic', 'two')), null, 'two game folders are a collection we cannot split');
});

test('a local settings.json beside run.py names the folders of a generic port', () => {
  const root = fixture.makePort(dir('local', 'Port'), 'generic', { script: "run(['--app0', game])\n" });
  const dump = fixture.makeGameDump(dir('local', 'Dump'));
  fixture.write(path.join(root, 'settings.json'), JSON.stringify({ game_dir: dump, user_dir: 'profile' }));
  const [record] = ps4Recomp.scan(root);
  assert.equal(record.data.dumpDir, dump);
  assert.equal(record.data.userDir, path.join(root, 'profile'));
});

test('trophies.log and last_run.log give the unlocks, an unfinished line is left for later', () => {
  // No launcher settings this time: the one dump below the port is the game.
  fs.rmSync(path.join(appData, 'bbport-launcher'), { recursive: true, force: true });
  const root = fixture.makePort(dir('logs', 'Bloodborne'), 'bloodborne');
  const dump = fixture.makeGameDump(path.join(root, 'Game'));
  const [record] = ps4Recomp.scan(root);
  assert.equal(record.data.dumpDir, dump);
  assert.deepEqual(ps4Recomp.getAchievements(record.data), [], 'no log yet is nothing unlocked, not an error');

  fixture.write(path.join(root, 'user', 'trophies.log'), '1 1700000000\n2 1700000100\r\n0 17000');
  fixture.write(path.join(root, 'user', 'last_run.log'), 'boot\nRuntime: trophy 1 unlocked\n');
  const unlocked = ps4Recomp.getAchievements(record.data);
  assert.deepEqual(unlocked.map((u) => [u.id, u.earned_time]), [['1', 1700000000], ['2', 1700000100]]);
});

test('the Uncharted collection gets one entry per game, unlocks split by the game being played', () => {
  const root = fixture.makePort(dir('unch', 'Uncharted'), 'uncharted');
  const sets = [0, 1, 2].map((slot) => ({ slot, npcommid: `NPWR0866${slot}_00`, title: `Uncharted ${slot + 1}` }));
  fixture.makeGameDump(dir('unch', 'Collection'), { sets });
  fixture.settingsFile(appData, 'uncharted-launcher', { game_dir: dir('unch', 'Collection') });
  const records = ps4Recomp.scan(root);
  assert.deepEqual(records.map((r) => [r.data.game, r.data.slot, r.appid]), [
    ['u1', 0, 'ps4recomp-NPWR08660_00'],
    ['u2', 1, 'ps4recomp-NPWR08661_00'],
    ['u3', 2, 'ps4recomp-NPWR08662_00'],
  ]);
  assert.deepEqual(records[0].data.logs, ['last_run.log'], 'trophies.log does not say which game');

  const log = path.join(root, 'user', 'last_run.log');
  fixture.write(log, ['Preparing C:/Games/eboot/boot-linked.bin', 'Runtime: trophy 3 unlocked', 'Switching to big2-ps4_Shipping.elf', 'Runtime: trophy 5 unlocked', ''].join('\n'));
  const byGame = () => records.map((r) => ps4Recomp.getAchievements(r.data).map((u) => u.id));
  assert.deepEqual(byGame(), [['3'], ['5'], []]);

  // The next session rewrites last_run.log; what was read before is still known.
  fixture.write(log, 'Runtime: SystemService: load executable big3/eboot/boot-linked.bin\nRuntime: trophy 7 unlocked\n');
  assert.deepEqual(byGame(), [['3'], ['5'], ['7']]);
  assert.equal(logs.gameFromText('Switching to big3-ps4_Shipping.elf'), 'u3');
});

test('Settings > Folders accepts a port folder, and a folder inside it as the port itself', async () => {
  const userDir = require(path.join(__dirname, '..', '..', 'app', 'parser', 'userDir.js'));
  const root = fixture.makePort(dir('folders', 'MediEvil Port'), 'medievil');
  const accepted = await userDir.diagnose(root);
  assert.equal(accepted.accepted, true);
  assert.equal(accepted.code, 'recompilation');
  const inside = await userDir.diagnose(path.join(root, 'launcher'));
  assert.equal(inside.accepted, true);
  assert.equal(inside.canonicalPath, root, 'the port folder is the one kept');
});

test('a reset never touches the files of a port user folder', () => {
  const targets = require(path.join(__dirname, '..', '..', 'app', 'util', 'achievementResetTargets.js'));
  for (const name of ['trophies.log', 'last_run.log', 'achievements.json', 'stats.bin']) assert.equal(targets.resetActionFor(name, 'PS4 Recomp'), null, name);
});

test('a log is read only up to complete lines', () => {
  const file = fixture.write(dir('read', 'trophies.log'), '4 1700000000\n5 17');
  const read = logs.readLog(file);
  assert.deepEqual(read.lines, ['4 1700000000']);
  assert.equal(read.unstable, false);
  assert.equal(logs.readLog(dir('read', 'absent.log')).missing, true);
  assert.deepEqual(logs.completeLines('cut line\nwhole\n', true), ['whole'], 'a tail read drops its cut first line');
});

test('a growing log is read from where the last read stopped, a rewritten one from its start', () => {
  const noise = 'Runtime: frame presented\n'.repeat(4000);
  const file = fixture.write(dir('tail', 'last_run.log'), `Preparing big2-ps4_Shipping.elf\n${noise}Runtime: trophy 3 unl`);
  assert.deepEqual(logs.readLog(file).lines, ['Preparing big2-ps4_Shipping.elf']);

  const realRead = fs.readSync;
  let bytes = 0;
  fs.readSync = (...args) => {
    const count = realRead(...args);
    bytes += count;
    return count;
  };
  try {
    fs.appendFileSync(file, 'ocked\nRuntime: trophy 4 unlocked\n');
    assert.deepEqual(logs.parseLastRunLog(logs.readLog(file).lines).map((unlock) => `${unlock.game}:${unlock.id}`), ['u2:3', 'u2:4']);
  } finally {
    fs.readSync = realRead;
  }
  assert.ok(bytes < 1024, `only the new bytes and the first ones are read again, not ${bytes}`);

  fs.writeFileSync(file, `Preparing big3-ps4_Shipping.elf\n${noise}Runtime: trophy 7 unlocked\n`);
  assert.deepEqual(logs.parseLastRunLog(logs.readLog(file).lines).map((unlock) => `${unlock.game}:${unlock.id}`), ['u3:7'], 'a new session, even a longer one, starts over');

  fs.writeFileSync(file, 'Runtime: trophy 1 unlocked\n');
  assert.deepEqual(logs.readLog(file).lines, ['Runtime: trophy 1 unlocked'], 'a shorter log starts over');
});

test('a log rewritten in place with the same opening lines is read again from its start', () => {
  const banner = `${'#'.repeat(299)}\n`;
  const file = fixture.write(dir('rewrite', 'last_run.log'), `${banner}Preparing big2-ps4_Shipping.elf\nRuntime: trophy 3 unlocked\n`);
  assert.deepEqual(logs.parseLastRunLog(logs.readLog(file).lines).map((unlock) => `${unlock.game}:${unlock.id}`), ['u2:3']);
  fs.writeFileSync(file, `${banner}Preparing big3-ps4_Shipping.elf\n${'Runtime: frame presented\n'.repeat(50)}Runtime: trophy 7 unlocked\n`);
  assert.deepEqual(logs.parseLastRunLog(logs.readLog(file).lines).map((unlock) => `${unlock.game}:${unlock.id}`), ['u3:7']);
});

test('a log over the read limit keeps its last lines, without the one cut in half', () => {
  const file = fixture.write(dir('tail', 'trophies.log'), '1 1700000000\n2 1700000001\n3 1700000002\n');
  assert.deepEqual(logs.readLog(file, 20).lines, ['3 1700000002']);
  fs.appendFileSync(file, '4 1700000003\n');
  assert.deepEqual(logs.readLog(file, 20).lines, ['3 1700000002', '4 1700000003']);
});
