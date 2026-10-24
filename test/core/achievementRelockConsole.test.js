'use strict';

/*
  Relocking one achievement in the console and port saves. Where the Watchdog has a reader of its own
  (RPCS3, ShadPS4, Xenia) both are checked; KytyPS5, XLiveLessNess, the Xbox 360 ports, MadnessPatch
  and MarkerPatch are read by the Watchdog through the app's own parser, so one reading covers both.
*/

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { makeTempDir } = require('../helpers/tempDir');

const appDir = path.join(__dirname, '..', '..', 'app');
const watchDir = path.join(__dirname, '..', '..', 'watchdog', 'console');
const manualUnlock = require(path.join(appDir, 'parser', 'manualUnlock.js'));
const achievementReset = require(path.join(appDir, 'parser', 'achievementReset.js'));
const relock = require(path.join(appDir, 'parser', 'achievementRelock.js'));
const text = require(path.join(appDir, 'util', 'achievementRelockText.js'));
const binary = require(path.join(appDir, 'util', 'achievementRelockBinary.js'));
const rpcs3 = require(path.join(appDir, 'parser', 'rpcs3.js'));
const shadps4 = require(path.join(appDir, 'parser', 'shadps4.js'));
const xenia = require(path.join(appDir, 'parser', 'xenia.js'));
const kyty = require(path.join(appDir, 'parser', 'kytyps5.js'));
const xlln = require(path.join(appDir, 'parser', 'xlln.js'));
const ff7 = require(path.join(appDir, 'parser', 'ff7.js'));
const madnesspatch = require(path.join(appDir, 'parser', 'madnesspatch.js'));
const markerpatch = require(path.join(appDir, 'parser', 'markerpatch.js'));
const runeUplay = require(path.join(appDir, 'parser', 'runeUplay.js'));
const x360 = require(path.join(appDir, 'parser', 'x360RecompFormats.js'));
const rpcs3Watch = require(path.join(watchDir, 'rpcs3Watch.js'));
const shadps4Watch = require(path.join(watchDir, 'shadps4Watch.js'));
const xeniaWatch = require(path.join(watchDir, 'xeniaWatch.js'));

function tempProfile() {
  const dir = makeTempDir('aw-relock-console-');
  achievementReset.setUserDataPath(dir);
  manualUnlock.setUserDataPath(dir);
  return dir;
}

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return file;
}

function relockGame(game, name) {
  const plan = relock.plan(game, name, { gameRunning: false });
  assert.equal(plan.refusal, null, JSON.stringify(plan.refusal));
  const result = relock.run(plan, { gameRunning: false });
  assert.deepEqual(result.errors, []);
  return { plan, result };
}

function restoreAndCompare(appid, result, files) {
  const restored = achievementReset.restore(appid, result.backupId);
  assert.deepEqual(restored.errors, []);
  for (const [file, bytes] of files) assert.deepEqual(fs.readFileSync(file), bytes, `${path.basename(file)} comes back byte for byte`);
}

// TROPUSR.DAT as RPCS3 writes it: header, table headers, then the type 4 and type 6 tables.
const RTC_TICK_UNIX_EPOCH = 62135596800000000n;
function tropusr(trophies) {
  const count = trophies.length;
  const header = Buffer.alloc(0x30);
  header.writeUInt32BE(0x818f54ad, 0);
  header.writeUInt32BE(0x00010000, 4);
  header.writeUInt32BE(2, 8);
  const tables = Buffer.alloc(0x40);
  const offset4 = 0x70;
  const offset6 = offset4 + count * 0x60;
  [
    [4, 0x50, offset4],
    [6, 0x60, offset6],
  ].forEach(([type, size, offset], index) => {
    tables.writeUInt32BE(type, index * 0x20);
    tables.writeUInt32BE(size, index * 0x20 + 4);
    tables.writeUInt32BE(count, index * 0x20 + 12);
    tables.writeBigUInt64BE(BigInt(offset), index * 0x20 + 16);
  });
  const entries4 = trophies.map((trophy) => {
    const entry = Buffer.alloc(0x60);
    entry.writeUInt32BE(4, 0);
    entry.writeUInt32BE(0x50, 4);
    entry.writeUInt32BE(trophy.id, 8);
    entry.writeUInt32BE(trophy.id, 0x10);
    return entry;
  });
  const entries6 = trophies.map((trophy) => {
    const entry = Buffer.alloc(0x70);
    entry.writeUInt32BE(6, 0);
    entry.writeUInt32BE(0x60, 4);
    entry.writeUInt32BE(trophy.id, 8);
    entry.writeUInt32BE(trophy.id, 0x10);
    if (trophy.time) {
      const tick = BigInt(trophy.time) * 1000000n + RTC_TICK_UNIX_EPOCH;
      entry.writeUInt32BE(1, 0x14);
      entry.writeBigUInt64BE(tick, 0x20);
      entry.writeBigUInt64BE(tick, 0x28);
    }
    return entry;
  });
  return Buffer.concat([header, tables, ...entries4, ...entries6]);
}

