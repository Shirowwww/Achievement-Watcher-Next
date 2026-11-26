'use strict';

/*
  A game built against Steamworks SDK 1.32 to 1.36 needs steam_interfaces.txt under GBE, and once a
  crack replaced Valve's dll the versions are only left in the crack's exports: it has to export the
  flat API of the SDK the game links to. RELOADED's dll on D4: Dark Dreams Don't Die exports 1.33's
  exactly. Only an exact match names a release.
*/

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { makeTempDir } = require('../helpers/tempDir');
const { peWithExports } = require('../helpers/fakePe');

const pe = require('../../app/util/pe.js');
const sdkInterfaces = require('../../app/parser/steamSdkInterfaces.js');
const gbe = require('../../app/parser/gbeInstaller.js');
const TABLE = require('../../app/assets/steam-sdk-interfaces.json');

const FLAT = ['SteamAPI_ISteamUser_GetSteamID', 'SteamAPI_ISteamUserStats_SetAchievement', 'SteamAPI_ISteamApps_BIsSubscribed'];
const TEST_TABLE = { sdks: [{ sdk: ['9.99'], flatApi: sdkInterfaces.flatApiHash(FLAT), interfaces: ['SteamClient017', 'SteamUser018', 'STEAMUSERSTATS_INTERFACE_VERSION011'] }] };

// Valve's unsigned 1.35a dll that SteamVR ships, used only where this PC has it.
const STEAMVR_TUTORIAL_DLL = 'C:/Program Files (x86)/Steam/steamapps/common/SteamVR/tools/steamvr_tutorial/win64/steamvr_tutorial_Data/Plugins/steam_api.dll';

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return file;
}

test('the export names of a dll are read', (t) => {
  const dir = makeTempDir('aw-sdk-exports-');
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const dll = write(path.join(dir, 'steam_api64.dll'), peWithExports(['SteamUser', ...FLAT]));
  assert.deepEqual(pe.readExportNames(dll), [...FLAT, 'SteamUser'].sort());
  assert.deepEqual(pe.readExportNames(write(path.join(dir, 'plain.dll'), 'not a dll')), []);
});

test('only the exact flat API of a release names it', (t) => {
  const dir = makeTempDir('aw-sdk-identify-');
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  // The old exports a crack adds beside the flat API (SteamContentServer...) do not count.
  const exact = write(path.join(dir, 'exact.dll'), peWithExports([...FLAT, 'SteamContentServer', 'SteamUser']));
  assert.deepEqual(sdkInterfaces.identify(exact, TEST_TABLE), { sdk: '9.99', interfaces: TEST_TABLE.sdks[0].interfaces });
  const more = write(path.join(dir, 'more.dll'), peWithExports([...FLAT, 'SteamAPI_ISteamUGC_GetItemDownloadInfo']));
  assert.equal(sdkInterfaces.identify(more, TEST_TABLE), null, 'one more flat call is another release');
  const less = write(path.join(dir, 'less.dll'), peWithExports(FLAT.slice(1)));
  assert.equal(sdkInterfaces.identify(less, TEST_TABLE), null);
  const none = write(path.join(dir, 'old.dll'), peWithExports(['SteamUser', 'SteamAPI_Init']));
  assert.equal(sdkInterfaces.identify(none, TEST_TABLE), null, 'before 1.32 there is no flat API to tell releases apart');
});

test('the bundled table names each flat API once, for SDK 1.32 to 1.36', () => {
  const hashes = TABLE.sdks.map((entry) => entry.flatApi);
  assert.equal(new Set(hashes).size, hashes.length);
  for (const entry of TABLE.sdks) {
    assert.match(entry.flatApi, /^[0-9a-f]{64}$/);
    for (const sdk of entry.sdk) assert.match(sdk, /^1\.3[2-6][a-z]?$/);
    assert.ok(entry.interfaces.some((name) => /^SteamUser\d{3}$/.test(name)), `${entry.sdk} names SteamUser`);
    assert.ok(entry.interfaces.some((name) => /^STEAMUSERSTATS_INTERFACE_VERSION\d{3}$/.test(name)), `${entry.sdk} names the stats interface`);
  }
  assert.ok(TABLE.sdks.some((entry) => entry.sdk.includes('1.33')), 'the release D4 was built with');
});

test("Valve's 1.35a dll installed with SteamVR is named, and its versions are the ones it carries", (t) => {
  const file = STEAMVR_TUTORIAL_DLL;
  if (process.platform !== 'win32' || !fs.existsSync(file)) return t.skip('no SteamVR tutorial here');
  const found = sdkInterfaces.identify(file);
  assert.equal(found && found.sdk, '1.35a');
  const text = fs.readFileSync(file, 'latin1');
  for (const name of found.interfaces) assert.ok(text.includes(`${name}\0`), name);
});

test("with no Valve dll left, steam_interfaces.txt comes from the SDK the crack's exports name", async (t) => {
  const source = STEAMVR_TUTORIAL_DLL;
  if (process.platform !== 'win32' || !fs.existsSync(source)) return t.skip('no SteamVR tutorial here');
  const dir = makeTempDir('aw-sdk-fallback-');
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  // Valve's exports beside a crack's ini: not trusted as the original, still a list of the SDK's calls.
  const dll = path.join(dir, 'steam_api.dll');
  fs.copyFileSync(source, dll);
  write(path.join(dir, 'steam_api.ini'), '[Settings]\r\nAppId=358090\r\n');
  assert.equal(gbe.interfaceSourceFor(dll).file, '');
  const steamSettings = path.join(dir, 'steam_settings');
  const result = await gbe.generateInterfaces({ dllPath: dll, steamSettings, dlls: { tag: 'test', interfaces: {} } });
  assert.equal(result.generated, true);
  assert.equal(result.sdk, '1.35a');
  const lines = fs.readFileSync(path.join(steamSettings, 'steam_interfaces.txt'), 'utf8').trim().split('\n');
  assert.ok(lines.some((line) => /^SteamUser\d{3}$/.test(line)), lines.join(' '));
});
