'use strict';

// Recompiled games known by their executable: listed from the moment they are installed, before the
// port writes its first unlock list, with the place that list will appear. Fixtures are synthetic.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const x360 = require('../../app/parser/x360Recomp.js');
const { buildXex } = require('../helpers/xex.js');

function tempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-x360ports-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return file;
}

const SPA = Buffer.concat([Buffer.from('XDBF'), Buffer.alloc(60, 1)]);
const xexOf = (titleId) => buildXex({ spa: SPA, titleId: parseInt(titleId, 16) });
const FILETIME = '134329715212621157';

// A library with its own Documents and APPDATA, so nothing reads this machine's folders.
function setup(t) {
  const root = tempDir(t);
  const folders = { library: path.join(root, 'Games'), documents: path.join(root, 'Docs'), appData: path.join(root, 'Roaming') };
  for (const dir of Object.values(folders)) fs.mkdirSync(dir, { recursive: true });
  x360.setDataRoot(path.join(root, 'data'));
  x360.setPortFolders({ documentsFor: () => folders.documents, appDataFor: () => folders.appData, env: {} });
  t.after(() => {
    x360.setDataRoot('');
    x360.setPortFolders(null);
  });
  return folders;
}

const install = (folders, name, exes) => {
  const dir = path.join(folders.library, name);
  for (const exe of exes) write(path.join(dir, exe), 'MZ');
  return dir;
};
const only = (games, appid) => games.filter((g) => g.appid === appid);

test("a known port is listed before its first unlock, waiting on ReXGlue's Documents folder", (t) => {
  const folders = setup(t);
  const dir = install(folders, "Dante's Inferno", ['dantes_inferno.exe']);
  const [game] = only(x360.scan(folders.library), 'x360-454108CF');
  const expected = path.join(folders.documents, 'dantes_inferno', 'achievements', '454108CF.toml');
  assert.equal(game.data.format, 'toml');
  assert.equal(game.data.file, expected);
  assert.equal(game.data.pending, true);
  assert.equal(game.data.exe, path.join(dir, 'dantes_inferno.exe'));
  assert.equal(game.data.gameDir, dir);
  assert.deepEqual(x360.getAchievements(game.data), [], 'nothing unlocked yet');

  write(expected, `[unlocked.3]\nfiletime = ${FILETIME}\n`);
  const [after] = only(x360.scan(folders.library), 'x360-454108CF');
  assert.equal(after.data.pending, false);
  assert.deepEqual(x360.getAchievements(after.data).map((a) => a.id), ['3']);
});

test('a list already found in the install outranks a port path still waiting', (t) => {
  const folders = setup(t);
  const dir = install(folders, 'LEGO', ['legodimensions.exe']);
  const existing = write(path.join(dir, 'content', 'achievements', '5752084B.toml'), '[unlocked.1]\n');
  const games = only(x360.scan(folders.library), 'x360-5752084B');
  assert.equal(games.length, 1);
  assert.equal(games[0].data.file, existing);
});

test('ports keeping their saves beside the executable, and Fable II ignoring a launcher', (t) => {
  const folders = setup(t);
  const sh = install(folders, 'Downpour', ['downpour.exe']);
  const cond = install(folders, 'Condemned 2', ['condemned2recomp.exe']);
  const fable = install(folders, 'Fable II', ['fable_2.exe']);
  write(path.join(fable, 'play.bat'), '"%~dp0fable_2.exe" --user_data_root "%~dp0elsewhere"\r\n');
  const games = x360.scan(folders.library);
  assert.equal(only(games, 'x360-4B4E0823')[0].data.file, path.join(sh, 'user', 'achievements', '4B4E0823.toml'));
  assert.equal(only(games, 'x360-534507EF')[0].data.file, path.join(cond, 'UserData', 'achievements', '534507EF.toml'));
  assert.equal(only(games, 'x360-4D5307F1')[0].data.file, path.join(fable, 'saves', 'achievements', '4D5307F1.toml'));
});