const TROPCONF = '<trophyconf><title-name>Demo</title-name><trophy id="000" ttype="B"><name>A</name></trophy><trophy id="001" ttype="B"><name>B</name></trophy><trophy id="002" ttype="B"><name>C</name></trophy></trophyconf>';

test('RPCS3 TROPUSR.DAT: state and both timestamps cleared, as RPCS3 Lock Trophy does', async () => {
  const profile = tempProfile();
  const dir = path.join(profile, 'dev_hdd0', 'home', '00000001', 'trophy', 'NPWR00001_00');
  write(path.join(dir, 'TROPCONF.SFM'), TROPCONF);
  const file = write(path.join(dir, 'TROPUSR.DAT'), tropusr([{ id: 0, time: 0 }, { id: 1, time: 1700000000 }, { id: 2, time: 1700000100 }]));
  const baseline = write(path.join(profile, 'steam_cache', 'console', 'rpcs3-NPWR00001_00.json'), JSON.stringify({ unlocked: [1, 2] }));
  const original = fs.readFileSync(file);
  const before = (await rpcs3.getAchievements(dir)).map((trophy) => [trophy.id, trophy.achieved, trophy.earned_time]);

  const { result } = relockGame({ appid: 'NPWR00001_00', source: 'RPCS3 Emulator', dataPaths: [{ source: 'RPCS3 Emulator', path: dir }] }, '1');
  const app = await rpcs3.getAchievements(dir);
  const watched = rpcs3Watch._internal.read(dir).list;
  assert.equal(app.find((trophy) => trophy.id === 1).achieved, false);
  assert.equal(watched.find((trophy) => trophy.id === 1).achieved, false);
  assert.deepEqual(app.filter((trophy) => trophy.id !== 1).map((trophy) => [trophy.id, trophy.achieved, trophy.earned_time]), before.filter(([id]) => id !== 1));
  assert.equal(watched.find((trophy) => trophy.id === 2).achieved, true);
  assert.equal(fs.readFileSync(file).length, original.length, 'nothing moves');
  assert.deepEqual(JSON.parse(fs.readFileSync(baseline, 'utf8')).unlocked, [2], 'the console baseline forgets the id');
  restoreAndCompare('NPWR00001_00', result, [[file, original]]);
});

test('ShadPS4: the trophy is cleared in every language file, zero-padded ids included', async () => {
  const profile = tempProfile();
  const dir = path.join(profile, 'game_data', 'CUSA00001', 'TrophyFiles', 'trophy00');
  const xml = (lang) => `<trophyconf><title-name>Demo ${lang}</title-name><trophy id="000" ttype="B" unlockstate="true" timestamp="1700000000"><name>A</name></trophy><trophy id="001" ttype="B" unlockstate="true" timestamp="1700000100"><name>B</name></trophy></trophyconf>`;
  const base = write(path.join(dir, 'Xml', 'TROP.XML'), xml('en'));
  const french = write(path.join(dir, 'Xml', 'TROP_01.XML'), xml('fr'));
  const originals = [base, french].map((file) => [file, fs.readFileSync(file)]);

  const { result } = relockGame({ appid: 'CUSA00001', source: 'ShadPS4 Emulator', dataPaths: [{ source: 'ShadPS4 Emulator', path: dir }] }, '0');
  const app = await shadps4.getAchievements(dir);
  assert.equal(app.find((trophy) => trophy.id === 0).achieved, false);
  assert.equal(app.find((trophy) => trophy.id === 1).achieved, true);
  const watched = shadps4Watch._internal.read({ xmlDir: path.join(dir, 'Xml'), iconsDir: path.join(dir, 'Icons') }, 'english').list;
  assert.equal(watched.find((trophy) => Number(trophy.id) === 0).achieved, false);
  assert.equal(watched.find((trophy) => Number(trophy.id) === 1).achieved, true);
  assert.match(fs.readFileSync(french, 'utf8'), /<trophy id="001" ttype="B" unlockstate="true" timestamp="1700000100">/);
  restoreAndCompare('CUSA00001', result, originals);
});

