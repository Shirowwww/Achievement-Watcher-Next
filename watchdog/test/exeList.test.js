'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { configuredExecutable } = require('../util/exeList.js');

test('the configured launch executable is read per appid and follows the file', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-exelist-'));
  const file = path.join(dir, 'exeList.db');
  assert.equal(configuredExecutable('2751000', { file }), '', 'no file yet');

  fs.writeFileSync(
    file,
    JSON.stringify([
      { appid: 2751000, exe: 'D:\\Games\\PoP\\TheLostCrown.exe', args: '' },
      { appid: '480', exe: '', args: '' },
    ])
  );
  assert.equal(configuredExecutable('2751000', { file }), 'D:\\Games\\PoP\\TheLostCrown.exe', 'a numeric appid in the file answers a string lookup');
  assert.equal(configuredExecutable(2751000, { file }), 'D:\\Games\\PoP\\TheLostCrown.exe');
  assert.equal(configuredExecutable('480', { file }), '', 'an empty exe is no path');
  assert.equal(configuredExecutable('', { file }), '');

  const later = new Date(Date.now() + 5000);
  fs.writeFileSync(file, JSON.stringify([{ appid: '2751000', exe: 'E:\\Moved\\TheLostCrown.exe', args: '' }]));
  fs.utimesSync(file, later, later);
  assert.equal(configuredExecutable('2751000', { file }), 'E:\\Moved\\TheLostCrown.exe', 'a rewritten file is re-read');
});