test("a literal launcher override moves the expected list; PGR4's Documents folder follows its executable", (t) => {
  const folders = setup(t);
  const sh = install(folders, 'Downpour', ['downpour.exe']);
  write(path.join(sh, 'play.bat'), '"%~dp0downpour.exe" --user_data_root "%~dp0profile"\r\n');
  install(folders, 'PGR4', ['pgr4_recompiled.exe']);
  const games = x360.scan(folders.library);
  assert.equal(only(games, 'x360-4B4E0823')[0].data.file, path.join(sh, 'profile', 'achievements', '4B4E0823.toml'));
  assert.equal(only(games, 'x360-4D5307F9')[0].data.file, path.join(folders.documents, 'pgr4_recompiled', 'achievements', '4D5307F9.toml'));
});

test('the game data picks the region: Castlevania by its XEX, Deadly Premonition by its executable', (t) => {
  const folders = setup(t);
  const cv = install(folders, 'Nocturne', ['nocturnerecomp.exe']);
  assert.deepEqual(only(x360.scan(folders.library), 'x360-58410847'), [], 'without its XEX the region is unknown: not guessed');
  write(path.join(cv, 'assets', 'default.xex'), xexOf('5841089D'));
  const [japanese] = only(x360.scan(folders.library), 'x360-5841089D');
  assert.equal(japanese.data.file, path.join(folders.documents, 'nocturnerecomp', 'achievements', '5841089D.toml'));
  assert.equal(japanese.data.xex, path.join(cv, 'assets', 'default.xex'));

  const dp = install(folders, 'Deadly Premonition', ['deadlyprem.exe', 'deadlyprem_usa.exe']);
  write(path.join(dp, 'assets', 'default.xex'), xexOf('494F07D4'));
  const [usa] = only(x360.scan(folders.library), 'x360-494F07D4');
  assert.equal(usa.data.exe, path.join(dp, 'deadlyprem_usa.exe'));
  assert.equal(usa.data.file, path.join(dp, 'userdata', 'achievements', '494F07D4.toml'));
});

test('Spider-Man waits on its TSV folder, Unleashed on ACH-DATA, portable or not', (t) => {
  const folders = setup(t);
  install(folders, 'EoT', ['SpiderManEOT.exe']);
  const unleashed = install(folders, 'Unleashed', ['UnleashedRecomp.exe']);
  let games = x360.scan(folders.library);
  assert.equal(only(games, 'x360-415608B2')[0].data.dir, path.join(folders.documents, 'spider_man_edge_of_time', 'Achievements', '415608B2'));
  const [roaming] = only(games, 'x360-53450812');
  assert.equal(roaming.data.format, 'unleashed');
  assert.equal(roaming.data.file, path.join(folders.appData, 'UnleashedRecomp', 'save', 'ACH-DATA'));
  write(path.join(unleashed, 'portable.txt'), '');
  games = x360.scan(folders.library);
  assert.equal(only(games, 'x360-53450812')[0].data.file, path.join(unleashed, 'save', 'ACH-DATA'));
});

test("reNut waits for its wizard's renut.cfg, then reads its save root from it", (t) => {
  const folders = setup(t);
  const dir = install(folders, 'reNut', ['renut.exe']);
  write(path.join(dir, 'play.bat'), '"%~dp0renut.exe" --user_data_root "%~dp0ignored"\r\n');
  let [game] = only(x360.scan(folders.library), 'x360-4D5307ED');
  assert.equal(game.data.pending, true);
  assert.equal(game.data.file, undefined, 'no path is invented before the wizard ran');
  assert.deepEqual(x360.getAchievements(game.data), []);

  write(path.join(dir, 'renut.cfg'), 'game_data_root=relative\\game\r\nuser_data_root=saves\r\n');
  [game] = only(x360.scan(folders.library), 'x360-4D5307ED');
  assert.equal(game.data.file, undefined, 'relative paths are not the wizard output: still pending');

  const saves = path.join(folders.library, 'reNut saves');
  write(path.join(dir, 'renut.cfg'), `# written by the wizard\r\ngame_data_root = "${path.join(dir, 'game')}"\r\nuser_data_root = "${saves}"\r\n`);
  [game] = only(x360.scan(folders.library), 'x360-4D5307ED');
  assert.equal(game.data.file, path.join(saves, 'achievements', '4D5307ED.toml'));
});

