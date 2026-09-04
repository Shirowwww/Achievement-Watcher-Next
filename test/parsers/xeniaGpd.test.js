'use strict';

// Binary GPD/XDBF parsing, exercised on hand-built files: the achievement struct layout is the one
// thing in the Xenia reader that cannot be checked by looking at a folder tree.

const test = require('node:test');
const assert = require('node:assert/strict');
const xenia = require('../../app/parser/xenia.js');

const { parseGpdBuffer, validAchievements } = xenia._internal;

const XDBF_HEADER_SIZE = 0x18;
const ENTRY_SIZE = 0x12;
const STRUCT_SIZE = 0x1c;

function utf16be(text) {
  const body = Buffer.from(String(text), 'utf16le');
  for (let i = 0; i + 1 < body.length; i += 2) {
    const tmp = body[i];
    body[i] = body[i + 1];
    body[i + 1] = tmp;
  }
  return Buffer.concat([body, Buffer.from([0, 0])]);
}

function achievementPayload({
  achievementId = 1,
  imageId = 10,
  gamerscore = 20,
  flags = 0x20000,
  unlockRaw = 0n,
  name = 'Name',
  unlockedDescription = 'Unlocked',
  lockedDescription = 'Locked',
  structSize = STRUCT_SIZE,
} = {}) {
  const head = Buffer.alloc(STRUCT_SIZE);
  head.writeUInt32BE(structSize, 0x00);
  head.writeUInt32BE(achievementId, 0x04);
  head.writeUInt32BE(imageId, 0x08);
  head.writeUInt32BE(gamerscore, 0x0c);
  head.writeUInt32BE(flags, 0x10);
  head.writeBigUInt64BE(BigInt(unlockRaw), 0x14);
  return Buffer.concat([head, utf16be(name), utf16be(unlockedDescription), utf16be(lockedDescription)]);
}

// entries: [{ namespace, id, payload }]
function buildGpd(entries) {
  const header = Buffer.alloc(XDBF_HEADER_SIZE);
  header.write('XDBF', 0, 'ascii');
  header.writeUInt32BE(0x00010000, 0x04);
  header.writeUInt32BE(entries.length, 0x08);
  header.writeUInt32BE(entries.length, 0x0c);
  header.writeUInt32BE(0, 0x10);
  header.writeUInt32BE(0, 0x14);

  const table = Buffer.alloc(entries.length * ENTRY_SIZE);
  const payloads = [];
  let offset = 0;
  entries.forEach((entry, index) => {
    const base = index * ENTRY_SIZE;
    table.writeUInt16BE(entry.namespace, base);
    table.writeBigUInt64BE(BigInt(entry.id), base + 2);
    table.writeUInt32BE(offset, base + 10);
    table.writeUInt32BE(entry.payload.length, base + 14);
    payloads.push(entry.payload);
    offset += entry.payload.length;
  });

  return Buffer.concat([header, table, ...payloads]);
}

const asAchievement = (id, overrides = {}) => ({
  namespace: 1,
  id,
  payload: achievementPayload({ achievementId: id, ...overrides }),
});

test('the three payload strings are read as label, unlocked description, locked description', () => {
  const parsed = parseGpdBuffer(
    buildGpd([asAchievement(7, { name: 'First blood', unlockedDescription: 'You did it', lockedDescription: 'Do it' })]),
    'x.gpd'
  );
  const [achievement] = validAchievements(parsed);
  assert.equal(achievement.name, 'First blood');
  assert.equal(achievement.unlockedDescription, 'You did it');
  assert.equal(achievement.lockedDescription, 'Do it');
});

test('an achievement with no locked description is kept, not silently dropped', () => {
  const parsed = parseGpdBuffer(buildGpd([asAchievement(7, { lockedDescription: '' })]), 'x.gpd');
  assert.equal(validAchievements(parsed).length, 1);
});

test('a zero gamerscore and an unearned achievement are both valid', () => {
  const parsed = parseGpdBuffer(buildGpd([asAchievement(7, { gamerscore: 0, flags: 0 })]), 'x.gpd');
  const [achievement] = validAchievements(parsed);
  assert.equal(achievement.gamerscore, 0);
  assert.equal(achievement.flags, 0);
});

test('the sync entries sharing the achievement namespace are not read as achievements', () => {
  const parsed = parseGpdBuffer(
    buildGpd([
      { namespace: 1, id: '4294967296', payload: Buffer.alloc(64, 0x41) },
      { namespace: 1, id: '8589934592', payload: Buffer.alloc(64, 0x42) },
      asAchievement(7),
    ]),
    'x.gpd'
  );
  assert.deepEqual(
    validAchievements(parsed).map((a) => a.achievementId),
    [7]
  );
});

test('a struct whose header or entry id does not line up is rejected rather than half-read', () => {
  const wrongStructSize = parseGpdBuffer(buildGpd([asAchievement(7, { structSize: 0x30 })]), 'x.gpd');
  assert.equal(validAchievements(wrongStructSize).length, 0);

  const mismatchedEntryId = parseGpdBuffer(
    buildGpd([{ namespace: 1, id: 99, payload: achievementPayload({ achievementId: 7 }) }]),
    'x.gpd'
  );
  assert.equal(validAchievements(mismatchedEntryId).length, 0);
});

test('a payload truncated mid-string is rejected because its strings never terminate', () => {
  const full = achievementPayload({ achievementId: 7, name: 'A long achievement label' });
  const parsed = parseGpdBuffer(
    buildGpd([{ namespace: 1, id: 7, payload: full.slice(0, STRUCT_SIZE + 8) }]),
    'x.gpd'
  );
  assert.equal(validAchievements(parsed).length, 0);
});

test('relocking clears the earned flag and the timestamp of real entries only', () => {
  const syncPayload = Buffer.alloc(64, 0x41);
  const gpd = buildGpd([
    { namespace: 1, id: '4294967296', payload: syncPayload },
    asAchievement(7, { unlockRaw: 133000000000000000n }),
  ]);
  const { buffer, cleared } = xenia.clearGpdBuffer(gpd);
  assert.equal(cleared, 1);
  assert.equal(buffer.includes(syncPayload), true, 'the sync entry must be left byte for byte alone');

  const relocked = validAchievements(parseGpdBuffer(buffer, 'x.gpd'));
  assert.equal(relocked.length, 1);
  assert.equal(relocked[0].flags & xenia._internal.ACHIEVEMENT_EARNED_FLAG, 0);
  assert.equal(relocked[0].unlockRaw, 0n);
});
