'use strict';

/*
  re:Blue's own achievements, ids from 0x10001, in the same lists as Blue Dragon's: their texts are a
  table, their pictures come out of reblue.exe (a record per file: name pointer, name length, data
  pointer, size), or from the release when the executable is not there. Executables are synthetic.
*/
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const reblue = require('../../app/parser/reblueBonus.js');
const x360 = require('../../app/parser/x360Recomp.js');

const IMAGE_BASE = 0x140000000n;
const RDATA_VA = 0x2000;
const RDATA_RAW = 0x400;
const FILETIME = '134329715212621157';

const picture = (label) => Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.from(`icon ${label}`)]);
const assetName = (id) => `achievements/0x${id.toString(16)}.png`;

// A 64-bit executable whose .rdata holds the names, the records and the files, as re:Blue's does.
function makeExe(files) {
  const names = [];
  let size = 0;
  for (const file of files) {
    names.push(size);
    size += file.name.length + 1;
  }
  const records = Math.ceil(size / 8) * 8;
  let at = records + files.length * 32;
  const blobs = files.map((file) => {
    const start = at;
    at += file.data.length;
    return start;
  });
  const rdata = Buffer.alloc(at);
  const va = (offset) => IMAGE_BASE + BigInt(RDATA_VA + offset);
  files.forEach((file, i) => {
    rdata.write(file.name, names[i], 'latin1');
    rdata.writeBigUInt64LE(va(names[i]), records + i * 32);
    rdata.writeBigUInt64LE(BigInt(file.name.length), records + i * 32 + 8);
    rdata.writeBigUInt64LE(va(blobs[i]), records + i * 32 + 16);
    rdata.writeBigUInt64LE(BigInt(file.data.length), records + i * 32 + 24);
    file.data.copy(rdata, blobs[i]);
  });
  const headers = Buffer.alloc(RDATA_RAW);
  headers.write('MZ', 0, 'latin1');
  headers.writeUInt32LE(0x40, 0x3c);
  headers.writeUInt32LE(0x4550, 0x40);
  headers.writeUInt16LE(0x8664, 0x44);
  headers.writeUInt16LE(1, 0x46);
  headers.writeUInt16LE(240, 0x54);
  headers.writeUInt16LE(0x20b, 0x58);
  headers.writeBigUInt64LE(IMAGE_BASE, 0x58 + 24);
  const section = 0x58 + 240;
  headers.write('.rdata', section, 'latin1');
  headers.writeUInt32LE(rdata.length, section + 8);
  headers.writeUInt32LE(RDATA_VA, section + 12);
  headers.writeUInt32LE(rdata.length, section + 16);
  headers.writeUInt32LE(RDATA_RAW, section + 20);
  return Buffer.concat([headers, rdata]);
}

const iconsOf = (...ids) => ids.map((id) => ({ name: assetName(id), data: picture(id) }));

function tempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-reblue-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function install(t, files) {
  const root = tempDir(t);
  const gameDir = path.join(root, 'reBlue');
  fs.mkdirSync(gameDir, { recursive: true });
  if (files) fs.writeFileSync(path.join(gameDir, 'reblue.exe'), makeExe(files));
  const list = path.join(gameDir, 'profiles', 'default', 'achievements', `${reblue.TITLE_ID}.toml`);
  return { root, gameDir, list, iconDir: path.join(root, 'icons') };
}

test('the pictures reblue.exe embeds are found by their names; anything else is left out', (t) => {
  const { gameDir } = install(t, [...iconsOf(0x10001, 0x10009), { name: assetName(0x10002), data: Buffer.from('not a picture at all') }]);
  const icons = reblue.embeddedIcons(path.join(gameDir, 'reblue.exe'));
  assert.deepEqual([...icons.keys()], [0x10001, 0x10009]);
  assert.deepEqual(icons.get(0x10009), picture(0x10009));

  const notProgram = path.join(gameDir, 'notes.exe');
  fs.writeFileSync(notProgram, 'MZ but nothing after');
  assert.equal(reblue.embeddedIcons(notProgram).size, 0);
});

test("re:Blue's achievements list after the game's, with their pictures, and one a later re:Blue adds", async (t) => {
  const game = install(t, iconsOf(0x10001, 0x10009));
  const list = await reblue.bonusAchievements({ titleId: reblue.TITLE_ID, gameDir: game.gameDir }, game.iconDir);
  assert.deepEqual(list.map((entry) => entry.name), [...reblue.BONUS.map((b) => String(b.id)), String(0x10009)]);
  const [bathroom] = list;
  assert.equal(bathroom.displayName, 'Where is the bathroom?');
  assert.equal(bathroom.gamerscore, 69);
  assert.equal(bathroom.hidden, 1);
  assert.match(bathroom.icon, /^file:\/\/\/.*0x10001\.png$/);
  assert.deepEqual(fs.readFileSync(path.join(game.iconDir, '0x10001.png')), picture(0x10001));
  assert.equal(list[1].icon, '', 'a picture the executable lacks is not invented');
  assert.equal(list.at(-1).displayName, 're:Blue bonus 0x10009');
});