test('Skate 3 is not listed, a file that is not an executable is no port, and re:Blue merges its profiles', (t) => {
  const folders = setup(t);
  install(folders, 'Skate 3', ['skate3.exe']);
  write(path.join(folders.library, 'Fake', 'downpour.exe'), 'not a program');
  const reblue = install(folders, 'reBlue', ['reblue.exe']);
  let [game] = only(x360.scan(folders.library), 'x360-4D5307DF');
  assert.equal(game.data.file, path.join(reblue, 'profiles', 'default', 'achievements', '4D5307DF.toml'));
  assert.equal(game.data.pending, true);

  write(path.join(reblue, 'profiles', 'default', 'achievements', '4D5307DF.toml'), `[unlocked.1]\nfiletime = ${FILETIME}\n`);
  write(path.join(reblue, 'profiles', 'alice', 'achievements', '4D5307DF.toml'), `[unlocked.1]\nfiletime = 0\n\n[unlocked.4]\nfiletime = ${FILETIME}\n`);
  const games = x360.scan(folders.library);
  assert.deepEqual(only(games, 'x360-454108E6'), []);
  assert.deepEqual(only(games, 'x360-4B4E0823'), []);
  [game] = only(games, 'x360-4D5307DF');
  assert.equal(game.data.profileFiles.length, 2);
  assert.deepEqual(
    x360.getAchievements(game.data).map((a) => [a.id, a.earned_time > 0]),
    [['1', true], ['4', true]]
  );
});

test('Gears of War 2 Hollow is listed before its JSON list exists, under the id that list will get', (t) => {
  const folders = setup(t);
  const dir = path.join(folders.library, 'Gears of War 2 Hollow');
  write(path.join(dir, 'Binaries', 'GearGame.exe'), 'MZ');
  fs.mkdirSync(path.join(dir, 'GearGame'), { recursive: true });
  const [pending] = x360.scan(folders.library);
  assert.equal(pending.data.format, 'json');
  assert.equal(pending.data.pending, true);
  assert.equal(pending.data.file, path.join(dir, 'GearGame', 'SaveData', 'Achievements.json'));

  write(pending.data.file, JSON.stringify({ achievements: [{ id: 1, name: 'a', description: '', gamerscore: 10, unlocked: true }] }));
  const [found] = x360.scan(folders.library);
  assert.equal(found.appid, pending.appid);
  assert.equal(found.data.pending, false);
});

test("Unleashed's ACH-DATA is read only when its size, header and checksum hold", () => {
  const record = (id, seconds) => {
    const row = Buffer.alloc(16);
    row.writeUInt16LE(id, 0);
    row.writeBigInt64LE(BigInt(seconds), 2);
    return row;
  };
  const build = (rows) => {
    const body = Buffer.concat([...rows, Buffer.alloc(16 * (50 - rows.length))]);
    const head = Buffer.alloc(16);
    head.write('ACH ', 0, 'ascii');
    head.writeUInt32LE(1, 4);
    head.writeUInt32LE(body.reduce((sum, byte) => sum ^ byte, 0), 8);
    return Buffer.concat([head, body]);
  };
  const when = Date.UTC(2026, 0, 2) / 1000;
  const good = build([record(24, when), record(31, 0)]);
  assert.deepEqual([...x360.parseUnleashed(good)], [[24, when], [31, 0]]);

  const tampered = Buffer.from(good);
  tampered[20] ^= 1;
  assert.throws(() => x360.parseUnleashed(tampered), /checksum/);
  assert.throws(() => x360.parseUnleashed(good.subarray(0, 800)), /size/);
  assert.throws(() => x360.parseUnleashed(build([record(24, when), record(0, 0), record(25, when)])), /record/);
  assert.throws(() => x360.parseUnleashed(build([record(24, when), record(24, when)])), /record/);
});

const EARNED_HEADER = '# Achievements earned: id=unix time\n';
const WHEN = Date.UTC(2026, 0, 2) / 1000;

