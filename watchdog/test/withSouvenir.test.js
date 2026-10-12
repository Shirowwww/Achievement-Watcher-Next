'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { withSouvenir } = require('../notification/withSouvenir.js');

function recorder() {
  const calls = [];
  const notify = async (message, option) => {
    calls.push({ message, option });
  };
  return { calls, notify };
}

test('a watcher that passes no souvenir gets the live souvenir settings', async () => {
  const { calls, notify } = recorder();
  const options = { souvenir: { screenshot: true, dir: 'D:\\Shots' } };
  const wrapped = withSouvenir(notify, () => options);

  await wrapped({ appid: '58410888' }, { notify: true, toast: { group: false } });

  assert.deepEqual(calls[0].option, { notify: true, toast: { group: false }, souvenir: options.souvenir });
});

test('settings reloaded after start are the ones used', async () => {
  const { calls, notify } = recorder();
  let options = { souvenir: { screenshot: false } };
  const wrapped = withSouvenir(notify, () => options);

  options = { souvenir: { screenshot: true } };
  await wrapped({}, {});

  assert.equal(calls[0].option.souvenir.screenshot, true);
});

test('an explicit souvenir, even null, is left alone', async () => {
  const { calls, notify } = recorder();
  const wrapped = withSouvenir(notify, () => ({ souvenir: { screenshot: true } }));

  await wrapped({}, { souvenir: null });
  await wrapped({}, { souvenir: { screenshot: false } });

  assert.equal(calls[0].option.souvenir, null);
  assert.deepEqual(calls[1].option.souvenir, { screenshot: false });
});

test('missing options or option argument do not throw', async () => {
  const { calls, notify } = recorder();
  const wrapped = withSouvenir(notify, () => undefined);

  await wrapped({ appid: '1' });

  assert.deepEqual(calls[0].option, { souvenir: null });
});
