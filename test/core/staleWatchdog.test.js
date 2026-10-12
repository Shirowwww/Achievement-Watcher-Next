'use strict';

/*
  netstat at every start is what Hybrid Analysis scored as mapping network connections. It must
  only run once a Watchdog already answers, and only a listener running our own executable is killed.
*/

const assert = require('node:assert/strict');
const net = require('node:net');
const test = require('node:test');

const { sweepStaleWatchdog, listenerPids, imageName, answers, WATCHDOG_PIPE } = require('../../app/util/staleWatchdog.js');

const NETSTAT = [
  '',
  'Active Connections',
  '',
  '  Proto  Local Address          Foreign Address        State           PID',
  '  TCP    0.0.0.0:135            0.0.0.0:0              LISTENING       1100',
  '  TCP    127.0.0.1:8082         0.0.0.0:0              LISTENING       4242',
  '  TCP    127.0.0.1:50000        127.0.0.1:8082         ESTABLISHED     5151',
  '  TCP    127.0.0.1:18082        0.0.0.0:0              LISTENING       6161',
  '',
].join('\r\n');

function recorder(outputs) {
  const calls = [];
  const run = async (file, args) => {
    calls.push([file, ...args].join(' '));
    const output = outputs[file];
    if (output instanceof Error) throw output;
    return typeof output === 'function' ? output(args) : output || '';
  };
  return { calls, run };
}

test('runs nothing when no Watchdog answers on the pipe or the port', async () => {
  const { calls, run } = recorder({});
  const result = await sweepStaleWatchdog({ exeName: 'Achievement Watcher.exe', probe: async () => false, run });

  assert.deepEqual(result, { checked: false, killed: [] });
  assert.deepEqual(calls, []);
});

test('kills a listener on 8082 that runs this executable', async () => {
  const { calls, run } = recorder({
    'netstat.exe': NETSTAT,
    'tasklist.exe': '"Achievement Watcher.exe","4242","Console","1","80,000 K"\r\n',
  });
  const probed = [];
  const result = await sweepStaleWatchdog({
    exeName: 'Achievement Watcher.exe',
    probe: async (target) => {
      probed.push(target);
      return target === WATCHDOG_PIPE;
    },
    run,
  });

  assert.equal(probed.length, 2);
  assert.deepEqual(result, { checked: true, killed: ['4242'] });
  assert.deepEqual(calls, ['netstat.exe -ano -p tcp', 'tasklist.exe /FI PID eq 4242 /FO CSV /NH', 'taskkill.exe /F /PID 4242']);
});

test('leaves another application holding 8082 running', async () => {
  const { calls, run } = recorder({
    'netstat.exe': NETSTAT,
    'tasklist.exe': '"obs64.exe","4242","Console","1","300,000 K"\r\n',
  });
  const logged = [];
  const result = await sweepStaleWatchdog({ exeName: 'Achievement Watcher.exe', probe: async () => true, run, log: (m) => logged.push(m) });

  assert.deepEqual(result.killed, []);
  assert.ok(!calls.some((call) => call.startsWith('taskkill')));
  assert.match(logged[0], /obs64\.exe/);
});

test('never kills its own process', async () => {
  const { calls, run } = recorder({ 'netstat.exe': NETSTAT, 'tasklist.exe': '"Achievement Watcher.exe","4242"' });
  await sweepStaleWatchdog({ exeName: 'Achievement Watcher.exe', selfPid: 4242, probe: async () => true, run });

  assert.deepEqual(calls, ['netstat.exe -ano -p tcp']);
});

test('reads only listening sockets bound to the port itself', () => {
  assert.deepEqual(listenerPids(NETSTAT, 8082), ['4242']);
  assert.deepEqual(listenerPids('', 8082), []);
});

test('reads the image name out of a tasklist line', () => {
  assert.equal(imageName('"Achievement Watcher.exe","4242","Console"'), 'Achievement Watcher.exe');
  assert.equal(imageName('INFO: No tasks are running which match the specified criteria.'), '');
});

test('a probe answers true for a live listener and false for a closed port', async () => {
  const server = net.createServer((socket) => socket.destroy());
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    assert.equal(await answers({ host: '127.0.0.1', port }), true);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
  assert.equal(await answers({ host: '127.0.0.1', port }), false);
});
