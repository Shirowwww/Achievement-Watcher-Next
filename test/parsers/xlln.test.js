'use strict';

/*
  XLiveLessNess games: discovery from an install folder, the schema read out of the executable, and
  the unlock records the runtime appends per profile.

  The two rules worth guarding are both refusals. A folder is only claimed when the runtime, the
  title config and the achievement list inside the executable agree - a config copied from another
  game would otherwise attach its achievements here. And a state file that is not a whole number of
  records is left unread rather than half-read: a partial answer would relock achievements, then
  replay every one of them as a fresh unlock on the next pass.
*/
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const xlln = require(path.join(__dirname, '..', '..', 'app', 'parser', 'xlln.js'));
const { SAMPLE_TITLE_ID_HEX, makeGameFolder, unlockRecord, sampleSpa } = require(path.join(__dirname, '..', 'helpers', 'xlln.js'));

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-xlln-'));
xlln.setIconRoot(path.join(temp, 'icons'));
// The per-user storage root is one of the places state files are read from. Point it at the fixture
// so a real XLiveLessNess folder on the machine running this cannot answer for a fixture title.
const realLocalAppData = process.env.LOCALAPPDATA;
process.env.LOCALAPPDATA = path.join(temp, 'LocalAppData');

(async () => {
  assert.strictEqual(xlln.parseTitleConfig('<x><titleid>4d5307d3</titleid></x>').titleId, '4D5307D3', 'the title id is normalised to upper case');
  assert.strictEqual(xlln.parseTitleConfig('<x><titleid>d3</titleid></x>').titleId, '000000D3', 'a short id is padded to eight digits');
  assert.strictEqual(xlln.parseTitleConfig('<x><titleversion>1.0</titleversion></x>'), null, 'a config with no title id says nothing');
  assert.strictEqual(xlln.parseTitleConfig('nonsense'), null);
  assert.strictEqual(xlln.parseTitleConfig('<x><titleid>zzzz</titleid></x>'), null);

  const utf16 = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('<x><titleid>4d5307d3</titleid></x>', 'utf16le')]);
  assert.strictEqual(xlln.parseTitleConfig(xlln.decodeConfig(utf16)).titleId, '4D5307D3', 'a UTF-16 config is decoded');

  const state = Buffer.concat([unlockRecord(1, 1577836800), unlockRecord(2, 0)]);
  const decoded = xlln.parseState(state);
  assert.strictEqual(decoded.get(1), 1577836800, 'the FILETIME becomes unix seconds');
  assert.strictEqual(decoded.get(2), 0, 'a record with no timestamp is still an unlock');
  assert.strictEqual(decoded.size, 2);

  // The same achievement written twice keeps the earliest real timestamp: that is when it was earned.
  const rewritten = xlln.parseState(Buffer.concat([unlockRecord(5, 1600000000), unlockRecord(5, 1500000000)]));
  assert.strictEqual(rewritten.get(5), 1500000000);

  assert.strictEqual(xlln.parseState(Buffer.concat([state, Buffer.alloc(7)])), null, 'a half-written record makes the whole file unreadable');
  assert.strictEqual(xlln.parseState('not a buffer'), null);
  assert.strictEqual(xlln.parseState(Buffer.alloc(2 * 1024 * 1024)), null, 'an implausibly large file is refused');
  assert.strictEqual(xlln.parseState(Buffer.alloc(0)).size, 0, 'an empty file is a game that has unlocked nothing');

  const played = makeGameFolder(temp, 'Sample Game', { unlocks: [unlockRecord(1, 1577836800)] });
  const inspected = xlln.inspect(played);
  assert.ok(inspected, 'the runtime, the config and the executable together identify the install');
  assert.strictEqual(inspected.titleId, SAMPLE_TITLE_ID_HEX);
  assert.strictEqual(inspected.name, 'Sample GFWL Game', 'the display name comes from the executable');
  assert.strictEqual(inspected.total, 2);

  assert.strictEqual(xlln.inspect(makeGameFolder(temp, 'No Runtime', { runtime: false, titleId: '11111111' })), null, 'without xlive.dll it is an ordinary game');
  assert.strictEqual(xlln.inspect(makeGameFolder(temp, 'No Config', { config: false, titleId: '22222222' })), null, 'without a title config nothing names the title');

  // A config that names a different title than the executable is the case this must refuse.
  const mismatched = makeGameFolder(temp, 'Mismatched', { titleId: '33333333', spaBuffer: sampleSpa(0x44444444) });
  assert.strictEqual(xlln.inspect(mismatched), null, 'a config borrowed from another game is refused');

  const found = xlln.discover(temp);
  assert.strictEqual(found.length, 1, 'only the consistent install is claimed');
  assert.strictEqual(found[0].titleId, SAMPLE_TITLE_ID_HEX);

  const games = xlln.scan(temp);
  assert.strictEqual(games.length, 1);
  assert.strictEqual(games[0].appid, `xlln-${SAMPLE_TITLE_ID_HEX}`, 'the appid is namespaced so it cannot collide with a Xenia title');
  assert.strictEqual(games[0].source, 'XLiveLessNess');
  assert.strictEqual(games[0].data.type, 'xlln');
  assert.strictEqual(games[0].data.gameDir, path.resolve(played));

  const emptyRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-xlln-none-'));
  try {
    fs.mkdirSync(path.join(emptyRoot, 'Some Other Game'));
    assert.deepStrictEqual(xlln.scan(emptyRoot), [], 'a folder with no GFWL install answers with nothing');
  } finally {
    fs.rmSync(emptyRoot, { recursive: true, force: true });
  }

  const target = found[0];
  const files = xlln.stateFiles(target);
  assert.strictEqual(files.length, 1, 'the profile beside the game is found');
  assert.strictEqual(path.basename(files[0].file), 'achievements.dat');

  assert.deepStrictEqual(xlln.stateFiles({ gameDir: played, titleId: 'not-a-title' }), [], 'a malformed title id reads nothing');

  const unlocked = xlln.getAchievements(target);
  assert.strictEqual(unlocked.length, 1);
  assert.deepStrictEqual(unlocked[0], { id: '1', achieved: true, earned_time: 1577836800 });

  // A second profile for the same title: the library shows what has been earned on this machine.
  const secondProfile = path.join(played, 'XLiveLessNess', 'profile', 'title', SAMPLE_TITLE_ID_HEX, '0009000000000001');
  fs.mkdirSync(secondProfile, { recursive: true });
  fs.writeFileSync(path.join(secondProfile, 'achievements.dat'), unlockRecord(2, 1600000000));
  const merged = xlln.getAchievements(target).sort((left, right) => Number(left.id) - Number(right.id));
  assert.deepStrictEqual(merged.map((entry) => entry.id), ['1', '2'], 'unlocks from every profile are merged');

  // A truncated profile is skipped without costing the readable one its unlocks.
  fs.writeFileSync(path.join(secondProfile, 'achievements.dat'), Buffer.alloc(9));
  const survived = xlln.getAchievements(target);
  assert.deepStrictEqual(survived.map((entry) => entry.id), ['1'], 'an unreadable profile is skipped, not guessed at');

  {
    const game = await xlln.getGameData(target, 'english');
    assert.strictEqual(game.name, 'Sample GFWL Game');
    assert.strictEqual(game.system, 'xbox', 'GFWL achievements are Xbox achievements, and get that badge');
    assert.strictEqual(game.achievement.total, 2);

    const [first, secret] = game.achievement.list;
    assert.strictEqual(first.name, '1', 'the api-name is the achievement id the state file uses');
    assert.strictEqual(first.displayName, 'First Steps');
    assert.strictEqual(first.description, 'You took the first steps.');
    assert.strictEqual(first.hidden, 0);
    assert.strictEqual(first.gamerscore, 20);
    assert.ok(first.icon.startsWith('file:///'), 'the embedded icon is extracted to the cache');
    assert.ok(fs.existsSync(path.join(temp, 'icons', SAMPLE_TITLE_ID_HEX, '100.png')), 'and written where the app and the Watchdog share it');

    assert.strictEqual(secret.hidden, 1, 'the secret achievement keeps its flag');
    assert.strictEqual(secret.icon, '', 'an achievement whose icon the game does not ship simply has none');

    const french = await xlln.getGameData(target, 'french');
    assert.strictEqual(french.name, 'Jeu GFWL exemple');
    assert.strictEqual(french.achievement.list[0].displayName, 'Premiers pas');
    // French is only half translated in this title: the missing texts fall back to English rather
    // than leaving the achievement nameless.
    assert.strictEqual(french.achievement.list[1].displayName, 'Secret Ending');

    await assert.rejects(() => xlln.getGameData({ titleId: SAMPLE_TITLE_ID_HEX, exe: path.join(temp, 'absent.exe') }), /no readable achievement data/);

    console.log('PASS: XLiveLessNess games are read from their own install, and refused when it disagrees');
  }
})()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => {
    if (realLocalAppData === undefined) delete process.env.LOCALAPPDATA;
    else process.env.LOCALAPPDATA = realLocalAppData;
    try {
      fs.rmSync(temp, { recursive: true, force: true });
    } catch {
      /* the OS will reclaim it */
    }
  });
