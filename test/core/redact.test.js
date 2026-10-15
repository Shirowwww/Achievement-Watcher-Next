'use strict';

const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { redactText, localUsernames } = require('../../app/util/redact.js');

test('masking leaves ordinary diagnostics readable', () => {
  const line = '[t INFO] Unlocked: ACH_WIN_ONE_GAME (appid 480) in C:\\Games\\Spacewar\\steam_settings, hash d41d8cd98f00b204e9800998ecf8427e';
  assert.equal(redactText(line, { usernames: ['Jane'] }), line);
});

// The Game Health report is copied as JSON, where every backslash is doubled.
test('paths inside a JSON report are masked too', () => {
  const report = JSON.stringify({ saveSource: 'C:\\Users\\jdoe\\AppData\\Roaming\\GSE Saves\\480', gameDir: 'D:\\jdoe\\Games\\Spacewar' }, null, 2);
  const masked = redactText(report, { usernames: ['jdoe'] });
  assert.ok(!masked.includes('jdoe'), masked);
  assert.deepEqual(JSON.parse(masked), {
    saveSource: 'C:\\Users\\[username]\\AppData\\Roaming\\GSE Saves\\480',
    gameDir: 'D:\\[username]\\Games\\Spacewar',
  });
});

test('Linux and Wine profile paths are masked, shared folders and the Proton account are not', () => {
  const text = '/home/jdoe/.steam/steam and /home/jdoe/Games/prefix/drive_c/users/steamuser/AppData and C:/Users/Public/Documents/Steam/RUNE';
  assert.equal(
    redactText(text, { usernames: ['jdoe'] }),
    '/home/[username]/.steam/steam and /home/[username]/Games/prefix/drive_c/users/steamuser/AppData and C:/Users/Public/Documents/Steam/RUNE'
  );
});

test('another profile with a space in its name is masked whole, and prose after a path is kept', () => {
  assert.equal(
    redactText('C:/Users/Bob Smith/Documents and C:\\Users\\bob is missing, /home/ann or /tmp', { usernames: [] }),
    'C:/Users/[username]/Documents and C:\\Users\\[username] is missing, /home/[username] or /tmp'
  );
});

test('a name too short to be told apart from other text is left to the path rule', () => {
  assert.equal(redactText('D:\\a\\b and C:\\Users\\a\\x', { usernames: ['a'] }), 'D:\\a\\b and C:\\Users\\[username]\\x');
});

test('the local names are the login name and the profile folder', () => {
  const names = localUsernames();
  assert.equal(names.length, 2);
  assert.equal(names[1], path.basename(os.homedir()));
});
