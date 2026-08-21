'use strict';

/*
  Steam's local app catalogue (`appcache/appinfo.vdf`) is what lets the scan answer two questions
  offline that previously needed the network - and got them wrong when the network was busy:

  - "is this appid a game?"  The remote bogus list this used to rely on (api.xan105.com) no longer
    resolves, leaving five hardcoded appids as the entire filter. Without a real answer, the
    discovery sources that enumerate what Steam knows locally would fill the library with DLC,
    demos, soundtracks, dedicated servers and redistributables.
  - "what is this game called?"  ISteamApps/GetAppList is retired, so a name depended on a store
    request - the one that is rate-limited exactly when a cleared cache asks for every game at once.
    That is what put bare numeric appids in the library as titles.

  These tests build the binary format by hand so they describe the parser, not the machine.
*/

const { test } = require('node:test');
const assert = require('node:assert/strict');

const appInfo = require('../../app/parser/steamAppInfo.js');

// ---- minimal appinfo.vdf writer (v29: u32 key indexes into a trailing string table) -------------

function buildAppInfo(apps, { magic = 0x07564429 } = {}) {
  const strings = [];
  const indexOf = (value) => {
    const at = strings.indexOf(value);
    if (at !== -1) return at;
    strings.push(value);
    return strings.length - 1;
  };
  const cstr = (value) => Buffer.concat([Buffer.from(String(value), 'utf8'), Buffer.from([0])]);
  const key = (name) => {
    const buf = Buffer.alloc(4);
    buf.writeUInt32LE(indexOf(name));
    return buf;
  };

  const bodies = apps.map(({ appid, name, type, extra = {} }) => {
    const fields = [Buffer.from([0x01]), key('name'), cstr(name), Buffer.from([0x01]), key('type'), cstr(type)];
    for (const [k, v] of Object.entries(extra)) {
      const value = Buffer.alloc(4);
      value.writeInt32LE(v);
      fields.push(Buffer.from([0x02]), key(k), value);
    }
    const common = Buffer.concat([Buffer.from([0x00]), key('common'), ...fields, Buffer.from([0x08])]);
    const kv = Buffer.concat([Buffer.from([0x00]), key('appinfo'), common, Buffer.from([0x08]), Buffer.from([0x08])]);
    const meta = Buffer.alloc(4 + 4 + 8 + 20 + 4 + 20); // infoState, lastUpdated, token, sha1, change, sha1
    const head = Buffer.alloc(8);
    head.writeUInt32LE(appid, 0);
    head.writeUInt32LE(meta.length + kv.length, 4);
    return Buffer.concat([head, meta, kv]);
  });

  const terminator = Buffer.alloc(4); // appid 0
  const header = Buffer.alloc(magic === 0x07564429 ? 16 : 8);
  header.writeUInt32LE(magic, 0);
  header.writeUInt32LE(1, 4); // universe

  const tableCount = Buffer.alloc(4);
  tableCount.writeUInt32LE(strings.length);
  const table = Buffer.concat([tableCount, ...strings.map(cstr)]);
  const body = Buffer.concat([...bodies, terminator]);
  if (magic === 0x07564429) header.writeBigInt64LE(BigInt(header.length + body.length), 8);
  return Buffer.concat([header, body, table]);
}

const CATALOGUE = [
  { appid: 1671210, name: 'DELTARUNE', type: 'Game' },
  { appid: 578080, name: 'PUBG: BATTLEGROUNDS', type: 'game' },
  { appid: 3081410, name: 'Battlefield™ 6 Open Beta', type: 'Beta' },
  { appid: 250820, name: 'SteamVR', type: 'Tool' },
  { appid: 228980, name: 'Steamworks Common Redistributables', type: 'Tool' },
  { appid: 22465, name: 'Fallout New Vegas ClassicPack', type: 'DLC', extra: { parent: 22380 } },
  { appid: 431960, name: 'Wallpaper Engine', type: 'Application' },
  { appid: 241100, name: 'Steam Input Configs', type: 'Config' },
  { appid: 2494960, name: 'Bopl Battle Demo', type: 'Demo' },
];

