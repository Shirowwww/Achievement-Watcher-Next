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

test("a fork of the God of War III launcher reads its own settings, not God of War III's", () => {
  // AbdelmoumenDeghbouche/wipeout_pc keeps launcher/gow3.ico and gow3_launcher_win.py.
  const root = fixture.makePort(dir('fork', 'WipEout'), 'gow3', { withExe: false });
  fixture.write(path.join(root, 'WipEout.exe'), 'MZ');
  const wipeout = fixture.makeGameDump(dir('fork', 'CUSA02320'), { title: 'WipEout Omega Collection' });
  const gow3 = fixture.makeGameDump(dir('fork', 'CUSA07671'), { title: 'God of War III Remastered' });
  fixture.settingsFile(appData, 'wipeout-launcher', { game_dir: wipeout });
  fixture.settingsFile(appData, 'gow3-launcher', { game_dir: gow3 });
  assert.equal(identifyPort(root).port, 'wipeout');
  assert.equal(ps4Recomp.scan(root)[0].data.dumpDir, wipeout);
  const source = fixture.makePort(dir('fork', 'GOW3 source'), 'gow3', { withExe: false });
  assert.equal(identifyPort(source).port, 'gow3', 'without a launcher exe the art still means God of War III');
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
  fixture.makeGameDump(dir('unch', 'Collection'), { sets: fixture.COLLECTION_SETS });
  fixture.settingsFile(appData, 'uncharted-launcher', { game_dir: dir('unch', 'Collection') });
  const records = ps4Recomp.scan(root);
  // The real dump numbers its lists 01-03 (service labels 1-3), never 00.
  assert.deepEqual(records.map((r) => [r.data.game, r.data.slot, r.appid]), [
    ['u1', 1, 'ps4recomp-NPWR08661_00'],
    ['u2', 2, 'ps4recomp-NPWR08662_00'],
    ['u3', 3, 'ps4recomp-NPWR08663_00'],
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

// #138: the reporter's trophy01.txt, CRLF lines included.
const REPORTED_LIST = '12 1792644204\r\n41 1792645166\r\n';

test('the Nathan Drake Collection port without run.py gets one entry per game, unlocks from trophyNN.txt', async () => {
  const root = fixture.makeCollectionPort(dir('ndc', 'Uncharted-windows'));
  assert.equal(identifyPort(root).port, 'probe-uncharted');
  const records = ps4Recomp.scan(dir('ndc'));
  const trophyDir = path.join(root, 'analysis', 'uncharted-user', 'trophy');
  assert.deepEqual(records.map((r) => [r.appid, r.data.slot, r.data.logs]), [
    ['ps4recomp-NPWR08661_00', 1, ['trophy01.txt']],
    ['ps4recomp-NPWR08662_00', 2, ['trophy02.txt']],
    ['ps4recomp-NPWR08663_00', 3, ['trophy03.txt']],
  ]);
  for (const record of records) {
    assert.equal(record.data.userDir, trophyDir, 'the folder the port writes trophy lists in, before it exists');
    assert.equal(record.data.dumpDir, path.join(root, 'game', 'CUSA02344', 'uroot'), "the launcher's default game folder");
    assert.equal(record.data.exe, path.join(root, 'Uncharted Launcher.exe'));
  }
  // The run.py collection test above journaled the same appids.
  for (const record of records) fs.rmSync(ps4Recomp._internal.journalFile(record.appid), { force: true });
  assert.deepEqual(ps4Recomp.getAchievements(records[0].data), [], 'no trophy folder yet is nothing unlocked');

  fixture.write(path.join(trophyDir, 'trophy01.txt'), '1 1792644204\r\n2 1792645166\r\n');
  fixture.write(path.join(trophyDir, 'trophy03.txt'), '0 1792646000\n');
  const byGame = records.map((r) => ps4Recomp.getAchievements(r.data).map((u) => [u.id, u.earned_time]));
  assert.deepEqual(byGame, [[['1', 1792644204], ['2', 1792645166]], [], [['0', 1792646000]]], 'each list file is its own game');
  assert.ok(!fs.existsSync(ps4Recomp._internal.journalFile(records[0].appid)), 'a list file keeps its unlocks, no journal is needed');

  const game = await ps4Recomp.getGameData(records[0].data);
  assert.equal(game.name, 'Uncharted 1', "the name is the trophy list's own");
  assert.equal(game.achievement.total, 3);
});

test('the Collection port reads its game folder from launcher.json, the default when that is gone', () => {
  const root = fixture.makeCollectionPort(dir('ndccfg', 'Port'), { dump: false });
  const elsewhere = fixture.makeGameDump(dir('ndccfg', 'Games', 'CUSA02344'), { titleId: 'CUSA02344', sets: fixture.COLLECTION_SETS });
  const config = path.join(appData, 'Uncharted Launcher', 'launcher.json');
  fixture.write(config, JSON.stringify({ game: 'u2', game_dir: elsewhere }));
  try {
    assert.equal(ps4Recomp.scan(root).length, 3);
    assert.equal(ps4Recomp.scan(root)[0].data.dumpDir, elsewhere);

    fixture.write(config, JSON.stringify({ game_dir: dir('ndccfg', 'unplugged') }));
    assert.deepEqual(ps4Recomp.scan(root), [], 'no dump anywhere: no trophy names, no entry');
    fixture.makeGameDump(path.join(root, 'game', 'CUSA02344', 'uroot'), { sets: fixture.COLLECTION_SETS });
    assert.equal(ps4Recomp.scan(root)[0].data.dumpDir, path.join(root, 'game', 'CUSA02344', 'uroot'), 'a missing setting falls back to the default folder');

    fixture.write(config, '{ cut off');
    assert.equal(ps4Recomp.scan(root).length, 3, 'an unreadable launcher.json is no setting at all');
  } finally {
    fs.rmSync(path.dirname(config), { recursive: true, force: true });
  }
});

// A dump unpacked from a .pkg can keep npbind.dat encrypted: the real CUSA02343 one does.
test('a dump whose npbind.dat cannot be read still opens its trophy lists', async () => {
  const root = fixture.makeCollectionPort(dir('nobind', 'Port'));
  fs.rmSync(path.join(root, 'game', 'CUSA02344', 'uroot', 'sce_sys', 'npbind.dat'));
  const records = ps4Recomp.scan(root);
  assert.deepEqual(records.map((r) => r.appid), ['ps4recomp-NPWR08661_00', 'ps4recomp-NPWR08662_00', 'ps4recomp-NPWR08663_00'], 'the same ids as with a readable npbind.dat');
  const game = await ps4Recomp.getGameData(records[1].data);
  assert.equal(game.name, 'Uncharted 2', 'the NP id is found from the encrypted list itself');
  assert.equal(game.achievement.total, 3);
  assert.equal(require(path.join(__dirname, '..', '..', 'app', 'parser', 'ps4RecompTrophies.js')).findNpcommid(new Map([['TROPCONF.ESFM', Buffer.alloc(64, 1)]])), '', 'a list no NP id opens finds none');
});

test('any port on the same runtime is read the same way, not only Uncharted', async () => {
  const root = dir('runtime', 'GoW3 Port');
  fixture.write(path.join(root, 'tools', 'probe_gow3.py'), '');
  fixture.write(path.join(root, 'God of War III Launcher.exe'), 'MZ');
  fixture.write(path.join(root, 'analysis', 'gow3-user', 'probe.ini'), '');
  fixture.write(path.join(root, 'trophy.key'), `${fixture.TEST_KEY}\n`);
  const dump = fixture.makeGameDump(path.join(root, 'game', 'CUSA01623'), { titleId: 'CUSA01623', title: 'God of War III Remastered' });
  fixture.write(path.join(root, 'analysis', 'gow3-user', 'trophy', 'trophy00.txt'), '2 1792650000\r\n');

  const [record, ...others] = ps4Recomp.scan(dir('runtime'));
  assert.equal(others.length, 0);
  assert.equal(record.appid, `ps4recomp-${fixture.NPCOMMID}`);
  assert.equal(record.data.port, 'probe-gow3');
  assert.equal(record.data.dumpDir, dump, 'a bundled game/<title id> folder without uroot');
  assert.equal(record.data.exe, path.join(root, 'God of War III Launcher.exe'));
  assert.deepEqual(record.data.logs, ['trophy00.txt']);
  assert.deepEqual(ps4Recomp.getAchievements(record.data).map((u) => [u.id, u.earned_time]), [['2', 1792650000]]);
  assert.equal((await ps4Recomp.getGameData(record.data)).name, 'God of War III Remastered');

  const loose = dir('runtime-loose', 'Tools');
  fixture.write(path.join(loose, 'tools', 'probe_thing.py'), '');
  assert.equal(identifyPort(loose), null, 'a probe script alone, with no user folder or launcher, is not a port');
});

test('the reported trophy01.txt reads as two dated unlocks', () => {
  const root = fixture.makeCollectionPort(dir('ndcreal', 'Port'));
  fixture.write(path.join(root, 'analysis', 'uncharted-user', 'trophy', 'trophy01.txt'), REPORTED_LIST);
  const [first] = ps4Recomp.scan(root);
  assert.deepEqual(ps4Recomp.getAchievements(first.data).map((u) => [u.id, u.earned_time]), [['12', 1792644204], ['41', 1792645166]]);
});

test('a port that writes its own trophy list is read from its user folder, no dump needed', async () => {
  const root = dir('tsv', 'CTR');
  fixture.write(path.join(root, 'CTR.exe'), 'MZ');
  const list = fixture.makeTrophyList(path.join(root, 'user'), { unlocked: '21 1792472145\r\n43 1792472177\r\n2 1792472243\r\n' });

  const [record] = ps4Recomp.scan(dir('tsv'));
  assert.equal(record.appid, `ps4recomp-${fixture.TSV_TITLE_ID}`);
  assert.equal(record.data.userDir, list, 'the title folder is the one watched');
  assert.deepEqual(record.data.logs, ['unlocked.txt']);
  assert.equal(record.data.installRoot, root);

  const game = await ps4Recomp.getGameData(record.data);
  assert.equal(game.name, 'Crash Team Racing Nitro-Fueled');
  assert.equal(game.system, 'playstation');
  assert.equal(game.achievement.total, 5);
  const byId = new Map(game.achievement.list.map((trophy) => [trophy.name, trophy]));
  assert.equal(byId.get('0').type, 'P');
  assert.equal(byId.get('43').displayName, 'Get off me!');
  assert.equal(byId.get('43').description, 'Escape a TNT crate.');
  assert.equal(byId.get('21').hidden, 1);
  assert.equal(byId.get('1').hidden, 0);

  const unlocked = ps4Recomp.getAchievements(record.data);
  assert.deepEqual(unlocked.map((u) => [u.id, u.earned_time]), [['21', 1792472145], ['43', 1792472177], ['2', 1792472243]], 'CRLF lines are read');
});

test('a trophy list in another language is shown in it, without English rarity names', async () => {
  const user = dir('tsvlang', 'Port', 'user');
  const list = fixture.makeTrophyList(user);
  const file = path.join(list, 'trophies.tsv');
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('#lang\t1', '#lang\t2').replace('Get off me!', 'Lâche-moi !'));
  const [record] = ps4Recomp.scan(user);
  for (const lang of ['french', 'english']) {
    const game = await ps4Recomp.getGameData(record.data, lang);
    const trophy = game.achievement.list.find((entry) => entry.name === '43');
    assert.equal(trophy.displayName, 'Lâche-moi !', `${lang}: the only text there is`);
    assert.equal(trophy.rarityName, undefined, 'French text never stands in for the English name');
  }
  const english = await ps4Recomp.getGameData(ps4Recomp.scan(fixture.makeTrophyList(dir('tsvlang', 'Other', 'user')))[0].data, 'french');
  assert.equal(english.achievement.list.find((entry) => entry.name === '43').rarityName, 'Get off me!', '#lang 1 is English');
});

test('a trophy list is found from the user or trophies folder itself, and before any unlock', () => {
  const user = dir('tsvdirs', 'Game', 'user');
  const list = fixture.makeTrophyList(user);
  for (const added of [user, path.join(user, 'trophies'), list]) {
    const records = ps4Recomp.scan(added);
    assert.equal(records.length, 1, added);
    assert.equal(records[0].data.userDir, list);
  }
  assert.deepEqual(ps4Recomp.getAchievements(ps4Recomp.scan(list)[0].data), [], 'no unlocked.txt yet is nothing unlocked');
  fixture.makeTrophyList(dir('tsvdirs', 'Other', 'user'), { titleId: 'NOTATITLE' });
  assert.deepEqual(ps4Recomp.scan(dir('tsvdirs', 'Other')), [], 'a folder not named like a title id is ignored');
});

test('a run.py port whose runtime writes a trophy list needs no dump', () => {
  const root = fixture.makePort(dir('tsvport', 'Port'), 'generic', { script: "run(['--app0', game])\n" });
  fixture.write(path.join(root, 'settings.json'), JSON.stringify({ user_dir: 'profile' }));
  const list = fixture.makeTrophyList(path.join(root, 'profile'));
  const records = ps4Recomp.scan(root);
  assert.deepEqual(records.map((r) => [r.appid, r.data.userDir]), [[`ps4recomp-${fixture.TSV_TITLE_ID}`, list]]);
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

  const collection = fixture.makeCollectionPort(dir('folders', 'Uncharted-windows'));
  assert.equal((await userDir.diagnose(collection)).code, 'recompilation', 'the Collection port without run.py too');
  const nested = await userDir.diagnose(path.join(collection, 'analysis', 'uncharted-user'));
  assert.equal(nested.accepted, true);
  assert.equal(nested.canonicalPath, collection);
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

test('the other runtimes unlock lines are read, a repeated unlock is not a new one', () => {
  const lines = ['Trophies: trophy 4 unlocked', 'Runtime: trophy 5 unlocked (saved to C:/UFC/user/trophies.json)', 'Runtime: trophy 6 was already unlocked'];
  assert.deepEqual(logs.parseLastRunLog(lines).map((unlock) => unlock.id), ['4', '5']);
});

test('the PROTOTYPE bundle log is split by the game started, from the one the launcher chose', () => {
  const file = fixture.write(dir('proto-log', 'last_run.log'), ['Runtime: trophy 1 unlocked', 'The game started prototype2_ps4f.elf', 'Runtime: trophy 2 unlocked', 'The game started eboot.bin', 'Runtime: trophy 3 unlocked', ''].join('\n'));
  const read = logs.readLog(file).lines;
  assert.ok(read.includes('The game started prototype2_ps4f.elf'), 'the context line is kept by the reader');
  const split = logs.parseLastRunLog(read, { port: 'prototype', initial: 'p1' }).map((unlock) => `${unlock.game}:${unlock.id}`);
  assert.deepEqual(split, ['p1:1', 'p2:2', 'p1:3']);
  assert.equal(logs.gameFromText('Switching to big2-ps4_Shipping.elf', 'prototype'), '', 'each collection reads its own executables');
});

test('a log over the read limit keeps its last lines, without the one cut in half', () => {
  const file = fixture.write(dir('tail', 'trophies.log'), '1 1700000000\n2 1700000001\n3 1700000002\n');
  assert.deepEqual(logs.readLog(file, 20).lines, ['3 1700000002']);
  fs.appendFileSync(file, '4 1700000003\n');
  assert.deepEqual(logs.readLog(file, 20).lines, ['3 1700000002', '4 1700000003']);
});
