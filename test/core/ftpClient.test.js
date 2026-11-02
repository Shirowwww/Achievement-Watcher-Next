'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');
const { FtpClient, FtpError, isLocalAddress, resolveLocalHost, parsePort } = require('../../app/util/ftpClient.js');
const { startFakeFtp, HANG } = require('../helpers/fakeFtpServer.js');

async function withServer(options, run, clientOptions = {}) {
  const server = await startFakeFtp(options);
  const client = new FtpClient({ host: '127.0.0.1', port: server.port, timeoutMs: 1500, ...clientOptions });
  try {
    await client.connect();
    await run(client, server);
  } finally {
    await client.close();
    await server.close();
  }
}

const rejectsWith = (promise, code) => assert.rejects(promise, (err) => err instanceof FtpError && err.code === code);

test('list returns the names of a directory, whether the server sends paths or not', async () => {
  const dirs = { '/dev_hdd0/home': ['00000001', '00000002'] };
  await withServer({ dirs }, async (client) => {
    assert.deepEqual(await client.list('/dev_hdd0/home'), ['00000001', '00000002']);
  });
});

test('list falls back to LIST when the server has no NLST', async () => {
  await withServer({ nlst: false, dirs: { '/t': ['NPWR00001_00', 'NPWR00002_00'] } }, async (client) => {
    assert.deepEqual(await client.list('/t'), ['NPWR00001_00', 'NPWR00002_00']);
  });
});

test('retrieve returns the bytes of a file', async () => {
  const body = Buffer.from([0x81, 0x8f, 0x54, 0xad, 0, 1, 2, 3]);
  await withServer({ files: { '/a/TROPUSR.DAT': body } }, async (client) => {
    assert.deepEqual(await client.retrieve('/a/TROPUSR.DAT'), body);
  });
});

test('a missing file is a 550 error and the session stays usable', async () => {
  await withServer({ files: { '/ok': Buffer.from('x') } }, async (client) => {
    await rejectsWith(client.retrieve('/nope'), 'ftp-550');
    assert.equal(client.usable, true);
    assert.equal((await client.retrieve('/ok')).toString(), 'x');
  });
});

test('a file past the size cap is refused and the session is dropped', async () => {
  await withServer({ files: { '/big': Buffer.alloc(5000, 1) } }, async (client) => {
    await rejectsWith(client.retrieve('/big', 1000), 'ftp-too-large');
    assert.equal(client.usable, false);
  });
});

test('a transfer that goes quiet times out', async () => {
  await withServer(
    { files: { '/slow': HANG } },
    async (client) => {
      await rejectsWith(client.retrieve('/slow'), 'ftp-timeout');
      assert.equal(client.usable, false);
    },
    { timeoutMs: 250 }
  );
});

test('the address announced by PASV is ignored: the client keeps to the host it was given', async () => {
  // The fake server announces 10.255.255.1, which nothing answers; trusting it would hang or fail.
  await withServer({ pasvIp: '10.255.255.1', files: { '/f': Buffer.from('data') } }, async (client, server) => {
    assert.equal((await client.retrieve('/f')).toString(), 'data');
    assert.ok(server.log.some((line) => line === 'PASV'));
  });
});

test('EPSV is used when the server refuses PASV', async () => {
  await withServer({ epsvOnly: true, files: { '/f': Buffer.from('data') } }, async (client, server) => {
    assert.equal((await client.retrieve('/f')).toString(), 'data');
    assert.ok(server.log.includes('EPSV'));
  });
});

test('a path with a line break never reaches the wire', async () => {
  await withServer({}, async (client, server) => {
    await rejectsWith(client.retrieve('/a\r\nDELE /b'), 'ftp-bad-argument');
    assert.ok(!server.log.some((line) => line.startsWith('DELE')));
  });
});

test('connecting to a closed port is a connect error', async () => {
  const probe = net.createServer();
  await new Promise((resolve) => probe.listen(0, '127.0.0.1', resolve));
  const { port } = probe.address();
  await new Promise((resolve) => probe.close(resolve));
  await rejectsWith(new FtpClient({ host: '127.0.0.1', port, timeoutMs: 500 }).connect(), 'ftp-connect-failed');
});

test('only home-network addresses count as local', () => {
  for (const ip of ['10.0.0.5', '172.16.0.1', '172.31.255.1', '192.168.1.50', '169.254.3.4', '127.0.0.1', '::1', 'fd12:3456::1', 'fe80::1', '::ffff:192.168.1.5']) {
    assert.equal(isLocalAddress(ip), true, ip);
  }
  for (const ip of ['8.8.8.8', '172.32.0.1', '172.15.0.1', '192.169.0.1', '2001:4860:4860::8888', '::ffff:8.8.8.8', 'not an ip']) {
    assert.equal(isLocalAddress(ip), false, ip);
  }
});

test('resolveLocalHost refuses public addresses, bad hosts and hostnames that resolve outside the LAN', async () => {
  assert.equal(await resolveLocalHost('192.168.1.50'), '192.168.1.50');
  assert.equal(await resolveLocalHost('[::1]'), '::1');
  await rejectsWith(resolveLocalHost('8.8.8.8'), 'ftp-host-not-local');
  await rejectsWith(resolveLocalHost(''), 'ftp-host-invalid');
  await rejectsWith(resolveLocalHost('bad host!'), 'ftp-host-invalid');
  await rejectsWith(resolveLocalHost('a'.repeat(300)), 'ftp-host-invalid');
  const lookup = async (name) => (name === 'ps4.lan' ? [{ address: '192.168.1.60' }] : [{ address: '192.168.1.60' }, { address: '93.184.216.34' }]);
  assert.equal(await resolveLocalHost('ps4.lan', { lookup }), '192.168.1.60');
  await rejectsWith(resolveLocalHost('mixed.example', { lookup }), 'ftp-host-not-local');
  assert.equal(await resolveLocalHost('8.8.8.8', { allowPublic: true }), '8.8.8.8');
});

test('parsePort takes 1 to 65535, an empty value takes the default', () => {
  assert.equal(parsePort('', 21), 21);
  assert.equal(parsePort(undefined, 2121), 2121);
  assert.equal(parsePort('2121', 21), 2121);
  assert.equal(parsePort(65535, 21), 65535);
  for (const bad of ['0', '65536', '-1', '21.5', '2e3', 'abc', '21 ', 1.5]) {
    assert.throws(() => parsePort(bad, 21), (err) => err.code === 'ftp-port-invalid', String(bad));
  }
});
