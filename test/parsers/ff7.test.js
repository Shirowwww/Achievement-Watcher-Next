'use strict';

/*
  FINAL FANTASY VII (2013) keeps its unlocks in an 8-byte bitfield called achievement.dat. The file
  says nothing about which game it belongs to, so the folder around it is what decides whether those
  bytes may be read at all - the interesting half of this parser is everything it refuses.
*/
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const ff7 = require(path.join(__dirname, '..', '..', 'app', 'parser', 'ff7.js'));
const bitMap = require(path.join(__dirname, '..', '..', 'app', 'assets', 'ff7-achievements.json'));

const CONFIGS = ['ff7input.cfg', 'ff7sound.cfg', 'ff7video.cfg'];

function makeGameFolder(parent, name, { configs = true, appid = '39140', save = false, state = null } = {}) {
  const dir = path.join(parent, name);
  fs.mkdirSync(dir, { recursive: true });
  if (configs) for (const cfg of CONFIGS) fs.writeFileSync(path.join(dir, cfg), '');
  if (appid) fs.writeFileSync(path.join(dir, 'steam_appid.txt'), appid);
  if (save) fs.writeFileSync(path.join(dir, 'save00.ff7'), '');
  if (state) fs.writeFileSync(path.join(dir, 'achievement.dat'), state);
  return dir;
}

// Set one bit the way the game does: most significant bit first inside each byte.
function bitfield(...bits) {
  const buffer = Buffer.alloc(8);
  for (const bit of bits) buffer[bit >> 3] |= 1 << (7 - (bit % 8));
  return buffer;
}

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-ff7-'));
try {
  assert.strictEqual(Object.keys(bitMap).length, 36, 'the 2013 release has 36 achievements');

  const first = bitfield(28);
  const last = bitfield(63);
  assert.strictEqual(ff7.parseState(first).USE_1ST_LIMIT_CAITSITH.Achieved, '1', 'bit 28 is the first achievement');
  assert.strictEqual(ff7.parseState(last).DEATH_OF_AERITH.Achieved, '1', 'bit 63 is the last one');
  assert.strictEqual(ff7.parseState(first).DEATH_OF_AERITH.Achieved, '0', 'a bit that is not set stays locked');

  const empty = ff7.parseState(Buffer.alloc(8));
  assert.strictEqual(Object.keys(empty).length, 36, 'every achievement is reported, locked ones included');
  assert.ok(Object.values(empty).every((entry) => entry.Achieved === '0'), 'an empty bitfield unlocks nothing');
  assert.ok(Object.values(empty).every((entry) => entry.UnlockTime === 0), 'the format carries no unlock time');

  const all = ff7.parseState(Buffer.alloc(8, 0xff));
  assert.strictEqual(Object.values(all).filter((entry) => entry.Achieved === '1').length, 36, 'a full bitfield unlocks all of them');

  // A file of any other length is not this format, and must not be decoded as if it were.
  assert.strictEqual(ff7.parseState(Buffer.alloc(4)), null, 'a short file is refused');
  assert.strictEqual(ff7.parseState(Buffer.alloc(16)), null, 'a longer file is refused');
  assert.strictEqual(ff7.parseState('not a buffer'), null);

  const byAppid = makeGameFolder(temp, 'Game', { save: false });
  assert.ok(ff7.detect(byAppid).detected, 'the three launcher configs plus the appid identify the game');

  const byName = makeGameFolder(temp, 'FINAL FANTASY VII', { appid: '' });
  assert.ok(ff7.detect(byName).detected, 'the folder name identifies it when nobody wrote a steam_appid.txt');

  const bySave = makeGameFolder(temp, 'ff7-copy', { appid: '', save: true });
  assert.ok(ff7.detect(bySave).detected, 'a FF7 save beside the configs identifies it too');

  const otherGame = makeGameFolder(temp, 'Other', { appid: '480' });
  assert.ok(!ff7.detect(otherGame).detected, 'a folder that declares another appid is left alone');

  const noConfigs = makeGameFolder(temp, 'Bare', { configs: false, appid: '', save: true });
  fs.writeFileSync(path.join(noConfigs, 'achievement.dat'), Buffer.alloc(8, 0xff));
  assert.ok(!ff7.detect(noConfigs).detected, 'an 8-byte achievement.dat on its own proves nothing');
  assert.strictEqual(ff7.getAchievementsFromFile(noConfigs), null, 'and it is never decoded');

  assert.ok(!ff7.detect('').detected);
  assert.ok(!ff7.detect(path.join(temp, 'absent')).detected);

  const played = makeGameFolder(temp, 'Played', { state: bitfield(37, 61) });
  const state = ff7.getAchievementsFromFile(played);
  assert.strictEqual(state.WON_1ST_BATTLE.Achieved, '1');
  assert.strictEqual(state.END_OF_GAME.Achieved, '1');
  assert.strictEqual(state.GET_MATERIA_KOTR.Achieved, '0');

  const untouched = makeGameFolder(temp, 'Fresh');
  assert.strictEqual(ff7.getAchievementsFromFile(untouched), null, 'a game that never unlocked anything has no file yet');

  const corrupt = makeGameFolder(temp, 'Corrupt', { state: Buffer.alloc(3) });
  assert.strictEqual(ff7.getAchievementsFromFile(corrupt), null, 'a truncated file is reported as unreadable, not as 36 locked achievements');

  // Scanning: the folder itself, or a library root one level above it.
  const direct = ff7.scan(played);
  assert.strictEqual(direct.length, 1, 'the game folder resolves to one game');
  assert.strictEqual(direct[0].appid, '39140');
  assert.strictEqual(direct[0].data.type, 'file', 'unlock state is read through the ordinary file path');
  assert.strictEqual(direct[0].data.path, path.resolve(played));

  const library = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-ff7-lib-'));
  try {
    makeGameFolder(library, 'FINAL FANTASY VII', { state: bitfield(38) });
    const nested = ff7.scan(library);
    assert.strictEqual(nested.length, 1, 'a watched library root containing the game folder resolves too');
    assert.strictEqual(nested[0].appid, '39140');

    const emptyLibrary = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-ff7-none-'));
    try {
      fs.mkdirSync(path.join(emptyLibrary, 'Some Other Game'));
      assert.deepStrictEqual(ff7.scan(emptyLibrary), [], 'a library without the game answers with nothing');
    } finally {
      fs.rmSync(emptyLibrary, { recursive: true, force: true });
    }
  } finally {
    fs.rmSync(library, { recursive: true, force: true });
  }

  console.log('PASS: FINAL FANTASY VII (2013) achievement.dat is decoded only where it belongs');
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
