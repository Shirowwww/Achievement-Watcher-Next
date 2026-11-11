'use strict';

/*
  Where a souvenir screenshot is written. Both halves fail silently when they are wrong - a name
  Windows refuses loses the screenshot, and a colliding name replaces one that already exists -
  so the rules are pinned here rather than left to the next unlock to discover.
*/

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { _sanitize: sanitize, _uniquePath: uniquePath, _localStamp: localStamp, souvenirPath } = require('../notification/souvenir.js');

// The date reads like the PC's clock: a player in UTC+9 saw names nine hours off (issue #155).
test('the date in a souvenir name is local time, not UTC', (t) => {
  const previous = process.env.TZ;
  process.env.TZ = 'Asia/Tokyo';
  t.after(() => {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  });

  assert.equal(localStamp(new Date('2026-06-23T14:10:05.678Z')), '2026-06-23 23-10-05');
});

// Achievement first, so a folder sorted by name groups the shots of one achievement; the date stays
// in the name for sorting by unlock time (a user request, forum post of 2026-10-26).
test('a souvenir is named after its achievement, then its date', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-souvenir-name-'));
  try {
    const file = souvenirPath({ game: 'Disgaea Mayhem', achievement: 'Ultimate Life Form', dir });
    assert.equal(path.dirname(file), path.join(dir, 'Disgaea Mayhem'));
    assert.match(path.basename(file), /^Ultimate Life Form - \d{4}-\d{2}-\d{2} \d{2}-\d{2}-\d{2}\.png$/);
    assert.match(path.basename(souvenirPath({ game: 'G', achievement: 'A', dir }, '.mp4')), /^A - .+\.mp4$/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// Shots stay where every version saved them, under <home>/Pictures, even when OneDrive has moved
// the system Pictures folder: the user asked for that (2026-11-06).
test('without a folder of its own, a souvenir goes under <home>/Pictures', (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-souvenir-home-'));
  const saved = { USERPROFILE: process.env.USERPROFILE, HOME: process.env.HOME };
  process.env.USERPROFILE = home;
  process.env.HOME = home;
  t.after(() => {
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    fs.rmSync(home, { recursive: true, force: true });
  });

  const file = souvenirPath({ game: 'G', achievement: 'A', dir: '' });
  assert.equal(path.dirname(file), path.join(home, 'Pictures', 'Achievement Watcher Next', 'G'));
});

test('names Windows would refuse are made safe instead of lost', () => {
  // Reserved device names are rejected whatever the extension.
  for (const reserved of ['NUL', 'CON', 'PRN', 'AUX', 'COM1', 'LPT9', 'nul', 'Com1']) {
    assert.equal(sanitize(reserved), reserved + '_', reserved);
  }
  // ...but only on their own: a title that merely contains one is fine.
  assert.equal(sanitize('NULL'), 'NULL');
  assert.equal(sanitize('CONTROL'), 'CONTROL');

  // Windows drops trailing dots and spaces from the name it creates.
  assert.equal(sanitize('Sam & Max '), 'Sam & Max');
  assert.equal(sanitize('Mr. Do.'), 'Mr. Do');
  assert.equal(sanitize('...'), 'Unknown');

  // Illegal characters, and control characters, go.
  assert.equal(sanitize('Assassin\'s Creed: Black Flag'), 'Assassin\'s Creed Black Flag');
  assert.equal(sanitize('a/b\\c<d>e|f?g*h"i'), 'abcdefghi');
  assert.equal(sanitize('game' + String.fromCharCode(7) + ' title' + String.fromCharCode(31)), 'game title');

  // Legal punctuation is kept - the point is to stay recognizable, not to strip everything.
  assert.equal(sanitize('Mr. Do!'), 'Mr. Do!');
  assert.equal(sanitize('The Last of Us™ Part II Remastered'), 'The Last of Us™ Part II Remastered');

  // Nothing usable left, or nothing given.
  for (const empty of ['', '   ', null, undefined, '<<<>>>']) assert.equal(sanitize(empty), 'Unknown');

  // Long titles stay within the path budget.
  assert.equal(sanitize('x'.repeat(400)).length, 100);
});

test('a second unlock in the same second does not replace the first', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-souvenir-'));
  try {
    const base = 'Arsenal - 2026-08-15 22-04-11';

    const first = uniquePath(dir, base);
    assert.equal(path.basename(first), base + '.png');
    fs.writeFileSync(first, 'first');

    const second = uniquePath(dir, base);
    assert.equal(path.basename(second), base + ' (2).png');
    fs.writeFileSync(second, 'second');

    assert.equal(path.basename(uniquePath(dir, base)), base + ' (3).png');
    // The earlier shots are still there, untouched.
    assert.equal(fs.readFileSync(first, 'utf8'), 'first');
    assert.equal(fs.readFileSync(second, 'utf8'), 'second');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// A clip exists only once the recorder writes it, so its folder is left to the recorder: a capture
// with no frames used to leave an empty game folder behind (Discord report, 2026-11-11).
test('a clip path does not create its folder, a screenshot path does', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-souvenir-folder-'));
  try {
    const clip = souvenirPath({ game: 'Brothers', achievement: 'Wishing Well', dir }, '.mp4', { create: false });
    assert.equal(path.dirname(clip), path.join(dir, 'Brothers'));
    assert.equal(fs.existsSync(path.dirname(clip)), false);

    const shot = souvenirPath({ game: 'Brothers', achievement: 'Wishing Well', dir });
    assert.equal(fs.existsSync(path.dirname(shot)), true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('the clip trigger asks for a path without creating its folder', () => {
  const clip = fs.readFileSync(path.join(__dirname, '..', 'notification', 'clip.js'), 'utf8');
  assert.match(clip, /souvenirPath\(\{ game, achievement, dir: clipFolder\(dir\) \}, recorder\.ext, \{ create: false \}\)/);
});
