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
