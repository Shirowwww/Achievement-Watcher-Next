'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { exeHintsFor } = require('../../app/parser/exeHints.js');

function userDataWith(appid, payload) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-hints-'));
  test.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'steam_cache', 'steamdb_launch', `${appid}.json`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof payload === 'string' ? payload : JSON.stringify(payload));
  return dir;
}

test('a Steam game gets its appid and the exe names Steam launches', () => {
  const userData = userDataWith('1245620', { process_name: 'eldenring.exe;start_protected_game.exe;readme.txt', best_process_name: 'eldenring.exe' });
  assert.deepEqual(exeHintsFor({ appid: '1245620', name: 'ELDEN RING' }, userData), {
    steamAppId: '1245620',
    hints: ['eldenring.exe', 'start_protected_game.exe'],
  });
});

test('a remembered miss or a broken cache file gives no names', () => {
  assert.deepEqual(exeHintsFor({ appid: '10' }, userDataWith('10', { miss: true })).hints, []);
  assert.deepEqual(exeHintsFor({ appid: '11' }, userDataWith('11', '{not json')).hints, []);
});

test('a game without a Steam appid gets nothing', () => {
  const userData = userDataWith('1234', { process_name: 'ea.exe' });
  assert.deepEqual(exeHintsFor({ appid: '1234', source: 'ea' }, userData), { steamAppId: '', hints: [] });
  assert.deepEqual(exeHintsFor({ appid: 'local-abc' }, userData), { steamAppId: '', hints: [] });
  assert.deepEqual(exeHintsFor(null, userData), { steamAppId: '', hints: [] });
});
