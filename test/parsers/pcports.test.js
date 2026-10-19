'use strict';

/*
  The PC port reader: the install carries the whole schema (110 achievements, their texts in the
  game's languages and their pictures), and unlocks are "achievement<N> true|false" lines in a file
  the game keeps under %LOCALAPPDATA%\Zelda_LA, or beside itself when portable.txt is there.
*/
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const pcports = require(path.join(__dirname, '..', '..', 'app', 'parser', 'pcports.js'));
const { COUNT, PNG, writeFile, languageText, makeInstall, writeUnlocks, unlockText } = require(path.join(__dirname, '..', 'helpers', 'pcports.js'));

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-pcports-'));
pcports.setDataRoot(path.join(temp, 'userData'));
const realLocalAppData = process.env.LOCALAPPDATA;
process.env.LOCALAPPDATA = path.join(temp, 'LocalAppData');

test.after(() => {
  if (realLocalAppData === undefined) delete process.env.LOCALAPPDATA;
  else process.env.LOCALAPPDATA = realLocalAppData;
  fs.rmSync(temp, { recursive: true, force: true });
});

const zeldaFile = () => path.join(process.env.LOCALAPPDATA, 'Zelda_LA', 'achievements');

test('an install is found from the game folder or from a library above it', () => {
  const game = makeInstall(path.join(temp, 'library', 'Games', 'Zelda'));
  const [found] = pcports.scan(path.join(temp, 'library'));
  assert.equal(found.appid, 'pcports-ladxhd', 'the id is namespaced, never a bare number or word');
  assert.equal(found.source, 'PC Port');
  assert.equal(found.data.type, 'pcports');
  assert.equal(found.data.root, game);
  assert.equal(found.data.portable, false);
  assert.equal(found.data.progressFile, zeldaFile());
  assert.equal(pcports.scan(game).length, 1);
});

test('the short exe name and the typographic apostrophe are both accepted', () => {
  assert.ok(pcports.detect(makeInstall(path.join(temp, 'short'), { executable: 'LADXHD.exe' })));
  assert.ok(pcports.detect(makeInstall(path.join(temp, 'curly'), { executable: 'Link’s Awakening DX HD.exe' })));
});

test('a folder missing a piece of the install is not one', () => {
  const noExe = makeInstall(path.join(temp, 'no-exe'));
  fs.rmSync(path.join(noExe, "Link's Awakening DX HD.exe"));
  assert.equal(pcports.detect(noExe), null);

  const noTexts = makeInstall(path.join(temp, 'no-texts'));
  fs.rmSync(path.join(noTexts, 'Data', 'Languages', 'achieve_eng.lng'));
  assert.equal(pcports.detect(noTexts), null);

  const noPicture = makeInstall(path.join(temp, 'no-picture'), { images: 0 });
  assert.equal(pcports.detect(noPicture), null);

  const other = path.join(temp, 'other-game');
  writeFile(path.join(other, 'Game.exe'), 'MZ');
  assert.deepEqual(pcports.scan(other), []);
});

test('the search is bounded and skips the game data folders', () => {
  const deep = makeInstall(path.join(temp, 'deep', 'a', 'b', 'c', 'd', 'Zelda'));
  assert.deepEqual(pcports.scan(path.join(temp, 'deep')), [], 'four levels down is too far');
  const hidden = makeInstall(path.join(temp, 'skipped', 'Mods', 'Zelda'));
  assert.deepEqual(pcports.scan(path.join(temp, 'skipped')), [], 'a copy inside Mods is not the install');
  assert.ok(deep && hidden);
});

test('the unlock file is beside the game when portable.txt is there', () => {
  const game = makeInstall(path.join(temp, 'portable', 'Zelda'), { portable: true });
  const [found] = pcports.scan(game);
  assert.equal(found.data.portable, true);
  assert.equal(found.data.progressFile, path.join(game, 'achievements'));
});

