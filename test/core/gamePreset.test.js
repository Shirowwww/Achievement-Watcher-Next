'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const gamePreset = require('../../app/util/gamePreset.js');

function tempUserData(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-game-preset-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  gamePreset.setUserDataPath(dir);
  return dir;
}

test('a game with no override falls back without creating a settings file', (t) => {
  const userData = tempUserData(t);
  assert.equal(gamePreset.get('10'), '');
  assert.deepEqual(gamePreset.all(), {});
  assert.equal(fs.existsSync(path.join(userData, 'cfg', 'gamePreset.json')), false);
});

test('a per-game override persists and reloads independently from other games', (t) => {
  const userData = tempUserData(t);
  assert.equal(gamePreset.set('10', 'Arcade'), true);
  assert.equal(gamePreset.set('20', 'Glass'), true);
  assert.equal(gamePreset.get('10'), 'Arcade');
  assert.equal(gamePreset.get('20'), 'Glass');

  gamePreset.invalidate();
  assert.equal(gamePreset.get('10'), 'Arcade');
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(userData, 'cfg', 'gamePreset.json'), 'utf8')), {
    10: { preset: 'Arcade' },
    20: { preset: 'Glass' },
  });
});

test('position, sound and scale persist independently and blank fields inherit globally', (t) => {
  const userData = tempUserData(t);
  assert.equal(
    gamePreset.setSettings('10', {
      position: 'top-right',
      sound: 'Steam.wav',
      scale: '1.25',
    }),
    true
  );
  assert.deepEqual(gamePreset.getSettings('10'), {
    position: 'top-right',
    sound: 'Steam.wav',
    scale: 1.25,
  });
  assert.equal(gamePreset.get('10'), '', 'the preset itself still inherits globally');

  gamePreset.invalidate();
  assert.deepEqual(gamePreset.getSettings('10'), {
    position: 'top-right',
    sound: 'Steam.wav',
    scale: 1.25,
  });
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(userData, 'cfg', 'gamePreset.json'), 'utf8')), {
    10: { position: 'top-right', sound: 'Steam.wav', scale: 1.25 },
  });
});

test('custom notification coordinates are isolated to their game and copied defensively', (t) => {
  const userData = tempUserData(t);
  assert.equal(
    gamePreset.setSettings('10', {
      position: 'custom',
      customPosition: { x: -320, y: 1440 },
    }),
    true
  );
  assert.equal(
    gamePreset.setSettings('20', {
      position: 'custom',
      customPosition: { x: 2100, y: 80 },
    }),
    true
  );

  const first = gamePreset.getSettings('10');
  assert.deepEqual(first, { position: 'custom', customPosition: { x: -320, y: 1440 } });
  first.customPosition.x = 999;
  assert.deepEqual(
    gamePreset.getSettings('10'),
    { position: 'custom', customPosition: { x: -320, y: 1440 } },
    'a renderer cannot mutate the cached anchor through the returned object'
  );
  assert.deepEqual(gamePreset.getSettings('20'), {
    position: 'custom',
    customPosition: { x: 2100, y: 80 },
  });

  gamePreset.invalidate();
  assert.deepEqual(gamePreset.getSettings('10'), { position: 'custom', customPosition: { x: -320, y: 1440 } });
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(userData, 'cfg', 'gamePreset.json'), 'utf8'))['10'], {
    position: 'custom',
    customPosition: { x: -320, y: 1440 },
  });
});

test('a custom anchor exists only while that game uses custom position', (t) => {
  tempUserData(t);
  gamePreset.setSettings('10', { position: 'custom', customPosition: { x: 200, y: 300 } });
  gamePreset.setSettings('10', { position: 'top-right', customPosition: { x: 200, y: 300 } });
  assert.deepEqual(gamePreset.getSettings('10'), { position: 'top-right' });

  gamePreset.setSettings('20', { position: 'custom', customPosition: { x: Infinity, y: 50 } });
  assert.deepEqual(gamePreset.getSettings('20'), { position: 'custom' });
});

test('legacy preset-name strings remain readable', (t) => {
  const userData = tempUserData(t);
  const file = path.join(userData, 'cfg', 'gamePreset.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, '{"10":"Arcade"}\n', 'utf8');
  gamePreset.invalidate();
  assert.equal(gamePreset.get('10'), 'Arcade');
  assert.deepEqual(gamePreset.getSettings('10'), { preset: 'Arcade' });
});

test('choosing the global preset removes only that game override', (t) => {
  const userData = tempUserData(t);
  gamePreset.set('10', 'Arcade');
  gamePreset.set('20', 'Glass');
  assert.equal(gamePreset.set('10', ''), true);
  gamePreset.invalidate();
  assert.equal(gamePreset.get('10'), '');
  assert.equal(gamePreset.get('20'), 'Glass');

  assert.equal(gamePreset.set('20', ''), true);
  assert.equal(fs.existsSync(path.join(userData, 'cfg', 'gamePreset.json')), false);
});

test('preset rename and deletion update every stored reference', (t) => {
  tempUserData(t);
  gamePreset.setSettings('10', { preset: 'Arcade', position: 'bottom-left', sound: gamePreset.SOUND_NONE });
  gamePreset.set('20', 'Arcade');
  gamePreset.set('30', 'Glass');

  assert.equal(gamePreset.renamePreset('Arcade', 'Arcade Neon'), true);
  gamePreset.invalidate();
  assert.equal(gamePreset.get('10'), 'Arcade Neon');
  assert.equal(gamePreset.get('20'), 'Arcade Neon');
  assert.equal(gamePreset.get('30'), 'Glass');

  assert.equal(gamePreset.removePreset('Arcade Neon'), true);
  gamePreset.invalidate();
  assert.equal(gamePreset.get('10'), '');
  assert.equal(gamePreset.get('20'), '');
  assert.equal(gamePreset.get('30'), 'Glass');
  assert.deepEqual(gamePreset.getSettings('10'), { position: 'bottom-left', sound: gamePreset.SOUND_NONE });
});

test('invalid display overrides are discarded rather than persisted', (t) => {
  const userData = tempUserData(t);
  assert.equal(gamePreset.setSettings('10', { position: 'sideways', sound: '..\\escape.wav', scale: 9 }), true);
  assert.deepEqual(gamePreset.getSettings('10'), {});
  assert.equal(fs.existsSync(path.join(userData, 'cfg', 'gamePreset.json')), false);
});

test('unreadable legacy content degrades to the global preset', (t) => {
  const userData = tempUserData(t);
  const file = path.join(userData, 'cfg', 'gamePreset.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, '{not json', 'utf8');
  gamePreset.invalidate();
  assert.equal(gamePreset.get('10'), '');
});
