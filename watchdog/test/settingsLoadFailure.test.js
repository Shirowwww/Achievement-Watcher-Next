'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const settings = require('../settings.js');
const ini = require('../util/ini.js');
const fsAsync = require('../util/fsAsync.js');
const replaceFile = require('../util/replaceFile.js');
const debug = require('../util/log.js');

const USER_FILE = ['[achievement]', 'lang = french', 'showHidden = true', '', '[notification]', 'notify = false', ''].join('\n');

function setup(t, contents) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-settings-failure-'));
  const file = path.join(dir, 'options.ini');
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  if (contents !== undefined) fs.writeFileSync(file, contents, 'utf8');
  const errors = [];
  t.mock.method(debug, 'error', (event) => errors.push(String(event)));
  return { dir, file, errors };
}

test('a locked options.ini is left byte for byte as it was', async (t) => {
  const { file, errors } = setup(t, USER_FILE);
  t.mock.method(fsAsync, 'readFile', async () => {
    throw Object.assign(new Error('EBUSY: resource busy or locked'), { code: 'EBUSY' });
  });

  const loaded = await settings.load(file);

  assert.equal(fs.readFileSync(file, 'utf8'), USER_FILE);
  assert.equal(loaded.notification.notify, true, 'the session runs on defaults held in memory');
  assert.equal(errors.length, 1);
  assert.match(errors[0], /EBUSY/);
});

test('an error in the middle of the checks does not rewrite the file', async (t) => {
  const { file, errors } = setup(t, USER_FILE);
  const parse = ini.parse;
  t.mock.method(ini, 'parse', (text) => {
    const options = parse(text);
    options.action = {
      get target() {
        throw new TypeError('boom');
      },
    };
    return options;
  });

  const loaded = await settings.load(file);

  assert.equal(fs.readFileSync(file, 'utf8'), USER_FILE);
  assert.equal(loaded.action.target, '');
  assert.equal(errors.length, 1);
  assert.match(errors[0], /boom/);
});

test('a missing options.ini still receives the defaults', async (t) => {
  const { file, errors } = setup(t);

  const loaded = await settings.load(file);

  assert.equal(ini.parse(fs.readFileSync(file, 'utf8')).notification.notify, true);
  assert.equal(loaded.notification.notify, true);
  assert.equal(errors.length, 0, 'a first start is not an error');
});

test('a repair that cannot be written keeps the user settings and reports it', async (t) => {
  const { file, errors } = setup(t, USER_FILE);
  t.mock.method(replaceFile, 'writeFileAtomicSync', () => {
    throw Object.assign(new Error('EPERM: operation not permitted'), { code: 'EPERM' });
  });

  const loaded = await settings.load(file);

  assert.equal(loaded.achievement.lang, 'french');
  assert.equal(loaded.notification.notify, false);
  assert.equal(fs.readFileSync(file, 'utf8'), USER_FILE);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /EPERM/);
});

test('the repair goes through the atomic replace', async (t) => {
  const { file, dir } = setup(t, USER_FILE);
  const real = replaceFile.writeFileAtomicSync;
  const writes = [];
  t.mock.method(replaceFile, 'writeFileAtomicSync', (target, data) => {
    writes.push(target);
    return real(target, data);
  });

  await settings.load(file);

  assert.deepEqual(writes, [file]);
  assert.deepEqual(fs.readdirSync(dir), ['options.ini'], 'no temporary file is left behind');
});