function utf16be(value) {
  return Buffer.concat([Buffer.from(String(value), 'utf16le').swap16(), Buffer.from([0, 0])]);
}

function gpd(achievements) {
  const payloads = achievements.map(({ id, time }) => {
    const head = Buffer.alloc(0x1c);
    head.writeUInt32BE(0x1c, 0);
    head.writeUInt32BE(id, 4);
    head.writeUInt32BE(10, 8);
    head.writeUInt32BE(20, 0x0c);
    head.writeUInt32BE(time ? 0x20000 : 0, 0x10);
    head.writeBigUInt64BE(time ? BigInt(time) * 10000000n + 116444736000000000n : 0n, 0x14);
    return Buffer.concat([head, utf16be(`Name ${id}`), utf16be('Done'), utf16be('Todo')]);
  });
  const header = Buffer.alloc(0x18);
  header.write('XDBF', 0, 'ascii');
  header.writeUInt32BE(0x00010000, 4);
  header.writeUInt32BE(payloads.length, 8);
  header.writeUInt32BE(payloads.length, 12);
  const table = Buffer.alloc(payloads.length * 0x12);
  let offset = 0;
  payloads.forEach((payload, index) => {
    table.writeUInt16BE(1, index * 0x12);
    table.writeBigUInt64BE(BigInt(achievements[index].id), index * 0x12 + 2);
    table.writeUInt32BE(offset, index * 0x12 + 10);
    table.writeUInt32BE(payload.length, index * 0x12 + 14);
    offset += payload.length;
  });
  return Buffer.concat([header, table, ...payloads]);
}

test('Xenia .gpd: the earned flag and time of one id, read back by both readers', async () => {
  const profile = tempProfile();
  const file = write(path.join(profile, 'content', '4D5307E6', '00000001', '4D5307E6.gpd'), gpd([{ id: 1, time: 1700000000 }, { id: 2, time: 1700000100 }]));
  const original = fs.readFileSync(file);
  const { result } = relockGame({ appid: '4D5307E6', source: 'Xenia Emulator', dataPaths: [{ source: 'Xenia Emulator', path: file }] }, '1');
  const app = await xenia.getAchievements(file);
  const unlocked = (list) => list.filter((entry) => entry.achieved || entry.Achieved).map((entry) => String(entry.id ?? entry.name));
  assert.deepEqual(unlocked(app), ['2']);
  assert.deepEqual(unlocked(xeniaWatch._internal.read(file).list), ['2']);
  assert.equal(fs.readFileSync(file).length, original.length);
  restoreAndCompare('4D5307E6', result, [[file, original]]);
});

test('KytyPS5: the id leaves both lists of its own set only, every other tick kept to the digit', () => {
  const profile = tempProfile();
  // Its own launcher settings, so a Kyty installed on this machine does not pick another user.
  write(path.join(profile, 'Kyty.ini'), '[GlobalConfiguration]\nuser_id=1\n');
  const dir = path.join(profile, '_Trophies', 'PPSA00001');
  const base = '{\n  "unlockedTrophies": [3, 4],\n  "unlockedAt": {\n    "3": 638500000000000001,\n    "4": 638500000000000003\n  }\n}\n';
  const dlc = '{"unlockedTrophies":[3],"unlockedAt":{"3":638500000000000005}}';
  const baseFile = write(path.join(dir, 'trophies_1_0.json'), base);
  const dlcFile = write(path.join(dir, 'trophies_1_1.json'), dlc);
  const { result } = relockGame({ appid: 'PPSA00001', source: 'KytyPS5 Emulator', dataPaths: [{ source: 'KytyPS5 Emulator', path: dir }] }, '3');
  const after = fs.readFileSync(baseFile, 'utf8');
  assert.equal(after, '{\n  "unlockedTrophies": [4],\n  "unlockedAt": {\n    "4": 638500000000000003\n  }\n}\n');
  assert.deepEqual([...kyty._internal.parseUnlocks(JSON.parse(after)).keys()], [4]);
  assert.equal(fs.readFileSync(dlcFile, 'utf8'), dlc, 'set 1 holds trophy 1-3, another achievement');
  restoreAndCompare('PPSA00001', result, [[baseFile, Buffer.from(base)]]);
});