test('the executable is read again only once it is replaced', async (t) => {
  const game = install(t, iconsOf(0x10001, 0x1000b));
  const exe = path.join(game.gameDir, 'reblue.exe');
  const stamp = (when) => fs.utimesSync(exe, when, when);
  const built = new Date(1700000000000);
  stamp(built);
  const ids = async () => (await reblue.bonusAchievements({ titleId: reblue.TITLE_ID, gameDir: game.gameDir }, game.iconDir)).map((e) => Number(e.name));
  assert.equal((await ids()).includes(0x1000b), true);

  // Same layout, so the same size: only the date tells this build from the one read before.
  fs.writeFileSync(exe, makeExe(iconsOf(0x10001, 0x1000a)));
  stamp(built);
  assert.equal((await ids()).includes(0x1000a), false, 'same size and date: the earlier reading stands');

  stamp(new Date(built.getTime() + 60000));
  assert.equal((await ids()).includes(0x1000a), true);
});

test('another title, or Blue Dragon without re:Blue, has no bonus', async (t) => {
  const game = install(t, null);
  assert.deepEqual(await reblue.bonusAchievements({ titleId: '454108CF', gameDir: game.gameDir, file: game.list }, game.iconDir), []);
  assert.deepEqual(await reblue.bonusAchievements({ titleId: reblue.TITLE_ID, gameDir: game.gameDir, file: path.join(game.root, 'x.toml') }, game.iconDir), []);
});

test('without its executable, the pictures are fetched once from the release', async (t) => {
  const game = install(t, null);
  const asked = [];
  const fetchImpl = async (url) => {
    asked.push(url);
    return { ok: true, arrayBuffer: async () => picture(url) };
  };
  const info = { titleId: reblue.TITLE_ID, file: game.list };
  const list = await reblue.bonusAchievements(info, game.iconDir, { fetchImpl });
  assert.equal(list.length, reblue.BONUS.length);
  assert.ok(list.every((entry) => entry.icon));
  assert.ok(asked.every((url) => url.startsWith('https://raw.githubusercontent.com/zolaware/reblue/v1.3.1/')));
  assert.equal(asked.length, reblue.BONUS.length);
  await reblue.bonusAchievements(info, game.iconDir, { fetchImpl });
  assert.equal(asked.length, reblue.BONUS.length, 'pictures already there are not fetched again');
});

test('a re:Blue install lists its bonus with the game, and an earned one reads as earned', async (t) => {
  const game = install(t, iconsOf(0x10006));
  x360.setDataRoot(path.join(game.root, 'data'));
  t.after(() => x360.setDataRoot(''));
  fs.mkdirSync(path.dirname(game.list), { recursive: true });
  fs.writeFileSync(game.list, `[unlocked.1]\nfiletime = ${FILETIME}\n\n[unlocked.${0x10006}]\nfiletime = ${FILETIME}\n`);
  const loc = { locale: { identifier: 'en_US' }, name: 'Base', description: 'Base desc', locked_description: '' };
  const schema = [1, 2].map((id) => ({ title_id: reblue.TITLE_ID, achievement_id: id, gamerscore: 10, is_secret: false, is_revoked: false, localizations: [loc] }));
  const fetchImpl = async (url) => {
    if (url.includes('/achievements/v1/')) return { ok: true, status: 200, json: async () => schema };
    if (url.includes('/title_ids/')) return { ok: true, status: 200, json: async () => ({ name: 'Blue Dragon' }) };
    if (url.includes('/marketplace/products/')) return { ok: true, status: 200, json: async () => ({ default_title: '' }) };
    return { ok: false, status: 404 };
  };
  const data = { format: 'toml', titleId: reblue.TITLE_ID, gameDir: game.gameDir, file: game.list, profileFiles: [game.list] };
  const gameData = await x360.getGameData(data, 'english', { fetchImpl });
  assert.equal(gameData.achievement.total, 2 + reblue.BONUS.length);
  const earned = new Set(x360.getAchievements(data).map((entry) => entry.id));
  const cloaca = gameData.achievement.list.find((entry) => entry.name === String(0x10006));
  assert.equal(cloaca.displayName, 'Cloaca Maxima');
  assert.ok(earned.has(cloaca.name));
});
