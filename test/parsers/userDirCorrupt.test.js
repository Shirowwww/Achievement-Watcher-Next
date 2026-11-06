'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const userDir = require('../../app/parser/userDir.js');

const BROKEN = '[{"path": "D:\\\\Games", "enabled": tr';

async function setup(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-userdir-corrupt-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'cfg', 'userdir.db');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, BROKEN, 'utf8');
  t.mock.method(console, 'warn', () => {});
  await userDir.setUserDataPath(dir);
  return file;
}

test('a corrupt folder list is moved aside and replaced by an empty one', async (t) => {
  const file = await setup(t);

  assert.deepEqual(await userDir.getEntries(), []);

  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), []);
  const kept = fs.readdirSync(path.dirname(file)).filter((name) => name.startsWith('userdir.db.corrupt-'));
  assert.equal(kept.length, 1);
  assert.equal(fs.readFileSync(path.join(path.dirname(file), kept[0]), 'utf8'), BROKEN);
});

test('a corrupt folder list that cannot be moved aside is left as it was', async (t) => {
  const file = await setup(t);
  t.mock.method(fs, 'renameSync', () => {
    throw Object.assign(new Error('EPERM: operation not permitted'), { code: 'EPERM' });
  });

  assert.deepEqual(await userDir.getEntries(), []);

  assert.equal(fs.readFileSync(file, 'utf8'), BROKEN, 'the only copy of the folder list was destroyed');
});