test('Xbox 360 ports: toml, tsv, earned list, JSON and ACH-DATA each lose the one id', () => {
  const toml = '[unlocked.5]\ntime = 1700000000\n\n[unlocked.6]\ntime = 1700000100\n';
  assert.deepEqual([...x360.parseToml(text.relockToml(toml, 5).text).keys()], [6]);
  const legacy = 'unlocked = [5, 6]\n';
  assert.equal(text.relockToml(legacy, 5).text, 'unlocked = [6]\n');

  const tsv = 'tag\t4D5307E6\t0009000000000001\n5\t133000000000000000\n6\t133000000000000001\n';
  assert.deepEqual([...x360.parseTsv(text.relockTsv(tsv, 5).text).unlocked.keys()], [6]);

  const earned = '# Achievements earned: id=unix time\r\n5=1700000000\r\n6=1700000100\r\n';
  assert.deepEqual([...x360.parseEarnedIni(text.relockEarnedIni(earned, 5).text).keys()], [6]);

  const json = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(JSON.stringify({ achievements: [{ id: 5, unlocked: true }, { id: 6, unlocked: true }] }), 'utf16le')]);
  const cleared = x360.clearJsonBuffer(json, 5);
  assert.equal(cleared.cleared, 1);
  assert.deepEqual(x360.parseJson(cleared.buffer).filter((entry) => entry.unlocked).map((entry) => entry.id), [6]);

  const records = 50;
  const ach = Buffer.alloc(16 + records * 16);
  ach.write('ACH ', 0, 'latin1');
  [5, 6, 7].forEach((id, index) => {
    ach.writeUInt16LE(id, 16 + index * 16);
    ach.writeBigInt64LE(1700000000n + BigInt(index), 18 + index * 16);
  });
  let checksum = 0;
  for (let at = 16; at < ach.length; at += 1) checksum ^= ach[at];
  ach.writeUInt32LE(checksum, 8);
  const relocked = binary.relockAchData(ach, 6);
  assert.equal(relocked.buffer.length, ach.length);
  assert.deepEqual([...x360.parseUnleashed(relocked.buffer, records).keys()], [5, 7], 'compacted, and the checksum still holds');
});

test('a Hard Corps relock also clears the id the port stores it under', () => {
  const profile = tempProfile();
  const dir = path.join(profile, 'user_data');
  const file = write(path.join(dir, '58410a18.toml'), '[unlocked.65536]\ntime = 1700000000\n\n[unlocked.3]\ntime = 1700000100\n');
  const original = fs.readFileSync(file);
  const { result } = relockGame({ appid: 'x360-58410A18', source: 'Xbox 360 Recomp', dataPaths: [{ source: 'Xbox 360 Recomp', path: dir }] }, '0');
  assert.deepEqual([...x360.parseToml(fs.readFileSync(file, 'utf8')).keys()], [3]);
  restoreAndCompare('x360-58410A18', result, [[file, original]]);
});

test('XLiveLessNess achievements.dat: every record of the id goes', () => {
  const record = (id, low) => {
    const buffer = Buffer.alloc(16);
    buffer.writeUInt32LE(id, 0);
    buffer.writeUInt32LE(low, 4);
    buffer.writeUInt32LE(0x01d9c000, 8);
    return buffer;
  };
  const state = Buffer.concat([record(7, 1), record(8, 2), record(7, 3)]);
  const relocked = binary.relockXlln(state, 7);
  assert.deepEqual([...xlln.parseState(relocked.buffer).keys()], [8]);
  assert.deepEqual(relocked.buffer, record(8, 2));
});

