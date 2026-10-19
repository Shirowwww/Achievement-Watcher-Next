'use strict';

// Launcher scripts beside a recompiled game can move its save folder. Only literal forms are read;
// nothing is run or evaluated, and a computed value is never guessed. Scripts here are synthetic.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { declaredUserRoot } = require('../../app/parser/x360Launcher.js');

function gameDir(t, scripts) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-x360launch-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dir, 'downpour.exe'), 'MZ');
  for (const [name, text] of Object.entries(scripts)) fs.writeFileSync(path.join(dir, name), text);
  return dir;
}

const EXES = ['downpour.exe'];
const ENV = { USERPROFILE: path.join(os.tmpdir(), 'profile-x') };

test('a batch launcher passing a literal save root beside the script is followed', (t) => {
  const dir = gameDir(t, { 'play.bat': '@echo off\r\nrem portable saves\r\n"%~dp0downpour.exe" --user_data_root "%~dp0profile"\r\n' });
  assert.deepEqual(declaredUserRoot(dir, EXES, { env: ENV }), { root: path.join(dir, 'profile') });
});

test('set, cd and start /D are followed literally, and the = form of the flag is read', (t) => {
  const saves = path.join(os.tmpdir(), 'aw-saves');
  const dir = gameDir(t, {
    'a.cmd': `set "ROOT=${saves}"\r\ncd /d "%~dp0"\r\ndownpour.exe --user_data_root="%ROOT%\\sh"\r\n`,
    'b.bat': `set ROOT=${saves}\r\nstart "" /D "%~dp0" downpour.exe --user-data-root "%ROOT%\\sh"\r\n`,
  });
  assert.deepEqual(declaredUserRoot(dir, EXES, { env: ENV }), { root: path.join(saves, 'sh') });
});

test('a launcher pointing the save folder at another computer is not followed', { skip: process.platform !== 'win32' && 'network paths are a Windows form' }, (t) => {
  // Opening \\server\share sends the Windows login to that server: a repack must not trigger it.
  const dir = gameDir(t, { 'play.bat': '"%~dp0downpour.exe" --user_data_root \\\\attacker.invalid\\share\\x\r\n' });
  const declared = declaredUserRoot(dir, EXES, { env: ENV });
  assert.equal(declared && declared.root, undefined);
});

test('a PowerShell launcher using its own folder is read, and a host variable expands', (t) => {
  const dir = gameDir(t, { 'run.ps1': '& "$PSScriptRoot\\downpour.exe" --user_data_root "$env:USERPROFILE\\DP"\n' });
  assert.deepEqual(declaredUserRoot(dir, EXES, { env: ENV }), { root: path.join(ENV.USERPROFILE, 'DP') });
});

test('computed values, control flow and other programs are never guessed from', (t) => {
  const dir = gameDir(t, {
    'random.bat': '"%~dp0downpour.exe" --user_data_root "%RANDOM%"\r\n',
    'delayed.bat': 'setlocal enabledelayedexpansion\r\ndownpour.exe --user_data_root !X!\r\n',
    'branch.bat': 'if exist x goto a\r\ndownpour.exe --user_data_root "C:\\A"\r\n',
    'other.bat': 'other.exe --user_data_root "C:\\B"\r\n',
    'pipe.bat': 'downpour.exe --user_data_root "C:\\C" | more\r\n',
    'ps.ps1': '$d = Get-Date\n& "$PSScriptRoot\\downpour.exe" --user_data_root "$d"\n',
  });
  const found = declaredUserRoot(dir, EXES, { env: ENV });
  assert.equal(found.root, undefined);
  assert.equal(found.computed, true, 'a computed root is reported, not followed');
});

test('a computed root in one launcher outweighs a literal one in another', (t) => {
  const dir = gameDir(t, {
    'one.bat': '"%~dp0downpour.exe" --user_data_root "%~dp0a"\r\n',
    'two.bat': '"%~dp0downpour.exe" --user_data_root "%SAVES%"\r\n',
  });
  assert.deepEqual(declaredUserRoot(dir, EXES, { env: ENV }), { computed: true });
});

test('two launchers naming different roots are ambiguous; none at all is null', (t) => {
  const dir = gameDir(t, {
    'one.bat': '"%~dp0downpour.exe" --user_data_root "%~dp0a"\r\n',
    'two.bat': '"%~dp0downpour.exe" --user_data_root "%~dp0b"\r\n',
  });
  assert.deepEqual(declaredUserRoot(dir, EXES, { env: ENV }), { ambiguous: true });
  assert.equal(declaredUserRoot(gameDir(t, { 'notes.bat': 'echo hello\r\n' }), EXES, { env: ENV }), null);
});

test('an executable started from another folder is not this install', (t) => {
  const dir = gameDir(t, { 'play.bat': 'cd /d "%~dp0bin"\r\ndownpour.exe --user_data_root "C:\\Elsewhere"\r\n' });
  assert.equal(declaredUserRoot(dir, EXES, { env: ENV }), null);
});