test('Lost Odyssey waits on profile/achievements.ini and finds its game data through game-path.txt', (t) => {
  const folders = setup(t);
  const dir = install(folders, 'Lost Odyssey', ['LostOdysseyRecomp.exe']);
  let [game] = only(x360.scan(folders.library), 'x360-4D5307FA');
  assert.equal(game.data.format, 'ini-earned');
  assert.equal(game.data.file, path.join(dir, 'profile', 'achievements.ini'));
  assert.equal(game.data.pending, true);
  assert.equal(game.data.xex, undefined, 'no game data yet');
  assert.deepEqual(x360.getAchievements(game.data), []);

  const outside = path.join(path.dirname(folders.library), 'LO game');
  write(path.join(outside, 'disc1', 'default.xex'), xexOf('4D5307FA'));
  write(path.join(dir, 'game-path.txt'), `${outside}\r\n`);
  [game] = only(x360.scan(folders.library), 'x360-4D5307FA');
  assert.equal(game.data.xex, path.join(outside, 'disc1', 'default.xex'));

  write(path.join(dir, 'game-path.txt'), path.join(outside, 'disc1', 'default.xex'));
  [game] = only(x360.scan(folders.library), 'x360-4D5307FA');
  assert.equal(game.data.xex, path.join(outside, 'disc1', 'default.xex'), 'the pointer may name the file itself');

  write(path.join(dir, 'game-path.txt'), path.join(outside, 'missing'));
  write(path.join(dir, 'game', 'disc1', 'default.xex'), xexOf('4D5307FA'));
  [game] = only(x360.scan(folders.library), 'x360-4D5307FA');
  assert.equal(game.data.xex, path.join(dir, 'game', 'disc1', 'default.xex'), 'a pointer to nothing falls back to the importer folders');
});

test("Lost Odyssey's game data is refused when it is another title", (t) => {
  const folders = setup(t);
  const dir = install(folders, 'Lost Odyssey', ['lostodysseyrecomp.exe']);
  write(path.join(dir, 'game', 'default.xex'), xexOf('5841089D'));
  assert.deepEqual(only(x360.scan(folders.library), 'x360-4D5307FA'), []);
});

test('the earned list is read only with its header, whole lines and no repeated id', (t) => {
  const folders = setup(t);
  const dir = install(folders, 'Lost Odyssey', ['lostodysseyrecomp.exe']);
  const file = write(path.join(dir, 'profile', 'achievements.ini'), `${EARNED_HEADER}3=${WHEN}\n7=${WHEN + 60}\n`);
  const [game] = only(x360.scan(folders.library), 'x360-4D5307FA');
  assert.equal(game.data.pending, false);
  assert.deepEqual(x360.getAchievements(game.data).map((a) => [a.id, a.earned_time]), [['3', WHEN], ['7', WHEN + 60]]);

  assert.throws(() => x360.parseEarnedIni(`3=${WHEN}\n`), /header/);
  assert.throws(() => x360.parseEarnedIni(`${EARNED_HEADER}3=${WHEN}\n7=\n`), /entry/);
  assert.throws(() => x360.parseEarnedIni(`${EARNED_HEADER}3=${WHEN}\n3=${WHEN}\n`), /repeated/);
  assert.equal(x360.parseEarnedIni(`${EARNED_HEADER}3=12\n`).get(3), 0, 'a time that is not a real date is no date');
  fs.writeFileSync(file, 'half');
  assert.throws(() => x360.getAchievements(game.data), /header/, 'a damaged list is refused, not read as empty');
});

