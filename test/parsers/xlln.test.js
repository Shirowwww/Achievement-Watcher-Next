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
const { SAMPLE_TITLE_ID_HEX, PNG, makeGameFolder, unlockRecord, sampleSpa, dlcSpa, writeDlcPack } = require(path.join(__dirname, '..', 'helpers', 'xlln.js'));

const fileUrlToPath = (url) => url.slice('file:///'.length);

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

    assert.strictEqual(game.img.header, first.icon);
    assert.strictEqual(game.img.headerStandIn, true, 'an achievement icon is only a stand-in until real library art arrives');

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

  /*
    DLC achievements: the runtime keeps one spa.bin per content pack under <storage>/dlc/<TITLE>/<pack>/Content.
    A pack only adds ids the base game does not know, tagged as DLC, and a pack that cannot be trusted
    (wrong title, no table, garbage, a symlink) costs the base list nothing.
  */
  {
    const dlcGame = makeGameFolder(temp, 'Dlc Game', { unlocks: [unlockRecord(1, 1577836800), unlockRecord(3, 1600000000)] });
    const dlcTarget = xlln.inspect(dlcGame);
    const storage = path.join(dlcGame, 'XLiveLessNess');
    const other = Buffer.concat([PNG, Buffer.from(' from the pack')]);
    const record = (id, title, imageId) => ({ id, titleStringId: title, unlockedDescriptionId: title + 1, lockedDescriptionId: title + 2, imageId, gamerscore: 15, flags: 0x8 });
    const packStrings = new Map([[0x8000, 'DLC Pack'], [10, 'Hijack'], [30, 'Dlc Three'], [31, 'You beat the DLC.'], [32, 'Beat the DLC.'], [40, 'Dlc Four'], [41, 'Four done.'], [42, 'Do four.']]);
    const pack = dlcSpa({ achievements: [record(1, 10, 100), record(3, 30, 100), record(4, 40, 200)], strings: packStrings, images: [{ id: 100, data: other }] });

    const before = await xlln.getGameData(dlcTarget, 'english');
    assert.deepStrictEqual(before.achievement.list.map((entry) => entry.name), ['1', '2'], 'without a pack the list is the base game');

    writeDlcPack(storage, SAMPLE_TITLE_ID_HEX, 'Pack1', pack);
    const withDlc = await xlln.getGameData(dlcTarget, 'english');
    assert.deepStrictEqual(withDlc.achievement.list.map((entry) => entry.name), ['1', '2', '3', '4'], 'a pack found later adds its unknown ids');
    assert.strictEqual(withDlc.achievement.total, 4);
    const [baseOne, , dlcThree, dlcFour] = withDlc.achievement.list;
    assert.strictEqual(baseOne.displayName, 'First Steps', 'an id the base game knows keeps the base game text');
    assert.strictEqual(baseOne.dlc, undefined, 'base achievements carry no DLC tag');
    assert.strictEqual(dlcThree.displayName, 'Dlc Three');
    assert.strictEqual(dlcThree.description, 'You beat the DLC.');
    assert.strictEqual(dlcThree.dlc, true);
    assert.strictEqual(dlcThree.category, 'DLC');
    assert.strictEqual(dlcThree.gamerscore, 15);
    assert.strictEqual(dlcThree.hidden, 0);
    assert.notStrictEqual(dlcThree.icon, baseOne.icon, 'the pack icon does not overwrite the base icon that shares its image id');
    assert.ok(fs.readFileSync(fileUrlToPath(dlcThree.icon)).equals(other));
    assert.ok(fs.readFileSync(fileUrlToPath(baseOne.icon)).equals(PNG));
    assert.strictEqual(dlcFour.icon, '', 'a DLC achievement whose icon the pack lacks has none');
    assert.deepStrictEqual(xlln.getAchievements(dlcTarget).map((entry) => entry.id).sort(), ['1', '3'], 'DLC unlocks come from the same profile file');

    // A pack changed in place is read again.
    writeDlcPack(storage, SAMPLE_TITLE_ID_HEX, 'Pack1', dlcSpa({ achievements: [record(3, 30, 100), record(4, 40, 200), record(5, 50, 300)], strings: new Map([...packStrings, [50, 'Dlc Five']]) }));
    const edited = await xlln.getGameData(dlcTarget, 'english');
    assert.deepStrictEqual(edited.achievement.list.map((entry) => entry.name), ['1', '2', '3', '4', '5'], 'an edited pack is not served from the cache');

    // Packs that cannot be trusted are left out, the base list and the good pack stand.
    writeDlcPack(storage, SAMPLE_TITLE_ID_HEX, 'WrongTitle', dlcSpa({ titleId: 0x11111111, achievements: [record(7, 70, 400)], strings: new Map([[70, 'Wrong']]) }));
    writeDlcPack(storage, SAMPLE_TITLE_ID_HEX, 'NoTable', dlcSpa({ strings: new Map([[0x8000, 'Content only']]) }));
    writeDlcPack(storage, SAMPLE_TITLE_ID_HEX, 'Garbage', Buffer.from('this is not an XDBF container'));
    writeDlcPack(storage, SAMPLE_TITLE_ID_HEX, 'Untitled', dlcSpa({ titleId: null, achievements: [record(8, 80, 500)], strings: new Map([[80, 'No header']]) }));
    const trusted = await xlln.getGameData(dlcTarget, 'english');
    assert.deepStrictEqual(trusted.achievement.list.map((entry) => entry.name), ['1', '2', '3', '4', '5', '8'], 'a wrong title, an empty pack and garbage add nothing; a pack with no title header is accepted');

    // A link could point at any file on the disk: neither a linked pack folder nor a linked spa.bin counts.
    const outside = path.join(temp, 'outside-pack');
    writeDlcPack(outside, SAMPLE_TITLE_ID_HEX, 'Linked', dlcSpa({ achievements: [record(9, 90, 600)], strings: new Map([[90, 'Linked']]) }));
    const outsidePack = path.join(outside, 'dlc', SAMPLE_TITLE_ID_HEX, 'Linked');
    let linked = true;
    try {
      fs.symlinkSync(outsidePack, path.join(storage, 'dlc', SAMPLE_TITLE_ID_HEX, 'LinkedFolder'), 'junction');
      const contentDir = path.join(storage, 'dlc', SAMPLE_TITLE_ID_HEX, 'LinkedFile', 'Content');
      fs.mkdirSync(contentDir, { recursive: true });
      fs.symlinkSync(path.join(outsidePack, 'Content', 'spa.bin'), path.join(contentDir, 'spa.bin'), 'file');
    } catch {
      linked = false; // creating links needs a privilege this machine may not grant
    }
    const afterLinks = await xlln.getGameData(dlcTarget, 'english');
    assert.ok(!afterLinks.achievement.list.some((entry) => entry.name === '9'), linked ? 'linked packs are ignored' : 'no link was created here');
  }

  // The listing bounds: file count, size of one file, size of all of them.
  {
    const folder = makeGameFolder(temp, 'Bounded Game', { titleId: '77777777' });
    const storage = path.join(folder, 'XLiveLessNess');
    writeDlcPack(storage, '77777777', 'A', Buffer.alloc(60));
    writeDlcPack(storage, '77777777', 'B', Buffer.alloc(200));
    writeDlcPack(storage, '77777777', 'C', Buffer.alloc(60));
    writeDlcPack(storage, '77777777', 'D', Buffer.alloc(30));
    const names = (limits) => xlln.listDlcSpaFiles(folder, '77777777', limits).map((entry) => path.basename(path.dirname(path.dirname(entry.file))));
    assert.deepStrictEqual(names({ maxFiles: 10, maxFileBytes: 100, maxTotalBytes: 1000 }), ['A', 'C', 'D'], 'a file over the size bound is skipped, the others stay');
    assert.deepStrictEqual(names({ maxFiles: 10, maxFileBytes: 100, maxTotalBytes: 100 }), ['A', 'D'], 'a file that no longer fits the total is skipped');
    assert.deepStrictEqual(names({ maxFiles: 2, maxFileBytes: 1000, maxTotalBytes: 1000 }), ['A', 'B'], 'the file count is capped');
    assert.deepStrictEqual(xlln.listDlcSpaFiles(folder, 'not-a-title'), [], 'a malformed title id lists nothing');
    assert.deepStrictEqual(xlln.listDlcSpaFiles(path.join(temp, 'nowhere'), '77777777'), [], 'no storage, no packs');

    // A pack unpacked with other letter cases still loads in the game (Wine ignores case), so it is read.
    const spelled = makeGameFolder(temp, 'Spelled Game', { titleId: 'ABCDEF12' });
    const spelledFile = path.join(spelled, 'XLiveLessNess', 'DLC', 'abcdef12', 'Pack', 'content', 'SPA.BIN');
    fs.mkdirSync(path.dirname(spelledFile), { recursive: true });
    fs.writeFileSync(spelledFile, Buffer.alloc(40));
    assert.deepStrictEqual(xlln.listDlcSpaFiles(spelled, 'ABCDEF12').map((entry) => entry.file), [spelledFile], 'the file is named as the disk spells it');
    assert.deepStrictEqual(xlln.DLC_LIMITS, { maxFiles: 128, maxFileBytes: 64 * 1024 * 1024, maxTotalBytes: 128 * 1024 * 1024 });
    console.log('PASS: DLC packs add their own achievements, tagged, and untrusted or oversized packs are left out');
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
