'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { test } = require('node:test');
const { pathToFileURL } = require('node:url');

const { portalScreenshot } = require(path.join(__dirname, '..', '..', 'app', 'electron', 'portalScreenshot.js'));

const APP_ID = 'io.github.shirowwww.achievement.watcher';

// A session bus whose Screenshot portal answers `code` (not yet, when undefined: `answer` sends it
// later; `hangs` leaves the call itself unanswered, as Plasma does while its question is open), and
// whose permission store holds `stored` (an Error when the table does not exist yet).
function fakeBus({ code, results = {}, stored = {}, hangs = false }) {
  const handlers = [];
  const asked = [];
  let requestPath = '';
  const bus = {
    name: ':1.42',
    closed: false,
    onSignal: (handler) => handlers.push(handler),
    close: () => {
      bus.closed = true;
    },
    call: async (message) => {
      asked.push(message.member);
      if (message.member === 'Screenshot') requestPath = `/org/freedesktop/portal/desktop/request/1_42/${message.body[1].handle_token[1]}`;
      if (message.member === 'Screenshot' && hangs) return new Promise(() => {});
      if (code === undefined) return { body: [] };
      if (message.member === 'Lookup') {
        if (stored instanceof Error) throw stored;
        return { body: [stored, ['b', false]] };
      }
      if (message.member === 'Screenshot') {
        const token = message.body[1].handle_token[1];
        const signal = { path: `/org/freedesktop/portal/desktop/request/1_42/${token}`, member: 'Response', body: [code, results] };
        setImmediate(() => handlers.forEach((handler) => handler(signal)));
      }
      return { body: [] };
    },
  };
  const answer = (lateCode, lateResults) => handlers.forEach((handler) => handler({ path: requestPath, member: 'Response', body: [lateCode, lateResults] }));
  return { connect: async () => bus, asked, bus, answer };
}

test('the portal hands back the file it wrote', async () => {
  const file = path.resolve('/home/you/Pictures/Screenshot.png');
  const { connect } = fakeBus({ code: 0, results: { uri: ['s', pathToFileURL(file).href] } });
  assert.equal(await portalScreenshot({ connect }), file);
});

test('screenshots refused in the permission store are reported as refused, for AW or for any host app', async () => {
  for (const id of ['', APP_ID]) {
    const { connect } = fakeBus({ code: 2, stored: { [id]: ['no'] } });
    await assert.rejects(portalScreenshot({ connect }), (err) => err.refused === true && /refused/.test(err.message));
  }
});

test('a prompt the user dismissed is refused without looking at the permission store', async () => {
  const { connect, asked } = fakeBus({ code: 1 });
  await assert.rejects(portalScreenshot({ connect }), (err) => err.refused === true && /cancelled/.test(err.message));
  assert.equal(asked.includes('Lookup'), false);
});

test('a question the user answers after the shot was given up leaves no file behind', async () => {
  const { connect, bus, answer } = fakeBus({ code: undefined });
  const removed = [];
  await assert.rejects(portalScreenshot({ connect, timeoutMs: 20, remove: (file) => removed.push(file) }), (err) => err.unanswered === true && !err.refused);
  assert.equal(bus.closed, false, 'the connection waits for the late answer');

  const late = path.resolve('/home/you/Pictures/Screenshot.png');
  answer(0, { uri: ['s', pathToFileURL(late).href] });
  assert.deepEqual(removed, [late]);
  assert.equal(bus.closed, true);
});

test('while the question is open, later shots do not queue another question', async () => {
  const first = fakeBus({ code: undefined });
  await assert.rejects(portalScreenshot({ connect: first.connect, timeoutMs: 10, remove: () => {} }), (err) => err.unanswered === true);
  let connected = 0;
  const again = () => portalScreenshot({ connect: async () => (connected++, first.bus) });
  await assert.rejects(again(), (err) => err.unanswered === true);
  assert.equal(connected, 0);

  first.answer(2, {});
  const file = path.resolve('/home/you/Pictures/Screenshot.png');
  const next = fakeBus({ code: 0, results: { uri: ['s', pathToFileURL(file).href] } });
  assert.equal(await portalScreenshot({ connect: next.connect }), file, 'once answered, shots go through again');
});

test('a portal that never replies to the call is given up after the same wait', async () => {
  const { connect, bus, answer } = fakeBus({ code: undefined, hangs: true });
  await assert.rejects(portalScreenshot({ connect, timeoutMs: 10, remove: () => {} }), (err) => err.unanswered === true);
  answer(2, {});
  assert.equal(bus.closed, true);
});

test('a shot asked while another waits on the question does not send a second request', async () => {
  const first = fakeBus({ code: undefined });
  let connected = 0;
  const shots = [
    portalScreenshot({ connect: first.connect, timeoutMs: 20, remove: () => {} }),
    portalScreenshot({ connect: async () => (connected++, first.bus) }),
  ];
  for (const shot of shots) await assert.rejects(shot, (err) => err.unanswered === true);
  assert.equal(connected, 0);
  first.answer(2, {});
});

test('a question never answered closes the connection after a while', async () => {
  const { connect, bus } = fakeBus({ code: undefined });
  await assert.rejects(portalScreenshot({ connect, timeoutMs: 10, lateMs: 30 }), (err) => err.unanswered === true);
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.equal(bus.closed, true);
});

test('a portal that fails without a refusal on record is a failure, which the caller may work around', async () => {
  const notFound = new Error('org.freedesktop.portal.Error.NotFound: No entry for screenshot');
  for (const stored of [{}, { '': ['yes'] }, { 'org.other.App': ['no'] }, notFound]) {
    const { connect } = fakeBus({ code: 2, stored });
    await assert.rejects(portalScreenshot({ connect }), (err) => !err.refused && /failed/.test(err.message));
  }
});