test('every app record is read back with its name and Steam type', () => {
  const parsed = appInfo.parseAppInfo(buildAppInfo(CATALOGUE));
  assert.equal(parsed.size, CATALOGUE.length);
  assert.deepEqual(
    { ...parsed.get('1671210'), parent: undefined },
    { appid: '1671210', name: 'DELTARUNE', type: 'game', parent: undefined },
    'the type is normalized to lower case so callers never have to guess the casing Steam used'
  );
  assert.equal(parsed.get('22465').name, 'Fallout New Vegas ClassicPack');
  assert.equal(parsed.get('22465').type, 'dlc');
});

test('only the types a player would call a game are library types', () => {
  const parsed = appInfo.parseAppInfo(buildAppInfo(CATALOGUE));
  const included = [...parsed.values()].filter((entry) => appInfo.LIBRARY_TYPES.has(entry.type)).map((entry) => entry.appid);
  assert.deepEqual(included.sort(), ['1671210', '3081410', '578080'].sort(), 'a beta branch IS the game; a demo is not');
  for (const junk of ['250820', '228980', '22465', '431960', '241100', '2494960']) {
    assert.ok(!appInfo.LIBRARY_TYPES.has(parsed.get(junk).type), `${junk} (${parsed.get(junk).type}) must not reach the library`);
  }
});

test('the pre-v29 layout, whose keys are inline strings, is read too', () => {
  const parsed = appInfo.parseAppInfo(buildAppInfoLegacy(CATALOGUE.slice(0, 2)));
  assert.equal(parsed.get('1671210').name, 'DELTARUNE');
  assert.equal(parsed.get('578080').type, 'game');
});

// v27/v28 write the key as a C string in place of the 4-byte table index, and v27 has no second sha1.
function buildAppInfoLegacy(apps) {
  const cstr = (value) => Buffer.concat([Buffer.from(String(value), 'utf8'), Buffer.from([0])]);
  const bodies = apps.map(({ appid, name, type }) => {
    const common = Buffer.concat([
      Buffer.from([0x00]),
      cstr('common'),
      Buffer.from([0x01]),
      cstr('name'),
      cstr(name),
      Buffer.from([0x01]),
      cstr('type'),
      cstr(type),
      Buffer.from([0x08]),
    ]);
    const kv = Buffer.concat([Buffer.from([0x00]), cstr('appinfo'), common, Buffer.from([0x08]), Buffer.from([0x08])]);
    const meta = Buffer.alloc(4 + 4 + 8 + 20 + 4 + 20);
    const head = Buffer.alloc(8);
    head.writeUInt32LE(appid, 0);
    head.writeUInt32LE(meta.length + kv.length, 4);
    return Buffer.concat([head, meta, kv]);
  });
  const header = Buffer.alloc(8);
  header.writeUInt32LE(0x07564428, 0);
  header.writeUInt32LE(1, 4);
  return Buffer.concat([header, ...bodies, Buffer.alloc(4)]);
}

test('a record the parser cannot read costs only that record', () => {
  const buf = buildAppInfo(CATALOGUE);
  // Corrupt the first app's KV payload; its declared size still says where the next record starts.
  buf[8 + 8 + 8 + 4 + 4 + 8 + 20 + 4 + 20] = 0x7f;
  const parsed = appInfo.parseAppInfo(buf);
  assert.ok(parsed.size >= CATALOGUE.length - 1, 'the rest of a 4 MB catalogue must survive one bad entry');
  assert.equal(parsed.get('578080').name, 'PUBG: BATTLEGROUNDS');
});

test('an unrecognised file is refused rather than misread', () => {
  const buf = buildAppInfo(CATALOGUE);
  buf.writeUInt32LE(0x12345678, 0);
  assert.throws(() => appInfo.parseAppInfo(buf), /unknown appinfo magic/);
});

test('an appid the client has never seen is unknown, not "not a game"', () => {
  assert.equal(appInfo.isLibraryGame('C:/nowhere-at-all', 730), null, 'an absent catalogue must never be read as a verdict');
  assert.equal(appInfo.nameOf('C:/nowhere-at-all', 730), '');
  assert.equal(appInfo.typeOf('C:/nowhere-at-all', 730), '');
});
