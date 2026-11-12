'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const captureIndex = require('../../app/util/captureIndex.js');

function sandbox(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-capture-index-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

function put(file, bytes = 'x') {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, bytes);
  return file;
}

test('a recorded screenshot is found for its achievement, and a deleted one is not', async (t) => {
  const root = sandbox(t);
  const userData = path.join(root, 'profile');
  const shot = put(path.join(root, 'Pictures', 'Game', 'First - 2026-11-01 10-00-00.png'));
  const gone = path.join(root, 'Pictures', 'Game', 'First - 2026-11-01 11-00-00.png');
  captureIndex.record(userData, { appid: '440', name: 'ACH_1', kind: 'screenshot', file: shot });
  captureIndex.record(userData, { appid: '440', name: 'ACH_1', kind: 'screenshot', file: gone });

  const found = await captureIndex.findCaptures({ index: captureIndex.readIndex(userData), appid: '440' });

  assert.deepEqual(
    found.ACH_1.map((entry) => [entry.kind, entry.file]),
    [['screenshot', shot]]
  );
});

test('recording the same file twice keeps one entry, and each achievement keeps its 20 newest', (t) => {
  const userData = path.join(sandbox(t), 'profile');
  const file = (n) => path.join(userData, `shot ${n}.png`);
  for (let n = 0; n < 25; n++) captureIndex.record(userData, { appid: '1', name: 'A', kind: 'screenshot', file: file(n) });
  assert.equal(captureIndex.record(userData, { appid: '1', name: 'A', kind: 'screenshot', file: file(24) }), false);

  const list = captureIndex.readIndex(userData).games['1'].A;
  assert.equal(list.length, 20);
  assert.equal(list[0].file, file(24));
});

test('an unlock that joined a clip being recorded points at that clip', async (t) => {
  const root = sandbox(t);
  const userData = path.join(root, 'profile');
  const joined = put(path.join(root, 'Videos', 'Game', 'First - 2026-11-01 10-00-00.mp4'));
  const requested = path.join(root, 'Videos', 'Game', 'Second - 2026-11-01 10-00-03.mp4');
  captureIndex.record(userData, { appid: '440', name: 'ACH_1', kind: 'clip', file: joined });
  captureIndex.record(userData, { appid: '440', name: 'ACH_2', kind: 'clip', file: requested });

  assert.equal(captureIndex.relink(userData, requested, joined), true);
  const found = await captureIndex.findCaptures({ index: captureIndex.readIndex(userData), appid: '440' });

  assert.equal(found.ACH_2[0].file, joined);
  assert.equal(found.ACH_1[0].file, joined);
});

test('an index that cannot be read is never saved back empty', (t) => {
  const userData = path.join(sandbox(t), 'profile');
  fs.mkdirSync(path.join(userData, 'cfg', 'captureIndex.json'), { recursive: true });

  assert.throws(() => captureIndex.record(userData, { appid: '1', name: 'A', kind: 'screenshot', file: path.join(userData, 'a.png') }));
  assert.ok(fs.statSync(path.join(userData, 'cfg', 'captureIndex.json')).isDirectory());
});

test('a record without an achievement, a kind or an absolute path is refused', (t) => {
  const userData = path.join(sandbox(t), 'profile');
  const file = path.join(userData, 'a.png');
  assert.equal(captureIndex.record(userData, { appid: '1', kind: 'screenshot', file }), false);
  assert.equal(captureIndex.record(userData, { appid: '1', name: 'A', kind: 'video', file }), false);
  assert.equal(captureIndex.record(userData, { appid: '1', name: 'A', kind: 'screenshot', file: 'a.png' }), false);
  assert.equal(fs.existsSync(path.join(userData, 'cfg', 'captureIndex.json')), false);
});

test('older captures are found by their name in the game folder of each capture folder', async (t) => {
  const root = sandbox(t);
  const pictures = path.join(root, 'Pictures');
  const videos = path.join(root, 'Videos');
  const shot = put(path.join(pictures, 'Half-Life 2', 'Zombie Chopper - 2026-01-02 03-04-05.png'));
  const again = put(path.join(pictures, 'Half-Life 2', 'Zombie Chopper - 2026-01-02 03-04-05 (2).png'));
  const clip = put(path.join(videos, 'Half-Life 2', 'Zombie Chopper - 2026-01-02 03-04-05.mp4'));
  put(path.join(pictures, 'Half-Life 2', 'Zombie Chopper.png'));
  put(path.join(pictures, 'Half-Life 2', 'Zombie Chopper - 2026-01-02 03-04-05.txt'));
  put(path.join(pictures, 'Half-Life 2', 'Empty - 2026-01-02 03-04-05.png'), '');

  const found = await captureIndex.findCaptures({
    index: null,
    appid: '220',
    gameTitles: ['Half-Life 2'],
    titles: { ZOMBIE: 'Zombie Chopper', EMPTY: 'Empty' },
    dirs: { screenshot: [pictures], clip: [videos] },
  });

  assert.deepEqual(found.ZOMBIE.map((entry) => entry.file).sort(), [shot, again, clip].sort());
  assert.equal(found.EMPTY, undefined);
});

test('captures named date first, as before 3.12.4, are found by their name too', async (t) => {
  const root = sandbox(t);
  const pictures = path.join(root, 'Pictures');
  const shot = put(path.join(pictures, 'ELDEN RING', '2026-10-10 14-17-32 - Leonine Misbegotten.png'));
  const again = put(path.join(pictures, 'ELDEN RING', '2026-10-10 14-17-32 - Leonine Misbegotten (2).png'));

  const found = await captureIndex.findCaptures({
    index: null,
    appid: 'manual-319c6681a318',
    gameTitles: ['ELDEN RING'],
    titles: { LEONINE: 'Leonine Misbegotten' },
    dirs: { screenshot: [pictures] },
  });

  assert.deepEqual(found.LEONINE.map((entry) => entry.file).sort(), [shot, again].sort());
});

test('a title two achievements share, after the name is cleaned, finds nothing by name', async (t) => {
  const root = sandbox(t);
  const pictures = path.join(root, 'Pictures');
  put(path.join(pictures, 'Game', 'Who - 2026-01-02 03-04-05.png'));

  const found = await captureIndex.findCaptures({
    appid: '1',
    gameTitles: ['Game'],
    titles: { A: 'Who?', B: 'Who' },
    dirs: { screenshot: [pictures] },
  });

  assert.deepEqual(Object.keys(found), []);
});

test('a file the index gives to one achievement is not handed to another by its name', async (t) => {
  const root = sandbox(t);
  const userData = path.join(root, 'profile');
  const pictures = path.join(root, 'Pictures');
  const shot = put(path.join(pictures, 'Game', 'Renamed - 2026-01-02 03-04-05.png'));
  captureIndex.record(userData, { appid: '1', name: 'REAL', kind: 'screenshot', file: shot });

  const found = await captureIndex.findCaptures({
    index: captureIndex.readIndex(userData),
    appid: '1',
    gameTitles: ['Game'],
    titles: { REAL: 'Real', OTHER: 'Renamed' },
    dirs: { screenshot: [pictures] },
  });

  assert.deepEqual(Object.keys(found), ['REAL']);
});