test('Lost Odyssey merges profiles/<name>/achievements.ini with the main list, and the extension alone is no port', (t) => {
  const folders = setup(t);
  const dir = install(folders, 'Lost Odyssey', ['lostodysseyrecomp.exe']);
  write(path.join(dir, 'profile', 'achievements.ini'), `${EARNED_HEADER}3=${WHEN + 5}\n`);
  write(path.join(dir, 'profiles', 'alice', 'achievements.ini'), `${EARNED_HEADER}3=${WHEN}\n9=${WHEN}\n`);
  const [game] = only(x360.scan(folders.library), 'x360-4D5307FA');
  assert.equal(game.data.profileFiles.length, 2);
  assert.deepEqual(x360.getAchievements(game.data).map((a) => [a.id, a.earned_time]), [['3', WHEN], ['9', WHEN]]);

  write(path.join(folders.library, 'Other', 'profile', 'achievements.ini'), `${EARNED_HEADER}1=${WHEN}\n`);
  assert.equal(x360.scan(path.join(folders.library, 'Other')).length, 0, 'no port descriptor, no game');
});

test('the user_data family keeps its folder beside the program, the others use Documents', (t) => {
  const folders = setup(t);
  const cases = [
    ['SSF2T', 'ssf2t_hd_remix.exe', '584108A4', 'beside', 'user_data'],
    ['GW2', 'geometry_wars_retro_evolved_2.exe', '584108FF', 'beside', 'user_data'],
    ['HCU', 'hard_corps_uprising.exe', '58410A18', 'beside', 'user_data'],
    ['SvR', 'svr2011.exe', '5451085D', 'beside', 'UserData'],
    ['RR6', 'rr6_recomp.exe', '4E4D07D3', 'documents', 'rr6_recomp'],
    ['Kong', 'king_kong.exe', '555307D3', 'documents', 'king_kong'],
    ['Wet', 'wetrecomp.exe', '425307DB', 'documents', 'wetrecomp'],
    ['PDZ', 'perfectdarkzerorecomp.exe', '4D5307D3', 'documents', 'perfectdarkzerorecomp'],
  ];
  const dirs = new Map(cases.map(([name, exe]) => [name, install(folders, name, [exe])]));
  const games = x360.scan(folders.library);
  for (const [name, , titleId, where, folder] of cases) {
    const base = where === 'beside' ? dirs.get(name) : folders.documents;
    const [game] = only(games, `x360-${titleId}`);
    assert.equal(game.data.file, path.join(base, folder, 'achievements', `${titleId}.toml`), name);
    assert.equal(game.data.pending, true, name);
  }
});

test("WWE SvR 2011 ignores a launcher's save folder, and Perfect Dark Zero merges its local profiles", (t) => {
  const folders = setup(t);
  const svr = install(folders, 'SvR', ['svr2011.exe']);
  write(path.join(svr, 'play.bat'), '"%~dp0svr2011.exe" --user_data_root "%~dp0elsewhere"\r\n');
  const pdz = install(folders, 'PDZ', ['perfectdarkzerorecomp.exe']);
  const main = path.join(folders.documents, 'perfectdarkzerorecomp', 'achievements', '4D5307D3.toml');
  const second = path.join(folders.documents, 'perfectdarkzerorecomp', 'profiles', 'p2', 'achievements', '4D5307D3.toml');
  write(main, `[unlocked.2]\nfiletime = ${FILETIME}\n`);
  write(second, `[unlocked.5]\nfiletime = ${FILETIME}\n`);
  const games = x360.scan(folders.library);
  assert.equal(only(games, 'x360-5451085D')[0].data.file, path.join(svr, 'UserData', 'achievements', '5451085D.toml'));
  const [game] = only(games, 'x360-4D5307D3');
  assert.equal(game.data.gameDir, pdz);
  assert.deepEqual(game.data.profileFiles, [main, second]);
  assert.deepEqual(x360.getAchievements(game.data).map((a) => a.id), ['2', '5']);
});

test("Hard Corps: Uprising's achievement 0 is stored under the alias the runtime accepts", (t) => {
  const folders = setup(t);
  const dir = install(folders, 'HCU', ['hard_corps_uprising.exe']);
  write(path.join(dir, 'user_data', 'achievements', '58410A18.toml'), `[unlocked.65536]\nfiletime = ${FILETIME}\n\n[unlocked.4]\nfiletime = ${FILETIME}\n`);
  const [game] = only(x360.scan(folders.library), 'x360-58410A18');
  assert.deepEqual(x360.getAchievements(game.data).map((a) => a.id), ['0', '4']);
});

