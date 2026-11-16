'use strict';

// Ctrl+Shift+K under RPCS3: the game it is running, read from RPCS3.log, not the first library game.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const rpcs3Current = require('../console/rpcs3Current.js');
const { createOverlayTarget } = require('../util/overlayTarget.js');

function rpcs3Install(t, logText, trophySets) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-rpcs3-current-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dir, 'rpcs3.exe'), '');
  // Where current builds write it on Windows; Linux reads the cache folder instead.
  fs.mkdirSync(path.join(dir, 'log'));
  fs.writeFileSync(path.join(dir, 'log', 'RPCS3.log'), logText);
  const targets = Object.entries(trophySets).map(([appid, title]) => {
    const trophyDir = path.join(dir, 'dev_hdd0', 'home', '00000001', 'trophy', appid);
    fs.mkdirSync(trophyDir, { recursive: true });
    fs.writeFileSync(path.join(trophyDir, 'TROPCONF.SFM'), `<trophyconf><npcommid>${appid}</npcommid><title-name>${title}</title-name></trophyconf>`);
    return { appid, trophyDir };
  });
  return { dir, targets };
}

// Verbatim lines from public RPCS3 issues (sources in the file): Skate 3 boots, a game stops, then
// SONIC UNLEASHED boots.
const LOG = fs.readFileSync(path.join(__dirname, 'fixtures', 'rpcs3-log-real.txt'), 'utf8');
const VSH_LOG = fs.readFileSync(path.join(__dirname, 'fixtures', 'rpcs3-log-vsh.txt'), 'utf8');
const UNTIL_STOP = LOG.slice(0, LOG.indexOf('# RPCS3/rpcs3#8667'));

const running = () => [{ process: 'explorer.exe' }, { process: 'rpcs3.exe' }];

test('the last game RPCS3 booted is the one the overlay opens', (t) => {
  const { dir, targets } = rpcs3Install(t, LOG, { NPWR00760_00: 'Skate 3', NPWR00425_00: 'SONIC UNLEASHED' });
  const appid = rpcs3Current.currentGame({ processes: running, emulatorDirs: () => [dir], targets: () => targets, env: {}, platform: 'win32' });
  assert.equal(appid, 'NPWR00425_00');
});

test('a game RPCS3 stopped is no longer the target, even with RPCS3 still open', () => {
  assert.equal(rpcs3Current.titleFromLog(LOG), 'SONIC UNLEASHED');
  assert.equal(rpcs3Current.titleFromLog(UNTIL_STOP.slice(0, UNTIL_STOP.indexOf('# RPCS3/rpcs3#17147'))), 'Skate 3');
  assert.equal(rpcs3Current.titleFromLog(UNTIL_STOP), '');
});

test('the system menu (vsh.self) matches no trophy set', (t) => {
  const { dir, targets } = rpcs3Install(t, VSH_LOG, { NPWR00760_00: 'Skate 3' });
  assert.equal(rpcs3Current.titleFromLog(VSH_LOG), 'vsh.self');
  assert.equal(rpcs3Current.currentGame({ processes: running, emulatorDirs: () => [dir], targets: () => targets, env: {}, platform: 'win32' }), '');
});

test('RPCS3 not running answers nothing, so a closed emulator never steers the overlay', (t) => {
  const { dir, targets } = rpcs3Install(t, LOG, { NPWR00425_00: 'SONIC UNLEASHED' });
  assert.equal(rpcs3Current.currentGame({ processes: () => [{ process: 'explorer.exe' }], emulatorDirs: () => [dir], targets: () => targets, env: {}, platform: 'win32' }), '');
});

test('a title two trophy sets share is no answer', (t) => {
  const { dir, targets } = rpcs3Install(t, LOG, { NPWR00425_00: 'Sonic Unleashed', NPWR09999_00: 'SONIC UNLEASHED' });
  assert.equal(rpcs3Current.currentGame({ processes: running, emulatorDirs: () => [dir], targets: () => targets, env: {}, platform: 'win32' }), '');
});

test('titles match whatever their punctuation and case, and an entity in TROPCONF is decoded', () => {
  const targets = [{ appid: 'NPWR00245_00', trophyDir: 'x' }];
  assert.equal(rpcs3Current.matchTrophySet("DEMON'S SOULS", targets, () => "Demon's Souls"), 'NPWR00245_00');
  assert.equal(rpcs3Current.titleFromLog('nothing booted yet'), '');
});

test('on Windows the log is looked for where RPCS3 writes it: log/ under portable/, RPCS3_CONFIG_DIR, the exe folder', () => {
  const files = rpcs3Current.logCandidates(['C:/RPCS3'], { env: { RPCS3_CONFIG_DIR: 'D:/cfg' }, platform: 'win32' });
  assert.deepEqual(files.filter((file) => file.endsWith(path.join('log', 'RPCS3.log'))), [
    path.join('C:/RPCS3', 'portable', 'log', 'RPCS3.log'),
    path.join('D:/cfg', 'log', 'RPCS3.log'),
    path.join('C:/RPCS3', 'log', 'RPCS3.log'),
  ]);
});

test('on Linux the log is in the cache folder, XDG_CONFIG_HOME standing in for a missing XDG_CACHE_HOME', () => {
  assert.deepEqual(rpcs3Current.logCandidates([], { env: { XDG_CACHE_HOME: '/c' }, home: '/home/me', platform: 'linux' }), [path.join('/c', 'rpcs3', 'RPCS3.log')]);
  assert.deepEqual(rpcs3Current.logCandidates([], { env: { XDG_CONFIG_HOME: '/x' }, home: '/home/me', platform: 'linux' }), [path.join('/x', 'rpcs3', 'RPCS3.log')]);
  assert.deepEqual(rpcs3Current.logCandidates([], { env: {}, home: '/home/me', platform: 'linux' }), [path.join('/home/me', '.cache', 'rpcs3', 'RPCS3.log')]);
});

test('the overlay asks the running emulator game before the last unlock', () => {
  const target = createOverlayTarget({ emulatorGame: () => 'NPWR02249_00' });
  target.noteLiveUnlock({ appid: 'NPWR00245_00' }, 1000);
  assert.equal(target.appidFor(null, 2000), 'NPWR02249_00');
  assert.equal(target.appidFor('1133320', 2000), '1133320');
});

test('a failing emulator lookup falls back to the last unlock', () => {
  const target = createOverlayTarget({
    emulatorGame: () => {
      throw new Error('boom');
    },
  });
  target.noteLiveUnlock({ appid: 'NPWR00245_00' }, 1000);
  assert.equal(target.appidFor(null, 2000), 'NPWR00245_00');
});