test('the schema has 110 achievements with their pictures, and falls back to English', async () => {
  const game = makeInstall(path.join(temp, 'schema', 'Zelda'), {
    languages: { 'achieve_fre.lng': 'achieveName0 Premier\nachieveDesc0 Le premier\nachieveName5 Cinq\n' },
  });
  writeFile(path.join(game, 'Mods', 'Languages', 'dialog_fre.lng'), 'achieveDesc5 Cinquieme\nsomething else 1\n');
  const [found] = pcports.scan(game);

  const english = await pcports.getGameData(found.data, 'english');
  assert.equal(english.achievement.total, COUNT);
  assert.equal(english.achievement.list.length, COUNT);
  assert.equal(english.achievement.list[0].name, 'achievement0');
  assert.equal(english.achievement.list[109].name, 'achievement109');
  assert.equal(english.achievement.list[7].displayName, 'English name 7');
  assert.equal(english.achievement.list[7].description, 'English description 7');
  const icon = english.achievement.list[3].icon;
  assert.match(icon, /achievement3\.png$/);
  assert.ok(fs.readFileSync(path.join(pcports.iconDirFor(), 'achievement3.png')).equals(PNG), 'the picture is copied as it is');

  const french = await pcports.getGameData(found.data, 'french');
  assert.equal(french.achievement.list[0].displayName, 'Premier');
  assert.equal(french.achievement.list[5].description, 'Cinquieme', 'a Mods file adds to the Data one');
  assert.equal(french.achievement.list[6].displayName, 'English name 6', 'a missing line falls back to English');

  const unknown = await pcports.getGameData(found.data, 'klingon');
  assert.equal(unknown.achievement.list[0].displayName, 'English name 0');
});

test('a text file that is not strict UTF-8, or a missing English one, is refused', async () => {
  const game = makeInstall(path.join(temp, 'bad-text', 'Zelda'));
  fs.writeFileSync(path.join(game, 'Data', 'Languages', 'achieve_eng.lng'), Buffer.from([0x61, 0xff, 0xfe]));
  await assert.rejects(() => pcports.getGameData({ root: game }, 'english'));
  await assert.rejects(() => pcports.getGameData({ root: path.join(temp, 'nowhere') }, 'english'));
});

test('a language file that is a link is not read', async (t) => {
  const game = makeInstall(path.join(temp, 'linked', 'Zelda'));
  const real = path.join(temp, 'linked', 'real.lng');
  writeFile(real, languageText('Linked'));
  fs.rmSync(path.join(game, 'Data', 'Languages', 'achieve_eng.lng'));
  try {
    fs.symlinkSync(real, path.join(game, 'Data', 'Languages', 'achieve_eng.lng'));
  } catch {
    t.skip('cannot create a symbolic link here');
    return;
  }
  assert.equal(pcports.detect(game), null, 'the English file is a link, so this is not an install');
});

test('unlocks are read from the file, and half a file reads as nothing', () => {
  const [found] = pcports.scan(makeInstall(path.join(temp, 'unlocks', 'Zelda')));
  assert.deepEqual(pcports.getAchievements(found.data), [], 'no file yet');

  writeUnlocks(zeldaFile(), [0, 4, 109]);
  const earned = pcports.getAchievements(found.data);
  assert.deepEqual(earned.map((entry) => entry.id), ['achievement0', 'achievement4', 'achievement109']);
  assert.ok(earned.every((entry) => entry.achieved === true && entry.earned_time === 0), 'no date was seen yet');

  fs.writeFileSync(zeldaFile(), `${unlockText([1])}achievement9 tr`);
  assert.equal(pcports.readUnlocks(zeldaFile()), null, 'a line cut short makes the file unreadable');
  assert.deepEqual(pcports.getAchievements(found.data), []);
});

test('the moment an unlock was seen is kept, and never moved', () => {
  const [found] = pcports.scan(makeInstall(path.join(temp, 'times', 'Zelda')));
  writeUnlocks(zeldaFile(), [2, 3]);
  pcports.recordObservedTimes(['achievement2'], 1700000000);
  pcports.recordObservedTimes(['achievement2', 'achievement3'], 1700009999);
  const byId = Object.fromEntries(pcports.getAchievements(found.data).map((entry) => [entry.id, entry.earned_time]));
  assert.equal(byId.achievement2, 1700000000, 'the first sighting stays');
  assert.equal(byId.achievement3, 1700009999);
});