test("Marathon Recompiled reads Sonic '06's 23-record file under AppData, or beside itself when portable", (t) => {
  const folders = setup(t);
  const dir = install(folders, 'Marathon', ['MarathonRecomp.exe']);
  const row = (id, seconds) => {
    const buffer = Buffer.alloc(16);
    buffer.writeUInt16LE(id, 0);
    buffer.writeBigInt64LE(BigInt(seconds), 2);
    return buffer;
  };
  const body = Buffer.concat([row(3, WHEN), Buffer.alloc(16 * 22)]);
  const head = Buffer.alloc(16);
  head.write('ACH ', 0, 'ascii');
  head.writeUInt32LE(1, 4);
  head.writeUInt32LE(body.reduce((sum, byte) => sum ^ byte, 0), 8);
  let [game] = only(x360.scan(folders.library), 'x360-534507D6');
  assert.equal(game.data.file, path.join(folders.appData, 'MarathonRecomp', 'save', 'SonicNextAchievementData.bin'));
  assert.deepEqual(x360.getAchievements(game.data), []);

  write(game.data.file, Buffer.concat([head, body]));
  [game] = only(x360.scan(folders.library), 'x360-534507D6');
  assert.deepEqual(x360.getAchievements(game.data).map((a) => [a.id, a.earned_time]), [['3', WHEN]]);

  write(path.join(dir, 'portable.txt'), '');
  [game] = only(x360.scan(folders.library), 'x360-534507D6');
  assert.equal(game.data.file, path.join(dir, 'save', 'SonicNextAchievementData.bin'));
  assert.throws(() => x360.parseUnleashed(Buffer.concat([head, body])), /size/, 'the 50-record reader refuses a 23-record file');
});

test('the same port installed twice reads both lists as one game', (t) => {
  const folders = setup(t);
  const first = install(folders, 'Crackdown', ['crackdown.exe']);
  const second = install(folders, 'Crackdown v2', ['crackdown.exe']);
  const a = write(path.join(first, 'user_data', 'achievements', '4D5307DC.toml'), `[unlocked.1]\nfiletime = ${FILETIME}\n`);
  const b = write(path.join(second, 'user_data', 'achievements', '4D5307DC.toml'), `[unlocked.5]\nfiletime = ${FILETIME}\n`);
  const games = only(x360.scan(folders.library), 'x360-4D5307DC');
  assert.equal(games.length, 1);
  assert.deepEqual([...games[0].data.profileFiles].sort(), [a, b].sort());
  assert.deepEqual(x360.getAchievements(games[0].data).map((entry) => entry.id), ['1', '5']);
});

test('a port that fails to resolve does not take the rest of the folder down', (t) => {
  const folders = setup(t);
  const dante = install(folders, "Dante's Inferno", ['dantes_inferno.exe']);
  install(folders, 'LEGO', ['legodimensions.exe']);
  const ports = require('../../app/parser/x360Ports.js');
  const real = ports.resolvePort;
  ports.resolvePort = (dir, ...rest) => {
    if (dir === dante) throw new Error('broken install');
    return real(dir, ...rest);
  };
  t.after(() => {
    ports.resolvePort = real;
  });
  assert.deepEqual(x360.scan(folders.library).map((g) => g.appid), ['x360-5752084B']);
});

test("a port's own folders are read through the scan's directory reader", (t) => {
  const folders = setup(t);
  install(folders, 'PDZ', ['perfectdarkzerorecomp.exe']);
  const profiles = path.join(folders.documents, 'perfectdarkzerorecomp', 'profiles');
  write(path.join(profiles, 'p2', 'achievements', '4D5307D3.toml'), `[unlocked.5]\nfiletime = ${FILETIME}\n`);
  const seen = [];
  x360.setDirectoryReader((dir) => {
    seen.push(dir);
    return fs.readdirSync(dir, { withFileTypes: true });
  });
  t.after(() => x360.setDirectoryReader(null));
  x360.scan(folders.library);
  assert.ok(seen.includes(profiles), 'the memoised reader sees the profiles folder');
});
