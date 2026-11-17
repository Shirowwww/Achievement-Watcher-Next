'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const anadiusWatch = require(path.join(__dirname, '..', 'console', 'anadiusWatch.js'));
const anadius = require(path.join(__dirname, '..', '..', 'app', 'parser', 'anadiusNative.js'));
const winHosts = require(path.join(__dirname, '..', '..', 'app', 'util', 'winHosts.js'));

const XML_NAME = 'achievement-50072_198235_50844.xml';
const unlockXml = (grant) =>
  `<Achievements GameName="EA SPORTS FC 24" ContentId="198235">\n<Achievement Id="38" Count="1" Progress="1" Grant="${grant}" Name="European Legend"/>\n</Achievements>\n`;

function setup(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-anadiuswatch-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const nativeDir = path.join(root, 'anadius', 'LSX emu');
  fs.mkdirSync(nativeDir, { recursive: true });
  const mapFile = path.join(root, 'cfg', 'anadiusNames.json');
  fs.mkdirSync(path.dirname(mapFile), { recursive: true });
  fs.writeFileSync(mapFile, JSON.stringify({ [XML_NAME]: { appid: '2195250', gameName: 'EA SPORTS FC 24', names: { 'european legend': 'ACH_EURO' } } }));
  return { nativeDir, mapFile, exportPath: anadius.exportFile(nativeDir, '2195250') };
}

async function waitFor(check, ms = 6000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (check()) return true;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return false;
}

test('a changed LSX file is converted offline from the stored name map', async (t) => {
  const { nativeDir, mapFile, exportPath } = setup(t);
  const xmlPath = path.join(nativeDir, XML_NAME);
  fs.writeFileSync(xmlPath, unlockXml('2023-10-21T17:55:15'));

  await anadiusWatch._internal.handleChange(xmlPath, mapFile);

  assert.match(fs.readFileSync(exportPath, 'utf8'), /\[ACH_EURO\]\nAchieved=1\nUnlockTime=\d+/);
});

test('the running watcher writes the export when the emulator records an unlock', async (t) => {
  const { nativeDir, mapFile, exportPath } = setup(t);
  t.after(() => anadiusWatch.stop());
  const ctx = { options: { achievement_source: {}, achievement: { lang: 'english' } }, notify: async () => {} };

  await anadiusWatch.start(ctx, { nativeDirs: [nativeDir, path.join(nativeDir, 'missing')], mapFile });
  fs.writeFileSync(path.join(nativeDir, XML_NAME), unlockXml('2024-05-06T07:08:09'));
  fs.writeFileSync(path.join(nativeDir, 'unrelated.xml'), '<x/>');

  assert.equal(await waitFor(() => fs.existsSync(exportPath)), true, 'the export must appear');
  assert.match(fs.readFileSync(exportPath, 'utf8'), /^; written by AW Next from achievement-50072_198235_50844\.xml\n/);
});

test('the watcher is off when the emulator-save source is', async (t) => {
  const { nativeDir, mapFile, exportPath } = setup(t);
  t.after(() => anadiusWatch.stop());
  const ctx = { options: { achievement_source: { steamEmu: false }, achievement: { lang: 'english' } }, notify: async () => {} };

  await anadiusWatch.start(ctx, { nativeDirs: [nativeDir], mapFile });
  fs.writeFileSync(path.join(nativeDir, XML_NAME), unlockXml('2024-05-06T07:08:09'));
  await new Promise((resolve) => setTimeout(resolve, 600));

  assert.equal(fs.existsSync(exportPath), false);
});

test('the native folder is looked for on every host, as the library root is', () => {
  const nativeDirs = winHosts.hostPaths('LOCALAPPDATA', 'anadius', 'LSX emu');
  const exportRoots = winHosts.hostPaths('LOCALAPPDATA', 'anadius', 'LSX emu', 'achievement_watcher');

  assert.deepEqual(
    exportRoots,
    nativeDirs.map((dir) => path.join(dir, 'achievement_watcher'))
  );
});