test('FF7 achievement.dat: one bit, most significant first', () => {
  const [bit, name] = Object.entries(require(path.join(appDir, 'assets', 'ff7-achievements.json')))[0];
  const state = Buffer.alloc(8, 0xff);
  const ctx = relock._internal.contextFor({ appid: '39140', source: 'FF7 (2013)' }, name);
  assert.equal(ctx.ff7Bit, Number(bit));
  const parsed = ff7.parseState(binary.relockBit(state, ctx.ff7Bit).buffer);
  assert.equal(parsed[name].Achieved, '0');
  assert.equal(Object.values(parsed).filter((entry) => entry.Achieved === '1').length, Object.keys(parsed).length - 1);
});

test('MadnessPatch UnlockFlag: one bit cleared, UTF-16 kept', () => {
  const source = 'Version = 2\r\nUnlockFlag = 7\r\n';
  const buffer = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(source, 'utf16le')]);
  const relocked = text.editTextBuffer(buffer, (value) => text.relockUnlockFlag(value, 1));
  assert.deepEqual([...relocked.buffer.subarray(0, 2)], [0xff, 0xfe]);
  assert.equal(madnesspatch.parseUnlockFlag(madnesspatch.decodeTextBuffer(relocked.buffer)), 5n);
});

test('MarkerPatch Controls.AcL: the right half, in the notation it was written in', () => {
  const settings = 'Controls.AcL.X = 0x0000000F\nControls.AcL.Y = 3\n';
  assert.equal(markerpatch.parseSettingsFlag(text.relockAcl(settings, 1).text), 0x30000000dn);
  assert.equal(text.relockAcl(settings, 1).text, 'Controls.AcL.X = 0x0000000D\nControls.AcL.Y = 3\n');
  assert.equal(markerpatch.parseSettingsFlag(text.relockAcl(settings, 33).text), 0x10000000fn);
});

test('RUNE Uplay achievements.cfg: earned and time of one id, leading zeros or not', () => {
  const cfg = '"achievements"\n{\n\t"001"\n\t{\n\t\t"earned"\t"1"\n\t\t"time"\t"1700000000"\n\t}\n\t"2"\n\t{\n\t\t"earned"\t"1"\n\t\t"time"\t"1700000100"\n\t}\n}\n';
  const next = text.relockKeyValues(cfg, '1');
  assert.equal(next.text, cfg.replace('"earned"\t"1"', '"earned"\t"0"').replace('"time"\t"1700000000"', '"time"\t"0"'));
  const snapshot = runeUplay.parseAchievementsCfg(next.text).snapshot;
  assert.equal(snapshot['1'].earned, false);
  assert.equal(snapshot['2'].earned, true);
});

test('MadnessPatch profiles found by its reader are relocked and their baseline follows', (t) => {
  const profile = tempProfile();
  const stateFile = write(path.join(profile, 'docs', 'Profile1', 'Achievements.txt'), 'UnlockFlag = 6\n');
  const baseline = write(path.join(profile, 'steam_cache', 'console', 'madnesspatch-Profile1.json'), JSON.stringify({ unlocked: ['MADNESSPATCH_1', 'MADNESSPATCH_2'] }));
  const listProfiles = madnesspatch.listProfiles;
  madnesspatch.listProfiles = () => [{ profile: 'Profile1', file: stateFile, mtimeMs: 0 }];
  t.after(() => {
    madnesspatch.listProfiles = listProfiles;
  });
  const { result } = relockGame({ appid: madnesspatch.APPID, source: 'MadnessPatch', dataPaths: [{ source: 'MadnessPatch', path: path.join(profile, 'game') }] }, 'MADNESSPATCH_1');
  assert.equal(fs.readFileSync(stateFile, 'utf8'), 'UnlockFlag = 4\n');
  assert.deepEqual(JSON.parse(fs.readFileSync(baseline, 'utf8')).unlocked, ['MADNESSPATCH_2']);
  restoreAndCompare(madnesspatch.APPID, result, [[stateFile, Buffer.from('UnlockFlag = 6\n')]]);
});
